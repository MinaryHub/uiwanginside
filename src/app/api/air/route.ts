import {
  timedFetch,
  ok,
  fail,
  nowISO,
  createTtlCache,
  parseDataGoKr,
  isTransientDataGoKrError,
} from "@/lib/fetcher";
import type { AirPayload, AirStation, AirGrade, AirForecast } from "@/lib/types";

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
 * 대기질 예보 — 같은 서비스(ArpltnInforInqireSvc) 안에 있어 활용신청을
 * 따로 받지 않는다. 권역별 등급을 "서울 : 보통,경기남부 : 좋음,…" 처럼
 * 한 문자열로 준다. 의왕은 경기남부 권역이다.
 */
const FORECAST =
  "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMinuDustFrcstDspth";
const REGION = "경기남부";

/** KST 날짜 YYYY-MM-DD. offset 일 뒤 */
function kstDate(offset = 0): string {
  return new Date(Date.now() + 9 * 3600_000 + offset * 86_400_000).toISOString().slice(0, 10);
}

interface RawForecast {
  informCode?: string;
  informData?: string;
  informGrade?: string;
  dataTime?: string;
}

function regionGrade(s?: string): AirGrade | null {
  const m = s?.match(new RegExp(`${REGION}\\s*:\\s*(좋음|보통|나쁨|매우나쁨)`));
  return (m?.[1] as AirGrade | undefined) ?? null;
}

/**
 * 오늘·내일 예보.
 * 하루에 네 번(5·11·17·23시) 발표하고 같은 날짜에 대한 예보가 여러 번
 * 온다. 날짜·항목마다 가장 늦게 발표된 것을 쓴다. 내일 예보는 오후
 * 발표부터 나온다 — 없으면 오늘만 보여준다.
 */
async function loadForecast(key: string): Promise<{ forecast: AirForecast[]; at?: string }> {
  const url =
    `${FORECAST}?searchDate=${kstDate()}&returnType=json&numOfRows=100&pageNo=1` +
    `&ver=1.1&serviceKey=${key}`;
  const res = await timedFetch(url, {}, 12_000);
  const json = parseDataGoKr(await res.text()) as {
    response?: { body?: { items?: RawForecast[] } };
  };
  const items = json?.response?.body?.items ?? [];

  const latest = new Map<string, RawForecast>();
  for (const it of items) {
    if (!it.informData || (it.informCode !== "PM10" && it.informCode !== "PM25")) continue;
    const k = `${it.informData}|${it.informCode}`;
    const cur = latest.get(k);
    if (!cur || (it.dataTime ?? "") > (cur.dataTime ?? "")) latest.set(k, it);
  }

  const forecast: AirForecast[] = [];
  let at: string | undefined;
  for (const date of [kstDate(0), kstDate(1)]) {
    const p10 = latest.get(`${date}|PM10`);
    const p25 = latest.get(`${date}|PM25`);
    const f = { date, pm10: regionGrade(p10?.informGrade), pm25: regionGrade(p25?.informGrade) };
    if (f.pm10 || f.pm25) forecast.push(f);
    for (const x of [p10, p25]) if (x?.dataTime && (!at || x.dataTime > at)) at = x.dataTime;
  }
  return { forecast, at };
}

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
    // 예보가 실패해도 지금 값은 보여준다. 예보는 덤이다.
    const forecastP = loadForecast(key).catch((e) => {
      console.warn("[air:forecast]", e instanceof Error ? e.message : e);
      return { forecast: [] as AirForecast[], at: undefined };
    });
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

    const { forecast, at } = await forecastP;
    const payload: AirPayload = {
      stations,
      forecast,
      forecastAt: at,
      source: "airkorea",
      updatedAt: nowISO(),
    };
    cache.set("air", payload);
    return ok(payload, undefined, CACHE_SEC);
  } catch (e) {
    console.error("[air]", e);
    const reason = e instanceof Error ? e.message : String(e);
    return fail(EMPTY, `에어코리아 API: ${reason}`);
  }
}
