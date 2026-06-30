"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Клиентская квота бесплатных генераций для продукта «Хочу также».
 *
 * Логика (Модуль 3 — система ограничений / пейволл):
 *   • Анонимный гость: FREE_ANON бесплатных генераций (по умолчанию 1).
 *     Счётчик хранится в localStorage — это «мягкий» лимит на устройство,
 *     не security-граница (реальный лимит дублируется на api-server по
 *     anon-id / IP в lib/rateLimit). Цель здесь — UX-триггер пейволла.
 *   • PRO-пакет (299 ₽): снимает лимит на PRO_GENERATIONS генераций
 *     (квота помечается `pro`).
 *
 * Авторизация (Telegram и т.п.) намеренно НЕ участвует — только бесплатная
 * анонимная квота + опциональный PRO.
 *
 * Хук отдаёт состояние + действия. Запись генерации — `record()`. Проверку
 * «можно ли ещё» — `canGenerate`. Если нельзя — UI открывает PaywallModal.
 *
 * SSR-safe: до маунта возвращает дефолт (limit, used=0), читает localStorage
 * только в useEffect, чтобы не было hydration mismatch.
 */

export type QuotaTier = "anon" | "pro";

export const STORAGE_KEY = "sfera_design_quota_v1";

/**
 * Отдельный localStorage-ключ: набор slug'ов генераций, которые ЭТО устройство
 * реально запустило (HTTP 202) и которые ещё «в полёте». Служит основанием для
 * возврата квоты, если генерация позже упадёт (status='failed'): возврат
 * выполняется один раз и только для слага, помеченного этим устройством — это
 * закрывает абьюз (чужой посетитель страницы падения или повторный refresh не
 * могут начислить себе бесплатную попытку).
 */
export const PENDING_KEY = "sfera_design_pending_v1";

/** Максимум хранимых pending-слагов (защита от неограниченного роста). */
export const PENDING_MAX = 20;

export const FREE_ANON = 1;
export const PRO_GENERATIONS = 100;

export interface StoredQuota {
  used: number;
  tier: QuotaTier;
}

export interface GenerationQuota {
  /** Сколько генераций уже потрачено. */
  used: number;
  /** Полный лимит для текущего тира. */
  limit: number;
  /** Остаток (никогда не отрицательный). */
  remaining: number;
  /** Текущий тир пользователя. */
  tier: QuotaTier;
  /** Можно ли запустить ещё одну генерацию. */
  canGenerate: boolean;
  /** Хук дочитал localStorage (до этого — дефолтные значения). */
  ready: boolean;
  /** Зафиксировать потраченную генерацию. Вызывать ПОСЛЕ успешного старта. */
  record: () => void;
  /**
   * Вернуть одну единицу квоты обратно (floored на 0). Тир не меняется.
   * Вызывать, когда генерация, начатая этим устройством, завершилась падением,
   * чтобы серверная ошибка не «съедала» бесплатную попытку пользователя.
   */
  refund: () => void;
  /** Повысить тир до "pro" (после оплаты). */
  upgradeTier: (tier: QuotaTier) => void;
  /** Сбросить счётчик (debug / админ). */
  reset: () => void;
}

function limitForTier(tier: QuotaTier): number {
  switch (tier) {
    case "pro":
      return PRO_GENERATIONS;
    case "anon":
    default:
      return FREE_ANON;
  }
}

/**
 * Чистая арифметика остатка квоты. Никогда не отрицательна.
 *
 * Вынесена отдельно, чтобы быть детерминированной и тестируемой
 * (property-тест полагается на `remaining = max(0, limit - used)`).
 */
export function computeRemaining(limit: number, used: number): number {
  return Math.max(0, limit - used);
}

/**
 * Чистый переход состояния квоты при успешном старте генерации (HTTP 202):
 * увеличивает `used` ровно на единицу, тир не меняет.
 *
 * Вынесен отдельно от хука, чтобы быть детерминированным и тестируемым
 * (Property 12: один успешный старт списывает ровно одну единицу квоты).
 */
export function recordUsage(state: StoredQuota): StoredQuota {
  return { ...state, used: state.used + 1 };
}

/**
 * Чистый обратный переход к `recordUsage`: возвращает одну единицу квоты,
 * никогда не опускаясь ниже нуля; тир не меняет. Вынесен отдельно от хука для
 * детерминизма и тестируемости (Property: refund(record(s)) === clamp(s)).
 */
export function refundUsage(state: StoredQuota): StoredQuota {
  return { ...state, used: Math.max(0, state.used - 1) };
}

/**
 * Чистая проекция хранимого состояния в вычисляемые поля квоты
 * (`limit`/`remaining`/`canGenerate`). Используется и хуком, и тестами.
 */
export function deriveQuota(state: StoredQuota): {
  limit: number;
  remaining: number;
  canGenerate: boolean;
} {
  const limit = limitForTier(state.tier);
  const remaining = computeRemaining(limit, state.used);
  return { limit, remaining, canGenerate: remaining > 0 };
}

function readStored(): StoredQuota {
  if (typeof window === "undefined") return { used: 0, tier: "anon" };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { used: 0, tier: "anon" };
    const parsed = JSON.parse(raw) as Partial<StoredQuota>;
    const tier: QuotaTier = parsed.tier === "pro" ? "pro" : "anon";
    const used =
      typeof parsed.used === "number" && Number.isFinite(parsed.used) && parsed.used >= 0
        ? Math.floor(parsed.used)
        : 0;
    return { used, tier };
  } catch {
    return { used: 0, tier: "anon" };
  }
}

function writeStored(value: StoredQuota): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // localStorage недоступен (private mode / quota) — мягко игнорируем,
    // лимит просто не персистится в этой сессии.
  }
}

function readPending(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === "string");
  } catch {
    return [];
  }
}

function writePending(slugs: string[]): void {
  if (typeof window === "undefined") return;
  try {
    // Храним только последние PENDING_MAX — список самоограничивается, даже
    // если какие-то слаги завершились успехом и не были «погашены».
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(slugs.slice(-PENDING_MAX)));
  } catch {
    // localStorage недоступен — мягко игнорируем.
  }
}

/**
 * Пометить slug как «своя генерация в полёте» — основание для возврата квоты,
 * если она позже упадёт. Идемпотентно: повторная пометка того же слага не
 * создаёт дубликат.
 */
export function markPendingGeneration(slug: string): void {
  if (!slug) return;
  const slugs = readPending();
  if (slugs.includes(slug)) return;
  writePending([...slugs, slug]);
}

/**
 * Снять slug из набора pending. Возвращает `true`, если slug там был — то есть
 * генерация принадлежит этому устройству и ещё не была «погашена». Идемпотентно:
 * повторный вызов вернёт `false`, что исключает двойной возврат квоты при
 * рефреше страницы падения.
 */
export function consumePendingGeneration(slug: string): boolean {
  if (!slug) return false;
  const slugs = readPending();
  if (!slugs.includes(slug)) return false;
  writePending(slugs.filter((s) => s !== slug));
  return true;
}

export function useGenerationQuota(): GenerationQuota {
  const [state, setState] = useState<StoredQuota>({ used: 0, tier: "anon" });
  const [ready, setReady] = useState(false);

  // Первичная гидрация из localStorage после маунта.
  useEffect(() => {
    setState(readStored());
    setReady(true);
  }, []);

  // Синхронизация между вкладками: другой таб потратил/повысил квоту.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setState(readStored());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const record = useCallback(() => {
    setState((prev) => {
      const next = recordUsage(prev);
      writeStored(next);
      return next;
    });
  }, []);

  const refund = useCallback(() => {
    setState((prev) => {
      const next = refundUsage(prev);
      writeStored(next);
      return next;
    });
  }, []);

  const upgradeTier = useCallback((tier: QuotaTier) => {
    setState((prev) => {
      // Не понижаем тир: pro > anon.
      const rank: Record<QuotaTier, number> = { anon: 0, pro: 1 };
      const nextTier = rank[tier] >= rank[prev.tier] ? tier : prev.tier;
      const next = { ...prev, tier: nextTier };
      writeStored(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const next: StoredQuota = { used: 0, tier: "anon" };
    writeStored(next);
    setState(next);
  }, []);

  const { limit, remaining, canGenerate } = deriveQuota(state);

  return {
    used: state.used,
    limit,
    remaining,
    tier: state.tier,
    canGenerate,
    ready,
    record,
    refund,
    upgradeTier,
    reset,
  };
}
