import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// 고객 참조 리스트 (고유번호 오름차순). 로그인(RLS) 필요.
export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("customers")
      .select("customer_no,name,region,chart,birth6,phone,insurance")
      .order("customer_no", { ascending: true });
    if (error) return NextResponse.json({ customers: [], error: error.message });
    return NextResponse.json({ customers: data ?? [] });
  } catch (e) {
    return NextResponse.json({ customers: [], error: (e as Error).message });
  }
}
