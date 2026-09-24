"use client";

import { useEffect, useRef, useState } from "react";

interface CareCardZoomProps {
  children: React.ReactNode;
  minScale?: number;
  maxScale?: number;
}

interface P {
  x: number;
  y: number;
}

const TAP_MOVE = 8; // px, 이 이하로 움직이면 탭으로 간주(셀 클릭 통과)

// 양압기 환자관리카드 전용 핀치줌/팬 래퍼.
// - 1손가락: 움직이면 팬, 가만히 있으면 셀 탭(달력/O표시/드롭다운) 그대로 동작
// - 2손가락: 핀치 줌인/아웃
// - 더블탭: 원래 크기로
export default function CareCardZoom({ children, minScale = 1, maxScale = 3 }: CareCardZoomProps) {
  const vpRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [t, setT] = useState({ scale: 1, tx: 0, ty: 0 });
  const stateRef = useRef(t);
  useEffect(() => {
    stateRef.current = t;
  }, [t]);

  const pointers = useRef<Map<number, P>>(new Map());
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const pinch = useRef<{ dist: number; mx: number; my: number; scale: number; tx: number; ty: number } | null>(null);
  const moved = useRef(false);
  const justMoved = useRef(false);
  const lastTap = useRef(0);

  function clampScale(s: number) {
    return Math.min(maxScale, Math.max(minScale, s));
  }

  function clamp(scale: number, tx: number, ty: number) {
    const vp = vpRef.current;
    const content = contentRef.current;
    if (!vp || !content) return { scale, tx, ty };
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    const cw = content.offsetWidth * scale;
    const ch = content.offsetHeight * scale;
    let nx: number;
    let ny: number;
    if (cw <= vw) nx = (vw - cw) / 2;
    else nx = Math.min(0, Math.max(vw - cw, tx));
    if (ch <= vh) ny = (vh - ch) / 2;
    else ny = Math.min(0, Math.max(vh - ch, ty));
    return { scale, tx: nx, ty: ny };
  }

  function localPoint(clientX: number, clientY: number) {
    const rect = vpRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function onPointerDown(e: React.PointerEvent) {
    const p = localPoint(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, p);
    moved.current = false;
    if (pointers.current.size === 1) {
      const { scale, tx, ty } = stateRef.current;
      pan.current = { x: p.x, y: p.y, tx, ty };
      pinch.current = null;
    } else if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mx = (pts[0].x + pts[1].x) / 2;
      const my = (pts[0].y + pts[1].y) / 2;
      const { scale, tx, ty } = stateRef.current;
      pinch.current = { dist: dist || 1, mx, my, scale, tx, ty };
      pan.current = null;
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    const p = localPoint(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, p);

    if (pointers.current.size >= 2 && pinch.current) {
      e.preventDefault();
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const start = pinch.current;
      const nextScale = clampScale(start.scale * (dist / start.dist));
      // 핀치 중심(midpoint)이 고정되도록 tx,ty 보정
      const contentX = (start.mx - start.tx) / start.scale;
      const contentY = (start.my - start.ty) / start.scale;
      const tx = start.mx - contentX * nextScale;
      const ty = start.my - contentY * nextScale;
      moved.current = true;
      justMoved.current = true;
      setT(clamp(nextScale, tx, ty));
      return;
    }

    if (pointers.current.size === 1 && pan.current) {
      const dx = p.x - pan.current.x;
      const dy = p.y - pan.current.y;
      if (!moved.current && Math.hypot(dx, dy) > TAP_MOVE) {
        moved.current = true;
        try {
          (e.target as Element).setPointerCapture?.(e.pointerId);
        } catch {
          /* noop */
        }
      }
      if (moved.current) {
        e.preventDefault();
        justMoved.current = true;
        const { scale } = stateRef.current;
        setT(clamp(scale, pan.current.tx + dx, pan.current.ty + dy));
      }
    }
  }

  function endPointer(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      pan.current = null;
      // 더블탭 → 리셋
      if (!moved.current) {
        const now = Date.now();
        if (now - lastTap.current < 300) {
          setT({ scale: 1, tx: 0, ty: 0 });
          justMoved.current = true; // 리셋 탭이 셀 클릭으로 새지 않도록
        }
        lastTap.current = now;
      }
      // 팬/핀치 직후엔 클릭 억제 플래그를 잠깐 유지했다가 클릭에서 소비
      if (moved.current) justMoved.current = true;
    }
  }

  function onClickCapture(e: React.MouseEvent) {
    if (justMoved.current) {
      e.preventDefault();
      e.stopPropagation();
      justMoved.current = false;
    }
  }

  const transform = `translate3d(${t.tx}px, ${t.ty}px, 0) scale(${t.scale})`;

  return (
    <div
      ref={vpRef}
      className="carecard-zoom"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onClickCapture={onClickCapture}
    >
      <div ref={contentRef} className="carecard-zoom__content" style={{ transform }}>
        {children}
      </div>
    </div>
  );
}
