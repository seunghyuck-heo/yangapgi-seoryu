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
      if (!stored) return;
      try {
        const res = await fetch(`/api/patients/${stored}`);
        if (!res.ok) return;
        const json = await res.json();
        const docs: PatientDocument[] = json.patient?.documents ?? [];
        const done = DOC_TYPE_ORDER.filter((t) =>
          docs.some((d) => d.doc_type === t && d.status === "completed")
        ).length;
        if (json.patient && done < DOC_TYPE_ORDER.length && !ignore) {
          setPatientId(stored);
        }
      } catch {
        // 무시
      }
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
          <Link href="/settings" className="app-header__action" aria-label="계정 / 로그인">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-3.3 3.6-6 8-6s8 2.7 8 6" />
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
