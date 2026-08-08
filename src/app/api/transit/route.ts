import { XMLParser } from "fast-xml-parser";
import { timedFetch, ok, fail, nowISO } from "@/lib/fetcher";
import { fetchOverpassBusStops } from "@/lib/overpass";
import { UIWANG } from "@/lib/uiwang";
import type { TransitPayload, BusStop, BusArrival } from "@/lib/types";

export const dynamic = "force-dynamic";

/** CDN 캐시 수명(초) — 버스 도착은 아주 짧게 */
const CACHE_SEC = 20;

/** 경기도 버스정보(GBIS) — 공공데이터포털 6410000 */
const GBIS = "https://apis.data.go.kr/6410000";

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: true });

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * GBIS 는 정상 응답을 XML 로 주지만, data.go.kr 게이트웨이 단계의 인증/쿼터 오류는
 * JSON(OpenAPI_ServiceResponse) 으로 내려온다. 두 형태를 모두 해석해야
 * 오류가 "데이터 없음" 으로 둔갑하지 않는다.
 */
async function getGbis(url: string) {
  const res = await timedFetch(url);
  const text = await res.text();
  const trimmed = text.trimStart();

  if (trimmed.startsWith("{")) {
    const j = JSON.parse(text);
    const h = j?.OpenAPI_ServiceResponse?.cmmMsgHeader;
    if (h) {
      throw new Error(
        `GBIS ${h.returnReasonCode}: ${h.returnAuthMsg ?? h.errMsg ?? "알 수 없는 오류"}`,
      );
    }
    return j;
  }

  const json = parser.parse(text);
  const gwHeader = json?.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (gwHeader) {
    throw new Error(
      `GBIS ${gwHeader.returnReasonCode}: ${gwHeader.returnAuthMsg ?? gwHeader.errMsg}`,
    );
  }

  const header = json?.response?.msgHeader ?? json?.msgHeader;
  const code = header?.resultCode;
  // 정상 0, 데이터 없음 4
  if (code != null && Number(code) !== 0 && Number(code) !== 4) {
    throw new Error(`GBIS ${code}: ${header?.resultMessage ?? text.slice(0, 150)}`);
  }
  return json;
}

interface RawStop {
  stationId: number | string;
  stationName: string;
  mobileNo?: number | string;
  x: number | string;
  y: number | string;
  distance?: number | string;
}

interface RawArrival {
  routeId: number | string;
  routeName?: string | number;
  predictTime1?: number | string;
  predictTime2?: number | string;
  remainSeatCnt1?: number | string;
  plateNo1?: string;
  lowPlate1?: number | string;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** 데이터를 못 가져왔을 때 내보내는 빈 응답 */
const EMPTY: TransitPayload = { stops: [], source: "gbis", updatedAt: "" };

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const lat = Number(sp.get("lat") ?? UIWANG.center.lat);
  const lng = Number(sp.get("lng") ?? UIWANG.center.lng);
  const limit = Math.min(Number(sp.get("limit") ?? 6), 12);

  const key = process.env.GBIS_SERVICE_KEY;
  if (!key) {
    return fail(EMPTY, "경기버스 인증키가 설정되지 않았습니다.");
  }

  let rawStops: RawStop[];
  try {
    const aroundUrl =
      `${GBIS}/busstationservice/v2/getBusStationAroundListv2` +
      `?serviceKey=${key}&x=${lng}&y=${lat}`;
    const aroundJson = await getGbis(aroundUrl);
    rawStops = asArray<RawStop>(aroundJson?.response?.msgBody?.busStationAroundList);
  } catch (e) {
    // 정류소 조회 서비스만 미승인인 경우가 흔하다 (도착정보와 별개 활용신청).
    // 이때는 OSM 정류소 위치라도 실제 데이터로 보여준다.
    console.error("[transit:station]", e);
    const reason = e instanceof Error ? e.message : String(e);
    try {
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
        `정류소 위치는 OpenStreetMap 실제 데이터입니다. 도착 예정 시간을 보려면 ` +
          `data.go.kr 에서 '경기도_버스정류소 조회' 활용신청이 추가로 필요합니다. (${reason})`,
      );
    } catch (osmErr) {
      console.error("[transit:osm]", osmErr);
      return fail(EMPTY, `경기버스 정류소 조회 실패: ${reason}`);
    }
  }

  try {
    const stops: BusStop[] = rawStops
      .map((s) => ({
        stationId: String(s.stationId),
        mobileNo: String(s.mobileNo ?? ""),
        name: String(s.stationName),
        lat: Number(s.y),
        lng: Number(s.x),
        distance: num(s.distance),
      }))
      .sort((a, b) => (a.distance ?? 9e9) - (b.distance ?? 9e9))
      .slice(0, limit);

    if (stops.length === 0) {
      return ok(
        { stops: [], source: "gbis", updatedAt: nowISO() } satisfies TransitPayload,
        "주변에 조회된 정류소가 없습니다.",
        CACHE_SEC,
      );
    }

    await Promise.all(
      stops.map(async (stop) => {
        try {
          const j = await getGbis(
            `${GBIS}/busarrivalservice/v2/getBusArrivalListv2` +
              `?serviceKey=${key}&stationId=${stop.stationId}`,
          );
          const raw = asArray<RawArrival>(j?.response?.msgBody?.busArrivalList);
          stop.arrivals = raw
            .map((a): BusArrival => {
              const m1 = num(a.predictTime1);
              const m2 = num(a.predictTime2);
              return {
                routeId: String(a.routeId),
                routeName: String(a.routeName ?? a.routeId),
                predictSec: m1 === null ? null : m1 * 60,
                predictSec2: m2 === null ? null : m2 * 60,
                remainSeats: (() => {
                  const r = num(a.remainSeatCnt1);
                  return r === null || r < 0 ? null : r;
                })(),
                plateNo: String(a.plateNo1 ?? ""),
                lowPlate: Number(a.lowPlate1) === 1,
              };
            })
            .sort((x, y) => (x.predictSec ?? 9e9) - (y.predictSec ?? 9e9))
            .slice(0, 6);
        } catch (e) {
          console.error("[transit:arrival]", stop.stationId, e);
          stop.arrivals = [];
        }
      }),
    );

    return ok(
      { stops, source: "gbis", updatedAt: nowISO() } satisfies TransitPayload,
      undefined,
      CACHE_SEC,
    );
  } catch (e) {
    console.error("[transit:arrivals]", e);
    const reason = e instanceof Error ? e.message : String(e);
    return fail(EMPTY, `경기버스 도착정보 조회 실패: ${reason}`);
  }
}
