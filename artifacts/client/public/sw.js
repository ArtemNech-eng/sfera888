const CACHE = "sfera-master-v1";
const PRECACHE = ["/client/", "/client/index.html"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => {
        return self.clients.matchAll({ type: "window" }).then((clients) => {
          clients.forEach((client) => client.postMessage({ type: "SW_UPDATED" }));
        });
      })
  );
});

self.addEventListener("push", (e) => {
  const payload = e.data ? e.data.json() : {};
  const title = payload.title || "Честный мастер";
  const body = payload.body || "Новое уведомление";
  const icon = payload.icon || "/client/icon-192.png";
  const tag = payload.tag || String(Date.now());
  const url = payload.url || "/client/";

  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      tag,
      data: { url },
      requireInteraction: false,
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url || "/client/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const client = clients.find((c) => c.url && c.url.includes("/client/"));
      if (client) {
        client.focus();
        return client.navigate(url);
      }
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);

  if (url.pathname.startsWith("/api/")) return;

  const isNavigation = e.request.mode === "navigate" || url.pathname.endsWith(".html");

  if (isNavigation) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  const isHashedAsset = /\/assets\/[^/]+\.[a-f0-9]{8,}\.(js|css)(\?|$)/.test(url.pathname);
  if (isHashedAsset) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
          return res;
        });
      })
    );
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
