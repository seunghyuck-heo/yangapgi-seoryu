import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// 이름 + 생년월일6으로 고객 참조 테이블에서 고유번호(customer_no) 조회
export async function POST(req: Request) {
  let name = "";
  let birth6 = "";
  try {
    const body = await req.json();
    name = typeof body?.name === "string" ? body.name.trim() : "";
    birth6 = typeof body?.birth6 === "string" ? body.birth6.replace(/\D/g, "").slice(0, 6) : "";
  } catch {
    // ignore
  }
  if (!name || birth6.length !== 6) {
    return NextResponse.json({ customer_no: null });
  }
  try {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("customers")
      .select("customer_no")
      .eq("name", name)
      .eq("birth6", birth6)
      .limit(1)
      .maybeSingle();
    if (error) return NextResponse.json({ customer_no: null });
    return NextResponse.json({ customer_no: data?.customer_no ?? null });
  } catch {
    return NextResponse.json({ customer_no: null });
  }
}
