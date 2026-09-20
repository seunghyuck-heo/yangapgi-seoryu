import type { PatientWithDocuments } from "@/lib/db/types";

// 환자로 "카운팅/표시"하는 기준:
// 반드시 신분증을 업로드하고, 이름이 입력된 이후부터만 정식 환자로 본다.
// (서식만 잠깐 열었다 나온 빈 폴더/초안은 제외)
export function isRegisteredPatient(p: PatientWithDocuments): boolean {
  const hasIdCard = p.documents.some(
    (d) => d.doc_type === "id_card" && (d.status === "completed" || !!d.file_path)
  );
  const name = (p.name ?? "").trim();
  const hasName = name !== "" && name !== "새 환자";
  return hasIdCard && hasName;
}
