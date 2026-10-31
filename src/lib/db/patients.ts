import { getSupabaseServerClient } from "@/lib/supabase/server";
import { Patient, PatientDocument, PatientWithDocuments } from "./types";
import { createSignedUrls } from "./documents";
import { isRegisteredPatient } from "@/lib/patientStatus";
import { DOC_TYPE_ORDER } from "@/lib/templates/types";
// 고객(구글시트=customers) 매칭 순수 로직은 customerMatch.ts로 분리(단위 테스트 가능).
import {
  CustomerIndex,
  indexCustomers,
  needsReason,
  pick6,
  queryBase,
  resolveCustomerNo,
  sheetDupRank,
} from "./customerMatch";

export interface ListPatientsResult {
  patients: PatientWithDocuments[];
  total: number;
  hasMore: boolean;
}

// form_data 값에서 공백 아닌 문자열만 꺼낸다(아니면 "").
const pickStr = (v: unknown): string => (typeof v === "string" && v.trim() ? v : "");

// B안: 고객(customers) 전체를 통째로 읽지 않고, '그 화면에 보이는 환자 이름들'에
// 해당하는 고객만 조회한다 → egress·지연이 전체 데이터량과 무관하게 작게 유지됨.
// 시트에 동명이인이 "이진우(2)"처럼 접미사로 저장될 수 있어, base로 '시작하는' 이름(접미사 포함)을
// ilike로 모두 가져온다. 정확 일치(.in)로는 "이진우(2)" 행을 놓쳐, 번호가 있는데도 '번호 추가 필요'로
// 뜨던 원인이었음. (과다수집돼도 normName 키로 묶고 matchCustomerNo가 정확 키로만 조회하므로 매칭엔 무해)
async function buildCustomerIndex(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  names: string[]
): Promise<CustomerIndex> {
  const bases = Array.from(new Set(names.map(queryBase).filter((n) => n)));
  if (bases.length === 0) return new Map();
  type Row = { customer_no: number; name: string; birth6: string; phone: string };
  try {
    const orFilter = bases.map((b) => `name.ilike.${b}*`).join(",");
    const { data, error } = await supabase
      .from("customers")
      .select("customer_no,name,birth6,phone")
      .or(orFilter);
    if (error || !data) {
      // ilike 실패 시 정확 일치로 폴백(최소한 접미사 없는 행은 매칭)
      const exact = await supabase.from("customers").select("customer_no,name,birth6,phone").in("name", bases);
      return indexCustomers((exact.error ? [] : (exact.data ?? [])) as Row[]);
    }
    return indexCustomers(data as Row[]);
  } catch {
    // customers 테이블 없거나 조회 실패 → 매칭 생략(저장된 번호만 사용)
    return new Map();
  }
}

// 주어진 환자 행들에 문서(경량)·고객번호·증명사진 URL을 붙인다. (form_data 본문은 제외해 속도/용량 최적화)
async function attachDocsAndInfo(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  patientsRows: Patient[]
): Promise<PatientWithDocuments[]> {
  const ids = patientsRows.map((p) => p.id);
  if (ids.length === 0) return [];

  // 독립적인 Supabase 쿼리 3개를 병렬 실행(순차 → 병렬로 목록 로딩 지연 대폭 단축).
  //  ① 문서 상태(경량)  ② 신분증/급여/위임 form_data(번호·생년월일)  ③ 고객시트 인덱스
  //  ③은 B안: 이 화면에 보이는 환자 '이름들'에 해당하는 고객만 조회(전체 로드 X).
  const names = patientsRows.map((p) => p.name);
  const [docsRes, infoRes, custIndex] = await Promise.all([
    supabase
      .from("documents")
      .select("id, patient_id, doc_type, status, file_path, completed_at, updated_at")
      .in("patient_id", ids),
    supabase
      .from("documents")
      .select("patient_id, doc_type, form_data")
      .in("doc_type", ["id_card", "subsidy_application", "power_of_attorney"])
      .in("patient_id", ids),
    buildCustomerIndex(supabase, names),
  ]);
  if (docsRes.error) throw new Error(docsRes.error.message);
  if (infoRes.error) throw new Error(infoRes.error.message);
  const documents = docsRes.data;
  const infoDocs = infoRes.data;

  const fdByPatient = new Map<string, Record<string, Record<string, unknown>>>();
  for (const d of infoDocs ?? []) {
    const pid = (d as { patient_id: string }).patient_id;
    const dt = (d as { doc_type: string }).doc_type;
    const fd = ((d as { form_data?: Record<string, unknown> }).form_data ?? {}) as Record<string, unknown>;
    const m = fdByPatient.get(pid) ?? {};
    m[dt] = fd;
    fdByPatient.set(pid, m);
  }

  const idInfo = new Map<string, { customerNo: number | null; photoPath: string | null; birth6: string | null; phone: string | null }>();
  for (const [pid, docs] of fdByPatient) {
    const idc = docs["id_card"] ?? {};
    const sub = docs["subsidy_application"] ?? {};
    const poa = docs["power_of_attorney"] ?? {};
    // 생년월일6: 직원이 서류에 수기입력한 주민번호(급여신청서→위임장)를 OCR보다 우선.
    // 신분증 OCR은 오독 가능성이 있어 맨 뒤로(수기 값이 없을 때만).
    const birth6 =
      pick6(sub.patient_rrn) || pick6(poa.insured_rrn) || pick6(idc.birth6) || null;
    // 전화번호: 환자 폰(급여신청서 휴대전화 → 위임장 전화). patients.phone는 비어 있는 경우가 많아
    // 서류 form_data에서 꺼낸다. (주민번호 오타 시 전화로 같은 사람을 구제하는 데 쓰임)
    const phone = pickStr(sub.patient_mobile_phone) || pickStr(poa.delegator_phone) || null;
    idInfo.set(pid, {
      customerNo: typeof idc.customer_no === "number" ? (idc.customer_no as number) : null,
      photoPath: typeof idc.photo_path === "string" ? (idc.photo_path as string) : null,
      birth6,
      phone,
    });
  }

  // custIndex(고객시트 인덱스)는 위 Promise.all에서 병렬로 미리 조회함.
  const documentsByPatient = new Map<string, PatientDocument[]>();
  for (const doc of documents ?? []) {
    const list = documentsByPatient.get(doc.patient_id) ?? [];
    list.push({ ...(doc as object), form_data: {} } as PatientDocument); // form_data는 목록에서 불필요
    documentsByPatient.set(doc.patient_id, list);
  }

  const result: PatientWithDocuments[] = patientsRows.map((p) => {
    const info = idInfo.get(p.id);
    // 생년월일6: 신분증 OCR(birth6) 없으면 환자 주민번호 앞 6자리로 보완 → 동명이인 특정 성공률↑
    const birth6 = info?.birth6 || (p as Patient).resident_number || null;
    // 전화: 서류에서 꺼낸 값 우선, 없으면 patients.phone.
    const phone = info?.phone || p.phone || null;
    // 실시간 매칭(이름 → 생년월일6 → 전화번호). 동명이인이면 옛 저장번호로 폴백하지 않음
    const no = resolveCustomerNo(custIndex, p.name, birth6, phone, info?.customerNo ?? null);
    const numNo = typeof no === "number" ? no : null;
    return {
      ...(p as Patient),
      documents: documentsByPatient.get(p.id) ?? [],
      customer_no: numNo,
      customer_no_needed: no === "needs",
      name_dup_rank: sheetDupRank(custIndex, p.name, no),
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

  // 동명이인 (N) 순번은 오직 시트(customers) 기준(sheetDupRank)으로만 매긴다.
  // 예전엔 '웹앱 환자 등록순' 전역 override가 시트 순번을 덮어써서, 시트엔 1명뿐인데 웹앱에
  // 같은 이름이 2개면 엉뚱하게 (2)가 붙는 문제가 있었음(이강호 오표기). → override 제거.

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

  // 목록 가공과 총원 count는 서로 독립 → 병렬 실행
  const [patients, cntRes] = await Promise.all([
    attachDocsAndInfo(supabase, rows),
    supabase.rpc("count_registered_patients", { p_search: search }),
  ]);

  let total = offset + rows.length;
  if (!cntRes.error && cntRes.data != null) total = Number(cntRes.data);

  return { patients, total, hasMore: offset + rows.length < total };
}

/** 서식제출 화면 '현재 작성 중인 환자' 섹션용: 등록됐지만 5종이 전부 완료되진 않은 환자를
 *  환자보기 리스트와 동일한 형태(PatientWithDocuments: 사진·고유번호·동명이인번호·진행수)로
 *  반환. 정렬도 환자보기와 동일(updated_at 내림차순). 5종 모두 완료되면 목록에서 빠진다. */
export async function listInProgressPatients(): Promise<PatientWithDocuments[]> {
  const supabase = await getSupabaseServerClient();

  // 1) 작성 중(등록&미완료) 환자 ID만 가볍게 추린다(필수 5종의 상태/파일만 조회).
  const { data: docs, error } = await supabase
    .from("documents")
    .select("patient_id, doc_type, status, file_path")
    .in("doc_type", DOC_TYPE_ORDER);
  if (error) throw new Error(error.message);
  type DocRow = { patient_id: string; doc_type: string; status: string; file_path: string | null };
  const agg = new Map<string, { completed: Set<string>; registered: boolean }>();
  for (const d of (docs ?? []) as DocRow[]) {
    const e = agg.get(d.patient_id) ?? { completed: new Set<string>(), registered: false };
    if (d.status === "completed") e.completed.add(d.doc_type);
    if (d.status === "completed" || d.status === "draft" || d.file_path) e.registered = true;
    agg.set(d.patient_id, e);
  }
  const ids: string[] = [];
  for (const [pid, e] of agg) {
    if (e.registered && e.completed.size < DOC_TYPE_ORDER.length) ids.push(pid);
  }
  if (ids.length === 0) return [];

  // 2) 그 환자 행만 로드(환자보기와 동일한 정렬: updated_at desc).
  const { data: rows, error: e2 } = await supabase
    .from("patients")
    .select("*")
    .in("id", ids)
    .order("updated_at", { ascending: false });
  if (e2) throw new Error(e2.message);

  // '직접 완료'로 처리된 환자는 작성 중에서 제외(완료처럼 취급).
  const inProgressRows = ((rows ?? []) as Patient[]).filter((p) => !p.manual_complete);
  if (inProgressRows.length === 0) return [];

  // 3) 사진·고유번호·동명이인번호·문서상태를 '작성 중 환자들만' 붙인다.
  //    (전체 환자에 대해 사진 서명URL을 만들던 기존 방식 대비 크게 빨라짐)
  return attachDocsAndInfo(supabase, inProgressRows);
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

  // 1) 환자행 + 문서 먼저 조회(병렬). 이름을 알아야 B안 조회(고객/동명이인)를 할 수 있음.
  const [patientRes, docsRes] = await Promise.all([
    supabase.from("patients").select("*").eq("id", id).maybeSingle(),
    supabase.from("documents").select("*").eq("patient_id", id),
  ]);
  if (patientRes.error) throw new Error(patientRes.error.message);
  const patient = patientRes.data;
  if (!patient) return null;
  if (docsRes.error) throw new Error(docsRes.error.message);
  const docs = (docsRes.data ?? []) as PatientDocument[];

  // 2) 이 환자 이름에 해당하는 고객(시트)만 조회(전체 로드 X).
  const names = [(patient as Patient).name];
  const custIndex = await buildCustomerIndex(supabase, names);

  const idDoc = docs.find((d) => d.doc_type === "id_card");
  const subDoc = docs.find((d) => d.doc_type === "subsidy_application");
  const poaDoc = docs.find((d) => d.doc_type === "power_of_attorney");
  const cn = idDoc?.form_data?.customer_no;
  // 생년월일6: 직원 수기입력 주민번호(급여신청서→위임장)를 OCR보다 우선. 신분증 OCR은 맨 뒤.
  const idBirth6 =
    pick6(subDoc?.form_data?.patient_rrn) ||
    pick6(poaDoc?.form_data?.insured_rrn) ||
    pick6(idDoc?.form_data?.birth6) ||
    pick6((patient as Patient).resident_number) ||
    null;
  // 전화: 서류(급여 휴대전화→위임장 전화)에서 꺼낸 값 우선, 없으면 patients.phone.
  const matchPhone =
    pickStr(subDoc?.form_data?.patient_mobile_phone) ||
    pickStr(poaDoc?.form_data?.delegator_phone) ||
    (patient as Patient).phone ||
    null;
  const storedCn = typeof cn === "number" ? cn : null;
  const resolvedCnRaw = resolveCustomerNo(custIndex, (patient as Patient).name, idBirth6, matchPhone, storedCn);
  const resolvedCn = typeof resolvedCnRaw === "number" ? resolvedCnRaw : null;

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
    customer_no_needed: resolvedCnRaw === "needs",
    customer_no_hint: resolvedCnRaw === "needs" ? needsReason(custIndex, (patient as Patient).name) : undefined,
    name_dup_rank: sheetDupRank(custIndex, (patient as Patient).name, resolvedCnRaw),
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
  input: Partial<{ name: string; resident_number: string; phone: string; manual_complete: boolean }>
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
