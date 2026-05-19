const SHELL_CACHE = "partner-pwa-shell-v1";
const ASSET_CACHE = "partner-pwa-assets-v1";
const SHELL_URL = "/partner-pwa/index.html";

// Pre-cache the app shell on install
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then(c => c.addAll([SHELL_URL, "/partner-pwa/"]))
      .then(() => self.skipWaiting())
  );
});

// Clean up old caches, claim clients, then notify pages to reload
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(k => k !== SHELL_CACHE && k !== ASSET_CACHE)
            .map(k => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
      .then(() =>
        self.clients.matchAll({ type: "window" }).then(clients =>
          clients.forEach(c => c.postMessage({ type: "SW_UPDATED" }))
        )
      )
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

// ─── Push notifications ───────────────────────────────────────────────────────

self.addEventListener("push", e => {
  if (!e.data) return;

  let data = {};
  try { data = e.data.json(); } catch { return; }

  const title = data.title ?? "Сфера Партнёр";
  const body = data.body ?? "";
  const tag = data.type ?? "default";
  const icon = "/partner-pwa/icon-192.png";
  const badge = "/partner-pwa/icon-192.png";

  const options = {
    body,
    icon,
    badge,
    tag,
    renotify: true,
    requireInteraction: false,
    data: { type: data.type },
  };

  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = "/partner-pwa/";
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes("/partner-pwa/"));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});
