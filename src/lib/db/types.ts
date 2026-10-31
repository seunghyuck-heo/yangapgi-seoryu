import { DocType } from "@/lib/templates/types";

export interface Patient {
  id: string;
  name: string;
  resident_number: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
  /** 직접 완료: 5종을 다 안 채워도 직원이 수동으로 '완료'로 처리한 환자 */
  manual_complete?: boolean | null;
}

export interface PatientDocument {
  id: string;
  patient_id: string;
  doc_type: DocType;
  status: "draft" | "completed";
  form_data: Record<string, unknown>;
  file_path: string | null;
  completed_at: string | null;
  updated_at: string;
}

export interface PatientWithDocuments extends Patient {
  documents: PatientDocument[];
  /** 신분증에서 추출한 증명사진(포토ID)의 서명 URL */
  photo_url?: string | null;
  /** 고객 참조 매칭으로 부여된 고유번호 (No.) */
  customer_no?: number | null;
  /** 주민번호로 시트 대조 시 일치 고객이 없음 = 아직 구글시트에 미등록 → '번호 추가 필요' 표시.
   *  (customer_no가 null이면서 이 값이 true일 때만 라벨을 띄운다. 주민번호 자체를 못 읽으면 false) */
  customer_no_needed?: boolean;
  /** 동명이인 순번(고유번호 작은=등록 먼저 순으로 1,2,…). 동명이인 아니면 null */
  name_dup_rank?: number | null;
  /** 스토리지 경로 → 서명 URL 맵 (예: 환자관리카드 방문점검 서명 이미지) */
  signedUrls?: Record<string, string>;
}
