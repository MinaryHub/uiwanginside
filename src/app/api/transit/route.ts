import { timedFetch, ok, fail, nowISO, parseDataGoKr } from "@/lib/fetcher";
import { fetchOverpassBusStops } from "@/lib/overpass";
import { fetchUiwangStations, nearestStations } from "@/lib/busStations";
import { UIWANG } from "@/lib/uiwang";
import type { TransitPayload, BusStop, BusArrival } from "@/lib/types";

export const dynamic = "force-dynamic";

/** 도착정보는 수십 초 단위로 바뀐다 */
const CACHE_SEC = 20;

/** 경기버스 도착정보 (공공데이터포털 6410000) */
const ARRIVAL =
  "https://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalListv2";

interface RawArrival {
  routeId?: number | string;
  routeName?: string | number;
  routeDestName?: string;
  predictTime1?: number | string;
  predictTime2?: number | string;
  predictTimeSec1?: number | string;
  predictTimeSec2?: number | string;
  remainSeatCnt1?: number | string;
  crowded1?: number | string;
  locationNo1?: number | string;
  plateNo1?: string;
  lowPlate1?: number | string;
}

/**
 * GBIS 는 값이 없을 때 빈 문자열을 보낸다.
 * Number("") 와 Number(null) 은 모두 0 이라 그대로 쓰면 "정보 없음" 이
 * "0분 = 곧 도착" 으로 둔갑한다. 실제로 운행 중인 버스가 없는 노선이
 * 전부 '곧 도착' 으로 표시되는 버그가 있었다.
 */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * 초 단위 값을 우선 쓰고, 없으면 분 단위를 초로 환산한다.
 * 0 이하는 정보 없음으로 본다 — 실제 '곧 도착' 은 초 단위 값이 1 이상으로 온다.
 */
function seconds(sec: unknown, min: unknown): number | null {
  const s = num(sec);
  if (s !== null && s > 0) return s;
  const m = num(min);
  return m !== null && m > 0 ? m * 60 : null;
}

/** 데이터를 못 가져왔을 때 내보내는 빈 응답 */
const EMPTY: TransitPayload = { stops: [], source: "gbis", updatedAt: "" };

async function fetchArrivals(key: string, stationId: string): Promise<BusArrival[]> {
  const res = await timedFetch(
    `${ARRIVAL}?serviceKey=${key}&stationId=${stationId}`,
    {},
    10_000,
  );
  const json = parseDataGoKr(await res.text()) as {
    response?: {
      msgHeader?: { resultCode?: number };
      msgBody?: { busArrivalList?: unknown };
    };
  };
  const code = json?.response?.msgHeader?.resultCode;
  // 0 정상, 4 데이터 없음(운행 종료 등)
  if (code != null && Number(code) !== 0 && Number(code) !== 4) {
    throw new Error(`GBIS resultCode ${code}`);
  }
  const raw = json?.response?.msgBody?.busArrivalList;
  const rows: RawArrival[] = Array.isArray(raw) ? raw : raw ? [raw as RawArrival] : [];

  return rows
    .map((a): BusArrival => {
      const seats = num(a.remainSeatCnt1);
      const crowd = num(a.crowded1);
      return {
        routeId: String(a.routeId ?? ""),
        routeName: String(a.routeName ?? a.routeId ?? ""),
        destName: a.routeDestName ? String(a.routeDestName) : "",
        predictSec: seconds(a.predictTimeSec1, a.predictTime1),
        predictSec2: seconds(a.predictTimeSec2, a.predictTime2),
        // -1 은 좌석 정보 미제공
        remainSeats: seats === null || seats < 0 ? null : seats,
        crowded: crowd === null || crowd <= 0 ? null : crowd,
        stationsLeft: num(a.locationNo1),
        plateNo: String(a.plateNo1 ?? ""),
        lowPlate: Number(a.lowPlate1) === 1,
      };
    })
    .filter((a) => a.routeName)
    // 도착 예정이 있는 노선을 먼저, 그 안에서 이른 순.
    // 운행 정보 없는 노선이 실제 도착 버스를 밀어내면 안 된다.
    .sort((x, y) => (x.predictSec ?? 9e9) - (y.predictSec ?? 9e9));
}

/** 정류소 목록을 못 구할 때 — 위치만이라도 실제 데이터로 보여준다 */
async function osmOnly(lat: number, lng: number, limit: number, reason: string) {
  const osm = await fetchOverpassBusStops(lat, lng, 1200, limit);
  return ok(
    {
      stops: osm.map((s) => ({
        stationId: s.id,
        mobileNo: s.ref,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        distance: s.distance,
        arrivals: [],
      })),
      source: "osm" as const,
      updatedAt: nowISO(),
    } satisfies TransitPayload,
    `정류소 위치는 OpenStreetMap 실제 데이터입니다. 도착 시간은 표시할 수 없습니다. (${reason})`,
  );
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const lat = Number(sp.get("lat") ?? UIWANG.center.lat);
  const lng = Number(sp.get("lng") ?? UIWANG.center.lng);
  const limit = Math.min(Number(sp.get("limit") ?? 6), 12);

  const arrivalKey = process.env.GBIS_SERVICE_KEY;
  const stationKey = process.env.GG_DATA_KEY;

  if (!arrivalKey && !stationKey) {
    return fail(EMPTY, "버스 인증키가 설정되지 않았습니다.");
  }

  // 1단계: stationId 를 포함한 정류소 목록 확보
  let near: Awaited<ReturnType<typeof nearestStations>>;
  try {
    if (!stationKey) throw new Error("정류소 목록 인증키(GG_DATA_KEY) 미설정");
    const all = await fetchUiwangStations(stationKey);
    near = nearestStations(all, lat, lng, limit);
  } catch (e) {
    console.error("[transit:stations]", e);
    const reason = e instanceof Error ? e.message : String(e);
    try {
      return await osmOnly(lat, lng, limit, reason);
    } catch (osmErr) {
      console.error("[transit:osm]", osmErr);
      return fail(EMPTY, `정류소 목록을 가져오지 못했습니다: ${reason}`);
    }
  }

  // 2단계: 정류소별 도착정보
  if (!arrivalKey) {
    return ok(
      {
        stops: near.map((s) => ({
          stationId: s.stationId,
          mobileNo: s.ars,
          name: s.name,
          lat: s.lat,
          lng: s.lng,
          distance: s.distance,
          arrivals: [],
        })),
        source: "osm" as const,
        updatedAt: nowISO(),
      } satisfies TransitPayload,
      "도착정보 인증키가 없어 정류소 위치만 표시합니다.",
    );
  }

  const stops: BusStop[] = await Promise.all(
    near.map(async (s): Promise<BusStop> => {
      let arrivals: BusArrival[] = [];
      try {
        arrivals = await fetchArrivals(arrivalKey, s.stationId);
      } catch (e) {
        // 한 정류소가 실패해도 나머지는 보여준다
        console.error("[transit:arrival]", s.stationId, e);
      }
      return {
        stationId: s.stationId,
        mobileNo: s.ars,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        distance: s.distance,
        arrivals: arrivals.slice(0, 8),
      };
    }),
  );

  return ok(
    { stops, source: "gbis", updatedAt: nowISO() } satisfies TransitPayload,
    undefined,
    CACHE_SEC,
  );
}
