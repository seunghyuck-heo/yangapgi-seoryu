import type { PatientWithDocuments } from "@/lib/db/types";

// 환자로 "카운팅/표시"하는 기준:
// - 신분증 업로드 + 이름 입력을 마쳤거나,
// - 서류를 하나라도 '작성완료'했으면 정식 환자로 본다.
// (서식만 잠깐 열었다 나온 빈 폴더/미완료 초안은 제외)
export function isRegisteredPatient(p: PatientWithDocuments): boolean {
  const hasIdCard = p.documents.some(
    (d) => d.doc_type === "id_card" && (d.status === "completed" || !!d.file_path)
  );
  const name = (p.name ?? "").trim();
  const hasName = name !== "" && name !== "새 환자";
  const hasCompletedDoc = p.documents.some((d) => d.status === "completed");
  return (hasIdCard && hasName) || hasCompletedDoc;
}
