import { OverlayDoc } from "./types";

// 양압기 임대 안내 + 기기 안전교육(6번째 필수 제출서류).
// 원본 PDF를 그대로 디지털화(rental-guide.jpg). 대부분 인쇄 안내문이고,
// 하단 "일 자:"는 오늘 날짜 자동 표시(년/월/일), "성 함:"과 "(사인 또는 인)"은
// 표준계약서와 동일한 서명 입력(터치 → 손/스타일러스 서명).
export const rentalGuideOverlay: OverlayDoc = {
  image: "/documents/rental-guide.jpg",
  width: 2000,
  height: 2827,
  title: "양압기 임대 안내",
  fields: [
    // 일 자: 오늘 날짜 자동(2026년 10월 26일 형식, 편집 불가)
    { key: "edu_date", type: "text", x: 60.0, y: 82.2, w: 24, h: 1.6, label: "작성 일자", align: "left", dateGroup: "edu", datePart: "fullko", autoToday: true, fontPct: 1.7 },
    // 성 함: 수기 서명(이름) — 표준계약서와 동일
    { key: "edu_name_sign", type: "signature", x: 59.5, y: 83.8, w: 11, h: 2.7, label: "성함 (수기)", confirmText: "성명 확정" },
    // (사인 또는 인): 수기 서명 — 표준계약서와 동일
    { key: "edu_seal", type: "signature", x: 70.8, y: 83.8, w: 13, h: 2.7, label: "서명 (수기)" },
  ],
};
