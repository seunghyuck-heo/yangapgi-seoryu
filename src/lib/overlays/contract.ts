import { OverlayDoc, OverlayField } from "./types";
import { GAP_COMPANY_OPTIONS, GAP_COMPANY_DEFAULT, GAP_COMPANY_NQS } from "./gapCompany";

// ─────────────────────────────────────────────────────────────────────────────
// 양압기 치료서비스 표준계약서 — 2024.11.1 개정 서식(별지 제1호) 한 장(A4) 재구성본 (v312~)
//  · 배경: /documents/contract-8.jpg (1654×2338). 제1~12조 2단 + 제2조 표 + 하단 [갑]/[을] 좌우.
//    HTML로 조판해 헤드리스 Chrome으로 구운 이미지. 편집칸 좌표는 그 HTML DOM에서 측정(% of page)하고
//    배경 이미지의 표 격자선 픽셀(세로선 x=3.66/38.24/65.08/96.28%)로 교차검증함.
//    ⚠️ 측정용 DOM에 폭이 있는 요소를 넣으면 표 열폭이 달라져 좌표가 어긋남(0폭 마커만 사용).
//  · 좌표는 이미지 대비 %(좌상단 기준). 배경 교체 시 반드시 새 파일명(SW 캐시).
//  · 표 열: 구분 3.66~38.24 / 내용 38.24~65.08(중심 51.7) / 비고 65.08~96.28.
//  · 순응전(contract)은 표의 '순응중' 블록을, 순응후(contract_after)는 '순응후' 블록을 채운다(같은 key, y만 이동).
//  · 작성일(sign) = 대여 시작일(rental_start) 파생(v311 규칙 유지). 종료일 = 시작일 +89일(순응전) / +1년-1일(순응후).
// ─────────────────────────────────────────────────────────────────────────────

// 표의 순응중 블록 → 순응후 블록 y 이동량(측정값: 20.97 → 28.28)
const AFTER_SHIFT = 7.31;
// 순응후 계약서에서 y를 이동시킬 필드(순응중 블록 전용 칸들)
const AFTER_SHIFT_KEYS = new Set([
  "adapt_check",
  "amount_won_cover",
  "rental_amount",
  "copay_won_cover",
  "copay",
  "device_id",
  "device_model",
  "device_type",
]);

export const contractOverlay: OverlayDoc = {
  image: "/documents/contract-8.jpg",
  width: 1654,
  height: 2338,
  title: "양압기치료 서비스 표준계약서",
  fields: [
    // ===== 제2조 표 =====
    // 양압기 대여 계약기간(내용 38.24~65.08): 인쇄된 ". . . ～ . . ." 자리를 가리고 "YYYY.MM.DD ~ YYYY.MM.DD"
    { key: "rental_cover", type: "text", x: 38.8, y: 15.62, w: 25.8, h: 1.55, cover: true },
    { key: "rental_start_full", type: "text", x: 39.5, y: 15.7, w: 11.4, h: 1.4, label: "대여 시작일", dateGroup: "rental_start", datePart: "full", align: "right", fontPct: 1.2 },
    { key: "rental_tilde", type: "text", x: 50.9, y: 15.7, w: 1.6, h: 1.4, staticText: "~", align: "center", fontPct: 1.3 },
    // 대여 종료일: 시작일 + 89일(시작일 포함 90일). 편집 불가(autoToday+baseGroup)
    { key: "rental_end_full", type: "text", x: 52.5, y: 15.7, w: 11.4, h: 1.4, label: "대여 종료일", dateGroup: "rental_end", datePart: "full", align: "left", autoToday: true, baseGroup: "rental_start", autoTodayOffsetDays: 89, fontPct: 1.2 },
    // 대여료 지급일자: 매월 ( N ) 일 — 괄호 안(중심 52.2)
    { key: "pay_day", type: "text", x: 50.9, y: 17.55, w: 2.7, h: 1.4, label: "대여료 지급일 (매월)", placeholder: "25", align: "center", fontPct: 1.2 },
    // 소모품 교체주기: 필터 ( 1 )개월 — 1개월 고정 표시(편집 불가, 승혁님 지시 2026-11-19)
    { key: "filter_months", type: "text", x: 51.1, y: 19.38, w: 1.9, h: 1.4, staticText: "1", align: "center", fontPct: 1.25 },
    // 최초지급일자(비고, 라벨 끝 72.5) — 대여 시작일과 항상 동일(baseGroup 파생, 시작일 정하면 자동·편집 불가)
    { key: "mask_first_date", type: "text", x: 72.9, y: 19.38, w: 10.5, h: 1.4, label: "소모품 최초지급일자", dateGroup: "mask_first", datePart: "full", align: "left", fontPct: 1.2, autoToday: true, baseGroup: "rental_start" },

    // 순응중 [ ] 체크 — 순응전 계약서는 항상 체크(편집 불가). 순응후 계약서는 아래 블록으로 이동.
    { key: "adapt_check", type: "checkbox", x: 6.45, y: 24.45, w: 1.95, h: 1.4, fixedChecked: true },
    // 대여 서비스 금액(내용): 인쇄 "원"(51.5~52.5)을 가리고 "89,000원" 셀 중앙(51.7)에 고정 표시(편집 불가 — 승혁님 지시 2026-11-19)
    { key: "amount_won_cover", type: "text", x: 51.3, y: 21.15, w: 1.5, h: 1.45, cover: true },
    { key: "rental_amount", type: "text", x: 43.2, y: 21.1, w: 17, h: 1.55, staticText: "89,000원", align: "center", fontPct: 1.3 },
    // 본인부담금(을)(비고): 인쇄 "원"(74.3~75.3)을 가리고 라벨("본인부담금(을):" 끝 ≈73.6) 뒤에 "44,500원"(순응전)
    { key: "copay_won_cover", type: "text", x: 74.1, y: 21.15, w: 1.5, h: 1.45, cover: true },
    { key: "copay", type: "text", x: 74.0, y: 21.1, w: 9.5, h: 1.55, label: "본인부담금(을)", align: "left", options: ["44,500원"], default: "44,500원", selectBlock: true, fontPct: 1.2 },
    // 기기 관리번호: 구글시트 공단관리번호 자동(prefillFrom gongdanNo), 수정 가능
    { key: "device_id", type: "text", x: 39.0, y: 22.95, w: 25.4, h: 1.5, label: "기기 관리번호", align: "center", fontPct: 1.2, prefillFrom: "gongdanNo" },
    { key: "device_model", type: "text", x: 43.2, y: 24.78, w: 17, h: 1.5, label: "모델명", align: "center", options: ["Prisma Smart", "Smart Max"], default: "Prisma Smart", selectBlock: true, fontPct: 1.2 },
    { key: "device_type", type: "text", x: 43.2, y: 26.61, w: 17, h: 1.5, label: "종류", align: "center", options: ["자동형(APAP)", "고정형(CPAP)"], default: "자동형(APAP)", selectBlock: true, fontPct: 1.2 },

    // 마스크: 금액(내용) + 본인부담금(비고)
    { key: "mask_won_cover", type: "text", x: 51.3, y: 35.77, w: 1.5, h: 1.45, cover: true },
    { key: "mask_amount", type: "text", x: 43.2, y: 35.72, w: 17, h: 1.55, label: "마스크 금액", align: "center", options: ["95,000원", "105,000원", "110,000원"], default: "95,000원", selectBlock: true, fontPct: 1.2 },
    { key: "mask_copay_won_cover", type: "text", x: 74.1, y: 35.77, w: 1.5, h: 1.45, cover: true },
    { key: "mask_copay", type: "text", x: 74.0, y: 35.72, w: 9.5, h: 1.55, label: "마스크 본인부담금(을)", align: "left", options: ["19,000원"], default: "19,000원", selectBlock: true, fontPct: 1.2 },

    // ===== 계약일: 20 YY 년 MM 월 DD 일 — 작성일 = 대여 시작일(baseGroup, v311) =====
    { key: "sign_year", type: "text", x: 44.55, y: 83.4, w: 3.1, h: 1.45, label: "작성일", dateGroup: "sign", datePart: "y", autoToday: true, baseGroup: "rental_start", align: "center", fontPct: 1.3 },
    { key: "sign_month", type: "text", x: 48.85, y: 83.4, w: 3.0, h: 1.45, label: "작성일", dateGroup: "sign", datePart: "m", autoToday: true, baseGroup: "rental_start", align: "center", fontPct: 1.3 },
    { key: "sign_day", type: "text", x: 53.1, y: 83.4, w: 3.0, h: 1.45, label: "작성일", dateGroup: "sign", datePart: "d", autoToday: true, baseGroup: "rental_start", align: "center", fontPct: 1.3 },

    // ===== [갑] 좌측 — 준요양기관명 드롭다운 → 사업자번호·대표자·주소·연락처·도장 파생 =====
    { key: "gap_company", type: "text", x: 13.2, y: 87.2, w: 30.5, h: 1.85, label: "[갑] 준요양기관명", align: "left", options: GAP_COMPANY_OPTIONS, default: GAP_COMPANY_DEFAULT, selectBlock: true, fontPct: 1.2, fontPctByValue: { [GAP_COMPANY_DEFAULT]: 1.2, [GAP_COMPANY_NQS]: 0.95 } },
    { key: "gap_bizno", type: "text", x: 14.5, y: 89.75, w: 22, h: 1.6, align: "left", fromCompany: "bizNo", fontPct: 1.2 },
    { key: "gap_rep", type: "text", x: 12.4, y: 92.25, w: 14, h: 1.6, align: "left", fromCompany: "rep", fontPct: 1.2 },
    { key: "gap_addr", type: "text", x: 8.6, y: 94.75, w: 38.6, h: 1.55, align: "left", fromCompany: "address", fontPct: 1.0 },
    { key: "gap_phone", type: "text", x: 9.4, y: 97.2, w: 22, h: 1.6, align: "left", fromCompany: "phone", fontPct: 1.2 },
    // 대표자 성명 옆 "(서명 또는 인)" 위에 회사별 도장(투명 PNG, 저해상도 t2 — 축소 잘림 버그 회피). 정사각 박스.
    { key: "gap_stamp_my", type: "text", x: 42.75, y: 91.8, w: 4.8, h: 3.4, stampImage: "/documents/stamp-my-t2.png", stampScale: 0.95, showWhenCompany: GAP_COMPANY_DEFAULT },
    { key: "gap_stamp_nqs", type: "text", x: 42.05, y: 91.3, w: 6.2, h: 4.4, stampImage: "/documents/stamp-nqs-t2.png", stampScale: 0.9, showWhenCompany: GAP_COMPANY_NQS },

    // ===== [을] 우측 =====
    // 성 명: 수기 성명(서명패드) + 우측 "(서명 또는 인)"에 서명(수기)
    { key: "patient_signature", type: "signature", x: 57.0, y: 86.5, w: 25, h: 2.5, label: "성명 (수기)", confirmText: "성명 확정" },
    { key: "patient_seal", type: "signature", x: 89.4, y: 86.3, w: 7.6, h: 2.9, label: "서명 (수기)" },
    // 환자 성명: 환자 이름 자동(수정 가능)
    { key: "patient_name", type: "text", x: 59.3, y: 89.75, w: 22, h: 1.6, label: "환자 성명", align: "left", prefillFrom: "patientName", fontPct: 1.2 },
    // 환자와의 관계: 기본 본인(드롭다운)
    { key: "patient_relation", type: "text", x: 61.8, y: 92.2, w: 14, h: 1.7, label: "환자와의 관계", align: "left", options: ["본인", "배우자", "자녀", "부모", "기타"], default: "본인", selectBlock: true, fontPct: 1.2 },
    // 주 소: 도로명/지번 검색
    { key: "patient_address", type: "text", x: 56.7, y: 94.75, w: 38.6, h: 1.55, label: "주소", align: "left", addressSearch: true, fontPct: 1.05 },
    // 연락처: 010- 접두 + 4-4 하이픈, 시트 연락처 자동
    { key: "patient_phone", type: "text", x: 57.5, y: 97.2, w: 18, h: 1.6, label: "연락처", prefix: "010-", dashPattern: [4, 4], align: "left", prefillFrom: "phone", fontPct: 1.2 },
  ],
};

// 순응 후 표준계약서 — 같은 서식. ① 표의 '순응후' 블록을 채우고(순응중 블록 비움) 순응후 [ ] 체크,
// ② 본인부담금 17,800원, ③ 대여 종료일 = 시작일 + 1년 - 1일(순응전은 +89일).
export const contractAfterOverlay: OverlayDoc = {
  ...contractOverlay,
  fields: contractOverlay.fields.map((f): OverlayField => {
    if (f.key === "rental_end_full") return { ...f, autoTodayOffsetDays: -1, autoTodayOffsetYears: 1 };
    if (f.key === "copay") return { ...f, y: f.y + AFTER_SHIFT, options: ["17,800원"], default: "17,800원" };
    if (AFTER_SHIFT_KEYS.has(f.key)) return { ...f, y: f.y + AFTER_SHIFT };
    return f;
  }),
};
