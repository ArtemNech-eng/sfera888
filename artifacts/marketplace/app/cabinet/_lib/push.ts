"use client";

import { cabinetPush, CabinetApiError } from "./cabinetClient";

/**
 * Web Push subscription helpers (plan §18.3 W2 final piece).
 *
 * Wire flow mirrors master-pwa's `usePushNotifications`:
 *   1. Register `/sw.js` (root scope so notification click can navigate
 *      anywhere under chestnye-mastera.ru).
 *   2. GET VAPID public key from api-server.
 *   3. Call `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`.
 *   4. POST the subscription JSON to api-server.
 *
 * The api-server reuses one master_push_subscriptions table for both
 * master-pwa and cabinet — same `endpoint` upserts, so re-installing on a
 * different host doesn't duplicate rows.
 */

export type PushStatus = "unsupported" | "denied" | "default" | "subscribed" | "error";

export interface PushState {
  status: PushStatus;
  endpoint: string | null;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return new Uint8Array([...rawData].map((c) => c.charCodeAt(0)));
}

function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  if (!("PushManager" in window)) return false;
  if (!("Notification" in window)) return false;
  return true;
}

/**
 * Inspect current state without prompting. Safe to call on mount —
 * doesn't trigger any permission UI.
 */
export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) return { status: "unsupported", endpoint: null };
  if (Notification.permission === "denied") return { status: "denied", endpoint: null };

  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    if (!reg) return { status: Notification.permission === "granted" ? "default" : "default", endpoint: null };
    const sub = await reg.pushManager.getSubscription();
    if (sub) return { status: "subscribed", endpoint: sub.endpoint };
    return { status: Notification.permission === "granted" ? "default" : "default", endpoint: null };
  } catch {
    return { status: "error", endpoint: null };
  }
}

/**
 * Full enable flow — registers SW if needed, prompts permission, subscribes,
 * uploads to api-server. Must be called inside a user gesture (button click).
 */
export async function enablePush(): Promise<PushState> {
  if (!isPushSupported()) return { status: "unsupported", endpoint: null };

  // Register SW (or reuse existing). Scope = "/" so notificationclick can
  // navigate to /cabinet/orders/* etc.
  let reg: ServiceWorkerRegistration;
  try {
    reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
  } catch {
    return { status: "error", endpoint: null };
  }

  // Permission prompt — must run inside a gesture.
  if (Notification.permission === "default") {
    const result = await Notification.requestPermission();
    if (result !== "granted") {
      return { status: result === "denied" ? "denied" : "default", endpoint: null };
    }
  } else if (Notification.permission === "denied") {
    return { status: "denied", endpoint: null };
  }

  // Reuse the existing subscription if present (avoid duplicate registrations
  // when the master toggles the button twice in a row).
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    let key: string;
    try {
      const res = await cabinetPush.vapidKey();
      key = res.key;
    } catch (err) {
      // 503 => push not configured on this deployment. Not a user error.
      if (err instanceof CabinetApiError && err.status === 503) {
        return { status: "error", endpoint: null };
      }
      return { status: "error", endpoint: null };
    }
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });
    } catch {
      return { status: "error", endpoint: null };
    }
  }

  // Upload to api-server. If it fails we still return "subscribed" because
  // the browser side is OK — server-side retries can be triggered later.
  const json = sub.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
    try {
      await cabinetPush.subscribe({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
    } catch {
      // soft-fail; UI still considers the local subscription valid.
    }
  }

  return { status: "subscribed", endpoint: sub.endpoint };
}

/**
 * Drop the local subscription and tell api-server to forget it. Safe to
 * call when not subscribed (no-op).
 */
export async function disablePush(): Promise<PushState> {
  if (!isPushSupported()) return { status: "unsupported", endpoint: null };
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    if (!reg) return { status: "default", endpoint: null };
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return { status: "default", endpoint: null };
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => {});
    await cabinetPush.unsubscribe(endpoint).catch(() => {});
    return { status: "default", endpoint: null };
  } catch {
    return { status: "error", endpoint: null };
  }
}
