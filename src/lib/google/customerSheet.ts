import crypto from "crypto";

// 구글 시트(고객파일) → 고객 행 읽기 공용 로직. 동기화(/api/customers/sync)와
// 등록 시점 실시간 조회(/api/customer-lookup)가 함께 쓴다.
// 필요한 env: GOOGLE_SA_EMAIL, GOOGLE_SA_KEY, SHEET_ID, (선택) SHEET_GID
//
// ⚠️ 주민번호 전체(rrn)는 '여기(메모리/전송)'에서만 다루고 Supabase customers 테이블엔 저장하지 않는다.
//    (customers 에는 기존대로 앞 6자리 birth6 만 보관 — PII 최소화. 전체 주민번호는 서식 작성 시점에만 쓰임.)

export interface CustomerSheetRow {
  customer_no: number;
  name: string;
  region: string;
  chart: string;
  birth6: string; // 주민번호 앞 6자리(생년월일)
  rrn: string; // 주민번호 전체(13자리) — 시트에 기재돼 있을 때만, 없으면 ""
  phone: string;
  insurance: string;
}

export interface CustomerSheetResult {
  title: string;
  totalRows: number;
  skippedYellow: number;
  rows: CustomerSheetRow[];
}

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
  return r > 0.75 && g > 0.6 && b < 0.5; // 노란색 계열 = 탈퇴
}

function digits(s: string): string {
  return (s || "").replace(/\D/g, "");
}

export class CustomerSheetConfigError extends Error {}

// 시트를 읽어 고객 행을 파싱해 반환. 설정 누락이면 CustomerSheetConfigError, 그 외 오류는 일반 Error.
export async function fetchCustomerRows(): Promise<CustomerSheetResult> {
  const email = process.env.GOOGLE_SA_EMAIL;
  const key = process.env.GOOGLE_SA_KEY;
  const sheetId = process.env.SHEET_ID;
  const gid = process.env.SHEET_GID;
  if (!email || !key || !sheetId) {
    throw new CustomerSheetConfigError("시트 연동 미설정(GOOGLE_SA_EMAIL/GOOGLE_SA_KEY/SHEET_ID)");
  }

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

  const rows: CustomerSheetRow[] = [];
  let skippedYellow = 0;
  for (const r of rowData) {
    const v = r.values ?? [];
    const cell = (i: number) => v[i]?.formattedValue?.trim() ?? "";
    const aRaw = cell(0);
    const name = cell(1);
    // 헤더/빈 행 제외
    if (name === "고객명" || cell(5) === "주민번호") continue;
    const no = parseInt(digits(aRaw), 10);
    if (!Number.isFinite(no) || !name) continue;
    // 노란색(탈퇴) 제외 — A열 셀 배경 기준
    if (isYellow(v[0]?.effectiveFormat?.backgroundColor)) {
      skippedYellow++;
      continue;
    }
    // 주민번호는 두 칸에 나뉘어 있다: F(5)=앞6자리(생년월일), G(6)=뒤7자리. 둘 다 있을 때만 13자리로 합침.
    const front6 = digits(cell(5)); // 주민 앞 6자리
    const back7 = digits(cell(6)); // 주민 뒤 7자리
    const rrnFull = front6.length === 6 && back7.length === 7 ? front6 + back7 : "";
    rows.push({
      customer_no: no,
      name,
      region: cell(3),
      chart: cell(4),
      birth6: front6.slice(0, 6),
      rrn: rrnFull,
      phone: cell(7),
      insurance: cell(8),
    });
  }

  return { title, totalRows: rowData.length, skippedYellow, rows };
}
