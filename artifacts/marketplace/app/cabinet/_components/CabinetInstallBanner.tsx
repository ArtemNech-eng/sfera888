"use client";

import { useEffect, useState } from "react";

/**
 * "Добавить на главный экран" — install prompt banner.
 *
 * Behaviour:
 * - On Android/Chrome: catches `beforeinstallprompt`, shows a bottom sheet
 *   after 3 seconds of dwell. One tap → native install dialog.
 * - On iOS Safari: detects standalone eligibility via
 *   `navigator.standalone === false`. Shows a manual instruction sheet with
 *   the Share → "На экран «Домой»" flow.
 * - Hides permanently once installed (localStorage flag) or dismissed twice.
 * - Never shown in standalone mode (already installed).
 */

type Variant = "android" | "ios" | null;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const STORAGE_KEY = "cabinet_install_dismissed";

function getDismissCount(): number {
  try { return Number(localStorage.getItem(STORAGE_KEY) ?? 0); } catch { return 0; }
}
function incrementDismiss() {
  try { localStorage.setItem(STORAGE_KEY, String(getDismissCount() + 1)); } catch {}
}
function markInstalled() {
  try { localStorage.setItem(STORAGE_KEY, "99"); } catch {}
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function CabinetInstallBanner() {
  const [variant, setVariant] = useState<Variant>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Already installed or dismissed too many times — skip.
    if (isStandalone()) return;
    if (getDismissCount() >= 2) return;

    // iOS: show manual instructions after 4s dwell.
    if (isIos()) {
      const timer = setTimeout(() => {
        setVariant("ios");
        setVisible(true);
      }, 4_000);
      return () => clearTimeout(timer);
    }

    // Android/Chrome: wait for browser prompt event.
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      const timer = setTimeout(() => {
        setVariant("android");
        setVisible(true);
      }, 3_000);
      return () => clearTimeout(timer);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") markInstalled();
    setVisible(false);
  };

  const handleDismiss = () => {
    incrementDismiss();
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-[64px] z-50 px-4 pb-2 lg:bottom-4 lg:left-auto lg:right-4 lg:max-w-sm"
      style={{ animation: "slideUp 0.3s ease-out" }}
    >
      <style>{`@keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>

      <div className="relative overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        {/* Gradient accent top */}
        <div className="h-1 w-full" style={{ background: "linear-gradient(90deg, #6366f1, #0d9488)" }} />

        <div className="p-4">
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Закрыть"
            className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>

          <div className="flex items-center gap-3">
            {/* App icon */}
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl shadow-sm" style={{ background: "linear-gradient(135deg, #0d9488, #6366f1)" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" />
                <path d="M16 3H8L6 7h12l-2-4z" />
              </svg>
            </div>

            <div className="min-w-0 flex-1 pr-6">
              <p className="text-sm font-bold text-gray-900">Установить кабинет</p>
              <p className="text-xs text-gray-500">Работает как приложение — без браузера</p>
            </div>
          </div>

          {variant === "android" ? (
            <button
              type="button"
              onClick={handleInstall}
              className="mt-3 w-full rounded-xl py-2.5 text-sm font-bold text-white shadow-sm transition hover:opacity-90 active:scale-95"
              style={{ background: "linear-gradient(135deg, #0d9488, #6366f1)" }}
            >
              Добавить на главный экран
            </button>
          ) : (
            <div className="mt-3 space-y-1.5 rounded-xl bg-gray-50 p-3">
              <p className="text-xs font-semibold text-gray-700">Как установить на iPhone / iPad:</p>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span className="text-base">1.</span>
                <span>Нажмите <strong>Поделиться</strong> <IosShareIcon /> внизу Safari</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span className="text-base">2.</span>
                <span>Выберите <strong>«На экран «Домой»»</strong></span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span className="text-base">3.</span>
                <span>Нажмите <strong>Добавить</strong> — готово!</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function IosShareIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: "inline", verticalAlign: "middle" }}>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}
