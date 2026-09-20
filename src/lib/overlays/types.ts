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
  /** 전화번호 등: 문서엔 접두어+하이픈 텍스트로 표시(네모칸 아님). 팝업은 구간 자동 하이픈 */
  dashPattern?: number[];
  /** dashPattern과 함께 문서에 고정 표시할 접두어 (예: "010-") */
  prefix?: string;
  /** 원본 서식에 이미 접두어가 인쇄된 경우: 팝업엔 접두어 표시, 문서엔 접두어 숨김 */
  hidePrefixOnDoc?: boolean;
  /** 체크박스: 항상 체크됨(편집 불가) */
  fixedChecked?: boolean;
  /** 날짜: 오늘 날짜 자동 입력(편집 불가). 같은 dateGroup에 지정 */
  autoToday?: boolean;
}

export interface OverlayDoc {
  image: string;
  /** 원본 이미지 픽셀 크기 */
  width: number;
  height: number;
  title: string;
  fields: OverlayField[];
}
