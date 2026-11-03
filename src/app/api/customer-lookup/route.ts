import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { CustomerSheetConfigError, fetchCustomerRows } from "@/lib/google/customerSheet";
import { normName } from "@/lib/db/customerMatch";

export const runtime = "nodejs";

// 등록 시점, 직원이 수기 입력한 '이름'으로 구글시트(고객파일)를 실시간 조회해
// 주민번호(전체)·연락처·고유번호를 가져온다. (신분증 OCR 대체 — 이름→시트에서 정보 pull)
//  · 동명이인은 시트에서 "홍길동", "홍길동(2)"로 구분 → normName 으로 묶어 후보 목록 반환.
//  · 후보가 2명↑이면 클라이언트가 선택창을 띄워 직원이 고른다(이름만으론 남의 주민번호 못 붙임).
//  · 주민번호 전체는 응답(전송)에서만 다루고 DB엔 저장하지 않는다.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  let name = "";
  try {
    const body = await req.json();
    name = typeof body?.name === "string" ? body.name.trim() : "";
  } catch {
    // ignore
  }
  const key = normName(name);
  if (!key) return NextResponse.json({ candidates: [] });

  try {
    const { rows } = await fetchCustomerRows();
    const candidates = rows
      .filter((r) => normName(r.name) === key)
      .sort((a, b) => a.customer_no - b.customer_no)
      .map((r) => ({
        customer_no: r.customer_no,
        name: r.name,
        rrn: r.rrn, // 주민번호 전체(13) 또는 ""(시트 미기재)
        birth6: r.birth6,
        phone: r.phone,
        region: r.region,
        chart: r.chart,
      }));
    return NextResponse.json({ candidates });
  } catch (e) {
    if (e instanceof CustomerSheetConfigError) {
      return NextResponse.json({ error: e.message, candidates: [] }, { status: 501 });
    }
    return NextResponse.json({ error: (e as Error).message, candidates: [] }, { status: 500 });
  }
}
