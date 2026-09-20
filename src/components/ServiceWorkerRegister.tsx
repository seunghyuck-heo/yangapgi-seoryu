"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let reloaded = false;
    // 새 서비스워커가 제어권을 넘겨받으면 1회 자동 새로고침 → 항상 최신 화면
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((reg) => {
          reg.update();
          reg.addEventListener("updatefound", () => {
            const nw = reg.installing;
            nw?.addEventListener("statechange", () => {
              // 새 버전 설치 완료 + 기존 SW가 제어 중이면 즉시 활성화
              if (nw.state === "installed" && navigator.serviceWorker.controller) {
                nw.postMessage?.({ type: "SKIP_WAITING" });
              }
            });
          });
        })
        .catch(() => {
          /* 등록 실패는 조용히 무시 */
        });
    };

    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
