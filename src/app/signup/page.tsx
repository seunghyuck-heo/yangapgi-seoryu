"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      if (password.length < 6) {
        setError("비밀번호는 6자 이상이어야 합니다");
        return;
      }
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) {
        setError(error.message);
        return;
      }
      // 이메일 확인이 꺼져 있으면 곧바로 세션이 생김 → 바로 진입
      if (data.session) {
        router.push("/submit");
        router.refresh();
      } else {
        setInfo("가입 확인 메일을 보냈습니다. 메일의 링크를 눌러 인증 후 로그인해 주세요.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-card__badge">🩺</div>
        <h1>계정 만들기</h1>
        <p>병원(계정)별로 서류 히스토리가 따로 저장됩니다</p>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="이름 (또는 병원명)" autoFocus />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일" autoComplete="email" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호 (6자 이상)" autoComplete="new-password" />
        {error && <div className="error-banner">{error}</div>}
        {info && <div className="error-banner" style={{ background: "var(--brand-soft)", color: "var(--brand-dark)", borderColor: "transparent" }}>{info}</div>}
        <button type="submit" className="primary" disabled={loading}>
          {loading ? "생성 중..." : "계정 만들기"}
        </button>
        <p style={{ textAlign: "center", fontSize: 13, marginTop: 4 }}>
          이미 계정이 있으신가요? <Link href="/login">로그인</Link>
        </p>
      </form>
    </div>
  );
}
