import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Suspense } from "react";
import ServiceWorker from "@/components/ServiceWorker";
import VisitTracker from "@/components/VisitTracker";

const SITE_URL = (
  process.env.PUBLIC_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "") ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
  "https://uiwanginside.vercel.app"
).replace(/\/+$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "의왕 인사이드 — 의왕시 공공데이터 지도",
  description:
    "흩어져 있는 의왕시 공공데이터를 지도 한 장에 모았습니다. 날씨·미세먼지·버스·의왕역 1호선·전기차 충전소·병원·약국·의왕사랑상품권·도서관·인구 통계를 로그인 없이 확인하세요.",
  alternates: {
    canonical: "/",
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "의왕 인사이드",
  },
  keywords: [
    "의왕시",
    "의왕",
    "의왕 인사이드",
    "공공데이터",
    "의왕역 1호선",
    "의왕 버스 도착",
    "의왕사랑상품권",
    "의왕 전기차 충전소",
    "의왕 병원 약국",
    "의왕 날씨 미세먼지",
  ],
  openGraph: {
    title: "의왕 인사이드 — 의왕시 공공데이터 지도",
    description:
      "날씨·미세먼지·버스·의왕역 1호선·병원·전기차 충전소·의왕사랑상품권·도서관을 로그인 없이 지도 한 장에.",
    url: SITE_URL,
    siteName: "의왕 인사이드",
    locale: "ko_KR",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "의왕 인사이드 — 흩어져 있는 의왕시 공공데이터를 지도 한 장에",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "의왕 인사이드 — 의왕시 공공데이터 지도",
    description: "의왕시 실시간 공공데이터를 로그인 없이 지도 한 장에",
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // 확대를 막지 않는다. 글자를 키운 취지와 어긋나고, 저시력 이용자에게
  // 핀치 줌은 마지막 수단이다.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fff6e6" },
    { media: "(prefers-color-scheme: dark)", color: "#1f1b2e" },
  ],
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "의왕 인사이드",
  alternateName: "Uiwang Inside",
  url: SITE_URL,
  description:
    "경기도 의왕시의 날씨·미세먼지·버스·의왕역 1호선·병원·약국·전기차 충전소·쉼터·도서관·의왕사랑상품권·인구·산업 공공데이터를 지도 한 장에 모아 제공하는 시민 포털",
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "All",
  inLanguage: "ko-KR",
  isAccessibleForFree: true,
  areaServed: {
    "@type": "City",
    name: "의왕시",
    addressRegion: "경기도",
    addressCountry: "KR",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
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
