"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DocType } from "@/lib/templates/types";
import { DOC_ICON_STYLES } from "./docIcons";

interface DocSubmitListProps {
  /** null이면 아직 폴더 없음 — 목록은 즉시 표시, 저장 행동 시 ensurePatientId로 생성 */
  patientId: string | null;
  /** preview mode: rows link to /preview/[docType], no status fetch */
  preview?: boolean;
  /** when opened from the 서식 제출 tab: forms return to /submit */
  fromSubmit?: boolean;
  /** 저장 시점에만 환자 폴더를 만드는 지연 생성 함수(로그인 상태에서만 전달) */
  ensurePatientId?: () => Promise<string | null>;
}

interface RowConfig {
  docType: DocType;
  title: string;
  subtitle: string;
}

const ROWS: RowConfig[] = [
  { docType: "id_card", title: "신분증", subtitle: "카메라 촬영 또는 갤러리에서 업로드" },
  { docType: "contract", title: "양압기치료 서비스 표준계약서", subtitle: "대여 계약 작성 및 서명" },
  { docType: "subsidy_application", title: "양압기 급여대상자 등록 신청서", subtitle: "급여 대상자 등록 신청" },
  { docType: "cms_autopay", title: "CMS 자동이체 신청서", subtitle: "대여료 자동이체 등록" },
  { docType: "power_of_attorney", title: "요양비 지급청구 위임장", subtitle: "요양비 청구 위임" },
];

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

export default function DocSubmitList({
  patientId,
  preview = false,
  fromSubmit = false,
  ensurePatientId,
}: DocSubmitListProps) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [nameSheet, setNameSheet] = useState<{ value: string; path: string; pid: string } | null>(null);
  const [nameSaving, setNameSaving] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  // 탭 진입 지연 제거: 각 서식 라우트를 미리 프리페치해 즉시 전환
  useEffect(() => {
    for (const row of ROWS) {
      if (row.docType === "id_card") continue;
      if (preview) {
        router.prefetch(`/preview/${row.docType}`);
      } else if (patientId) {
        router.prefetch(`/patients/${patientId}/doc/${row.docType}`);
      }
    }
  }, [patientId, preview, router]);

  async function handleIdFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setUploading(true);
      setError(null);
      try {
        // 저장 시점에만 폴더 생성(지연 생성)
        let pid = patientId;
        if (!pid && ensurePatientId) pid = await ensurePatientId();
        if (!pid) {
          setError("잠시 후 다시 시도해 주세요");
          return;
        }
        const dataUrl = await resizeImageFile(file);
        const uploadRes = await fetch("/api/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patientId: pid, docType: "id_card", kind: "id_card", dataUrl }),
        });
        const uploadJson = await uploadRes.json();
        if (!uploadRes.ok) {
          setError(uploadJson.error || "업로드에 실패했습니다");
          return;
        }
        // 신분증 문서 저장은 이름 확인 팝업에서 '확인'을 눌러야 실제로 이뤄진다.
        // (취소하면 저장되지 않아 환자 보기에 나타나지 않음)
        void runIdOcr(dataUrl, uploadJson.path, pid);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setUploading(false);
      }
    }
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  }

  // 신분증 이미지에서 이름 추정 → 확인/수정 시트 (완전 브라우저 처리, 외부 전송 없음)
  async function runIdOcr(dataUrl: string, path: string, pid: string) {
    if (preview) return;
    setOcrBusy(true);
    let guess = "";
    try {
      const res = await fetch("/api/ocr-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      if (res.ok) {
        const json = await res.json();
        guess = typeof json.name === "string" ? json.name : "";
      }
    } catch {
      // 실패해도 이름은 직접 입력 가능
    } finally {
      setOcrBusy(false);
    }
    setNameSheet({ value: guess, path, pid });
  }

  // 확인: 이 시점에 신분증 문서를 실제로 저장(등록)하고, 이름이 있으면 함께 저장
  async function saveName() {
    if (!nameSheet) return;
    const pid = nameSheet.pid;
    setNameSaving(true);
    try {
      const docRes = await fetch(`/api/documents/${pid}/id_card`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: nameSheet.path, status: "completed" }),
      });
      if (!docRes.ok) {
        const docJson = await docRes.json();
        setError(docJson.error || "저장에 실패했습니다");
        return;
      }
      const name = nameSheet.value.trim();
      if (name) {
        await fetch(`/api/patients/${pid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
      }
      setNameSheet(null);
    } finally {
      setNameSaving(false);
    }
  }

  async function handleRowClick(docType: DocType) {
    if (docType === "id_card") {
      setSheetOpen(true);
      return;
    }
    if (preview) {
      router.push(`/preview/${docType}`);
      return;
    }
    // 저장 시점에만 폴더 생성(지연 생성)
    let pid = patientId;
    if (!pid && ensurePatientId) pid = await ensurePatientId();
    if (!pid) return;
    const query = fromSubmit ? "?from=submit" : "";
    router.push(`/patients/${pid}/doc/${docType}${query}`);
  }

  return (
    <div className="doc-submit">
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={handleIdFile}
      />
      <input ref={galleryInputRef} type="file" accept="image/*" hidden onChange={handleIdFile} />

      {error && <div className="error-banner">{error}</div>}

      <ul className="doc-submit__list">
        {ROWS.map((row) => {
          const style = DOC_ICON_STYLES[row.docType];
          return (
            <li key={row.docType}>
              <button
                type="button"
                className="doc-submit__row"
                onClick={() => handleRowClick(row.docType)}
                disabled={row.docType === "id_card" && uploading}
              >
                <span
                  className="doc-submit__icon"
                  style={{ background: style.color, color: "#fff" }}
                >
                  {style.icon}
                </span>
                <span className="doc-submit__text">
                  <span className="doc-submit__title">{row.title}</span>
                  <span className="doc-submit__subtitle">{row.subtitle}</span>
                </span>
                {row.docType === "id_card" ? (
                  <span className="doc-submit__upload">
                    {uploading ? "업로드 중" : "업로드"}
                  </span>
                ) : (
                  <span className="doc-submit__chevron" aria-hidden>
                    ›
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

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
            <div className="sheet__title">신분증에서 이름 인식 중…</div>
            <p style={{ textAlign: "center", color: "var(--ink-soft)", fontSize: 13, lineHeight: 1.6 }}>
              AI가 이름을 자동으로 읽고 있어요. 잠시만 기다려 주세요.
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
              <button type="button" className="primary" onClick={saveName} disabled={nameSaving}>
                {nameSaving ? "저장 중..." : "확인"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
