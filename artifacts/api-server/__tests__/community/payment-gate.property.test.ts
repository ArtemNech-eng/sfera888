/**
 * Property test for `aiDesignUtility.ts` (AI_Design_Utility — платный гейт
 * «оплата → генерация» гео-сообщества «ХочуТакже»).
 *
 * Property 8: Design_Estimate со статусом `generated` существует ТОГДА И ТОЛЬКО
 *             ТОГДА, когда оплата 100 ₽ подтверждена (и существующий пайплайн
 *             произвёл результат).
 *
 * **Validates: Requirements 12.3, 12.5 (Property 8)**
 *
 * Модуль под тестом (`src/lib/aiDesignUtility.ts`):
 *   - `AiDesignUtility.startSession/onPaymentConfirmed/getEstimate` —
 *     оркестрация поверх существующего пайплайна `designs`;
 *   - `canGenerate(session)` — чистый гейт «оплата → генерация».
 *
 * Проверяем чистую логику переходов состояний БЕЗ реального платежа/AI/БД:
 * пайплайн и хранилище сессий инъектируются (детерминированный фейк).
 *
 * Смысловое ядро Property 8 (мирроринг реализации `getEstimate`):
 *
 *   getEstimate(session).status === 'generated'
 *     ⟺  session.paymentConfirmed === true            // оплата подтверждена (R12.5)
 *        ∧ пайплайн запущен (designId !== null)        // запуск после оплаты (R12.3)
 *        ∧ пайплайн уже произвёл результат
 *
 * Так как `onPaymentConfirmed` запускает пайплайн ровно при подтверждении
 * оплаты, «запущен» ⟺ «оплачен». Отсюда две стороны би-импликации:
 *   - НЕОБХОДИМОСТЬ (R12.5): status='generated' ⟹ оплата подтверждена
 *     (ни одна неоплаченная сессия никогда не даёт `generated`);
 *   - ДОСТАТОЧНОСТЬ (R12.3): оплата подтверждена ∧ пайплайн произвёл результат
 *     ⟹ status='generated'.
 *
 * Run via Node's built-in test runner:
 *   npx tsx --test ./__tests__/community/payment-gate.property.test.ts
 */

// `@workspace/db` бросает на этапе загрузки модуля, если не задан DATABASE_URL.
// Модуль под тестом импортирует `db` (для дефолтного пайплайна), но тесты
// инъектируют фейковый пайплайн и in-memory-хранилище — ни один реальный запрос
// не выполняется (pg.Pool ленив). Env выставляем ДО динамического импорта.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import type {
  AiDesignPipeline,
  AiDesignSession,
  EstimateVisualization,
} from "../../src/lib/aiDesignUtility.js";
import type { DesignMaterial, DesignEstimateItem } from "@workspace/db";

// Динамический импорт с `.js`-расширением: гарантирует, что присваивание
// `DATABASE_URL` выше выполнится ДО загрузки транзитивных зависимостей.
const { AiDesignUtility, canGenerate, InMemorySessionStore } = await import(
  "../../src/lib/aiDesignUtility.js"
);

// ─── Управляемый фейковый пайплайн ──────────────────────────────────────────
// `produce` мутируем во время сценария: моделирует «пайплайн ещё считает» vs
// «пайплайн завершил и результат готов». `enqueueCalls` — счётчик запусков
// (для проверки, что генерация не стартует без оплаты).

const READY_VISUALIZATIONS: EstimateVisualization[] = [
  { url: "https://r2/v1.jpg", label: "Общий вид", position: 1 },
];
const READY_MATERIALS: DesignMaterial[] = [{ category: "Пол", description: "Ламинат" }];
const READY_ESTIMATE: DesignEstimateItem[] = [{ category: "Отделка", amountKopeks: 5_500_000 }];

function makeControllablePipeline(initialProduce: boolean) {
  const state = { produce: initialProduce, enqueueCalls: 0 };
  const pipeline: AiDesignPipeline = {
    async enqueue() {
      state.enqueueCalls += 1;
      return { designId: 100 + state.enqueueCalls, designSlug: "apartment-modern" };
    },
    async fetchProduced() {
      if (!state.produce) return null;
      return {
        visualizations: READY_VISUALIZATIONS,
        materials: READY_MATERIALS,
        estimate: READY_ESTIMATE,
        designSlug: "apartment-modern",
      };
    },
  };
  return { pipeline, state };
}

/** Свежая сессия «параметры собраны до оплаты» (обходит captcha, как в unit-тестах). */
function seedDraftSession(): AiDesignSession {
  return {
    id: "sess-" + Math.random().toString(36).slice(2),
    areaM2: 42,
    style: "modern",
    phone: "+79990000000",
    paymentConfirmed: false,
    designId: null,
    designSlug: null,
    leadId: null,
    createdAt: new Date(),
  };
}

// ─── Модель операций для стейтфул-свойства ──────────────────────────────────

type Op =
  | { kind: "pay" }
  | { kind: "setProduce"; value: boolean }
  | { kind: "get" };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.constant<Op>({ kind: "pay" }),
  fc.record({ kind: fc.constant<"setProduce">("setProduce"), value: fc.boolean() }),
  fc.constant<Op>({ kind: "get" }),
);

// ─── Property 8 (би-импликация) — стейтфул-свойство над произвольной последовательностью ─

describe("aiDesignUtility — Property 8: generated ⟺ оплата подтверждена", () => {
  // Validates: Requirements 12.3, 12.5 (Property 8)

  it("для ЛЮБОЙ последовательности операций status='generated' ⟺ (оплата подтверждена ∧ пайплайн произвёл результат)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(), // начальное состояние готовности пайплайна
        fc.array(opArb, { minLength: 1, maxLength: 20 }),
        async (initialProduce, ops) => {
          const { pipeline, state } = makeControllablePipeline(initialProduce);
          const store = new InMemorySessionStore();
          const util = new AiDesignUtility({ store, pipeline });

          const session = seedDraftSession();
          store.set(session);

          // Теневая модель ожидаемого состояния.
          let paid = false; // была ли подтверждена оплата (onPaymentConfirmed)

          for (const op of ops) {
            if (op.kind === "pay") {
              const res = await util.onPaymentConfirmed(session.id);
              assert.equal(res.ok, true, "onPaymentConfirmed существующей сессии должен успешно проходить");
              paid = true;
            } else if (op.kind === "setProduce") {
              state.produce = op.value;
            } else {
              const est = await util.getEstimate(session.id);
              assert.ok(est, "сессия существует → getEstimate не null");

              // НЕОБХОДИМОСТЬ (R12.5): без оплаты не бывает 'generated'.
              if (!paid) {
                assert.equal(
                  est.status,
                  "draft",
                  `неоплаченная сессия дала status='${est.status}' — нарушен гейт R12.5`,
                );
              }

              // Точная би-импликация: 'generated' ⟺ (оплачено ∧ пайплайн готов).
              const expected = paid && state.produce ? "generated" : "draft";
              assert.equal(
                est.status,
                expected,
                `ожидался status='${expected}' при (paid=${paid}, produce=${state.produce}), получен '${est.status}'`,
              );

              // Инвариант направления: generated ⟹ оплачено (R12.5).
              if (est.status === "generated") {
                assert.equal(paid, true, "status='generated' без подтверждённой оплаты — нарушение R12.5");
              }
            }
          }

          // Без единого 'pay' пайплайн НИКОГДА не запускался (R12.5).
          if (!paid) {
            assert.equal(state.enqueueCalls, 0, "генерация запускалась без подтверждённой оплаты — нарушение R12.5");
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  // ─── Необходимость (R12.5): неоплаченная сессия → только draft, генерация не запускается ─

  it("НЕОБХОДИМОСТЬ (R12.5): без оплаты getEstimate=draft и пайплайн не запускается, даже если пайплайн «готов»", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (produceReady) => {
        const { pipeline, state } = makeControllablePipeline(produceReady);
        const store = new InMemorySessionStore();
        const util = new AiDesignUtility({ store, pipeline });

        const session = seedDraftSession();
        store.set(session);
        assert.equal(canGenerate(session), false, "неоплаченная сессия не должна проходить гейт");

        const est = await util.getEstimate(session.id);
        assert.ok(est);
        assert.equal(est.status, "draft");
        assert.deepEqual(est.visualizations, []);
        assert.deepEqual(est.estimate, []);
        assert.equal(state.enqueueCalls, 0, "генерация не должна запускаться без оплаты");
      }),
      { numRuns: 200 },
    );
  });

  // ─── Достаточность (R12.3): оплата подтверждена ∧ пайплайн готов → generated ─

  it("ДОСТАТОЧНОСТЬ (R12.3): подтверждённая оплата + готовый пайплайн ⟹ status='generated' со сметой", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 1, max: 500, noNaN: true, noDefaultInfinity: true }),
        fc.constantFrom("modern", "loft", "scandinavian", "classic"),
        async (areaM2, style) => {
          const { pipeline, state } = makeControllablePipeline(true);
          const store = new InMemorySessionStore();
          const util = new AiDesignUtility({ store, pipeline });

          const session: AiDesignSession = { ...seedDraftSession(), areaM2, style };
          store.set(session);

          const pay = await util.onPaymentConfirmed(session.id);
          assert.equal(pay.ok, true);
          assert.equal(state.enqueueCalls, 1, "оплата должна запустить пайплайн ровно один раз");

          const est = await util.getEstimate(session.id);
          assert.ok(est);
          assert.equal(est.status, "generated", "оплачено + пайплайн готов ⟹ generated (R12.3)");
          assert.ok(est.visualizations.length > 0, "generated несёт визуализации (R12.4)");
          assert.ok(est.estimate.length > 0, "generated несёт смету (R12.6)");
        },
      ),
      { numRuns: 200 },
    );
  });

  // ─── Каноническая пара точек истины гейта `canGenerate` (R12.5) ─────────────

  it("гейт canGenerate: paymentConfirmed ⟺ разрешение на генерацию", () => {
    fc.assert(
      fc.property(fc.boolean(), (paymentConfirmed) => {
        assert.equal(canGenerate({ paymentConfirmed }), paymentConfirmed);
      }),
      { numRuns: 50 },
    );
  });
});
