import type { BusPosition } from "./types";
import {
  timedFetch,
  createTtlCache,
  parseDataGoKr,
  retryTransient,
} from "./fetcher";

/**
 * TAGO(국가대중교통정보센터) 버스 위치정보.
 * 문서: 공공데이터 오픈API 활용가이드 — BusLcInfoInqireService v1.0
 *
 * 확인한 사실
 * - 경기 노선의 TAGO 노선ID = "GGB" + GBIS 노선ID.
 *   도착정보에서 이미 받는 routeId 를 그대로 쓸 수 있어 별도 매칭이 필요 없다.
 * - cityCode 는 노선의 소속 도시와 맞아야 한다. 의왕 코드로 안양 노선을
 *   조회하면 오류 없이 "운행 0대" 가 나와 조용히 틀린다.
 * - 노선ID 앞 3자리로는 도시를 추정할 수 없다. 208 은 안양·군포에,
 *   234 는 군포·수원·성남에 걸쳐 있다. 그래서 색인을 만들어 정확히 찾는다.
 * - TAGO 도시 목록에 서울이 없다. 서울 노선(100100xxx)은 위치 조회가 안 된다.
 */

const TAGO = "https://apis.data.go.kr/1613000";

/** 의왕과 의왕을 지나는 버스의 소속 도시들 */
const CITIES: Record<number, string> = {
  31170: "의왕시",
  31040: "안양시",
  31160: "군포시",
  31010: "수원시",
  31110: "과천시",
  31020: "성남시",
};

interface RawRoute {
  routeid?: string;
  routeno?: string | number;
}

interface RawPos {
  vehicleno?: string;
  nodenm?: string;
  nodeord?: number | string;
  gpslati?: number | string;
  gpslong?: number | string;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asArray<T>(v: unknown): T[] {
  if (v == null) return [];
  return (Array.isArray(v) ? v : [v]) as T[];
}

/** GBIS 노선ID → TAGO 도시코드. 노선은 거의 바뀌지 않아 하루 캐시한다. */
const indexCache = createTtlCache<Map<string, number>>(24 * 3600_000, 2);

async function buildRouteCityIndex(key: string): Promise<Map<string, number>> {
  const hit = indexCache.get("idx");
  if (hit) return hit;

  const index = new Map<string, number>();
  // TAGO 는 초당 30건 제한이 있다. 하루 한 번 만드는 색인이라
  // 병렬로 몰아쳐 세션 오류를 낼 이유가 없다.
  for (const code of Object.keys(CITIES)) {
    try {
      const url =
        `${TAGO}/BusRouteInfoInqireService/getRouteNoList` +
        `?serviceKey=${key}&cityCode=${code}&_type=json&numOfRows=500&pageNo=1`;
      const json = await retryTransient(async () => {
        const res = await timedFetch(url, {}, 12_000);
        return parseDataGoKr(await res.text()) as {
          response?: { body?: { items?: { item?: unknown } } };
        };
      }, `tago:index:${code}`);
      for (const r of asArray<RawRoute>(json?.response?.body?.items?.item)) {
        const id = String(r.routeid ?? "");
        // GGB226000032 → 226000032 (GBIS 노선ID)
        if (id.startsWith("GGB")) index.set(id.slice(3), Number(code));
      }
    } catch (e) {
      // 한 도시가 실패해도 나머지 색인은 쓸 수 있다
      console.error("[tago:index]", code, e);
    }
  }

  if (index.size === 0) throw new Error("노선 색인을 만들지 못했습니다");
  indexCache.set("idx", index);
  return index;
}

export interface BusPositionResult {
  positions: BusPosition[];
  /** 조회에 쓴 도시 */
  cityName: string;
}

/**
 * GBIS 노선ID 로 현재 운행 중인 버스 위치를 조회한다.
 * 색인에 없으면(서울 노선 등) null 을 돌려 호출부가 안내하게 한다.
 */
export async function fetchBusPositions(
  key: string,
  gbisRouteId: string,
): Promise<BusPositionResult | null> {
  const index = await buildRouteCityIndex(key);
  const cityCode = index.get(gbisRouteId);
  if (!cityCode) return null;

  const url =
    `${TAGO}/BusLcInfoInqireService/getRouteAcctoBusLcList` +
    `?serviceKey=${key}&cityCode=${cityCode}&routeId=GGB${gbisRouteId}` +
    `&_type=json&numOfRows=100&pageNo=1`;
  const json = await retryTransient(async () => {
    const res = await timedFetch(url, {}, 12_000);
    return parseDataGoKr(await res.text()) as {
      response?: { body?: { items?: { item?: unknown } } };
    };
  }, "tago:positions");

  const positions: BusPosition[] = [];
  for (const p of asArray<RawPos>(json?.response?.body?.items?.item)) {
    const lat = num(p.gpslati);
    const lng = num(p.gpslong);
    if (lat === null || lng === null) continue;
    positions.push({
      vehicleNo: String(p.vehicleno ?? ""),
      nodeName: String(p.nodenm ?? ""),
      nodeOrder: num(p.nodeord),
      lat,
      lng,
    });
  }
  return { positions, cityName: CITIES[cityCode] ?? String(cityCode) };
}
