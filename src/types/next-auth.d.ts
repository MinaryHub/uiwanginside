import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      /** 카카오 사용자 식별자. 사진 소유자 키로 쓴다. */
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    kakaoId?: string;
  }
}
