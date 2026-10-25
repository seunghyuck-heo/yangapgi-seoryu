// 표준계약서 [갑] 회사 프리셋 — 성명(드롭다운)에 따라 주소·연락처·도장이 함께 바뀐다.
// 기본: 엠와이메디칼 / 선택지: 엔큐에스 주식회사 (엠와이메디칼 안산지점)

export const GAP_COMPANY_FIELD = "gap_company";
export const GAP_COMPANY_DEFAULT = "엠와이메디칼";
export const GAP_COMPANY_NQS = "엔큐에스 주식회사 (엠와이메디칼 안산지점)";
export const GAP_COMPANY_OPTIONS = [GAP_COMPANY_DEFAULT, GAP_COMPANY_NQS];

export const GAP_COMPANIES: Record<string, { address: string; phone: string }> = {
  [GAP_COMPANY_DEFAULT]: {
    address: "경기도 하남시 미사강변동로 73, 5층 501호(망월동, 미사강변 노블레스)",
    phone: "031-794-2460",
  },
  [GAP_COMPANY_NQS]: {
    address: "경기도 안산시 단원구 광덕대로 194, 6층 603-3-19호",
    phone: "031-794-2460",
  },
};

/** 현재 선택된 [갑] 회사명(없으면 기본 엠와이메디칼) */
export function gapCompanyName(values: Record<string, unknown>): string {
  const v = values[GAP_COMPANY_FIELD];
  return typeof v === "string" && v in GAP_COMPANIES ? v : GAP_COMPANY_DEFAULT;
}

/** 현재 [갑] 회사의 주소/연락처 */
export function gapCompanyValue(values: Record<string, unknown>, kind: "address" | "phone"): string {
  return GAP_COMPANIES[gapCompanyName(values)][kind];
}

// ─────────────────────────────────────────────────────────────────────────────
// 요양비 지급청구 위임장 ② 준요양기관 / ③ 수령계좌 회사 프리셋
// 상호(드롭다운) 선택에 따라 사업자등록번호·대표자·전화·수령자·금융기관명·예금주·계좌번호가 함께 바뀐다.
export const POA_COMPANY_FIELD = "poa_company";
export const POA_COMPANY_DEFAULT = "엠와이메디칼";
export const POA_COMPANY_NQS = "엔큐에스 주식회사";
export const POA_COMPANY_OPTIONS = [POA_COMPANY_DEFAULT, POA_COMPANY_NQS];

export type PoaCompanyField =
  | "name" // 상호 / 수령자
  | "bizNo" // 사업자등록번호(법인등록번호)
  | "rep" // 대표자
  | "phone" // 전화번호(휴대전화번호)
  | "bank" // 금융기관명
  | "holder" // 예금주
  | "account"; // 계좌번호

export const POA_COMPANIES: Record<string, Record<PoaCompanyField, string>> = {
  [POA_COMPANY_DEFAULT]: {
    name: "엠와이메디칼",
    bizNo: "191-21-01071",
    rep: "손인경",
    phone: "031)794-2460",
    bank: "국민은행",
    holder: "손인경",
    account: "759901-00-103967",
  },
  [POA_COMPANY_NQS]: {
    name: "엔큐에스 주식회사",
    bizNo: "677-88-02709",
    rep: "손인경",
    phone: "031)794-2460",
    bank: "신한은행",
    holder: "엔큐에스(주)손인경",
    account: "100-036-347832",
  },
};

/** 현재 선택된 위임장 회사명(없으면 기본 엠와이메디칼) */
export function poaCompanyName(values: Record<string, unknown>): string {
  const v = values[POA_COMPANY_FIELD];
  return typeof v === "string" && v in POA_COMPANIES ? v : POA_COMPANY_DEFAULT;
}

/** 현재 위임장 회사의 파생 값(사업자번호/대표자/전화/은행/예금주/계좌번호 등) */
export function poaCompanyValue(values: Record<string, unknown>, kind: PoaCompanyField): string {
  return POA_COMPANIES[poaCompanyName(values)][kind];
}
