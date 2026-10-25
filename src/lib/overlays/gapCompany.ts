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
