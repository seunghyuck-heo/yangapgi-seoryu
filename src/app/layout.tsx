import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

// Paperlogy — 앱 타이틀 전용 (본문은 globals.css의 Pretendard)
const paperlogy = localFont({
  variable: "--font-paperlogy",
  src: [
    { path: "./fonts/Paperlogy-7Bold.ttf", weight: "700", style: "normal" },
    { path: "./fonts/Paperlogy-8ExtraBold.ttf", weight: "800", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: "양압기 서류계약",
  description: "양압기 치료 서비스 계약서류 작성·관리 시스템",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "양압기 서류계약",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover" as const,
  interactiveWidget: "resizes-content" as const,
  // 삼성 One UI: theme_color가 '충분히 밝지' 않으면(예: #eef1f6) 하단 내비 아이콘이 흰색으로 남음.
  // 앱 배경(#eef1f6)과 거의 같은 '차가운 near-white'이면서 흰색에 충분히 가까운 값 → 아이콘 검정 + 상단도 앱색과 거의 동일.
  themeColor: "#f5f8fd",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={paperlogy.variable}>
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
