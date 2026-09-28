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

// 탭으로 인정하는 최대 이동 거리. 정전식 펜은 접촉이 불안정해 손가락보다 흔들림이 커서,
// 값이 작으면 탭이 자주 '드래그'로 오인되어 필드가 안 열림(키보드 안 뜸). 넉넉히 잡음.
const TAP_MOVE_THRESHOLD = 20; // px

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

  // 마우스 휠로 확대/축소(커서 위치 기준). passive:false 로 스크롤 기본동작 차단.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const fx = e.clientX - rect.left;
      const fy = e.clientY - rect.top;
      const { scale: s, tx: cx, ty: cy } = stateRef.current;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const nextScale = Math.min(maxScale, Math.max(minScale, s * factor));
      const contentX = (fx - cx) / s;
      const contentY = (fy - cy) / s;
      let ntx = fx - contentX * nextScale;
      let nty = fy - contentY * nextScale;
      if (nextScale <= minScale + 0.001) {
        ntx = 0;
        nty = 0;
      }
      setScale(nextScale);
      setTx(ntx);
      setTy(nty);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [minScale, maxScale]);

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
    // 포인터 캡처: 드래그(팬)·핀치 중 pointermove가 계속 이 요소로 오게 한다.
    // (클릭 판정은 elementFromPoint로 좌표 기반 처리하므로 캡처가 있어도 필드 클릭이 정상 동작)
    try {
      viewportRef.current?.setPointerCapture?.(e.pointerId);
    } catch {
      /* 무시 */
    }
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

  // 탭한 위치의 실제 최상단 요소(elementFromPoint)로 필드를 찾는다.
  // 마우스 click은 포인터 캡처로 e.target이 뷰포트로 리타겟될 수 있어, e.target 대신 좌표로 판정한다.
  function handleClick(e: React.MouseEvent) {
    if (moved.current) {
      moved.current = false;
      return;
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const key = el?.closest?.("[data-field]")?.getAttribute?.("data-field");
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
        <div
          className="zoomdoc__controls no-print"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
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
