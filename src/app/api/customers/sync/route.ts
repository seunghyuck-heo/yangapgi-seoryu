import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// 구글 시트 → Supabase customers 동기화 (서비스 계정으로 읽기, 노란색=탈퇴 제외)
// 필요한 env: GOOGLE_SA_EMAIL, GOOGLE_SA_KEY, SHEET_ID, (선택) SHEET_GID

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken(email: string, key: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: email,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const signingInput = `${header}.${claim}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(signingInput), key.replace(/\\n/g, "\n"));
  const jwt = `${signingInput}.${b64url(signature)}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`토큰 발급 실패(${res.status}): ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return json.access_token as string;
}

function isYellow(bg?: { red?: number; green?: number; blue?: number }): boolean {
  if (!bg) return false;
  const r = bg.red ?? 0,
    g = bg.green ?? 0,
    b = bg.blue ?? 0;
  return r > 0.75 && g > 0.6 && b < 0.5; // 노란색 계열
}

function digits(s: string): string {
  return (s || "").replace(/\D/g, "");
}

export async function GET(request: Request) {
  const debug = new URL(request.url).searchParams.get("debug") === "1";
  const email = process.env.GOOGLE_SA_EMAIL;
  const key = process.env.GOOGLE_SA_KEY;
  const sheetId = process.env.SHEET_ID;
  const gid = process.env.SHEET_GID;
  if (!email || !key || !sheetId) {
    return NextResponse.json({ error: "시트 연동 미설정(GOOGLE_SA_EMAIL/GOOGLE_SA_KEY/SHEET_ID)" }, { status: 501 });
  }

  try {
    const token = await getAccessToken(email, key);

    // gid → 시트 제목
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets(properties(sheetId,title))`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!metaRes.ok) throw new Error(`시트 메타 실패(${metaRes.status})`);
    const meta = await metaRes.json();
    const sheets = meta.sheets ?? [];
    let title: string = sheets[0]?.properties?.title;
    if (gid) {
      const found = sheets.find((s: { properties?: { sheetId?: number } }) => String(s.properties?.sheetId) === String(gid));
      if (found) title = found.properties.title;
    }

    // 값 + 배경색 (A:I)
    const range = encodeURIComponent(`${title}!A:I`);
    const dataRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?ranges=${range}&includeGridData=true&fields=sheets(data(rowData(values(formattedValue,effectiveFormat(backgroundColor)))))`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!dataRes.ok) throw new Error(`시트 데이터 실패(${dataRes.status})`);
    const data = await dataRes.json();
    const rowData: Array<{ values?: Array<{ formattedValue?: string; effectiveFormat?: { backgroundColor?: { red?: number; green?: number; blue?: number } } }> }> =
      data.sheets?.[0]?.data?.[0]?.rowData ?? [];

    const rows: { customer_no: number; name: string; region: string; chart: string; birth6: string; phone: string; insurance: string }[] = [];
    let skippedYellow = 0;
    const sample: unknown[] = [];
    for (const r of rowData) {
      const v = r.values ?? [];
      const cell = (i: number) => v[i]?.formattedValue?.trim() ?? "";
      const aRaw = cell(0);
      const name = cell(1);
      if (debug && sample.length < 5) sample.push({ a: aRaw, b: name, d: cell(3), e: cell(4), f: cell(5), h: cell(7), i: cell(8), yellowA: isYellow(v[0]?.effectiveFormat?.backgroundColor) });
      // 헤더/빈 행 제외
      if (name === "고객명" || cell(5) === "주민번호") continue;
      const no = parseInt(digits(aRaw), 10);
      if (!Number.isFinite(no) || !name) continue;
      // 노란색(탈퇴) 제외 — A열 셀 배경 기준
      if (isYellow(v[0]?.effectiveFormat?.backgroundColor)) {
        skippedYellow++;
        continue;
      }
      rows.push({
        customer_no: no,
        name,
        region: cell(3),
        chart: cell(4),
        birth6: digits(cell(5)).slice(0, 6),
        phone: cell(7),
        insurance: cell(8),
      });
    }

    if (debug) {
      return NextResponse.json({ title, totalRows: rowData.length, parsed: rows.length, skippedYellow, sample });
    }

    // Supabase 반영 (전체 교체)
    const supabase = await getSupabaseServerClient();
    const del = await supabase.from("customers").delete().neq("customer_no", -999999);
    if (del.error) throw new Error(`삭제 실패: ${del.error.message}`);
    if (rows.length) {
      const ins = await supabase.from("customers").insert(rows);
      if (ins.error) throw new Error(`입력 실패: ${ins.error.message}`);
    }

    return NextResponse.json({ ok: true, count: rows.length, skippedYellow });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
