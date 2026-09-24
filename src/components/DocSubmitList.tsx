"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DocType } from "@/lib/templates/types";
import { DOC_ICON_STYLES } from "./docIcons";
import { PATIENTS_CHANGED_EVENT } from "./BottomTabs";

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

// 이미지를 시계방향 deg(0/90/180/270)만큼 회전한 jpeg dataURL 반환
function rotateDataUrl(dataUrl: string, deg: number): Promise<string> {
  return new Promise((resolve) => {
    const r = ((deg % 360) + 360) % 360;
    if (r === 0) {
      resolve(dataUrl);
      return;
    }
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
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((r * Math.PI) / 180);
      ctx.drawImage(img, -w / 2, -h / 2);
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.src = dataUrl;
  });
}

// Gemini 얼굴 box[ymin,xmin,ymax,xmax](0~1000) 중심으로 정사각형 크롭 → 원형 아바타에 얼굴이 꽉 차게
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
      if (bw < 8 || bh < 8) {
        resolve(null);
        return;
      }
      // 얼굴 중심 기준 정사각형(얼굴 크기 + 약간 여유)
      const cx = (bx0 + bx1) / 2;
      const cy = (by0 + by1) / 2;
      let side = Math.max(bw, bh) * 1.25;
      side = Math.min(side, W, H);
      let sx = cx - side / 2;
      let sy = cy - side / 2;
      sx = Math.max(0, Math.min(sx, W - side));
      sy = Math.max(0, Math.min(sy, H - side));
      const out = 320; // 아바타용 출력 크기
      const canvas = document.createElement("canvas");
      canvas.width = out;
      canvas.height = out;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.src = dataUrl;
  });
}

// Gemini card box[ymin,xmin,ymax,xmax](0~1000) 영역으로 신분증만 잘라내 배경 제거
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
      if (w < 20 || h < 20) {
        resolve(null);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w);
      canvas.height = Math.round(h);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
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
  const [nameSheet, setNameSheet] = useState<{ value: string; path: string; pid: string; photoPath?: string; birth6?: string } | null>(null);
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
      "/documents/contract.jpg",
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
      // 실패해도 이름은 직접 입력 가능
    }

    // 신분증에서 증명사진 잘라내고, '잘린 얼굴'만 AI에 다시 물어 정위치 회전각 결정(정확도 ↑)
    let photoPath: string | undefined;
    if (box) {
      try {
        const faceRaw = await cropFace(dataUrl, box);
        if (faceRaw) {
          // 얼굴 크롭만 보고 회전각 판단
          try {
            const fr = await fetch("/api/face-rotation", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ dataUrl: faceRaw }),
            });
            if (fr.ok) {
              const n = (await fr.json()).rotation;
              if (typeof n === "number") rotation = n; // 얼굴 기준 회전각 우선
            }
          } catch {
            // 실패 시 신분증 기준 rotation 유지
          }
          const faceUrl = rotation ? await rotateDataUrl(faceRaw, rotation) : faceRaw;
          const up = await fetch("/api/uploads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ patientId: pid, docType: "id_card", kind: "photo", dataUrl: faceUrl }),
          });
          if (up.ok) photoPath = (await up.json()).path;
        }
      } catch {
        // 사진 추출 실패해도 진행
      }
    }

    // 신분증만 남기고 배경 제거(카드 영역 크롭) + 정위치 회전해 저장(같은 경로 덮어쓰기)
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
          body: JSON.stringify({ patientId: pid, docType: "id_card", kind: "id_card", dataUrl: full }),
        });
      }
    } catch {
      // 실패해도 진행
    }

    setOcrBusy(false);
    setNameSheet({ value: guess, path, pid, photoPath, birth6 });
  }

  // 확인: 이 시점에 신분증 문서를 실제로 저장(등록)하고, 이름이 있으면 함께 저장
  async function saveName() {
    if (!nameSheet) return;
    // 이름이 입력돼야 정식 환자로 등록 (신분증 업로드 + 이름 입력 후부터 카운팅)
    if (!nameSheet.value.trim()) {
      setError("환자 이름을 입력해 주세요.");
      return;
    }
    const pid = nameSheet.pid;
    setNameSaving(true);
    try {
      const name0 = nameSheet.value.trim();
      // 고객 참조 매칭(이름+생년월일6) → 고유번호
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
          // 매칭 실패해도 진행
        }
      }
      const formData: Record<string, unknown> = {};
      if (nameSheet.photoPath) formData.photo_path = nameSheet.photoPath;
      if (nameSheet.birth6) formData.birth6 = nameSheet.birth6;
      if (customerNo != null) formData.customer_no = customerNo;

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
      const name = nameSheet.value.trim();
      if (name) {
        await fetch(`/api/patients/${pid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
      }
      // 환자 보기 탭 배지 즉시 갱신
      try {
        window.dispatchEvent(new Event(PATIENTS_CHANGED_EVENT));
      } catch {
        // 무시
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
    </div>
  );
}
