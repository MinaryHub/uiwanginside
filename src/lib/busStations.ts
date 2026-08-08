import { timedFetch, createTtlCache } from "./fetcher";

/**
 * 의왕시 버스정류소 목록.
 *
 * GBIS 도착정보 API 는 내부 stationId(9자리)를 요구하는데, 그 ID 를 주는
 * '경기도_버스정류소 조회'(data.go.kr) 는 활용신청 승인이 필요하다.
 * 대신 경기데이터드림의 BusStation 서비스가 같은 STATION_ID 를 좌표와 함께
 * 제공해 우회할 수 있다. (ARS 번호는 도착정보 API 에서 통하지 않는다 — 확인함)
 */

const GG_BUS_STATION = "https://openapi.gg.go.kr/BusStation";

/** 경기데이터드림은 기본 UA 를 차단한다 */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";

export interface BusStation {
  /** GBIS 내부 ID — 도착정보 조회에 쓴다 */
  stationId: string;
  name: string;
  /** 정류소 번호(ARS) — 시민이 정류소 표지판에서 보는 숫자 */
  ars: string;
  lat: number;
  lng: number;
}

interface RawRow {
  STATION_NM_INFO?: string;
  STATION_ID?: string | number;
  STATION_MANAGE_NO?: string | number;
  WGS84_LAT?: string | number;
  WGS84_LOGT?: string | number;
}

/** 정류소는 자주 바뀌지 않으므로 길게 캐시한다 */
const cache = createTtlCache<BusStation[]>(24 * 3600_000, 2);

export function haversine(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}

/** 의왕시 전체 정류소를 받아온다 (약 389곳) */
export async function fetchUiwangStations(key: string): Promise<BusStation[]> {
  const hit = cache.get("uiwang");
  if (hit) return hit;

  const url =
    `${GG_BUS_STATION}?KEY=${key}&Type=json&pIndex=1&pSize=1000` +
    `&SIGUN_NM=${encodeURIComponent("의왕시")}`;
  const res = await timedFetch(url, { headers: { "User-Agent": UA } }, 15_000);
  const text = await res.text();

  // 인증/서비스명 오류는 RESULT 봉투로 온다
  if (text.includes("RESULT") && text.includes("ERROR-")) {
    const m = /"CODE":"(ERROR-[^"]+)","MESSAGE":"([^"]*)"/.exec(text);
    throw new Error(m ? `${m[1]}: ${m[2]}` : "경기데이터드림 오류");
  }
  if (text.trimStart().startsWith("<")) {
    throw new Error("경기데이터드림이 요청을 차단했습니다");
  }

  const json = JSON.parse(text) as Record<string, unknown[]>;
  const rootKey = Object.keys(json)[0];
  const blocks = (json[rootKey] ?? []) as Record<string, unknown>[];
  const rowBlock = blocks.find((b) => "row" in b);
  const rows = ((rowBlock?.row ?? []) as RawRow[]) ?? [];

  const stations: BusStation[] = [];
  for (const r of rows) {
    const id = r.STATION_ID != null ? String(r.STATION_ID) : "";
    const lat = Number(r.WGS84_LAT);
    const lng = Number(r.WGS84_LOGT);
    if (!id || !r.STATION_NM_INFO || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      continue;
    }
    stations.push({
      stationId: id,
      name: String(r.STATION_NM_INFO),
      ars: r.STATION_MANAGE_NO != null ? String(r.STATION_MANAGE_NO) : "",
      lat,
      lng,
    });
  }

  if (stations.length === 0) throw new Error("의왕시 정류소 목록이 비어 있습니다");
  cache.set("uiwang", stations);
  return stations;
}

/** 좌표에서 가까운 정류소 */
export function nearestStations(
  all: BusStation[],
  lat: number,
  lng: number,
  limit: number,
): (BusStation & { distance: number })[] {
  return all
    .map((s) => ({ ...s, distance: haversine(lat, lng, s.lat, s.lng) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}
