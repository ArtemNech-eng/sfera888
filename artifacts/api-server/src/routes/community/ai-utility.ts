/**
 * AI_Design_Utility HTTP-маршруты — платная утилита «🪄 AI-Дизайн и Смета за
 * 100 ₽» гео-сообщества «ХочуТакже» (Task 9.5).
 *
 * Spec: .kiro/specs/hochu-takzhe-community/ (design.md → «AI_Design_Utility»,
 * Requirements 12.1, 12.3).
 *
 * Роутер монтируется под `/api/community/ai-utility` (регистрация — Task 14.1,
 * здесь НЕ регистрируется). Тонкий HTTP-слой поверх оркестратора
 * `AiDesignUtility` (задачи 9.1/9.3) и существующего платёжного потока
 * Yandex Pay (`routes/yandex-pay.ts`):
 *
 *   • POST /start                    — собрать параметры (метраж, стиль) +
 *     контекст уровня 2 (телефон + Captcha) ДО оплаты и создать сессию
 *     (`startSession`). Requirements 12.2, 10.x. Ответ несёт `sessionId`.
 *   • POST /confirm-payment/:sessionId — вызывается после подтверждения оплаты
 *     100 ₽. Проверяет факт оплаты через инъектируемый шов `verifyPayment`
 *     (в проде — существующий Yandex Pay: `pollYandexPayStatus`/webhook), затем
 *     запускает генерацию и создаёт лид (`onPaymentConfirmed`). Идемпотентно.
 *     Requirements 12.3, 20.3, 13.x. Без подтверждённой оплаты → 402, генерация
 *     не запускается (Requirement 12.5).
 *   • GET /estimate/:sessionId       — вернуть Design_Estimate: черновик
 *     (`draft`) до готовности или полноценный (`generated`) — визуализации +
 *     смета (`getEstimate`). Requirements 12.4, 12.6.
 *
 * ВИДЖЕТ В ШАПКЕ ФАСАДА (Requirement 12.1): доступность «из шапки на всех
 * публичных страницах» обеспечивает фасад (Next.js). Виджет — тонкая точка
 * входа, которая: (1) шлёт POST /start с параметрами и телефоном+Captcha;
 * (2) инициирует оплату 100 ₽ через существующий Yandex Pay; (3) по возврату с
 * оплаты дергает POST /confirm-payment/:sessionId; (4) опрашивает GET
 * /estimate/:sessionId до `status='generated'`. Контракт задаёт этот роутер;
 * разметка виджета — в артефакте marketplace (Task 13.x).
 *
 * Слой оркестратора и проверка оплаты инъектируются через фабрику
 * `createAiUtilityRouter(deps)`, хендлеры выделены в `makeHandlers(deps)` — это
 * позволяет юнит-тестам прогонять маршруты без БД, оплаты и AI-пайплайна.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import {
  aiDesignUtility as defaultUtility,
  type AiDesignUtility,
} from "../../lib/aiDesignUtility.js";

declare const console: { error: (...args: unknown[]) => void };

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiting (переиспользуем паттерн из routes/community/geo.ts): скользящее
// окно по IP для публичных POST (Requirement 9.4 — операционные ограничения).
// ─────────────────────────────────────────────────────────────────────────────
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 10;

export function checkRateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket?.remoteAddress;
  if (!ip) return next();
  const now = Date.now();
  const record = rateLimitStore.get(ip);
  if (record && record.resetTime > now) {
    if (record.count >= RATE_LIMIT_MAX) {
      return res.status(429).json({ error: "Too many requests, please try again later." });
    }
    record.count += 1;
  } else {
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
  }
  next();
}

/**
 * Шов проверки факта оплаты 100 ₽ (Requirement 12.3/12.5). В проде реализуется
 * поверх существующего Yandex Pay (`pollYandexPayStatus`/webhook по orderId
 * сессии); в тестах подменяется детерминированным фейком. Возвращает `true`,
 * только если оплата реально подтверждена — иначе генерация не запускается.
 */
export type VerifyPayment = (sessionId: string) => Promise<boolean>;

/** Прод-дефолт проверки оплаты. До привязки orderId Yandex Pay к сессии
 * утилиты — консервативно возвращает `false` (нет подтверждения → нет
 * генерации, Requirement 12.5). Реальная привязка выполняется в интеграции с
 * Yandex Pay webhook/redirect (см. routes/yandex-pay.ts). */
const defaultVerifyPayment: VerifyPayment = async () => false;

/** Инъектируемые зависимости роутера. */
export interface AiUtilityRouterDeps {
  /** Оркестратор утилиты (по умолчанию — синглтон поверх пайплайна `designs`). */
  utility: Pick<AiDesignUtility, "startSession" | "onPaymentConfirmed" | "getEstimate">;
  /** Проверка факта оплаты (по умолчанию — консервативный `false`). */
  verifyPayment: VerifyPayment;
}

const defaultDeps: AiUtilityRouterDeps = {
  utility: defaultUtility,
  verifyPayment: defaultVerifyPayment,
};

// ─── Разбор входа ────────────────────────────────────────────────────────────

/** Извлечь параметры запуска сессии из тела запроса. */
export function parseStartBody(body: unknown): {
  areaM2: number;
  style: string;
  phone: string;
  captchaToken: string;
} {
  const b = (body ?? {}) as Record<string, unknown>;
  const areaM2 = typeof b.areaM2 === "number" ? b.areaM2 : Number(b.areaM2);
  return {
    areaM2: Number.isFinite(areaM2) ? areaM2 : NaN,
    style: typeof b.style === "string" ? b.style : "",
    phone: typeof b.phone === "string" ? b.phone : "",
    captchaToken: typeof b.captchaToken === "string" ? b.captchaToken : "",
  };
}

// ─── HTTP-хендлеры (тестируемы без сервера) ──────────────────────────────────

export function makeHandlers(deps: AiUtilityRouterDeps) {
  /**
   * POST /start — сбор параметров + уровень 2 (телефон + Captcha) до оплаты
   * (Requirements 12.2, 10.x). Успех → 201 `{ sessionId }`; отказ гейта/валидации
   * → 400 (или 403 для captcha) с кодом причины и флагом `retry`.
   */
  async function start(req: Request, res: Response): Promise<void> {
    const { areaM2, style, phone, captchaToken } = parseStartBody(req.body);
    try {
      const result = await deps.utility.startSession({ areaM2, style, phone, captchaToken });
      if (!result.ok) {
        // Провал Captcha → 403 (с предложением повторить), прочее → 400.
        const status = result.reason === "captcha_failed" ? 403 : 400;
        res.status(status).json({ error: result.reason, retry: result.retry });
        return;
      }
      res.status(201).json({ sessionId: result.sessionId });
    } catch (e: unknown) {
      console.error("[community/ai-utility/start]", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "internal_error" });
    }
  }

  /**
   * POST /confirm-payment/:sessionId — подтверждение оплаты 100 ₽ через
   * существующий Yandex Pay и запуск генерации (Requirements 12.3, 20.3).
   *
   *   • оплата НЕ подтверждена → 402 `payment_not_confirmed`, генерация не
   *     запускается (Requirement 12.5);
   *   • сессия не найдена → 404;
   *   • успех → 200 с `designId`/`designSlug`/`leadId` (лид в существующий поток).
   */
  async function confirmPayment(req: Request, res: Response): Promise<void> {
    const sessionId = (req.params as { sessionId?: string }).sessionId ?? "";
    try {
      const paid = await deps.verifyPayment(sessionId);
      if (!paid) {
        // Гейт оплаты (Requirement 12.5): без подтверждения — не генерируем.
        res.status(402).json({ error: "payment_not_confirmed" });
        return;
      }

      const result = await deps.utility.onPaymentConfirmed(sessionId);
      if (!result.ok) {
        res.status(404).json({ error: result.reason });
        return;
      }

      res.status(200).json({
        sessionId: result.sessionId,
        designId: result.designId,
        designSlug: result.designSlug,
        leadId: result.leadId,
      });
    } catch (e: unknown) {
      console.error("[community/ai-utility/confirm-payment]", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "internal_error" });
    }
  }

  /**
   * GET /estimate/:sessionId — вернуть Design_Estimate (Requirements 12.4, 12.6).
   * Сессии нет → 404. Иначе 200 с `estimate` (`status='draft'|'generated'`).
   */
  async function getEstimate(req: Request, res: Response): Promise<void> {
    const sessionId = (req.params as { sessionId?: string }).sessionId ?? "";
    try {
      const estimate = await deps.utility.getEstimate(sessionId);
      if (!estimate) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.status(200).json({ estimate });
    } catch (e: unknown) {
      console.error("[community/ai-utility/estimate]", e instanceof Error ? e.message : e);
      res.status(500).json({ error: "internal_error" });
    }
  }

  return { start, confirmPayment, getEstimate };
}

/**
 * Собрать Express-роутер AI-утилиты (Task 9.5).
 *
 * @param deps частичное переопределение зависимостей (для тестов); отсутствующие
 *             поля берутся из прод-дефолтов.
 */
export function createAiUtilityRouter(deps: Partial<AiUtilityRouterDeps> = {}): Router {
  const resolved: AiUtilityRouterDeps = { ...defaultDeps, ...deps };
  const handlers = makeHandlers(resolved);

  const router = Router();
  router.post("/start", checkRateLimit, handlers.start);
  router.post("/confirm-payment/:sessionId", checkRateLimit, handlers.confirmPayment);
  router.get("/estimate/:sessionId", handlers.getEstimate);
  return router;
}

/** Прод-роутер с дефолтными зависимостями (монтируется в 14.1). */
const aiUtilityRouter = createAiUtilityRouter();
export default aiUtilityRouter;
