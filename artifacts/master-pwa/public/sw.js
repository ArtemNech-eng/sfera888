const SHELL_CACHE = "master-pwa-shell-v2";
const ASSET_CACHE = "master-pwa-assets-v2";
const SHELL_URL = "/master-pwa/index.html";

// Pre-cache the app shell on install
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then(c => c.addAll([SHELL_URL, "/master-pwa/"]))
      .then(() => self.skipWaiting())
  );
});

// Clean up old caches and claim clients
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== SHELL_CACHE && k !== ASSET_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  // Never intercept non-GET or API calls
  if (e.request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return;

  // Navigation requests → serve shell from cache, update in background
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(SHELL_CACHE).then(c => c.put(SHELL_URL, clone));
          }
          return res;
        })
        .catch(() => caches.match(SHELL_URL))
    );
    return;
  }

  // Static assets (JS, CSS, images, fonts) → cache first, then network
  const isAsset = /\.(js|css|png|jpg|jpeg|svg|gif|woff2?|ttf|ico|webp)(\?|$)/.test(url.pathname);
  if (isAsset && url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(ASSET_CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // Everything else → network only
  e.respondWith(fetch(e.request));
});
