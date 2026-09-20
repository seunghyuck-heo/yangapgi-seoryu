import { NextResponse } from "next/server";

// UptimeRobot 등에서 5분마다 핑 → Render 인스턴스를 깨워둠 + 가동 모니터링
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() });
}
