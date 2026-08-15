import NextAuth from "next-auth";
import Kakao from "next-auth/providers/kakao";

/**
 * 카카오 로그인.
 *
 * DB 어댑터를 두지 않고 JWT 세션을 쓴다. 저장할 사용자 정보가
 * 카카오 계정 식별자·닉네임·프로필 이미지뿐이고, 사진은 이 식별자를
 * 외래키처럼 써서 별도 테이블에 담으면 충분하다. 어댑터를 붙이면
 * 계정·세션 테이블 네 개가 따라오는데 쓰지 않을 것들이다.
 *
 * 지도에 쓰는 카카오 JS 키와는 별개다. 로그인은 REST API 키 +
 * Client Secret 을 쓰고, 카카오 콘솔에서 '카카오 로그인' 을 켜고
 * Redirect URI 를 등록해야 동작한다.
 */
/**
 * Auth.js 는 실패를 CallbackRouteError 한 줄로 뭉뜽그리고 진짜 원인은
 * cause 안에 넣어둔다. 그대로 두면 로그만 보고는 무엇이 틀렸는지 알 수
 * 없어서, 카카오가 돌려준 응답까지 펼쳐 남긴다.
 *
 * 예: Client Secret 활성화를 켜둔 채 값을 안 보내면 카카오는
 *     KOE010 Bad client credentials 를 준다. 그 문자열이 보여야 한다.
 */
function unwrap(err: unknown, depth = 0): string {
  if (depth > 3 || err === null || err === undefined) return "";
  if (err instanceof Error) {
    const inner = unwrap((err as { cause?: unknown }).cause, depth + 1);
    return `${err.name}: ${err.message}${inner ? ` ← ${inner}` : ""}`;
  }
  if (typeof err === "object") {
    try {
      return JSON.stringify(err).slice(0, 500);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Kakao({
      clientId: process.env.KAKAO_CLIENT_ID,
      clientSecret: process.env.KAKAO_CLIENT_SECRET,
    }),
  ],
  logger: {
    error(err) {
      console.error("[auth:error]", unwrap(err));
    },
    warn(code) {
      console.warn("[auth:warn]", code);
    },
  },
  session: { strategy: "jwt" },
  callbacks: {
    // 카카오 사용자 식별자를 세션까지 실어 보낸다. 사진의 소유자 키로 쓴다.
    jwt({ token, profile }) {
      if (profile?.id) token.kakaoId = String(profile.id);
      return token;
    },
    session({ session, token }) {
      if (token.kakaoId) session.user.id = String(token.kakaoId);
      return session;
    },
  },
  pages: { signIn: "/login" },
});

/** 로그인한 사용자 id. 없으면 null */
export async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/**
 * 관리자 카카오 id 목록.
 *
 * 코드에 박아두지 않고 환경변수로 둔다. 관리자가 바뀔 때 배포하지 않아도
 * 되고, 저장소가 공개되어도 누가 관리자인지 드러나지 않는다.
 * 값을 넣지 않으면 관리자가 아무도 없다 — 비어 있을 때 전원 허용하는
 * 편의는 그대로 구멍이 된다.
 */
export function adminIds(): string[] {
  return (process.env.ADMIN_KAKAO_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function currentAdminId(): Promise<string | null> {
  const id = await currentUserId();
  return id && adminIds().includes(id) ? id : null;
}
