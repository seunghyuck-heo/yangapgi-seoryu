"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, use } from "react";
import dynamic from "next/dynamic";
import { PatientWithDocuments } from "@/lib/db/types";
import { DOC_TYPE_LABELS, DOC_TYPE_ORDER } from "@/lib/templates/types";
import { DOC_ICON_STYLES } from "@/components/docIcons";

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

// 환자관리카드: 제품명 또는 방문점검 중 하나라도 입력됐는지 (빈 visits 배열은 제외)
function careCardHasData(fd: Record<string, unknown> | null | undefined): boolean {
  if (!fd) return false;
  if (typeof fd.product === "string" && fd.product.trim() !== "") return true;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBundle, setShowBundle] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pdfAutoRef = useRef(false);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }

  function handleOpenBundle() {
    if (!patient) return;
    const notDone = DOC_TYPE_ORDER.filter((dt) => {
      const doc = patient.documents.find((d) => d.doc_type === dt);
      return doc?.status !== "completed";
    }).length;
    if (notDone > 0) {
      showToast(`${notDone}개가 아직 완료되지 않았습니다.`);
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
        <button type="button" className="app-header__action" aria-label="뒤로" onClick={() => router.push("/patients")}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <button type="button" className="patient-detail-page__pdf" onClick={handleOpenBundle}>
          PDF로 출력
        </button>
      </div>
      <h1>
        {patient ? patient.name : " "}
        {patient?.customer_no != null && (
          <span className="patient-detail-page__no"> (No. {patient.customer_no})</span>
        )}
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
                <span className="doc-row__title">{DOC_TYPE_LABELS[docType]}</span>
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
      </ul>

      {toast && <div className="toast no-print">{toast}</div>}

      {showBundle && patient && (
        <DocumentBundleViewer
          patientId={patient.id}
          patientName={patient.name}
          documents={patient.documents}
          onClose={() => setShowBundle(false)}
        />
      )}
    </div>
  );
}
