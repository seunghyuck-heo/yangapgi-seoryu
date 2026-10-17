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

interface Props {
  patient: PatientWithDocuments;
  editMode?: boolean;
  checked?: boolean;
  /** '새 환자'(이름 미입력) 행에 '이름 입력하기' 버튼을 띄우고 싶을 때만 전달 */
  onRename?: (id: string) => void;
}

export default function PatientRowInner({ patient, editMode = false, checked = false, onRename }: Props) {
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
        {patient.name_dup_rank ? `${patient.name}(${patient.name_dup_rank})` : patient.name}
        {patient.customer_no != null && (
          <span className="patient-list__no">(No. {patient.customer_no})</span>
        )}
        {!editMode && patient.name === "새 환자" && onRename && (
          <button
            type="button"
            className="patient-list__rename"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRename(patient.id);
            }}
          >
            이름 입력하기
          </button>
        )}
      </div>
      <div
        className={`patient-list__progress ${allDone || patient.manual_complete ? "patient-list__progress--done" : ""}`}
      >
        {patient.manual_complete ? "직접 완료" : `${done} / ${total} ${allDone ? "완료" : ""}`}
      </div>
    </>
  );
}
