"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PATIENTS_CHANGED_EVENT } from "./BottomTabs";

interface IdCardUploaderProps {
  patientId: string;
  initialUrl?: string;
  initialStatus: "draft" | "completed";
  backHref: string;
}

const MAX_DIMENSION = 1800;
const JPEG_QUALITY = 0.85;

// 시계방향 deg(0/90/180/270) 회전 jpeg dataURL
function rotateDataUrl(dataUrl: string, deg: number): Promise<string> {
  return new Promise((resolve) => {
    const r = ((deg % 360) + 360) % 360;
    if (r === 0) return resolve(dataUrl);
    const img = new Image();
    img.onerror = () => resolve(dataUrl);
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const canvas = document.createElement("canvas");
      if (r === 90 || r === 270) {
        canvas.width = h;
        canvas.height = w;
      } else {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(dataUrl);
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((r * Math.PI) / 180);
      ctx.drawImage(img, -w / 2, -h / 2);
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.src = dataUrl;
  });
}

// 얼굴 box 중심 정사각형 크롭(아바타용)
function cropFace(dataUrl: string, box: number[]): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(null);
    img.onload = () => {
      const [ymin, xmin, ymax, xmax] = box;
      const W = img.naturalWidth;
      const H = img.naturalHeight;
      const bx0 = (Math.min(xmin, xmax) / 1000) * W;
      const by0 = (Math.min(ymin, ymax) / 1000) * H;
      const bx1 = (Math.max(xmin, xmax) / 1000) * W;
      const by1 = (Math.max(ymin, ymax) / 1000) * H;
      const bw = bx1 - bx0;
      const bh = by1 - by0;
      if (bw < 8 || bh < 8) return resolve(null);
      const cx = (bx0 + bx1) / 2;
      const cy = (by0 + by1) / 2;
      let side = Math.max(bw, bh) * 1.25;
      side = Math.min(side, W, H);
      let sx = cx - side / 2;
      let sy = cy - side / 2;
      sx = Math.max(0, Math.min(sx, W - side));
      sy = Math.max(0, Math.min(sy, H - side));
      const out = 320;
      const canvas = document.createElement("canvas");
      canvas.width = out;
      canvas.height = out;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.src = dataUrl;
  });
}

// 신분증 카드 box 영역 크롭(배경 제거)
function cropBox(dataUrl: string, box: number[], margin = 0.015): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(null);
    img.onload = () => {
      const [ymin, xmin, ymax, xmax] = box;
      const W = img.naturalWidth;
      const H = img.naturalHeight;
      let x0 = (Math.min(xmin, xmax) / 1000) * W;
      let y0 = (Math.min(ymin, ymax) / 1000) * H;
      let x1 = (Math.max(xmin, xmax) / 1000) * W;
      let y1 = (Math.max(ymin, ymax) / 1000) * H;
      const mw = (x1 - x0) * margin;
      const mh = (y1 - y0) * margin;
      x0 = Math.max(0, x0 - mw);
      y0 = Math.max(0, y0 - mh);
      x1 = Math.min(W, x1 + mw);
      y1 = Math.min(H, y1 + mh);
      const w = x1 - x0;
      const h = y1 - y0;
      if (w < 20 || h < 20) return resolve(null);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w);
      canvas.height = Math.round(h);
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(img, x0, y0, w, h, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.src = dataUrl;
  });
}

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
        if (!ctx) return reject(new Error("이미지 처리에 실패했습니다"));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function IdCardUploader({ patientId, initialUrl, backHref }: IdCardUploaderProps) {
  const router = useRouter();
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(initialUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [nameSheet, setNameSheet] = useState<{ value: string; path: string; photoPath?: string; birth6?: string; preview: string } | null>(null);
  const [nameSaving, setNameSaving] = useState(false);

  async function handleIdFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setUploading(true);
      setError(null);
      try {
        const dataUrl = await resizeImageFile(file);
        const uploadRes = await fetch("/api/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patientId, docType: "id_card", kind: "id_card", dataUrl }),
        });
        const uploadJson = await uploadRes.json();
        if (!uploadRes.ok) {
          setError(uploadJson.error || "업로드에 실패했습니다");
          return;
        }
        void runIdOcr(dataUrl, uploadJson.path);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setUploading(false);
      }
    }
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  }

  // 신분증에서 이름·사진 추정 → 확인 시트
  async function runIdOcr(dataUrl: string, path: string) {
    setOcrBusy(true);
    let guess = "";
    let box: number[] | null = null;
    let card: number[] | null = null;
    let rotation = 0;
    let birth6 = "";
    try {
      const res = await fetch("/api/ocr-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      if (res.ok) {
        const json = await res.json();
        guess = typeof json.name === "string" ? json.name : "";
        box = Array.isArray(json.box) ? json.box : null;
        card = Array.isArray(json.card) ? json.card : null;
        rotation = typeof json.rotation === "number" ? json.rotation : 0;
        birth6 = typeof json.birth6 === "string" ? json.birth6 : "";
      }
    } catch {
      // 실패해도 이름 직접 입력 가능
    }

    let photoPath: string | undefined;
    if (box) {
      try {
        const faceRaw = await cropFace(dataUrl, box);
        if (faceRaw) {
          try {
            const fr = await fetch("/api/face-rotation", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ dataUrl: faceRaw }),
            });
            if (fr.ok) {
              const n = (await fr.json()).rotation;
              if (typeof n === "number") rotation = n;
            }
          } catch {
            /* 유지 */
          }
          const faceUrl = rotation ? await rotateDataUrl(faceRaw, rotation) : faceRaw;
          const up = await fetch("/api/uploads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ patientId, docType: "id_card", kind: "photo", dataUrl: faceUrl }),
          });
          if (up.ok) photoPath = (await up.json()).path;
        }
      } catch {
        /* 진행 */
      }
    }

    // 카드 영역 크롭(배경 제거) + 정위치 회전해 저장(같은 경로 덮어쓰기)
    let finalFull = dataUrl;
    try {
      let full = dataUrl;
      if (card) {
        const cropped = await cropBox(dataUrl, card);
        if (cropped) full = cropped;
      }
      if (rotation) full = await rotateDataUrl(full, rotation);
      if (full !== dataUrl) {
        await fetch("/api/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patientId, docType: "id_card", kind: "id_card", dataUrl: full }),
        });
        finalFull = full;
      }
    } catch {
      /* 진행 */
    }

    setOcrBusy(false);
    setNameSheet({ value: guess, path, photoPath, birth6, preview: finalFull });
  }

  // 확인: 신분증 문서 저장 + 이름 저장
  async function saveName() {
    if (!nameSheet) return;
    if (!nameSheet.value.trim()) {
      setError("환자 이름을 입력해 주세요.");
      return;
    }
    setNameSaving(true);
    try {
      const name0 = nameSheet.value.trim();
      let customerNo: number | null = null;
      if (name0 && nameSheet.birth6 && nameSheet.birth6.length === 6) {
        try {
          const mr = await fetch("/api/match-customer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name0, birth6: nameSheet.birth6 }),
          });
          if (mr.ok) customerNo = (await mr.json()).customer_no ?? null;
        } catch {
          /* 진행 */
        }
      }
      const formData: Record<string, unknown> = {};
      if (nameSheet.photoPath) formData.photo_path = nameSheet.photoPath;
      if (nameSheet.birth6) formData.birth6 = nameSheet.birth6;
      if (customerNo != null) formData.customer_no = customerNo;

      const docRes = await fetch(`/api/documents/${patientId}/id_card`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: nameSheet.path, status: "completed", form_data: formData }),
      });
      if (!docRes.ok) {
        const docJson = await docRes.json();
        setError(docJson.error || "저장에 실패했습니다");
        return;
      }
      await fetch(`/api/patients/${patientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name0 }),
      });
      try {
        window.dispatchEvent(new Event(PATIENTS_CHANGED_EVENT));
      } catch {
        /* 무시 */
      }
      setPreviewUrl(nameSheet.preview);
      setNameSheet(null);
      router.push(backHref);
    } finally {
      setNameSaving(false);
    }
  }

  return (
    <div className="doc-page">
      <div className="doc-page__toolbar no-print">
        <button type="button" className="doc-page__back" onClick={() => router.push(backHref)}>
          ← 목록으로
        </button>
      </div>

      {error && <div className="error-banner no-print">{error}</div>}

      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={handleIdFile} />
      <input ref={galleryInputRef} type="file" accept="image/*" hidden onChange={handleIdFile} />

      <div className="doc-sheet id-card-sheet">
        <h1 className="doc-sheet__title">신분증</h1>
        <p className="doc-sheet__subtitle">
          카메라로 촬영하거나, 미리 찍어둔 신분증 사진을 갤러리에서 선택해 불러오세요.
        </p>

        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="신분증 미리보기" className="id-card-sheet__preview" />
        ) : (
          <div className="id-card-sheet__placeholder">등록된 신분증 이미지가 없습니다</div>
        )}

        <div className="no-print" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="primary"
            style={{ width: "100%", padding: 14, fontSize: 15, fontWeight: 700, borderRadius: 999 }}
            onClick={() => setSheetOpen(true)}
            disabled={uploading}
          >
            {uploading ? "업로드 중..." : previewUrl ? "신분증 다시 등록" : "신분증 등록"}
          </button>
        </div>
      </div>

      {sheetOpen && (
        <div className="sheet-overlay sheet-overlay--center" onClick={() => setSheetOpen(false)}>
          <div className="sheet sheet--center" onClick={(e) => e.stopPropagation()}>
            <div className="sheet__title sheet__title--id">신분증 등록</div>
            <button
              type="button"
              className="sheet__option"
              onClick={() => {
                setSheetOpen(false);
                cameraInputRef.current?.click();
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
                galleryInputRef.current?.click();
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

      {ocrBusy && (
        <div className="sheet-overlay sheet-overlay--center">
          <div className="sheet sheet--center">
            <div className="sheet__title sheet__title--name">신분증 분석 중…</div>
            <p style={{ textAlign: "center", color: "var(--ink-soft)", fontSize: 13, lineHeight: 1.6 }}>
              AI가 이름과 사진을 자동으로 읽고 있어요. 잠시만 기다려 주세요.
            </p>
          </div>
        </div>
      )}

      {nameSheet && (
        <div className="sheet-overlay sheet-overlay--center">
          <div className="sheet sheet--center" onClick={(e) => e.stopPropagation()}>
            <div className="sheet__title sheet__title--name">환자 이름 확인</div>
            <p style={{ textAlign: "center", color: "var(--ink-soft)", fontSize: 13, marginTop: -4 }}>
              인식된 이름이 맞는지 확인하고, 다르면 고쳐 주세요.
            </p>
            <input
              type="text"
              value={nameSheet.value}
              placeholder="환자 이름"
              autoFocus
              onChange={(e) => setNameSheet((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
              }}
            />
            <div className="field-popup__actions">
              <button type="button" onClick={() => setNameSheet(null)}>
                취소
              </button>
              <button type="button" className="primary" onClick={saveName} disabled={nameSaving || !nameSheet.value.trim()}>
                {nameSaving ? "저장 중..." : "확인"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
