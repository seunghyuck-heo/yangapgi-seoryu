import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// 로그인 강제 게이트 없음: 모든 페이지 접근 가능하되, 로그인 전에는 화면에서 잠금(정보 X, 입력 X).
// 데이터는 Supabase RLS로 계정별 보호됨. 여기서는 세션 쿠키만 갱신한다.
export async function proxy(request: NextRequest) {
  const { response } = await updateSession(request);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons).*)"],
};
