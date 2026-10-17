"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import BottomTabs from "@/components/BottomTabs";
import DocSubmitList from "@/components/DocSubmitList";
import { useUser } from "@/lib/supabase/useUser";

export default function SubmitPage() {
  const { user, loading } = useUser();
  const [patientId, setPatientId] = useState<string | null>(null);
  const creatingRef = useRef<Promise<string | null> | null>(null);

  const preview = !loading && !user;

  // 서식 제출 탭에 들어올 때마다 '새 환자'로 시작한다(탭을 전환하면 이 페이지는 리마운트되어
  // patientId가 null로 초기화됨). 예전엔 미완료 draft를 sessionStorage로 자동 이어써서, 다음에
  // 온 새 환자가 이전 환자의 서류를 덮어쓰는 문제가 있었다. → 자동 이어쓰기 제거.
  // 작성 중이던 환자는 '환자 보기'에서 해당 환자를 눌러 이어서 작성한다.
  // 실제 환자 폴더는 저장 행동(신분증 업로드/서식 진입) 시점에만 만든다(지연 생성).

  // 실제 저장 행동(신분증 업로드/서식 진입) 시점에만 환자 폴더를 만든다(지연 생성)
  async function ensurePatientId(): Promise<string | null> {
    if (patientId) return patientId;
    if (creatingRef.current) return creatingRef.current;
    const task = (async () => {
      try {
        const res = await fetch("/api/patients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "새 환자" }),
        });
        if (!res.ok) return null;
        const json = await res.json();
        const id = json.patient.id as string;
        setPatientId(id);
        return id;
      } catch {
        return null;
      } finally {
        creatingRef.current = null;
      }
    })();
    creatingRef.current = task;
    return task;
  }

  return (
    <div className="tab-page">
      <header className="app-header">
        <div className="app-header__row">
          <h1 className="app-header__title">양압기 서류계약</h1>
          <Link href="/settings" className="app-header__action" aria-label="로그인 / 계정">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
          </Link>
        </div>
        <p className="app-header__desc">
          아래의 서식들을 작성하여 제출하시면 자동으로 환자 보기에서 환자명으로 폴더가 만들어
          집니다.
        </p>
      </header>

      <div className="tab-page__body">
        {/* 로그아웃 상태에서도 서류 리스트를 미리보기(dim 배경)로 보여준다 */}
        <DocSubmitList
          patientId={preview ? "preview-patient" : patientId}
          preview={preview}
          fromSubmit={!preview}
          ensurePatientId={preview ? undefined : ensurePatientId}
        />
      </div>

      {/* 로그인 안 한 상태로 서식제출 탭 진입 시: 먼저 로그인 안내 팝업 */}
      {preview && (
        <div className="sheet-overlay sheet-overlay--center">
          <div className="sheet sheet--center">
            <div className="sheet__title sheet__title--name">먼저 로그인을 하세요</div>
            <p style={{ textAlign: "center", color: "var(--ink-soft)", fontSize: 14, margin: "-4px 0 16px" }}>
              서류 작성은 로그인 후 이용할 수 있습니다.
            </p>
            <Link href="/settings" className="login-required__btn">
              로그인 하러 가기
            </Link>
          </div>
        </div>
      )}

      <BottomTabs />
    </div>
  );
}
