import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// 동명이인 매칭 진단용(임시). PII 원문(주민번호·전화·생년월일 값)은 반환하지 않고,
// customer_no(내부 참조번호)와 '일치 여부/존재 여부'만 반환한다.
const normName = (s: string | null | undefined) =>
  (s ?? "").replace(/\s*\(\s*\d+\s*\)\s*$/, "").replace(/\s/g, "");
const norm6 = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").slice(0, 6);
const phoneTail = (s: string | null | undefined) => {
  const d = (s ?? "").replace(/\D/g, "");
  return d.length >= 8 ? d.slice(-8) : d;
};

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name") ?? "";
  const key = normName(name);
  if (!key) return NextResponse.json({ error: "name 쿼리 필요(?name=이진우)" });
  const supabase = await getSupabaseServerClient();

  const { data: cust } = await supabase.from("customers").select("customer_no,name,birth6,phone");
  const sheetRaw = (cust ?? []).filter((c) => normName((c as { name: string }).name) === key) as {
    customer_no: number;
    birth6: string;
    phone: string;
  }[];
  const sheet = sheetRaw.map((c) => ({
    customer_no: c.customer_no,
    sheet_birth_digitlen: (c.birth6 ?? "").replace(/\D/g, "").length, // 값이 아닌 자릿수만
    phone_present: !!phoneTail(c.phone),
  }));

  const { data: pats } = await supabase
    .from("patients")
    .select("id,name,phone,resident_number,created_at");
  const matched = (pats ?? []).filter((p) => normName((p as { name: string }).name) === key) as {
    id: string;
    phone: string | null;
    resident_number: string | null;
    created_at: string;
  }[];

  const ids = matched.map((p) => p.id);
  const { data: idcards } = ids.length
    ? await supabase.from("documents").select("patient_id,form_data").eq("doc_type", "id_card").in("patient_id", ids)
    : { data: [] as { patient_id: string; form_data: Record<string, unknown> }[] };
  const idMap = new Map(
    (idcards ?? []).map((d) => [
      (d as { patient_id: string }).patient_id,
      ((d as { form_data?: Record<string, unknown> }).form_data ?? {}) as Record<string, unknown>,
    ])
  );

  const patientsDiag = matched.map((p) => {
    const fd = idMap.get(p.id) ?? {};
    const idB6 = norm6(typeof fd.birth6 === "string" ? fd.birth6 : "");
    const resB6 = norm6(p.resident_number);
    const storedNo = typeof fd.customer_no === "number" ? (fd.customer_no as number) : null;
    const pt = phoneTail(p.phone);
    const b6MatchNos = sheetRaw
      .filter((c) => norm6(c.birth6) && (norm6(c.birth6) === idB6 || norm6(c.birth6) === resB6))
      .map((c) => c.customer_no);
    const phoneMatchNos = pt
      ? sheetRaw.filter((c) => phoneTail(c.phone) && phoneTail(c.phone) === pt).map((c) => c.customer_no)
      : [];
    const rawFdBirth6 = typeof fd.birth6 === "string" ? fd.birth6 : "";
    const idDigitLen = rawFdBirth6.replace(/\D/g, "").length; // 값이 아닌 자릿수만(형식 확인용)
    // 값 노출 없이, 이 환자 birth6가 각 시트 birth6와 '전체/뒷자리로' 맞는지만 표시
    const matchFull = sheetRaw.filter((c) => norm6(c.birth6) && norm6(c.birth6) === idB6).map((c) => c.customer_no);
    const idDigits = rawFdBirth6.replace(/\D/g, "");
    const idLast6 = idDigits.length >= 6 ? idDigits.slice(-6) : idDigits; // 8자리(YYYYMMDD) 저장 의심 시 뒤6자리 비교
    const matchLast6 = sheetRaw.filter((c) => norm6(c.birth6) && norm6(c.birth6) === idLast6).map((c) => c.customer_no);
    return {
      created_at: p.created_at,
      idcard_birth_digitlen: idDigitLen, // 6이면 정상형식, 8이면 YYYYMMDD로 저장돼 앞6자르기 어긋남
      resident_number_present: !!resB6,
      phone_present: !!pt,
      stored_customer_no: storedNo,
      match_front6_customer_no: matchFull, // 현재 로직(앞6)으로 매칭되는 번호
      match_last6_customer_no: matchLast6, // 뒤6자리로 매칭되는 번호(형식오류 판별)
      phone_matches_customer_no: phoneMatchNos,
    };
  });

  return NextResponse.json({ name: key, patient_count: matched.length, sheet, patients: patientsDiag });
}
