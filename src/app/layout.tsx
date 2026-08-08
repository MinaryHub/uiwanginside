import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "의왕 인사이드 — 의왕시 생활·실시간 정보 포털",
  description:
    "의왕시의 학교·병원·마트·편의점을 지도에서 찾고, 날씨·주요 뉴스·교통사고·정체·버스 도착정보를 실시간으로 확인하세요.",
  keywords: ["의왕시", "의왕", "지도", "실시간 교통", "버스 도착", "날씨", "생활정보"],
  openGraph: {
    title: "의왕 인사이드",
    description: "의왕시 생활·실시간 정보 포털",
    locale: "ko_KR",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f14" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
