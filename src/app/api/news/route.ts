import { timedFetch, ok, fail, nowISO } from "@/lib/fetcher";
import type { NewsPayload, NewsItem } from "@/lib/types";

export const dynamic = "force-dynamic";
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

function sampleNews(query: string): NewsPayload {
  const now = Date.now();
  const titles = [
    "의왕시, 왕송호수 일대 야간경관 조명 개선사업 착수",
    "의왕 백운밸리 교통체계 개편…출퇴근 정체 완화 기대",
    "의왕시 보건소, 여름철 감염병 예방 집중 홍보",
    "월곶~판교 복선전철 의왕 구간 공사 진행 현황 공개",
    "의왕시, 청년 월세 지원 신청 접수 시작",
  ];
  return {
    items: titles.map((t, i) => ({
      title: t,
      link: "https://www.uiwang.go.kr/",
      description: `${query} 관련 샘플 기사입니다. NAVER_CLIENT_ID/SECRET을 설정하면 실시간 뉴스가 표시됩니다.`,
      publishedAt: new Date(now - i * 3600_000 * 5).toISOString(),
      source: "sample",
    })),
    source: "sample",
    updatedAt: nowISO(),
  };
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const query = sp.get("q") ?? "의왕시";
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;

  if (!id || !secret) {
    return fail(
      sampleNews(query),
      "NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 미설정 — 샘플 뉴스를 표시합니다.",
    );
  }

  try {
    const url =
      `https://openapi.naver.com/v1/search/news.json` +
      `?query=${encodeURIComponent(query)}&display=20&sort=date`;
    const res = await timedFetch(url, {
      headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret },
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
    return ok({ items, source: "naver", updatedAt: nowISO() } satisfies NewsPayload);
  } catch (e) {
    console.error("[news]", e);
    return fail(sampleNews(query), "네이버 뉴스 API 호출 실패 — 샘플 뉴스를 표시합니다.");
  }
}
