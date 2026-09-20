"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BottomTabs from "@/components/BottomTabs";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SettingsPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setEmail(user.email ?? "");
      const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", user.id)
        .maybeSingle();
      setName(profile?.name ?? (user.user_metadata?.name as string) ?? "");
      setLoading(false);
    })();
  }, [router]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("profiles").upsert({ id: user.id, name, updated_at: new Date().toISOString() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
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
        <section className="settings-group">
          <h2 className="section-heading">로그인 정보</h2>
          <div className="settings-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
            <input type="email" value={loading ? "" : email} readOnly placeholder="이메일" style={{ background: "var(--bg-soft)" }} />
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" />
          </div>
        </section>

        <button type="button" className="primary" onClick={handleSave} disabled={saving || loading} style={{ width: "100%", padding: 16, fontSize: 16, fontWeight: 700 }}>
          {saving ? "저장 중..." : saved ? "저장됨 ✓" : "저장"}
        </button>

        <button type="button" onClick={handleLogout} style={{ width: "100%", padding: 14, marginTop: 4, color: "var(--danger)", fontWeight: 600 }}>
          로그아웃
        </button>
      </div>

      <BottomTabs />
    </div>
  );
}
