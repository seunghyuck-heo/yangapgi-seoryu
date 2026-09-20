import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * OAuth(구글 등) 로그인 콜백.
 * 공급자에서 돌아온 code를 세션으로 교환한 뒤 설정 화면으로 리다이렉트합니다.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/settings";

  // Render/프록시 뒤에서는 request.url 이 내부 주소(localhost:10000)로 보이므로
  // 외부에서 접근한 실제 호스트를 우선 사용한다.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  const isLocalEnv = process.env.NODE_ENV === "development";
  const base = isLocalEnv
    ? origin
    : forwardedHost
      ? `${forwardedProto}://${forwardedHost}`
      : origin;

  if (code) {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${base}${next}`);
    }
  }

  return NextResponse.redirect(`${base}/settings?error=oauth`);
}
