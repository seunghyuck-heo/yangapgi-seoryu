import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // HTML 문서(페이지)는 브라우저/CDN이 캐시하지 않게 → 배포 즉시 반영, 폰에 옛 화면 안 남음.
        // 해시된 정적 자산(_next/static)·이미지·아이콘은 제외(파일명이 바뀌므로 캐시해도 안전).
        source: "/((?!_next/static|_next/image|icons/|documents/|favicon.ico|manifest.webmanifest|sw.js|robots.txt).*)",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
