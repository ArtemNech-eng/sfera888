/**
 * Property test: деньги и SEO НЕ зависят от Max_Bot.
 *
 * Property 7: ни оставление лида, ни оплата, ни индексация контента не
 *             отклоняются по причине недоступности Max_Bot; отказ по этой
 *             причине не возникает никогда. На уровне Notification_Service это
 *             выражается двумя проверяемыми инвариантами:
 *
 *   (A) Выбор канала всегда тотален и имеет НЕ-Max fallback: для любой пары
 *       (maxConnected, important) `selectChannel` возвращает валидный канал, а
 *       при `maxConnected = false` — НИКОГДА `max` (всегда Web_Push или SMS).
 *       Значит доставка уведомления никогда не «висит» на Max.
 *   (B) `notify()` НИКОГДА не бросает исключение наружу: сбой/недоступность
 *       любого канала (в т.ч. Max) проглатывается и возвращается структурой
 *       `NotifyResult`. Поэтому lead/payment/indexing-потоки, зовущие `notify`
 *       в режиме fire-and-forget, не могут быть заблокированы недоступностью
 *       Max_Bot.
 *
 * **Validates: Requirements 10.4, 15.4 (Property 7)**
 *
 * Модуль под тестом (`src/lib/communityNotifications.ts`):
 *   - `selectChannel({ maxConnected, important })` — чистая функция решения;
 *   - `isMaxConnected(recipient)` — трактовка `max_user_id`;
 *   - `notify(recipient, event)` — доставка, безопасная к сбоям (не бросает);
 *   - `sendSms(...)` — заглушка провайдера (без сети, никогда не бросает).
 *
 * Тест DB/сеть-free: поведенческая часть (B) прогоняется по SMS-ветке, которая
 * при отсутствии `SMS_PROVIDER_API_KEY` не выполняет сетевых вызовов и не
 * бросает. Env выставляется ДО динамического импорта (pg.Pool ленив).
 *
 * Run via Node's built-in test runner:
 *   npx tsx --test ./__tests__/community/max-independence.property.test.ts
 */

process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";
// Гарантируем сетебезопасную SMS-ветку: без ключа провайдера `sendSms` —
// заглушка, которая возвращает false, не делая внешних вызовов и не бросая.
delete process.env["SMS_PROVIDER_API_KEY"];

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

const { selectChannel, isMaxConnected, notify, sendSms } = await import(
  "../../src/lib/communityNotifications.js"
);

const ALL_CHANNELS = new Set(["max", "web_push", "sms"]);

// ─── Property 7A — тотальность и Max-независимость выбора канала ──────────────

describe("max-independence Property 7A: выбор канала тотален и имеет не-Max fallback", () => {
  // Validates: Requirements 10.4, 15.4 (Property 7)

  it("для любой пары (maxConnected, important) selectChannel возвращает валидный канал", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (maxConnected, important) => {
        const channel = selectChannel({ maxConnected, important });
        assert.ok(ALL_CHANNELS.has(channel), `неизвестный канал: ${channel}`);
      }),
      { numRuns: 200 },
    );
  });

  it("Max НЕ подключён ⇒ канал никогда не 'max' — всегда доступен fallback (R15.4)", () => {
    fc.assert(
      fc.property(fc.boolean(), (important) => {
        const channel = selectChannel({ maxConnected: false, important });
        assert.notEqual(channel, "max", "при недоступном Max нельзя выбирать канал max");
        assert.ok(channel === "web_push" || channel === "sms");
      }),
      { numRuns: 100 },
    );
  });

  it("выбор канала не зависит от Max при его отсутствии: важное→sms, обычное→web_push", () => {
    fc.assert(
      fc.property(fc.boolean(), (important) => {
        const channel = selectChannel({ maxConnected: false, important });
        assert.equal(channel, important ? "sms" : "web_push");
      }),
      { numRuns: 100 },
    );
  });
});

// ─── isMaxConnected — пустой/нулевой max_user_id ⇒ не подключён ───────────────

describe("max-independence: isMaxConnected трактует пустой id как «нет Max»", () => {
  // Validates: Requirements 15.4 (Property 7)

  it("пустая строка / пробелы / null / undefined / 0 ⇒ не подключён", () => {
    const notConnected = ["", "   ", null, undefined, 0];
    fc.assert(
      fc.property(fc.constantFrom(...notConnected), (id) => {
        assert.equal(isMaxConnected({ phone: "+79990000000", maxUserId: id as any }), false);
      }),
      { numRuns: 50 },
    );
  });

  it("непустой строковый или ненулевой числовой id ⇒ подключён", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ minLength: 1, maxLength: 32 }).filter((s) => s.trim().length > 0),
          fc.integer({ min: 1, max: 10_000_000 }),
        ),
        (id) => {
          assert.equal(isMaxConnected({ phone: "+79990000000", maxUserId: id }), true);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ─── Property 7B — notify() никогда не бросает (fire-and-forget безопасен) ────

describe("max-independence Property 7B: notify() никогда не блокирует вызывающий поток", () => {
  // Validates: Requirements 10.4, 15.4 (Property 7)

  // Получатель без Max — доставка идёт по не-Max fallback. Для важных событий
  // это SMS-ветка, сетебезопасная при отсутствующем провайдере.
  const recipientArb = fc.record({
    phone: fc.string({ minLength: 3, maxLength: 20 }),
    maxUserId: fc.constantFrom<null | undefined | "">(null, undefined, ""),
  });

  const importantEventArb = fc.record({
    title: fc.option(fc.string({ maxLength: 40 }), { nil: undefined }),
    body: fc.string({ minLength: 1, maxLength: 200 }),
    important: fc.constant(true),
  });

  it("важное событие без Max: notify резолвится (не бросает) и выбирает не-Max канал", async () => {
    await fc.assert(
      fc.asyncProperty(recipientArb, importantEventArb, async (recipient, event) => {
        // Ключевая гарантия R15.4: вызов не должен бросать — оборачиваем и
        // проверяем, что промис резолвится структурой NotifyResult.
        const result = await notify(recipient as any, event as any);
        assert.ok(result, "notify должен вернуть результат, а не бросить");
        // Max недоступен ⇒ канал доставки — не 'max' (независимость от Max).
        assert.notEqual(result.channel, "max");
        assert.equal(result.channel, "sms");
        // Флаг доставки булев; сам факт «не доставлено» не эквивалентен ошибке
        // вызывающего потока — поток не блокируется (R15.4).
        assert.equal(typeof result.delivered, "boolean");
      }),
      { numRuns: 150 },
    );
  });

  it("sendSms-заглушка без провайдера возвращает false и НИКОГДА не бросает", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 3, maxLength: 20 }),
        fc.string({ maxLength: 200 }),
        async (phone, text) => {
          const ok = await sendSms(phone, text);
          assert.equal(ok, false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
