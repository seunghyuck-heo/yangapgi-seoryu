export type OverlayFieldType = "text" | "signature" | "checkbox";

export interface OverlayField {
  key: string;
  type: OverlayFieldType;
  /** 이미지 대비 위치·크기 (%) — 좌상단 기준 */
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  placeholder?: string;
  /** text 렌더링 폰트 크기 (이미지 폭 대비 %). 기본 1.4 */
  fontPct?: number;
  /** 체크박스 라디오 그룹 (같은 그룹은 하나만 선택) */
  group?: string;
  align?: "left" | "center" | "right";
  /** 날짜 입력: 같은 dateGroup의 y/m/d 칸은 캘린더 한 번으로 함께 채워짐 */
  dateGroup?: string;
  datePart?: "y" | "m" | "d" | "full";
  /** 연도를 4자리(2026)로 표시. 미지정 시 2자리(26) */
  fullYear?: boolean;
  /** 자릿수 네모칸 입력: N개의 칸에 한 글자씩 나눠 렌더. 입력도 N자로 제한 */
  boxes?: number;
  /** 구간별 네모칸 입력: 예 [3,4,4] 또는 [6,1]. 한 입력창에서 구간이 차면 '-' 자동 삽입, 확인 시 각 칸에 분배 */
  boxPattern?: number[];
  /** 서명 팝업의 확정 버튼 문구 (기본 "서명 확정") */
  confirmText?: string;
}

export interface OverlayDoc {
  image: string;
  /** 원본 이미지 픽셀 크기 */
  width: number;
  height: number;
  title: string;
  fields: OverlayField[];
}
