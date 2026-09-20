import { OverlayDoc } from "./types";

// 건강보험 양압기 급여대상자 등록 신청서 — 실제 서식(사진) 기준 A4 재현본. 마커 DOM 측정 자동 생성.
// ② 요양기관 확인란: 날짜만 편집(상병명/코드/체크/관계"본인"/SMS"아니오"는 인쇄). 신청인: 성명(수기)+서명 분리.
export const subsidyOverlay: OverlayDoc = {
  image: "/documents/subsidy.jpg", width: 2000, height: 2828,
  title: "건강보험 양압기 급여대상자 등록 신청서",
  fields: [
    { key: "patient_name", type: "text", x: 19.7, y: 12.49, w: 26, h: 1.2, label: "수진자 성명", align: "left" },
    { key: "patient_rrn", type: "text", x: 66.5, y: 12.49, w: 18, h: 1.2, label: "주민(외국인)등록번호", align: "left" },
    { key: "patient_home_phone", type: "text", x: 19.5, y: 15.9, w: 24, h: 1.2, label: "자택 전화번호", align: "left" },
    { key: "patient_mobile_phone", type: "text", x: 19.5, y: 17.75, w: 24, h: 1.2, label: "휴대전화", align: "left" },
    { key: "diagnosis_date", type: "text", x: 74.65, y: 21.24, w: 15, h: 1.2, label: "진단확인일", align: "left", dateGroup: "diag", datePart: "full" },
    { key: "level1_year", type: "text", x: 47.96, y: 27.63, w: 4.4, h: 1.2, label: "검사 실시 연도", align: "right", dateGroup: "level1", datePart: "y", fullYear: true },
    { key: "level1_month", type: "text", x: 54.07, y: 27.63, w: 2.6, h: 1.2, label: "검사 실시 월", align: "right", dateGroup: "level1", datePart: "m" },
    { key: "level1_day", type: "text", x: 58.37, y: 27.63, w: 2.6, h: 1.2, label: "검사 실시 일", align: "right", dateGroup: "level1", datePart: "d" },
    { key: "confirm_year", type: "text", x: 47.29, y: 63.08, w: 4.6, h: 1.2, label: "확인 연도", align: "right", dateGroup: "confirm", datePart: "y", fullYear: true },
    { key: "confirm_month", type: "text", x: 53.6, y: 63.08, w: 2.8, h: 1.2, label: "확인 월", align: "right", dateGroup: "confirm", datePart: "m" },
    { key: "confirm_day", type: "text", x: 58.11, y: 63.08, w: 2.8, h: 1.2, label: "확인 일", align: "right", dateGroup: "confirm", datePart: "d" },
    { key: "apply_year", type: "text", x: 42.49, y: 74.63, w: 4.6, h: 1.2, label: "신청 연도", align: "right", dateGroup: "apply", datePart: "y", fullYear: true },
    { key: "apply_month", type: "text", x: 48.8, y: 74.63, w: 2.8, h: 1.2, label: "신청 월", align: "right", dateGroup: "apply", datePart: "m" },
    { key: "apply_day", type: "text", x: 53.31, y: 74.63, w: 2.8, h: 1.2, label: "신청 일", align: "right", dateGroup: "apply", datePart: "d" },
    { key: "applicant_seal", type: "signature", x: 42.05, y: 76.54, w: 14, h: 3.11, label: "서명 (수기)" },
    { key: "applicant_signature", type: "signature", x: 30, y: 76.68, w: 15, h: 2.83, label: "성명 (수기)", confirmText: "성명 확정" },
    { key: "applicant_phone", type: "text", x: 35.47, y: 80.49, w: 15, h: 1.2, align: "left" },
  ],
};
