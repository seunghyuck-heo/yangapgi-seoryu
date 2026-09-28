// PDF 다운로드 공용 유틸 — 캔버스(들)을 A4 세로 PDF로 만들어 저장/공유.

// 오늘 날짜 YYYYMMDD
export function todayStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

// 파일명에 쓸 수 없는 문자 제거
export function safeFileName(s: string): string {
  return (s || "").replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
}

// 캔버스 목록으로 A4 세로 PDF Blob 생성(각 캔버스 = 한 페이지)
async function buildPdfBlob(canvases: HTMLCanvasElement[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  canvases.forEach((canvas, i) => {
    if (i > 0) pdf.addPage();
    const r = Math.min(pw / canvas.width, ph / canvas.height);
    const w = canvas.width * r;
    const h = canvas.height * r;
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", (pw - w) / 2, (ph - h) / 2, w, h);
  });
  return pdf.output("blob");
}

// 터치 기기(모바일/태블릿)인지: 공유시트('파일에 저장')를 쓸지 판단.
// PC(마우스, 미세 포인터)에서는 공유팝업 없이 곧바로 '다운로드' 폴더로 저장.
function isTouchDevice(): boolean {
  try {
    return (
      typeof matchMedia === "function" &&
      matchMedia("(pointer: coarse)").matches &&
      (navigator.maxTouchPoints ?? 0) > 0
    );
  } catch {
    return false;
  }
}

// PDF 저장: 모바일/태블릿(특히 iPad)에선 공유시트의 '파일에 저장', PC에선 바로 다운로드 폴더로 저장
export async function downloadCanvasesAsPdf(canvases: HTMLCanvasElement[], filename: string): Promise<void> {
  const blob = await buildPdfBlob(canvases);
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const file = new File([blob], filename, { type: "application/pdf" });
  // PC가 아니라 터치 기기일 때만 공유시트 사용(파일에 저장). PC는 공유 건너뛰고 직접 다운로드.
  if (isTouchDevice() && nav.canShare && nav.canShare({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return; // 사용자가 취소
      // 공유 실패 → 아래 다운로드로 폴백
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadCanvasAsPdf(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  return downloadCanvasesAsPdf([canvas], filename);
}
