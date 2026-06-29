"use client";

import { useEffect } from "react";
import type { QuotaTier } from "../../lib/useGenerationQuota";

/**
 * Пейволл продукта «Хочу также» (Модуль 3, UI-слой).
 *
 * Открывается, когда у гостя закончились бесплатные генерации. Премиальная
 * тёмная glassmorphism-карточка поверх затемнённого оверлея — локальная
 * тёмная стилистика инструмента, не зависит от тёплой светлой темы
 * остального маркетплейса (все цвета заданы инлайн-классами, без --color-*).
 *
 * Авторизации НЕТ (по решению — пока только бесплатная анонимная квота).
 * Модалка информирует об исчерпании лимита и предлагает опциональный
 * PRO-пакет (оплата — отдельная задача, сейчас заглушка через onBuyPro).
 *
 * Никаких ключей/секретов.
 */

interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
  /** Текущий тир — для копирайта. */
  tier: QuotaTier;
  /** Сколько бесплатных уже потрачено (для копирайта). */
  used: number;
  /** Клик «Купить PRO». Опционально — если не задан, блок PRO не показывается. */
  onBuyPro?: () => void;
}

export function PaywallModal({ open, onClose, tier, used, onBuyPro }: PaywallModalProps) {
  // Esc закрывает; блокируем скролл body пока открыт.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/70 backdrop-blur-sm"
      />

      {/* Glass card */}
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/80 shadow-2xl backdrop-blur-xl">
        {/* Decorative glow */}
        <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-amber-400/20 blur-3xl" />

        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="relative px-6 pb-6 pt-10 sm:px-8 sm:pb-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-amber-300">
            Лимит исчерпан
          </span>

          <h2 id="paywall-title" className="mt-4 text-2xl font-bold leading-tight text-white">
            Бесплатный лимит исчерпан
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-white/60">
            Вы использовали {used} {pluralizeDesign(used)}. Возвращайтесь позже —
            лимит периодически обновляется
            {onBuyPro ? ", или снимите ограничение с PRO-пакетом." : "."}
          </p>

          {/* PRO pack — опционально */}
          {onBuyPro ? (
            <button
              type="button"
              onClick={onBuyPro}
              className="group relative mt-6 flex w-full items-center gap-4 overflow-hidden rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-500/15 to-amber-400/5 p-4 text-left transition hover:border-amber-400/60"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-400/20 text-amber-300">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="m12 2 2.4 7.2H22l-6 4.4 2.3 7.4L12 16.8 5.7 21l2.3-7.4-6-4.4h7.6z" />
                </svg>
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold text-white">PRO-пакет</span>
                <span className="block text-xs text-white/50">
                  100 генераций · без водяного знака · приоритет
                </span>
              </span>
              <span className="text-right">
                <span className="block text-lg font-bold text-amber-300">299 ₽</span>
              </span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={onClose}
            className="mt-3 flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            Понятно
          </button>

          {tier === "pro" ? (
            <p className="mt-4 text-center text-xs text-white/40">
              У вас активен PRO — если лимит всё равно исчерпан, напишите в
              поддержку.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Склонение «дизайн / дизайна / дизайнов» по числу. */
function pluralizeDesign(n: number): string {
  const abs = Math.abs(Math.round(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return "бесплатный дизайн";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "бесплатных дизайна";
  return "бесплатных дизайнов";
}
