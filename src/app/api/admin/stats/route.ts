import { ok, fail } from "@/lib/fetcher";
import { hasDb } from "@/lib/db";
import { currentAdminId, currentUserId, adminIds } from "@/lib/auth";
import { collectStats, EMPTY_STATS } from "@/lib/stats";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasDb()) return fail(EMPTY_STATS, "저장소가 연결되지 않았습니다.");

  const admin = await currentAdminId();
  if (!admin) {
    // 왜 못 보는지 알려준다. 그냥 막으면 무엇을 해야 할지 알 수 없다.
    const me = await currentUserId();
    if (!me) return Response.json({ ok: false, reason: "login" }, { status: 401 });
    return Response.json(
      {
        ok: false,
        reason: adminIds().length === 0 ? "unset" : "forbidden",
        // 자기 자신의 id 만 알려준다. 관리자 목록은 내보내지 않는다.
        yourId: me,
      },
      { status: 403 },
    );
  }

  try {
    return ok(await collectStats(), undefined, 0);
  } catch (e) {
    console.error("[admin:stats]", e);
    return fail(EMPTY_STATS, `통계 조회 실패: ${e instanceof Error ? e.message : e}`);
  }
}
