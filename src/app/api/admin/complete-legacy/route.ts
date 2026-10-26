import { NextResponse } from "next/server";
import { listLegacyCompleteCandidates, markLegacyCompleteAll } from "@/lib/db/patients";

// 일회성 관리 작업: '기존 5종 완료' 환자를 직접완료로 처리(6번째 서류 추가 후 작성중에서 제외).
// GET = 미리보기(대상 명단), POST = 실제 처리. 로그인(세션 RLS) 상태에서만 본인 환자가 조회·수정됨.

export async function GET() {
  try {
    const candidates = await listLegacyCompleteCandidates();
    return NextResponse.json({ count: candidates.length, candidates });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const result = await markLegacyCompleteAll();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
