// 양압기 서류계약 PWA 서비스워커 — 온라인이면 항상 최신(네트워크 우선), 오프라인일 때만 캐시 열람
const VERSION = "v14";
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

  // 그 외 모든 GET: 네트워크 우선 → 성공 시 캐시에 최신본 저장, 실패(오프라인) 시에만 캐시 사용
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
