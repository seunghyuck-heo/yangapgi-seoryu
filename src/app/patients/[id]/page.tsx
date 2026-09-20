"use client";

import Link from "next/link";
import { useEffect, useState, use } from "react";
import { PatientWithDocuments } from "@/lib/db/types";
import { DOC_TYPE_ICONS, DOC_TYPE_LABELS, DOC_TYPE_ORDER } from "@/lib/templates/types";

interface PatientDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function PatientDetailPage({ params }: PatientDetailPageProps) {
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
      <Link href="/patients">← 환자 목록</Link>
      <h1>{patient.name}</h1>
      <p className="patient-detail-page__meta">{patient.phone || "연락처 미등록"}</p>

      <div className="doc-card-grid">
        {DOC_TYPE_ORDER.map((docType) => {
          const doc = patient.documents.find((d) => d.doc_type === docType);
          // 완료 / 진행중(저장됐지만 미완료) / 작성 필요(기록 없음)
          const state = doc?.status === "completed" ? "complete" : doc ? "progress" : "none";
          const label = state === "complete" ? "완료" : state === "progress" ? "진행중" : "작성 필요";
          return (
            <Link
              key={docType}
              href={`/patients/${id}/doc/${docType}`}
              className={`doc-card doc-card--${state}`}
            >
              <div className="doc-card__icon">{DOC_TYPE_ICONS[docType]}</div>
              <div className="doc-card__title">{DOC_TYPE_LABELS[docType]}</div>
              <div className="doc-card__status">{label}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
