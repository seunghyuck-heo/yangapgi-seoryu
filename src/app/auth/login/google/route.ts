import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * 구글 로그인 시작(서버 주도).
 * 클라이언트에서 이 경로(같은 출처/스코프)로 이동하면, 서버가 PKCE code_verifier를
 * 쿠키에 심고 구글 인증 URL로 302 리다이렉트한다.
 * 설치형 PWA(standalone)에서도 '같은 창 in-scope 이동 → 302 추적'이라 막히지 않는다.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const next = searchParams.get("next") ?? "/settings";

  // Render/프록시 뒤에서는 request.url 이 내부 주소(localhost:10000)라 실제 호스트 사용
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  const isLocalEnv = process.env.NODE_ENV === "development";
  const base = isLocalEnv
    ? origin
    : forwardedHost
      ? `${forwardedProto}://${forwardedHost}`
      : origin;

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${base}/auth/callback?next=${encodeURIComponent(next)}`,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    const reason = error?.message ?? "로그인 URL 생성 실패";
    return NextResponse.redirect(`${base}/settings?autherror=${encodeURIComponent(reason)}`);
  }

  return NextResponse.redirect(data.url);
}
