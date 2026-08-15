import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import AdminClient from "@/components/AdminClient";

export const dynamic = "force-dynamic";

/**
 * 관리자 화면은 검색에 걸릴 이유가 없다.
 * 접근은 서버가 막지만, 목록에 오르는 것부터 막아 둔다.
 */
export const metadata: Metadata = {
  title: "접속 통계 — 의왕 인사이드",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <main className="mx-auto max-w-[900px] px-4 py-5">
      <header className="mb-4 flex items-center gap-2">
        <Link href="/" className="flex items-center gap-2">
          <Logo size={26} />
          <span className="text-[var(--text-base)] font-extrabold">접속 통계</span>
        </Link>
        <Link
          href="/status"
          className="ml-auto text-[var(--text-xs)] font-bold text-[var(--brand)] underline underline-offset-4"
        >
          연동 상태
        </Link>
      </header>
      <AdminClient />
    </main>
  );
}
