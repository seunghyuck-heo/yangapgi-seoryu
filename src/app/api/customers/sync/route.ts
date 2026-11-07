import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { CustomerSheetConfigError, fetchCustomerRows } from "@/lib/google/customerSheet";

export const runtime = "nodejs";

// 구글 시트(고객파일) → Supabase customers 동기화 (서비스 계정으로 읽기, 노란색=탈퇴 제외)
// customers 에는 주민번호 앞 6자리(birth6)만 저장한다(PII 최소화). 전체 주민번호는 저장하지 않음.
export async function GET(request: Request) {
  const debug = new URL(request.url).searchParams.get("debug") === "1";
  try {
    const { title, totalRows, skippedYellow, rows } = await fetchCustomerRows();

    if (debug) {
      return NextResponse.json({ title, totalRows, parsed: rows.length, skippedYellow, sample: rows.slice(0, 5) });
    }

    // Supabase 반영 (전체 교체) — customers 테이블 컬럼: customer_no,name,region,chart,birth6,phone,insurance
    const dbRows = rows.map((r) => ({
      customer_no: r.customer_no,
      name: r.name,
      region: r.region,
      chart: r.chart,
      birth6: r.birth6,
      phone: r.phone,
      insurance: r.gongdanNo, // customers.insurance 컬럼 = 시트 I열(공단관리번호)
    }));

    const supabase = await getSupabaseServerClient();
    const del = await supabase.from("customers").delete().neq("customer_no", -999999);
    if (del.error) throw new Error(`삭제 실패: ${del.error.message}`);
    if (dbRows.length) {
      const ins = await supabase.from("customers").insert(dbRows);
      if (ins.error) throw new Error(`입력 실패: ${ins.error.message}`);
    }

    return NextResponse.json({ ok: true, count: dbRows.length, skippedYellow });
  } catch (e) {
    if (e instanceof CustomerSheetConfigError) {
      return NextResponse.json({ error: e.message }, { status: 501 });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
