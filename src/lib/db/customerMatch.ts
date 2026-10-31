// 고객(구글시트=customers) 매칭 순수 로직 — Supabase/Next 의존 없음(단위 테스트 가능).
// 규칙(사용자 확정):
//  · customers 테이블 = 구글스프레드시트의 동기화본(설정>양압기 환자 리스트 진입 시 자동 싱크).
//  · 환자를 시트와 "주민번호(생년월일6)로 정확히" 대조해서 다음을 구분한다.
//    - 시트에 있고 주민번호 일치 → 그 고유번호(No.). 같은 이름이 시트에 2명↑이면 (N) 표기.
//    - 시트에 없음(주민번호가 어떤 후보와도 불일치 / 이름 자체가 없음) → "번호 추가 필요".
//  · 순번(N)은 '시트에서 확정 매칭된' 경우에만 매긴다. 추측으로 붙이지 않는다.

// ── 정규화 헬퍼 ───────────────────────────────────────────────
// 이름 끝의 "(숫자)" 접미사(시트의 동명이인 표기 "이진우(2)" 등)와 공백을 제거해 '기본 이름'으로 묶는다.
export const normName = (s: string | null | undefined) =>
  (s ?? "").replace(/\s*\(\s*\d+\s*\)\s*$/, "").replace(/\s/g, "");

export const norm6 = (s: string | null | undefined) =>
  (s ?? "").replace(/\D/g, "").slice(0, 6);

// 값(문자열/임의 타입)에서 숫자 앞 6자리(생년월일)를 뽑는다. 6자리 미만이면 null.
export const pick6 = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const d = v.replace(/\D/g, "").slice(0, 6);
  return d.length === 6 ? d : null;
};

export const phoneTail = (s: string | null | undefined) => {
  const d = (s ?? "").replace(/\D/g, "");
  return d.length >= 8 ? d.slice(-8) : d; // 끝 8자리로 비교(접두어·하이픈·010 유무 무시)
};

// or-필터/LIKE 특수문자를 제거하고 끝의 "(N)" 접미사를 떼어 'base 이름'을 만든다.
// (시트에 동명이인이 "이진우(2)"처럼 접미사로 저장될 수 있어, 이 base로 시작하는 행까지 모두 조회해야 함)
export const queryBase = (s: string | null | undefined) =>
  (s ?? "")
    .replace(/\s*\(\s*\d+\s*\)\s*$/, "") // 끝 "(2)" 등 제거
    .replace(/[,()"*%_\\]/g, "") // PostgREST or-필터·LIKE 특수문자 제거(한글 이름엔 없음)
    .trim();

// ── 타입 ─────────────────────────────────────────────────────
export interface CustomerRec {
  customer_no: number;
  birth6: string;
  phoneTail: string;
}
export type CustomerIndex = Map<string, CustomerRec[]>; // normName(이름) → 후보 목록

// 매칭 결과:
//  · number  → 시트에서 주민번호로 확정된 고유번호
//  · "needs" → 주민번호로 대조했는데 일치 고객이 없음 = 아직 시트에 없는 사람 → '번호 추가 필요'
//  · null    → 주민번호를 못 읽어 대조 자체가 불가(동명이인이라 함부로 번호를 못 정함)
export type NoMatch = number | "needs" | null;

// 시트 rows → CustomerIndex 로 묶기(접미사·공백 제거한 normName 키). 조회 방식과 무관한 순수 함수.
export function indexCustomers(
  rows: { customer_no: number; name: string; birth6: string; phone: string }[]
): CustomerIndex {
  const index: CustomerIndex = new Map();
  for (const c of rows) {
    if (!c.name) continue;
    const key = normName(c.name); // "이진우(2)"와 "이진우"를 같은 키로 묶음
    const rec: CustomerRec = { customer_no: c.customer_no, birth6: norm6(c.birth6), phoneTail: phoneTail(c.phone) };
    const list = index.get(key);
    if (list) list.push(rec);
    else index.set(key, [rec]);
  }
  return index;
}

// ── 매칭 ─────────────────────────────────────────────────────
// 이름 → 주민번호(생년월일6)로 시트 고객을 특정. 핵심 규칙:
//  "주민번호가 일치해야만 그 고유번호를 쓴다." 같은 이름이 1명뿐이어도 주민번호가 다르면
//  남의 번호(예: 기존 이진우 No.99)를 물려주지 않고 '번호 추가 필요'로 본다.
export function matchCustomerNo(
  index: CustomerIndex,
  name: string | null | undefined,
  birth6: string | null | undefined,
  phone: string | null | undefined
): NoMatch {
  const list = index.get(normName(name));
  // 이름이 시트에 아예 없음 → 미등록(번호 추가 필요). (물려줄 번호가 없으니 주민번호 유무와 무관)
  if (!list || list.length === 0) return "needs";

  const b6 = norm6(birth6);
  if (b6) {
    // 주민번호가 있으면 반드시 주민번호로 대조한다(단독 후보여도 동일).
    const byBirth = list.filter((c) => c.birth6 === b6);
    if (byBirth.length === 1) return byBirth[0].customer_no;
    // 이름+주민번호가 모두 같은 복수 행 = 같은 사람의 중복 등록 → 가장 작은 고유번호로 확정.
    if (byBirth.length > 1) return Math.min(...byBirth.map((c) => c.customer_no));
    // 주민번호가 어떤 후보와도 불일치 = 같은 이름의 다른(새) 사람 → 번호 추가 필요.
    return "needs";
  }

  // 주민번호를 못 읽음(대조 불가). 함부로 남의 번호를 쓰지 않도록 보수적으로만 확정:
  //  · 후보가 1명뿐 → 그 번호(그 이름의 유일한 고객이므로 안전)
  //  · 동명이인인데 전화번호로 정확히 1명으로 좁혀지면 → 그 번호
  //  · 그 외(동명이인·좁히기 실패) → null(표시 안 함)
  if (list.length === 1) return list[0].customer_no;
  const pt = phoneTail(phone);
  if (pt) {
    const byPhone = list.filter((c) => c.phoneTail && c.phoneTail === pt);
    if (byPhone.length === 1) return byPhone[0].customer_no;
  }
  return null;
}

// 이름의 동명이인 수(서로 다른 고유번호 기준, 오름차순)
export function distinctNosForName(index: CustomerIndex, name: string | null | undefined): number[] {
  const list = index.get(normName(name));
  if (!list) return [];
  return [...new Set(list.map((c) => c.customer_no))].sort((a, b) => a - b);
}

// 동명이인 순번(시트 기준). 오직 '시트에서 고유번호로 확정 매칭된' 환자에게만 (N)을 매긴다.
//  · number 로 확정 + 같은 이름이 시트에 2명↑ → 고유번호 오름차순에서 몇 번째.
//  · 그 외(단독 이름 / "needs"(시트 미등록) / 불명) → null. 추측으로 (N)을 붙이지 않는다.
//    (needs인데 (N)을 붙이면, 사실은 같은 사람인데 주민번호 오타로 미매칭된 경우까지 동명이인처럼
//     잘못 표기됨 → 이강호 (2) 오표기 원인이었음. 시트에 실제로 올라와 매칭돼야 (N)이 뜬다.)
export function sheetDupRank(
  index: CustomerIndex,
  name: string | null | undefined,
  resolved: NoMatch
): number | null {
  if (typeof resolved !== "number") return null;
  const nos = distinctNosForName(index, name);
  if (nos.length <= 1) return null; // 동명이인 아님
  const i = nos.indexOf(resolved);
  return i >= 0 ? i + 1 : null;
}

// 최종 고유번호 결정: 라이브 매칭 우선. 동명이인이면 옛 저장번호로 폴백하지 않음(엉뚱한 쌍둥이 방지).
//  반환: number(확정) | "needs"(시트 미등록→번호 추가 필요) | null(판단 불가·미표시)
export function resolveCustomerNo(
  index: CustomerIndex,
  name: string | null | undefined,
  birth6: string | null | undefined,
  phone: string | null | undefined,
  storedNo: number | null
): NoMatch {
  const live = matchCustomerNo(index, name, birth6, phone);
  if (typeof live === "number") return live;
  if (live === "needs") return "needs"; // 주민번호로 대조했으나 미등록 → '번호 추가 필요'
  // live === null: 주민번호를 못 읽어 대조 불가(동명이인 등).
  const nos = distinctNosForName(index, name);
  const isDup = nos.length > 1;
  if (!isDup) return storedNo; // (후보 단독이면 위에서 이미 number를 냈으므로 사실상 도달X) 안전망
  // 동명이인 + 대조 불가: 생년월일 정보가 아예 없을 때만, 저장된 고유번호가 현재 동명이인
  // 그룹의 일원이면 그 번호로 표시. birth6가 있었는데 실패한 경우는 위에서 "needs"로 갈라졌으므로 여기 안 옴.
  if (!norm6(birth6) && storedNo != null && nos.includes(storedNo)) return storedNo;
  return null;
}
