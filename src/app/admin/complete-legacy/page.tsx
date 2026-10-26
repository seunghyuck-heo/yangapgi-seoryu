"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Candidate {
  id: string;
  name: string;
}

export default function CompleteLegacyPage() {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState<{ count: number; names: string[] } | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/complete-legacy", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "조회 실패");
      setCandidates(json.candidates ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function apply() {
    if (processing) return;
    setProcessing(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/complete-legacy", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "처리 실패");
      setDone(json);
      setCandidates([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="doc-page" style={{ padding: 20, maxWidth: 520, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>기존 완료 환자 정리</h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>
        신분증·표준계약서·급여신청서·CMS·위임장 5종을 모두 완료한 기존 환자를 <b>직접 완료</b>로 처리합니다.
        (6번째 서류 &lsquo;양압기 임대 안내&rsquo; 때문에 작성 중으로 다시 뜨지 않게 하기 위함)
      </p>

      {loading && <p>불러오는 중…</p>}

      {error && (
        <div className="error-banner" style={{ marginBottom: 16 }}>
          {error}
          <br />
          <span style={{ fontSize: 13 }}>로그인 상태인지 확인 후 다시 시도하세요.</span>
        </div>
      )}

      {done && (
        <div
          style={{
            background: "#e3f6ec",
            color: "#12805c",
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
            fontSize: 15,
          }}
        >
          ✅ <b>{done.count}명</b>을 직접 완료로 처리했습니다.
          {done.count > 0 && (
            <div style={{ marginTop: 8, fontSize: 13, color: "#0f6e4f" }}>
              {done.names.join(", ")}
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <Link href="/patients" className="login-required__btn">
              환자 보기로 이동
            </Link>
          </div>
        </div>
      )}

      {!loading && !done && (
        <>
          {candidates.length === 0 ? (
            <p style={{ color: "var(--ink-soft)" }}>처리할 대상(기존 5종 완료 환자)이 없습니다.</p>
          ) : (
            <>
              <p style={{ fontWeight: 700, marginBottom: 10 }}>대상 {candidates.length}명</p>
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: "0 0 20px",
                  maxHeight: 320,
                  overflowY: "auto",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                }}
              >
                {candidates.map((c, i) => (
                  <li
                    key={c.id}
                    style={{
                      padding: "12px 16px",
                      borderTop: i === 0 ? "none" : "1px solid var(--border)",
                      fontSize: 15,
                    }}
                  >
                    {c.name}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="login-required__btn"
                onClick={apply}
                disabled={processing}
                style={{ width: "100%" }}
              >
                {processing ? "처리 중…" : `${candidates.length}명 직접 완료로 처리`}
              </button>
            </>
          )}
        </>
      )}

      <div style={{ marginTop: 24 }}>
        <Link href="/submit" style={{ color: "var(--ink-soft)", fontSize: 14 }}>
          ← 돌아가기
        </Link>
      </div>
    </div>
  );
}
