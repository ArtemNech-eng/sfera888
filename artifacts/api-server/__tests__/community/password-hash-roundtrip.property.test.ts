/**
 * Property test P5 for `lib/auth.ts` → `hashPassword` / `verifyPassword`.
 *
 * Property 5: Хеширование пароля — верифицируемый round-trip.
 *
 * **Validates: Requirements 6.1, 6.3**
 *
 * Module under test (`src/lib/auth.ts`):
 *   - `hashPassword(password): Promise<string>`  — bcryptjs, cost = 10 (≥ 10, Requirement 6.1).
 *   - `verifyPassword(password, hash): Promise<boolean>` — bcryptjs.compare (Requirement 6.3).
 *
 * Свойство P5 (design.md): для ЛЮБОГО пароля длиной 8–72 символа:
 *   (a) `verifyPassword(password, hashPassword(password))` истинно (round-trip);
 *   (b) `hashPassword(password)` НЕ равен открытому паролю (хранится только хеш);
 *   (c) `verifyPassword(other, hashPassword(password))` для любого несовпадающего
 *       `other` ложно (хеш не принимает чужой пароль).
 *
 * ВАЖНО: здесь используется РЕАЛЬНЫЙ bcryptjs (`hashPassword`/`verifyPassword`
 * из `lib/auth.ts`), а не детерминированная фейковая конвенция из P6 — это
 * свойство проверяет именно настоящий криптографический round-trip.
 *
 * bcrypt с cost ≥ 10 медленный, поэтому `numRuns` держим скромным (100 — это
 * минимум из design.md «≥ 100 итераций»), а таймаут теста расширяем под реальные
 * вычисления хеша (по 2 bcrypt-операции на итерацию: hash + до двух verify).
 *
 * Run via the pnpm-store tsx binary (Node's built-in test runner):
 *   ./node_modules/.bin/tsx --test ./__tests__/community/password-hash-roundtrip.property.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// Реальные bcryptjs-хелперы — НЕ фейки. Это свойство валидирует настоящий
// криптографический round-trip. `lib/auth.ts` не импортирует @workspace/db,
// поэтому фиктивный DATABASE_URL не требуется.
import { hashPassword, verifyPassword } from "../../src/lib/auth.js";

// bcrypt cost ≥ 10 → каждая операция ~50–100мс. При numRuns=100 и до 3 bcrypt
// операций на итерацию закладываем щедрый таймаут, чтобы медленный хеш не срывал
// прогон (design.md: предпочитаем 100 итераций, но обеспечиваем достаточный таймаут).
const NUM_RUNS = 100;
const TEST_TIMEOUT_MS = 300_000; // 5 минут — с запасом под реальный bcrypt

// ─── Arbitraries: пароли длиной 8–72 включая границы ────────────────────────

/**
 * Пароль длиной 8–72 символа (Password_Policy). Явно включаем граничные длины
 * 8 и 72, а также «злые» строки (пробелы, юникод, повторы) для устойчивости
 * round-trip к любому валидному содержимому.
 *
 * Примечание: bcrypt усекает вход по 72 БАЙТАМ; для round-trip это несущественно
 * (одна и та же строка усечётся одинаково при hash и verify), а «other» мы строго
 * отфильтровываем по неравенству исходной строке.
 */
const passwordArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 6, arbitrary: fc.string({ minLength: 8, maxLength: 72 }) },
  {
    weight: 3,
    arbitrary: fc.constantFrom(
      "12345678", // ровно 8 (нижняя граница)
      "p".repeat(72), // ровно 72 (верхняя граница)
      "a".repeat(8),
      "Z".repeat(72),
      "        ", // 8 пробелов
      "Пароль!8", // юникод, ровно 8 символов
      "пароль-с-разными-символами-!@#$%^&*()_+", // разнородный
    ),
  },
);

/** Кандидат «другого» пароля; в тесте строго фильтруется на != исходному. */
const otherArb: fc.Arbitrary<string> = fc.string({ minLength: 0, maxLength: 80 });

// ─── Property 5 — верифицируемый round-trip хеширования ─────────────────────

describe("hashPassword/verifyPassword — P5: верифицируемый round-trip", () => {
  // Feature: community-phone-registration, Property 5: хеширование пароля —
  // верифицируемый round-trip: для любого пароля 8–72 символов
  // verifyPassword(pw, hashPassword(pw)) истинно; hashPassword(pw) != pw;
  // verifyPassword(other, hashPassword(pw)) ложно для любого other != pw.
  // Validates: Requirements 6.1, 6.3

  it(
    "round-trip истинен; хеш != открытого пароля; чужой пароль не проходит",
    { timeout: TEST_TIMEOUT_MS },
    async () => {
      await fc.assert(
        fc.asyncProperty(
          passwordArb,
          otherArb,
          async (password, otherRaw) => {
            const hash = await hashPassword(password);

            // (b) Хеш не равен открытому паролю — хранится только необратимая форма.
            assert.notEqual(hash, password, "хеш не должен совпадать с открытым паролем");
            assert.ok(hash.length > 0, "хеш непустой");
            // Санити: bcrypt-хеш имеет узнаваемый префикс ($2a$/$2b$/$2y$) и cost ≥ 10.
            assert.match(hash, /^\$2[aby]\$(1[0-9]|[2-9][0-9])\$/, "bcrypt-хеш с cost ≥ 10");

            // (a) Round-trip: исходный пароль верифицируется против своего хеша.
            const roundTrip = await verifyPassword(password, hash);
            assert.equal(roundTrip, true, "verifyPassword(password, hash) должен быть true");

            // (c) Любой несовпадающий `other` НЕ проходит проверку против этого хеша.
            //     Пропускаем случай other === password (это не «другой» пароль).
            if (otherRaw !== password) {
              const wrong = await verifyPassword(otherRaw, hash);
              assert.equal(
                wrong,
                false,
                `verifyPassword(other, hash) должен быть false; other=${JSON.stringify(otherRaw)}`,
              );
            }
          },
        ),
        { numRuns: NUM_RUNS },
      );
    },
  );
});

// ─── Явные примеры: границы длины и явный чужой пароль ──────────────────────

describe("hashPassword/verifyPassword — P5: явные примеры", () => {
  // Feature: community-phone-registration, Property 5: верифицируемый round-trip.
  // Validates: Requirements 6.1, 6.3

  it("нижняя граница длины 8: round-trip истинен, хеш != пароля", async () => {
    const pw = "12345678";
    const hash = await hashPassword(pw);
    assert.notEqual(hash, pw);
    assert.equal(await verifyPassword(pw, hash), true);
    assert.equal(await verifyPassword("1234567X", hash), false);
  });

  it("верхняя граница длины 72: round-trip истинен", async () => {
    const pw = "p".repeat(72);
    const hash = await hashPassword(pw);
    assert.notEqual(hash, pw);
    assert.equal(await verifyPassword(pw, hash), true);
  });

  it("чужой пароль не проходит проверку против хеша", async () => {
    const hash = await hashPassword("correct-horse-battery");
    assert.equal(await verifyPassword("wrong-password-123", hash), false);
  });

  it("два хеша одного пароля различаются (соль), но оба верифицируются", async () => {
    const pw = "same-password-8";
    const h1 = await hashPassword(pw);
    const h2 = await hashPassword(pw);
    assert.notEqual(h1, h2, "bcrypt-соль делает хеши разными");
    assert.equal(await verifyPassword(pw, h1), true);
    assert.equal(await verifyPassword(pw, h2), true);
  });
});
