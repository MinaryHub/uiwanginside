import {
  timedFetch,
  ok,
  fail,
  nowISO,
  normalizeServiceKey,
  createTtlCache,
  kstDateParts,
  parseDataGoKr,
  asArray,
} from "@/lib/fetcher";
import { UIWANG } from "@/lib/uiwang";
import { fetchAlerts } from "@/lib/alerts";
import type { WeatherPayload, WeatherForecastItem } from "@/lib/types";

export const dynamic = "force-dynamic";

const CACHE_SEC = 600;
const weatherCache = createTtlCache<WeatherPayload>(5 * 60_000, 2);

const KMA_BASE = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0";

const SKY: Record<string, string> = { "1": "맑음", "3": "구름많음", "4": "흐림" };
const PTY: Record<string, string> = {
  "0": "없음",
  "1": "비",
  "2": "비/눈",
  "3": "눈",
  "4": "소나기",
  "5": "빗방울",
  "6": "빗방울/눈날림",
  "7": "눈날림",
};

interface KmaItem {
  category: string;
  obsrValue?: string;
  fcstValue?: string;
  fcstDate?: string;
  fcstTime?: string;
}

/** 초단기실황: 매시 40분 이후 제공 → 45분 여유를 두고 기준 시각 산출 */
function ncstBaseTime() {
  const { minute } = kstDateParts();
  const offsetMin = minute < 45 ? 60 + minute : minute;
  const base = kstDateParts(-offsetMin * 60_000);
  return { date: base.ymd, hour: base.hh };
}

/** 단기예보 발표 시각: 02,05,08,11,14,17,20,23시 (+15분 여유) */
function vilageBase() {
  const slots = [2, 5, 8, 11, 14, 17, 20, 23];
  const { ymd, hour, minute } = kstDateParts();
  const usable = slots.filter((s) => hour > s || (hour === s && minute >= 15));
  if (usable.length === 0) {
    const yesterday = kstDateParts(-86_400_000);
    return { date: yesterday.ymd, time: "2300" };
  }
  return { date: ymd, time: `${String(usable[usable.length - 1]).padStart(2, "0")}00` };
}

async function callKma(path: string, params: Record<string, string>, key: string) {
  const qs = new URLSearchParams({
    dataType: "JSON",
    numOfRows: "1000",
    pageNo: "1",
    nx: String(UIWANG.grid.nx),
    ny: String(UIWANG.grid.ny),
    ...params,
  });
  const res = await timedFetch(
    `${KMA_BASE}/${path}?serviceKey=${normalizeServiceKey(key)}&${qs}`,
  );
  const json = parseDataGoKr(await res.text()) as {
    response?: { body?: { items?: { item?: KmaItem | KmaItem[] } } };
  };
  return asArray<KmaItem>(json?.response?.body?.items?.item);
}

function parseNum(v: string | null | undefined): number | null {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const EMPTY: WeatherPayload = {
  now: null,
  forecast: [],
  alerts: [],
  source: "kma",
  updatedAt: "",
};

export async function GET() {
  const key = process.env.KMA_SERVICE_KEY;
  if (!key) {
    return fail(EMPTY, "기상청 인증키가 설정되지 않았습니다.");
  }

  const cached = weatherCache.get("weather");
  if (cached) return ok(cached, undefined, CACHE_SEC);

  try {
    const nb = ncstBaseTime();
    const vb = vilageBase();

    const [ncstRes, fcstRes, alerts] = await Promise.all([
      callKma("getUltraSrtNcst", { base_date: nb.date, base_time: `${nb.hour}00` }, key).then(
        (v) => ({ ok: true as const, value: v }),
        (e) => ({ ok: false as const, error: e }),
      ),
      callKma("getVilageFcst", { base_date: vb.date, base_time: vb.time }, key).then(
        (v) => ({ ok: true as const, value: v }),
        (e) => ({ ok: false as const, error: e }),
      ),
      fetchAlerts().catch((e) => {
        console.error("[weather:alerts]", e);
        return [];
      }),
    ]);

    if (!ncstRes.ok && !fcstRes.ok) {
      throw ncstRes.error;
    }

    const ncst = ncstRes.ok ? ncstRes.value : [];
    const fcst = fcstRes.ok ? fcstRes.value : [];

    const pick = (cat: string) =>
      ncst.find((i) => i.category === cat)?.obsrValue ?? null;

    const buckets = new Map<string, Record<string, string>>();
    for (const it of fcst) {
      if (!it.fcstDate || !it.fcstTime) continue;
      const k = `${it.fcstDate}${it.fcstTime}`;
      const b = buckets.get(k) ?? {};
      b[it.category] = it.fcstValue ?? "";
      buckets.set(k, b);
    }
    const cutoff = Date.now() - 30 * 60_000;
    const forecast: WeatherForecastItem[] = [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => {
        const iso = `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}T${k.slice(8, 10)}:00:00+09:00`;
        const ts = Date.parse(iso);
        return {
          time: Number.isFinite(ts) ? new Date(ts).toISOString() : nowISO(),
          temp: parseNum(v.TMP),
          sky: SKY[v.SKY] ?? "-",
          precipitation: PTY[v.PTY] ?? "없음",
          pop: parseNum(v.POP),
        };
      })
      .filter((f) => new Date(f.time).getTime() >= cutoff)
      .slice(0, 8);

    const obsIso = `${nb.date.slice(0, 4)}-${nb.date.slice(4, 6)}-${nb.date.slice(6, 8)}T${nb.hour}:00:00+09:00`;
    const obsTs = Date.parse(obsIso);

    const payload: WeatherPayload = {
      now: ncstRes.ok
        ? {
            temp: parseNum(pick("T1H")),
            humidity: parseNum(pick("REH")),
            rain1h: parseNum(pick("RN1")),
            windSpeed: parseNum(pick("WSD")),
            precipitation: PTY[pick("PTY") ?? "0"] ?? "없음",
            sky: forecast[0]?.sky ?? "-",
            observedAt: Number.isFinite(obsTs) ? new Date(obsTs).toISOString() : nowISO(),
          }
        : null,
      forecast,
      alerts,
      source: "kma",
      updatedAt: nowISO(),
    };
    const partial = !ncstRes.ok || !fcstRes.ok;
    if (!partial) weatherCache.set("weather", payload);
    return ok(
      payload,
      !fcstRes.ok ? "단기예보를 일시적으로 불러오지 못해 현재 날씨만 표시합니다." : undefined,
      partial ? 60 : CACHE_SEC,
    );
  } catch (e) {
    console.error("[weather]", e);
    return fail(EMPTY, `기상청 API 호출 실패: ${e instanceof Error ? e.message : e}`);
  }
}
