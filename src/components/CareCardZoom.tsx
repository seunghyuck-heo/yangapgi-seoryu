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
  const sizerRef = useRef<HTMLDivElement | null>(null); // 확대 공간 확보용
  const contentRef = useRef<HTMLDivElement | null>(null); // transform 대상(카드)
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);
  const [base, setBase] = useState({ w: 0, h: 0 }); // 1배 기준 크기
  const baseRef = useRef({ w: 0, h: 0 });
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
      if (card) {
        const next = { w: card.offsetWidth, h: card.offsetHeight };
        baseRef.current = next;
        setBase(next);
      }
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
        const b = baseRef.current;
        const cw = el.clientWidth;
        // 카드가 컨테이너보다 좁으면 margin:auto 로 가운데 정렬됨 → 그 오프셋을 반영해야 초점이 정확
        const offOld = Math.max(0, (cw - b.w * oldScale) / 2);
        // 초점(두 손가락 중심) 아래의 콘텐츠 좌표(1배 기준)
        const focalX = (el.scrollLeft + midClientX - offOld) / oldScale;
        const focalY = (el.scrollTop + midClientY) / oldScale;
        const d = dist(e.touches[0], e.touches[1]);
        const ns = Math.min(maxScale, Math.max(minScale, pinchStart.current.startScale * (d / pinchStart.current.dist)));
        scaleRef.current = ns;
        // 동기적으로 sizer 크기·transform을 먼저 갱신한 뒤 스크롤을 보정해야
        // 초점(가운데)이 손가락 아래에 유지됨. (rAF 비동기 시 sizer가 아직 안 커져 좌상단으로 쏠림)
        if (sizerRef.current && b.w) {
          sizerRef.current.style.width = `${b.w * ns}px`;
          sizerRef.current.style.height = `${b.h * ns}px`;
        }
        if (contentRef.current) contentRef.current.style.transform = `scale(${ns})`;
        const offNew = Math.max(0, (cw - b.w * ns) / 2);
        el.scrollLeft = focalX * ns - midClientX + offNew;
        el.scrollTop = focalY * ns - midClientY;
        setScale(ns);
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
        ref={sizerRef}
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
