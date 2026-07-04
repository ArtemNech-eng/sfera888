/**
 * Property test for `communityNotifications.ts` (Notification_Service — каскад
 * каналов доставки уведомлений гео-сообщества «ХочуТакже»).
 *
 * Property 10: выбранный канал доставки ОДНОЗНАЧНО определяется парой
 *              (maxConnected, important) согласно каскаду Max → Web_Push → SMS.
 *
 * **Validates: Requirements 15.1, 15.2, 15.3 (Property 10)**
 *
 * Module under test (`src/lib/communityNotifications.ts`):
 *   - `selectChannel({ maxConnected, important }): NotificationChannel`
 *     — чистая детерминированная функция решения канала (без БД/сети).
 *
 * Таблица решений (мирроринг реализации):
 *
 *   | maxConnected | important | channel   | Requirement |
 *   | ------------ | --------- | --------- | ----------- |
 *   | true         | *         | max       | R15.1       |
 *   | false        | true      | sms       | R15.3       |
 *   | false        | false     | web_push  | R15.2       |
 *
 * Свойства, проверяемые здесь:
 *   10.1 (детерминизм) — для ЛЮБОЙ пары (maxConnected, important) повторные
 *        вызовы `selectChannel` дают одинаковый результат (referential
 *        transparency): один и тот же вход → один и тот же выход.
 *   10.2 (тотальность + таблица) — `selectChannel` определён на всех 4-х
 *        комбинациях булевых входов и в точности воспроизводит таблицу
 *        решений (R15.1/R15.2/R15.3); результат всегда ∈ {max, web_push, sms}.
 *   10.3 (приоритет Max) — при `maxConnected === true` канал всегда `'max'`
 *        НЕЗАВИСИМО от значения `important`.
 *
 * Run via Node's built-in test runner:
 *   npx tsx --test ./__tests__/community/notify-channel.property.test.ts
 */

// `communityNotifications.ts` статически импортирует `../maxBot.js` и
// `./clientPush.js`, которые транзитивно могут тянуть `@workspace/db` и бросать
// исключение на этапе загрузки модуля, если `DATABASE_URL` не задан. pg.Pool не
// подключается лениво, поэтому фиктивной строки достаточно — ни одно свойство в
// этом файле не выполняет реальных запросов (`selectChannel` чист и не трогает
// БД/сеть).
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// Динамический импорт с `.js`-расширением: гарантирует, что присваивание
// `DATABASE_URL` выше выполнится ДО загрузки транзитивных зависимостей.
const communityNotifications = await import("../../src/lib/communityNotifications.js");
const { selectChannel } = communityNotifications;
type NotificationChannel = import("../../src/lib/communityNotifications.js").NotificationChannel;

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Полное пространство входов: пара булевых (maxConnected, important). */
const decisionInputArb = fc.record({
  maxConnected: fc.boolean(),
  important: fc.boolean(),
});

const ALL_CHANNELS: readonly NotificationChannel[] = ["max", "web_push", "sms"];

/** Эталонная таблица решений, независимая от реализации под тестом. */
function expectedChannel(maxConnected: boolean, important: boolean): NotificationChannel {
  if (maxConnected) return "max"; // R15.1 — Max имеет приоритет всегда
  if (important) return "sms"; // R15.3 — важное без Max → SMS
  return "web_push"; // R15.2 — обычное без Max → Web_Push
}

// ─── Property 10.1 — детерминизм (referential transparency) ─────────────────────

describe("communityNotifications — Property 10.1: selectChannel детерминистичен", () => {
  // Validates: Requirements 15.1, 15.2, 15.3 (Property 10)

  it("один и тот же вход → один и тот же выход (повторный вызов равен первому)", () => {
    fc.assert(
      fc.property(decisionInputArb, (input) => {
        const first = selectChannel(input);
        const second = selectChannel(input);
        assert.equal(
          first,
          second,
          `selectChannel недетерминистичен для ${JSON.stringify(input)}: ${first} !== ${second}`,
        );
      }),
      { numRuns: 300 },
    );
  });

  it("результат не зависит от порядка/повторов вызовов (стабилен при многократном вызове)", () => {
    fc.assert(
      fc.property(decisionInputArb, fc.integer({ min: 2, max: 10 }), (input, times) => {
        const results = Array.from({ length: times }, () => selectChannel(input));
        assert.equal(
          new Set(results).size,
          1,
          `selectChannel вернул разные значения при ${times} вызовах для ${JSON.stringify(input)}: ${JSON.stringify(results)}`,
        );
      }),
      { numRuns: 200 },
    );
  });
});

// ─── Property 10.2 — тотальность + соответствие таблице решений ─────────────────

describe("communityNotifications — Property 10.2: тотальность и таблица решений", () => {
  // Validates: Requirements 15.1, 15.2, 15.3 (Property 10)

  it("для ЛЮБОЙ пары (maxConnected, important) результат ∈ {max, web_push, sms}", () => {
    fc.assert(
      fc.property(decisionInputArb, (input) => {
        const channel = selectChannel(input);
        assert.ok(
          ALL_CHANNELS.includes(channel),
          `selectChannel(${JSON.stringify(input)}) вернул неизвестный канал: ${JSON.stringify(channel)}`,
        );
      }),
      { numRuns: 300 },
    );
  });

  it("результат в точности воспроизводит таблицу решений (R15.1/R15.2/R15.3)", () => {
    fc.assert(
      fc.property(decisionInputArb, ({ maxConnected, important }) => {
        assert.equal(
          selectChannel({ maxConnected, important }),
          expectedChannel(maxConnected, important),
          `selectChannel нарушил таблицу решений для (maxConnected=${maxConnected}, important=${important})`,
        );
      }),
      { numRuns: 300 },
    );
  });

  it("тотальность: все 4 комбинации булевых входов определены и однозначны", () => {
    const cases: Array<{ maxConnected: boolean; important: boolean; channel: NotificationChannel }> = [
      { maxConnected: true, important: true, channel: "max" }, // R15.1
      { maxConnected: true, important: false, channel: "max" }, // R15.1
      { maxConnected: false, important: true, channel: "sms" }, // R15.3
      { maxConnected: false, important: false, channel: "web_push" }, // R15.2
    ];
    for (const { maxConnected, important, channel } of cases) {
      assert.equal(
        selectChannel({ maxConnected, important }),
        channel,
        `Ожидался канал '${channel}' для (maxConnected=${maxConnected}, important=${important})`,
      );
    }
  });
});

// ─── Property 10.3 — приоритет Max над важностью события ─────────────────────────

describe("communityNotifications — Property 10.3: Max имеет приоритет всегда", () => {
  // Validates: Requirements 15.1, 15.2, 15.3 (Property 10)

  it("maxConnected === true ⇒ канал 'max' НЕЗАВИСИМО от important", () => {
    fc.assert(
      fc.property(fc.boolean(), (important) => {
        assert.equal(
          selectChannel({ maxConnected: true, important }),
          "max",
          `Max подключён, но канал != 'max' при important=${important}`,
        );
      }),
      { numRuns: 100 },
    );
  });

  it("важность влияет на выбор ТОЛЬКО когда Max не подключён", () => {
    fc.assert(
      fc.property(fc.boolean(), (important) => {
        // Max подключён → важность игнорируется.
        assert.equal(selectChannel({ maxConnected: true, important }), "max");
        // Max не подключён → важность определяет sms vs web_push.
        assert.equal(
          selectChannel({ maxConnected: false, important }),
          important ? "sms" : "web_push",
        );
      }),
      { numRuns: 100 },
    );
  });
});
