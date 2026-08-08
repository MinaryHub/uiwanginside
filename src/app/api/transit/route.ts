import { XMLParser } from "fast-xml-parser";
import { timedFetch, ok, fail, nowISO } from "@/lib/fetcher";
import { UIWANG } from "@/lib/uiwang";
import type { TransitPayload, BusStop, BusArrival } from "@/lib/types";

export const dynamic = "force-dynamic";

/** 경기도 버스정보(GBIS) — 공공데이터포털 6410000 */
const GBIS = "https://apis.data.go.kr/6410000";

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: true });

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

async function getXml(url: string) {
  const res = await timedFetch(url);
  const text = await res.text();
  const json = parser.parse(text);
  const header = json?.response?.msgHeader ?? json?.msgHeader ?? json?.OpenAPI_ServiceResponse?.cmmMsgHeader;
  const code = header?.resultCode ?? header?.returnReasonCode;
  // GBIS 는 정상 시 resultCode 0, 데이터 없음은 4
  if (code != null && Number(code) !== 0 && Number(code) !== 4) {
    throw new Error(`GBIS ${code}: ${header?.resultMessage ?? header?.returnAuthMsg ?? text.slice(0, 150)}`);
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

function sampleTransit(): TransitPayload {
  const mk = (
    stationId: string,
    name: string,
    mobileNo: string,
    lat: number,
    lng: number,
    distance: number,
    arrivals: [string, number, number][],
  ): BusStop => ({
    stationId,
    mobileNo,
    name,
    lat,
    lng,
    distance,
    arrivals: arrivals.map(([routeName, m1, m2]) => ({
      routeId: routeName,
      routeName,
      predictSec: m1 * 60,
      predictSec2: m2 * 60,
      remainSeats: null,
      plateNo: "",
      lowPlate: false,
    })),
  });

  return {
    stops: [
      mk("s1", "의왕시청", "35123", 37.3449, 126.9689, 120, [
        ["1-1", 3, 14],
        ["10", 7, 22],
        ["441", 11, 27],
      ]),
      mk("s2", "고천사거리", "35044", 37.3462, 126.9707, 310, [
        ["777", 2, 18],
        ["11-2", 9, 25],
      ]),
      mk("s3", "의왕역", "35210", 37.3447, 126.9686, 480, [
        ["8", 5, 20],
        ["30", 12, 31],
      ]),
    ],
    source: "sample",
    updatedAt: nowISO(),
  };
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const lat = Number(sp.get("lat") ?? UIWANG.center.lat);
  const lng = Number(sp.get("lng") ?? UIWANG.center.lng);
  const limit = Math.min(Number(sp.get("limit") ?? 6), 12);

  const key = process.env.GBIS_SERVICE_KEY;
  if (!key) {
    return fail(sampleTransit(), "GBIS_SERVICE_KEY 미설정 — 샘플 버스정보를 표시합니다.");
  }

  try {
    const aroundUrl =
      `${GBIS}/busstationservice/v2/getBusStationAroundListv2` +
      `?serviceKey=${key}&x=${lng}&y=${lat}`;
    const aroundJson = await getXml(aroundUrl);
    const rawStops = asArray<RawStop>(
      aroundJson?.response?.msgBody?.busStationAroundList,
    );

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
      );
    }

    await Promise.all(
      stops.map(async (stop) => {
        try {
          const j = await getXml(
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

    return ok({ stops, source: "gbis", updatedAt: nowISO() } satisfies TransitPayload);
  } catch (e) {
    console.error("[transit]", e);
    return fail(sampleTransit(), "경기버스 API 호출 실패 — 샘플 버스정보를 표시합니다.");
  }
}
