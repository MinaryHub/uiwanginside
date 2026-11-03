import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Suspense } from "react";
import ServiceWorker from "@/components/ServiceWorker";
import VisitTracker from "@/components/VisitTracker";

export const metadata: Metadata = {
  title: "의왕 인사이드 — 의왕시 공공데이터 지도",
  description:
    "흩어져 있는 의왕시 공공데이터를 지도 한 장에 모았습니다. 날씨·미세먼지·버스 도착·교통 돌발·진료 중 병원·약국·공원·주차장·인구 통계를 로그인 없이 확인하세요.",
  manifest: "/manifest.webmanifest",
  keywords: ["의왕시", "의왕", "공공데이터", "지도", "실시간 교통", "버스 도착", "날씨", "미세먼지", "생활정보"],
  openGraph: {
    title: "의왕 인사이드",
    description: "의왕시 공공데이터 지도",
    locale: "ko_KR",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 확대를 막지 않는다. 글자를 키운 취지와 어긋나고, 저시력 이용자에게
  // 핀치 줌은 마지막 수단이다.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f4f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1319" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="antialiased">
        {children}
        {/* 예전 사진 공유용 서비스워커를 걷어낸다 */}
        <ServiceWorker />
        {/* useSearchParams 를 쓰므로 Suspense 로 감싸야 정적 생성이 막히지 않는다 */}
        <Suspense fallback={null}>
          <VisitTracker />
        </Suspense>
      </body>
    </html>
  );
}
