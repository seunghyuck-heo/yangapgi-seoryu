"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ZoomableDocumentProps {
  aspectRatio: number; // width / height
  children: React.ReactNode; // stage contents, positioned by % within the image box
  onTapField: (key: string) => void;
  minScale?: number;
  maxScale?: number;
}

interface PointerInfo {
  x: number;
  y: number;
}

const TAP_MOVE_THRESHOLD = 8; // px

export default function ZoomableDocument({
  aspectRatio,
  children,
  onTapField,
  minScale = 1,
  maxScale = 6,
}: ZoomableDocumentProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);

  const pointers = useRef<Map<number, PointerInfo>>(new Map());
  const lastPan = useRef<PointerInfo | null>(null);
  const pinch = useRef<{ dist: number; midX: number; midY: number; scale: number } | null>(null);
  const startPoint = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);

  const stateRef = useRef({ scale: 1, tx: 0, ty: 0 });
  useEffect(() => {
    stateRef.current = { scale, tx, ty };
  }, [scale, tx, ty]);

  const clampScale = useCallback(
    (s: number) => Math.min(maxScale, Math.max(minScale, s)),
    [minScale, maxScale]
  );

  function viewportPoint(clientX: number, clientY: number) {
    const rect = viewportRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function applyZoom(nextScaleRaw: number, focusX: number, focusY: number) {
    const { scale: s, tx: cx, ty: cy } = stateRef.current;
    const nextScale = clampScale(nextScaleRaw);
    const contentX = (focusX - cx) / s;
    const contentY = (focusY - cy) / s;
    let ntx = focusX - contentX * nextScale;
    let nty = focusY - contentY * nextScale;
    if (nextScale <= minScale + 0.001) {
      ntx = 0;
      nty = 0;
    }
    setScale(nextScale);
    setTx(ntx);
    setTy(nty);
  }

  function handlePointerDown(e: React.PointerEvent) {
    viewportRef.current?.setPointerCapture?.(e.pointerId);
    const p = viewportPoint(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, p);

    if (pointers.current.size === 1) {
      lastPan.current = p;
      startPoint.current = p;
      moved.current = false;
    } else if (pointers.current.size === 2) {
      const pts = Array.from(pointers.current.values());
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      pinch.current = {
        dist: Math.hypot(dx, dy) || 1,
        midX: (pts[0].x + pts[1].x) / 2,
        midY: (pts[0].y + pts[1].y) / 2,
        scale: stateRef.current.scale,
      };
      moved.current = true;
      lastPan.current = null;
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    const p = viewportPoint(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, p);

    if (pointers.current.size >= 2 && pinch.current) {
      const pts = Array.from(pointers.current.values());
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      const dist = Math.hypot(dx, dy);
      applyZoom(pinch.current.scale * (dist / pinch.current.dist), pinch.current.midX, pinch.current.midY);
      return;
    }

    if (pointers.current.size === 1 && lastPan.current) {
      if (startPoint.current) {
        const totalDx = p.x - startPoint.current.x;
        const totalDy = p.y - startPoint.current.y;
        if (Math.hypot(totalDx, totalDy) > TAP_MOVE_THRESHOLD) moved.current = true;
      }
      if (stateRef.current.scale > minScale + 0.001) {
        const dx = p.x - lastPan.current.x;
        const dy = p.y - lastPan.current.y;
        setTx((v) => v + dx);
        setTy((v) => v + dy);
      }
      lastPan.current = p;
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) lastPan.current = null;
  }

  function handleClick(e: React.MouseEvent) {
    if (moved.current) {
      moved.current = false;
      return;
    }
    const fieldEl = (e.target as Element).closest("[data-field]");
    const key = fieldEl?.getAttribute("data-field");
    if (key) onTapField(key);
  }

  function zoomButton(delta: number) {
    const rect = viewportRef.current?.getBoundingClientRect();
    const fx = rect ? rect.width / 2 : 0;
    const fy = rect ? rect.height / 2 : 0;
    applyZoom(stateRef.current.scale + delta, fx, fy);
  }

  return (
    <div className="zoomdoc">
      <div
        ref={viewportRef}
        className="zoomdoc__viewport"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleClick}
      >
        <div
          className="zoomdoc__stage"
          style={{
            aspectRatio: `${aspectRatio}`,
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          }}
        >
          {children}
        </div>
        <div className="zoomdoc__controls no-print">
          <button type="button" onClick={() => zoomButton(-0.5)} aria-label="축소">
            −
          </button>
          <span className="zoomdoc__level">{Math.round(scale * 100)}%</span>
          <button type="button" onClick={() => zoomButton(0.5)} aria-label="확대">
            +
          </button>
        </div>
      </div>
    </div>
  );
}
