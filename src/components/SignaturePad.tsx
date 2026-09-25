"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  const disabledRef = useRef(!!disabled);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedUrl, setSavedUrl] = useState<string | undefined>(existingUrl);

  useEffect(() => {
    disabledRef.current = !!disabled;
  }, [disabled]);

  // 캔버스가 DOM에 붙을 때 초기화 + 네이티브 입력 리스너 부착(iOS 정전식 펜 인식률↑)
  const initCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    // 이전 캔버스 리스너 정리
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    canvasRef.current = canvas;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a1a1a";

    const xy = (clientX: number, clientY: number): [number, number] => {
      const r = canvas.getBoundingClientRect();
      return [clientX - r.left, clientY - r.top];
    };
    const begin = (clientX: number, clientY: number) => {
      if (disabledRef.current) return;
      const [x, y] = xy(clientX, clientY);
      ctx.beginPath();
      ctx.moveTo(x, y);
      drawingRef.current = true;
    };
    const extend = (clientX: number, clientY: number) => {
      if (!drawingRef.current) return;
      const [x, y] = xy(clientX, clientY);
      ctx.lineTo(x, y);
      ctx.stroke();
      hasStrokeRef.current = true;
      setHasDrawing(true);
    };
    const finish = () => {
      drawingRef.current = false;
    };

    // 터치(손가락·정전식 펜) — non-passive로 preventDefault 하여 스크롤/줌/마우스에뮬레이션 차단
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      begin(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!drawingRef.current) return;
      e.preventDefault();
      const t = e.touches[0];
      if (t) extend(t.clientX, t.clientY);
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      finish();
    };
    // 마우스(데스크톱)
    const onMouseDown = (e: MouseEvent) => begin(e.clientX, e.clientY);
    const onMouseMove = (e: MouseEvent) => extend(e.clientX, e.clientY);
    const onMouseUp = () => finish();

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    canvas.addEventListener("touchcancel", onTouchEnd, { passive: false });
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    cleanupRef.current = () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (cleanupRef.current) cleanupRef.current();
    };
  }, []);

  function handleClear() {
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
          <canvas ref={initCanvas} className="signature-pad__canvas" />
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
