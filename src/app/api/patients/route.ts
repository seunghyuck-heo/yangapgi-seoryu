import { NextRequest, NextResponse } from "next/server";
import { createPatient, listPatients, countRegisteredPatients } from "@/lib/db/patients";

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const search = sp.get("q") ?? undefined;

    // 배지용: 총원만 가볍게
    if (sp.get("count") === "1") {
      const total = await countRegisteredPatients(search);
      return NextResponse.json({ total });
    }

    const limitRaw = parseInt(sp.get("limit") ?? "", 10);
    const offsetRaw = parseInt(sp.get("offset") ?? "", 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : undefined;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : undefined;

    const { patients, total, hasMore } = await listPatients({ search, limit, offset });
    return NextResponse.json({ patients, total, hasMore });
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
