import { DOCUMENTS_BUCKET, getSupabaseServerClient } from "@/lib/supabase/server";
import { DocType } from "@/lib/templates/types";
import { PatientDocument } from "./types";

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

export async function getDocument(
  patientId: string,
  docType: DocType
): Promise<PatientDocument | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("patient_id", patientId)
    .eq("doc_type", docType)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PatientDocument) ?? null;
}

export async function upsertDocument(
  patientId: string,
  docType: DocType,
  input: {
    form_data?: Record<string, unknown>;
    file_path?: string | null;
    status?: "draft" | "completed";
  }
): Promise<PatientDocument> {
  const supabase = await getSupabaseServerClient();
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    patient_id: patientId,
    doc_type: docType,
    updated_at: now,
  };
  if (input.form_data !== undefined) payload.form_data = input.form_data;
  if (input.file_path !== undefined) payload.file_path = input.file_path;
  if (input.status !== undefined) {
    payload.status = input.status;
    if (input.status === "completed") payload.completed_at = now;
  }

  const { data, error } = await supabase
    .from("documents")
    .upsert(payload, { onConflict: "patient_id,doc_type" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await maybeUpdatePatientName(patientId, docType, input.form_data);

  return data as PatientDocument;
}

export const DRAFT_PATIENT_NAME = "새 환자";

/** 서식 안에 입력된 수진자/가입자 성명에서 환자명을 추출한다 */
function deriveNameFromForm(
  docType: DocType,
  formData?: Record<string, unknown>
): string | null {
  if (!formData) return null;
  const keysByType: Partial<Record<DocType, string[]>> = {
    subsidy_application: ["patient_name"],
    power_of_attorney: ["insured_name", "guardian_name"],
  };
  for (const key of keysByType[docType] ?? []) {
    const value = formData[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** 환자명이 아직 기본값("새 환자")이면 서식에서 뽑은 이름으로 폴더명을 갱신한다 */
async function maybeUpdatePatientName(
  patientId: string,
  docType: DocType,
  formData?: Record<string, unknown>
): Promise<void> {
  const name = deriveNameFromForm(docType, formData);
  if (!name) return;
  const supabase = await getSupabaseServerClient();
  const { data: patient } = await supabase
    .from("patients")
    .select("name")
    .eq("id", patientId)
    .maybeSingle();
  const current = (patient?.name ?? "").trim();
  if (current && current !== DRAFT_PATIENT_NAME) return;
  await supabase
    .from("patients")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", patientId);
}

/** Collects every storage path referenced by a document (file_path + any signature/image field values) */
export function collectStoragePaths(doc: PatientDocument | null): string[] {
  if (!doc) return [];
  const paths: string[] = [];
  if (doc.file_path) paths.push(doc.file_path);
  // 스토리지 경로 형식: {owner_id}/{patient_id}/... (uuid/uuid/) 인 값만 수집
  const STORAGE_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\//i;
  for (const value of Object.values(doc.form_data ?? {})) {
    if (typeof value === "string" && STORAGE_PATH.test(value)) {
      paths.push(value);
    }
  }
  return paths;
}

export async function createSignedUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error) throw new Error(error.message);

  const result: Record<string, string> = {};
  (data ?? []).forEach((entry, i) => {
    if (entry?.signedUrl) result[paths[i]] = entry.signedUrl;
  });
  return result;
}

export async function uploadFile(
  path: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buffer, { contentType, upsert: true });
  if (error) throw new Error(error.message);
  return path;
}
