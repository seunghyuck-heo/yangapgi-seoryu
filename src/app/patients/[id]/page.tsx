"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, use } from "react";
import dynamic from "next/dynamic";
import { PatientWithDocuments } from "@/lib/db/types";
import { DOC_TYPE_LABELS, DOC_TYPE_ORDER } from "@/lib/templates/types";
import { DOC_ICON_STYLES } from "@/components/docIcons";
import { DRAFT_NAME, draftRankMap } from "@/components/PatientRowInner";
import { PATIENTS_CHANGED_EVENT } from "@/components/BottomTabs";
import { removeFromInProgressCache } from "@/lib/inProgressCache";

// PDF 묶음 뷰어는 무거워서(오버레이·렌더링 코드) 필요할 때만 로드 → 상세 진입 속도 개선
const DocumentBundleViewer = dynamic(() => import("@/components/DocumentBundleViewer"), { ssr: false });

interface PatientDetailPageProps {
  params: Promise<{ id: string }>;
}

// form_data에 실제 입력값이 하나라도 있는지
function hasFormData(fd: Record<string, unknown> | null | undefined): boolean {
  if (!fd) return false;
  return Object.values(fd).some((v) => {
    if (typeof v === "string") return v.trim() !== "";
    if (typeof v === "boolean") return v;
    return v != null;
  });
}

// 환자관리카드: 제품명·상호명·성능검사/안전교육 날짜 또는 방문점검 중 하나라도 입력됐는지
function careCardHasData(fd: Record<string, unknown> | null | undefined): boolean {
  if (!fd) return false;
  for (const k of ["product", "providerOrg", "perfDate", "eduDate"]) {
    if (typeof fd[k] === "string" && (fd[k] as string).trim() !== "") return true;
  }
  const visits = fd.visits;
  if (Array.isArray(visits)) {
    return visits.some(
      (v) =>
        v &&
        (v.date || v.cpap || v.supply || v.hygiene || v.alarm || v.pressure || v.usage || v.action || v.provider || v.guardianSign)
    );
  }
  return false;
}

export default function PatientDetailPage({ params }: PatientDetailPageProps) {
  const router = useRouter();
  const { id } = use(params);
  const [patient, setPatient] = useState<PatientWithDocuments | null>(null);
  // '새 환자'가 2명 이상일 때 이 환자의 번호(리스트의 (1)(2)와 동일 기준). 1명 이하/새 환자 아니면 undefined.
  const [draftRank, setDraftRank] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBundle, setShowBundle] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [manualSaving, setManualSaving] = useState(false);
  const [syncingNo, setSyncingNo] = useState(false);
  const [receiptCount, setReceiptCount] = useState<number | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pdfAutoRef = useRef(false);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }

  // '직접 완료' 토글: 5종을 다 안 채워도 완료로 처리(환자보기에서 '직접 완료'로 표기,
  // 서식제출 '작성 중' 리스트에서 제외). 다시 누르면 해제.
  async function toggleManualComplete() {
    if (!patient || manualSaving) return;
    const next = !patient.manual_complete;
    setManualSaving(true);
    try {
      const res = await fetch(`/api/patients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manual_complete: next }),
      });
      if (!res.ok) {
        showToast("처리에 실패했습니다.");
        return;
      }
      setPatient((prev) => (prev ? { ...prev, manual_complete: next } : prev));
      // 서식제출 '작성 중' 공유 캐시에서 즉시 제거 → 돌아갔을 때 재조회 대기 없이 바로 반영
      if (next) removeFromInProgressCache(id);
      try {
        window.dispatchEvent(new Event(PATIENTS_CHANGED_EVENT));
      } catch {
        // 무시
      }
      showToast(next ? "직접 완료로 처리했습니다." : "직접 완료를 해제했습니다.");
    } finally {
      setManualSaving(false);
    }
  }

  // '번호 추가 필요' 옆 새로고침: 구글시트를 다시 동기화(customers 갱신)한 뒤 이 환자를 재조회.
  // 시트에 방금 추가·주민번호 입력한 고객이면 이때 새 고유번호가 잡힌다.
  async function refreshCustomerNo() {
    if (syncingNo) return;
    setSyncingNo(true);
    try {
      try {
        await fetch("/api/customers/sync"); // 시트 → customers 동기화(실패해도 재조회는 진행)
      } catch {
        // 무시
      }
      const res = await fetch(`/api/patients/${id}`);
      const json = await res.json();
      if (res.ok && json.patient) {
        setPatient(json.patient);
        showToast(
          json.patient.customer_no != null
            ? `번호를 받았습니다. (No. ${json.patient.customer_no})`
            : "아직 번호가 없습니다. 시트 등록을 확인해 주세요."
        );
      } else {
        showToast("새로고침에 실패했습니다.");
      }
    } finally {
      setSyncingNo(false);
    }
  }

  function handleOpenBundle() {
    if (!patient) return;
    // 5개 전부가 아니라, 완료된 서류가 1개라도 있으면 PDF 출력 허용.
    // (뷰어는 완료된 서류만 렌더/다운로드하므로 작성된 것만 나온다.)
    const completedCount = DOC_TYPE_ORDER.filter((dt) => {
      const doc = patient.documents.find((d) => d.doc_type === dt);
      return doc?.status === "completed";
    }).length;
    if (completedCount === 0) {
      showToast("완료된 서류가 아직 없습니다.");
      return;
    }
    setShowBundle(true);
  }

  useEffect(() => {
    fetch(`/api/patients/${id}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || "환자 정보를 불러오지 못했습니다");
          return;
        }
        setPatient(json.patient);
      })
      .finally(() => setLoading(false));
  }, [id]);

  // '새 환자' 번호: 리스트(작성 중/환자보기)와 동일하게 draftRankMap으로 계산 → 타이틀에 (1)(2) 표기 일치
  useEffect(() => {
    fetch(`/api/patients?inprogress=1`)
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json();
        const list = Array.isArray(json.inProgress) ? (json.inProgress as PatientWithDocuments[]) : [];
        setDraftRank(draftRankMap(list).get(id));
      })
      .catch(() => {});
  }, [id]);

  // 마스크 영수증 개수(지속 관리 서류 행 상태 표시용)
  useEffect(() => {
    fetch(`/api/patients/${id}/receipts`)
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json();
        setReceiptCount(Array.isArray(json.receipts) ? json.receipts.length : 0);
      })
      .catch(() => {});
  }, [id]);

  // 서류 수정 후 "예, PDF 업데이트"로 넘어온 경우(?pdf=1) → PDF 묶음 자동 열기
  useEffect(() => {
    if (!patient || pdfAutoRef.current) return;
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("pdf") === "1") {
        pdfAutoRef.current = true;
        handleOpenBundle();
        window.history.replaceState({}, "", `/patients/${id}`);
      }
    } catch {
      // 무시
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient]);

  if (error) return <p className="patient-detail-page error-banner">{error}</p>;
  // patient가 아직 안 왔어도 골격(제목/문서 행/링크)은 즉시 렌더 → 진입이 빨라 보임. 상태 라벨만 로딩 후 채움.

  return (
    <div className="patient-detail-page" aria-busy={loading}>
      <div className="doc-page__toolbar no-print">
        <button
          type="button"
          className="app-header__action"
          aria-label="뒤로"
          onClick={() => {
            // 출발지에 따라 뒤로가기: 서식제출(?from=submit)에서 왔으면 서식제출로, 아니면 환자보기로
            let from = "";
            try {
              from = new URLSearchParams(window.location.search).get("from") ?? "";
            } catch {
              // 무시
            }
            router.push(from === "submit" ? "/submit" : "/patients");
          }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="patient-detail-page__toolbar-actions">
          <button
            type="button"
            className={`patient-detail-page__manual ${patient?.manual_complete ? "is-on" : ""}`}
            onClick={toggleManualComplete}
            disabled={!patient || manualSaving}
          >
            {patient?.manual_complete ? "✓ 직접 완료" : "직접 완료"}
          </button>
          <button type="button" className="patient-detail-page__pdf" onClick={handleOpenBundle}>
            PDF로 출력
          </button>
        </div>
      </div>
      <h1>
        {patient ? (patient.name === DRAFT_NAME ? (draftRank ? `새 환자 (${draftRank})` : "새 환자") : patient.name_dup_rank ? `${patient.name}(${patient.name_dup_rank})` : patient.name) : " "}
        {patient?.customer_no != null ? (
          <span className="patient-detail-page__no"> (No. {patient.customer_no})</span>
        ) : patient?.customer_no_needed && patient.name !== DRAFT_NAME ? (
          <span className="patient-detail-page__no patient-detail-page__no--needed">
            {" "}(번호 추가 필요)
            <button
              type="button"
              className="patient-detail-page__no-refresh"
              onClick={refreshCustomerNo}
              disabled={syncingNo}
              aria-label="번호 새로고침"
              title="구글시트에 추가한 뒤 눌러 새 번호 받기"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={syncingNo ? { animation: "spin 0.8s linear infinite" } : undefined}>
                <path d="M21 12a9 9 0 0 1-9 9c-2.5 0-4.8-1-6.4-2.7L3 16" />
                <path d="M3 12a9 9 0 0 1 9-9c2.5 0 4.8 1 6.4 2.7L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M3 21v-5h5" />
              </svg>
            </button>
          </span>
        ) : null}
      </h1>
      {patient?.phone ? <p className="patient-detail-page__meta">{patient.phone}</p> : null}

      <ul className="doc-row-list">
        {DOC_TYPE_ORDER.map((docType) => {
          const doc = patient?.documents.find((d) => d.doc_type === docType);
          // 완료 / 작성중(입력 있음·임시저장) / 작성 필요(입력 없이 방문만 or 기록 없음)
          const state = !patient
            ? "loading"
            : doc?.status === "completed"
              ? "complete"
              : doc && hasFormData(doc.form_data)
                ? "progress"
                : "none";
          const label =
            state === "loading" ? "" : state === "complete" ? "완료" : state === "progress" ? "작성중" : "작성 필요";
          const style = DOC_ICON_STYLES[docType];
          return (
            <li key={docType}>
              <Link href={`/patients/${id}/doc/${docType}`} className="doc-row">
                <span className="doc-row__icon" style={{ background: style.color, color: "#fff" }}>
                  {style.icon}
                </span>
                <span className="doc-row__title">
                  {docType === "contract" ? "표준계약서 (순응 전)" : DOC_TYPE_LABELS[docType]}
                </span>
                <span className={`doc-row__status doc-row__status--${state}`}>{label}</span>
                <span className="doc-row__chevron" aria-hidden>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <h2 className="patient-detail-page__subhead">지속 관리 서류</h2>
      <ul className="doc-row-list">
        {(() => {
          const careDoc = patient?.documents.find((d) => d.doc_type === "care_card");
          const careState = !patient
            ? "loading"
            : careDoc?.status === "completed"
              ? "complete"
              : careDoc && careCardHasData(careDoc.form_data)
                ? "progress"
                : "none";
          const careLabel =
            careState === "loading" ? "" : careState === "complete" ? "완료" : careState === "progress" ? "작성중" : "작성 필요";
          return (
        <li>
          <Link href={`/patients/${id}/care-card`} className="doc-row">
            <span className="doc-row__icon" style={{ background: "#0ea5a3", color: "#fff" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="3" width="16" height="18" rx="2" />
                <path d="M9 3v3h6V3" />
                <path d="M8 11h8M8 15h5" />
              </svg>
            </span>
            <span className="doc-row__title">양압기 환자관리카드</span>
            <span className={`doc-row__status doc-row__status--${careState}`}>{careLabel}</span>
            <span className="doc-row__chevron" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </span>
          </Link>
        </li>
          );
        })()}
        {(() => {
          // 순응 후 표준계약서 — 표준계약서와 동일 서식, 저장만 분리. 상태는 입력 유무로 판정
          const afterDoc = patient?.documents.find((d) => d.doc_type === "contract_after");
          const afterState = !patient
            ? "loading"
            : afterDoc?.status === "completed"
              ? "complete"
              : afterDoc && hasFormData(afterDoc.form_data)
                ? "progress"
                : "none";
          const afterLabel =
            afterState === "loading" ? "" : afterState === "complete" ? "완료" : afterState === "progress" ? "작성중" : "작성 필요";
          return (
            <li>
              <Link href={`/patients/${id}/doc/contract_after`} className="doc-row">
                <span className="doc-row__icon" style={{ background: "#6366f1", color: "#fff" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                    <path d="M8 13h8M8 17h5" />
                  </svg>
                </span>
                <span className="doc-row__title">표준계약서 (순응 후)</span>
                <span className={`doc-row__status doc-row__status--${afterState}`}>{afterLabel}</span>
                <span className="doc-row__chevron" aria-hidden>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </span>
              </Link>
            </li>
          );
        })()}
        <li>
          <Link href={`/patients/${id}/receipts`} className="doc-row">
            <span className="doc-row__icon" style={{ background: "#e8833a", color: "#fff" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 2v20l3-2 3 2 2-2 2 2 3-2 3 2V2l-3 2-3-2-2 2-2-2-3 2z" />
                <path d="M8 9h8M8 13h5" />
              </svg>
            </span>
            <span className="doc-row__title">마스크 영수증 추가</span>
            <span className={`doc-row__status ${receiptCount ? "doc-row__status--complete" : ""}`}>
              {receiptCount ? `영수증 ${receiptCount}장` : ""}
            </span>
            <span className="doc-row__chevron" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </span>
          </Link>
        </li>
      </ul>

      {toast && <div className="toast no-print">{toast}</div>}

      {showBundle && patient && (
        <DocumentBundleViewer
          patientId={patient.id}
          patientName={patient.name}
          customerNo={patient.customer_no}
          documents={patient.documents}
          onClose={() => setShowBundle(false)}
        />
      )}
    </div>
  );
}
