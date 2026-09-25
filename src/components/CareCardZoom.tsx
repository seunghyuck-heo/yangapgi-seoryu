"use client";

import { useEffect, useRef, useState } from "react";

interface CareCardZoomProps {
  children: React.ReactNode;
  minScale?: number;
  maxScale?: number;
}

// 환자관리카드 줌 래퍼.
// - 세로 스크롤은 브라우저 기본 스크롤을 그대로 사용(모든 기기에서 확실히 동작) → 잘림/스크롤불가 없음
// - 두 손가락 핀치로만 확대/축소(zoom). 한 손가락은 건드리지 않아 탭·스크롤이 자연스럽게 동작
// - 더블탭으로 원래 크기 복귀
export default function CareCardZoom({ children, minScale = 1, maxScale = 3 }: CareCardZoomProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const pinch = useRef<{ dist: number; startZoom: number } | null>(null);
  const zoomRef = useRef(1);
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

  // 핀치(2손가락)만 non-passive로 가로채 확대/축소. 1손가락 스크롤은 기본 동작 유지.
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
        e.preventDefault(); // 브라우저 2손가락 팬 방지
        const d = dist(e.touches[0], e.touches[1]);
        setZoom(clampZoom(pinch.current.startZoom * (d / pinch.current.dist)));
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch.current = null;
      // 더블탭 → 원래 크기
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

  return (
    <div ref={wrapRef} className="carecard-zoom">
      <div className="carecard-zoom__content" style={{ zoom }}>
        {children}
      </div>
    </div>
  );
}
