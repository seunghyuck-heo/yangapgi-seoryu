"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface IdCardUploaderProps {
  patientId: string;
  initialUrl?: string;
  initialStatus: "draft" | "completed";
  backHref: string;
}

const MAX_DIMENSION = 1800;
const JPEG_QUALITY = 0.85;

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

export default function IdCardUploader({
  patientId,
  initialUrl,
  backHref,
}: IdCardUploaderProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(initialUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const dataUrl = await resizeImageFile(file);
      const uploadRes = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          docType: "id_card",
          kind: "id_card",
          dataUrl,
        }),
      });
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok) {
        setError(uploadJson.error || "업로드에 실패했습니다");
        return;
      }

      const docRes = await fetch(`/api/documents/${patientId}/id_card`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: uploadJson.path, status: "completed" }),
      });
      const docJson = await docRes.json();
      if (!docRes.ok) {
        setError(docJson.error || "저장에 실패했습니다");
        return;
      }

      setPreviewUrl(dataUrl);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
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

      <div className="doc-sheet id-card-sheet">
        <h1 className="doc-sheet__title">신분증</h1>
        <p className="doc-sheet__subtitle">
          휴대폰 기본 스캔 기능(메모 앱 등)으로 미리 찍어둔 신분증 사진을 갤러리에서 선택해
          불러오세요.
        </p>

        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="신분증 미리보기" className="id-card-sheet__preview" />
        ) : (
          <div className="id-card-sheet__placeholder">등록된 신분증 이미지가 없습니다</div>
        )}

        <div className="no-print" style={{ marginTop: 16 }}>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            disabled={uploading}
          />
          {uploading && <p>업로드 중...</p>}
        </div>
      </div>
    </div>
  );
}
