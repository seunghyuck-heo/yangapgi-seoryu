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
  /** 체크박스를 ( ) / (O) 텍스트 마크로 표시 (체크 전 "( )", 체크 시 "(O)") */
  parenMark?: boolean;
  /** 인쇄된 글자를 가리는 흰색 박스(편집 불가) — 위에 새 레이아웃을 얹을 때 사용 */
  cover?: boolean;
  /** 고정 표시 텍스트(편집 불가) — 예: 재배치한 모델명 라벨 */
  staticText?: string;
  /** 주소: 텍스트 직접입력 대신 도로명/지번 검색(다음 우편번호)으로 입력 */
  addressSearch?: boolean;
  /** 작성완료 시 필수 아님(빈 칸이어도 완료 가능) */
  optional?: boolean;
  /** 지정한 체크박스 key가 체크됐을 때만 필수. 아니면 선택(빈 칸 허용) */
  requiredIf?: string;
  /** 필수 선택 그룹(양자택일): 같은 group에서 하나도 선택 안 되면 작성완료 불가 */
  requiredGroup?: boolean;
  /** 날짜: 오늘 날짜 자동 입력(편집 불가). 같은 dateGroup에 지정 */
  autoToday?: boolean;
  /** autoToday에 더할 연수(예: 5 → 오늘+5년). 위임 종료일 등에 사용 */
  autoTodayOffsetYears?: number;
  /** autoToday에 더할 일수(예: -1 → 하루 전). 위임 종료일 = 시작+5년-1일 등에 사용 */
  autoTodayOffsetDays?: number;
  /** 이 날짜 그룹을 다른 그룹(baseGroup)의 날짜 + 오프셋으로 항상 파생(저장값도 덮어씀).
   *  예: 위임 종료일 = 위임 시작일 + 5년 - 1일 (이미 저장된 문서도 자동 보정) */
  baseGroup?: string;
  /** 목록에서 고르는 선택 필드: 탭하면 옵션 목록 팝업이 뜬다(직접 입력 대신) */
  options?: string[];
  /** 조건부 옵션: 지정한 체크박스 key가 선택돼 있으면 해당 목록을 보여줌.
   *  예: { cb_bank: 은행목록, cb_card: 카드사목록 } — 결제수단에 따라 결제사명 목록이 바뀜 */
  optionsByCheckbox?: Record<string, string[]>;
  /** 같은 group의 체크박스가 하나라도 선택되면 필수(빈 칸이면 작성완료 불가) */
  requiredIfGroup?: string;
  /** 조건부 자릿수 하이픈: 지정한 체크박스가 선택돼 있으면 그 패턴으로 자동 '-' 삽입.
   *  예: { cb_card: [4,4,4,4] } — 신용카드 선택 시 계좌번호를 4-4-4-4로 입력 */
  dashPatternByCheckbox?: Record<string, number[]>;
  /** 다른 필드(예: 결제사명)의 선택값에 따라 자동 하이픈. 자릿수는 강제하지 않음(soft):
   *  표준 형식대로 '-'를 넣되, 자릿수가 달라도 숫자는 잘리지 않음.
   *  예: { field: "pay_company", map: { "신한은행": [3,3,6], ... } } */
  dashPatternByOptionOf?: { field: string; map: Record<string, number[]> };
}

export interface OverlayDoc {
  image: string;
  /** 원본 이미지 픽셀 크기 */
  width: number;
  height: number;
  title: string;
  fields: OverlayField[];
}
