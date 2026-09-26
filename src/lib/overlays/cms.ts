import { OverlayDoc } from "./types";

// 국내 은행 목록(자동이체 은행계좌 선택 시)
export const KOREA_BANKS = [
  "KB국민은행",
  "신한은행",
  "우리은행",
  "하나은행",
  "NH농협은행",
  "IBK기업은행",
  "SC제일은행",
  "한국씨티은행",
  "KDB산업은행",
  "수협은행",
  "카카오뱅크",
  "케이뱅크",
  "토스뱅크",
  "iM뱅크(대구은행)",
  "부산은행",
  "경남은행",
  "광주은행",
  "전북은행",
  "제주은행",
  "새마을금고",
  "신협",
  "우체국예금",
  "산림조합",
  "저축은행",
];

// 국내 카드사 목록(신용카드 선택 시)
export const KOREA_CARDS = [
  "신한카드",
  "삼성카드",
  "현대카드",
  "KB국민카드",
  "롯데카드",
  "우리카드",
  "하나카드",
  "BC카드",
  "NH농협카드",
  "IBK기업은행카드",
  "씨티카드",
  "카카오뱅크카드",
  "케이뱅크카드",
  "수협카드",
  "광주카드",
  "전북카드",
  "제주카드",
];

// 효성 CMS 자동이체신청서 — 실제 서식(사진) 기준 A4 재현본. 마커 DOM 측정 자동 생성.
// 수납업체 기재란·라벨 음영 인쇄. 편집 불가: 납부금액·납부일·연락처·사업자번호. 생년월일/전화 boxPattern.
// 신청인·예금주: 성명(수기)+서명 분리.
export const cmsOverlay: OverlayDoc = {
  image: "/documents/cms.jpg", width: 2000, height: 2828,
  title: "효성 CMS 자동이체신청서",
  fields: [
    { key: "applicant_name", type: "text", x: 24.5, y: 21.39, w: 15, h: 1.2, label: "신청인", align: "left" },
    { key: "account_relation", type: "text", x: 47.99, y: 21.39, w: 6, h: 1.2, staticText: "본인", align: "center", fontPct: 1.2 },
    { key: "cb_bank", type: "checkbox", x: 25.21, y: 27.74, w: 1.4, h: 0.99, group: "paymethod" },
    { key: "cb_card", type: "checkbox", x: 37.69, y: 27.74, w: 1.4, h: 0.99, group: "paymethod" },
    // 결제사명: 은행계좌 선택 시 은행 목록, 신용카드 선택 시 카드사 목록에서 고름(직접 입력 대신)
    // 결제수단(은행/카드)을 하나라도 고르면 필수
    {
      key: "pay_company", type: "text", x: 24.5, y: 31.03, w: 12, h: 1.2, label: "결제사명", align: "left",
      optionsByCheckbox: { cb_bank: KOREA_BANKS, cb_card: KOREA_CARDS },
      requiredIfGroup: "paymethod",
    },
    { key: "card_exp_m", type: "text", x: 46.04, y: 31.03, w: 3.4, h: 1.2, label: "카드 유효기간(월)", align: "center", requiredIf: "cb_card" },
    { key: "card_exp_y", type: "text", x: 50.76, y: 31.03, w: 3.4, h: 1.2, label: "카드 유효기간(년)", align: "center", requiredIf: "cb_card" },
    { key: "payer_name", type: "text", x: 74.4, y: 31.03, w: 18, h: 1.2, label: "결제자명", align: "left", requiredIf: "cb_card" },
    // 계좌·카드번호: 신용카드 선택 시 16자리 4-4-4-4 자동 하이픈. 은행계좌는 자유 입력(자릿수 강제 X)
    { key: "account_number", type: "text", x: 24.5, y: 34.94, w: 42, h: 1.2, label: "계좌·카드번호", align: "left", dashPatternByCheckbox: { cb_card: [4, 4, 4, 4] } },
    { key: "payer_birth", type: "text", x: 24.5, y: 38.56, w: 16, h: 1.7, label: "결제자 생년월일", boxPattern: [6, 1], optional: true },
    { key: "account_holder_phone", type: "text", x: 24.5, y: 46.39, w: 25.6, h: 1.7, label: "예금주 휴대전화번호", boxPattern: [3, 4, 4], optional: true },
    { key: "cb_privacy_agree", type: "checkbox", x: 82.74, y: 56.93, w: 1.4, h: 0.99, fixedChecked: true },
    { key: "cb_third_agree", type: "checkbox", x: 82.74, y: 69.15, w: 1.4, h: 0.99, fixedChecked: true },
    { key: "sign_y", type: "text", x: 79.01, y: 78.19, w: 5.6, h: 1.2, label: "작성 연도", align: "right", dateGroup: "sign", datePart: "y", fullYear: true, autoToday: true, fontPct: 1.2 },
    { key: "sign_m", type: "text", x: 86.52, y: 78.19, w: 3, h: 1.2, label: "작성 월", align: "right", dateGroup: "sign", datePart: "m", autoToday: true, fontPct: 1.2 },
    { key: "sign_d", type: "text", x: 91.44, y: 78.19, w: 3, h: 1.2, label: "작성 일", align: "right", dateGroup: "sign", datePart: "d", autoToday: true, fontPct: 1.2 },
    { key: "applicant_seal", type: "signature", x: 71.03, y: 80.31, w: 11, h: 3.11, label: "서명 (수기)" },
    { key: "applicant_signature", type: "signature", x: 60.2, y: 80.45, w: 15, h: 2.83, label: "성명 (수기)", confirmText: "성명 확정" },
    { key: "account_holder_seal", type: "signature", x: 71.6, y: 84.2, w: 15, h: 3.11, label: "서명 (수기)", optional: true },
    { key: "account_holder_signature", type: "signature", x: 60.2, y: 84.34, w: 15, h: 2.83, label: "성명 (수기)", confirmText: "성명 확정", optional: true },
  ],
};
