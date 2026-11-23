import { createInFlight, createTtlCache, timedFetch } from "./fetcher";
import { dongFor, isInsideUiwang } from "./geo";
import type { LocalCurrencyMerchant, LocalCurrencyPayload } from "./types";

/**
 * 의왕사랑상품권(경기지역화폐) 가맹점 현황.
 *
 * 경기데이터드림 `RegionMnyFacltStus` (SIGUN_NM=의왕시) 를 기존 `GG_DATA_KEY` 로 조회한다.
 * 의왕시 가맹점은 수천 건 규모이므로 상위 3페이지(최대 900곳, 좌표 보유 우선)를
 * 6시간 캐시해 응답 속도와 메모리 사용량을 균형 있게 유지한다.
 */
const GG_ENDPOINT = "https://openapi.gg.go.kr/RegionMnyFacltStus";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";

const cache = createTtlCache<LocalCurrencyPayload>(6 * 3600_000, 2);
const inFlight = createInFlight<LocalCurrencyPayload>();

function classifyIndustry(indutype: string, name: string): LocalCurrencyMerchant["category"] {
  const hay = `${indutype} ${name}`;
  if (/카페|커피|제과|베이커리|빵|디저트|음료|차전문/.test(hay)) return "cafe";
  if (/음식|한식|중식|일식|양식|분식|치킨|피자|호프|주점|식당|고기|갈비|국밥|면/.test(hay)) {
    return "food";
  }
  if (/슈퍼|마트|편의점|농축수산|정육|청과|식료품|반찬/.test(hay)) return "mart";
  if (/병원|의원|약국|치과|한의원|동물병원|안경/.test(hay)) return "medical";
  return "life";
}

interface GgHeadRow {
  head?: Array<{ list_total_count?: number; RESULT?: { CODE?: string; MESSAGE?: string } }>;
  row?: Record<string, unknown>[];
}

async function fetchPage(ggKey: string, page: number, size: number) {
  const url = `${GG_ENDPOINT}?KEY=${encodeURIComponent(ggKey)}&Type=json&pIndex=${page}&pSize=${size}&SIGUN_NM=${encodeURIComponent("의왕시")}`;
  const res = await timedFetch(url, { headers: { "User-Agent": UA } }, 10_000);
  const text = await res.text();
  if (!res.ok || text.trimStart().startsWith("<") || text.includes("ERROR-")) {
    throw new Error(`경기데이터드림 지역화폐 조회 오류 (HTTP ${res.status})`);
  }
  const json = JSON.parse(text) as { RegionMnyFacltStus?: GgHeadRow[] };
  const blocks = json.RegionMnyFacltStus ?? [];
  const headBlock = blocks.find((b) => Array.isArray(b.head));
  const rowBlock = blocks.find((b) => Array.isArray(b.row));
  const totalCount = Number(headBlock?.head?.[0]?.list_total_count ?? 0);
  const rows = rowBlock?.row ?? [];
  return { totalCount, rows };
}

export async function fetchLocalCurrency(ggKey: string): Promise<LocalCurrencyPayload> {
  const hit = cache.get("uiwang");
  if (hit) return hit;

  return inFlight("uiwang", async () => {
    const pageSize = 300;
    const first = await fetchPage(ggKey, 1, pageSize);
    const totalCount = first.totalCount || first.rows.length;
    const pagesToFetch = Math.min(3, Math.ceil(totalCount / pageSize));

    const extraPages =
      pagesToFetch > 1
        ? await Promise.allSettled(
            Array.from({ length: pagesToFetch - 1 }, (_, i) => fetchPage(ggKey, i + 2, pageSize)),
          )
        : [];

    const allRows = [
      ...first.rows,
      ...extraPages.flatMap((r) => (r.status === "fulfilled" ? r.value.rows : [])),
    ];

    const seen = new Set<string>();
    const merchants: LocalCurrencyMerchant[] = [];

    for (let i = 0; i < allRows.length; i++) {
      const r = allRows[i];
      const name = String(r.CMPNM_NM ?? "").trim();
      if (!name) continue;

      const roadAddr = String(r.REFINE_ROADNM_ADDR ?? "").trim();
      const lotAddr = String(r.REFINE_LOTNO_ADDR ?? "").trim();
      const address = roadAddr || lotAddr;
      const dedupKey = `${name}|${address}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const latNum = Number(r.REFINE_WGS84_LAT);
      const lngNum = Number(r.REFINE_WGS84_LOGT);
      const hasCoord =
        Number.isFinite(latNum) &&
        Number.isFinite(lngNum) &&
        latNum !== 0 &&
        lngNum !== 0 &&
        isInsideUiwang(latNum, lngNum);

      const industry = String(r.INDUTYPE_NM ?? "").trim();
      const dong = (hasCoord ? dongFor(latNum, lngNum) : null) ?? "";

      merchants.push({
        id: `gg:lc:${i}:${name.slice(0, 16)}`,
        name,
        industry,
        category: classifyIndustry(industry, name),
        address,
        dong,
        lat: hasCoord ? latNum : null,
        lng: hasCoord ? lngNum : null,
        phone: String(r.TELNO ?? "").trim(),
      });
    }

    const payload: LocalCurrencyPayload = {
      merchants,
      totalCount: Math.max(totalCount, merchants.length),
      source: "gg",
      updatedAt: new Date().toISOString(),
    };
    cache.set("uiwang", payload);
    return payload;
  });
}
