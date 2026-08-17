import { timedFetch, ok, fail, nowISO } from "@/lib/fetcher";
import { UIWANG } from "@/lib/uiwang";
import { cityTiles, spaceMeanSpeed } from "@/lib/traffic";
import { UIWANG_ROAD_NAMES } from "@/lib/uiwang-roads";
import { getSql, ensureSchema, hasDb } from "@/lib/db";
import type {
  TrafficPayload,
  Incident,
  IncidentKind,
  TrafficLink,
  RoadSpeed,
} from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * 갱신 주기.
 *
 * 한 번 부를 때 ITS 를 칸 수만큼 + 1 번 두드린다. 90초로 두면 한 시간에
 * 440번이고, ITS 가 Vercel 에서 통째로 막히는 일이 반복됐다. 소통정보
 * 자체가 3분 안팎으로 갱신되므로(createdDate 관찰) 5분으로 늘려도
 * 잃는 것이 없다. 격자 축소와 합쳐 호출이 5분의 1 로 준다.
 */
const CACHE_SEC = 300;

/**
 * 마지막으로 성공한 응답을 DB 에 둔다.
 *
 * ITS 는 이따금 연결 자체가 되지 않는다 (UND_ERR_CONNECT_TIMEOUT, 10.5초).
 * 처음에는 인스턴스 메모리에 들고 있었는데, 서버리스라 인스턴스가 갈릴
 * 때마다 빈손으로 시작해 도로 색이 통째로 사라졌다. 실제로 그렇게 됐다.
 *
 * 겸해서 이 값이 캐시 노릇도 한다. 90초 안에 받아둔 것이 있으면 ITS 를
 * 아예 부르지 않으므로, 인스턴스가 몇 개든 ITS 는 90초에 한 번만 열린다.
 *
 * 15분이 넘은 것은 더 이상 '지금 소통상태' 가 아니므로 내보내지 않는다 —
 * 낡은 값을 현재인 척 보여주느니 없다고 하는 편이 낫다.
 */
const FRESH_MS = CACHE_SEC * 1000;
/*
 * 한 번 실패해도 화면이 비지 않을 만큼은 버틴다. 갱신 주기가 5분이니
 * 25분이면 네 번 연속 실패까지 견딘다. 그보다 오래된 것은 더 이상
 * '지금 소통상태' 가 아니다.
 */
const STALE_MAX_MS = 25 * 60_000;
/** 막힌 것을 확인한 뒤 다시 두드리기까지 */
const RETRY_MS = 2 * 60_000;

interface Snapshot {
  payload: TrafficPayload | null;
  age: number;
  failedAgo: number;
}

async function readSnapshot(): Promise<Snapshot | null> {
  if (!hasDb()) return null;
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT payload, at, failed_at FROM traffic_snapshot WHERE id = 'latest'
    `) as { payload: TrafficPayload | null; at: string | null; failed_at: string | null }[];
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      payload: r.payload,
      age: r.at ? Date.now() - new Date(r.at).getTime() : Infinity,
      failedAgo: r.failed_at ? Date.now() - new Date(r.failed_at).getTime() : Infinity,
    };
  } catch (e) {
    console.error("[traffic:read]", e);
    return null;
  }
}

async function writeSnapshot(payload: TrafficPayload | null, failed: boolean) {
  if (!hasDb()) return;
  try {
    await ensureSchema();
    const sql = getSql();
    if (failed) {
      await sql`
        INSERT INTO traffic_snapshot (id, failed_at) VALUES ('latest', now())
        ON CONFLICT (id) DO UPDATE SET failed_at = now()
      `;
    } else {
      await sql`
        INSERT INTO traffic_snapshot (id, payload, at, failed_at)
        VALUES ('latest', ${JSON.stringify(payload)}::jsonb, now(), NULL)
        ON CONFLICT (id) DO UPDATE
          SET payload = EXCLUDED.payload, at = now(), failed_at = NULL
      `;
    }
  } catch (e) {
    console.error("[traffic:write]", e);
  }
}

/** ITS 국가교통정보센터 오픈API */
const ITS = "https://openapi.its.go.kr:9443";

/**
 * 조회 범위.
 * bbox 는 실제로 적용된다(시청 주변 좁은 범위 134건 vs 의왕 전체 4,569건).
 * 다만 사각형이라 인접 시 도로가 섞여 들어온다.
 */
const { minX, maxX, minY, maxY } = UIWANG.bbox;
const BBOX = `minX=${minX}&maxX=${maxX}&minY=${minY}&maxY=${maxY}`;

function classify(eventType: string, detail: string): IncidentKind {
  const t = `${eventType} ${detail}`;
  if (/사고|추돌|충돌/.test(t)) return "accident";
  if (/공사|작업/.test(t)) return "construction";
  if (/통제|폐쇄|차단/.test(t)) return "closure";
  if (/기상|결빙|안개|폭설|호우/.test(t)) return "weather";
  return "etc";
}

type Samples = { speed: number; travelTime: number }[];

function speedLevel(speed: number): TrafficLink["level"] {
  if (speed >= 40) return "smooth";
  if (speed >= 20) return "slow";
  return "congested";
}

/**
 * ITS 는 시각을 "20260810051535" (YYYYMMDDHHmmss, KST) 로 준다.
 * 그대로 new Date() 에 넣으면 Invalid Date 가 되어 "몇 분 전" 이 빈칸이 된다.
 */
function parseItsDate(raw?: string): string {
  if (!raw || raw.length < 14) return nowISO();
  const iso =
    `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` +
    `T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}+09:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? nowISO() : d.toISOString();
}

interface ItsEvent {
  eventType?: string;
  eventDetailType?: string;
  startDate?: string;
  message?: string;
  coordX?: string | number;
  coordY?: string | number;
  roadName?: string;
  roadNo?: string;
  linkId?: string;
  lanesBlocked?: string | number;
}

interface ItsTraffic {
  linkId?: string;
  roadName?: string;
  speed?: string | number;
  travelTime?: string | number;
}

const EMPTY: TrafficPayload = {
  incidents: [],
  links: [],
  speeds: [],
  source: "its",
  updatedAt: "",
};

/**
 * 칸마다 따로 소통정보를 받는다.
 *
 * 한 번에 의왕 전체를 부르면 4,571구간이 오는데, 어느 구간이 어디인지
 * 알 방법이 없다. ITS 는 좁은 범위를 정확히 지켜 주므로 (시청 주변
 * 1.5km → 154구간), 어느 칸에서 왔는지가 곧 대략의 위치가 된다.
 */
async function fetchTiles(key: string): Promise<{ tile: number; rows: ItsTraffic[] }[]> {
  const tiles = cityTiles();
  return Promise.all(
    tiles.map(async (t) => {
      const url =
        `${ITS}/trafficInfo?apiKey=${key}&type=all` +
        `&minX=${t.minX}&maxX=${t.maxX}&minY=${t.minY}&maxY=${t.maxY}&getType=json`;
      try {
        const res = await timedFetch(url, {}, 15_000);
        if (!res.ok) return { tile: t.idx, rows: [] };
        const j = await res.json();
        return { tile: t.idx, rows: (j?.body?.items ?? []) as ItsTraffic[] };
      } catch {
        // 한 칸이 실패해도 나머지는 그린다
        return { tile: t.idx, rows: [] };
      }
    }),
  );
}

export async function GET() {
  const key = process.env.ITS_API_KEY;
  if (!key) return fail(EMPTY, "ITS 인증키가 설정되지 않았습니다.");

  const snap = await readSnapshot();

  // 90초 안에 받아둔 것이 있으면 ITS 를 부를 이유가 없다
  if (snap?.payload && snap.age < FRESH_MS) {
    return ok(snap.payload, undefined, CACHE_SEC);
  }
  // 막힌 것을 방금 확인했다면 또 11초를 기다리지 않는다
  if (snap && snap.failedAgo < RETRY_MS) {
    return staleOr("ITS 에 연결되지 않습니다.", snap);
  }

  try {
    const [evRes, tiled] = await Promise.all([
      timedFetch(
        `${ITS}/eventInfo?apiKey=${key}&type=all&eventType=all&${BBOX}&getType=json`,
        {},
        12_000,
      ),
      fetchTiles(key),
    ]);

    const incidents: Incident[] = [];
    if (evRes.ok) {
      const j = await evRes.json();
      const rows: ItsEvent[] = j?.body?.items ?? [];
      for (const [i, r] of rows.entries()) {
        const eventType = r.eventType ?? "";
        const detail = r.eventDetailType ?? "";
        const lanes = Number(r.lanesBlocked);
        incidents.push({
          id: `${r.linkId ?? "ev"}-${i}`,
          kind: classify(eventType, detail),
          // 상세 유형이 더 구체적이다 (공사 → 작업, 기타돌발 → 고장)
          type: detail || eventType || "돌발상황",
          message:
            (r.message ?? detail ?? "") +
            (Number.isFinite(lanes) && lanes > 0 ? ` · ${lanes}개 차로 차단` : ""),
          road: r.roadName || r.roadNo || "",
          lat: r.coordY != null ? Number(r.coordY) : null,
          lng: r.coordX != null ? Number(r.coordX) : null,
          startedAt: parseItsDate(r.startDate),
        });
      }
    }

    /**
     * (칸 × 도로) 마다 공간평균속도를 낸다.
     * 이 조합이 지도에 그릴 최소 단위다. 도로 하나를 한 색으로 칠하지
     * 않는 이유는, 같은 시내에서도 경수대로가 6~74km/h 로 갈리기 때문이다.
     */
    const bucket = new Map<string, { road: string; tile: number; s: Samples }>();
    for (const { tile, rows } of tiled) {
      for (const r of rows) {
        const name = (r.roadName ?? "").trim();
        const speed = Number(r.speed);
        const travelTime = Number(r.travelTime);
        // 이름 없는 구간("-")은 어느 도로인지 알 수 없어 그릴 수 없다
        if (!name || name === "-") continue;
        // 칸은 사각형이라 수원·군포 이면도로가 딸려 온다. 의왕에 있는 길만 남긴다.
        if (!UIWANG_ROAD_NAMES.has(name)) continue;
        if (!Number.isFinite(speed) || speed <= 0) continue;
        if (!Number.isFinite(travelTime) || travelTime <= 0) continue;
        const k = `${name}|${tile}`;
        const cur = bucket.get(k) ?? { road: name, tile, s: [] };
        cur.s.push({ speed, travelTime });
        bucket.set(k, cur);
      }
    }

    const speeds: RoadSpeed[] = [...bucket.values()].map((b) => ({
      road: b.road,
      tile: b.tile,
      speed: Math.round(spaceMeanSpeed(b.s) * 10) / 10,
      links: b.s.length,
    }));

    // 목록에는 도로별로 가장 느린 칸을 올린다 — 어디가 막히는지가 관심사다
    const worstByRoad = new Map<string, TrafficLink>();
    for (const s of speeds) {
      const cur = worstByRoad.get(s.road);
      if (cur && cur.speed <= s.speed) continue;
      worstByRoad.set(s.road, {
        id: `${s.road}-${s.tile}`,
        name: s.road,
        speed: s.speed,
        level: speedLevel(s.speed),
        lat: null,
        lng: null,
      });
    }
    const roadLinks = [...worstByRoad.values()].sort((a, b) => a.speed - b.speed);


    const payload: TrafficPayload = {
      incidents,
      links: roadLinks.slice(0, 12),
      speeds,
      source: "its",
      updatedAt: nowISO(),
    };
    // 한 칸도 못 받았으면 성공이 아니다 — 낡은 값이 있으면 그쪽이 낫다
    if (speeds.length === 0 && incidents.length === 0) {
      void writeSnapshot(null, true);
      return staleOr("ITS 에서 소통정보를 받지 못했습니다.", snap);
    }
    void writeSnapshot(payload, false);
    return ok(
      payload,
      // 소통정보는 왔는데 돌발만 없는 것은 정상이다. 그렇다고 말해준다.
      incidents.length === 0 ? "현재 의왕시 범위에 보고된 돌발상황이 없습니다." : undefined,
      CACHE_SEC,
    );
  } catch (e) {
    console.error("[traffic]", e);
    void writeSnapshot(null, true);
    return staleOr(`ITS API 호출 실패: ${e instanceof Error ? e.message : e}`, snap);
  }
}

/**
 * 실패했을 때. 낡았더라도 15분 안쪽이면 그것을 내보낸다.
 * 몇 분 전 값인지 함께 알려, 지금인 척하지는 않는다.
 */
function staleOr(reason: string, snap: Snapshot | null) {
  if (snap?.payload && snap.age < STALE_MAX_MS) {
    const min = Math.max(1, Math.round(snap.age / 60_000));
    return ok(snap.payload, `${reason} — ${min}분 전 값을 보여주고 있습니다.`, 30);
  }
  return fail(EMPTY, reason);
}
