"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DocType } from "@/lib/templates/types";
import { DOC_ICON_STYLES } from "./docIcons";
import { PATIENTS_CHANGED_EVENT } from "./BottomTabs";
import CustomerPicker from "./CustomerPicker";
import { candidateFormData, lookupCustomerByName, type CustomerCandidate } from "@/lib/customerLookup";

interface DocSubmitListProps {
  /** null이면 아직 폴더 없음 — 목록은 즉시 표시, 저장 행동 시 ensurePatientId로 생성 */
  patientId: string | null;
  /** preview mode: rows link to /preview/[docType], no status fetch */
  preview?: boolean;
  /** when opened from the 서식 제출 tab: forms return to /submit */
  fromSubmit?: boolean;
  /** 저장 시점에만 환자 폴더를 만드는 지연 생성 함수(로그인 상태에서만 전달) */
  ensurePatientId?: () => Promise<string | null>;
  /** 신분증 등록(정식 환자 등록)이 끝났을 때 호출 — 상위에서 '새 환자'로 리셋하는 용도 */
  onRegistered?: () => void;
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
  { docType: "rental_guide", title: "양압기 임대 안내", subtitle: "임대 안내 확인 및 기기 안전교육 서명" },
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
  onRegistered,
}: DocSubmitListProps) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameSheet, setNameSheet] = useState<{ value: string; path: string; pid: string } | null>(null);
  const [pickList, setPickList] = useState<CustomerCandidate[] | null>(null);
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

  // 서식 배경 이미지 미리 로드(캐시) → 문서 진입 시 즉시 표시
  useEffect(() => {
    const bgs = [
      "/documents/contract-7.jpg",
      "/documents/subsidy.jpg",
      "/documents/cms.jpg",
      "/documents/poa.jpg",
    ];
    for (const src of bgs) {
      const img = new Image();
      img.src = src;
    }
  }, []);

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
        // 신분증 이미지만 저장(AI 자동인식 제거). 이름은 아래 확인창에서 직접 입력하고,
        // '확인'을 눌러야 신분증 문서가 실제로 저장(정식 등록)된다. 취소하면 저장 안 됨.
        setNameSheet({ value: "", path: uploadJson.path, pid });
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setUploading(false);
      }
    }
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  }

  // 확인: 입력한 이름으로 구글시트(고객파일) 조회 → 주민번호·연락처·고유번호를 가져와 등록.
  //  · 후보 1명(또는 0명): 바로 저장.  · 2명↑(동명이인): 선택창을 띄워 직원이 고른 뒤 저장.
  async function saveName() {
    if (!nameSheet) return;
    // 이름이 입력돼야 정식 환자로 등록 (신분증 업로드 + 이름 입력 후부터 카운팅)
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
    const pid = nameSheet.pid;
    setNameSaving(true);
    try {
      const formData = candidateFormData(chosen);
      const docRes = await fetch(`/api/documents/${pid}/id_card`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_path: nameSheet.path,
          status: "completed",
          form_data: formData,
        }),
      });
      if (!docRes.ok) {
        const docJson = await docRes.json();
        setError(docJson.error || "저장에 실패했습니다");
        return;
      }
      await fetch(`/api/patients/${pid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name0 }),
      });
      // 환자 보기 탭 배지 즉시 갱신
      try {
        window.dispatchEvent(new Event(PATIENTS_CHANGED_EVENT));
      } catch {
        // 무시
      }
      setNameSheet(null);
      setPickList(null);
      // 위 서식은 '새 환자'로 리셋하고(onRegistered), 방금 등록한 환자의 상세로 이동해
      // 그 환자의 서식(이름·주민번호·연락처 자동입력됨)을 바로 이어 작성하게 한다.
      onRegistered?.();
      router.push(`/patients/${pid}?from=submit`);
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
              <button
                type="button"
                className="primary"
                onClick={saveName}
                disabled={nameSaving || !nameSheet.value.trim()}
              >
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

      {nameSaving && (
        <div className="sheet-overlay sheet-overlay--center">
          <div className="sheet sheet--center">
            <div className="sheet__title sheet__title--name">자동 입력 중…</div>
            <p style={{ textAlign: "center", color: "var(--ink-soft)", fontSize: 13.5, lineHeight: 1.7 }}>
              이름 · 주민번호 · 연락처 · 환자번호를
              <br />
              자동으로 입력하고 있어요. 잠시만 기다려 주세요.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
