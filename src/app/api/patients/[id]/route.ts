import { NextRequest, NextResponse } from "next/server";
import { deletePatient, getPatient, updatePatient } from "@/lib/db/patients";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const patient = await getPatient(id);
    if (!patient) {
      return NextResponse.json({ error: "환자를 찾을 수 없습니다" }, { status: 404 });
    }
    return NextResponse.json({ patient });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const patient = await updatePatient(id, {
      name: body?.name,
      resident_number: body?.resident_number,
      phone: body?.phone,
    });
    return NextResponse.json({ patient });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await deletePatient(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
