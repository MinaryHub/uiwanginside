import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import Logo from "@/components/Logo";
import ListsClient from "@/components/ListsClient";

export const dynamic = "force-dynamic";

export default async function ListsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <main className="mx-auto max-w-[640px] px-4 py-5">
      <header className="mb-5 flex items-center gap-2">
        <Link href="/" className="flex items-center gap-2">
          <Logo size={26} />
          <span className="text-[var(--text-base)] font-extrabold">내 장소 리스트</span>
        </Link>
        <Link
          href="/gallery"
          className="ml-auto text-[var(--text-xs)] font-bold text-[var(--brand)] underline underline-offset-4"
        >
          내 사진
        </Link>
      </header>
      <ListsClient />
    </main>
  );
}
