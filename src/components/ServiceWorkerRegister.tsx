"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // 새 SW가 제어권을 가지면(배포 반영) 자동 새로고침해 폰에 옛 화면이 남지 않게 한다.
    // 단, 서류 작성/편집 화면에서는 작업이 끊기므로 새로고침하지 않는다(과거 이슈 방지).
    let reloaded = false;
    const hadController = !!navigator.serviceWorker.controller; // 최초 설치면 false → 리로드 안 함
    const isEditingRoute = () => {
      const p = location.pathname;
      return /\/doc\//.test(p) || /\/care-card/.test(p) || p.startsWith("/preview");
    };
    const onControllerChange = () => {
      if (reloaded || !hadController) return; // 업데이트일 때만(최초 설치 제외)
      if (isEditingRoute()) return; // 편집 중엔 끊지 않음(다음 탐색 때 자연 반영)
      reloaded = true;
      location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((reg) => {
          reg.update();
        })
        .catch(() => {
          /* 등록 실패는 조용히 무시 */
        });
    };

    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad);
    return () => {
      window.removeEventListener("load", onLoad);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
