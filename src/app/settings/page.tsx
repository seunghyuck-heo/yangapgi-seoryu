"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BottomTabs from "@/components/BottomTabs";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/supabase/useUser";
import { APP_VERSION } from "@/lib/version";

// 설정 재진입 시 이름 플래시 방지용 클라이언트 캐시
let cachedProfileName: string | null = null;

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading } = useUser();

  // 로그인/회원가입 폼 (로그아웃 상태)
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 로그인 상태: 프로필 이름 + 편집
  const [profileName, setProfileName] = useState(cachedProfileName ?? "");
  const [profileLoaded, setProfileLoaded] = useState(cachedProfileName != null);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [saving, setSaving] = useState(false);
  const nameOverlayRef = useRef<HTMLDivElement | null>(null);

  // 키보드가 올라오면 중앙 팝업을 보이는 영역 기준으로 위로, 내려가면 다시 중앙
  useEffect(() => {
    if (!editing) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      if (nameOverlayRef.current) nameOverlayRef.current.style.paddingBottom = `${kb}px`;
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      if (nameOverlayRef.current) nameOverlayRef.current.style.paddingBottom = "";
    };
  }, [editing]);

  // OAuth 콜백에서 넘어온 오류를 화면에 표시
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const autherror = params.get("autherror");
    if (autherror) {
      setError(`구글 로그인 실패: ${autherror}`);
      window.history.replaceState({}, "", "/settings");
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.from("profiles").select("name").eq("id", user.id).maybeSingle();
      const name = data?.name ?? (user.user_metadata?.name as string) ?? "";
      cachedProfileName = name;
      setProfileName(name);
      setProfileLoaded(true);
    })();
  }, [user]);

  const displayName = profileName.trim() || (user?.email ? user.email.split("@")[0] : "사용자");
  const meta = user?.user_metadata as { avatar_url?: string; picture?: string } | undefined;
  const avatarUrl = meta?.avatar_url || meta?.picture || "";

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
        const { data, error } = await supabase.auth.signUp({ email, password });
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

  function handleGoogle() {
    setError(null);
    setInfo(null);
    setBusy(true);
    // 서버 주도 로그인: 같은 창에서 in-scope 경로로 이동 → 서버가 구글로 302.
    // 설치형 PWA(standalone)에서도 막히지 않는다.
    window.location.href = "/auth/login/google?next=/settings";
  }

  function startEdit() {
    setDraftName(profileName);
    setEditing(true);
  }

  async function saveName() {
    if (!user) return;
    setSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const name = draftName.trim();
      await supabase.from("profiles").upsert({ id: user.id, name, updated_at: new Date().toISOString() });
      cachedProfileName = name;
      setProfileName(name);
      setEditing(false);
    } finally {
      setSaving(false);
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
        <h1 className="app-header__title" style={{ fontFamily: "var(--font-body)", fontWeight: 800 }}>
          설정
        </h1>
      </header>

      <div className="tab-page__body">
        {loading ? (
          <p className="muted-text">불러오는 중...</p>
        ) : user ? (
          /* ── 로그인 상태: 프로필 ── */
          <>
            <div className="profile-card">
              <div className="profile-card__avatar" aria-hidden>
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="profile-card__photo" referrerPolicy="no-referrer" />
                ) : (
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 21c0-3.3 3.6-6 8-6s8 2.7 8 6" />
                  </svg>
                )}
              </div>
              <div className="profile-card__main">
                {profileLoaded ? (
                  <div className="profile-card__name">{displayName}</div>
                ) : (
                  <div className="profile-card__name profile-card__name--skeleton" aria-hidden>&nbsp;</div>
                )}
                <div className="profile-card__email">{user.email}</div>
              </div>
              <button type="button" className="profile-card__btn" onClick={startEdit}>
                이름변경
              </button>
            </div>

            <Link href="/customers" className="settings-menu-item">
              <span>양압기 환자 리스트</span>
              <span className="settings-menu-item__chev" aria-hidden>›</span>
            </Link>

            <div className="settings-bottom">
              <p className="app-version">양압기 서류계약 {APP_VERSION}</p>
              <button type="button" className="logout-btn" onClick={handleLogout}>
                로그아웃
              </button>
            </div>
          </>
        ) : (
          /* ── 로그아웃 상태: 로그인 / 계정 만들기 ── */
          <section className="settings-group">
            <form className="settings-card" onSubmit={handleAuth} style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
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
              <button type="submit" className="primary" disabled={busy} style={{ padding: 16, fontSize: 16, fontWeight: 700, borderRadius: 999 }}>
                {busy ? "처리 중..." : authMode === "login" ? "로그인" : "계정 만들기"}
              </button>

              <div className="auth-divider"><span>또는</span></div>

              <button type="button" className="google-btn" onClick={handleGoogle} disabled={busy}>
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                  <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.88 2.68-6.62z" />
                  <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.85.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
                  <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
                  <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
                </svg>
                Google 계정으로 로그인
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

      {editing && (
        <div
          className="sheet-overlay sheet-overlay--center"
          ref={nameOverlayRef}
          onClick={() => setEditing(false)}
        >
          <div className="sheet sheet--center" onClick={(e) => e.stopPropagation()}>
            <div className="sheet__title sheet__title--name">이름변경</div>
            <input
              type="text"
              className="name-edit-input"
              value={draftName}
              placeholder="이름"
              autoFocus
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
              }}
            />
            <div className="field-popup__actions">
              <button type="button" onClick={() => setEditing(false)}>
                취소
              </button>
              <button type="button" className="primary" onClick={saveName} disabled={saving}>
                {saving ? "저장 중..." : "확인"}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomTabs />
    </div>
  );
}
