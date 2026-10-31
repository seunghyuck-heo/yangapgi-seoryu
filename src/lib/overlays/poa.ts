import { OverlayDoc } from "./types";
import { POA_COMPANY_OPTIONS, POA_COMPANY_DEFAULT, POA_COMPANY_NQS } from "./gapCompany";

// 요양비 지급청구 위임장 — 실제 서식(사진) 기준 A4 재현본.
// 좌표는 렌더 이미지(1000 x 1414 CSS 기준, 실제 2000 x 2828) 대비 %. 마커 DOM 측정 자동 생성.
// ② 준요양기관·③ 수령계좌·④ 위임사항(양압기 ✔)·법정대리인은 인쇄(편집 불가).
// 위임인란: 성명(수기, 확정 버튼="성명 확정") + (서명 또는 인) 위에 겹치는 서명(흐린 가이드 문구).
export const poaOverlay: OverlayDoc = {
  image: "/documents/poa-2.jpg",
  width: 2000,
  height: 2828,
  title: "요양비 지급청구 위임장",
  fields: [
    // ② 준요양기관 / ③ 수령계좌 — 상호를 드롭다운으로 고르면 사업자번호·대표자·전화·수령자·은행·예금주·계좌번호가 함께 바뀜.
    // 기본: 엠와이메디칼 / 선택지: 엔큐에스 주식회사. 값은 gapCompany.ts의 POA_COMPANIES 프리셋.
    { key: "poa_company", type: "text", x: 48.0, y: 32.32, w: 26, h: 2.0, label: "② 준요양기관 상호", align: "left", options: POA_COMPANY_OPTIONS, default: POA_COMPANY_DEFAULT, selectBlock: true, fontPct: 1.9, fontPctByValue: { [POA_COMPANY_DEFAULT]: 1.9, [POA_COMPANY_NQS]: 1.55 } },
    { key: "poa_bizno", type: "text", x: 48.5, y: 36.03, w: 47, h: 1.6, align: "left", fromPoaCompany: "bizNo", fontPct: 1.9 },
    { key: "poa_rep", type: "text", x: 48.5, y: 39.55, w: 47, h: 1.6, align: "left", fromPoaCompany: "rep", fontPct: 1.9 },
    { key: "poa_prov_phone", type: "text", x: 48.5, y: 43.07, w: 47, h: 1.6, align: "left", fromPoaCompany: "phone", fontPct: 1.9 },
    { key: "poa_recipient", type: "text", x: 48.5, y: 46.56, w: 47, h: 1.6, align: "left", fromPoaCompany: "name", fontPct: 1.9 },
    { key: "poa_bank", type: "text", x: 47.2, y: 49.31, w: 49.1, h: 1.6, align: "center", fromPoaCompany: "bank", fontPct: 1.9 },
    { key: "poa_holder", type: "text", x: 47.2, y: 52.05, w: 49.1, h: 1.6, align: "center", fromPoaCompany: "holder", fontPct: 1.9 },
    { key: "poa_account", type: "text", x: 47.2, y: 54.78, w: 49.1, h: 1.6, align: "center", fromPoaCompany: "account", fontPct: 1.9 },
    { key: "insured_name", type: "text", x: 48.5, y: 13.22, w: 28, h: 1.34, label: "가입자 성명", align: "left", prefillFrom: "patientName" },
    { key: "insured_rrn", type: "text", x: 48.5, y: 15.96, w: 30, h: 1.34, label: "주민(외국인)등록번호", dashPattern: [6, 7], align: "left", prefillFrom: "rrn" },
    { key: "delegator_phone", type: "text", x: 48.3, y: 26.92, w: 28, h: 1.34, label: "전화번호(수신용)", prefix: "010-", dashPattern: [4, 4], align: "left" },
    // 문자메시지 수신동의: 필수 아님 + 사용 안 함 → 편집 대상에서 제외(파란 블록 표시 안 함)
    // 위임기간: 시작일=오늘 자동, 종료일=오늘+5년 자동 (편집 불가)
    { key: "gigan_start_y", type: "text", x: 14.5, y: 78.49, w: 5.6, h: 1.34, label: "위임 시작 연도", align: "right", dateGroup: "gigan_start", datePart: "y", fullYear: true, autoToday: true },
    { key: "gigan_start_m", type: "text", x: 22.08, y: 78.49, w: 3, h: 1.34, label: "위임 시작 월", align: "right", dateGroup: "gigan_start", datePart: "m", autoToday: true },
    { key: "gigan_start_d", type: "text", x: 27.06, y: 78.49, w: 3, h: 1.34, label: "위임 시작 일", align: "right", dateGroup: "gigan_start", datePart: "d", autoToday: true },
    { key: "gigan_end_y", type: "text", x: 34.55, y: 78.49, w: 5.6, h: 1.34, label: "위임 종료 연도", align: "right", dateGroup: "gigan_end", datePart: "y", fullYear: true, autoToday: true, autoTodayOffsetYears: 5, autoTodayOffsetDays: -1, baseGroup: "gigan_start" },
    { key: "gigan_end_m", type: "text", x: 42.13, y: 78.49, w: 3, h: 1.34, label: "위임 종료 월", align: "right", dateGroup: "gigan_end", datePart: "m", autoToday: true, autoTodayOffsetYears: 5, autoTodayOffsetDays: -1, baseGroup: "gigan_start" },
    { key: "gigan_end_d", type: "text", x: 47.11, y: 78.49, w: 3, h: 1.34, label: "위임 종료 일", align: "right", dateGroup: "gigan_end", datePart: "d", autoToday: true, autoTodayOffsetYears: 5, autoTodayOffsetDays: -1, baseGroup: "gigan_start" },
    { key: "sign_y", type: "text", x: 78.23, y: 84.32, w: 5.6, h: 1.34, label: "작성 연도", align: "right", dateGroup: "sign", datePart: "y", fullYear: true, autoToday: true, fontPct: 1.2 },
    { key: "sign_m", type: "text", x: 85.88, y: 84.32, w: 3, h: 1.34, label: "작성 월", align: "right", dateGroup: "sign", datePart: "m", autoToday: true, fontPct: 1.2 },
    { key: "sign_d", type: "text", x: 90.93, y: 84.32, w: 3, h: 1.34, label: "작성 일", align: "right", dateGroup: "sign", datePart: "d", autoToday: true, fontPct: 1.2 },
    { key: "delegator_seal", type: "signature", x: 73.12, y: 86.45, w: 14, h: 3.25, label: "서명 (수기)" },
    { key: "delegator_signature", type: "signature", x: 60.4, y: 86.59, w: 15, h: 2.97, label: "성명 (수기)", confirmText: "성명 확정" },
  ],
};
