import { redirect } from "next/navigation";
import { signIn, auth } from "@/lib/auth";
import Link from "next/link";
import Logo from "@/components/Logo";
import { AFTER_LOGIN, SHOW_PHOTOS } from "@/lib/features";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect(AFTER_LOGIN);

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-[340px] text-center">
        <div className="mb-5 flex justify-center">
          <Logo size={56} />
        </div>
        <h1 className="text-[var(--text-lg)] font-extrabold">의왕 인사이드</h1>
        <p className="mt-2 text-[var(--text-sm)] leading-relaxed text-[var(--text-muted)]">
          {SHOW_PHOTOS ? (
            <>
              로그인하면 의왕 곳곳에서 찍은 사진을
              <br />
              지도 위에 모아둘 수 있습니다.
            </>
          ) : (
            <>
              로그인하면 가볼 곳을 리스트로
              <br />
              모아둘 수 있습니다.
            </>
          )}
        </p>

        <form
          className="mt-7"
          action={async () => {
            "use server";
            await signIn("kakao", { redirectTo: AFTER_LOGIN });
          }}
        >
          <button
            type="submit"
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[var(--radius)] text-[var(--text-base)] font-extrabold"
            style={{ background: "#FEE500", color: "#191600" }}
          >
            카카오로 시작하기
          </button>
        </form>

        <p className="mt-5 text-[var(--text-2xs)] leading-relaxed text-[var(--text-faint)]">
          {SHOW_PHOTOS ? (
            <>
              사진은 본인만 볼 수 있고, 언제든 삭제할 수 있습니다.
              <br />
              의왕시 안에서 찍은 사진만 등록됩니다.
            </>
          ) : (
            <>
              만든 리스트는 본인만 볼 수 있고,
              <br />
              언제든 지울 수 있습니다.
            </>
          )}
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-[var(--text-xs)] font-bold text-[var(--brand)] underline underline-offset-4"
        >
          로그인 없이 둘러보기
        </Link>
      </div>
    </main>
  );
}
