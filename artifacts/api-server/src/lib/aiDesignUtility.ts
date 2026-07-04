/**
 * AI_Design_Utility — платная утилита «🪄 AI-Дизайн и Смета за 100 ₽»
 * (Requirement 12), оркестрация поверх существующего AI_Design_Pipeline
 * (Requirement 20.3).
 *
 * Spec: .kiro/specs/hochu-takzhe-community/ (design.md → "AI_Design_Utility gate").
 *
 * Этот модуль — тонкий слой ОРКЕСТРАЦИИ. Он НЕ реализует генерацию заново:
 * визуализации, смету и материалы производит существующий пайплайн
 * (`designsTable` + `designWorker.ts` + `materialsEstimator.ts`), тот же самый,
 * что обслуживает `routes/dizajn.ts`. Утилита лишь:
 *
 *   1. `startSession(...)` — собирает параметры (метраж, стиль) и проверяет
 *      контекст уровня 2 (телефон + Captcha) ДО оплаты (Requirements 12.2, 10.x).
 *   2. `onPaymentConfirmed(sessionId)` — ТОЛЬКО после подтверждения оплаты
 *      запускает существующий пайплайн, порождая `Design_Estimate`
 *      (Requirements 12.3, 20.3).
 *   3. `getEstimate(sessionId)` — возвращает `DesignEstimate | null`: черновик
 *      (`draft`) до готовности и полноценный (`generated`) — визуализации +
 *      детальная смета материалов и работ — после (Requirements 12.4, 12.6).
 *   4. `canGenerate(session)` — чистый, тестируемый гейт «оплата → генерация»:
 *      генерация допустима тогда и только тогда, когда оплата подтверждена
 *      (Requirement 12.5).
 *
 * Payment→generation гейт вынесен в отдельную чистую функцию `canGenerate`,
 * чтобы его можно было проверять юнит- и property-тестами без БД/сети.
 *
 * Персистентность сессий: по умолчанию — минимальное in-memory-хранилище
 * (инъектируется через `SessionStore`). Генерация же переиспользует настоящую
 * таблицу `designs` (существующий пайплайн). Специальной таблицы сессий утилиты
 * в схеме пока нет — при переходе на распределённый рантайм её следует добавить
 * отдельной аддитивной миграцией (НЕ в рамках этой задачи). См. ASSUMPTIONS.
 *
 * ── ASSUMPTIONS (переиспользуемый пайплайн) ─────────────────────────────────
 *   • Пайплайн `designs` требует `roomType`; утилита собирает только метраж и
 *     стиль (Requirement 12.2). Для утилиты «дизайн квартиры» roomType по
 *     умолчанию — `DEFAULT_UTILITY_ROOM_TYPE = 'apartment'` (входит в whitelist
 *     `VALID_ROOMS` в routes/dizajn.ts). При необходимости может быть переопределён
 *     на слое роута (Task 9.5).
 *   • Триггер генерации в существующем пайплайне — вставка строки `designs` со
 *     `status='generating'`; фоновый `designWorker` подхватывает её (тот же путь,
 *     что и `routes/dizajn.ts`). Отдельного/параллельного пайплайна НЕ создаём
 *     (Requirement 20.3).
 *   • Готовый `Design_Estimate` читается из той же строки `designs`: визуализации —
 *     `views`, материалы — `materials`, смета работ/материалов — `estimate`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { randomUUID } from "node:crypto";
import {
  db,
  designsTable,
  leadsTable,
  type DesignView,
  type DesignMaterial,
  type DesignEstimateItem,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { pickUniqueSlug } from "./slug.js";
import {
  verifyLeadContext,
  type LeadContextRejectionReason,
} from "./communityAuth.js";

/** roomType по умолчанию для утилиты «AI-Дизайн и Смета» (см. ASSUMPTIONS). */
export const DEFAULT_UTILITY_ROOM_TYPE = "apartment";

/**
 * Признак источника лида платной AI-утилиты в существующей таблице `leads`
 * (Requirements 13.1, 20.1). Оператор фильтрует по нему «горячие» лиды в CRM.
 */
export const AI_UTILITY_LEAD_SOURCE = "ai_utility";

/**
 * Приоритетный сигнал намерения для CRM (Requirement 13.4). Оплативший 100 ₽
 * пользователь — «горячий» лид; кладём метку в `marketplace_context.priority`,
 * чтобы не менять схему существующей таблицы `leads` (Requirement 20.1).
 */
export const AI_UTILITY_LEAD_PRIORITY = "hot";

/**
 * Дефолты обязательных полей `leads`, которые утилита не собирает у пользователя
 * (она спрашивает только метраж, стиль и телефон — Requirement 12.2). Следуем
 * конвенции существующих вставок (см. routes/marketplace.ts: пустой `district`,
 * человекочитаемый `clientName`).
 */
export const DEFAULT_UTILITY_CLIENT_NAME = "Клиент AI-утилиты";
export const DEFAULT_UTILITY_SERVICE_TYPE = "AI-дизайн и смета";

/**
 * Сообщение пользователю при попытке получить результат без подтверждённой
 * оплаты (Requirement 12.5).
 */
export const PAYMENT_NOT_CONFIRMED_MESSAGE =
  "Оплата не подтверждена. Дизайн и смета будут сгенерированы после оплаты 100 ₽.";

/**
 * Статус Design_Estimate:
 *   - `draft`     — параметры собраны, но результат ещё не сгенерирован
 *                   (может существовать ДО подтверждения оплаты — Requirement 12.4);
 *   - `generated` — существующий пайплайн произвёл визуализации и смету
 *                   (только ПОСЛЕ подтверждения оплаты — Requirements 12.3, 12.5).
 */
export type EstimateStatus = "draft" | "generated";

/** Одна AI-визуализация (ракурс) в составе Design_Estimate (Requirement 12.4). */
export interface EstimateVisualization {
  url: string;
  label: string;
  position: number;
}

/**
 * Design_Estimate (Requirement 12.4, 12.6): AI-визуализации в нескольких
 * ракурсах + детальная смета материалов и работ. Компоненты могут
 * присутствовать и в черновике (`status='draft'`) — тогда они пустые до
 * готовности генерации.
 */
export interface DesignEstimate {
  status: EstimateStatus;
  /** AI-визуализации (несколько ракурсов). */
  visualizations: EstimateVisualization[];
  /** Материалы (что использовать). */
  materials: DesignMaterial[];
  /** Детальная смета (категории работ/материалов и суммы). */
  estimate: DesignEstimateItem[];
  /** Slug сгенерированного дизайн-проекта (если генерация запущена/готова). */
  designSlug?: string;
  /** Id строки `designs` (если генерация запущена/готова). */
  designId?: number;
}

/** Внутреннее состояние сессии утилиты. */
export interface AiDesignSession {
  id: string;
  areaM2: number;
  style: string;
  /** Нормализованный телефон уровня 2 (`+7XXXXXXXXXX`). */
  phone: string;
  /** Подтверждена ли оплата 100 ₽ (гейт генерации — Requirement 12.5). */
  paymentConfirmed: boolean;
  /** Id строки `designs`, если генерация уже запущена. */
  designId: number | null;
  /** Slug строки `designs`, если генерация уже запущена. */
  designSlug: string | null;
  /**
   * Id созданного лида в существующей таблице `leads`, если он уже создан
   * (после подтверждения оплаты — Requirement 13.1). Гарантирует, что повторный
   * `onPaymentConfirmed` не породит дубликат лида.
   */
  leadId: number | null;
  createdAt: Date;
}

// ── Результаты публичных операций (дискриминированные объединения) ───────────

export type StartSessionResult =
  | { ok: true; sessionId: string; session: AiDesignSession }
  | {
      ok: false;
      reason: LeadContextRejectionReason | "area_invalid" | "style_invalid";
      retry: boolean;
    };

export type PaymentConfirmedResult =
  | {
      ok: true;
      sessionId: string;
      designId: number;
      designSlug: string;
      /** Id созданного лида (Requirement 13.1). `null`, если запись в CRM не удалась. */
      leadId: number | null;
    }
  | { ok: false; reason: "session_not_found" };

// ── Инъектируемые зависимости (для тестируемости без БД/сети) ────────────────

/**
 * Хранилище сессий. По умолчанию — in-memory. Тесты и роут-слой могут
 * подставить собственную реализацию (например, поверх Redis/таблицы).
 */
export interface SessionStore {
  get(sessionId: string): AiDesignSession | undefined;
  set(session: AiDesignSession): void;
}

/** Простейшее in-memory-хранилище сессий (дефолт). */
export class InMemorySessionStore implements SessionStore {
  private readonly map = new Map<string, AiDesignSession>();
  get(sessionId: string): AiDesignSession | undefined {
    return this.map.get(sessionId);
  }
  set(session: AiDesignSession): void {
    this.map.set(session.id, session);
  }
}

/**
 * Адаптер к СУЩЕСТВУЮЩЕМУ AI_Design_Pipeline (Requirement 20.3). Утилита не
 * знает деталей генерации — только «запусти» и «прочитай готовый результат».
 */
export interface AiDesignPipeline {
  /**
   * Запустить существующий пайплайн для заданных параметров. Возвращает
   * идентификаторы созданного дизайн-проекта. Реализация по умолчанию
   * вставляет строку `designs` со `status='generating'` — её подхватывает
   * фоновый `designWorker` (тот же путь, что и `routes/dizajn.ts`).
   */
  enqueue(params: {
    areaM2: number;
    style: string;
    roomType: string;
  }): Promise<{ designId: number; designSlug: string }>;
  /**
   * Прочитать готовый Design_Estimate из существующего пайплайна. Возвращает
   * `null`, если генерация ещё не завершена.
   */
  fetchProduced(designId: number): Promise<{
    visualizations: EstimateVisualization[];
    materials: DesignMaterial[];
    estimate: DesignEstimateItem[];
    designSlug: string;
  } | null>;
}

/**
 * Реализация адаптера поверх реальной таблицы `designs` (Requirement 20.3).
 * Никакой новой логики генерации — только вставка задания и чтение результата.
 */
export const designsTablePipeline: AiDesignPipeline = {
  async enqueue({ areaM2, style, roomType }) {
    const slug = await pickUniqueSlug({ roomType, style });
    const [created] = await db
      .insert(designsTable)
      .values({
        slug,
        // Владелец-токен для «мои дизайны»; утилита привязывает лид отдельно (Task 9.3).
        anonId: randomUUID(),
        roomType,
        style,
        area: areaM2.toFixed(2),
        // Существующий пайплайн стартует с 'generating'; воркер подхватит запись.
        status: "generating",
        progress: 0,
        currentStep: null,
      })
      .returning({ id: designsTable.id, slug: designsTable.slug });

    if (!created) {
      throw new Error("ai-design-utility: failed to enqueue design row");
    }
    return { designId: created.id, designSlug: created.slug ?? slug };
  },

  async fetchProduced(designId) {
    const [row] = await db
      .select({
        status: designsTable.status,
        slug: designsTable.slug,
        views: designsTable.views,
        materials: designsTable.materials,
        estimate: designsTable.estimate,
      })
      .from(designsTable)
      .where(eq(designsTable.id, designId))
      .limit(1);

    // Готовый результат существует только у завершённого дизайна.
    if (!row || row.status !== "completed") return null;

    const views: DesignView[] = Array.isArray(row.views) ? row.views : [];
    return {
      visualizations: views.map((v) => ({
        url: v.url,
        label: v.label,
        position: v.position,
      })),
      materials: Array.isArray(row.materials) ? row.materials : [],
      estimate: Array.isArray(row.estimate) ? row.estimate : [],
      designSlug: row.slug ?? "",
    };
  },
};

// ── Лид платной утилиты в существующий поток (Requirements 13.1–13.4, 20.1) ──

/**
 * `marketplace_context` лида AI-утилиты. Кладётся в существующую jsonb-колонку
 * `leads.marketplace_context` — новых колонок не заводим (Requirement 20.1).
 * `priority='hot'` — приоритетный сигнал намерения для CRM (Requirement 13.4).
 */
export interface AiUtilityMarketplaceContext {
  areaM2: number;
  style: string;
  /** Id сформированного Design_Estimate (строки `designs`). */
  estimateId: number | null;
  priority: typeof AI_UTILITY_LEAD_PRIORITY;
}

/** Параметры для сборки лида утилиты (собранные утилитой + результат пайплайна). */
export interface AiUtilityLeadParams {
  /** Нормализованный телефон уровня 2 (`+7XXXXXXXXXX`). */
  phone: string;
  areaM2: number;
  style: string;
  /** Id Design_Estimate (строки `designs`); также кладётся в `leads.design_id`. */
  estimateId?: number | null;
  /** Переопределения дефолтов необязательных обязательных полей `leads`. */
  clientName?: string;
  city?: string;
  district?: string;
  serviceType?: string;
}

/**
 * Значения для вставки лида AI-утилиты в существующую таблицу `leads`.
 * Тип — `leadsTable.$inferInsert`, чтобы соблюсти контракт схемы (Requirement 20.1).
 */
export type AiUtilityLeadValues = typeof leadsTable.$inferInsert;

/**
 * DB-free-тестируемый шов (Requirement 13.1–13.4, 20.1): ЧИСТАЯ функция, которая
 * по собранным утилитой параметрам возвращает значения для вставки в
 * существующую таблицу `leads`. Не обращается к БД/сети — детерминирована.
 *
 *   • `source = 'ai_utility'` — признак источника платной утилиты (R13.1, R20.1);
 *   • `marketplace_context = { areaM2, style, estimateId, priority:'hot' }` —
 *     параметры утилиты + ссылка на Design_Estimate + приоритетный сигнал
 *     намерения (R13.2, R13.4);
 *   • `design_id` связывает лид с Design_Estimate (R13.2);
 *   • обязательные поля, которые утилита не собирает (`city`, `district`),
 *     заполняются безопасными дефолтами по конвенции routes/marketplace.ts.
 *
 * Дальнейшую обработку выполняет СУЩЕСТВУЮЩИЙ Dispatch_Flow без изменения
 * backend-логики заказов (R13.3, R20.2) — здесь мы только создаём лид.
 */
export function buildAiUtilityLead(
  params: AiUtilityLeadParams,
): AiUtilityLeadValues {
  const estimateId = params.estimateId ?? null;
  const marketplaceContext: AiUtilityMarketplaceContext = {
    areaM2: params.areaM2,
    style: params.style,
    estimateId,
    priority: AI_UTILITY_LEAD_PRIORITY,
  };

  return {
    clientName: params.clientName ?? DEFAULT_UTILITY_CLIENT_NAME,
    clientPhone: params.phone,
    // `city`/`district` — NOT NULL в схеме; утилита их не спрашивает
    // (Requirement 12.2). Пустая строка сохраняет работу существующих CRM-фильтров
    // (та же конвенция, что и routes/marketplace.ts для district).
    city: params.city ?? "",
    district: params.district ?? "",
    serviceType: params.serviceType ?? DEFAULT_UTILITY_SERVICE_TYPE,
    area: params.areaM2.toFixed(2),
    source: AI_UTILITY_LEAD_SOURCE,
    status: "new",
    paymentModel: "commission",
    sourcePageType: "ai_utility",
    marketplaceContext,
    designId: estimateId,
  };
}

/**
 * Инъектируемый шов создания лида. По умолчанию пишет в СУЩЕСТВУЮЩУЮ таблицу
 * `leads` (Requirement 20.1). Тесты подставляют фейковую реализацию, чтобы не
 * ходить в БД.
 */
export interface LeadCreator {
  create(values: AiUtilityLeadValues): Promise<{ leadId: number }>;
}

/** Реализация поверх реальной таблицы `leads` (никакого параллельного пути, R20.1/R20.2). */
export const leadsTableLeadCreator: LeadCreator = {
  async create(values) {
    const [row] = await db
      .insert(leadsTable)
      .values(values)
      .returning({ id: leadsTable.id });
    if (!row) {
      throw new Error("ai-design-utility: failed to insert lead row");
    }
    return { leadId: row.id };
  },
};

// ── Валидация входных параметров (до оплаты, Requirement 12.2) ────────────────
/** Метраж должен быть конечным положительным числом. */
function isValidArea(areaM2: unknown): areaM2 is number {
  return typeof areaM2 === "number" && Number.isFinite(areaM2) && areaM2 > 0;
}

/** Стиль — непустая строка (whitelist проверяет существующий пайплайн/форма). */
function isValidStyle(style: unknown): style is string {
  return typeof style === "string" && style.trim().length > 0;
}

/**
 * ГЕЙТ «оплата → генерация» (Requirement 12.5).
 *
 * Чистая функция без побочных эффектов: генерация Design_Estimate допустима
 * ТОГДА И ТОЛЬКО ТОГДА, когда оплата 100 ₽ подтверждена. Черновик (draft) может
 * существовать до оплаты, но реальный запуск пайплайна — нет.
 */
export function canGenerate(session: Pick<AiDesignSession, "paymentConfirmed">): boolean {
  return session.paymentConfirmed === true;
}

/** Пустой черновик Design_Estimate (Requirement 12.4). */
function draftEstimate(session: AiDesignSession): DesignEstimate {
  const view: DesignEstimate = {
    status: "draft",
    visualizations: [],
    materials: [],
    estimate: [],
  };
  if (session.designId !== null) view.designId = session.designId;
  if (session.designSlug !== null) view.designSlug = session.designSlug;
  return view;
}

/**
 * Оркестратор AI_Design_Utility. Инкапсулирует хранилище сессий и адаптер к
 * существующему пайплайну; оба инъектируемы (по умолчанию — in-memory + реальная
 * таблица `designs`).
 */
export class AiDesignUtility {
  private readonly store: SessionStore;
  private readonly pipeline: AiDesignPipeline;
  private readonly leadCreator: LeadCreator;

  constructor(deps?: {
    store?: SessionStore;
    pipeline?: AiDesignPipeline;
    leadCreator?: LeadCreator;
  }) {
    this.store = deps?.store ?? new InMemorySessionStore();
    this.pipeline = deps?.pipeline ?? designsTablePipeline;
    this.leadCreator = deps?.leadCreator ?? leadsTableLeadCreator;
  }

  /**
   * Шаг 1 (Requirement 12.2): собрать параметры (метраж, стиль) и проверить
   * контекст уровня 2 (телефон + Captcha) ДО оплаты. Генерация здесь НЕ
   * запускается — создаётся черновая сессия с `paymentConfirmed=false`.
   */
  async startSession(input: {
    areaM2: number;
    style: string;
    phone: string;
    captchaToken: string;
    remoteIp?: string | null;
  }): Promise<StartSessionResult> {
    // Параметры утилиты (Requirement 12.2).
    if (!isValidArea(input.areaM2)) {
      return { ok: false, reason: "area_invalid", retry: false };
    }
    if (!isValidStyle(input.style)) {
      return { ok: false, reason: "style_invalid", retry: false };
    }

    // Уровень 2: телефон + Captcha (переиспользуем communityAuth, Task 8.2).
    const gate = await verifyLeadContext({
      phone: input.phone,
      captchaToken: input.captchaToken,
      remoteIp: input.remoteIp ?? null,
    });
    if (!gate.ok) {
      return { ok: false, reason: gate.reason, retry: gate.retry };
    }

    const session: AiDesignSession = {
      id: randomUUID(),
      areaM2: input.areaM2,
      style: input.style.trim(),
      phone: gate.phone,
      paymentConfirmed: false,
      designId: null,
      designSlug: null,
      leadId: null,
      createdAt: new Date(),
    };
    this.store.set(session);
    return { ok: true, sessionId: session.id, session };
  }

  /**
   * Шаг 2 (Requirements 12.3, 20.3): вызывается ТОЛЬКО после подтверждения
   * оплаты 100 ₽. Помечает сессию оплаченной и — при прохождении гейта
   * `canGenerate` — запускает существующий пайплайн (idempotent: повторный вызов
   * не порождает второй дизайн).
   */
  async onPaymentConfirmed(sessionId: string): Promise<PaymentConfirmedResult> {
    const session = this.store.get(sessionId);
    if (!session) return { ok: false, reason: "session_not_found" };

    // Подтверждение оплаты открывает гейт генерации (Requirement 12.5).
    session.paymentConfirmed = true;

    // Idempotency: если генерация уже запущена — возвращаем существующие id.
    if (session.designId !== null && session.designSlug !== null) {
      this.store.set(session);
      return {
        ok: true,
        sessionId: session.id,
        designId: session.designId,
        designSlug: session.designSlug,
        leadId: session.leadId,
      };
    }

    // Гейт: генерируем ТОЛЬКО при подтверждённой оплате (Requirement 12.5).
    // После установки paymentConfirmed=true он всегда открыт — держим проверку
    // явной, чтобы гарантия «нет оплаты → нет генерации» была локальной.
    if (!canGenerate(session)) {
      this.store.set(session);
      return { ok: false, reason: "session_not_found" };
    }

    const { designId, designSlug } = await this.pipeline.enqueue({
      areaM2: session.areaM2,
      style: session.style,
      roomType: DEFAULT_UTILITY_ROOM_TYPE,
    });
    session.designId = designId;
    session.designSlug = designSlug;

    // Лид платной утилиты в СУЩЕСТВУЮЩИЙ поток (Requirements 13.1–13.4, 20.1).
    // Сборка значений — чистая (`buildAiUtilityLead`), запись — через инъектируемый
    // шов. Сбой записи в CRM не должен «терять» уже оплаченную генерацию: логируем
    // и продолжаем (лид можно досоздать), поэтому оборачиваем в try/catch.
    if (session.leadId === null) {
      try {
        const { leadId } = await this.leadCreator.create(
          buildAiUtilityLead({
            phone: session.phone,
            areaM2: session.areaM2,
            style: session.style,
            estimateId: designId,
          }),
        );
        session.leadId = leadId;
      } catch (err) {
        console.error(
          "[ai-design-utility] failed to create utility lead:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    this.store.set(session);

    return {
      ok: true,
      sessionId: session.id,
      designId,
      designSlug,
      leadId: session.leadId,
    };
  }

  /**
   * Шаг 3 (Requirements 12.4, 12.6): вернуть Design_Estimate.
   *   - сессии нет → `null`;
   *   - генерация завершена → `status='generated'` с визуализациями и сметой;
   *   - иначе (до оплаты или пока идёт генерация) → черновик `status='draft'`
   *     (Requirement 12.4 — черновик может существовать до оплаты).
   */
  async getEstimate(sessionId: string): Promise<DesignEstimate | null> {
    const session = this.store.get(sessionId);
    if (!session) return null;

    // Без подтверждённой оплаты генерация не запускалась — только черновик
    // (Requirement 12.5). Явно не читаем пайплайн.
    if (!canGenerate(session) || session.designId === null) {
      return draftEstimate(session);
    }

    const produced = await this.pipeline.fetchProduced(session.designId);
    if (!produced) {
      // Оплата есть, но пайплайн ещё не завершил — отдаём черновик.
      return draftEstimate(session);
    }

    return {
      status: "generated",
      visualizations: produced.visualizations,
      materials: produced.materials,
      estimate: produced.estimate,
      designSlug: produced.designSlug,
      designId: session.designId,
    };
  }
}

/**
 * Готовый синглтон для роут-слоя (Task 9.5): in-memory сессии + реальный
 * пайплайн `designs`. Тесты создают собственный экземпляр с инъекциями.
 */
export const aiDesignUtility = new AiDesignUtility();
