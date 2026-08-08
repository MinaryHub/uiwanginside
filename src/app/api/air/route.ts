import {
  timedFetch,
  ok,
  fail,
  nowISO,
  createTtlCache,
  parseDataGoKr,
  isTransientDataGoKrError,
} from "@/lib/fetcher";
import type { AirPayload, AirStation, AirGrade } from "@/lib/types";

export const dynamic = "force-dynamic";

/** 에어코리아는 매시 갱신 */
const CACHE_SEC = 600;

/**
 * 측정소별 조회를 쓴다. 시도별 조회(getCtprvnRltmMesureDnsty)로 경기 전체를
 * 받으면 numOfRows=200 에서 게이트웨이가 504 를 반환한다(실측 10.8초).
 * 측정소를 하나씩 부르면 각 400ms 이하로 끝난다.
 */
const AIRKOREA =
  "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty";

/**
 * 의왕시 측정소.
 * 경기 126개 측정소 중 이름으로 고른다. 시도별 응답에는 주소가 없어
 * 이름만으로 판별해야 하는데, "부곡동" 은 안산시에도 있어 의왕 측정소라고
 * 단정할 수 없다. 오귀속하느니 확실한 두 곳만 쓴다.
 * (측정소 주소 조회 API 인 MsrstnInfoInqireSvc 는 별도 활용신청 대상)
 */
const UIWANG_STATIONS = ["고천동", "청계동"] as const;

const GRADE_LABEL: Record<string, AirGrade> = {
  "1": "좋음",
  "2": "보통",
  "3": "나쁨",
  "4": "매우나쁨",
};

interface RawStation {
  stationName?: string;
  dataTime?: string;
  pm10Value?: string;
  pm25Value?: string;
  o3Value?: string;
  no2Value?: string;
  coValue?: string;
  so2Value?: string;
  pm10Grade?: string;
  pm25Grade?: string;
  khaiValue?: string;
  khaiGrade?: string;
}

/** "-" 나 빈 값은 결측 */
function num(v?: string): number | null {
  if (!v || v === "-") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 등급 코드가 비어 있으면 환경부 기준으로 직접 산출 */
function gradeOf(code: string | undefined, value: number | null, kind: "pm10" | "pm25") {
  const fromCode = code ? GRADE_LABEL[code] : undefined;
  if (fromCode) return fromCode;
  if (value === null) return null;
  const cuts = kind === "pm10" ? [30, 80, 150] : [15, 35, 75];
  if (value <= cuts[0]) return "좋음";
  if (value <= cuts[1]) return "보통";
  if (value <= cuts[2]) return "나쁨";
  return "매우나쁨";
}

/** 데이터를 못 가져왔을 때 내보내는 빈 응답 */
const EMPTY: AirPayload = { stations: [], source: "airkorea", updatedAt: "" };

const cache = createTtlCache<AirPayload>(9 * 60_000, 4);

export async function GET() {
  const key = process.env.AIRKOREA_SERVICE_KEY ?? process.env.KMA_SERVICE_KEY;
  if (!key) {
    return fail(EMPTY, "에어코리아 인증키가 설정되지 않았습니다.");
  }

  const cached = cache.get("air");
  if (cached) return ok(cached, undefined, CACHE_SEC);

  async function loadStation(name: string): Promise<RawStation | null> {
    const url =
      `${AIRKOREA}?stationName=${encodeURIComponent(name)}` +
      `&dataTerm=DAILY&returnType=json&numOfRows=1&pageNo=1&ver=1.3&serviceKey=${key}`;
    const res = await timedFetch(url, {}, 12_000);
    const json = parseDataGoKr(await res.text()) as {
      response?: { body?: { items?: RawStation[] } };
    };
    return json?.response?.body?.items?.[0] ?? null;
  }

  /** 게이트웨이 타임아웃은 흔하고 대개 재시도 한 번으로 통과한다 */
  async function loadWithRetry(name: string): Promise<RawStation | null> {
    try {
      return await loadStation(name);
    } catch (e) {
      if (!isTransientDataGoKrError(e)) throw e;
      console.warn(`[air] ${name} 일시 오류, 재시도:`, e instanceof Error ? e.message : e);
      return loadStation(name);
    }
  }

  try {
    const raws = await Promise.all(UIWANG_STATIONS.map((n) => loadWithRetry(n)));
    const stations = UIWANG_STATIONS.map((name, i): AirStation | null => {
      const r = raws[i];
      if (!r) return null;
      const pm10 = num(r.pm10Value);
      const pm25 = num(r.pm25Value);
      return {
        name,
        pm10,
        pm25,
        o3: num(r.o3Value),
        no2: num(r.no2Value),
        pm10Grade: gradeOf(r.pm10Grade, pm10, "pm10"),
        pm25Grade: gradeOf(r.pm25Grade, pm25, "pm25"),
        khai: num(r.khaiValue),
        khaiGrade: r.khaiGrade ? (GRADE_LABEL[r.khaiGrade] ?? null) : null,
        measuredAt: r.dataTime ?? "",
      };
    }).filter((s): s is AirStation => s !== null);

    if (stations.length === 0) {
      return fail(EMPTY, "의왕 측정소 데이터를 찾지 못했습니다.");
    }

    const payload: AirPayload = { stations, source: "airkorea", updatedAt: nowISO() };
    cache.set("air", payload);
    return ok(payload, undefined, CACHE_SEC);
  } catch (e) {
    console.error("[air]", e);
    const reason = e instanceof Error ? e.message : String(e);
    return fail(EMPTY, `에어코리아 API: ${reason}`);
  }
}
