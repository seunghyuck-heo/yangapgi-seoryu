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

  const { data: documents, error: docsError } = await supabase
    .from("documents")
    .select("*");
  if (docsError) throw new Error(docsError.message);

  const documentsByPatient = new Map<string, PatientDocument[]>();
  for (const doc of documents ?? []) {
    const list = documentsByPatient.get(doc.patient_id) ?? [];
    list.push(doc as PatientDocument);
    documentsByPatient.set(doc.patient_id, list);
  }

  const result: PatientWithDocuments[] = (patients ?? []).map((p) => ({
    ...(p as Patient),
    documents: documentsByPatient.get(p.id) ?? [],
  }));

  // 신분증 증명사진(photo_path) 서명 URL 부여 → 포토ID 아바타
  const photoPaths: string[] = [];
  for (const p of result) {
    const idDoc = p.documents.find((d) => d.doc_type === "id_card");
    const pp = idDoc?.form_data?.photo_path;
    if (typeof pp === "string" && pp) photoPaths.push(pp);
  }
  if (photoPaths.length) {
    const signed = await createSignedUrls(photoPaths);
    for (const p of result) {
      const idDoc = p.documents.find((d) => d.doc_type === "id_card");
      const pp = idDoc?.form_data?.photo_path;
      p.photo_url = typeof pp === "string" && signed[pp] ? signed[pp] : null;
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

  return { ...(patient as Patient), documents: (documents ?? []) as PatientDocument[] };
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
