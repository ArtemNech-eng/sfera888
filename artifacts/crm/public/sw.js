// CRM Operator Service Worker
// Handles push notifications for snooze wakeups and other operator alerts

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Уведомление", body: event.data ? event.data.text() : "" };
  }

  const title = data.title ?? "Сфера Мастер";
  const options = {
    body: data.body ?? "",
    icon: "/opengraph.jpg",
    badge: "/opengraph.jpg",
    tag: data.itemId ? `task-${data.itemId}` : "crm-notification",
    renotify: true,
    data: {
      url: data.url ?? "/dashboard",
      itemId: data.itemId ?? null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/dashboard";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.focus();
          client.postMessage({ type: "navigate", url });
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
