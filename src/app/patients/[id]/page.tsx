"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, use } from "react";
import { PatientWithDocuments } from "@/lib/db/types";
import { DOC_TYPE_LABELS, DOC_TYPE_ORDER } from "@/lib/templates/types";
import { DOC_ICON_STYLES } from "@/components/docIcons";

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

export default function PatientDetailPage({ params }: PatientDetailPageProps) {
  const router = useRouter();
  const { id } = use(params);
  const [patient, setPatient] = useState<PatientWithDocuments | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) return <p className="patient-detail-page">불러오는 중...</p>;
  if (error) return <p className="patient-detail-page error-banner">{error}</p>;
  if (!patient) return null;

  return (
    <div className="patient-detail-page">
      <div className="doc-page__toolbar no-print">
        <button type="button" className="app-header__action" aria-label="뒤로" onClick={() => router.push("/patients")}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>
      <h1>
        {patient.name}
        {patient.customer_no != null && (
          <span className="patient-detail-page__no"> (No. {patient.customer_no})</span>
        )}
      </h1>
      {patient.phone ? <p className="patient-detail-page__meta">{patient.phone}</p> : null}

      <ul className="doc-row-list">
        {DOC_TYPE_ORDER.map((docType) => {
          const doc = patient.documents.find((d) => d.doc_type === docType);
          // 완료 / 작성중(입력 있음·임시저장) / 작성 필요(입력 없이 방문만 or 기록 없음)
          const state =
            doc?.status === "completed"
              ? "complete"
              : doc && hasFormData(doc.form_data)
                ? "progress"
                : "none";
          const label = state === "complete" ? "완료" : state === "progress" ? "작성중" : "작성 필요";
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
    </div>
  );
}
