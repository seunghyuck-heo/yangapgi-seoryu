// 양압기 서류계약 PWA 서비스워커 — 설치형 + 오프라인 열람
const VERSION = "v1";
const STATIC_CACHE = `static-${VERSION}`;
const PAGE_CACHE = `pages-${VERSION}`;
const ASSET_CACHE = `assets-${VERSION}`;

// 설치 시 최소 셸 캐시
const PRECACHE = ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => ![STATIC_CACHE, PAGE_CACHE, ASSET_CACHE].includes(k))
            .map((k) => caches.delete(k))
        )
      )
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

  // API / 인증 / Supabase(데이터·인증·스토리지)는 항상 네트워크 (캐시 금지)
  if (url.pathname.startsWith("/api/") || isSupabase(url)) {
    return; // 기본 네트워크 처리
  }

  // 서식 이미지·아이콘 → cache-first(+백그라운드 갱신)
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/documents/") ||
      url.pathname.startsWith("/icons/") ||
      url.pathname.startsWith("/_next/static/"))
  ) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // 페이지(내비게이션) → network-first, 실패 시 캐시(오프라인 열람)
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(PAGE_CACHE);
          cache.put(req, res.clone());
          return res;
        } catch {
          const cache = await caches.open(PAGE_CACHE);
          const cached = await cache.match(req);
          return cached || (await cache.match("/submit")) || Response.error();
        }
      })()
    );
  }
});
