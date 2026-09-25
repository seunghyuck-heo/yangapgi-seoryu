"use client";

import { useCallback, useRef, useState } from "react";

interface SignaturePadProps {
  label: string;
  /** signed URL of a previously saved signature, if any */
  existingUrl?: string;
  /** called with a PNG data URL when the user finishes drawing and confirms */
  onSave: (dataUrl: string) => Promise<void> | void;
  disabled?: boolean;
  /** 확정 버튼 문구 (기본 "서명 확정") */
  confirmLabel?: string;
}

export default function SignaturePad({
  label,
  existingUrl,
  onSave,
  disabled,
  confirmLabel = "서명 확정",
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasStrokeRef = useRef(false);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedUrl, setSavedUrl] = useState<string | undefined>(existingUrl);

  // 캔버스가 DOM에 붙을 때마다(최초 + '다시 서명하기'로 재표시될 때) 초기화
  const initCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
    if (!canvas) return;
    // willReadFrequently: getImageData(트리밍)를 CPU 캔버스로 빠르게
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    // 내부 해상도 상한(2배)로 getImageData/인코딩 비용 절감
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a1a1a";
  }, []);

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault(); // 펜 기본동작(호버/스크롤/선택) 방지
    try {
      canvas.setPointerCapture(e.pointerId); // 실패해도 그리기는 계속
    } catch {
      /* noop */
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawingRef.current = true;
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // 펜은 한 번에 여러 좌표(coalesced)가 오므로 모두 반영 → 끊김 없는 선
    const events =
      typeof e.nativeEvent.getCoalescedEvents === "function"
        ? e.nativeEvent.getCoalescedEvents()
        : [];
    if (events.length > 0) {
      const rect = canvas.getBoundingClientRect();
      for (const ev of events) {
        ctx.lineTo(ev.clientX - rect.left, ev.clientY - rect.top);
      }
    } else {
      const { x, y } = getPos(e);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    hasStrokeRef.current = true;
    setHasDrawing(true);
  }

  function handlePointerUp() {
    drawingRef.current = false;
  }

  function handleClear() {
    // '다시 서명하기' 상태에선 캔버스가 아직 DOM에 없을 수 있으므로
    // 상태 초기화를 먼저 하고(→ 빈 캔버스로 전환), 캔버스가 있으면 지운다.
    hasStrokeRef.current = false;
    setHasDrawing(false);
    setSavedUrl(undefined);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function trimmedDataUrl(canvas: HTMLCanvasElement): string {
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas.toDataURL("image/png");
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    let minX = width,
      minY = height,
      maxX = 0,
      maxY = 0,
      found = false;
    // 2px 간격으로 스캔(약 4배 빠름). 오차는 아래 padding 으로 보정.
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        if (data[(y * width + x) * 4 + 3] > 10) {
          found = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!found) return canvas.toDataURL("image/png");
    const pad = Math.round(Math.min(width, height) * 0.05);
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad);
    maxY = Math.min(height - 1, maxY + pad);
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const c2 = document.createElement("canvas");
    c2.width = w;
    c2.height = h;
    c2.getContext("2d")?.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
    return c2.toDataURL("image/png");
  }

  async function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas || !hasStrokeRef.current) return;
    setSaving(true);
    try {
      const dataUrl = trimmedDataUrl(canvas);
      await onSave(dataUrl);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="signature-pad">
      <div className="signature-pad__label">{label}</div>
      {savedUrl && !hasDrawing ? (
        <div className="signature-pad__preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={savedUrl} alt={`${label} 서명 미리보기`} />
        </div>
      ) : (
        <div className="signature-pad__canvas-wrap">
          <canvas
            ref={initCanvas}
            className="signature-pad__canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
          {!hasDrawing && <div className="signature-pad__hint">여기에 손가락(펜)으로 서명해 주세요</div>}
        </div>
      )}
      <div className="signature-pad__actions">
        <button type="button" onClick={handleClear} disabled={disabled}>
          {savedUrl && !hasDrawing ? "다시 서명하기" : "지우기"}
        </button>
        {(!savedUrl || hasDrawing) && (
          <button type="button" onClick={handleSave} disabled={disabled || saving || !hasDrawing}>
            {saving ? "저장 중..." : confirmLabel}
          </button>
        )}
      </div>
    </div>
  );
}
