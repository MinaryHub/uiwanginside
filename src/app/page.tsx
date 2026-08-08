import { Suspense } from "react";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

function Loading() {
  return (
    <div className="grid h-dvh place-items-center bg-[var(--background)]">
      <span className="text-sm text-[var(--muted)]">불러오는 중…</span>
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
