import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { listReceipts, uploadReceipt, deleteReceipts } from "@/lib/db/receipts";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

function parseDataUrl(dataUrl: string): { buffer: Buffer; contentType: string; ext: string } {
  const match = /^data:(.+);base64,(.*)$/.exec(dataUrl);
  if (!match) throw new Error("잘못된 이미지 데이터입니다");
  const contentType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  const ext = contentType.split("/")[1]?.split("+")[0] || "jpg";
  return { buffer, contentType, ext };
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    const { id } = await params;
    const receipts = await listReceipts(user.id, id);
    return NextResponse.json({ receipts });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    const { id } = await params;
    const body = await request.json();
    const dataUrl = body?.dataUrl;
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
      return NextResponse.json({ error: "이미지 데이터가 필요합니다" }, { status: 400 });
    }
    const { buffer, contentType, ext } = parseDataUrl(dataUrl);
    const path = await uploadReceipt(user.id, id, buffer, contentType, ext);
    return NextResponse.json({ path });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    const { id } = await params;
    const body = await request.json();
    const paths = Array.isArray(body?.paths) ? (body.paths as string[]) : [];
    await deleteReceipts(user.id, id, paths);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
