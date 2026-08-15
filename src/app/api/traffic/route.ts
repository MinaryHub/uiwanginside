import { timedFetch, ok, fail, nowISO } from "@/lib/fetcher";
import { UIWANG } from "@/lib/uiwang";
import { cityTiles, spaceMeanSpeed } from "@/lib/traffic";
import { uiwangRoadNames } from "@/lib/roads";
import type {
  TrafficPayload,
  Incident,
  IncidentKind,
  TrafficLink,
  RoadSpeed,
} from "@/lib/types";

export const dynamic = "force-dynamic";

/** 돌발상황은 자주 바뀐다 */
const CACHE_SEC = 45;

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

  try {
    const [evRes, tiled, inCity] = await Promise.all([
      timedFetch(
        `${ITS}/eventInfo?apiKey=${key}&type=all&eventType=all&${BBOX}&getType=json`,
        {},
        12_000,
      ),
      fetchTiles(key),
      uiwangRoadNames(),
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
        if (inCity.size > 0 && !inCity.has(name)) continue;
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

    if (incidents.length === 0 && roadLinks.length === 0) {
      return ok(
        {
          incidents,
          links: roadLinks,
          speeds,
          source: "its",
          updatedAt: nowISO(),
        } satisfies TrafficPayload,
        "현재 의왕시 범위에 보고된 돌발상황이 없습니다.",
        CACHE_SEC,
      );
    }

    return ok(
      {
        incidents,
        links: roadLinks.slice(0, 12),
        speeds,
        source: "its",
        updatedAt: nowISO(),
      } satisfies TrafficPayload,
      undefined,
      CACHE_SEC,
    );
  } catch (e) {
    console.error("[traffic]", e);
    return fail(EMPTY, `ITS API 호출 실패: ${e instanceof Error ? e.message : e}`);
  }
}
