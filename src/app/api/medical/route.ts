import { XMLParser } from "fast-xml-parser";
import {
  timedFetch,
  ok,
  fail,
  nowISO,
  createTtlCache,
  parseDataGoKr,
} from "@/lib/fetcher";
import type { MedicalPayload, MedicalPlace } from "@/lib/types";

export const dynamic = "force-dynamic";

/** 진료시간은 자주 바뀌지 않지만 "지금 열림" 판정이 시간에 의존하므로 짧게 */
const CACHE_SEC = 600;

/**
 * 국립중앙의료원 병·의원 / 약국 정보 (공공데이터포털 B552657).
 * 엔드포인트는 실제 호출로 확인했다. 미구독 시 403 +
 * SERVICE_KEY_IS_NOT_REGISTERED_ERROR 가 온다.
 */
const HOSPITAL =
  "https://apis.data.go.kr/B552657/HsptlAsembySearchService/getHsptlMdcncListInfoInqire";
const PHARMACY =
  "https://apis.data.go.kr/B552657/ErmctInsttInfoInqireService/getParmacyListInfoInqire";

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** KST 기준 요일(1=월 … 7=일)과 HHMM */
function kstNow() {
  const d = new Date(Date.now() + 9 * 3600_000);
  const dow = d.getUTCDay(); // 0=일
  return {
    /** 공공데이터 규격: 1~7 = 월~일 */
    day: dow === 0 ? 7 : dow,
    hhmm: d.getUTCHours() * 100 + d.getUTCMinutes(),
  };
}

/** "0900" 형태를 분 단위 숫자로. 자정 넘김(예: 2000~0200)도 처리한다. */
function isOpenNow(start?: string, end?: string, nowHHMM?: number): boolean | null {
  if (!start || !end || nowHHMM == null) return null;
  const s = Number(start);
  const e = Number(end);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
  // 종료가 시작보다 작으면 익일까지 운영하는 것으로 본다
  return e >= s ? nowHHMM >= s && nowHHMM < e : nowHHMM >= s || nowHHMM < e;
}

function fmtTime(t?: string) {
  if (!t || t.length < 3) return "";
  const p = t.padStart(4, "0");
  return `${p.slice(0, 2)}:${p.slice(2, 4)}`;
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

/** 한 번에 받을 수 있는 양. 의왕시 병·의원이 171곳이라 한 장으로 안 끝난다. */
const PAGE = 100;
/** 안전장치 — 응답이 이상해도 무한히 돌지 않는다 */
const MAX_PAGES = 5;

/**
 * 목록을 끝까지 받는다.
 *
 * 처음에는 100곳만 받고 있었다. 의왕시 병·의원은 171곳이라 71곳이 빠졌고,
 * 그만큼 지도에서 병원을 눌러도 진료시간이 붙지 않았다 (25곳 중 9곳).
 */
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
    `?serviceKey=${key}&Q0=${encodeURIComponent("경기도")}` +
    `&Q1=${encodeURIComponent("의왕시")}&numOfRows=${PAGE}&pageNo=${page}`;
  const res = await timedFetch(`${url}${qs}`, {}, 15_000);
  const text = await res.text();

  if (text.includes("SERVICE_KEY_IS_NOT_REGISTERED")) {
    throw new Error("등록되지 않은 서비스키 — 해당 서비스 활용신청 필요");
  }
  // 이 서비스는 정상 응답이 XML 이라 XML 파서를 쓰되,
  // 게이트웨이 오류(JSON 봉투)는 공용 파서로 먼저 걸러낸다.
  if (text.trimStart().startsWith("{")) parseDataGoKr(text);

  const json = parser.parse(text);
  const header = json?.response?.header;
  if (header?.resultCode && String(header.resultCode) !== "00") {
    throw new Error(`${header.resultCode}: ${header.resultMsg}`);
  }

  const total = Number(json?.response?.body?.totalCount ?? 0);
  const items = asArray<RawItem>(json?.response?.body?.items?.item);

  const places = items.map((it) => {
    // dutyTime{1..8}s / {1..8}c = 요일별 시작/종료. 8은 공휴일.
    const start = it[`dutyTime${day}s`];
    const close = it[`dutyTime${day}c`];
    return {
      id: it.hpid ?? `${kind}-${it.dutyName}`,
      kind,
      name: it.dutyName ?? "",
      address: it.dutyAddr ?? "",
      phone: it.dutyTel1 ?? "",
      lat: it.wgs84Lat ? Number(it.wgs84Lat) : null,
      lng: it.wgs84Lon ? Number(it.wgs84Lon) : null,
      category: it.dutyDivNam ?? "",
      todayStart: fmtTime(start),
      todayClose: fmtTime(close),
      openNow: isOpenNow(start, close, hhmm),
    };
  });
  return { places, total: Number.isFinite(total) ? total : places.length };
}

/** 데이터를 못 가져왔을 때 내보내는 빈 응답.
 * 존재하지 않는 병원을 만들어 보여주는 것은 위험하다. */
const EMPTY: MedicalPayload = {
  places: [],
  day: 0,
  source: "nmc",
  updatedAt: "",
};

const cache = createTtlCache<MedicalPayload>(10 * 60_000, 8);

export async function GET() {
  const key = process.env.EMERGENCY_SERVICE_KEY ?? process.env.KMA_SERVICE_KEY;
  if (!key) {
    return fail(EMPTY, "응급의료 인증키가 설정되지 않았습니다.");
  }

  const { day, hhmm } = kstNow();
  const cacheKey = `d${day}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    // 캐시된 목록에 "지금 열림" 만 다시 계산한다 (시간이 흐르므로)
    const places = cached.places.map((p) => ({
      ...p,
      openNow: isOpenNow(
        p.todayStart.replace(":", ""),
        p.todayClose.replace(":", ""),
        hhmm,
      ),
    }));
    return ok({ ...cached, places, updatedAt: nowISO() }, undefined, 60);
  }

  /*
   * 병·의원과 약국은 data.go.kr 에서 서로 다른 서비스다. 활용신청도 따로
   * 받아야 해서 한쪽만 승인된 기간이 생긴다. 실제로 그랬다 — 병·의원은
   * 열렸는데 약국이 아직이라, 함께 묶어 던지는 바람에 둘 다 사라졌다.
   * 따로 받아 되는 쪽은 보여주고, 안 되는 쪽만 이유를 적는다.
   */
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
    console.error("[medical]", failed.join(" / "));
    return fail(
      EMPTY,
      failed.length ? `응급의료 API — ${failed.join(" / ")}` : "의왕시 조회 결과가 없습니다.",
    );
  }

  const payload: MedicalPayload = { places, day, source: "nmc", updatedAt: nowISO() };
  cache.set(cacheKey, payload);
  // 한쪽만 되는 동안에도 무엇이 빠졌는지 화면에 남긴다
  return ok(payload, failed.length ? `일부 미연동 — ${failed.join(" / ")}` : undefined, CACHE_SEC);
}

function reasonOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
