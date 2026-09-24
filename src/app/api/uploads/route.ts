import { NextRequest, NextResponse } from "next/server";
import { uploadFile } from "@/lib/db/documents";
import { getCurrentUser } from "@/lib/supabase/server";
import { DOC_TYPE_LABELS, DocType } from "@/lib/templates/types";

function isValidDocType(value: string): value is DocType {
  // 5개 기본 서류 + 지속관리 서류(care_card) 서명/이미지 업로드 허용
  return Object.prototype.hasOwnProperty.call(DOC_TYPE_LABELS, value);
}

function parseDataUrl(dataUrl: string): { buffer: Buffer; contentType: string; ext: string } {
  const match = /^data:(.+);base64,(.*)$/.exec(dataUrl);
  if (!match) throw new Error("잘못된 이미지 데이터입니다");
  const contentType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  const ext = contentType.split("/")[1]?.split("+")[0] || "png";
  return { buffer, contentType, ext };
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const body = await request.json();
    const { patientId, docType, kind, fieldKey, dataUrl } = body ?? {};

    if (typeof patientId !== "string" || !patientId) {
      return NextResponse.json({ error: "patientId가 필요합니다" }, { status: 400 });
    }
    if (typeof docType !== "string" || !isValidDocType(docType)) {
      return NextResponse.json({ error: "알 수 없는 서류 종류입니다" }, { status: 400 });
    }
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
      return NextResponse.json({ error: "이미지 데이터가 필요합니다" }, { status: 400 });
    }

    const { buffer, contentType, ext } = parseDataUrl(dataUrl);

    // 스토리지 RLS: 첫 폴더가 owner_id(auth.uid) 여야 함 → {owner}/{patient}/...
    let path: string;
    if (kind === "signature") {
      if (typeof fieldKey !== "string" || !fieldKey) {
        return NextResponse.json({ error: "fieldKey가 필요합니다" }, { status: 400 });
      }
      path = `${user.id}/${patientId}/${docType}-signature-${fieldKey}.${ext}`;
    } else if (kind === "photo") {
      // 신분증에서 잘라낸 증명사진(포토ID)
      path = `${user.id}/${patientId}/${docType}-photo.${ext}`;
    } else {
      path = `${user.id}/${patientId}/${docType}.${ext}`;
    }

    await uploadFile(path, buffer, contentType);
    return NextResponse.json({ path });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
