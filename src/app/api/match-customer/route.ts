import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { indexCustomers, needsReason, queryBase, resolveCustomerNo } from "@/lib/db/customerMatch";

// 이름 + 주민번호(생년월일6)로 구글시트(customers)와 '오늘 만든 매칭 로직'으로 대조한다.
// (신분증 OCR로 주민번호가 들어오는 순간 호출 → 이 사람이 시트에 있는지 즉시 판별)
//  · 접미사 "(2)" 동명이인까지 조회(ilike base), resolveCustomerNo로 판정.
//  · 반환: customer_no(확정 시) / needs(시트 미등록 → '번호 추가 필요') / status.
//  · 신분증 단계엔 전화번호가 없어 phone 생략(주민번호 오타는 이후 서식 작성 때 전화로 구제됨).
export async function POST(req: Request) {
  let name = "";
  let birth6 = "";
  let phone: string | null = null;
  try {
    const body = await req.json();
    name = typeof body?.name === "string" ? body.name.trim() : "";
    birth6 = typeof body?.birth6 === "string" ? body.birth6.replace(/\D/g, "").slice(0, 6) : "";
    phone = typeof body?.phone === "string" && body.phone.trim() ? body.phone : null;
  } catch {
    // ignore
  }
  const base = queryBase(name);
  if (!base) return NextResponse.json({ customer_no: null, status: "unknown" });

  try {
    const supabase = await getSupabaseServerClient();
    let rows: { customer_no: number; name: string; birth6: string; phone: string }[] = [];
    try {
      const { data } = await supabase
        .from("customers")
        .select("customer_no,name,birth6,phone")
        .or(`name.ilike.${base}*`);
      rows = (data ?? []) as typeof rows;
    } catch {
      // 조회 실패 → 미매칭 취급
    }
    const index = indexCustomers(rows);
    const resolved = resolveCustomerNo(index, name, birth6 || null, phone, null);
    const customer_no = typeof resolved === "number" ? resolved : null;
    const needs = resolved === "needs";
    return NextResponse.json({
      customer_no,
      needs,
      status: typeof resolved === "number" ? "matched" : needs ? "needs" : "unknown",
      reason: needs ? needsReason(index, name) : undefined, // 'name_absent' | 'rrn_mismatch'
    });
  } catch {
    return NextResponse.json({ customer_no: null, status: "unknown" });
  }
}
