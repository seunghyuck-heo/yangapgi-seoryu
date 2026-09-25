"use client";

import { useEffect, useRef, useState } from "react";

interface ZoomableDocumentProps {
  aspectRatio: number; // width / height
  children: React.ReactNode; // stage contents, positioned by % within the image box
  onTapField: (key: string) => void;
  minScale?: number;
  maxScale?: number;
}

// 문서 뷰어. 세로는 페이지 기본 스크롤(모든 기기에서 확실히 동작), 두 손가락 핀치로 문서 자체를 확대/축소.
// 기본 상태에선 A4 전체가 한 화면에 들어오도록 화면 높이에 맞춰 폭을 제한한다.
export default function ZoomableDocument({
  aspectRatio,
  children,
  onTapField,
  minScale = 1,
  maxScale = 4,
}: ZoomableDocumentProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const pinch = useRef<{ dist: number; startZoom: number } | null>(null);
  const lastTap = useRef(0);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  function clampZoom(z: number) {
    return Math.min(maxScale, Math.max(minScale, z));
  }
  function dist(a: Touch, b: Touch) {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  // 두 손가락 핀치만 non-passive로 가로채 확대/축소. 한 손가락 스크롤·탭은 기본 동작 유지.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinch.current = { dist: dist(e.touches[0], e.touches[1]) || 1, startZoom: zoomRef.current };
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinch.current) {
        e.preventDefault();
        const d = dist(e.touches[0], e.touches[1]);
        setZoom(clampZoom(pinch.current.startZoom * (d / pinch.current.dist)));
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch.current = null;
      if (e.touches.length === 0 && e.changedTouches.length === 1) {
        const now = Date.now();
        if (now - lastTap.current < 300) setZoom(1);
        lastTap.current = now;
      }
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minScale, maxScale]);

  function handleClick(e: React.MouseEvent) {
    const fieldEl = (e.target as Element).closest("[data-field]");
    const key = fieldEl?.getAttribute("data-field");
    if (key) onTapField(key);
  }

  return (
    <div className="zoomdoc">
      <div ref={wrapRef} className="zoomdoc__viewport" onClick={handleClick}>
        <div className="zoomdoc__stage" style={{ aspectRatio: `${aspectRatio}`, zoom }}>
          {children}
        </div>
      </div>
      <div className="zoomdoc__controls no-print">
        <button type="button" onClick={() => setZoom((z) => clampZoom(z - 0.5))} aria-label="축소">
          −
        </button>
        <span className="zoomdoc__level">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom((z) => clampZoom(z + 0.5))} aria-label="확대">
          +
        </button>
      </div>
    </div>
  );
}
