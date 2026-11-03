"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PATIENTS_CHANGED_EVENT } from "./BottomTabs";
import CustomerPicker from "./CustomerPicker";
import { candidateFormData, lookupCustomerByName, type CustomerCandidate } from "@/lib/customerLookup";

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
  const [nameSheet, setNameSheet] = useState<{ value: string; path: string; preview: string } | null>(null);
  // 동명이인일 때 띄우는 선택 후보 목록(시트 조회 결과가 2명↑).
  const [pickList, setPickList] = useState<CustomerCandidate[] | null>(null);
  const [nameSaving, setNameSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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
        // 신분증 이미지만 저장(AI 자동인식 제거). 이름은 아래 확인창에서 직접 입력한다.
        setPreviewUrl(dataUrl);
        setNameSheet({ value: "", path: uploadJson.path, preview: dataUrl });
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setUploading(false);
      }
    }
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  }

  // 확인: 입력한 이름으로 구글시트(고객파일) 조회 → 주민번호·연락처·고유번호를 가져와 저장.
  //  · 후보 1명(또는 0명): 바로 저장.  · 2명↑(동명이인): 선택창을 띄워 직원이 고른 뒤 저장.
  async function saveName() {
    if (!nameSheet) return;
    const name0 = nameSheet.value.trim();
    if (!name0) {
      setError("환자 이름을 입력해 주세요.");
      return;
    }
    setNameSaving(true);
    setError(null);
    try {
      const candidates = await lookupCustomerByName(name0);
      if (candidates.length > 1) {
        setPickList(candidates); // 동명이인 → 선택창
        setNameSaving(false);
        return;
      }
      await finalizeSave(name0, candidates[0] ?? null);
    } catch {
      setNameSaving(false);
      setError("저장 중 오류가 발생했습니다. 다시 시도해 주세요.");
    }
  }

  // 실제 저장: 신분증 문서(이미지+시트정보) + 환자 이름.
  async function finalizeSave(name0: string, chosen: CustomerCandidate | null) {
    if (!nameSheet) return;
    setNameSaving(true);
    try {
      const formData = candidateFormData(chosen);
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
      const preview = nameSheet.preview;
      const hasRrn = typeof formData.rrn === "string";
      const msg = chosen
        ? `이름·신분증 저장됨 · 시트에서 ${hasRrn ? "주민번호·연락처" : "연락처"} 불러옴 (No.${chosen.customer_no})`
        : "이름·신분증 저장됨 · 시트에 없는 이름(주민번호·연락처는 서식에서 입력)";
      setPreviewUrl(preview);
      setNameSheet(null);
      setPickList(null);
      setToast(msg);
      setTimeout(() => router.push(backHref), 1800);
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
      {toast && <div className="toast no-print">{toast}</div>}

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
            style={{ width: 130, padding: "14px 0", fontSize: 15, fontWeight: 700, borderRadius: 999 }}
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

      {nameSheet && (
        <div className="sheet-overlay sheet-overlay--center">
          <div className="sheet sheet--center" onClick={(e) => e.stopPropagation()}>
            <div className="sheet__title sheet__title--name">환자 이름 입력</div>
            <p style={{ textAlign: "center", color: "var(--ink-soft)", fontSize: 13, marginTop: -4 }}>
              이름을 입력하면 구글시트에서 주민번호·연락처를 찾아 서식에 자동으로 채웁니다.
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

      {pickList && nameSheet && (
        <CustomerPicker
          name={nameSheet.value.trim()}
          candidates={pickList}
          onPick={(c) => finalizeSave(nameSheet.value.trim(), c)}
          onCancel={() => setPickList(null)}
        />
      )}
    </div>
  );
}
