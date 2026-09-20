import { NextRequest, NextResponse } from "next/server";
import { getPatient } from "@/lib/db/patients";
import { collectStoragePaths, downloadStorageAsDataUrls } from "@/lib/db/documents";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

// 완료된 서류 묶음(PDF) 렌더링에 필요한 이미지(서명·증명사진·신분증)를
// 서버에서 직접 내려받아 base64 data URL로 반환한다 (캔버스 taint/CORS 회피).
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const patient = await getPatient(id);
    if (!patient) {
      return NextResponse.json({ error: "환자를 찾을 수 없습니다" }, { status: 404 });
    }

    const paths: string[] = [];
    for (const doc of patient.documents) {
      if (doc.status !== "completed") continue;
      for (const p of collectStoragePaths(doc)) paths.push(p);
    }

    const images = await downloadStorageAsDataUrls(paths);
    return NextResponse.json({ images });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
