"use client";

import { useEffect, useRef, useState } from "react";

interface CareCardZoomProps {
  children: React.ReactNode;
  minScale?: number;
  maxScale?: number;
}

// 환자관리카드 줌 래퍼.
// - 확대/축소는 CSS transform: scale 로 처리 → 레이아웃(cqw) 재계산이 없어 행간이 흐트러지지 않고 정비율로 커짐
// - 확대한 만큼 스크롤 공간(sizer)을 확보해 브라우저 기본 스크롤로 이동(팬) → 모든 기기에서 안정적
// - 두 손가락 핀치는 손가락 중심(초점) 기준으로 커지고 작아짐, 더블탭으로 원래 크기
export default function CareCardZoom({ children, minScale = 1, maxScale = 3 }: CareCardZoomProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null); // 스크롤 컨테이너
  const contentRef = useRef<HTMLDivElement | null>(null); // transform 대상(카드)
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);
  const [base, setBase] = useState({ w: 0, h: 0 }); // 1배 기준 크기
  const pinchStart = useRef<{ dist: number; startScale: number } | null>(null);
  const lastTap = useRef(0);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  // 1배 기준 크기 측정: 카드(.carecard-page)의 레이아웃 크기(폭은 max-width로 고정되어 순환참조 없음).
  useEffect(() => {
    const host = contentRef.current;
    if (!host) return;
    const measure = () => {
      const card = host.querySelector<HTMLElement>(".carecard-page");
      if (card) setBase({ w: card.offsetWidth, h: card.offsetHeight });
    };
    measure();
    const card = host.querySelector<HTMLElement>(".carecard-page");
    const ro = new ResizeObserver(measure);
    if (card) ro.observe(card);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const dist = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchStart.current = { dist: dist(e.touches[0], e.touches[1]) || 1, startScale: scaleRef.current };
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStart.current) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const midClientX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const midClientY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        const oldScale = scaleRef.current;
        // 초점 아래의 콘텐츠 좌표(1배 기준)
        const focalX = (el.scrollLeft + midClientX) / oldScale;
        const focalY = (el.scrollTop + midClientY) / oldScale;
        const d = dist(e.touches[0], e.touches[1]);
        const ns = Math.min(maxScale, Math.max(minScale, pinchStart.current.startScale * (d / pinchStart.current.dist)));
        scaleRef.current = ns;
        setScale(ns);
        // 초점이 손가락 아래에 계속 오도록 스크롤 보정(리렌더로 sizer 크기 바뀐 뒤)
        requestAnimationFrame(() => {
          el.scrollLeft = focalX * ns - midClientX;
          el.scrollTop = focalY * ns - midClientY;
        });
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchStart.current = null;
      if (e.touches.length === 0 && e.changedTouches.length === 1) {
        const now = Date.now();
        if (now - lastTap.current < 300) {
          scaleRef.current = 1;
          setScale(1);
        }
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
  }, [minScale, maxScale]);

  return (
    <div ref={wrapRef} className="carecard-zoom">
      <div
        className="carecard-zoom__sizer"
        style={base.w ? { width: base.w * scale, height: base.h * scale } : undefined}
      >
        <div
          ref={contentRef}
          className="carecard-zoom__content"
          style={{ transform: `scale(${scale})`, width: base.w ? base.w : undefined }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
