import { OverlayDoc } from "./types";

// 요양비 지급청구 위임장 — 실제 서식(사진) 기준 A4 재현본.
// 좌표는 렌더 이미지(1000 x 1414 CSS 기준, 실제 2000 x 2828) 대비 %. 마커 DOM 측정 자동 생성.
// ② 준요양기관·③ 수령계좌·④ 위임사항(양압기 ✔)·법정대리인은 인쇄(편집 불가).
// 위임인란: 성명(수기, 확정 버튼="성명 확정") + (서명 또는 인) 위에 겹치는 서명(흐린 가이드 문구).
export const poaOverlay: OverlayDoc = {
  image: "/documents/poa.jpg",
  width: 2000,
  height: 2828,
  title: "요양비 지급청구 위임장",
  fields: [
    { key: "insured_name", type: "text", x: 48.5, y: 13.22, w: 28, h: 1.34, label: "가입자 성명", align: "left" },
    { key: "insured_rrn", type: "text", x: 48.5, y: 15.96, w: 30, h: 1.34, label: "주민(외국인)등록번호", dashPattern: [6, 7], align: "left" },
    { key: "delegator_phone", type: "text", x: 48.3, y: 26.92, w: 28, h: 1.34, label: "전화번호(수신용)", prefix: "010-", dashPattern: [4, 4], align: "left" },
    { key: "sms_consent", type: "checkbox", x: 80.94, y: 26.94, w: 1.5, h: 1.06, label: "문자메시지 수신동의" },
    // 위임기간: 시작일=오늘 자동, 종료일=오늘+5년 자동 (편집 불가)
    { key: "gigan_start_y", type: "text", x: 14.5, y: 78.49, w: 5.6, h: 1.34, label: "위임 시작 연도", align: "right", dateGroup: "gigan_start", datePart: "y", fullYear: true, autoToday: true },
    { key: "gigan_start_m", type: "text", x: 22.08, y: 78.49, w: 3, h: 1.34, label: "위임 시작 월", align: "right", dateGroup: "gigan_start", datePart: "m", autoToday: true },
    { key: "gigan_start_d", type: "text", x: 27.06, y: 78.49, w: 3, h: 1.34, label: "위임 시작 일", align: "right", dateGroup: "gigan_start", datePart: "d", autoToday: true },
    { key: "gigan_end_y", type: "text", x: 34.55, y: 78.49, w: 5.6, h: 1.34, label: "위임 종료 연도", align: "right", dateGroup: "gigan_end", datePart: "y", fullYear: true, autoToday: true, autoTodayOffsetYears: 5 },
    { key: "gigan_end_m", type: "text", x: 42.13, y: 78.49, w: 3, h: 1.34, label: "위임 종료 월", align: "right", dateGroup: "gigan_end", datePart: "m", autoToday: true, autoTodayOffsetYears: 5 },
    { key: "gigan_end_d", type: "text", x: 47.11, y: 78.49, w: 3, h: 1.34, label: "위임 종료 일", align: "right", dateGroup: "gigan_end", datePart: "d", autoToday: true, autoTodayOffsetYears: 5 },
    { key: "sign_y", type: "text", x: 78.23, y: 84.32, w: 5.6, h: 1.34, label: "작성 연도", align: "right", dateGroup: "sign", datePart: "y", fullYear: true, autoToday: true, fontPct: 1.2 },
    { key: "sign_m", type: "text", x: 85.88, y: 84.32, w: 3, h: 1.34, label: "작성 월", align: "right", dateGroup: "sign", datePart: "m", autoToday: true, fontPct: 1.2 },
    { key: "sign_d", type: "text", x: 90.93, y: 84.32, w: 3, h: 1.34, label: "작성 일", align: "right", dateGroup: "sign", datePart: "d", autoToday: true, fontPct: 1.2 },
    { key: "delegator_seal", type: "signature", x: 73.12, y: 86.45, w: 14, h: 3.25, label: "서명 (수기)" },
    { key: "delegator_signature", type: "signature", x: 60.4, y: 86.59, w: 15, h: 2.97, label: "성명 (수기)", confirmText: "성명 확정" },
  ],
};
