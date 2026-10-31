import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// 임시 진단용: 이름으로 시트(customers) 후보 + 웹앱 환자의 계산된 생년월일6을 비교.
// 주민번호 전체는 노출하지 않고 앞 6자리(생년월일, /customers에 이미 보이는 값)만 반환.
//   사용: /api/customers/debug?name=이진우   (로그인 상태에서 브라우저로 열기)

const norm6 = (s: unknown) =>
  typeof s === "string" ? s.replace(/\D/g, "").slice(0, 6) : "";
const pick6 = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const d = v.replace(/\D/g, "").slice(0, 6);
  return d.length === 6 ? d : null;
};
const baseName = (s: string) => (s ?? "").replace(/\s*\(\s*\d+\s*\)\s*$/, "").trim();

export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get("name")?.trim() ?? "";
  if (!name) return NextResponse.json({ error: "name 파라미터 필요" }, { status: 400 });
  const base = baseName(name);
  const supabase = await getSupabaseServerClient();

  // 1) 시트 후보: 이름이 base로 시작하는 고객(접미사 "(2)" 포함) 모두
  const custRes = await supabase
    .from("customers")
    .select("customer_no,name,birth6,phone")
    .ilike("name", `${base}%`);

  // 2) 웹앱 환자: 이름이 base로 시작
  const patRes = await supabase
    .from("patients")
    .select("id,name,phone,resident_number")
    .ilike("name", `${base}%`);
  const patients = (patRes.data ?? []) as {
    id: string; name: string; phone: string | null; resident_number: string | null;
  }[];

  // 3) 각 환자의 신분증/급여신청서/위임장 form_data → 생년월일6 산출
  const ids = patients.map((p) => p.id);
  const docsRes = ids.length
    ? await supabase
        .from("documents")
        .select("patient_id, doc_type, form_data")
        .in("doc_type", ["id_card", "subsidy_application", "power_of_attorney"])
        .in("patient_id", ids)
    : { data: [] as unknown[] };
  const fdBy = new Map<string, Record<string, Record<string, unknown>>>();
  for (const d of (docsRes.data ?? []) as { patient_id: string; doc_type: string; form_data: Record<string, unknown> }[]) {
    const m = fdBy.get(d.patient_id) ?? {};
    m[d.doc_type] = d.form_data ?? {};
    fdBy.set(d.patient_id, m);
  }

  const patientInfo = patients.map((p) => {
    const docs = fdBy.get(p.id) ?? {};
    const sub = docs["subsidy_application"] ?? {};
    const poa = docs["power_of_attorney"] ?? {};
    const idc = docs["id_card"] ?? {};
    const sources = {
      subsidy_patient_rrn6: pick6(sub.patient_rrn),
      poa_insured_rrn6: pick6(poa.insured_rrn),
      idcard_birth6: pick6(idc.birth6),
      patient_resident6: norm6(p.resident_number) || null,
      stored_customer_no: typeof idc.customer_no === "number" ? idc.customer_no : null,
    };
    const computedBirth6 =
      sources.subsidy_patient_rrn6 ||
      sources.poa_insured_rrn6 ||
      sources.idcard_birth6 ||
      sources.patient_resident6 ||
      null;
    return { id: p.id, name: p.name, phone: p.phone, computedBirth6, sources };
  });

  return NextResponse.json({
    query: { name, base },
    sheetCandidates: (custRes.data ?? []).map((c) => ({
      customer_no: (c as { customer_no: number }).customer_no,
      name: (c as { name: string }).name,
      birth6: (c as { birth6: string | null }).birth6,
      phone: (c as { phone: string | null }).phone,
    })),
    patients: patientInfo,
    errors: {
      customers: custRes.error?.message ?? null,
      patients: patRes.error?.message ?? null,
    },
  });
}
