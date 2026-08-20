import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * 자체 호스팅(라즈베리파이)용 산출물.
   *
   * 실행에 필요한 파일과 의존성만 .next/standalone 에 모아 준다 —
   * node_modules 전체(수백 MB)를 파이로 옮기지 않아도 되고, 컨테이너
   * 이미지도 그만큼 작아진다. `node server.js` 로 그대로 실행된다.
   */
  output: "standalone",
};

export default nextConfig;
