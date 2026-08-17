import { ok, fail } from "@/lib/fetcher";
import { fetchSchool, type SchoolFacts } from "@/lib/neis";

export const dynamic = "force-dynamic";

/**
 * 학교 한 곳의 공개 정보.
 *
 * 카카오는 학교를 이름·주소·전화까지만 준다. 학부모가 알고 싶은 것은
 * 그다음이다 — 공립인가 사립인가, 남녀공학인가, 오늘 급식은 무엇인가.
 * 나이스 교육정보 개방 포털에서 가져온다.
 *
 * 학생수·진학률은 여기 없다. 학교알리미(EDSS) 키가 필요하다.
 */
const CACHE_SEC = 60 * 60;

export async function GET(req: Request) {
  const name = (new URL(req.url).searchParams.get("name") ?? "").trim().slice(0, 40);
  if (!name) return ok({ school: null as SchoolFacts | null }, undefined, CACHE_SEC);

  try {
    const school = await fetchSchool(name);
    return ok(
      { school },
      school ? undefined : "나이스에서 이 학교를 찾지 못했습니다.",
      CACHE_SEC,
    );
  } catch (e) {
    console.error("[school]", e);
    return fail({ school: null as SchoolFacts | null }, `학교 정보 조회 실패: ${e instanceof Error ? e.message : e}`);
  }
}
