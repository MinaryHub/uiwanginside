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
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Kakao({
      clientId: process.env.KAKAO_CLIENT_ID,
      clientSecret: process.env.KAKAO_CLIENT_SECRET,
    }),
  ],
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
