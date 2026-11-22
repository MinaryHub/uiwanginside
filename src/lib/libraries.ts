import {
  createInFlight,
  createTtlCache,
  normalizeServiceKey,
  timedFetch,
} from "./fetcher";
import { dongFor, isInsideUiwang as inUiwang } from "./geo";
import type { LibrariesPayload, LibraryItem } from "./types";

/**
 * 의왕시 공공도서관 현황.
 *
 * 1순위: 경기데이터드림 공공도서관 현황 (`openapi.gg.go.kr/PublicLbrry`, GG_DATA_KEY)
 *        — 좌표·운영시간·휴관일·좌석수·장서수·홈페이지까지 한 번에 제공한다.
 * 2순위: 공공데이터포털 경기도 의왕시_관내 도서관 (`15136382`, ODCloud OAS 자동탐색,
 *        LIBRARY_SERVICE_KEY 또는 KMA_SERVICE_KEY).
 */
const GG_LIBRARY = "https://openapi.gg.go.kr/PublicLbrry";
const ODCLOUD_OAS = "https://infuser.odcloud.kr/oas/docs?namespace=15136382/v1";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";

const cache = createTtlCache<LibrariesPayload>(12 * 3600_000, 2);
const inFlight = createInFlight<LibrariesPayload>();

function normalizeHomepage(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(s)) return `https://${s}`;
  return "";
}

async function fetchFromGg(ggKey: string): Promise<LibrariesPayload> {
  const url =
    `${GG_LIBRARY}?KEY=${encodeURIComponent(ggKey)}&Type=json&pIndex=1&pSize=100` +
    `&SIGUN_NM=${encodeURIComponent("의왕시")}`;
  const res = await timedFetch(url, { headers: { "User-Agent": UA } }, 12_000);
  const text = await res.text();
  if (text.includes("RESULT") && text.includes("ERROR-")) {
    const m = /"CODE":"(ERROR-[^"]+)","MESSAGE":"([^"]*)"/.exec(text);
    throw new Error(m ? `${m[1]}: ${m[2]}` : "경기데이터드림 도서관 API 오류");
  }
  if (text.trimStart().startsWith("<")) {
    throw new Error("경기데이터드림 요청 차단");
  }

  const json = JSON.parse(text) as Record<string, unknown[]>;
  const rootKey = Object.keys(json)[0];
  const blocks = (json[rootKey] ?? []) as Record<string, unknown>[];
  const rowBlock = blocks.find((b) => "row" in b);
  const rows = ((rowBlock?.row ?? []) as Record<string, unknown>[]) ?? [];

  const libraries: LibraryItem[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const name = String(r.LIBRRY_NM ?? r.LBRRY_NM ?? "").trim();
    if (!name) continue;
    const lat = Number(r.REFINE_WGS84_LAT ?? r.WGS84_LAT);
    const lng = Number(r.REFINE_WGS84_LOGT ?? r.WGS84_LOGT);
    const hasCoord = Number.isFinite(lat) && Number.isFinite(lng) && inUiwang(lat, lng);

    const seats = Number(r.READROOM_SEAT_CNT ?? r.SEAT_CNT);
    const books = Number(r.BOOK_DATA_CNT ?? r.DATA_CNT);
    const wkStart = String(r.WKDAY_OPER_BEGIN_TM ?? "").trim();
    const wkEnd = String(r.WKDAY_OPER_END_TM ?? "").trim();
    const satStart = String(r.SAT_OPER_BEGIN_TM ?? "").trim();
    const satEnd = String(r.SAT_OPER_END_TM ?? "").trim();

    libraries.push({
      id: `gg:lib:${i}:${name}`,
      name,
      kind: String(r.LIBRRY_TY_NM ?? r.LBRRY_SE_NM ?? "공공도서관").trim(),
      address: String(r.REFINE_ROADNM_ADDR ?? r.REFINE_LOTNO_ADDR ?? "").trim(),
      phone: String(r.TELNO ?? "").trim(),
      lat: hasCoord ? lat : null,
      lng: hasCoord ? lng : null,
      dong: hasCoord ? (dongFor(lat, lng) ?? "") : "",
      seats: Number.isFinite(seats) && seats > 0 ? seats : null,
      books: Number.isFinite(books) && books > 0 ? books : null,
      weekdayHours: wkStart && wkEnd ? `${wkStart}~${wkEnd}` : "",
      weekendHours: satStart && satEnd ? `${satStart}~${satEnd}` : "",
      closedDays: String(r.RECES_DAY_INFO ?? r.CLOSE_DAY ?? "").trim(),
      homepage: normalizeHomepage(String(r.HMPG_ADDR ?? "")),
    });
  }

  return {
    libraries: libraries.sort((a, b) => a.name.localeCompare(b.name, "ko")),
    source: "gg",
    updatedAt: new Date().toISOString(),
  };
}

async function fetchFromOdcloud(rawKey: string): Promise<LibrariesPayload> {
  const oasRes = await timedFetch(ODCLOUD_OAS, {}, 8_000);
  if (!oasRes.ok) throw new Error(`OAS HTTP ${oasRes.status}`);
  const oas = (await oasRes.json()) as { paths?: Record<string, unknown> };
  const path = Object.keys(oas.paths ?? {})[0];
  if (!path) throw new Error("의왕시 도서관 API 경로를 찾지 못했습니다");

  const key = normalizeServiceKey(rawKey);
  const url = `https://api.odcloud.kr/api${path}?page=1&perPage=100&serviceKey=${key}`;
  const res = await timedFetch(url, {}, 10_000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { data?: Record<string, unknown>[] };
  const rows = json.data ?? [];

  const libraries: LibraryItem[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const name = String(r["도서관명"] ?? r["시설명"] ?? "").trim();
    if (!name) continue;
    const lat = Number(r["위도"]);
    const lng = Number(r["경도"]);
    const hasCoord = Number.isFinite(lat) && Number.isFinite(lng) && inUiwang(lat, lng);
    const seats = Number(String(r["좌석수"] ?? r["열람좌석수"] ?? "").replace(/[^0-9]/g, ""));
    libraries.push({
      id: `od:lib:${i}:${name}`,
      name,
      kind: String(r["구분"] ?? "공공도서관").trim(),
      address: String(r["소재지"] ?? r["도로명주소"] ?? r["주소"] ?? "").trim(),
      phone: String(r["연락처"] ?? r["전화번호"] ?? "").trim(),
      lat: hasCoord ? lat : null,
      lng: hasCoord ? lng : null,
      dong: hasCoord ? (dongFor(lat, lng) ?? "") : "",
      seats: Number.isFinite(seats) && seats > 0 ? seats : null,
      books: null,
      weekdayHours: String(r["운영시간"] ?? "").trim(),
      weekendHours: "",
      closedDays: String(r["휴관일"] ?? "").trim(),
      homepage: normalizeHomepage(String(r["홈페이지"] ?? "https://www.uwlib.or.kr")),
    });
  }

  return {
    libraries: libraries.sort((a, b) => a.name.localeCompare(b.name, "ko")),
    source: "odcloud",
    updatedAt: new Date().toISOString(),
  };
}

export async function fetchUiwangLibraries(opts: {
  ggKey?: string;
  odcloudKey?: string;
}): Promise<LibrariesPayload> {
  const hit = cache.get("uiwang");
  if (hit) return hit;

  return inFlight("uiwang", async () => {
    let lastErr: unknown;
    if (opts.ggKey) {
      try {
        const data = await fetchFromGg(opts.ggKey);
        if (data.libraries.length > 0) {
          cache.set("uiwang", data);
          return data;
        }
      } catch (e) {
        lastErr = e;
      }
    }
    if (opts.odcloudKey) {
      const data = await fetchFromOdcloud(opts.odcloudKey);
      cache.set("uiwang", data);
      return data;
    }
    throw lastErr ?? new Error("도서관 API 키가 설정되지 않았습니다");
  });
}
