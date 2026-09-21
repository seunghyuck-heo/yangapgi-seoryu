"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PatientDocument } from "@/lib/db/types";
import { DOC_TYPE_LABELS, DOC_TYPE_ORDER } from "@/lib/templates/types";
import { getOverlayDoc } from "@/lib/overlays";
import { renderOverlayPage, renderImagePage } from "@/lib/pdf/renderBundle";
import OverlayDocumentForm, { OverlayDocumentFormHandle } from "@/components/OverlayDocumentForm";
import { PATIENTS_CHANGED_EVENT } from "@/components/BottomTabs";

interface Props {
  patientId: string;
  patientName: string;
  documents: PatientDocument[];
  onClose: () => void;
}

interface Page {
  docType: string;
  label: string;
  canvas: HTMLCanvasElement;
  dataUrl: string;
}

async function buildPages(
  docs: PatientDocument[],
  imgMap: Record<string, string>
): Promise<Page[]> {
  const out: Page[] = [];
  for (const docType of DOC_TYPE_ORDER) {
    const doc = docs.find((d) => d.doc_type === docType);
    if (!doc || doc.status !== "completed") continue;
    const label = DOC_TYPE_LABELS[docType];
    const completedAt = doc.completed_at ? new Date(doc.completed_at) : new Date();
    let canvas: HTMLCanvasElement | null = null;
    if (docType === "id_card") {
      const path = doc.file_path;
      if (path && imgMap[path]) canvas = await renderImagePage(imgMap[path]);
    } else {
      const overlay = getOverlayDoc(docType);
      if (overlay) canvas = await renderOverlayPage(overlay, doc.form_data ?? {}, imgMap, completedAt);
    }
    if (canvas) out.push({ docType, label, canvas, dataUrl: canvas.toDataURL("image/jpeg", 0.9) });
  }
  return out;
}

export default function DocumentBundleViewer({
  patientId,
  patientName,
  documents,
  onClose,
}: Props) {
  const [docs, setDocs] = useState<PatientDocument[]>(documents);
  const [imgMap, setImgMap] = useState<Record<string, string>>({});
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const editRefs = useRef<Record<string, OverlayDocumentFormHandle | null>>({});
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fileBase = `${patientName || "환자"}_양압기서류`;

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/patients/${patientId}/assets`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "이미지를 불러오지 못했습니다");
        const map: Record<string, string> = json.images ?? {};
        const out = await buildPages(documents, map);
        if (!cancelled) {
          setImgMap(map);
          setPages(out);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [patientId, documents]);

  // 수정 가능한 오버레이 서류(신분증 제외)
  const editableDocs = DOC_TYPE_ORDER.map((dt) => ({
    docType: dt,
    doc: docs.find((d) => d.doc_type === dt),
    overlay: getOverlayDoc(dt),
  })).filter((x) => x.doc?.status === "completed" && x.overlay);

  function handlePrint() {
    document.body.classList.add("bundle-printing");
    const cleanup = () => {
      document.body.classList.remove("bundle-printing");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
    setTimeout(cleanup, 1000);
  }

  async function buildPdfFile(): Promise<File> {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    pages.forEach((p, i) => {
      if (i > 0) pdf.addPage();
      const cw = p.canvas.width;
      const ch = p.canvas.height;
      const r = Math.min(pw / cw, ph / ch);
      const w = cw * r;
      const h = ch * r;
      pdf.addImage(p.canvas.toDataURL("image/jpeg", 0.85), "JPEG", (pw - w) / 2, (ph - h) / 2, w, h);
    });
    return new File([pdf.output("blob")], `${fileBase}.pdf`, { type: "application/pdf" });
  }

  async function handleShare(mode: "email" | "fax") {
    if (busy || pages.length === 0) return;
    setBusy(true);
    try {
      const file = await buildPdfFile();
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare && nav.canShare({ files: [file] }) && navigator.share) {
        await navigator.share({
          files: [file],
          title: fileBase,
          text: mode === "fax" ? "양압기 서류 (팩스 전송용)" : "양압기 서류",
        });
      } else {
        const url = URL.createObjectURL(file);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
        showToast("이 기기는 공유창을 지원하지 않아 PDF를 저장했습니다. 저장된 파일을 첨부해 보내세요.");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") showToast("전송 준비 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function applyEdits() {
    setSavingEdit(true);
    try {
      const handles = Object.values(editRefs.current).filter(Boolean) as OverlayDocumentFormHandle[];
      await Promise.all(handles.map((h) => h.save()));
      // 저장 후 최신 데이터로 다시 로드하고 미리보기 캔버스 재생성
      let newDocs = docs;
      try {
        const pres = await fetch(`/api/patients/${patientId}`);
        const pj = await pres.json();
        if (pres.ok && pj.patient?.documents) newDocs = pj.patient.documents;
      } catch {
        // 무시
      }
      let map = imgMap;
      try {
        const ares = await fetch(`/api/patients/${patientId}/assets`);
        const aj = await ares.json();
        if (ares.ok) map = aj.images ?? {};
      } catch {
        // 무시
      }
      setDocs(newDocs);
      setImgMap(map);
      setPages(await buildPages(newDocs, map));
      try {
        window.dispatchEvent(new Event(PATIENTS_CHANGED_EVENT));
      } catch {
        // 무시
      }
      setConfirmOpen(false);
      setEditMode(false);
      showToast("수정사항이 반영되었습니다.");
    } catch {
      showToast("저장 중 오류가 발생했습니다.");
    } finally {
      setSavingEdit(false);
    }
  }

  const modal = (
    <div className="bundle-viewer">
      <div className="bundle-viewer__bar bundle-viewer__bar--top no-print">
        {editMode ? (
          <span style={{ width: 40 }} aria-hidden />
        ) : (
          <button type="button" className="bundle-viewer__close" aria-label="닫기" onClick={onClose}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
        <span className="bundle-viewer__title">{editMode ? "서류 수정" : "서류 묶음 (PDF)"}</span>
        <span style={{ width: 40 }} aria-hidden />
      </div>

      {editMode ? (
        <div className="bundle-viewer__edit">
          <p className="bundle-viewer__edithint no-print">초록색으로 표시된 칸을 눌러 수정하세요.</p>
          {editableDocs.map(({ docType, doc, overlay }) => (
            <OverlayDocumentForm
              key={docType}
              ref={(el) => {
                editRefs.current[docType] = el;
              }}
              overlay={overlay!}
              docType={docType}
              patientId={patientId}
              initialFormData={doc!.form_data ?? {}}
              initialSignedUrls={imgMap}
              initialStatus="completed"
              backHref=""
              embedded
              editMode
            />
          ))}
        </div>
      ) : (
        <div className="bundle-viewer__pages">
          {loading && <p className="bundle-viewer__msg no-print">서류를 준비하는 중...</p>}
          {error && <p className="bundle-viewer__msg no-print">{error}</p>}
          {pages.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.docType} className="bundle-page" src={p.dataUrl} alt={p.label} />
          ))}
        </div>
      )}

      {!loading && !error && !editMode && (
        <div className="bundle-viewer__bar bundle-viewer__bar--bottom no-print">
          {editableDocs.length > 0 && (
            <button type="button" className="bundle-viewer__action" onClick={() => setEditMode(true)} disabled={busy}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
              </svg>
              수정
            </button>
          )}
          <button type="button" className="bundle-viewer__action" onClick={handlePrint} disabled={busy}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" />
            </svg>
            출력하기
          </button>
          <button type="button" className="bundle-viewer__action" onClick={() => handleShare("email")} disabled={busy}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-10 6L2 7" />
            </svg>
            이메일
          </button>
          <button type="button" className="bundle-viewer__action" onClick={() => handleShare("fax")} disabled={busy}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <path d="M6 14h12v8H6zM10 18h4" />
            </svg>
            팩스
          </button>
        </div>
      )}

      {editMode && (
        <div className="bundle-viewer__bar bundle-viewer__bar--bottom no-print">
          <button type="button" className="edit-actionbar__cancel" style={{ flex: 1 }} onClick={() => setEditMode(false)} disabled={savingEdit}>
            취소
          </button>
          <button type="button" className="edit-actionbar__delete" style={{ flex: 1, background: "var(--brand)" }} onClick={() => setConfirmOpen(true)} disabled={savingEdit}>
            완료
          </button>
        </div>
      )}

      {confirmOpen && (
        <div className="sheet-overlay sheet-overlay--center" onClick={() => !savingEdit && setConfirmOpen(false)}>
          <div className="sheet sheet--center" onClick={(e) => e.stopPropagation()}>
            <div className="sheet__title sheet__title--name">수정사항 반영</div>
            <p style={{ textAlign: "center", color: "var(--ink-soft)", fontSize: 14, margin: "-4px 0 16px" }}>
              수정사항을 반영하시겠습니까?
            </p>
            <div className="field-popup__actions">
              <button type="button" onClick={() => setConfirmOpen(false)} disabled={savingEdit}>
                취소
              </button>
              <button type="button" className="primary" onClick={applyEdits} disabled={savingEdit}>
                {savingEdit ? "반영 중..." : "반영하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {busy && <div className="bundle-viewer__msg bundle-viewer__busy no-print">전송 준비 중...</div>}
      {toast && <div className="toast no-print">{toast}</div>}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
