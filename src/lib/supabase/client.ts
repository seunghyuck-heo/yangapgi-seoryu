"use client";

import { createBrowserClient } from "@supabase/ssr";

/** 브라우저(클라이언트 컴포넌트)용 Supabase 클라이언트. anon key + 로그인 세션 사용 → RLS 적용 */
export function getSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
