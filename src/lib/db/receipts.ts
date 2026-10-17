import { DOCUMENTS_BUCKET, getSupabaseServerClient } from "@/lib/supabase/server";

// 마스크 영수증: 환자별로 여러 장을 저장/조회/삭제. DB 문서 없이 Storage 프리픽스로만 관리.
// 경로 규칙(스토리지 RLS: 첫 폴더가 owner_id): {owner}/{patientId}/receipts/{filename}

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h

function prefixOf(ownerId: string, patientId: string): string {
  return `${ownerId}/${patientId}/receipts`;
}

/** 영수증 목록(최근 업로드 순)과 서명 URL */
export async function listReceipts(
  ownerId: string,
  patientId: string
): Promise<{ path: string; url: string }[]> {
  const supabase = await getSupabaseServerClient();
  const prefix = prefixOf(ownerId, patientId);
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .list(prefix, { limit: 1000, sortBy: { column: "name", order: "desc" } });
  if (error) throw new Error(error.message);

  // 폴더/플레이스홀더 제외(파일만). 파일명 앞부분이 타임스탬프라 name desc = 최신순.
  const names = (data ?? [])
    .filter((f) => f.name && !f.name.startsWith(".") && f.id != null)
    .map((f) => f.name);
  const paths = names.map((n) => `${prefix}/${n}`);
  if (paths.length === 0) return [];

  const { data: signed, error: e2 } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (e2) throw new Error(e2.message);

  const urlByPath = new Map<string, string>();
  (signed ?? []).forEach((s, i) => {
    if (s?.signedUrl) urlByPath.set(paths[i], s.signedUrl);
  });
  return paths.map((p) => ({ path: p, url: urlByPath.get(p) ?? "" })).filter((r) => r.url);
}

/** 영수증 1장 업로드 → 저장 경로 반환(고유 파일명이라 덮어쓰지 않음) */
export async function uploadReceipt(
  ownerId: string,
  patientId: string,
  buffer: Buffer,
  contentType: string,
  ext: string
): Promise<string> {
  const supabase = await getSupabaseServerClient();
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path = `${prefixOf(ownerId, patientId)}/${name}`;
  const { error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buffer, { contentType, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

/** 선택한 영수증 삭제(본인 환자 폴더 경로만 허용) */
export async function deleteReceipts(
  ownerId: string,
  patientId: string,
  paths: string[]
): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const prefix = `${prefixOf(ownerId, patientId)}/`;
  const safe = paths.filter((p) => typeof p === "string" && p.startsWith(prefix));
  if (safe.length === 0) return;
  const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).remove(safe);
  if (error) throw new Error(error.message);
}
