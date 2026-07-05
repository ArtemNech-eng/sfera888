/**
 * Property test P10 for `rateLimit.ts` → `createRateLimiter`.
 *
 * Property 10: Скользящий лимитер отклоняет сверх лимита без сайд-эффектов и
 * сбрасывается по окну.
 *
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
 *
 * Module under test (`src/lib/rateLimit.ts`):
 *   - `createRateLimiter({ windowMs, maxAttempts }) → (req, res, next)`
 *       In-memory скользящий лимитер по IP. Поведение (фиксировано в реализации):
 *         • первый запрос IP (или запрос после истечения окна) заводит запись
 *           `{ count: 1, resetAt: now + windowMs }` и вызывает `next()`;
 *         • пока `count < maxAttempts` в пределах окна — инкремент и `next()`;
 *         • при `count >= maxAttempts` — ответ `429 { error: "too_many_requests" }`
 *           БЕЗ вызова `next()` (нижележащий хендлер не выполняется);
 *         • сброс происходит, когда `now > resetAt` (окно истекло) — счётчик
 *           начинается заново с 1.
 *
 * Свойство P10 (design.md): для ЛЮБОЙ последовательности запросов с одного IP:
 *   (a) в пределах окна первые `maxAttempts` запросов ПРОПУСКАЮТСЯ (вызывают
 *       `next()`), а каждый последующий ОТКЛОНЯЕТСЯ статусом 429 БЕЗ вызова
 *       нижележащего хендлера (регистрация не создаёт аккаунт, вход не
 *       устанавливает сессию — Requirements 7.2, 7.4);
 *   (b) после истечения окна счётчик для этого IP СБРАСЫВАЕТСЯ и запросы снова
 *       принимаются (Requirement 7.5).
 * Покрываются оба настроенных лимита: регистрация — 5 запросов/60 минут
 * (Requirement 7.1), вход — 10 запросов/15 минут (Requirement 7.3).
 *
 * ПОДХОД К ВРЕМЕНИ: `createRateLimiter` использует `Date.now()` без инъекции
 * часов, поэтому тест ВРЕМЕННО подменяет `Date.now` изменяемой фейковой функцией
 * и ГАРАНТИРОВАННО восстанавливает оригинал в `finally`. Это делает истечение
 * окна детерминированным без реальных задержек.
 *
 * Run via Node's built-in test runner (pnpm-store tsx):
 *   node ../../node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/cli.mjs \
 *     --test ./__tests__/community/rate-limiter-window.property.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import { createRateLimiter } from "../../src/lib/rateLimit.js";

// ─── Управляемые часы: подмена Date.now изменяемым значением ─────────────────

/**
 * Устанавливает подменённый `Date.now`, читающий изменяемую ячейку `clock.t`.
 * Возвращает объект часов и функцию `restore`, восстанавливающую оригинал.
 * Вызывающий ОБЯЗАН вызвать `restore()` в `finally`.
 */
function installFakeClock(startMs: number) {
  const clock = { t: startMs };
  const realNow = Date.now;
  Date.now = () => clock.t;
  return {
    clock,
    restore() {
      Date.now = realNow;
    },
  };
}

// ─── Мок req / res / next ────────────────────────────────────────────────────

/** Мок-запрос с фиксированным IP (ключ лимитера по умолчанию — `req.ip`). */
function makeReq(ip: string): any {
  return { ip };
}

/**
 * Мок-ответ, захватывающий статус и тело. `status(code)` возвращает `this`
 * (chainable, как Express), `json(body)` фиксирует тело и факт отправки.
 */
function makeRes() {
  const state = { statusCode: null as number | null, body: null as any, sent: false };
  const res: any = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(payload: any) {
      state.body = payload;
      state.sent = true;
      return res;
    },
  };
  return { res, state };
}

/**
 * Единичный прогон middleware. Возвращает исход: вызван ли `next()` (пропуск,
 * т.е. нижележащий хендлер выполнился бы) и/или отправлен ли 429.
 */
function runOnce(
  limiter: (req: any, res: any, next: any) => void,
  ip: string,
): { passed: boolean; rejected429: boolean; body: any } {
  const req = makeReq(ip);
  const { res, state } = makeRes();
  let nextCalled = 0;
  const next = () => {
    nextCalled++;
  };
  limiter(req, res, next);

  const passed = nextCalled > 0;
  const rejected429 = state.sent && state.statusCode === 429;

  // Инвариант взаимоисключения: запрос либо пропущен (next), либо отклонён (429),
  // но НИКОГДА не то и другое одновременно (иначе был бы сайд-эффект при отказе).
  assert.equal(
    passed && rejected429,
    false,
    "запрос не может быть одновременно пропущен и отклонён",
  );
  assert.equal(nextCalled <= 1, true, "next() не должен вызываться более одного раза");

  return { passed, rejected429, body: state.body };
}

// ─── Конфигурации обоих настроенных лимитов ─────────────────────────────────

interface LimitConfig {
  name: string;
  windowMs: number;
  maxAttempts: number;
}

const configArb = fc.constantFrom<LimitConfig>(
  // Registration_Rate_Limiter — 5 запросов / 60 минут (Requirement 7.1).
  { name: "register", windowMs: 60 * 60_000, maxAttempts: 5 },
  // Login_Rate_Limiter — 10 запросов / 15 минут (Requirement 7.3).
  { name: "login", windowMs: 15 * 60_000, maxAttempts: 10 },
);

// ─── Property 10 ─────────────────────────────────────────────────────────────

describe("createRateLimiter — P10: скользящее окно, отказ без сайд-эффектов, сброс", () => {
  // Feature: community-phone-registration, Property 10: скользящий лимитер
  // пропускает первые maxAttempts запросов в окне, отклоняет каждый последующий
  // статусом 429 без вызова нижележащего хендлера, и сбрасывает счётчик после
  // истечения окна — для обоих лимитов (register 5/60мин, login 10/15мин).
  // Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5

  it("в окне первые maxAttempts проходят, остальные — 429 без next; после окна счётчик сброшен", () => {
    fc.assert(
      fc.property(
        configArb,
        // Число запросов СВЕРХ лимита в первом окне (>=1, чтобы гарантированно
        // наблюдать хотя бы один отказ).
        fc.integer({ min: 1, max: 15 }),
        // Смещения по времени внутри окна для каждого запроса (все < windowMs,
        // поэтому все попадают в одно окно независимо от порядка).
        fc.integer({ min: 0, max: 5_000 }),
        // Сколько запросов проверить после сброса окна (>=1).
        fc.integer({ min: 1, max: 6 }),
        // IP-адрес запрашивающего.
        fc.constantFrom("203.0.113.7", "198.51.100.42", "unknown", "::1"),
        (config, extra, baseOffset, postResetCount, ip) => {
          const { windowMs, maxAttempts } = config;
          const totalInWindow = maxAttempts + extra;

          const { clock, restore } = installFakeClock(1_000_000 + baseOffset);
          try {
            const limiter = createRateLimiter({ windowMs, maxAttempts });

            const firstNow = clock.t; // время первого запроса → resetAt = firstNow + windowMs
            let passesInWindow = 0;
            let rejectsInWindow = 0;

            // ── Фаза 1: последовательность в пределах ОДНОГО окна ──────────────
            for (let i = 0; i < totalInWindow; i++) {
              // Держим время внутри окна: смещение < windowMs гарантирует
              // clock.t <= firstNow + (windowMs-1) < resetAt, т.е. без сброса.
              clock.t = firstNow + (i % windowMs);
              const r = runOnce(limiter, ip);

              if (i < maxAttempts) {
                // (R7.1/7.3) Первые maxAttempts — пропускаются.
                assert.equal(
                  r.passed,
                  true,
                  `[${config.name}] запрос #${i + 1} в пределах лимита должен пройти (next)`,
                );
                assert.equal(r.rejected429, false, `[${config.name}] запрос #${i + 1} не должен давать 429`);
                passesInWindow++;
              } else {
                // (R7.1–7.4) Сверх лимита — 429 БЕЗ вызова нижележащего хендлера.
                assert.equal(
                  r.rejected429,
                  true,
                  `[${config.name}] запрос #${i + 1} сверх лимита должен давать 429`,
                );
                assert.equal(
                  r.passed,
                  false,
                  `[${config.name}] отклонённый запрос #${i + 1} НЕ должен вызывать next (без сайд-эффектов)`,
                );
                assert.deepEqual(
                  r.body,
                  {
                    error: "too_many_requests",
                    message: r.body?.message, // сообщение зависит от remaining-времени; проверяем только код
                  },
                  `[${config.name}] тело 429 должно содержать error: "too_many_requests"`,
                );
                rejectsInWindow++;
              }
            }

            // Ровно maxAttempts пропусков и `extra` отказов в окне.
            assert.equal(passesInWindow, maxAttempts, `[${config.name}] ровно maxAttempts пропусков в окне`);
            assert.equal(rejectsInWindow, extra, `[${config.name}] ровно extra отказов в окне`);

            // ── Фаза 2: окно истекает — счётчик СБРАСЫВАЕТСЯ (R7.5) ────────────
            // Сброс срабатывает при now > resetAt (resetAt = firstNow + windowMs).
            clock.t = firstNow + windowMs + 1;

            let postResetPasses = 0;
            let postResetRejects = 0;
            for (let j = 0; j < postResetCount; j++) {
              // Держим пост-сбросовые запросы в НОВОМ окне (малые смещения).
              clock.t = firstNow + windowMs + 1 + (j % windowMs);
              const r = runOnce(limiter, ip);
              if (j < maxAttempts) {
                assert.equal(
                  r.passed,
                  true,
                  `[${config.name}] после сброса запрос #${j + 1} должен снова проходить`,
                );
                assert.equal(r.rejected429, false, `[${config.name}] после сброса запрос #${j + 1} не 429`);
                postResetPasses++;
              } else {
                // Если пост-сбросовых запросов > maxAttempts — снова 429.
                assert.equal(r.rejected429, true, `[${config.name}] новый лимит после сброса тоже действует`);
                postResetRejects++;
              }
            }

            // Первый пост-сбросовый запрос обязан пройти (доказательство сброса).
            assert.equal(
              postResetPasses,
              Math.min(postResetCount, maxAttempts),
              `[${config.name}] после сброса вновь принимается до maxAttempts запросов`,
            );
            assert.equal(
              postResetRejects,
              Math.max(0, postResetCount - maxAttempts),
              `[${config.name}] сверх нового лимита — снова отказы`,
            );
          } finally {
            restore();
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("разные IP независимы: отказ одному не влияет на пропуск другому (санити ключевания)", () => {
    const { clock, restore } = installFakeClock(2_000_000);
    try {
      const limiter = createRateLimiter({ windowMs: 60 * 60_000, maxAttempts: 5 });
      // Исчерпываем лимит для IP-A.
      for (let i = 0; i < 5; i++) assert.equal(runOnce(limiter, "10.0.0.1").passed, true);
      assert.equal(runOnce(limiter, "10.0.0.1").rejected429, true);
      // IP-B в том же окне всё ещё проходит.
      assert.equal(runOnce(limiter, "10.0.0.2").passed, true);
    } finally {
      restore();
    }
  });
});

// ─── Явные примеры-якоря обоих лимитов ──────────────────────────────────────

describe("createRateLimiter — P10: явные примеры обоих настроенных лимитов", () => {
  // Feature: community-phone-registration, Property 10: конкретные пределы
  // register 5/60мин и login 10/15мин — граница пропуск/429 и сброс по окну.
  // Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5

  it("register 5/60мин: 5 проходят, 6-й → 429; после 60 мин снова проходит", () => {
    const { clock, restore } = installFakeClock(0);
    try {
      const limiter = createRateLimiter({ windowMs: 60 * 60_000, maxAttempts: 5 });
      for (let i = 0; i < 5; i++) {
        const r = runOnce(limiter, "1.1.1.1");
        assert.equal(r.passed, true, `запрос #${i + 1}`);
      }
      const sixth = runOnce(limiter, "1.1.1.1");
      assert.equal(sixth.rejected429, true);
      assert.equal(sixth.passed, false);
      assert.equal(sixth.body.error, "too_many_requests");

      // Ровно на границе окна (now === resetAt) — ещё НЕ сброс (now > resetAt).
      clock.t = 60 * 60_000;
      assert.equal(runOnce(limiter, "1.1.1.1").rejected429, true, "на границе окна лимит ещё держится");

      // За границей окна — сброс, запрос снова проходит.
      clock.t = 60 * 60_000 + 1;
      assert.equal(runOnce(limiter, "1.1.1.1").passed, true, "после окна счётчик сброшен");
    } finally {
      restore();
    }
  });

  it("login 10/15мин: 10 проходят, 11-й → 429; после 15 мин снова проходит", () => {
    const { clock, restore } = installFakeClock(0);
    try {
      const limiter = createRateLimiter({ windowMs: 15 * 60_000, maxAttempts: 10 });
      for (let i = 0; i < 10; i++) {
        assert.equal(runOnce(limiter, "2.2.2.2").passed, true, `запрос #${i + 1}`);
      }
      const eleventh = runOnce(limiter, "2.2.2.2");
      assert.equal(eleventh.rejected429, true);
      assert.equal(eleventh.passed, false);

      clock.t = 15 * 60_000 + 1;
      assert.equal(runOnce(limiter, "2.2.2.2").passed, true, "после 15-минутного окна — сброс");
    } finally {
      restore();
    }
  });
});
