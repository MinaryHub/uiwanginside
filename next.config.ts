import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * 자체 호스팅(라즈베리파이)용 산출물.
   *
   * 실행에 필요한 파일과 의존성만 .next/standalone 에 모아 준다 —
   * node_modules 전체(수백 MB)를 파이로 옮기지 않아도 되고, 컨테이너
   * 이미지도 그만큼 작아진다. `node server.js` 로 그대로 실행된다.
   *
   * Vercel 에서는 끈다. Vercel 은 함수를 스스로 묶으므로 standalone 이
   * 필요 없고, Vercel 의 새 Next.js 어댑터(NEXT_ENABLE_ADAPTER=1)와 함께
   * 쓰면 standalone 복사 단계가 .next/next-server.js.nft.json 을 찾다가
   * ENOENT 로 빌드가 죽는다 (2026-11, Vercel CLI 65.15.0 · Next 16.3.0).
   * Vercel 은 빌드 때 VERCEL=1 을 넣는다. GitHub 의 도커 빌드에는 없다.
   */
  output: process.env.VERCEL ? undefined : "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
