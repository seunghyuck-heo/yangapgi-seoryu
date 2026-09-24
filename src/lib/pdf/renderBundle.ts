import { OverlayDoc, OverlayField } from "@/lib/overlays/types";

// OverlayDocumentForm 의 화면 렌더링(renderFieldOverlay)을 캔버스에 그대로 재현해
// 완료 서류를 이미지 페이지로 만든다. 텍스트 폰트/정렬/체크/네모칸/서명까지 동일 규칙.

const FONT_STACK =
  '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", -apple-system, BlinkMacSystemFont, sans-serif';
const INK = "#12203f";

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`이미지 로드 실패: ${src}`));
    img.src = src;
  });
}

function formatBoxPattern(raw: string, pattern: number[]): string {
  const total = pattern.reduce((a, b) => a + b, 0);
  const digits = raw.replace(/\D/g, "").slice(0, total);
  let out = "";
  let i = 0;
  for (let s = 0; s < pattern.length; s++) {
    const seg = digits.slice(i, i + pattern[s]);
    out += seg;
    i += pattern[s];
    if (seg.length === pattern[s] && s < pattern.length - 1) out += "-";
    if (seg.length < pattern[s]) break;
  }
  return out;
}

/** autoToday 날짜 필드가 비어 있으면 완료일(없으면 오늘)로 채운 값 반환 */
function effectiveDateValue(field: OverlayField, stored: unknown, when: Date): string | null {
  if (typeof stored === "string" && stored.trim()) return stored;
  if (!field.autoToday || !field.datePart) return null;
  const base = new Date(when);
  if (field.autoTodayOffsetYears) base.setFullYear(base.getFullYear() + field.autoTodayOffsetYears);
  const y = base.getFullYear();
  const m = base.getMonth() + 1;
  const d = base.getDate();
  if (field.datePart === "y") return field.fullYear ? String(y) : String(y).slice(-2);
  if (field.datePart === "m") return String(m);
  if (field.datePart === "d") return String(d);
  if (field.datePart === "full") return `${y}.${m}.${d}`;
  return null;
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  fontPx: number,
  align: OverlayField["align"]
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(bx, by, bw, bh);
  ctx.clip();
  ctx.font = `600 ${fontPx}px ${FONT_STACK}`;
  ctx.fillStyle = INK;
  ctx.textBaseline = "middle";
  const cy = by + bh / 2 + 0.18 * fontPx; // CSS transform: translateY(0.18em)
  let x = bx + bw / 2;
  if (align === "left") {
    ctx.textAlign = "left";
    x = bx;
  } else if (align === "right") {
    ctx.textAlign = "right";
    x = bx + bw;
  } else {
    ctx.textAlign = "center";
    x = bx + bw / 2;
  }
  ctx.fillText(text, x, cy);
  ctx.restore();
}

function drawCheck(
  ctx: CanvasRenderingContext2D,
  bx: number,
  by: number,
  bw: number,
  bh: number
) {
  const s = 0.95 * bh; // .odoc-hotspot__check { height:95%; aspect-ratio:1/1 }
  const cx = bx + bw / 2;
  const cy = by + bh / 2;
  const scale = s / 24;
  const ox = cx - s / 2;
  const oy = cy - s / 2;
  const pts = [
    [20, 6],
    [9, 17],
    [4, 12],
  ];
  ctx.save();
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 3.5 * scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  pts.forEach((p, i) => {
    const px = ox + p[0] * scale;
    const py = oy + p[1] * scale;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  ctx.restore();
}

function drawCells(
  ctx: CanvasRenderingContext2D,
  chars: string[],
  cellLefts: number[],
  cellWidths: number[],
  by: number,
  bh: number,
  fontPx: number
) {
  ctx.save();
  ctx.font = `600 ${fontPx}px ${FONT_STACK}`;
  ctx.fillStyle = INK;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  const cy = by + bh / 2 + 0.18 * fontPx; // boxcell 도 translateY(0.18em)
  chars.forEach((ch, i) => {
    if (!ch) return;
    ctx.fillText(ch, cellLefts[i] + cellWidths[i] / 2, cy);
  });
  ctx.restore();
}

function drawSignature(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  bx: number,
  by: number,
  bw: number,
  bh: number
) {
  // object-fit: contain
  const ir = img.width / img.height;
  const br = bw / bh;
  let w = bw;
  let h = bh;
  if (ir > br) {
    w = bw;
    h = bw / ir;
  } else {
    h = bh;
    w = bh * ir;
  }
  const x = bx + (bw - w) / 2;
  const y = by + (bh - h) / 2;
  ctx.drawImage(img, x, y, w, h);
}

/** 오버레이 서류 한 장을 캔버스에 렌더 */
export async function renderOverlayPage(
  overlay: OverlayDoc,
  values: Record<string, unknown>,
  imgMap: Record<string, string>,
  completedAt: Date,
  targetWidth = 1240
): Promise<HTMLCanvasElement> {
  const scale = targetWidth / overlay.width;
  const W = Math.round(overlay.width * scale);
  const H = Math.round(overlay.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);

  const bg = await loadImage(overlay.image);
  ctx.drawImage(bg, 0, 0, W, H);

  const cqw = W / 100;

  // 서명 이미지 선로드
  const sigImgs: Record<string, HTMLImageElement> = {};
  await Promise.all(
    overlay.fields
      .filter((f) => f.type === "signature")
      .map(async (f) => {
        const path = values[f.key];
        if (typeof path === "string" && imgMap[path]) {
          try {
            sigImgs[f.key] = await loadImage(imgMap[path]);
          } catch {
            /* 서명 없음 무시 */
          }
        }
      })
  );

  for (const field of overlay.fields) {
    const bx = (field.x / 100) * W;
    const by = (field.y / 100) * H;
    const bw = (field.w / 100) * W;
    const bh = (field.h / 100) * H;
    const fontPx = (field.fontPct ?? 1.4) * cqw;
    const raw = values[field.key];

    // 인쇄 글자 가림 박스
    if (field.cover) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(bx, by, bw, bh);
      continue;
    }
    // 고정 표시 텍스트
    if (field.staticText) {
      drawText(ctx, field.staticText, bx, by, bw, bh, fontPx, field.align);
      continue;
    }

    if (field.type === "signature") {
      const img = sigImgs[field.key];
      if (img) drawSignature(ctx, img, bx, by, bw, bh);
      continue;
    }

    if (field.type === "checkbox") {
      if (field.parenMark) {
        drawText(ctx, raw === true ? "( O )" : "(   )", bx, by, bw, bh, fontPx, "center");
      } else if (raw === true || field.fixedChecked) {
        drawCheck(ctx, bx, by, bw, bh);
      }
      continue;
    }

    // 구간별 네모칸
    if (field.boxPattern && field.boxPattern.length) {
      const str = typeof raw === "string" ? raw : "";
      if (!str.trim()) continue;
      const weights: number[] = [];
      field.boxPattern.forEach((seg, si) => {
        for (let j = 0; j < seg; j++) weights.push(21);
        if (si < field.boxPattern!.length - 1) weights.push(12);
      });
      const total = weights.reduce((a, b) => a + b, 0);
      const lefts: number[] = [];
      const widths: number[] = [];
      const chars: string[] = [];
      let cursor = bx;
      let di = 0;
      field.boxPattern.forEach((seg, si) => {
        for (let j = 0; j < seg; j++) {
          const cw = (21 / total) * bw;
          lefts.push(cursor);
          widths.push(cw);
          chars.push(str[di++] ?? "");
          cursor += cw;
        }
        if (si < field.boxPattern!.length - 1) cursor += (12 / total) * bw;
      });
      drawCells(ctx, chars, lefts, widths, by, bh, fontPx);
      continue;
    }

    // 자릿수 균등 네모칸
    if (field.boxes && field.boxes >= 1) {
      const str = typeof raw === "string" ? raw : "";
      if (!str.trim()) continue;
      const n = field.boxes;
      const cw = bw / n;
      const lefts = Array.from({ length: n }, (_, i) => bx + i * cw);
      const widths = Array.from({ length: n }, () => cw);
      const chars = Array.from({ length: n }, (_, i) => str[i] ?? "");
      drawCells(ctx, chars, lefts, widths, by, bh, fontPx);
      continue;
    }

    // 전화번호(접두어+하이픈)
    if (field.dashPattern && field.dashPattern.length) {
      const str = typeof raw === "string" ? raw : "";
      if (!str.trim()) continue;
      const docPrefix = field.prefix && !field.hidePrefixOnDoc ? field.prefix : "";
      const display = docPrefix + formatBoxPattern(str, field.dashPattern);
      drawText(ctx, display, bx, by, bw, bh, fontPx, field.align);
      continue;
    }

    // 일반 텍스트 / 날짜
    const val = field.dateGroup
      ? effectiveDateValue(field, raw, completedAt)
      : typeof raw === "string" && raw.trim()
        ? raw
        : null;
    if (val) drawText(ctx, val, bx, by, bw, bh, fontPx, field.align);
  }

  return canvas;
}

/** 신분증 등 이미지 한 장을 A4 세로 흰 페이지 가운데에 담아 렌더 */
export async function renderImagePage(
  imgDataUrl: string,
  targetWidth = 1240
): Promise<HTMLCanvasElement> {
  const W = targetWidth;
  const H = Math.round(targetWidth * (297 / 210)); // A4 비율
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);

  const img = await loadImage(imgDataUrl);
  const margin = Math.round(W * 0.06);
  const availW = W - margin * 2;
  const availH = H - margin * 2;
  const ir = img.width / img.height;
  let w = availW;
  let h = availW / ir;
  if (h > availH) {
    h = availH;
    w = availH * ir;
  }
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  return canvas;
}
