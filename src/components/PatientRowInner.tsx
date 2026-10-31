"use client";

import { PatientWithDocuments } from "@/lib/db/types";
import { DOC_TYPE_ORDER } from "@/lib/templates/types";

// 환자보기 리스트 / 서식제출 '작성 중' 리스트가 동일한 행 모양을 쓰도록 공용화한 내용 블록.
// 바깥 래퍼(Link 또는 선택 버튼)는 각 화면에서 감싼다.

export function patientCompleteCount(documents: PatientWithDocuments["documents"]): number {
  return DOC_TYPE_ORDER.filter((t) =>
    documents.some((d) => d.doc_type === t && d.status === "completed")
  ).length;
}

/** 이름 미입력(신분증/이름 전) 환자의 기본 표시명 */
export const DRAFT_NAME = "새 환자";

/**
 * 현재 화면에 '보이는' 새 환자 행들에만 로컬 번호를 매긴다.
 * 새 환자가 1명뿐이면 번호 없이 "새 환자", 2명 이상일 때만 새 환자 (1)/(2)…로 표시.
 * (등록순=created_at 오름차순으로 번호 부여)
 */
export function draftRankMap(patients: PatientWithDocuments[]): Map<string, number> {
  const m = new Map<string, number>();
  const drafts = patients.filter((p) => p.name === DRAFT_NAME);
  if (drafts.length < 2) return m;
  drafts
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .forEach((p, i) => m.set(p.id, i + 1));
  return m;
}

interface Props {
  patient: PatientWithDocuments;
  editMode?: boolean;
  checked?: boolean;
  /** 보이는 새 환자가 2명 이상일 때의 로컬 번호(1-based). 1명뿐이면 전달하지 않음 → 번호 없음 */
  draftRank?: number;
}

export default function PatientRowInner({ patient, editMode = false, checked = false, draftRank }: Props) {
  const done = patientCompleteCount(patient.documents);
  const total = DOC_TYPE_ORDER.length;
  const allDone = done >= total;

  return (
    <>
      {editMode && (
        <span className={`patient-list__check ${checked ? "patient-list__check--on" : ""}`} aria-hidden>
          {checked && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          )}
        </span>
      )}
      <div className="patient-list__avatar" aria-hidden>
        {patient.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={patient.photo_url} alt="" className="patient-list__photo" />
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-3.3 3.6-6 8-6s8 2.7 8 6" />
          </svg>
        )}
      </div>
      <div className="patient-list__name">
        {patient.name === DRAFT_NAME
          ? draftRank
            ? `새 환자 (${draftRank})`
            : "새 환자"
          : patient.name_dup_rank
            ? `${patient.name}(${patient.name_dup_rank})`
            : patient.name}
        {patient.customer_no != null ? (
          <span className="patient-list__no">(No. {patient.customer_no})</span>
        ) : patient.customer_no_needed && patient.name !== DRAFT_NAME ? (
          <span className="patient-list__no patient-list__no--needed">(번호 추가 필요)</span>
        ) : null}
      </div>
      <div
        className={`patient-list__progress ${allDone || patient.manual_complete ? "patient-list__progress--done" : ""}`}
      >
        {patient.manual_complete ? "직접 완료" : `${done} / ${total} ${allDone ? "완료" : ""}`}
      </div>
    </>
  );
}
