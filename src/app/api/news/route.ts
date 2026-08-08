import { timedFetch, ok, fail, nowISO } from "@/lib/fetcher";
import type { NewsPayload, NewsItem } from "@/lib/types";

export const dynamic = "force-dynamic";

/** CDN 캐시 수명(초) — 뉴스는 5분이면 충분 */
const CACHE_SEC = 300;
export const revalidate = 0;

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

/** 데이터를 못 가져왔을 때 내보내는 빈 응답 */
const EMPTY: NewsPayload = { items: [], source: "naver", updatedAt: "" };

/**
 * 검색 API 는 네이버 클라우드 플랫폼의 NAVER API HUB 로 이전됐다.
 * 구 developers.naver.com(openapi.naver.com + X-Naver-Client-*) 자격증명도
 * 아직 쓰는 곳이 있어 둘 다 지원한다.
 * https://api.ncloud-docs.com/docs/naver-api-hub-search-news
 */
const NCP_NEWS = "https://naverapihub.apigw.ntruss.com/search/v1/news";
const LEGACY_NEWS = "https://openapi.naver.com/v1/search/news.json";

/** NCP 키는 ID 10자 + Secret 40자, 구 개발자센터 키는 Secret 10자 */
function isNcpCredential(id: string, secret: string) {
  return secret.length > 20 || id.length === 10;
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const query = sp.get("q") ?? "의왕시";
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;

  if (!id || !secret) {
    return fail(EMPTY, "네이버 검색 인증키가 설정되지 않았습니다.");
  }

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
    if (!res.ok) throw new Error(`naver ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as {
      items: { title: string; link: string; originallink: string; description: string; pubDate: string }[];
    };
    const items: NewsItem[] = json.items.map((it) => {
      const link = it.originallink || it.link;
      return {
        title: stripTags(it.title),
        link,
        description: stripTags(it.description),
        publishedAt: new Date(it.pubDate).toISOString(),
        source: hostOf(link),
      };
    });
    return ok(
      { items, source: "naver", updatedAt: nowISO() } satisfies NewsPayload,
      undefined,
      CACHE_SEC,
    );
  } catch (e) {
    console.error("[news]", e);
    const m = e instanceof Error ? e.message : "";
    const reason = m.includes("401")
      ? useNcp
        ? "인증 실패 (NCP 콘솔에서 NAVER API HUB > 검색 이용 신청 확인)"
        : "인증 실패 (Client ID/Secret 확인)"
      : m.includes("404")
        ? "엔드포인트 없음 (검색 API 는 NCP NAVER API HUB 로 이전됨)"
        : "호출 실패";
    return fail(EMPTY, `네이버 뉴스 API ${reason}`);
  }
}
