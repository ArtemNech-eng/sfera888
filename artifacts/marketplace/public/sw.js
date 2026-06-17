// Cabinet Service Worker (chestnye-mastera.ru).
//
// Single responsibility: receive Web Push messages from api-server (via VAPID),
// show a system notification, route the click back into /cabinet/*. We deliberately
// don't cache anything — Next.js + the Vercel/Railway CDN already do that, and an
// extra cache layer here would only invalidate the freshness of marketplace pages
// after the next deploy.
//
// Wire format mirrors master-pwa's sw.js (api-server reuses one webpush helper):
//   { type, title, body, orderId? }
//
// Activation: take over open tabs immediately so the very first push after a
// fresh install reaches the user without a reload.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
  } catch {
    // Some webpush libs send plain text — don't crash, just bail.
    return;
  }

  const title = data.title || "Честные мастера";
  const body = data.body || "";
  const tag = data.type || "default";
  // Same icons as our PWA install banner so notifications are visually consistent.
  const icon = "/icon-192.png";
  const badge = "/icon-192.png";

  const options = {
    body,
    icon,
    badge,
    tag,
    renotify: true,
    requireInteraction: data.type === "new_order",
    data: {
      type: data.type ?? null,
      orderId: data.orderId ?? null,
      url: data.url ?? null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let target = data.url || null;
  if (!target) {
    if (data.type === "new_order" || data.type === "order_assigned") {
      target = data.orderId ? `/cabinet/orders/${data.orderId}` : "/cabinet/orders";
    } else if (data.type === "chat") {
      target = "/cabinet/chat";
    } else if (data.type === "balance") {
      target = "/cabinet/balance";
    } else {
      target = "/cabinet/dashboard";
    }
  }

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        // Reuse an existing cabinet tab if there is one — feels native.
        const existing = list.find((c) => c.url.includes("/cabinet"));
        if (existing) {
          existing.navigate(target).catch(() => {});
          return existing.focus();
        }
        return clients.openWindow(target);
      }),
  );
});
