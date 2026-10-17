import { NextRequest, NextResponse } from "next/server";
import { collectStoragePaths, downloadStorageAsDataUrls, listPatientDocuments } from "@/lib/db/documents";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

// 완료된 서류 묶음(PDF) 렌더링에 필요한 이미지(서명·증명사진·신분증)를
// 서버에서 직접 내려받아 base64 data URL로 반환한다 (캔버스 taint/CORS 회피).
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    // 묶음 렌더엔 문서만 필요 → 고객시트/동명이인 로드 없는 가벼운 조회(getPatient 대체)
    const docs = await listPatientDocuments(id);

    const paths: string[] = [];
    for (const doc of docs) {
      if (doc.status !== "completed") continue;
      for (const p of collectStoragePaths(doc)) paths.push(p);
    }

    const images = await downloadStorageAsDataUrls(paths);
    return NextResponse.json({ images });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
