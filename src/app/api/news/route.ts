import { timedFetch, ok, fail, nowISO, createTtlCache } from "@/lib/fetcher";
import type { NewsPayload, NewsItem } from "@/lib/types";

export const dynamic = "force-dynamic";

const CACHE_SEC = 300;
const newsCache = createTtlCache<NewsPayload>(CACHE_SEC * 1000, 40);

function stripTags(s: string) {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function hostOf(link: string) {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function safeIsoDate(raw?: string): string {
  if (!raw) return nowISO();
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? new Date(ts).toISOString() : nowISO();
}

const EMPTY: NewsPayload = { items: [], source: "naver", updatedAt: "" };

const NCP_NEWS = "https://naverapihub.apigw.ntruss.com/search/v1/news";
const LEGACY_NEWS = "https://openapi.naver.com/v1/search/news.json";

function isNcpCredential(id: string, secret: string) {
  return secret.length > 20 || id.length === 10;
}

class HttpStatusError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const rawQuery = (sp.get("q") ?? "의왕시").trim().slice(0, 40) || "의왕시";
  // 의왕 포털 범위로 검색어를 제한해 외부 임의 검색 프록시 남용을 막는다
  const query = rawQuery.includes("의왕") ? rawQuery : `의왕 ${rawQuery}`;

  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;

  if (!id || !secret) {
    return fail(EMPTY, "네이버 검색 인증키가 설정되지 않았습니다.");
  }

  const cached = newsCache.get(query);
  if (cached) return ok(cached, undefined, CACHE_SEC);

  const useNcp = isNcpCredential(id, secret);

  try {
    const url = useNcp
      ? `${NCP_NEWS}?query=${encodeURIComponent(query)}&display=20&sort=date&format=json`
      : `${LEGACY_NEWS}?query=${encodeURIComponent(query)}&display=20&sort=date`;
    const res = await timedFetch(url, {
      headers: useNcp
        ? { "X-NCP-APIGW-API-KEY-ID": id, "X-NCP-APIGW-API-KEY": secret }
        : { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret },
    });
    if (!res.ok) {
      throw new HttpStatusError(res.status, `naver ${res.status}: ${(await res.text()).slice(0, 140)}`);
    }
    const json = (await res.json()) as {
      items?: { title?: string; link?: string; originallink?: string; description?: string; pubDate?: string }[];
    };
    const items: NewsItem[] = (json.items ?? []).map((it) => {
      const link = it.originallink || it.link || "";
      return {
        title: stripTags(it.title ?? ""),
        link,
        description: stripTags(it.description ?? ""),
        publishedAt: safeIsoDate(it.pubDate),
        source: hostOf(link),
      };
    });
    const payload: NewsPayload = { items, source: "naver", updatedAt: nowISO() };
    newsCache.set(query, payload);
    return ok(payload, undefined, CACHE_SEC);
  } catch (e) {
    console.error("[news]", e);
    const status = e instanceof HttpStatusError ? e.status : null;
    const reason =
      status === 401
        ? useNcp
          ? "인증 실패 (NCP 콘솔에서 NAVER API HUB > 검색 이용 신청 확인)"
          : "인증 실패 (Client ID/Secret 확인)"
        : status === 404
          ? "엔드포인트 없음 (검색 API 는 NCP NAVER API HUB 로 이전됨)"
          : "호출 실패";
    return fail(EMPTY, `네이버 뉴스 API ${reason}`);
  }
}
