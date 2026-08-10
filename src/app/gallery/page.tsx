import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import Link from "next/link";
import Logo from "@/components/Logo";
import GalleryClient from "@/components/GalleryClient";

export const dynamic = "force-dynamic";

export default async function GalleryPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <main className="mx-auto max-w-[720px] px-4 py-5">
      <header className="mb-5 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2">
          <Logo size={26} />
          <span className="text-[var(--text-base)] font-extrabold">내 사진</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[var(--text-xs)] text-[var(--text-muted)] sm:block">
            {session.user.name ?? "회원"}
          </span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="min-h-[40px] rounded-[var(--radius)] border border-[var(--border-strong)] px-3 text-[var(--text-xs)] font-bold"
            >
              로그아웃
            </button>
          </form>
        </div>
      </header>

      <GalleryClient />
    </main>
  );
}
