import { createInFlight, createTtlCache, timedFetch } from "./fetcher";
import type { SubwayArrival, SubwayPayload } from "./types";

/**
 * 의왕역 (수도권 전철 1호선 · 경부선) 실시간 열차 도착 정보.
 *
 * 서울 열린데이터광장 실시간 지하철 도착정보 API(`realtimeStationArrival`)를 사용한다.
 * - `SEOUL_SUBWAY_KEY` 가 있으면 전체 도착 열차(최대 16건)를 조회한다.
 * - 키가 비어 있으면 서울 열린데이터광장 공식 `sample` 엔드포인트(최대 5건)로
 *   실시간 조회를 시도한다.
 */
export const UIWANG_STATION = {
  name: "의왕역",
  query: "의왕",
  lineName: "1호선",
  lat: 37.32083,
  lng: 126.94825,
} as const;

const cache = createTtlCache<SubwayPayload>(25_000, 2);
const inFlight = createInFlight<SubwayPayload>();

interface RawArrival {
  subwayId?: string;
  updnLine?: string;
  trainLineNm?: string;
  arvlMsg2?: string;
  arvlMsg3?: string;
  barvlDt?: string;
  btrainSttus?: string;
  lstcarAt?: string;
  recptnDt?: string;
  ordkey?: string;
  btrainNo?: string;
}

interface SeoulSubwayResponse {
  errorMessage?: {
    status?: number;
    code?: string;
    message?: string;
  };
  status?: number;
  code?: string;
  message?: string;
  realtimeArrivalList?: RawArrival[];
}

export async function fetchUiwangSubway(rawKey?: string): Promise<SubwayPayload> {
  const key = rawKey?.trim() || "sample";
  const isSample = key === "sample";
  const cacheKey = isSample ? "sample" : "live";

  const hit = cache.get(cacheKey);
  if (hit) return hit;

  return inFlight(cacheKey, async () => {
    const endIdx = isSample ? 5 : 16;
    const url = `http://swopenAPI.seoul.go.kr/api/subway/${encodeURIComponent(key)}/json/realtimeStationArrival/0/${endIdx}/${encodeURIComponent(UIWANG_STATION.query)}`;
    const res = await timedFetch(url, {}, 8_000);
    if (!res.ok) throw new Error(`지하철 API HTTP ${res.status}`);

    const json = (await res.json()) as SeoulSubwayResponse;
    const code = json.errorMessage?.code ?? json.code;
    // INFO-200 = 막차 종료 등 현재 운행 열차 없음 (정상 빈 상태)
    if (code && code !== "INFO-000" && code !== "INFO-200") {
      throw new Error(`${code}: ${json.errorMessage?.message ?? json.message ?? "조회 오류"}`);
    }

    const rows = (json.realtimeArrivalList ?? []).filter(
      (r) => !r.subwayId || r.subwayId === "1001", // 1001 = 1호선
    );

    const up: SubwayArrival[] = [];
    const down: SubwayArrival[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const updn = String(r.updnLine ?? "");
      const direction: "up" | "down" = updn.includes("상행") || updn.includes("내선") ? "up" : "down";
      const sec = Number(r.barvlDt);
      const item: SubwayArrival = {
        id: `${direction}:${r.btrainNo ?? i}:${r.ordkey ?? i}`,
        direction,
        trainLineNm: String(r.trainLineNm ?? "").trim() || (direction === "up" ? "상행" : "하행"),
        arvlMsg: String(r.arvlMsg2 ?? r.arvlMsg3 ?? "").trim(),
        etaSec: Number.isFinite(sec) && sec >= 0 ? sec : null,
        trainType: String(r.btrainSttus ?? "일반").trim() || "일반",
        isLast: String(r.lstcarAt ?? "") === "1",
        receivedAt: String(r.recptnDt ?? "").trim(),
      };
      if (direction === "up") up.push(item);
      else down.push(item);
    }

    const sortByEta = (a: SubwayArrival, b: SubwayArrival) =>
      (a.etaSec ?? 99999) - (b.etaSec ?? 99999);
    up.sort(sortByEta);
    down.sort(sortByEta);

    const payload: SubwayPayload = {
      stationName: UIWANG_STATION.name,
      lineName: UIWANG_STATION.lineName,
      lat: UIWANG_STATION.lat,
      lng: UIWANG_STATION.lng,
      up: up.slice(0, 4),
      down: down.slice(0, 4),
      source: isSample ? "seoul-sample" : "seoul-live",
      updatedAt: new Date().toISOString(),
    };
    cache.set(cacheKey, payload);
    return payload;
  });
}
