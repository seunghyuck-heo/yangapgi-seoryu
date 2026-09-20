import { NextRequest, NextResponse } from "next/server";
import { createPatient, listPatients } from "@/lib/db/patients";

export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams.get("q") ?? undefined;
    const patients = await listPatients(search);
    return NextResponse.json({ patients });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "환자 이름을 입력하세요" }, { status: 400 });
    }
    const patient = await createPatient({
      name,
      resident_number: body?.resident_number || undefined,
      phone: body?.phone || undefined,
    });
    return NextResponse.json({ patient }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
