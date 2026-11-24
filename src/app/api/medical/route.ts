import { XMLParser } from "fast-xml-parser";
import {
  timedFetch,
  ok,
  fail,
  nowISO,
  parseDataGoKr,
  normalizeServiceKey,
  asArray,
  kstDateParts,
} from "@/lib/fetcher";
import { fetchWithSharedCache } from "@/lib/sharedCache";
import type { DayHours, MedicalPayload, MedicalPlace } from "@/lib/types";

export const dynamic = "force-dynamic";

/** "지금 진료중" 판정이 시간에 의존하므로 CDN 캐시는 짧게(60초) 통일한다 */
const CDN_CACHE_SEC = 60;

const HOSPITAL =
  "https://apis.data.go.kr/B552657/HsptlAsembySearchService/getHsptlMdcncListInfoInqire";
const PHARMACY =
  "https://apis.data.go.kr/B552657/ErmctInsttInfoInqireService/getParmacyListInfoInqire";

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });

/** "0900" / "2500"(익일 01:00) 형태를 포함해 현재 진료 중인지 판정한다 */
function isOpenNow(
  todayStart?: string,
  todayClose?: string,
  prevStart?: string,
  prevClose?: string,
  nowHHMM?: number,
): boolean | null {
  if (nowHHMM == null) return null;

  // 전날 심야 진료가 자정을 넘겨 오늘 새벽까지 이어지는 경우 (예: 2000~2600 또는 2000~0200)
  if (prevStart && prevClose && nowHHMM < 600) {
    const ps = Number(prevStart);
    const pe = Number(prevClose);
    if (Number.isFinite(ps) && Number.isFinite(pe)) {
      if (pe > 2400 && nowHHMM < pe - 2400) return true;
      if (pe < ps && nowHHMM < pe) return true;
    }
  }

  if (!todayStart || !todayClose) return null;
  const s = Number(todayStart);
  const e = Number(todayClose);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
  // 2500 같은 24시 초과 표기도 nowHHMM >= s && nowHHMM < e 로 자연스럽게 처리된다
  return e >= s ? nowHHMM >= s && nowHHMM < e : nowHHMM >= s || nowHHMM < e;
}

function fmtTime(t?: string) {
  if (!t || t.trim().length < 3) return "";
  const p = t.trim().padStart(4, "0");
  return `${p.slice(0, 2)}:${p.slice(2, 4)}`;
}

function parseCoord(v?: string): number | null {
  if (!v || !v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

interface RawItem {
  dutyName?: string;
  dutyAddr?: string;
  dutyTel1?: string;
  wgs84Lat?: string;
  wgs84Lon?: string;
  hpid?: string;
  dutyDivNam?: string;
  [k: string]: string | undefined;
}

const PAGE = 100;
const MAX_PAGES = 5;

async function fetchList(
  url: string,
  key: string,
  kind: MedicalPlace["kind"],
  day: number,
  hhmm: number,
): Promise<MedicalPlace[]> {
  const out: MedicalPlace[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { places, total } = await fetchPage(url, key, kind, day, hhmm, page);
    out.push(...places);
    if (out.length >= total || places.length === 0) break;
  }
  return out;
}

async function fetchPage(
  url: string,
  key: string,
  kind: MedicalPlace["kind"],
  day: number,
  hhmm: number,
  page: number,
): Promise<{ places: MedicalPlace[]; total: number }> {
  const qs =
    `?serviceKey=${normalizeServiceKey(key)}&Q0=${encodeURIComponent("경기도")}` +
    `&Q1=${encodeURIComponent("의왕시")}&numOfRows=${PAGE}&pageNo=${page}`;
  const res = await timedFetch(`${url}${qs}`, {}, 15_000);
  const text = await res.text();

  if (text.includes("SERVICE_KEY_IS_NOT_REGISTERED")) {
    throw new Error("등록되지 않은 서비스키 — 해당 서비스 활용신청 필요");
  }
  if (text.trimStart().startsWith("{")) parseDataGoKr(text);

  const json = parser.parse(text);
  const header = json?.response?.header;
  if (header?.resultCode && String(header.resultCode) !== "00") {
    throw new Error(`${header.resultCode}: ${header.resultMsg}`);
  }

  const total = Number(json?.response?.body?.totalCount ?? 0);
  const items = asArray<RawItem>(json?.response?.body?.items?.item);
  const prevDay = day === 1 ? 7 : day - 1;

  const places = items.map((it): MedicalPlace => {
    const weeklyHours: Record<number, DayHours> = {};
    for (let d = 1; d <= 8; d++) {
      const s = fmtTime(it[`dutyTime${d}s`]);
      const c = fmtTime(it[`dutyTime${d}c`]);
      if (s && c) weeklyHours[d] = { start: s, close: c };
    }
    const start = it[`dutyTime${day}s`];
    const close = it[`dutyTime${day}c`];
    const pStart = it[`dutyTime${prevDay}s`];
    const pClose = it[`dutyTime${prevDay}c`];
    return {
      id: it.hpid ?? `${kind}-${it.dutyName}`,
      kind,
      name: it.dutyName ?? "",
      address: it.dutyAddr ?? "",
      phone: it.dutyTel1 ?? "",
      lat: parseCoord(it.wgs84Lat),
      lng: parseCoord(it.wgs84Lon),
      category: it.dutyDivNam ?? "",
      todayStart: fmtTime(start),
      todayClose: fmtTime(close),
      weeklyHours: Object.keys(weeklyHours).length > 0 ? weeklyHours : undefined,
      openNow: isOpenNow(start, close, pStart, pClose, hhmm),
    };
  });
  return { places, total: Number.isFinite(total) ? total : places.length };
}

const EMPTY: MedicalPayload = {
  places: [],
  day: 0,
  source: "nmc",
  updatedAt: "",
};

export async function GET() {
  const key = process.env.EMERGENCY_SERVICE_KEY ?? process.env.KMA_SERVICE_KEY;
  if (!key) {
    return fail(EMPTY, "응급의료 인증키가 설정되지 않았습니다.");
  }

  const { isoDow: day, hhmm } = kstDateParts();
  const prevDay = day === 1 ? 7 : day - 1;

  try {
    const cached = await fetchWithSharedCache<MedicalPayload>({
      key: `medical:d${day}`,
      // 병·의원/약국 진료시간표는 하루 동안 거의 바뀌지 않는다
      ttlMs: 30 * 60_000,
      staleMaxMs: 12 * 3600_000,
      failCooldownMs: 90_000,
      fetcher: async () => {
        const [hos, pha] = await Promise.allSettled([
          fetchList(HOSPITAL, key, "hospital", day, hhmm),
          fetchList(PHARMACY, key, "pharmacy", day, hhmm),
        ]);

        const places = [
          ...(hos.status === "fulfilled" ? hos.value : []),
          ...(pha.status === "fulfilled" ? pha.value : []),
        ].filter((p) => p.name);

        const failed: string[] = [];
        if (hos.status === "rejected") failed.push(`병·의원: ${reasonOf(hos.reason)}`);
        if (pha.status === "rejected") failed.push(`약국: ${reasonOf(pha.reason)}`);

        if (places.length === 0) {
          throw new Error(
            failed.length ? `응급의료 API — ${failed.join(" / ")}` : "의왕시 조회 결과가 없습니다.",
          );
        }

        const notice = failed.length ? `일부 미연동 — ${failed.join(" / ")}` : undefined;
        return {
          value: { places, day, source: "nmc", updatedAt: nowISO() },
          notice,
          customTtlMs: notice ? 2 * 60_000 : undefined,
        };
      },
    });

    // 캐시된 목록에 "지금 열림" 만 현재 시각으로 다시 계산한다
    const places = cached.value.places.map((p) => {
      const prev = p.weeklyHours?.[prevDay];
      return {
        ...p,
        openNow: isOpenNow(
          p.todayStart.replace(":", ""),
          p.todayClose.replace(":", ""),
          prev?.start.replace(":", ""),
          prev?.close.replace(":", ""),
          hhmm,
        ),
      };
    });

    return ok(
      { ...cached.value, places, updatedAt: nowISO() },
      cached.notice,
      cached.notice ? 60 : CDN_CACHE_SEC,
    );
  } catch (e) {
    console.error("[medical]", e);
    return fail(EMPTY, reasonOf(e));
  }
}

function reasonOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
