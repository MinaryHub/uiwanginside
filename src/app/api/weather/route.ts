import { timedFetch, ok, fail, nowISO } from "@/lib/fetcher";
import { UIWANG } from "@/lib/uiwang";
import type { WeatherPayload, WeatherForecastItem } from "@/lib/types";

export const dynamic = "force-dynamic";

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

/** KST 기준 날짜/시각 문자열 */
function kstParts(offsetMinutes = 0) {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000 - offsetMinutes * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`,
    hour: p(d.getUTCHours()),
    minute: p(d.getUTCMinutes()),
  };
}

/** 초단기실황: 매시 40분 이후 제공 → 45분 여유를 두고 기준 시각 산출 */
function ncstBaseTime() {
  const { minute } = kstParts();
  return kstParts(Number(minute) < 45 ? 60 + Number(minute) : Number(minute));
}

/** 단기예보 발표 시각: 02,05,08,11,14,17,20,23시 (+10분 여유) */
function vilageBase() {
  const slots = [2, 5, 8, 11, 14, 17, 20, 23];
  const { date, hour, minute } = kstParts();
  const h = Number(hour);
  const usable = slots.filter((s) => h > s || (h === s && Number(minute) >= 15));
  if (usable.length === 0) {
    // 자정~02:15 → 전날 23시 발표
    const d = new Date(
      Date.UTC(
        Number(date.slice(0, 4)),
        Number(date.slice(4, 6)) - 1,
        Number(date.slice(6, 8)),
      ) - 86400000,
    );
    const p = (n: number) => String(n).padStart(2, "0");
    return {
      date: `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`,
      time: "2300",
    };
  }
  return { date, time: `${String(usable[usable.length - 1]).padStart(2, "0")}00` };
}

async function callKma(path: string, params: Record<string, string>, key: string) {
  const qs = new URLSearchParams({
    serviceKey: key,
    dataType: "JSON",
    numOfRows: "300",
    pageNo: "1",
    nx: String(UIWANG.grid.nx),
    ny: String(UIWANG.grid.ny),
    ...params,
  });
  const res = await timedFetch(`${KMA_BASE}/${path}?${qs}`);
  const text = await res.text();
  if (text.trimStart().startsWith("<")) {
    throw new Error(`KMA XML 응답 (키 오류 가능): ${text.slice(0, 200)}`);
  }
  const json = JSON.parse(text);
  const header = json?.response?.header;
  if (header?.resultCode !== "00") {
    throw new Error(`KMA ${header?.resultCode}: ${header?.resultMsg}`);
  }
  return (json.response.body.items.item ?? []) as KmaItem[];
}

function sampleWeather(): WeatherPayload {
  const base = new Date();
  return {
    now: {
      temp: 27.4,
      humidity: 62,
      rain1h: 0,
      windSpeed: 1.8,
      precipitation: "없음",
      sky: "구름많음",
      observedAt: nowISO(),
    },
    forecast: Array.from({ length: 8 }, (_, i): WeatherForecastItem => {
      const t = new Date(base.getTime() + (i + 1) * 3 * 3600 * 1000);
      return {
        time: t.toISOString(),
        temp: Math.round(24 + Math.sin(i) * 4),
        sky: i % 3 === 0 ? "맑음" : "구름많음",
        precipitation: i === 4 ? "비" : "없음",
        pop: i === 4 ? 60 : 10,
      };
    }),
    source: "sample",
    updatedAt: nowISO(),
  };
}

export async function GET() {
  const key = process.env.KMA_SERVICE_KEY;
  if (!key) {
    return fail(sampleWeather(), "KMA_SERVICE_KEY 미설정 — 샘플 날씨를 표시합니다.");
  }

  try {
    const nb = ncstBaseTime();
    const vb = vilageBase();

    const [ncst, fcst] = await Promise.all([
      callKma("getUltraSrtNcst", { base_date: nb.date, base_time: `${nb.hour}00` }, key),
      callKma("getVilageFcst", { base_date: vb.date, base_time: vb.time }, key),
    ]);

    const pick = (cat: string) =>
      ncst.find((i) => i.category === cat)?.obsrValue ?? null;
    const num = (v: string | null) => (v === null ? null : Number(v));

    // 예보는 (날짜+시각) 단위로 묶어서 앞 8개 구간만 사용
    const buckets = new Map<string, Record<string, string>>();
    for (const it of fcst) {
      if (!it.fcstDate || !it.fcstTime) continue;
      const k = `${it.fcstDate}${it.fcstTime}`;
      const b = buckets.get(k) ?? {};
      b[it.category] = it.fcstValue ?? "";
      buckets.set(k, b);
    }
    const forecast: WeatherForecastItem[] = [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 8)
      .map(([k, v]) => {
        const iso = `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}T${k.slice(8, 10)}:00:00+09:00`;
        return {
          time: new Date(iso).toISOString(),
          temp: v.TMP ? Number(v.TMP) : null,
          sky: SKY[v.SKY] ?? "-",
          precipitation: PTY[v.PTY] ?? "없음",
          pop: v.POP ? Number(v.POP) : null,
        };
      });

    const payload: WeatherPayload = {
      now: {
        temp: num(pick("T1H")),
        humidity: num(pick("REH")),
        rain1h: num(pick("RN1")),
        windSpeed: num(pick("WSD")),
        precipitation: PTY[pick("PTY") ?? "0"] ?? "없음",
        sky: forecast[0]?.sky ?? "-",
        observedAt: nowISO(),
      },
      forecast,
      source: "kma",
      updatedAt: nowISO(),
    };
    return ok(payload);
  } catch (e) {
    console.error("[weather]", e);
    return fail(sampleWeather(), "기상청 API 호출 실패 — 샘플 날씨를 표시합니다.");
  }
}
