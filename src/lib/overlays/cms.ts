import { OverlayDoc } from "./types";

// 효성 CMS 자동이체신청서 — 실제 서식(사진) 기준 A4 재현본. 마커 DOM 측정 자동 생성.
// 수납업체 기재란·라벨 음영 인쇄. 편집 불가: 납부금액·납부일·연락처·사업자번호. 생년월일/전화 boxPattern.
// 신청인·예금주: 성명(수기)+서명 분리.
export const cmsOverlay: OverlayDoc = {
  image: "/documents/cms.jpg", width: 2000, height: 2828,
  title: "효성 CMS 자동이체신청서",
  fields: [
    { key: "applicant_name", type: "text", x: 24.5, y: 21.39, w: 15, h: 1.2, label: "신청인", align: "left" },
    { key: "account_relation", type: "text", x: 47.99, y: 21.39, w: 6, h: 1.2, label: "예금주와 관계", align: "center" },
    { key: "cb_bank", type: "checkbox", x: 25.21, y: 27.74, w: 1.4, h: 0.99, group: "paymethod" },
    { key: "cb_card", type: "checkbox", x: 37.69, y: 27.74, w: 1.4, h: 0.99, group: "paymethod" },
    { key: "pay_company", type: "text", x: 24.5, y: 31.03, w: 12, h: 1.2, label: "결제사명", align: "left" },
    { key: "card_exp_m", type: "text", x: 46.04, y: 31.03, w: 3.4, h: 1.2, label: "카드 유효기간(월)", align: "center" },
    { key: "card_exp_y", type: "text", x: 50.76, y: 31.03, w: 3.4, h: 1.2, label: "카드 유효기간(년)", align: "center" },
    { key: "payer_name", type: "text", x: 74.4, y: 31.03, w: 18, h: 1.2, label: "결제자명", align: "left" },
    { key: "account_number", type: "text", x: 24.5, y: 34.94, w: 42, h: 1.2, label: "계좌·카드번호", align: "left" },
    { key: "payer_birth", type: "text", x: 24.5, y: 38.56, w: 16, h: 1.7, label: "결제자 생년월일", boxPattern: [6, 1] },
    { key: "account_holder_phone", type: "text", x: 24.5, y: 46.39, w: 25.6, h: 1.7, label: "예금주 휴대전화번호", boxPattern: [3, 4, 4] },
    { key: "cb_privacy_agree", type: "checkbox", x: 82.74, y: 56.93, w: 1.4, h: 0.99, group: "privacy1" },
    { key: "cb_privacy_disagree", type: "checkbox", x: 93.59, y: 56.93, w: 1.4, h: 0.99, group: "privacy1" },
    { key: "cb_third_agree", type: "checkbox", x: 82.74, y: 69.15, w: 1.4, h: 0.99, group: "privacy2" },
    { key: "cb_third_disagree", type: "checkbox", x: 93.59, y: 69.15, w: 1.4, h: 0.99, group: "privacy2" },
    { key: "sign_y", type: "text", x: 79.01, y: 78.45, w: 5.6, h: 1.2, label: "작성 연도", align: "right", dateGroup: "sign", datePart: "y", fullYear: true },
    { key: "sign_m", type: "text", x: 86.52, y: 78.45, w: 3, h: 1.2, label: "작성 월", align: "right", dateGroup: "sign", datePart: "m" },
    { key: "sign_d", type: "text", x: 91.44, y: 78.45, w: 3, h: 1.2, label: "작성 일", align: "right", dateGroup: "sign", datePart: "d" },
    { key: "applicant_seal", type: "signature", x: 71.03, y: 80.31, w: 11, h: 3.11, label: "서명 (수기)" },
    { key: "applicant_signature", type: "signature", x: 60.2, y: 80.45, w: 15, h: 2.83, label: "성명 (수기)", confirmText: "성명 확정" },
    { key: "account_holder_seal", type: "signature", x: 71.6, y: 84.2, w: 15, h: 3.11, label: "서명 (수기)" },
    { key: "account_holder_signature", type: "signature", x: 60.2, y: 84.34, w: 15, h: 2.83, label: "성명 (수기)", confirmText: "성명 확정" },
  ],
};
