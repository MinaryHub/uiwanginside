export const dynamic = "force-dynamic";

/**
 * 지금 도는 것이 어느 커밋인지.
 *
 * 자체 호스팅에는 "배포 목록" 같은 화면이 없다. 올렸는지 안 올렸는지 몰라
 * 같은 것을 두 번 올리거나, 안 올려 놓고 왜 안 바뀌냐고 헤매게 된다.
 * 배포 스크립트가 올리기 전후로 이 값을 읽어 확인한다.
 *
 * 커밋 해시만 내보낸다. 그것만으로는 저장소에 닿을 수 없고, 무엇이 도는지
 * 아는 것이 숨기는 것보다 쓸모 있다.
 */
export function GET() {
  return Response.json(
    {
      sha: process.env.BUILD_SHA ?? "unknown",
      builtAt: process.env.BUILT_AT ?? "unknown",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
