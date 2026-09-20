"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BottomTabs from "@/components/BottomTabs";
import DocSubmitList from "@/components/DocSubmitList";
import { PatientDocument } from "@/lib/db/types";
import { DOC_TYPE_ORDER } from "@/lib/templates/types";

const DRAFT_KEY = "draftPatientId";

interface Mode {
  patientId: string;
  preview: boolean;
}

export default function SubmitPage() {
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    let ignore = false;

    async function ensureDraft() {
      let stored: string | null = null;
      try {
        stored = sessionStorage.getItem(DRAFT_KEY);
      } catch {
        stored = null;
      }

      // 이번 세션에 진행 중인 draft가 있으면 이어서 사용
      if (stored) {
        try {
          const res = await fetch(`/api/patients/${stored}`);
          if (res.ok) {
            const json = await res.json();
            const docs: PatientDocument[] = json.patient?.documents ?? [];
            const done = DOC_TYPE_ORDER.filter((t) =>
              docs.some((d) => d.doc_type === t && d.status === "completed")
            ).length;
            if (json.patient && done < DOC_TYPE_ORDER.length) {
              if (!ignore) setMode({ patientId: stored, preview: false });
              return;
            }
          }
        } catch {
          // fall through to create
        }
      }

      // 새 draft 폴더 생성 (서식 제출 시 이름이 자동으로 채워짐)
      try {
        const createRes = await fetch("/api/patients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "새 환자" }),
        });
        if (createRes.ok) {
          const createJson = await createRes.json();
          try {
            sessionStorage.setItem(DRAFT_KEY, createJson.patient.id);
          } catch {
            // ignore
          }
          if (!ignore) setMode({ patientId: createJson.patient.id, preview: false });
          return;
        }
      } catch {
        // fall through to preview
      }

      // 로그인 전(또는 Supabase 미연결) 이면 미리보기 모드로 화면은 그대로 표시
      if (!ignore) setMode({ patientId: "preview-patient", preview: true });
    }

    ensureDraft();
    return () => {
      ignore = true;
    };
  }, []);

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
        {mode ? (
          <DocSubmitList
            patientId={mode.patientId}
            preview={mode.preview}
            fromSubmit={!mode.preview}
          />
        ) : (
          <p className="muted-text">준비 중...</p>
        )}
      </div>

      <BottomTabs />
    </div>
  );
}
