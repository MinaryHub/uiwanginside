import {
  timedFetch,
  ok,
  fail,
  nowISO,
  parseDataGoKr,
  isTransientDataGoKrError,
  normalizeServiceKey,
} from "@/lib/fetcher";
import { fetchWithSharedCache } from "@/lib/sharedCache";
import type { AirPayload, AirStation, AirGrade, AirForecast } from "@/lib/types";

export const dynamic = "force-dynamic";

const CACHE_SEC = 600;
const AIRKOREA =
  "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty";
const FORECAST =
  "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMinuDustFrcstDspth";
const REGION = "경기남부";

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

async function loadForecast(key: string): Promise<{ forecast: AirForecast[]; at?: string }> {
  const url =
    `${FORECAST}?searchDate=${kstDate()}&returnType=json&numOfRows=100&pageNo=1` +
    `&ver=1.1&serviceKey=${normalizeServiceKey(key)}`;
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

function num(v?: string): number | null {
  if (!v || v === "-") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

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

const EMPTY: AirPayload = { stations: [], source: "airkorea", updatedAt: "" };

export async function GET() {
  const key = process.env.AIRKOREA_SERVICE_KEY ?? process.env.KMA_SERVICE_KEY;
  if (!key) {
    return fail(EMPTY, "에어코리아 인증키가 설정되지 않았습니다.");
  }

  const encodedKey = normalizeServiceKey(key);

  async function loadStation(name: string): Promise<RawStation | null> {
    const url =
      `${AIRKOREA}?stationName=${encodeURIComponent(name)}` +
      `&dataTerm=DAILY&returnType=json&numOfRows=1&pageNo=1&ver=1.3&serviceKey=${encodedKey}`;
    const res = await timedFetch(url, {}, 12_000);
    const json = parseDataGoKr(await res.text()) as {
      response?: { body?: { items?: RawStation[] } };
    };
    return json?.response?.body?.items?.[0] ?? null;
  }

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
    const cached = await fetchWithSharedCache<AirPayload>({
      key: "air",
      ttlMs: 9 * 60_000,
      staleMaxMs: 2 * 3600_000,
      failCooldownMs: 60_000,
      fetcher: async () => {
        const forecastP = loadForecast(key).catch((e) => {
          console.warn("[air:forecast]", e instanceof Error ? e.message : e);
          return { forecast: [] as AirForecast[], at: undefined };
        });

        const settled = await Promise.allSettled(UIWANG_STATIONS.map((n) => loadWithRetry(n)));
        const stations = UIWANG_STATIONS.map((name, i): AirStation | null => {
          const s = settled[i];
          if (s.status !== "fulfilled" || !s.value) return null;
          const r = s.value;
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
          const firstErr = settled.find((s) => s.status === "rejected");
          if (firstErr && firstErr.status === "rejected") throw firstErr.reason;
          throw new Error("의왕 측정소 데이터를 찾지 못했습니다.");
        }

        const { forecast, at } = await forecastP;
        const payload: AirPayload = {
          stations,
          forecast,
          forecastAt: at,
          source: "airkorea",
          updatedAt: nowISO(),
        };
        const partial = stations.length < UIWANG_STATIONS.length;
        return {
          value: payload,
          notice: partial
            ? "일부 측정소 응답이 지연되어 수신된 측정소만 표시합니다."
            : undefined,
          customTtlMs: partial ? 2 * 60_000 : undefined,
        };
      },
    });
    return ok(cached.value, cached.notice, cached.stale || cached.notice ? 60 : CACHE_SEC);
  } catch (e) {
    console.error("[air]", e);
    const reason = e instanceof Error ? e.message : String(e);
    return fail(EMPTY, `에어코리아 API: ${reason}`);
  }
}
