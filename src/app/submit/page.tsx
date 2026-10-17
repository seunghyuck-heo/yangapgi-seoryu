"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import BottomTabs, { PATIENTS_CHANGED_EVENT } from "@/components/BottomTabs";
import DocSubmitList from "@/components/DocSubmitList";
import { useUser } from "@/lib/supabase/useUser";

export default function SubmitPage() {
  const { user, loading } = useUser();
  const [patientId, setPatientId] = useState<string | null>(null);
  const [inProgress, setInProgress] = useState<{ id: string; name: string }[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const creatingRef = useRef<Promise<string | null> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const preview = !loading && !user;

  // 서식 제출 탭에 들어올 때마다 '새 환자'로 시작한다(탭을 전환하면 이 페이지는 리마운트되어
  // patientId가 null로 초기화됨). 예전엔 미완료 draft를 sessionStorage로 자동 이어써서, 다음에
  // 온 새 환자가 이전 환자의 서류를 덮어쓰는 문제가 있었다. → 자동 이어쓰기 제거.
  // 작성 중이던 환자는 '환자 보기'에서 해당 환자를 눌러 이어서 작성한다.
  // 실제 환자 폴더는 저장 행동(신분증 업로드/서식 진입) 시점에만 만든다(지연 생성).

  // '작성 중'(필수 서류 중 하나라도 저장됐지만 전부 완료되진 않은) 환자 목록 → 하단 문구.
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
    refresh();
    const onChanged = () => refresh();
    window.addEventListener(PATIENTS_CHANGED_EVENT, onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(PATIENTS_CHANGED_EVENT, onChanged);
    };
  }, [user, loading]);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }

  // 타이틀 우측 '+': 현재 작성 흐름을 끊고 새 환자로 다시 시작한다(지연 생성이라 다음 저장
  // 행동부터 새 폴더). 작성 중이던 환자는 하단 문구에 그대로 남는다.
  function handleNewPatient() {
    setPatientId(null);
    creatingRef.current = null;
    showToast("새 환자로 시작합니다.");
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
        />

        {/* 위임장 리스트 하단: 현재 작성 중(미완료)인 환자 안내. 완료되면 자동으로 사라짐 */}
        {!preview && inProgress.length > 0 && (
          <p
            style={{
              marginTop: 20,
              fontSize: 13,
              color: "var(--ink-soft)",
              textAlign: "center",
              lineHeight: 1.5,
            }}
          >
            현재 {inProgress.map((p) => p.name).join(", ")} 작성 중입니다.
          </p>
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

      {toast && <div className="toast no-print">{toast}</div>}

      <BottomTabs />
    </div>
  );
}
