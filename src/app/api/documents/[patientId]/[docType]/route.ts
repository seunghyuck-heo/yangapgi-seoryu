import { NextRequest, NextResponse } from "next/server";
import {
  collectStoragePaths,
  createSignedUrls,
  getDocument,
  upsertDocument,
} from "@/lib/db/documents";
import { DOC_TYPE_LABELS, DocType } from "@/lib/templates/types";

interface Params {
  params: Promise<{ patientId: string; docType: string }>;
}

function isValidDocType(value: string): value is DocType {
  // 5개 기본 서류 + 지속관리 서류(care_card) 모두 저장 허용
  return Object.prototype.hasOwnProperty.call(DOC_TYPE_LABELS, value);
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { patientId, docType } = await params;
    if (!isValidDocType(docType)) {
      return NextResponse.json({ error: "알 수 없는 서류 종류입니다" }, { status: 400 });
    }
    const document = await getDocument(patientId, docType);
    const paths = collectStoragePaths(document);
    const signedUrls = await createSignedUrls(paths);
    return NextResponse.json({ document, signedUrls });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { patientId, docType } = await params;
    if (!isValidDocType(docType)) {
      return NextResponse.json({ error: "알 수 없는 서류 종류입니다" }, { status: 400 });
    }
    const body = await request.json();
    const document = await upsertDocument(patientId, docType, {
      form_data: body?.form_data ?? undefined,
      file_path: body?.file_path !== undefined ? body.file_path : undefined,
      status: body?.status === "completed" ? "completed" : body?.status === "draft" ? "draft" : undefined,
    });
    return NextResponse.json({ document });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
