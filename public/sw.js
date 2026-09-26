// 양압기 서류계약 PWA 서비스워커
// - 해시된 정적 자산(_next/static)은 캐시 우선(즉시 응답) → 앱 진입 속도 개선(파일명이 바뀌므로 stale 위험 없음)
// - HTML/문서 이미지 등은 네트워크 우선(최신 유지), 오프라인이면 캐시
const VERSION = "v144";
const RUNTIME_CACHE = `runtime-${VERSION}`;

// 설치 시 최소 셸만 캐시(오프라인 대비)
const PRECACHE = ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(RUNTIME_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== RUNTIME_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isSupabase(url) {
  return url.hostname.endsWith(".supabase.co");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // 쓰기 요청은 네트워크로

  const url = new URL(req.url);

  // API / Supabase(데이터·인증·스토리지)는 항상 네트워크 (캐시 금지)
  if (url.pathname.startsWith("/api/") || isSupabase(url)) return;

  // 해시된 정적 자산(_next/static): 캐시 우선 → 있으면 즉시 응답(네트워크 대기 X), 없으면 받아서 캐시.
  // 내용이 바뀌면 파일명(해시)도 바뀌어 새 HTML이 새 파일을 참조하므로 오래된 파일이 나올 위험이 없음.
  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res && res.ok) {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(req, res.clone());
        }
        return res;
      })()
    );
    return;
  }

  // 그 외 모든 GET(HTML/문서 이미지 등): 네트워크 우선 → 성공 시 캐시에 최신본 저장, 실패(오프라인) 시에만 캐시 사용
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok && url.origin === self.location.origin) {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === "navigate") {
          return (await caches.match("/submit")) || Response.error();
        }
        return Response.error();
      }
    })()
  );
});
