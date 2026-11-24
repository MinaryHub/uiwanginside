import { after } from "next/server";
import { timedFetch, ok, fail, nowISO, asArray, createInFlight } from "@/lib/fetcher";
import { UIWANG } from "@/lib/uiwang";
import { cityTiles, spaceMeanSpeed, roadLevel } from "@/lib/traffic";
import { UIWANG_ROADS, UIWANG_ROAD_NAMES } from "@/lib/uiwang-roads";
import { isInsideUiwang } from "@/lib/geo";
import { getSql, ensureSchema, hasDb } from "@/lib/db";
import type {
  TrafficPayload,
  Incident,
  IncidentKind,
  TrafficLink,
  RoadSpeed,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

const CACHE_SEC = 300;
const FRESH_MS = CACHE_SEC * 1000;
const STALE_MAX_MS = 25 * 60_000;
const RETRY_MS = 2 * 60_000;

/** 지도(buildSegments)와 목록(links)이 같은 도로 등급 기준을 쓰도록 고속도로 목록을 공유한다 */
const EXPRESSWAY_NAMES = new Set(
  UIWANG_ROADS.filter((r) => r.expressway).map((r) => r.name),
);

interface Snapshot {
  payload: TrafficPayload | null;
  age: number;
  failedAgo: number;
}

/** DB 미연결 환경·동일 인스턴스 동시 요청 방어용 L1 스냅샷 */
let memSnap: { payload: TrafficPayload | null; at: number; failedAt: number } = {
  payload: null,
  at: 0,
  failedAt: 0,
};

interface TrafficResult {
  ok: boolean;
  payload: TrafficPayload;
  notice?: string;
  cacheSec?: number;
}
const trafficInFlight = createInFlight<TrafficResult>();

function readMemSnapshot(): Snapshot | null {
  if (!memSnap.payload && !memSnap.failedAt) return null;
  return {
    payload: memSnap.payload,
    age: memSnap.at ? Date.now() - memSnap.at : Infinity,
    failedAgo: memSnap.failedAt ? Date.now() - memSnap.failedAt : Infinity,
  };
}

async function readSnapshot(): Promise<Snapshot | null> {
  const mem = readMemSnapshot();
  if (mem?.payload && mem.age < FRESH_MS) return mem;
  if (!hasDb()) return mem;
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT payload, at, failed_at FROM traffic_snapshot WHERE id = 'latest'
    `) as { payload: TrafficPayload | null; at: string | null; failed_at: string | null }[];
    if (rows.length === 0) return mem;
    const r = rows[0];
    const atMs = r.at ? new Date(r.at).getTime() : 0;
    const failedMs = r.failed_at ? new Date(r.failed_at).getTime() : 0;
    if (r.payload && atMs > memSnap.at) {
      memSnap = { payload: r.payload, at: atMs, failedAt: failedMs };
    } else if (failedMs > memSnap.failedAt) {
      memSnap.failedAt = failedMs;
    }
    return {
      payload: r.payload ?? mem?.payload ?? null,
      age: atMs ? Date.now() - atMs : mem?.age ?? Infinity,
      failedAgo: failedMs ? Date.now() - failedMs : mem?.failedAgo ?? Infinity,
    };
  } catch (e) {
    console.error("[traffic:read]", e);
    return mem;
  }
}

async function writeSnapshot(payload: TrafficPayload | null, failed: boolean) {
  if (failed) {
    memSnap.failedAt = Date.now();
  } else if (payload) {
    memSnap = { payload, at: Date.now(), failedAt: 0 };
  }
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

const ITS = "https://openapi.its.go.kr:9443";
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

function parseCoord(v?: string | number): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

type Samples = { speed: number; travelTime: number }[];

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

async function fetchTiles(key: string): Promise<{ tile: number; rows: ItsTraffic[] }[]> {
  const tiles = cityTiles();
  const encKey = encodeURIComponent(key);
  return Promise.all(
    tiles.map(async (t) => {
      const url =
        `${ITS}/trafficInfo?apiKey=${encKey}&type=all` +
        `&minX=${t.minX}&maxX=${t.maxX}&minY=${t.minY}&maxY=${t.maxY}&getType=json`;
      try {
        const res = await timedFetch(url, {}, 12_000);
        if (!res.ok) return { tile: t.idx, rows: [] };
        const j = await res.json();
        return { tile: t.idx, rows: asArray<ItsTraffic>(j?.body?.items) };
      } catch {
        return { tile: t.idx, rows: [] };
      }
    }),
  );
}

export async function GET() {
  const key = process.env.ITS_API_KEY;
  if (!key) return fail(EMPTY, "ITS 인증키가 설정되지 않았습니다.");

  const snap = await readSnapshot();

  if (snap?.payload && snap.age < FRESH_MS) {
    return ok(snap.payload, undefined, CACHE_SEC);
  }
  if (snap && snap.failedAgo < RETRY_MS) {
    return staleOr("ITS 에 연결되지 않습니다.", snap);
  }

  const res = await trafficInFlight("latest", async (): Promise<TrafficResult> => {
    const again = readMemSnapshot();
    if (again?.payload && again.age < FRESH_MS) {
      return { ok: true, payload: again.payload, cacheSec: CACHE_SEC };
    }
    if (again && again.failedAgo < RETRY_MS) {
      return staleResult("ITS 에 연결되지 않습니다.", again);
    }

    try {
      const [evResult, tiled] = await Promise.all([
        timedFetch(
          `${ITS}/eventInfo?apiKey=${encodeURIComponent(key)}&type=all&eventType=all&${BBOX}&getType=json`,
          {},
          12_000,
        )
          .then(async (r) => (r.ok ? ((await r.json()) as { body?: { items?: ItsEvent | ItsEvent[] } }) : null))
          .catch(() => null),
        fetchTiles(key),
      ]);

      const incidents: Incident[] = [];
      if (evResult) {
        const rows = asArray<ItsEvent>(evResult?.body?.items);
        for (const [i, r] of rows.entries()) {
          const eventType = r.eventType ?? "";
          const detail = r.eventDetailType ?? "";
          const lanes = Number(r.lanesBlocked);
          incidents.push({
            id: `${r.linkId ?? "ev"}-${i}`,
            kind: classify(eventType, detail),
            type: detail || eventType || "돌발상황",
            message:
              (r.message ?? detail ?? "") +
              (Number.isFinite(lanes) && lanes > 0 ? ` · ${lanes}개 차로 차단` : ""),
            road: r.roadName || r.roadNo || "",
            lat: parseCoord(r.coordY),
            lng: parseCoord(r.coordX),
            startedAt: parseItsDate(r.startDate),
          });
        }
      }

      const inCity = incidents.filter(
        (i) => i.lat == null || i.lng == null || isInsideUiwang(i.lat, i.lng),
      );

      const seenIncident = new Set<string>();
      const deduped = inCity.filter((i) => {
        const k =
          i.lat != null && i.lng != null
            ? `${i.type}|${i.lat.toFixed(5)}|${i.lng.toFixed(5)}`
            : `${i.type}|${i.road}|${i.message}`;
        if (seenIncident.has(k)) return false;
        seenIncident.add(k);
        return true;
      });

      const bucket = new Map<string, { road: string; tile: number; s: Samples }>();
      for (const { tile, rows } of tiled) {
        for (const r of rows) {
          const name = (r.roadName ?? "").trim();
          const speed = Number(r.speed);
          const travelTime = Number(r.travelTime);
          if (!name || name === "-") continue;
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

      const worstByRoad = new Map<string, TrafficLink>();
      for (const s of speeds) {
        const cur = worstByRoad.get(s.road);
        if (cur && cur.speed <= s.speed) continue;
        worstByRoad.set(s.road, {
          id: `${s.road}-${s.tile}`,
          name: s.road,
          speed: s.speed,
          level: roadLevel(s.speed, EXPRESSWAY_NAMES.has(s.road)),
          lat: null,
          lng: null,
        });
      }
      const roadLinks = [...worstByRoad.values()].sort((a, b) => a.speed - b.speed);

      const payload: TrafficPayload = {
        incidents: deduped,
        links: roadLinks.slice(0, 12),
        speeds,
        source: "its",
        updatedAt: nowISO(),
      };
      if (speeds.length === 0 && deduped.length === 0) {
        memSnap.failedAt = Date.now();
        after(() => writeSnapshot(null, true));
        return staleResult("ITS 에서 소통정보를 받지 못했습니다.", snap);
      }
      memSnap = { payload, at: Date.now(), failedAt: 0 };
      after(() => writeSnapshot(payload, false));
      const notice = !evResult
        ? "돌발상황 조회에 일시 실패해 소통정보만 표시합니다."
        : deduped.length === 0
          ? "현재 의왕시 범위에 보고된 돌발상황이 없습니다."
          : undefined;
      return { ok: true, payload, notice, cacheSec: CACHE_SEC };
    } catch (e) {
      console.error("[traffic]", e);
      memSnap.failedAt = Date.now();
      after(() => writeSnapshot(null, true));
      return staleResult(`ITS API 호출 실패: ${e instanceof Error ? e.message : e}`, snap);
    }
  });

  return res.ok
    ? ok(res.payload, res.notice, res.cacheSec ?? CACHE_SEC)
    : fail(res.payload, res.notice ?? "ITS 조회 실패");
}

function staleResult(reason: string, snap: Snapshot | null): TrafficResult {
  if (snap?.payload && snap.age < STALE_MAX_MS) {
    const min = Math.max(1, Math.round(snap.age / 60_000));
    return {
      ok: true,
      payload: snap.payload,
      notice: `${reason} — ${min}분 전 값을 보여주고 있습니다.`,
      cacheSec: 30,
    };
  }
  return { ok: false, payload: EMPTY, notice: reason };
}

function staleOr(reason: string, snap: Snapshot | null) {
  const r = staleResult(reason, snap);
  return r.ok ? ok(r.payload, r.notice, r.cacheSec ?? 30) : fail(r.payload, r.notice ?? reason);
}
