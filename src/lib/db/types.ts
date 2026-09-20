import { DocType } from "@/lib/templates/types";

export interface Patient {
  id: string;
  name: string;
  resident_number: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
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
}
