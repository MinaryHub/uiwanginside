import { ok, fail } from "@/lib/fetcher";
import { hasDb } from "@/lib/db";
import { collectStats, EMPTY_STATS } from "@/lib/stats";
import { matchesStatsToken } from "@/lib/statsToken";

export const dynamic = "force-dynamic";

/**
 * 비밀 주소로 여는 통계. 로그인을 거치지 않는다.
 *
 * 토큰이 틀리면 404 로 답한다 — 403 은 "여기 뭔가 있다" 를 알려주는 셈이라
 * 맞는 토큰을 찾아볼 이유를 준다.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!matchesStatsToken(token)) {
    return new Response("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  if (!hasDb()) return fail(EMPTY_STATS, "저장소가 연결되지 않았습니다.");
  try {
    return ok(await collectStats(), undefined, 0);
  } catch (e) {
    console.error("[stats:link]", e);
    return fail(EMPTY_STATS, "통계 조회에 일시 실패했습니다. 잠시 후 다시 시도하세요.");
  }
}
