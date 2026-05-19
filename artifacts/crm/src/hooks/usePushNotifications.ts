import { useEffect, useRef, useState } from "react";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

type PushState = "idle" | "requesting" | "subscribed" | "denied" | "unsupported" | "error";

export function usePushNotifications() {
  const [state, setState] = useState<PushState>("idle");
  const [error, setError] = useState<string | null>(null);
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    // Auto-subscribe if already granted
    if (Notification.permission === "granted") {
      subscribe().catch(() => {});
    }
  }, []);

  async function subscribe() {
    if (subscribedRef.current) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    if (!VAPID_PUBLIC_KEY) {
      // VAPID not configured — silently skip
      return;
    }

    setState("requesting");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("denied");
        return;
      }

      const existing = await reg.pushManager.getSubscription();
      const sub = existing ?? await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });

      const json = sub.toJSON();
      const endpoint = json.endpoint!;
      const p256dh = (json.keys as any)?.p256dh ?? "";
      const auth = (json.keys as any)?.auth ?? "";

      const res = await fetch("/api/push/operator-subscribe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, p256dh, auth }),
      });

      if (!res.ok) throw new Error(`Server error ${res.status}`);

      subscribedRef.current = true;
      setState("subscribed");
    } catch (e: any) {
      console.error("[usePushNotifications] subscribe failed:", e);
      setError(e?.message ?? "Ошибка подписки");
      setState("error");
    }
  }

  return { state, error, subscribe };
}
