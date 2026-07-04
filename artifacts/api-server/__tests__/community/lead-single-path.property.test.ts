/**
 * Property test for the single-path lead invariant of the AI_Design_Utility.
 *
 * Property 9: каждый лид, порождённый платформой, попадает в СУЩЕСТВУЮЩУЮ
 *             таблицу `leads` ровно одним путём (через инъектируемый
 *             `LeadCreator` → `leadsTable`); параллельных путей создания
 *             заказов/лидов не существует, а повторные подтверждения оплаты
 *             одной сессии не порождают дублей.
 *
 * **Validates: Requirements 20.1, 20.2 (Property 9)**
 *   • 20.1 — все лиды создаются через существующий Lead_Service / таблицу
 *     `leads` с признаком источника (`source = AI_UTILITY_LEAD_SOURCE`);
 *   • 20.2 — обработка идёт существующим Dispatch_Flow без параллельной
 *     backend-логики: на уровне утилиты это значит «ровно один лид на
 *     оплаченную сессию, созданный единственным швом `LeadCreator.create`».
 *
 * Модуль под тестом (`src/lib/aiDesignUtility.ts`):
 *   - `buildAiUtilityLead(params)` — чистая сборка значений вставки в `leads`;
 *   - `AiDesignUtility.onPaymentConfirmed(sessionId)` — оркестрация, создающая
 *     лид через единственный инъектируемый `LeadCreator`;
 *   - константа `AI_UTILITY_LEAD_SOURCE` — признак источника.
 *
 * Тест чистый и DB-free: `LeadCreator` подменяется in-memory-реализацией,
 * которая ЗАПИСЫВАЕТ все вставки; ни один реальный запрос не выполняется.
 * Env `DATABASE_URL` выставляется ДО динамического импорта (см. остальные
 * community-тесты) — pg.Pool ленив.
 *
 * Run via Node's built-in test runner:
 *   npx tsx --test ./__tests__/community/lead-single-path.property.test.ts
 */

process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import type {
  AiDesignSession,
  LeadCreator,
  AiUtilityLeadValues,
} from "../../src/lib/aiDesignUtility.js";

// Динамический импорт с `.js`-расширением: гарантирует, что присваивание
// `DATABASE_URL` выше выполнится ДО загрузки транзитивных зависимостей.
const {
  AiDesignUtility,
  InMemorySessionStore,
  buildAiUtilityLead,
  AI_UTILITY_LEAD_SOURCE,
} = await import("../../src/lib/aiDesignUtility.js");

// ─── Тестовые дублёры ────────────────────────────────────────────────────────

/**
 * In-memory `LeadCreator`, регистрирующий КАЖДУЮ вставку лида. Это единственный
 * путь создания лида в утилите — счётчик и журнал позволяют доказать, что
 * параллельных путей нет и дубликатов не возникает.
 */
function makeRecordingLeadCreator() {
  const inserted: AiUtilityLeadValues[] = [];
  let nextId = 1;
  const leadCreator: LeadCreator = {
    async create(values) {
      inserted.push(values);
      return { leadId: nextId++ };
    },
  };
  return { leadCreator, inserted };
}

/** Управляемый фейковый пайплайн (генерация не влияет на путь лида). */
function makeFakePipeline() {
  let n = 0;
  return {
    async enqueue() {
      n += 1;
      return { designId: 1000 + n, designSlug: `design-${n}` };
    },
    async fetchProduced() {
      return null;
    },
  };
}

/** Свежая черновая сессия (параметры собраны до оплаты). */
function seedSession(id: string): AiDesignSession {
  return {
    id,
    areaM2: 40,
    style: "modern",
    phone: "+79990000000",
    paymentConfirmed: false,
    designId: null,
    designSlug: null,
    leadId: null,
    createdAt: new Date(),
  };
}

// ─── Property 9.1 — источник лида всегда AI_UTILITY_LEAD_SOURCE ───────────────

describe("lead single-path Property 9.1: buildAiUtilityLead всегда клеймит источник", () => {
  // Validates: Requirements 20.1 (Property 9)

  const paramsArb = fc.record({
    phone: fc.string({ minLength: 1, maxLength: 20 }),
    areaM2: fc.double({ min: 1, max: 1000, noNaN: true, noDefaultInfinity: true }),
    style: fc.constantFrom("modern", "loft", "scandinavian", "classic", "minimal"),
    estimateId: fc.option(fc.integer({ min: 1, max: 10_000 }), { nil: null }),
  });

  it("для любых параметров source === AI_UTILITY_LEAD_SOURCE и есть признак источника страницы", () => {
    fc.assert(
      fc.property(paramsArb, (params) => {
        const lead = buildAiUtilityLead(params);
        assert.equal(lead.source, AI_UTILITY_LEAD_SOURCE);
        assert.equal(lead.sourcePageType, "ai_utility");
        // Лид идёт в существующую модель `leads`: коммиссионная модель оплаты,
        // статус нового лида — как во всех прочих путях (Requirement 20.1/20.2).
        assert.equal(lead.paymentModel, "commission");
        assert.equal(lead.status, "new");
      }),
      { numRuns: 300 },
    );
  });

  it("marketplace_context несёт параметры утилиты и приоритетный сигнал намерения", () => {
    fc.assert(
      fc.property(paramsArb, (params) => {
        const lead = buildAiUtilityLead(params);
        const ctx = lead.marketplaceContext as {
          areaM2: number;
          style: string;
          estimateId: number | null;
          priority: string;
        };
        assert.equal(ctx.areaM2, params.areaM2);
        assert.equal(ctx.style, params.style);
        assert.equal(ctx.estimateId, params.estimateId ?? null);
        assert.equal(ctx.priority, "hot");
        // Ссылка на Design_Estimate дублируется в design_id (Requirement 13.2).
        assert.equal(lead.designId, params.estimateId ?? null);
      }),
      { numRuns: 300 },
    );
  });
});

// ─── Property 9.2 — единый путь: ровно один лид на оплаченную сессию ──────────

describe("lead single-path Property 9.2: единственный путь и отсутствие дублей", () => {
  // Validates: Requirements 20.1, 20.2 (Property 9)

  type Op = { kind: "pay" } | { kind: "get" };
  const opArb: fc.Arbitrary<Op> = fc.oneof(
    fc.constant<Op>({ kind: "pay" }),
    fc.constant<Op>({ kind: "get" }),
  );

  it("любая последовательность операций над одной сессией → не более одного лида, source единый", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(opArb, { minLength: 1, maxLength: 25 }), async (ops) => {
        const store = new InMemorySessionStore();
        const { leadCreator, inserted } = makeRecordingLeadCreator();
        const util = new AiDesignUtility({ store, pipeline: makeFakePipeline(), leadCreator });

        const session = seedSession("sess-single");
        store.set(session);

        let everPaid = false;
        for (const op of ops) {
          if (op.kind === "pay") {
            const res = await util.onPaymentConfirmed(session.id);
            assert.equal(res.ok, true);
            everPaid = true;
          } else {
            await util.getEstimate(session.id);
          }
        }

        // Ни один get/повторный pay не создаёт второй лид (idempotency, R20.2).
        assert.ok(
          inserted.length <= 1,
          `ожидалось ≤1 лида на сессию, получено ${inserted.length}`,
        );
        // Если оплата была хоть раз — ровно один лид создан; если нет — ноль.
        assert.equal(inserted.length, everPaid ? 1 : 0);

        // Каждый созданный лид прошёл через единый путь с единым источником.
        for (const lead of inserted) {
          assert.equal(lead.source, AI_UTILITY_LEAD_SOURCE);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("несколько независимых оплаченных сессий → ровно по одному лиду на каждую (единый путь)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 12 }),
        // Сколько раз повторно подтверждать оплату каждой сессии.
        fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 1, maxLength: 12 }),
        async (sessionCount, repeats) => {
          const store = new InMemorySessionStore();
          const { leadCreator, inserted } = makeRecordingLeadCreator();
          const util = new AiDesignUtility({
            store,
            pipeline: makeFakePipeline(),
            leadCreator,
          });

          const ids: string[] = [];
          for (let i = 0; i < sessionCount; i++) {
            const id = `sess-${i}`;
            ids.push(id);
            store.set(seedSession(id));
          }

          // Подтверждаем оплату каждой сессии как минимум один и, возможно,
          // несколько раз — путь всё равно должен оставаться единственным.
          for (let i = 0; i < ids.length; i++) {
            const times = repeats[i % repeats.length];
            for (let t = 0; t < times; t++) {
              const res = await util.onPaymentConfirmed(ids[i]);
              assert.equal(res.ok, true);
            }
          }

          // Ровно один лид на каждую оплаченную сессию — без параллельных путей
          // и без дубликатов от повторных подтверждений (Requirements 20.1, 20.2).
          assert.equal(inserted.length, sessionCount);
          assert.ok(inserted.every((l) => l.source === AI_UTILITY_LEAD_SOURCE));
        },
      ),
      { numRuns: 200 },
    );
  });

  it("без подтверждения оплаты лид НЕ создаётся (нет побочного пути)", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 8 }), async (getCount) => {
        const store = new InMemorySessionStore();
        const { leadCreator, inserted } = makeRecordingLeadCreator();
        const util = new AiDesignUtility({ store, pipeline: makeFakePipeline(), leadCreator });

        const session = seedSession("sess-unpaid");
        store.set(session);

        for (let i = 0; i < getCount; i++) {
          await util.getEstimate(session.id);
        }

        assert.equal(inserted.length, 0, "неоплаченная сессия не должна порождать лид");
      }),
      { numRuns: 150 },
    );
  });
});
