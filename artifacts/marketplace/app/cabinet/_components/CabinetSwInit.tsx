"use client";

import { useEffect } from "react";

/**
 * Registers the service worker silently on first cabinet load.
 *
 * SW registration is required for PWA installability — Chrome won't show
 * the "Add to Home Screen" prompt without it, and iOS won't let the user
 * install the app from Safari's share sheet.
 *
 * We register here (layout level) rather than gating it on push-permission
 * so the app is installable even for masters who decline push notifications.
 */
export function CabinetSwInit() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => {
        // Silently ignore — SW is an enhancement, not a hard requirement.
      });
  }, []);

  return null;
}
