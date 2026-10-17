"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import BottomTabs, { PATIENTS_CHANGED_EVENT } from "@/components/BottomTabs";
import DocSubmitList from "@/components/DocSubmitList";
import PatientRowInner from "@/components/PatientRowInner";
import { PatientWithDocuments } from "@/lib/db/types";
import { useUser } from "@/lib/supabase/useUser";

export default function SubmitPage() {
  const { user, loading } = useUser();
  const [patientId, setPatientId] = useState<string | null>(null);
  const [inProgress, setInProgress] = useState<PatientWithDocuments[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; value: string } | null>(null);
  const [renameSaving, setRenameSaving] = useState(false);
  const creatingRef = useRef<Promise<string | null> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshRef = useRef<() => void>(() => {});

  const preview = !loading && !user;

  // 서식 제출 탭에 들어올 때마다 '새 환자'로 시작한다(탭을 전환하면 이 페이지는 리마운트되어
  // patientId가 null로 초기화됨). 예전엔 미완료 draft를 sessionStorage로 자동 이어써서, 다음에
  // 온 새 환자가 이전 환자의 서류를 덮어쓰는 문제가 있었다. → 자동 이어쓰기 제거.
  // 작성 중이던 환자는 '환자 보기'에서 해당 환자를 눌러 이어서 작성한다.
  // 실제 환자 폴더는 저장 행동(신분증 업로드/서식 진입) 시점에만 만든다(지연 생성).

  // '현재 작성 중인 환자'(등록됐지만 5종 전부 완료되진 않은) 목록 → 하단 섹션.
  // 마운트 시 + 환자 변경 이벤트(신분증 저장 등) 시 갱신. 환자보기에서 완료되면 자동으로 빠진다.
  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    async function refresh() {
      try {
        const res = await fetch("/api/patients?inprogress=1");
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setInProgress(Array.isArray(json.inProgress) ? json.inProgress : []);
      } catch {
        // 무시
      }
    }
    refreshRef.current = refresh;
    refresh();
    const onChanged = () => refresh();
    // 화면으로 돌아오거나(다른 탭·상세에서 복귀) 앱이 다시 보이면 최신 상태로 갱신 → 항상 바로 반영
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener(PATIENTS_CHANGED_EVENT, onChanged);
    window.addEventListener("focus", onChanged);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener(PATIENTS_CHANGED_EVENT, onChanged);
      window.removeEventListener("focus", onChanged);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, loading]);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }

  // '작성 중' 리스트의 '새 환자' 행에서 이름 입력(환자보기와 동일 동작)
  async function saveRename() {
    if (!renameTarget) return;
    const name = renameTarget.value.trim();
    if (!name) return;
    setRenameSaving(true);
    try {
      await fetch(`/api/patients/${renameTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      refreshRef.current();
      try {
        window.dispatchEvent(new Event(PATIENTS_CHANGED_EVENT));
      } catch {
        // 무시
      }
      setRenameTarget(null);
    } finally {
      setRenameSaving(false);
    }
  }

  // 타이틀 우측 '+': 현재 작성 흐름을 끊고 새 환자로 다시 시작한다(지연 생성이라 다음 저장
  // 행동부터 새 폴더). 작성 중이던 환자는 아래 '작성 중' 리스트에 그대로 남는다.
  function handleNewPatient() {
    setPatientId(null);
    creatingRef.current = null;
    showToast("새 환자로 시작합니다.");
  }

  // 신분증 등록(정식 등록)이 끝나면: 위 서식은 새 환자로 리셋하고(위 파일 = 항상 새 환자),
  // 방금 등록된 환자는 아래 '작성 중' 리스트에서 이어 작성한다. 목록도 즉시 갱신.
  function handleRegistered() {
    setPatientId(null);
    creatingRef.current = null;
    refreshRef.current();
  }

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
          <button type="button" className="app-header__action" aria-label="새 환자 시작" onClick={handleNewPatient}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
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
          onRegistered={preview ? undefined : handleRegistered}
        />

        {/* 위임장 리스트 하단(20px): '현재 작성 중인 환자' — 환자보기와 동일한 행/탭 동작.
            완료되면 목록에서 자동으로 사라진다. */}
        {!preview && inProgress.length > 0 && (
          <>
            <h2 className="patient-detail-page__subhead">현재 작성 중인 환자</h2>
            <ul className="patient-list">
              {inProgress.map((patient) => (
                <li key={patient.id}>
                  <Link href={`/patients/${patient.id}`} className="patient-list__item">
                    <PatientRowInner patient={patient} onRename={(id) => setRenameTarget({ id, value: "" })} />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
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

      {/* '새 환자' 행 이름 입력(환자보기와 동일) */}
      {renameTarget && (
        <div className="sheet-overlay sheet-overlay--center" onClick={() => setRenameTarget(null)}>
          <div className="sheet sheet--center" onClick={(e) => e.stopPropagation()}>
            <div className="sheet__title sheet__title--name">환자 이름 입력</div>
            <input
              type="text"
              value={renameTarget.value}
              placeholder="환자 이름"
              autoFocus
              onChange={(e) => setRenameTarget((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveRename();
              }}
            />
            <div className="field-popup__actions">
              <button type="button" onClick={() => setRenameTarget(null)}>
                취소
              </button>
              <button type="button" className="primary" onClick={saveRename} disabled={renameSaving}>
                {renameSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast no-print">{toast}</div>}

      <BottomTabs />
    </div>
  );
}
