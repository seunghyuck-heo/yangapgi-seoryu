"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // 주의: 예전엔 새 SW 활성화 시 자동 새로고침(reload)했는데, 사용자가 서류 수정 중일 때
    // 화면이 몇 초 뒤 리로드되며 작업이 끊겼다. 자동 리로드/즉시활성화를 제거한다.
    // (네트워크 우선 SW라 다음 진입/새 탐색 때 자연히 최신 내용이 반영됨)
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
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
