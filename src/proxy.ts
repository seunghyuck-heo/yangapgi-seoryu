import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// 로그인 없이 접근 가능한 경로
const PUBLIC_PREFIXES = ["/login", "/signup", "/api/health"];
// Supabase Auth 콜백/인증 관련
const AUTH_PREFIXES = ["/api/auth", "/auth"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { response, user } = await updateSession(request);

  const isPublic =
    PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    AUTH_PREFIXES.some((p) => pathname.startsWith(p));

  if (isPublic) return response;

  if (!user) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons).*)"],
};
