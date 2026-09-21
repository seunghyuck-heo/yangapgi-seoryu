import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * 구글 로그인 시작(서버 주도).
 * 클라이언트에서 이 경로(같은 출처/스코프)로 이동하면, 서버가 PKCE code_verifier를
 * 쿠키에 심고 구글 인증 URL로 302 리다이렉트한다.
 *
 * 중요: signInWithOAuth 가 심는 code_verifier 쿠키를 반드시 "구글로 보내는 리다이렉트
 * 응답"에 직접 실어야 한다. next/headers 로만 set 하면 커스텀 NextResponse.redirect 에
 * 누락될 수 있어, 콜백에서 verifier 가 없어 교환이 실패한다("Unable to exchange external code").
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const next = searchParams.get("next") ?? "/settings";

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  const isLocalEnv = process.env.NODE_ENV === "development";
  const base = isLocalEnv
    ? origin
    : forwardedHost
      ? `${forwardedProto}://${forwardedHost}`
      : origin;

  const cookieStore = await cookies();
  const pending: { name: string; value: string; options?: Record<string, unknown> }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          for (const c of cookiesToSet) pending.push(c);
        },
      },
    }
  );

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

  // code_verifier 쿠키를 구글 리다이렉트 응답에 직접 실어 보낸다
  const res = NextResponse.redirect(data.url);
  for (const { name, value, options } of pending) res.cookies.set(name, value, options);
  return res;
}
