import { getSupabaseServerClient } from "@/lib/supabase/server";
import { Patient, PatientDocument, PatientWithDocuments } from "./types";
import { createSignedUrls } from "./documents";
import { isRegisteredPatient } from "@/lib/patientStatus";

export interface ListPatientsResult {
  patients: PatientWithDocuments[];
  total: number;
  hasMore: boolean;
}

// 고객 매칭용 정규화 헬퍼
const normName = (s: string | null | undefined) => (s ?? "").replace(/\s/g, "");
const norm6 = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").slice(0, 6);
const phoneTail = (s: string | null | undefined) => {
  const d = (s ?? "").replace(/\D/g, "");
  return d.length >= 8 ? d.slice(-8) : d; // 끝 8자리로 비교(접두어·하이픈·010 유무 무시)
};

interface CustomerRec {
  customer_no: number;
  birth6: string;
  phoneTail: string;
}
export type CustomerIndex = Map<string, CustomerRec[]>; // 이름(공백제거) → 후보 목록

// customers(구글시트 동기화) 테이블을 이름 기준 인덱스로 로드(동명이인 대비 후보 배열)
async function buildCustomerIndex(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>
): Promise<CustomerIndex> {
  const index: CustomerIndex = new Map();
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("customer_no,name,birth6,phone")
      .range(0, 19999);
    if (error || !data) return index;
    for (const c of data as { customer_no: number; name: string; birth6: string; phone: string }[]) {
      if (!c.name) continue;
      const key = normName(c.name);
      const rec: CustomerRec = { customer_no: c.customer_no, birth6: norm6(c.birth6), phoneTail: phoneTail(c.phone) };
      const list = index.get(key);
      if (list) list.push(rec);
      else index.set(key, [rec]);
    }
  } catch {
    // customers 테이블 없거나 조회 실패 → 매칭 생략(저장된 번호만 사용)
  }
  return index;
}

// 이름 → 후보 중 생년월일·전화번호로 좁혀 고유번호 결정. 확정 못 하면 null.
function matchCustomerNo(
  index: CustomerIndex,
  name: string | null | undefined,
  birth6: string | null | undefined,
  phone: string | null | undefined
): number | null {
  const list = index.get(normName(name));
  if (!list || list.length === 0) return null;
  if (list.length === 1) return list[0].customer_no; // 동명이인 없음 → 바로 확정

  // 동명이인: 생년월일6 → 전화번호로 좁힌다
  const b6 = norm6(birth6);
  let pool = b6 ? list.filter((c) => c.birth6 === b6) : list;
  if (pool.length === 1) return pool[0].customer_no;
  if (pool.length === 0) pool = list; // 생년월일 불일치면 이름 전체 후보로 되돌려 전화번호로 시도

  const pt = phoneTail(phone);
  if (pt) {
    const byPhone = pool.filter((c) => c.phoneTail && c.phoneTail === pt);
    if (byPhone.length === 1) return byPhone[0].customer_no;
  }
  return null; // 여전히 모호 → 잘못된 번호를 표시하지 않음
}

// 이름의 동명이인 수(서로 다른 고유번호 기준)
function distinctNosForName(index: CustomerIndex, name: string | null | undefined): number[] {
  const list = index.get(normName(name));
  if (!list) return [];
  return [...new Set(list.map((c) => c.customer_no))].sort((a, b) => a - b);
}

// 동명이인 순번: 고유번호 오름차순에서 몇 번째인지(1부터). 동명이인 아니거나 번호 없으면 null
function dupRankOf(index: CustomerIndex, name: string | null | undefined, customerNo: number | null): number | null {
  if (customerNo == null) return null;
  const nos = distinctNosForName(index, name);
  if (nos.length <= 1) return null;
  const i = nos.indexOf(customerNo);
  return i >= 0 ? i + 1 : null;
}

// 최종 고유번호 결정: 라이브 매칭 우선. 동명이인이면 옛 저장번호로 폴백하지 않음(엉뚱한 쌍둥이 방지).
function resolveCustomerNo(
  index: CustomerIndex,
  name: string | null | undefined,
  birth6: string | null | undefined,
  phone: string | null | undefined,
  storedNo: number | null
): number | null {
  const live = matchCustomerNo(index, name, birth6, phone);
  if (live != null) return live;
  const isDup = distinctNosForName(index, name).length > 1;
  return isDup ? null : storedNo; // 동명이인이면 확정 못 할 때 번호 미표시
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

  const idInfo = new Map<string, { customerNo: number | null; photoPath: string | null; birth6: string | null }>();
  for (const d of idDocs ?? []) {
    const fdt = ((d as { form_data?: Record<string, unknown> }).form_data ?? {}) as Record<string, unknown>;
    idInfo.set((d as { patient_id: string }).patient_id, {
      customerNo: typeof fdt.customer_no === "number" ? fdt.customer_no : null,
      photoPath: typeof fdt.photo_path === "string" ? fdt.photo_path : null,
      birth6: typeof fdt.birth6 === "string" ? fdt.birth6 : null,
    });
  }

  // 고객 시트(customers)와 이름·생년월일6·전화번호로 실시간 매칭 → 시트를 나중에 갱신해도 목록 번호가 반영됨
  const custIndex = await buildCustomerIndex(supabase);

  const documentsByPatient = new Map<string, PatientDocument[]>();
  for (const doc of documents ?? []) {
    const list = documentsByPatient.get(doc.patient_id) ?? [];
    list.push({ ...(doc as object), form_data: {} } as PatientDocument); // form_data는 목록에서 불필요
    documentsByPatient.set(doc.patient_id, list);
  }

  const result: PatientWithDocuments[] = patientsRows.map((p) => {
    const info = idInfo.get(p.id);
    // 실시간 매칭(이름 → 생년월일6 → 전화번호). 동명이인이면 옛 저장번호로 폴백하지 않음
    const no = resolveCustomerNo(custIndex, p.name, info?.birth6, p.phone, info?.customerNo ?? null);
    return {
      ...(p as Patient),
      documents: documentsByPatient.get(p.id) ?? [],
      customer_no: no,
      name_dup_rank: dupRankOf(custIndex, p.name, no),
    };
  });

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

// 고유번호(customer_no)로 검색: 번호는 customers 매칭으로 파생되므로 전체 로드 후 계산·필터.
async function listPatientsByCustomerNo(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  numQuery: string
): Promise<ListPatientsResult> {
  const { data: patientsRaw, error } = await supabase
    .from("patients")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  const all = await attachDocsAndInfo(supabase, (patientsRaw ?? []) as Patient[]);
  const matched = all
    .filter(isRegisteredPatient)
    .filter((p) => p.customer_no != null && String(p.customer_no).startsWith(numQuery));
  return { patients: matched, total: matched.length, hasMore: false };
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

  // 숫자만 입력하면 고유번호 검색으로 처리(번호는 customers 매칭으로 파생되어 SQL 검색 불가)
  if (search && /^\d+$/.test(search)) {
    if (offset > 0) return { patients: [], total: 0, hasMore: false }; // 번호검색은 한 번에 반환
    try {
      return await listPatientsByCustomerNo(supabase, search);
    } catch {
      // 실패 시 아래 일반 검색으로 진행
    }
  }

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
  // 실시간 매칭: 고객시트(이름·생년월일6·전화번호)로 현재 번호 조회 → 시트 갱신 즉시 반영, 동명이인 구분
  const idBirth6 = typeof idDoc?.form_data?.birth6 === "string" ? (idDoc.form_data.birth6 as string) : null;
  const custIndex = await buildCustomerIndex(supabase);
  const storedCn = typeof cn === "number" ? cn : null;
  const resolvedCn = resolveCustomerNo(custIndex, (patient as Patient).name, idBirth6, (patient as Patient).phone, storedCn);

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
    customer_no: resolvedCn,
    name_dup_rank: dupRankOf(custIndex, (patient as Patient).name, resolvedCn),
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
