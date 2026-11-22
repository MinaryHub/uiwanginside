import { timedFetch, createTtlCache, createInFlight } from "./fetcher";
import { haversine } from "./geo";

export { haversine };

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
const uiwangInFlight = createInFlight<BusStation[]>();

const PAGE_SIZE = 1000;

/** 시군 단위 정류소 조회 */
async function fetchStations(
  key: string,
  sigun: string,
  page = 1,
): Promise<BusStation[]> {
  const url =
    `${GG_BUS_STATION}?KEY=${encodeURIComponent(key)}&Type=json&pIndex=${page}&pSize=${PAGE_SIZE}` +
    `&SIGUN_NM=${encodeURIComponent(sigun)}`;
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

  return stations;
}

/** 의왕시 정류소 (약 389곳) */
export async function fetchUiwangStations(key: string): Promise<BusStation[]> {
  const hit = cache.get("uiwang");
  if (hit) return hit;
  return uiwangInFlight("uiwang", async () => {
    const stations = await fetchStations(key, "의왕시");
    if (stations.length === 0) throw new Error("의왕시 정류소 목록이 비어 있습니다");
    cache.set("uiwang", stations);
    return stations;
  });
}

/**
 * 의왕과 인접 시의 정류소 좌표 색인 (stationId → 정류소).
 *
 * GBIS 버스위치 API 는 GPS 좌표 없이 stationId 만 준다. 지도에 찍으려면
 * 좌표가 필요한데, 경기데이터드림의 STATION_ID 필터는 동작하지 않아
 * (지정해도 무시되고 엉뚱한 첫 행을 돌려준다) 도시별로 받아 색인을 만든다.
 *
 * 의왕을 지나는 노선의 서울 구간 정류소는 여기에 없다. 그 구간 버스는
 * 위치를 표시하지 않는다 — 시민이 궁금한 건 우리 동네 근처 버스다.
 */
const NEARBY_SIGUN = ["의왕시", "안양시", "군포시", "수원시", "과천시", "성남시"];

const indexCache = createTtlCache<Map<string, BusStation>>(24 * 3600_000, 2);
const indexInFlight = createInFlight<Map<string, BusStation>>();

export async function fetchStationIndex(key: string): Promise<Map<string, BusStation>> {
  const hit = indexCache.get("idx");
  if (hit) return hit;

  return indexInFlight("idx", async () => {
    const index = new Map<string, BusStation>();
    let failed = 0;
    for (const sigun of NEARBY_SIGUN) {
      try {
        // 수원·성남 등은 1000건을 넘어 여러 쪽을 받는다
        for (let page = 1; page <= 4; page++) {
          const list = await fetchStations(key, sigun, page);
          for (const st of list) index.set(st.stationId, st);
          if (list.length < PAGE_SIZE) break;
        }
      } catch (e) {
        failed++;
        console.error("[busStations:index]", sigun, e);
      }
    }
    if (index.size === 0) throw new Error("정류소 색인을 만들지 못했습니다");
    // 일부 도시가 실패했으면 10분만 캐시해 복구 시 다시 채운다
    indexCache.set("idx", index, failed > 0 ? 10 * 60_000 : undefined);
    return index;
  });
}

/** 좌표에서 가까운 정류소 */
export function nearestStations(
  all: BusStation[],
  lat: number,
  lng: number,
  limit: number,
): (BusStation & { distance: number })[] {
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 50));
  return all
    .map((s) => ({ ...s, distance: haversine(lat, lng, s.lat, s.lng) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, safeLimit);
}
