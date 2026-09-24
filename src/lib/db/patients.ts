import { getSupabaseServerClient } from "@/lib/supabase/server";
import { Patient, PatientDocument, PatientWithDocuments } from "./types";
import { createSignedUrls } from "./documents";

export async function listPatients(search?: string): Promise<PatientWithDocuments[]> {
  const supabase = await getSupabaseServerClient();
  let query = supabase.from("patients").select("*").order("updated_at", { ascending: false });

  if (search && search.trim()) {
    query = query.ilike("name", `%${search.trim()}%`);
  }

  const { data: patients, error } = await query;
  if (error) throw new Error(error.message);

  // 목록/배지는 doc_type·status·file_path만 사용 → 대용량 form_data(서명 base64 등)는 제외해 속도 개선
  const { data: documents, error: docsError } = await supabase
    .from("documents")
    .select("id, patient_id, doc_type, status, file_path, completed_at, updated_at");
  if (docsError) throw new Error(docsError.message);

  // 고객번호·증명사진 경로는 id_card의 form_data에만 있고 용량이 작음 → 별도 조회
  const { data: idDocs, error: idErr } = await supabase
    .from("documents")
    .select("patient_id, form_data")
    .eq("doc_type", "id_card");
  if (idErr) throw new Error(idErr.message);
  const idInfo = new Map<string, { customerNo: number | null; photoPath: string | null }>();
  for (const d of idDocs ?? []) {
    const fdt = ((d as { form_data?: Record<string, unknown> }).form_data ?? {}) as Record<string, unknown>;
    idInfo.set((d as { patient_id: string }).patient_id, {
      customerNo: typeof fdt.customer_no === "number" ? fdt.customer_no : null,
      photoPath: typeof fdt.photo_path === "string" ? fdt.photo_path : null,
    });
  }

  const documentsByPatient = new Map<string, PatientDocument[]>();
  for (const doc of documents ?? []) {
    const list = documentsByPatient.get(doc.patient_id) ?? [];
    // form_data는 목록에서 불필요 → 빈 객체 placeholder
    list.push({ ...(doc as object), form_data: {} } as PatientDocument);
    documentsByPatient.set(doc.patient_id, list);
  }

  const result: PatientWithDocuments[] = (patients ?? []).map((p) => {
    const docs = documentsByPatient.get(p.id) ?? [];
    return {
      ...(p as Patient),
      documents: docs,
      customer_no: idInfo.get(p.id)?.customerNo ?? null,
    };
  });

  // 신분증 증명사진(photo_path) 서명 URL 부여 → 포토ID 아바타
  const photoPaths: string[] = [];
  for (const p of result) {
    const pp = idInfo.get(p.id)?.photoPath;
    if (pp) photoPaths.push(pp);
  }
  if (photoPaths.length) {
    const signed = await createSignedUrls(photoPaths);
    for (const p of result) {
      const pp = idInfo.get(p.id)?.photoPath;
      p.photo_url = pp && signed[pp] ? signed[pp] : null;
    }
  }

  return result;
}

export async function getPatient(id: string): Promise<PatientWithDocuments | null> {
  const supabase = await getSupabaseServerClient();
  const { data: patient, error } = await supabase
    .from("patients")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!patient) return null;

  const { data: documents, error: docsError } = await supabase
    .from("documents")
    .select("*")
    .eq("patient_id", id);
  if (docsError) throw new Error(docsError.message);

  const docs = (documents ?? []) as PatientDocument[];
  const idDoc = docs.find((d) => d.doc_type === "id_card");
  const cn = idDoc?.form_data?.customer_no;
  return {
    ...(patient as Patient),
    documents: docs,
    customer_no: typeof cn === "number" ? cn : null,
  };
}

export async function createPatient(input: {
  name: string;
  resident_number?: string;
  phone?: string;
}): Promise<Patient> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("patients")
    .insert({
      name: input.name,
      resident_number: input.resident_number ?? null,
      phone: input.phone ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Patient;
}

export async function updatePatient(
  id: string,
  input: Partial<{ name: string; resident_number: string; phone: string }>
): Promise<Patient> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("patients")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Patient;
}

export async function deletePatient(id: string): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("patients").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
