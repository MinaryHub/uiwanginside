import { Suspense } from "react";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

function Loading() {
  return (
    // --background·--muted 라는 토큰은 없다. 이름이 틀려 배경이 칠해지지
    // 않고 글자색도 기본값이라, 첫 화면이 흰 바탕으로 한 번 번쩍였다.
    <div className="grid h-dvh place-items-center bg-[var(--bg)]">
      <span className="text-[var(--text-sm)] text-[var(--text-muted)]">불러오는 중…</span>
    </div>
  );
}

export default function Home() {
  return (
    // Dashboard 가 useSearchParams 로 URL 상태를 복원하므로 Suspense 가 필요하다
    <Suspense fallback={<Loading />}>
      <Dashboard appKey={process.env.NEXT_PUBLIC_KAKAO_JS_KEY} />
    </Suspense>
  );
}
