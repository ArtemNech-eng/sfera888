import { useEffect } from "react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function subscribeClientPush(phone: string) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    // Already subscribed — just sync with server
    const subJson = existing.toJSON();
    await fetch("/api/client/push-subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        endpoint: subJson.endpoint,
        p256dh: subJson.keys?.p256dh,
        auth: subJson.keys?.auth,
      }),
    }).catch(() => {});
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return;

  const keyRes = await fetch("/api/master-pwa/push/vapid-public-key").catch(() => null);
  if (!keyRes) return;
  const { key } = await keyRes.json();
  if (!key) return;

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key) as any,
  });

  const subJson = sub.toJSON();
  await fetch("/api/client/push-subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone,
      endpoint: subJson.endpoint,
      p256dh: subJson.keys?.p256dh,
      auth: subJson.keys?.auth,
    }),
  }).catch(() => {});
}

export function useClientPushNotifications(phone: string | null) {
  useEffect(() => {
    if (!phone) return;
    subscribeClientPush(phone).catch(() => {});
  }, [phone]);
}
