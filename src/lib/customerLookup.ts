// 등록 시점, 직원이 입력한 이름으로 구글시트(고객파일)를 실시간 조회하는 클라이언트 helper.
// 서버 라우트 /api/customer-lookup 이 주민번호(전체)·연락처·고유번호 후보를 돌려준다.

export interface CustomerCandidate {
  customer_no: number;
  name: string;
  rrn: string; // 주민번호 전체(13) 또는 ""(시트 미기재)
  birth6: string;
  phone: string;
  region: string;
  chart: string;
}

export async function lookupCustomerByName(name: string): Promise<CustomerCandidate[]> {
  const nm = (name || "").trim();
  if (!nm) return [];
  try {
    const r = await fetch("/api/customer-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nm }),
    });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j.candidates) ? (j.candidates as CustomerCandidate[]) : [];
  } catch {
    return [];
  }
}

// 등록용 form_data 조각 생성(주민번호 13 / 생년월일6 / 연락처 010뒤8 / 고유번호).
export function candidateFormData(c: CustomerCandidate | null): Record<string, unknown> {
  const fd: Record<string, unknown> = {};
  if (!c) return fd;
  if (c.customer_no != null) fd.customer_no = c.customer_no;
  const rrn = (c.rrn || "").replace(/\D/g, "");
  if (rrn.length === 13) {
    fd.rrn = rrn;
    fd.birth6 = rrn.slice(0, 6);
  } else if (c.birth6) {
    fd.birth6 = c.birth6.replace(/\D/g, "").slice(0, 6);
  }
  const phoneDigits = (c.phone || "").replace(/\D/g, "");
  const local = phoneDigits.startsWith("010")
    ? phoneDigits.slice(3)
    : phoneDigits.length > 8
      ? phoneDigits.slice(-8)
      : phoneDigits;
  if (local) fd.phone = local; // 010 뒤 로컬번호(서식 전화칸은 010- 접두)
  return fd;
}
