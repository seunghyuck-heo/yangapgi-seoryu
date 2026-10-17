import type { PatientWithDocuments } from "@/lib/db/types";

// 서식제출 '현재 작성 중인 환자' 목록의 공유 캐시(즉시 표시 → 백그라운드 재검증).
// 모듈 변수 + sessionStorage. 상세 화면에서 '직접 완료' 등으로 목록이 바뀌면
// 이 캐시를 바로 갱신해, 서식제출로 돌아왔을 때 재조회를 기다리지 않고 즉시 반영한다.

const KEY = "inprogress_cache_v1";
let cache: PatientWithDocuments[] | null = null;

export function getInProgressCache(): PatientWithDocuments[] | null {
  if (cache != null) return cache;
  try {
    const s = sessionStorage.getItem(KEY);
    if (s) {
      cache = JSON.parse(s) as PatientWithDocuments[];
      return cache;
    }
  } catch {
    // 무시
  }
  return null;
}

export function setInProgressCache(list: PatientWithDocuments[]): void {
  cache = list;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // 무시
  }
}

/** 특정 환자를 작성 중 캐시에서 즉시 제거(직접 완료 등). 다음 재조회 전까지 바로 반영됨. */
export function removeFromInProgressCache(patientId: string): void {
  const current = getInProgressCache();
  if (current == null) return;
  setInProgressCache(current.filter((p) => p.id !== patientId));
}
