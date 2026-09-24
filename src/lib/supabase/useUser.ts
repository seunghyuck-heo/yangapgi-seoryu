"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "./client";

// 세션 내 사용자 캐시 — 탭 이동으로 컴포넌트가 다시 마운트돼도
// 매번 로딩을 띄우지 않고 즉시 이전 사용자 상태를 보여준다(백그라운드 재검증).
let cachedUser: User | null = null;
let resolvedOnce = false;

/** 현재 로그인 사용자 상태(클라이언트). 로그인/로그아웃 시 자동 갱신 */
export function useUser() {
  const [user, setUser] = useState<User | null>(cachedUser);
  // 한 번이라도 확인했으면 캐시로 즉시 표시(로딩 스피너 없이)
  const [loading, setLoading] = useState(!resolvedOnce);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let ignore = false;

    const apply = (u: User | null) => {
      if (ignore) return;
      cachedUser = u;
      resolvedOnce = true;
      setUser(u);
      setLoading(false);
    };

    // 빠른 경로: 로컬 세션(네트워크 없음)으로 즉시 표시 — 첫 진입 로딩 단축
    if (!resolvedOnce) {
      supabase.auth.getSession().then(({ data }) => {
        if (ignore || resolvedOnce) return;
        setUser(data.session?.user ?? null);
        setLoading(false);
      });
    }

    // 검증 경로: getUser로 실제 검증 후 최종 반영
    supabase.auth.getUser().then(({ data }) => apply(data.user ?? null));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      apply(session?.user ?? null);
    });
    return () => {
      ignore = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}
