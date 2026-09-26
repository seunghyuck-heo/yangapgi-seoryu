import { getSupabaseServerClient } from "@/lib/supabase/server";
import { Patient, PatientDocument, PatientWithDocuments } from "./types";
import { createSignedUrls } from "./documents";
import { isRegisteredPatient } from "@/lib/patientStatus";

export interface ListPatientsResult {
  patients: PatientWithDocuments[];
  total: number;
  hasMore: boolean;
}

// 주어진 환자 행들에 문서(경량)·고객번호·증명사진 URL을 붙인다. (form_data 본문은 제외해 속도/용량 최적화)
async function attachDocsAndInfo(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  patientsRows: Patient[]
): Promise<PatientWithDocuments[]> {
  const ids = patientsRows.map((p) => p.id);
  if (ids.length === 0) return [];

  const { data: documents, error: docsError } = await supabase
    .from("documents")
    .select("id, patient_id, doc_type, status, file_path, completed_at, updated_at")
    .in("patient_id", ids);
  if (docsError) throw new Error(docsError.message);

  // 고객번호·증명사진 경로는 id_card form_data(소용량)에만 있음 → 별도 조회
  const { data: idDocs, error: idErr } = await supabase
    .from("documents")
    .select("patient_id, form_data")
    .eq("doc_type", "id_card")
    .in("patient_id", ids);
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
    list.push({ ...(doc as object), form_data: {} } as PatientDocument); // form_data는 목록에서 불필요
    documentsByPatient.set(doc.patient_id, list);
  }

  const result: PatientWithDocuments[] = patientsRows.map((p) => ({
    ...(p as Patient),
    documents: documentsByPatient.get(p.id) ?? [],
    customer_no: idInfo.get(p.id)?.customerNo ?? null,
  }));

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

// RPC 미설치(마이그레이션 전) 시 사용하는 폴백: 전체 조회 후 등록 환자만 필터(기존과 동일 동작)
async function listPatientsFallback(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  search: string | null
): Promise<ListPatientsResult> {
  let query = supabase.from("patients").select("*").order("updated_at", { ascending: false });
  if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
  const { data: patientsRaw, error } = await query;
  if (error) throw new Error(error.message);
  const all = await attachDocsAndInfo(supabase, (patientsRaw ?? []) as Patient[]);
  const registered = all.filter(isRegisteredPatient);
  return { patients: registered, total: registered.length, hasMore: false };
}

// 등록 환자 목록(서버 페이지네이션 + 검색 + 총원). RPC가 있으면 사용하고, 없으면 폴백.
export async function listPatients(opts?: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<ListPatientsResult> {
  const supabase = await getSupabaseServerClient();
  const search = opts?.search?.trim() || null;
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  const { data: pageRows, error: rpcErr } = await supabase.rpc("list_registered_patients", {
    p_search: search,
    p_limit: limit,
    p_offset: offset,
  });

  if (rpcErr || !pageRows) {
    return listPatientsFallback(supabase, search); // 마이그레이션 전/오류 시 안전 폴백
  }

  const rows = pageRows as Patient[];

  // 자가복구: RPC가 첫 페이지에서 0명을 돌려줬지만 실제로는 저장된 문서가 있는 환자가
  // 있을 수 있음(RPC 함수 상태 불일치 대비) → 문서 상태 기반 폴백으로 교차 확인.
  if (rows.length === 0 && offset === 0) {
    const fb = await listPatientsFallback(supabase, search);
    if (fb.patients.length > 0) return fb;
  }

  const patients = await attachDocsAndInfo(supabase, rows);

  let total = offset + rows.length;
  const { data: cnt, error: cntErr } = await supabase.rpc("count_registered_patients", {
    p_search: search,
  });
  if (!cntErr && cnt != null) total = Number(cnt);

  return { patients, total, hasMore: offset + rows.length < total };
}

// 배지용: 등록 환자 총원만 (문서 조회 없이 가볍게)
export async function countRegisteredPatients(search?: string): Promise<number> {
  const supabase = await getSupabaseServerClient();
  const s = search?.trim() || null;
  const { data: cnt, error } = await supabase.rpc("count_registered_patients", { p_search: s });
  if (!error && cnt != null) {
    const n = Number(cnt);
    if (n > 0) return n;
    // 0이면 RPC 상태 불일치 가능성 → 폴백으로 교차 확인
    const fb = await listPatientsFallback(supabase, s);
    return fb.total > 0 ? fb.total : n;
  }
  // 폴백: 전체 조회 후 필터 개수
  const fb = await listPatientsFallback(supabase, s);
  return fb.total;
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

  // 환자관리카드 방문점검 서명(guardianSign)이 스토리지 경로면 서명 URL로 변환
  const STORAGE_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\//i;
  const signPaths: string[] = [];
  const careDoc = docs.find((d) => d.doc_type === "care_card");
  const visits = (careDoc?.form_data as { visits?: Array<{ guardianSign?: string }> } | undefined)?.visits;
  if (Array.isArray(visits)) {
    for (const v of visits) {
      if (typeof v?.guardianSign === "string" && STORAGE_PATH.test(v.guardianSign)) {
        signPaths.push(v.guardianSign);
      }
    }
  }
  let signedUrls: Record<string, string> | undefined;
  if (signPaths.length) {
    try {
      signedUrls = await createSignedUrls(signPaths);
    } catch {
      signedUrls = undefined;
    }
  }

  return {
    ...(patient as Patient),
    documents: docs,
    customer_no: typeof cn === "number" ? cn : null,
    signedUrls,
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
