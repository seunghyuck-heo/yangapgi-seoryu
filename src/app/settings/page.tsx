"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BottomTabs from "@/components/BottomTabs";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/supabase/useUser";

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading } = useUser();

  // 로그인/회원가입 폼 상태 (로그아웃 상태에서 사용)
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 로그인 상태: 프로필 이름 로드/저장
  const [profileName, setProfileName] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.from("profiles").select("name").eq("id", user.id).maybeSingle();
      setProfileName(data?.name ?? (user.user_metadata?.name as string) ?? "");
    })();
  }, [user]);

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const supabase = getSupabaseBrowserClient();
      if (authMode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setError(
            error.message.includes("Invalid login")
              ? "이메일 또는 비밀번호가 올바르지 않습니다"
              : error.message
          );
          return;
        }
        router.refresh();
      } else {
        if (password.length < 6) {
          setError("비밀번호는 6자 이상이어야 합니다");
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name } },
        });
        if (error) {
          setError(error.message);
          return;
        }
        if (data.session) {
          router.refresh();
        } else {
          setInfo("가입 확인 메일을 보냈습니다. 메일의 링크로 인증 후 로그인해 주세요.");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveName() {
    if (!user) return;
    setBusy(true);
    setSaved(false);
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.from("profiles").upsert({ id: user.id, name: profileName, updated_at: new Date().toISOString() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.refresh();
  }

  return (
    <div className="tab-page">
      <header className="app-header">
        <h1 className="app-header__title" style={{ fontFamily: "var(--font-body)", fontWeight: 700 }}>
          설정
        </h1>
      </header>

      <div className="tab-page__body">
        {loading ? (
          <p className="muted-text">불러오는 중...</p>
        ) : user ? (
          /* ── 로그인 상태 ── */
          <>
            <section className="settings-group">
              <h2 className="section-heading">로그인 정보</h2>
              <div className="settings-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
                <input type="email" value={user.email ?? ""} readOnly placeholder="이메일" style={{ background: "var(--bg-soft)" }} />
                <input type="text" value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="이름" />
              </div>
            </section>
            <button type="button" className="primary" onClick={handleSaveName} disabled={busy} style={{ width: "100%", padding: 16, fontSize: 16, fontWeight: 700 }}>
              {busy ? "저장 중..." : saved ? "저장됨 ✓" : "저장"}
            </button>
            <button type="button" onClick={handleLogout} style={{ width: "100%", padding: 14, marginTop: 4, color: "var(--danger)", fontWeight: 600 }}>
              로그아웃
            </button>
          </>
        ) : (
          /* ── 로그아웃 상태: 로그인 / 계정 만들기 ── */
          <section className="settings-group">
            <h2 className="section-heading">{authMode === "login" ? "로그인" : "계정 만들기"}</h2>
            <form className="settings-card" onSubmit={handleAuth} style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
              {authMode === "signup" && (
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="이름 (또는 병원명)" />
              )}
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일" autoComplete="email" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={authMode === "signup" ? "비밀번호 (6자 이상)" : "비밀번호"}
                autoComplete={authMode === "signup" ? "new-password" : "current-password"}
              />
              {error && <div className="error-banner">{error}</div>}
              {info && (
                <div className="error-banner" style={{ background: "var(--brand-soft)", color: "var(--brand-dark)", borderColor: "transparent" }}>
                  {info}
                </div>
              )}
              <button type="submit" className="primary" disabled={busy} style={{ padding: 16, fontSize: 16, fontWeight: 700 }}>
                {busy ? "처리 중..." : authMode === "login" ? "로그인" : "계정 만들기"}
              </button>
            </form>
            <p style={{ textAlign: "center", fontSize: 13, marginTop: 12, color: "var(--ink-soft)" }}>
              {authMode === "login" ? "계정이 없으신가요? " : "이미 계정이 있으신가요? "}
              <button
                type="button"
                onClick={() => {
                  setAuthMode(authMode === "login" ? "signup" : "login");
                  setError(null);
                  setInfo(null);
                }}
                style={{ background: "none", border: "none", padding: 0, color: "var(--brand)", fontWeight: 600, cursor: "pointer" }}
              >
                {authMode === "login" ? "계정 만들기" : "로그인"}
              </button>
            </p>
          </section>
        )}
      </div>

      <BottomTabs />
    </div>
  );
}
