import { OverlayDoc } from "./types";
import { GAP_COMPANY_OPTIONS, GAP_COMPANY_DEFAULT, GAP_COMPANY_NQS } from "./gapCompany";

// 좌표는 원본 이미지(2480x3508) 대비 % (좌상단 기준).
// 이미지 글자/표선 픽셀 분석으로 측정한 값.
// 입력 블록 높이는 급여신청서/위임장과 동일한 얇은 pill 형태로 통일 (세로 중심 유지).
export const contractOverlay: OverlayDoc = {
  image: "/documents/contract-6.jpg",
  width: 2480,
  height: 3508,
  title: "양압기치료 서비스 표준계약서",
  fields: [
    // 상단 표 — 양압기 대여기간 (20 __년 __월 __일)
    { key: "rental_start_year", type: "text", x: 49.5, y: 12.1, w: 5, h: 1.4, label: "대여 시작일", dateGroup: "rental_start", datePart: "y" },
    { key: "rental_start_month", type: "text", x: 54.4, y: 12.1, w: 5, h: 1.4, label: "대여 시작일", dateGroup: "rental_start", datePart: "m" },
    { key: "rental_start_day", type: "text", x: 59.2, y: 12.1, w: 5, h: 1.4, label: "대여 시작일", dateGroup: "rental_start", datePart: "d" },
    // 대여 종료일: 인쇄된 "계약 종료 시까지"를 가리고, 시작일 + 90일 자동계산 날짜(20 __년 __월 __일)로 표기.
    // baseGroup=rental_start + autoTodayOffsetDays=89(시작일 포함 90일) → PDF/폼 모두 시작일 기준 파생. 편집 불가(autoToday).
    // "20"은 우측정렬로 연도에 붙이고(2027처럼), 가림 박스는 글자 높이에 맞춰 낮게(표 가로선 유지).
    { key: "rental_end_cover", type: "text", x: 65.5, y: 12.15, w: 29.7, h: 1.5, cover: true },
    // 시작일~종료일 사이 물결표. 인쇄된 "~"가 가림박스에 가려지므로 깔끔한 "~"를 그 위에 얹는다.
    { key: "rental_tilde", type: "text", x: 65, y: 12.1, w: 4, h: 1.4, staticText: "~", align: "center", fontPct: 1.6 },
    { key: "rental_end_20", type: "text", x: 66.5, y: 12.1, w: 5, h: 1.4, staticText: "20", align: "right", fontPct: 1.5 },
    { key: "rental_end_year", type: "text", x: 71.7, y: 12.1, w: 4, h: 1.4, label: "대여 종료일", dateGroup: "rental_end", datePart: "y", align: "left", autoToday: true, baseGroup: "rental_start", autoTodayOffsetDays: 89 },
    { key: "rental_end_year_lbl", type: "text", x: 74.4, y: 12.1, w: 3, h: 1.4, staticText: "년", align: "center", fontPct: 1.5 },
    { key: "rental_end_month", type: "text", x: 77.6, y: 12.1, w: 4, h: 1.4, label: "대여 종료일", dateGroup: "rental_end", datePart: "m", align: "center", autoToday: true, baseGroup: "rental_start", autoTodayOffsetDays: 89 },
    { key: "rental_end_month_lbl", type: "text", x: 81.6, y: 12.1, w: 3, h: 1.4, staticText: "월", align: "center", fontPct: 1.5 },
    { key: "rental_end_day", type: "text", x: 84.6, y: 12.1, w: 4, h: 1.4, label: "대여 종료일", dateGroup: "rental_end", datePart: "d", align: "center", autoToday: true, baseGroup: "rental_start", autoTodayOffsetDays: 89 },
    { key: "rental_end_day_lbl", type: "text", x: 88.6, y: 12.1, w: 3, h: 1.4, staticText: "일", align: "center", fontPct: 1.5 },
    // 대여료 지급일자 (매월 __일)
    { key: "pay_day", type: "text", x: 63.5, y: 14.0, w: 5, h: 1.4, label: "대여료 지급일 (매월)", placeholder: "25" },
    // 소모품(마스크) 지급일자 — 예외: 입력 안 해도 작성완료 가능(선택). 빈 블록은 오렌지색
    { key: "mask_year", type: "text", x: 58.6, y: 15.9, w: 5, h: 1.4, label: "소모품 지급일", dateGroup: "mask", datePart: "y", optional: true, orangeBlock: true },
    { key: "mask_month", type: "text", x: 64.1, y: 15.9, w: 5, h: 1.4, label: "소모품 지급일", dateGroup: "mask", datePart: "m", optional: true, orangeBlock: true },
    { key: "mask_day", type: "text", x: 69.6, y: 15.9, w: 5, h: 1.4, label: "소모품 지급일", dateGroup: "mask", datePart: "d", optional: true, orangeBlock: true },
    // 서비스 제공 등 방문일자
    { key: "visit_year", type: "text", x: 58.6, y: 17.9, w: 5, h: 1.4, label: "방문일", dateGroup: "visit", datePart: "y" },
    { key: "visit_month", type: "text", x: 64.1, y: 17.9, w: 5, h: 1.4, label: "방문일", dateGroup: "visit", datePart: "m" },
    { key: "visit_day", type: "text", x: 69.6, y: 17.9, w: 5, h: 1.4, label: "방문일", dateGroup: "visit", datePart: "d" },
    // 기기관리번호 (값 칸 좌측 정렬)
    { key: "device_id", type: "text", x: 37, y: 19.9, w: 26, h: 1.4, label: "기기관리번호", align: "left" },

    // 양압기 종류/모델명 — 인쇄된 "Prisma Smart / Smart Max"를 가리고
    // "( ) Prisma Smart   ( ) Smart Max"로 재배치(각 앞에 선택 체크, 하나만).
    { key: "model_cover", type: "text", x: 65.8, y: 21.9, w: 31.5, h: 1.6, cover: true },
    { key: "model_prisma", type: "checkbox", x: 66.0, y: 21.55, w: 3.4, h: 1.7, label: "Prisma Smart", parenMark: true, group: "device_model", requiredGroup: true },
    { key: "model_prisma_lbl", type: "text", x: 69.4, y: 21.55, w: 14, h: 1.7, staticText: "Prisma Smart", align: "left", fontPct: 1.55 },
    { key: "model_smartmax", type: "checkbox", x: 82.3, y: 21.55, w: 3.4, h: 1.7, label: "Smart Max", parenMark: true, group: "device_model", requiredGroup: true },
    { key: "model_smartmax_lbl", type: "text", x: 85.7, y: 21.55, w: 12, h: 1.7, staticText: "Smart Max", align: "left", fontPct: 1.55 },

    // 본인부담금 — 인쇄된 "순응전 44,500원  순응후 17,800원"을 가리고
    // "( ) 순응전 44,500원   ( ) 순응후 17,800원"로 재배치(각 앞 선택 체크, 하나만).
    { key: "copay_cover", type: "text", x: 65.9, y: 24.0, w: 22.7, h: 1.55, cover: true },
    { key: "copay_pre", type: "checkbox", x: 65.9, y: 24.05, w: 2.9, h: 1.6, label: "순응전", parenMark: true, group: "copay", requiredGroup: true },
    { key: "copay_pre_lbl", type: "text", x: 68.7, y: 24.05, w: 11, h: 1.6, staticText: "순응전 44,500원", align: "left", fontPct: 1.15 },
    { key: "copay_post", type: "checkbox", x: 77.9, y: 24.05, w: 2.9, h: 1.6, label: "순응후", parenMark: true, group: "copay", requiredGroup: true },
    { key: "copay_post_lbl", type: "text", x: 80.7, y: 24.05, w: 11, h: 1.6, staticText: "순응후 17,800원", align: "left", fontPct: 1.15 },

    // 소모품 마스크 금액 — 원본 인쇄 "95,000원"은 이미지에서 삭제됨. 그 자리(셀)에 파란 편집 블록으로
    // 금액을 표시하고, 탭하면 드롭다운으로 95,000 / 105,000 / 110,000 중 선택. 기본값 "95,000원".
    { key: "mask_amount", type: "text", x: 37.5, y: 26.0, w: 13.7, h: 1.55, label: "마스크 금액", align: "center", options: ["95,000원", "105,000원", "110,000원"], default: "95,000원", selectBlock: true, fontPct: 1.4 },

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
    { key: "patient_address", type: "text", x: 58, y: 95.6, w: 38, h: 1.4, label: "주소", align: "left", addressSearch: true },
    // 을 연락처 / 비상연락처 (010- + 뒤 8자리, 4+4 자동 하이픈)
    { key: "patient_phone", type: "text", x: 56.4, y: 97.5, w: 15, h: 1.4, label: "연락처", prefix: "010-", hidePrefixOnDoc: true, dashPattern: [4, 4], align: "left" },
    { key: "patient_emergency_phone", type: "text", x: 82.9, y: 97.5, w: 14, h: 1.4, label: "비상연락처", prefix: "010-", hidePrefixOnDoc: true, dashPattern: [4, 4], align: "left" },

    // ===== [갑] 회사 — 성명(드롭다운) 선택에 따라 주소·연락처·도장이 함께 바뀜 =====
    // 배경(contract-5)에서 갑 이름/주소/연락처 값은 지워져 있고, 엠와이 도장·"(서명 또는 인)"·밑줄은 유지됨.
    // 기본 엠와이메디칼(도장=배경 인쇄) / 엔큐에스 선택 시 엠와이 도장을 흰색으로 가리고 엔큐에스 도장을 얹음.
    { key: "gap_company", type: "text", x: 11.0, y: 92.45, w: 22.5, h: 2.0, label: "[갑] 회사", align: "left", options: GAP_COMPANY_OPTIONS, default: GAP_COMPANY_DEFAULT, selectBlock: true, fontPct: 1.15, fontPctByValue: { [GAP_COMPANY_DEFAULT]: 1.15, [GAP_COMPANY_NQS]: 0.97 } },
    { key: "gap_address", type: "text", x: 11.0, y: 94.6, w: 35, h: 1.8, align: "left", fromCompany: "address", fontPct: 1.15 },
    { key: "gap_phone", type: "text", x: 11.0, y: 97.0, w: 22, h: 1.8, align: "left", fromCompany: "phone", fontPct: 1.15 },
    // 사인존: "(서명 또는 인)"은 항상 표시(오버레이), 그 위에 회사별 도장을 얹음(둘 다 오버레이, multiply)
    { key: "gap_sign_label", type: "text", x: 33.7, y: 92.3, w: 11.5, h: 1.9, staticText: "(서명 또는 인)", align: "center", fontPct: 1.1 },
    { key: "gap_stamp_my", type: "text", x: 37.6, y: 92.1, w: 4.7, h: 3.4, stampImage: "/documents/stamp-my.png", showWhenCompany: GAP_COMPANY_DEFAULT },
    { key: "gap_stamp_nqs", type: "text", x: 36.9, y: 91.9, w: 6.0, h: 3.8, stampImage: "/documents/stamp-nqs-2.png", showWhenCompany: GAP_COMPANY_NQS },
  ],
};

// 순응 후 표준계약서 — 표준계약서와 동일하되 '대여 종료일'만 시작일 + 1년(시작일을 1일차로 → +1년 -1일)으로 파생.
// (순응 전 표준계약서는 시작일 + 89일 = 90일. 순응 후는 1년.)
export const contractAfterOverlay: OverlayDoc = {
  ...contractOverlay,
  fields: contractOverlay.fields.map((f) =>
    f.key === "rental_end_year" || f.key === "rental_end_month" || f.key === "rental_end_day"
      ? { ...f, autoTodayOffsetYears: 1, autoTodayOffsetDays: -1 }
      : f
  ),
};
