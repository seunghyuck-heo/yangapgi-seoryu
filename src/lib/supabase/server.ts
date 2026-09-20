import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const DOCUMENTS_BUCKET = "patient-documents";

/**
 * 서버(서버 컴포넌트 / 라우트 핸들러)용 Supabase 클라이언트.
 * 로그인 사용자 세션(쿠키)에 바인딩되어 RLS(계정별 소유자 격리)가 그대로 적용됩니다.
 */
export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // 서버 컴포넌트에서 set 호출 시 무시(미들웨어에서 세션 갱신 처리)
          }
        },
      },
    }
  );
}

/** 현재 로그인 사용자. 없으면 null */
export async function getCurrentUser() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
