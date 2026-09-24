"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import BottomTabs from "@/components/BottomTabs";
import DocSubmitList from "@/components/DocSubmitList";
import { PatientDocument } from "@/lib/db/types";
import { DOC_TYPE_ORDER } from "@/lib/templates/types";
import { useUser } from "@/lib/supabase/useUser";

const DRAFT_KEY = "draftPatientId";

export default function SubmitPage() {
  const { user, loading } = useUser();
  const [patientId, setPatientId] = useState<string | null>(null);
  const creatingRef = useRef<Promise<string | null> | null>(null);

  const preview = !loading && !user;

  // 로그인 상태에서, 이번 세션의 미완료 draft가 있으면 이어서 사용(새로 만들지 않음)
  useEffect(() => {
    if (loading || !user) return;
    let ignore = false;
    (async () => {
      let stored: string | null = null;
      try {
        stored = sessionStorage.getItem(DRAFT_KEY);
      } catch {
        stored = null;
      }
      if (stored) {
        try {
          const res = await fetch(`/api/patients/${stored}`);
          if (res.ok) {
            const json = await res.json();
            const docs: PatientDocument[] = json.patient?.documents ?? [];
            const done = DOC_TYPE_ORDER.filter((t) =>
              docs.some((d) => d.doc_type === t && d.status === "completed")
            ).length;
            if (json.patient && done < DOC_TYPE_ORDER.length && !ignore) {
              setPatientId(stored);
              return;
            }
          }
        } catch {
          // 무시
        }
      }
      // 이어쓸 draft가 없으면 폴더를 미리 만들어 둔다 → 각 서식 라우트 프리페치로 첫 진입 지연 최소화
      if (!ignore) await ensurePatientId();
    })();
    return () => {
      ignore = true;
    };
  }, [user, loading]);

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
        try {
          sessionStorage.setItem(DRAFT_KEY, id);
        } catch {
          // ignore
        }
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
        <DocSubmitList
          patientId={preview ? "preview-patient" : patientId}
          preview={preview}
          fromSubmit={!preview}
          ensurePatientId={preview ? undefined : ensurePatientId}
        />
      </div>

      <BottomTabs />
    </div>
  );
}
