import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Logo from "@/components/Logo";
import Link from "next/link";
import SharedIntake from "@/components/SharedIntake";

export const dynamic = "force-dynamic";

export default async function SharePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <main className="mx-auto max-w-[560px] px-4 py-6">
      <header className="mb-5 flex items-center gap-2">
        <Link href="/" className="flex items-center gap-2">
          <Logo size={26} />
        </Link>
        <h1 className="text-[var(--text-base)] font-extrabold">공유받은 사진</h1>
        <Link
          href="/gallery"
          className="ml-auto text-[var(--text-xs)] font-bold text-[var(--brand)] underline underline-offset-4"
        >
          갤러리
        </Link>
      </header>
      <SharedIntake />
    </main>
  );
}
