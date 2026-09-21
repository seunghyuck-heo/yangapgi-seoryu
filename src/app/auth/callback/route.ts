import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * OAuth(구글 등) 로그인 콜백.
 * 공급자에서 돌아온 code 를 세션으로 교환한 뒤 설정 화면으로 리다이렉트한다.
 * 교환으로 생기는 세션 쿠키를 반드시 최종 리다이렉트 응답에 직접 실어야 로그인이 유지된다.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/settings";
  const providerError = searchParams.get("error_description") || searchParams.get("error");

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

  const redirectWithCookies = (url: string) => {
    const res = NextResponse.redirect(url);
    for (const { name, value, options } of pending) res.cookies.set(name, value, options);
    return res;
  };
  const fail = (reason: string) =>
    redirectWithCookies(`${base}/settings?autherror=${encodeURIComponent(reason)}`);

  if (providerError) return fail(providerError);
  if (!code) return fail("코드가 전달되지 않았습니다");

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

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail(error.message);

  return redirectWithCookies(`${base}${next}`);
}
