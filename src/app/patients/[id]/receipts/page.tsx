"use client";

import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useRef, useState } from "react";

interface Props {
  params: Promise<{ id: string }>;
}

interface Receipt {
  path: string;
  url: string;
}

const MAX_DIMENSION = 1800;
const JPEG_QUALITY = 0.85;

// 업로드 전 리사이즈(용량 절감) → jpeg dataURL
function resizeImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("이미지를 읽을 수 없습니다"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("이미지를 불러올 수 없습니다"));
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          const scale = MAX_DIMENSION / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("이미지 처리에 실패했습니다"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function ReceiptsPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(() => {
    fetch(`/api/patients/${id}/receipts`)
      .then(async (res) => {
        const json = await res.json();
        if (res.ok) setReceipts((json.receipts ?? []) as Receipt[]);
        else setError(json.error || "영수증을 불러오지 못했습니다");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (cameraRef.current) cameraRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const dataUrl = await resizeImageFile(file);
      const res = await fetch(`/api/patients/${id}/receipts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      if (!res.ok) {
        const json = await res.json();
        setError(json.error || "업로드에 실패했습니다");
        return;
      }
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function toggle(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function exitEdit() {
    setEditMode(false);
    setSelected(new Set());
  }

  async function handleDelete() {
    if (selected.size === 0) return;
    if (!window.confirm(`선택한 영수증 ${selected.size}장을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/patients/${id}/receipts`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: [...selected] }),
      });
      if (res.ok) {
        exitEdit();
        load();
      } else {
        const json = await res.json();
        setError(json.error || "삭제에 실패했습니다");
      }
    } finally {
      setDeleting(false);
    }
  }

  function handleBack() {
    if (editMode) exitEdit();
    else router.push(`/patients/${id}`);
  }

  return (
    <div className="receipts-page">
      <div className="doc-page__toolbar no-print">
        <button type="button" className="app-header__action" aria-label="뒤로" onClick={handleBack}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="receipts-page__bar-title">마스크 영수증</span>
        <div className="receipts-page__bar-actions">
          {!editMode && (
            <button
              type="button"
              className="app-header__action"
              aria-label="영수증 추가"
              onClick={() => setSheetOpen(true)}
              disabled={uploading}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          )}
          <button
            type="button"
            className="app-header__action"
            aria-label="편집"
            onClick={() => (editMode ? exitEdit() : setEditMode(true))}
            disabled={!loading && receipts.length === 0}
          >
            {editMode ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {receipts.length === 0 ? (
        <div className="receipts-page__center">
          {!loading && (
            <p className="receipts-page__empty">
              등록된 영수증이 없습니다.
              <br />
              우측 상단 ＋ 버튼으로 사진을 추가하세요.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="receipts-grid">
            {receipts.map((r) => {
            const checked = selected.has(r.path);
            return (
              <button
                key={r.path}
                type="button"
                className={`receipt-cell ${editMode && checked ? "receipt-cell--checked" : ""}`}
                onClick={() => (editMode ? toggle(r.path) : setLightbox(r.url))}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.url} alt="마스크 영수증" className="receipt-cell__img" />
                {editMode && (
                  <span className={`receipt-cell__check ${checked ? "receipt-cell__check--on" : ""}`} aria-hidden>
                    {checked && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </span>
                )}
              </button>
            );
            })}
          </div>
        </>
      )}

      {editMode && (
        <div className="edit-actionbar no-print">
          <button type="button" className="edit-actionbar__cancel" onClick={exitEdit}>
            취소
          </button>
          <button
            type="button"
            className="edit-actionbar__delete"
            onClick={handleDelete}
            disabled={selected.size === 0 || deleting}
          >
            {deleting ? "삭제 중..." : `삭제하기${selected.size > 0 ? ` (${selected.size})` : ""}`}
          </button>
        </div>
      )}

      {/* 카메라/갤러리 선택 시트 */}
      {sheetOpen && (
        <div className="sheet-overlay sheet-overlay--center" onClick={() => setSheetOpen(false)}>
          <div className="sheet sheet--center" onClick={(e) => e.stopPropagation()}>
            <div className="sheet__title sheet__title--id">마스크 영수증 추가</div>
            <button
              type="button"
              className="sheet__option"
              onClick={() => {
                setSheetOpen(false);
                cameraRef.current?.click();
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              카메라로 촬영
            </button>
            <button
              type="button"
              className="sheet__option"
              onClick={() => {
                setSheetOpen(false);
                galleryRef.current?.click();
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              갤러리에서 선택
            </button>
            <button type="button" className="sheet__cancel" onClick={() => setSheetOpen(false)}>
              취소
            </button>
          </div>
        </div>
      )}

      {/* 큰 이미지 보기 */}
      {lightbox && (
        <div className="receipts-lightbox" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="마스크 영수증" />
        </div>
      )}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={handleFile} />
      <input ref={galleryRef} type="file" accept="image/*" hidden onChange={handleFile} />
    </div>
  );
}
