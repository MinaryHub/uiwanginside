import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Logo from "@/components/Logo";
import AdminClient from "@/components/AdminClient";
import { matchesStatsToken } from "@/lib/statsToken";

export const dynamic = "force-dynamic";

/**
 * 검색에 걸리면 비밀 주소가 아니게 된다.
 *
 * robots.txt 에는 적지 않는다 — 거기에 적는 순간 주소가 공개된다. 색인하지
 * 말라고만 알린다. 리퍼러도 끈다. 이 화면에서 밖으로 나가는 링크에 주소가
 * 묻어가지 않게 한다.
 */
export const metadata: Metadata = {
  title: "접속 통계 — 의왕 인사이드",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Props = { params: Promise<{ token: string }> };

export default async function StatsLinkPage({ params }: Props) {
  const { token } = await params;
  if (!matchesStatsToken(token)) notFound();

  return (
    <main className="mx-auto max-w-[900px] px-4 py-5">
      <header className="mb-4 flex items-center gap-2">
        <Link href="/" className="flex items-center gap-2">
          <Logo size={26} />
          <span className="text-[var(--text-base)] font-extrabold">접속 통계</span>
        </Link>
        <span className="ml-auto text-[var(--text-2xs)] font-bold text-[var(--text-muted)]">
          비밀 주소
        </span>
      </header>
      <AdminClient endpoint={`/api/stats/${encodeURIComponent(token)}`} />
    </main>
  );
}
