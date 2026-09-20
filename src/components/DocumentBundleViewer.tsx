"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PatientDocument } from "@/lib/db/types";
import { DOC_TYPE_LABELS, DOC_TYPE_ORDER } from "@/lib/templates/types";
import { getOverlayDoc } from "@/lib/overlays";
import { renderOverlayPage, renderImagePage } from "@/lib/pdf/renderBundle";

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

export default function DocumentBundleViewer({
  patientId,
  patientName,
  documents,
  onClose,
}: Props) {
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
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
        const imgMap: Record<string, string> = json.images ?? {};

        const out: Page[] = [];
        for (const docType of DOC_TYPE_ORDER) {
          const doc = documents.find((d) => d.doc_type === docType);
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
          if (canvas) {
            out.push({ docType, label, canvas, dataUrl: canvas.toDataURL("image/jpeg", 0.9) });
          }
        }
        if (!cancelled) {
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

  function handlePrint() {
    document.body.classList.add("bundle-printing");
    const cleanup = () => {
      document.body.classList.remove("bundle-printing");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
    // afterprint 미발생 브라우저 대비
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
      const x = (pw - w) / 2;
      const y = (ph - h) / 2;
      pdf.addImage(p.canvas.toDataURL("image/jpeg", 0.85), "JPEG", x, y, w, h);
    });
    const blob = pdf.output("blob");
    return new File([blob], `${fileBase}.pdf`, { type: "application/pdf" });
  }

  async function handleShare(mode: "email" | "fax") {
    if (busy || pages.length === 0) return;
    setBusy(true);
    try {
      const file = await buildPdfFile();
      const shareData: ShareData = {
        files: [file],
        title: fileBase,
        text: mode === "fax" ? "양압기 서류 (팩스 전송용)" : "양압기 서류",
      };
      const nav = navigator as Navigator & {
        canShare?: (d: ShareData) => boolean;
      };
      if (nav.canShare && nav.canShare({ files: [file] }) && navigator.share) {
        await navigator.share(shareData);
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
      // 사용자가 공유를 취소한 경우(AbortError)는 조용히 넘어감
      if ((e as Error).name !== "AbortError") {
        showToast("전송 준비 중 오류가 발생했습니다.");
      }
    } finally {
      setBusy(false);
    }
  }

  const modal = (
    <div className="bundle-viewer">
      <div className="bundle-viewer__bar bundle-viewer__bar--top no-print">
        <button type="button" className="bundle-viewer__close" aria-label="닫기" onClick={onClose}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <span className="bundle-viewer__title">서류 묶음 (PDF)</span>
        <span style={{ width: 40 }} aria-hidden />
      </div>

      <div className="bundle-viewer__pages">
        {loading && <p className="bundle-viewer__msg no-print">서류를 준비하는 중...</p>}
        {error && <p className="bundle-viewer__msg no-print">{error}</p>}
        {pages.map((p) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={p.docType} className="bundle-page" src={p.dataUrl} alt={p.label} />
        ))}
      </div>

      {!loading && !error && (
        <div className="bundle-viewer__bar bundle-viewer__bar--bottom no-print">
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

      {busy && <div className="bundle-viewer__msg bundle-viewer__busy no-print">전송 준비 중...</div>}
      {toast && <div className="toast no-print">{toast}</div>}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
