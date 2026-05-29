import { useEffect } from "react";

async function urlBase64ToUint8Array(base64String: string): Promise<Uint8Array> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return new Uint8Array([...rawData].map(c => c.charCodeAt(0))) as Uint8Array;
}

async function subscribe() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  const reg = await navigator.serviceWorker.ready;

  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    await sendToServer(existing);
    return;
  }

  const resp = await fetch("/api/master-pwa/push/vapid-public-key");
  if (!resp.ok) return;
  const { key } = await resp.json();

  const applicationServerKey = await urlBase64ToUint8Array(key);
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey as BufferSource,
  });

  await sendToServer(sub);
}

async function sendToServer(sub: PushSubscription) {
  const json = sub.toJSON();
  await fetch("/api/master-pwa/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  }).catch(() => {});
}

export function usePushNotifications(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    if (!("Notification" in window)) return;
    if (Notification.permission === "denied") return;

    const run = async () => {
      if (Notification.permission === "default") {
        const result = await Notification.requestPermission();
        if (result !== "granted") return;
      }
      await subscribe().catch(() => {});
    };

    run();
  }, [enabled]);
}
