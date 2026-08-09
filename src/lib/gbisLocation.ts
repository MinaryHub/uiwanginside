import { timedFetch, parseDataGoKr, retryTransient } from "./fetcher";
import { fetchStationIndex } from "./busStations";
import type { BusPosition } from "./types";

/**
 * 경기버스(GBIS) 실시간 위치.
 *
 * TAGO 와의 차이
 * - GBIS 는 GPS 좌표를 주지 않는다. stationId 와 정류소 순번만 준다.
 *   지도에 찍으려면 정류소 좌표 색인으로 변환해야 한다.
 * - 대신 혼잡도·저상·남은좌석을 함께 주고, TAGO 에 없는 서울 소속 노선
 *   (441번 등 의왕을 지나는 노선)까지 다룬다.
 *
 * 그래서 GBIS 를 먼저 쓰고, 좌표를 못 구한 경우에만 TAGO 로 보완한다.
 */

const GBIS_LOCATION =
  "https://apis.data.go.kr/6410000/buslocationservice/v2/getBusLocationListv2";

interface RawLoc {
  plateNo?: string;
  stationId?: number | string;
  stationSeq?: number | string;
  crowded?: number | string;
  lowPlate?: number | string;
  remainSeatCnt?: number | string;
  stateCd?: number | string;
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

export interface GbisLocationResult {
  positions: BusPosition[];
  /** 운행 중이지만 좌표를 못 구한 대수 (수도권 밖 구간) */
  unresolved: number;
}

export async function fetchGbisPositions(
  serviceKey: string,
  ggKey: string,
  routeId: string,
): Promise<GbisLocationResult> {
  const url = `${GBIS_LOCATION}?serviceKey=${serviceKey}&routeId=${routeId}&format=json`;

  const [json, stationIndex] = await Promise.all([
    retryTransient(async () => {
      const res = await timedFetch(url, {}, 12_000);
      return parseDataGoKr(await res.text()) as {
        response?: { msgHeader?: { resultCode?: number }; msgBody?: { busLocationList?: unknown } };
      };
    }, "gbis:positions"),
    fetchStationIndex(ggKey),
  ]);

  const code = json?.response?.msgHeader?.resultCode;
  // 0 정상, 4 데이터 없음(운행 종료 등)
  if (code != null && Number(code) !== 0 && Number(code) !== 4) {
    throw new Error(`GBIS resultCode ${code}`);
  }

  const positions: BusPosition[] = [];
  let unresolved = 0;

  for (const b of asArray<RawLoc>(json?.response?.msgBody?.busLocationList)) {
    const st = stationIndex.get(String(b.stationId ?? ""));
    if (!st) {
      // 의왕 인접 시 밖(서울 구간 등) — 좌표를 모르니 지도에 찍지 않는다
      unresolved++;
      continue;
    }
    const seats = num(b.remainSeatCnt);
    const crowd = num(b.crowded);
    positions.push({
      vehicleNo: String(b.plateNo ?? ""),
      nodeName: st.name,
      nodeOrder: num(b.stationSeq),
      lat: st.lat,
      lng: st.lng,
      crowded: crowd === null || crowd <= 0 ? null : crowd,
      remainSeats: seats === null || seats < 0 ? null : seats,
      lowPlate: Number(b.lowPlate) === 1,
    });
  }

  positions.sort((a, b) => (a.nodeOrder ?? 0) - (b.nodeOrder ?? 0));
  return { positions, unresolved };
}
