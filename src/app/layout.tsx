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
  // 사용자 선택: 상단 상태바 배경을 앱 배경색(#eef1f6)과 동일하게 맞춤.
  // theme_color는 상단 상태바 배경 + 삼성 하단 내비 아이콘 색을 동시에 결정하므로,
  // 이 값(#eef1f6)에서는 하단 내비 아이콘이 흰색이 될 수 있음(상태바 일치를 우선함).
  themeColor: "#eef1f6",
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
