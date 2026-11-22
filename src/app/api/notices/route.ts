import {
  createInFlight,
  createTtlCache,
  fail,
  ok,
  timedFetch,
} from "@/lib/fetcher";
import type { CityNoticeItem, CityNoticeKind, NoticesPayload } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

/**
 * 의왕시 공지 · 행사 · 모집 소식.
 *
 * 1) 경기데이터드림 문화행사 현황(`openapi.gg.go.kr/GGCULTUREVENTSTUS`)에서
 *    의왕 관련 행사를 추출하고,
 * 2) 네이버 뉴스 검색 API(`NAVER_CLIENT_ID`/`SECRET`)로 의왕시청 공식 보도자료·
 *    모집·공고 기사를 함께 묶어 카테고리별로 정리한다.
 */
const GG_EVENTS = "https://openapi.gg.go.kr/GGCULTUREVENTSTUS";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";

const cache = createTtlCache<NoticesPayload>(10 * 60_000, 2);
const inFlight = createInFlight<NoticesPayload>();

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function classify(title: string, desc: string): CityNoticeKind {
  const text = `${title} ${desc}`;
  if (/모집|채용|지원금|신청|접수|공모|장학|수강|강좌/.test(text)) return "recruit";
  if (/축제|행사|공연|전시|음악회|체험|박람회|마라톤|걷기/.test(text)) return "event";
  return "notice";
}

function safeIso(raw: string): string {
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString();
}

async function fetchGgEvents(ggKey: string): Promise<CityNoticeItem[]> {
  const url = `${GG_EVENTS}?KEY=${encodeURIComponent(ggKey)}&Type=json&pIndex=1&pSize=200`;
  const res = await timedFetch(url, { headers: { "User-Agent": UA } }, 10_000);
  const text = await res.text();
  if (!res.ok || text.trimStart().startsWith("<") || text.includes("ERROR-")) {
    throw new Error("경기데이터드림 문화행사 조회 실패");
  }
  const json = JSON.parse(text) as Record<string, unknown[]>;
  const rootKey = Object.keys(json)[0];
  const blocks = (json[rootKey] ?? []) as Record<string, unknown>[];
  const rowBlock = blocks.find((b) => "row" in b);
  const rows = ((rowBlock?.row ?? []) as Record<string, unknown>[]) ?? [];

  const todayYmd = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const items: CityNoticeItem[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const title = String(r.TITLE ?? r.EVENT_NM ?? "").trim();
    const inst = String(r.INST_NM ?? r.HOST_INST_NM ?? "").trim();
    const place = String(r.PLACE ?? r.EVENT_PLC ?? "").trim();
    const hay = `${title} ${inst} ${place}`;
    if (!title || !hay.includes("의왕")) continue;

    const begin = String(r.BEGIN_DE ?? r.STRT_DE ?? "").trim();
    const end = String(r.END_DE ?? "").trim();
    // 이미 한 달 이상 지난 행사는 제외
    if (end && end < todayYmd && end.length === 10) continue;

    const urlStr = String(r.URL ?? r.HMPG_ADDR ?? "").trim();
    items.push({
      id: `gg:evt:${i}:${title.slice(0, 24)}`,
      kind: "event",
      title,
      summary: String(r.CATEGORY_NM ?? r.EVENT_TM_INFO ?? "").trim(),
      period: begin && end ? `${begin} ~ ${end}` : begin || end,
      place,
      fee: String(r.PARTCPT_EXPN_INFO ?? r.USE_FEE_INFO ?? "").trim(),
      source: inst || "경기도 문화행사",
      publishedAt: safeIso(begin || new Date().toISOString()),
      url: /^https?:\/\//i.test(urlStr) ? urlStr : "https://www.uiwang.go.kr",
    });
  }
  return items.slice(0, 12);
}

interface NaverItem {
  title: string;
  originallink: string;
  link: string;
  description: string;
  pubDate: string;
}

async function fetchMunicipalNews(clientId: string, clientSecret: string): Promise<CityNoticeItem[]> {
  const query = "의왕시 (모집 OR 행사 OR 공고 OR 지원 OR 개관 OR 축제)";
  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=18&sort=date`;
  const res = await timedFetch(
    url,
    {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    },
    8_000,
  );
  if (!res.ok) throw new Error(`네이버 뉴스 HTTP ${res.status}`);
  const json = (await res.json()) as { items?: NaverItem[] };
  const raw = json.items ?? [];

  const seen = new Set<string>();
  const out: CityNoticeItem[] = [];
  for (let i = 0; i < raw.length; i++) {
    const it = raw[i];
    const title = stripHtml(it.title);
    const desc = stripHtml(it.description);
    if (!title || (!title.includes("의왕") && !desc.includes("의왕시"))) continue;
    const key = title.slice(0, 20);
    if (seen.has(key)) continue;
    seen.add(key);

    const link = it.originallink || it.link;
    let host = "지역 보도";
    try {
      host = new URL(link).hostname.replace(/^www\./, "");
    } catch {
      /* ignore */
    }

    out.push({
      id: `nv:notice:${i}:${key}`,
      kind: classify(title, desc),
      title,
      summary: desc,
      period: "",
      place: "",
      fee: "",
      source: host,
      publishedAt: safeIso(it.pubDate),
      url: link,
    });
  }
  return out.slice(0, 12);
}

const EMPTY = (): NoticesPayload => ({
  items: [],
  source: "naver",
  updatedAt: new Date().toISOString(),
});

export async function GET() {
  const ggKey = process.env.GG_DATA_KEY;
  const naverId = process.env.NAVER_CLIENT_ID;
  const naverSecret = process.env.NAVER_CLIENT_SECRET;

  if (!ggKey && (!naverId || !naverSecret)) {
    return fail(EMPTY(), "GG_DATA_KEY 또는 NAVER_CLIENT_ID/SECRET 이 설정되지 않았습니다.");
  }

  const hit = cache.get("uiwang");
  if (hit) {
    return ok(hit, undefined, 300);
  }

  try {
    const payload = await inFlight("uiwang", async () => {
      const [ggRes, nvRes] = await Promise.allSettled([
        ggKey ? fetchGgEvents(ggKey) : Promise.resolve([]),
        naverId && naverSecret ? fetchMunicipalNews(naverId, naverSecret) : Promise.resolve([]),
      ]);

      const ggItems = ggRes.status === "fulfilled" ? ggRes.value : [];
      const nvItems = nvRes.status === "fulfilled" ? nvRes.value : [];

      if (ggItems.length === 0 && nvItems.length === 0) {
        const err =
          (ggRes.status === "rejected" && ggRes.reason) ||
          (nvRes.status === "rejected" && nvRes.reason);
        if (err) throw err;
      }

      const source: NoticesPayload["source"] =
        ggItems.length > 0 && nvItems.length > 0
          ? "gg+naver"
          : ggItems.length > 0
            ? "gg"
            : "naver";

      const result: NoticesPayload = {
        items: [...ggItems, ...nvItems],
        source,
        updatedAt: new Date().toISOString(),
      };
      cache.set("uiwang", result);
      return result;
    });

    return ok(payload, undefined, 300);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(EMPTY(), `시정 공지·행사 조회 실패: ${message}`);
  }
}
