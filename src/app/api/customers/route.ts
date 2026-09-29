import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// 고객 참조 리스트 (고유번호 오름차순). 로그인(RLS) 필요.
export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("customers")
      .select("customer_no,name,region,chart,birth6,phone,insurance")
      .order("customer_no", { ascending: true })
      .range(0, 19999); // Supabase 기본 1000행 제한 회피(전체 로드) → 1000번 이후 번호도 검색 가능
    if (error) return NextResponse.json({ customers: [], error: error.message });
    return NextResponse.json({ customers: data ?? [] });
  } catch (e) {
    return NextResponse.json({ customers: [], error: (e as Error).message });
  }
}
