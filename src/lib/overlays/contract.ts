import { OverlayDoc } from "./types";

// 좌표는 원본 이미지(2480x3508) 대비 % (좌상단 기준).
// 이미지 글자/표선 픽셀 분석으로 측정한 값.
// 입력 블록 높이는 급여신청서/위임장과 동일한 얇은 pill 형태로 통일 (세로 중심 유지).
export const contractOverlay: OverlayDoc = {
  image: "/documents/contract.jpg",
  width: 2480,
  height: 3508,
  title: "양압기치료 서비스 표준계약서",
  fields: [
    // 상단 표 — 양압기 대여기간 (20 __년 __월 __일)
    { key: "rental_start_year", type: "text", x: 49.5, y: 12.1, w: 5, h: 1.4, label: "대여 시작일", dateGroup: "rental_start", datePart: "y" },
    { key: "rental_start_month", type: "text", x: 54.4, y: 12.1, w: 5, h: 1.4, label: "대여 시작일", dateGroup: "rental_start", datePart: "m" },
    { key: "rental_start_day", type: "text", x: 59.2, y: 12.1, w: 5, h: 1.4, label: "대여 시작일", dateGroup: "rental_start", datePart: "d" },
    // 대여료 지급일자 (매월 __일)
    { key: "pay_day", type: "text", x: 63.5, y: 14.0, w: 5, h: 1.4, label: "대여료 지급일 (매월)", placeholder: "25" },
    // 소모품(마스크) 지급일자
    { key: "mask_year", type: "text", x: 58.6, y: 15.9, w: 5, h: 1.4, label: "소모품 지급일", dateGroup: "mask", datePart: "y" },
    { key: "mask_month", type: "text", x: 64.1, y: 15.9, w: 5, h: 1.4, label: "소모품 지급일", dateGroup: "mask", datePart: "m" },
    { key: "mask_day", type: "text", x: 69.6, y: 15.9, w: 5, h: 1.4, label: "소모품 지급일", dateGroup: "mask", datePart: "d" },
    // 서비스 제공 등 방문일자
    { key: "visit_year", type: "text", x: 58.6, y: 17.9, w: 5, h: 1.4, label: "방문일", dateGroup: "visit", datePart: "y" },
    { key: "visit_month", type: "text", x: 64.1, y: 17.9, w: 5, h: 1.4, label: "방문일", dateGroup: "visit", datePart: "m" },
    { key: "visit_day", type: "text", x: 69.6, y: 17.9, w: 5, h: 1.4, label: "방문일", dateGroup: "visit", datePart: "d" },
    // 기기관리번호 (값 칸 좌측 정렬)
    { key: "device_id", type: "text", x: 37, y: 19.9, w: 26, h: 1.4, label: "기기관리번호", align: "left" },

    // 양압기 종류/모델명 — 인쇄된 "Prisma Smart / Smart Max"를 가리고
    // "( ) Prisma Smart   ( ) Smart Max"로 재배치(각 앞에 선택 체크, 하나만).
    { key: "model_cover", type: "text", x: 65.8, y: 21.3, w: 31.5, h: 2.3, cover: true },
    { key: "model_prisma", type: "checkbox", x: 66.0, y: 21.55, w: 3.4, h: 1.7, label: "Prisma Smart", parenMark: true, group: "device_model" },
    { key: "model_prisma_lbl", type: "text", x: 69.4, y: 21.55, w: 14, h: 1.7, staticText: "Prisma Smart", align: "left", fontPct: 1.55 },
    { key: "model_smartmax", type: "checkbox", x: 82.3, y: 21.55, w: 3.4, h: 1.7, label: "Smart Max", parenMark: true, group: "device_model" },
    { key: "model_smartmax_lbl", type: "text", x: 85.7, y: 21.55, w: 12, h: 1.7, staticText: "Smart Max", align: "left", fontPct: 1.55 },

    // 개인정보 수집·이용 동의 체크박스
    { key: "consent_yes", type: "checkbox", x: 73.72, y: 88.58, w: 2.6, h: 1.0, label: "개인정보 수집·이용 동의", fixedChecked: true },

    // 을(환자) — 작성일 (20 __년 __월 __일)  우측 상단
    { key: "sign_year", type: "text", x: 80.6, y: 90.5, w: 5, h: 1.4, label: "작성일", dateGroup: "sign", datePart: "y", autoToday: true, fontPct: 1.2 },
    { key: "sign_month", type: "text", x: 85.0, y: 90.5, w: 5, h: 1.4, label: "작성일", dateGroup: "sign", datePart: "m", autoToday: true, fontPct: 1.2 },
    { key: "sign_day", type: "text", x: 89.8, y: 90.5, w: 5, h: 1.4, label: "작성일", dateGroup: "sign", datePart: "d", autoToday: true, fontPct: 1.2 },
    // 을 성명 (서명) — "성 명" 라벨과 "(서명 또는 인)" 사이
    // 을(환자) 성명(수기) + 서명 분리
    { key: "patient_signature", type: "signature", x: 52, y: 92.7, w: 29, h: 2.4, label: "성명 (수기)", confirmText: "성명 확정" },
    { key: "patient_seal", type: "signature", x: 82.5, y: 92.6, w: 14, h: 2.7, label: "서명 (수기)" },
    // 을 주소
    { key: "patient_address", type: "text", x: 58, y: 95.6, w: 38, h: 1.4, label: "주소", align: "left" },
    // 을 연락처 / 비상연락처 (010- + 뒤 8자리, 4+4 자동 하이픈)
    { key: "patient_phone", type: "text", x: 56.4, y: 97.5, w: 15, h: 1.4, label: "연락처", prefix: "010-", hidePrefixOnDoc: true, dashPattern: [4, 4], align: "left" },
    { key: "patient_emergency_phone", type: "text", x: 82.9, y: 97.5, w: 14, h: 1.4, label: "비상연락처", prefix: "010-", hidePrefixOnDoc: true, dashPattern: [4, 4], align: "left" },
  ],
};
