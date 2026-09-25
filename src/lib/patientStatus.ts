import type { PatientWithDocuments } from "@/lib/db/types";
import { DOC_TYPE_ORDER, DocType } from "@/lib/templates/types";

const REQUIRED_TYPES = new Set<DocType>(DOC_TYPE_ORDER);

// 환자로 "카운팅/표시"하는 기준:
// - 필수 서류(5종) 중 하나라도 저장(임시저장 draft 또는 작성완료 completed)했거나,
// - 신분증 이미지가 올라가 있으면 정식 환자로 본다.
// (신분증을 먼저 안 넣어도, 서류 하나만 임시저장하면 목록에 보인다.)
export function isRegisteredPatient(p: PatientWithDocuments): boolean {
  return p.documents.some(
    (d) =>
      REQUIRED_TYPES.has(d.doc_type) &&
      (d.status === "completed" || d.status === "draft" || !!d.file_path)
  );
}
