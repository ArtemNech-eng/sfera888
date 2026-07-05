/**
 * Property test P8 for `communityAuth.ts` → `hasPublishingRights`.
 *
 * Property 8: Обобщённый предикат прав публикации, независимый от Max_Login.
 *
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.6**
 *
 * Module under test (`src/lib/communityAuth.ts`):
 *   - `hasPublishingRights(account): boolean`
 *       Обобщённый предикат прав публикации. Права даются, если задан непустой
 *       `passwordHash` (R5.1) ИЛИ проставлен `phoneVerifiedAt` (R5.2 —
 *       Legacy_Verified_Account); если оба признака отсутствуют/пусты — прав нет
 *       (R5.3). Max_Login (`maxUserId`) в предикат НЕ входит (R5.6).
 *
 * Свойство P8 (design.md): для ЛЮБОГО Community_Account `hasPublishingRights`
 * истинно тогда и только тогда, когда `passwordHash` непустой ИЛИ
 * `phoneVerifiedAt` задан; результат предиката НЕ изменяется при любом
 * варьировании `maxUserId`.
 *
 * Генераторы обязаны покрыть все комбинации:
 *   passwordHash (непустой | пустая строка | null) ×
 *   phoneVerifiedAt (задан | null) ×
 *   maxUserId (варьируется — чтобы доказать независимость).
 *
 * Run via Node's built-in test runner:
 *   tsx --test ./__tests__/community/publishing-rights.property.test.ts
 */

// `communityAuth.ts` статически импортирует `@workspace/db`, который бросает на
// этапе загрузки модуля, если `DATABASE_URL` не задан. pg.Pool не подключается
// лениво, поэтому фиктивной строки достаточно — `hasPublishingRights` чист и не
// выполняет никаких запросов к БД/сети.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// Динамический импорт с `.js`-расширением: гарантирует, что присваивание
// `DATABASE_URL` выше выполнится ДО загрузки `@workspace/db`.
const communityAuth = await import("../../src/lib/communityAuth.js");
const { hasPublishingRights } = communityAuth;

// Тип аргумента предиката (Pick<CommunityAccount, "phoneVerifiedAt" | "passwordHash">).
type AccountShape = NonNullable<Parameters<typeof hasPublishingRights>[0]> & {
  maxUserId?: string | null;
};

// ─── Arbitraries ──────────────────────────────────────────────────────────

/**
 * `passwordHash`, покрывающий все три состояния поля:
 *   - непустой bcrypt-подобный хеш (даёт право по R5.1);
 *   - пустая строка (НЕ даёт право — «пароль не задан пустым значением», R5.3);
 *   - `null` (колонка NULL — пароль не задан вовсе, R5.3).
 */
const bcryptLikeHashArb = fc
  .array(
    fc.constantFrom(
      ..."./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".split(
        "",
      ),
    ),
    { minLength: 53, maxLength: 53 },
  )
  .map((xs) => `$2b$10$${xs.join("")}`);

const nonEmptyHashArb: fc.Arbitrary<string> = fc.oneof(
  bcryptLikeHashArb,
  // Любая непустая строка тоже считается «заданным паролем» (allow-list по length>0).
  fc.string({ minLength: 1, maxLength: 100 }),
);

const passwordHashArb: fc.Arbitrary<string | null> = fc.oneof(
  nonEmptyHashArb,
  fc.constant(""),
  fc.constant(null),
);

/** `phoneVerifiedAt`: задан (дата) либо не задан (null). */
const phoneVerifiedAtArb: fc.Arbitrary<Date | null> = fc.oneof(
  fc.constant(null),
  fc.date({ min: new Date("2020-01-01"), max: new Date("2030-01-01") }),
);

/** `maxUserId`: варьируется (null | произвольная строка) — не должен влиять. */
const maxUserIdArb: fc.Arbitrary<string | null> = fc.oneof(
  fc.constant(null),
  fc.string({ maxLength: 80 }),
);

/** Произвольный аккаунт с варьированием всех трёх измерений. */
const accountArb: fc.Arbitrary<AccountShape> = fc.record({
  passwordHash: passwordHashArb,
  phoneVerifiedAt: phoneVerifiedAtArb,
  maxUserId: maxUserIdArb,
}) as fc.Arbitrary<AccountShape>;

/** Ожидаемое значение предиката по определению из спека (R5.1–5.3). */
function expectedRights(account: AccountShape): boolean {
  const hasPassword =
    typeof account.passwordHash === "string" && account.passwordHash.length > 0;
  const hasVerified = account.phoneVerifiedAt != null;
  return hasPassword || hasVerified;
}

// ─── Property 8 — предикат эквивалентен (password OR phoneVerified) ─────────

describe("hasPublishingRights — P8: обобщённый предикат прав публикации", () => {
  // Feature: community-phone-registration, Property 8: обобщённый предикат прав
  // публикации истинен ⟺ (непустой passwordHash ИЛИ задан phoneVerifiedAt) и не
  // зависит от maxUserId.
  // Validates: Requirements 5.1, 5.2, 5.3, 5.6

  it("права ⟺ (непустой passwordHash ИЛИ задан phoneVerifiedAt) — все комбинации", () => {
    fc.assert(
      fc.property(accountArb, (account) => {
        assert.equal(
          hasPublishingRights(account),
          expectedRights(account),
          `права должны совпадать с (passwordHash!=пусто || phoneVerifiedAt!=null); ` +
            `passwordHash=${JSON.stringify(account.passwordHash)}, ` +
            `phoneVerifiedAt=${String(account.phoneVerifiedAt)}`,
        );
      }),
      { numRuns: 300 },
    );
  });

  it("результат НЕ зависит от maxUserId (R5.6): инвариант при варьировании только maxUserId", () => {
    fc.assert(
      fc.property(
        passwordHashArb,
        phoneVerifiedAtArb,
        // Две произвольные (возможно разные) вариации maxUserId при фиксированных
        // passwordHash и phoneVerifiedAt.
        maxUserIdArb,
        maxUserIdArb,
        (passwordHash, phoneVerifiedAt, maxA, maxB) => {
          const base = { passwordHash, phoneVerifiedAt };
          const withA: AccountShape = { ...base, maxUserId: maxA };
          const withB: AccountShape = { ...base, maxUserId: maxB };
          // Также вариант вообще без поля maxUserId.
          const without: AccountShape = { ...base } as AccountShape;

          const rA = hasPublishingRights(withA);
          const rB = hasPublishingRights(withB);
          const rNone = hasPublishingRights(without);

          assert.equal(rA, rB, `результат не должен меняться при смене maxUserId`);
          assert.equal(
            rA,
            rNone,
            `результат не должен зависеть от наличия поля maxUserId`,
          );
        },
      ),
      { numRuns: 300 },
    );
  });
});

// ─── Property 8 — явное покрытие таблицы состояний (R5.1, R5.2, R5.3) ───────

describe("hasPublishingRights — P8: явная таблица состояний", () => {
  // Feature: community-phone-registration, Property 8: таблица состояний прав
  // публикации из design.md (password_hash × phone_verified_at).
  // Validates: Requirements 5.1, 5.2, 5.3, 5.6

  const verified = new Date("2026-01-01T00:00:00.000Z");
  const hash = "$2b$10$abcdefghijklmnopqrstuuWb1Yk4b2Zq3l4m5n6o7p8q9r0s1t2u3";

  it("R5.1: непустой passwordHash → true (при любом phoneVerifiedAt/maxUserId)", () => {
    assert.equal(
      hasPublishingRights({ passwordHash: hash, phoneVerifiedAt: null } as AccountShape),
      true,
    );
    assert.equal(
      hasPublishingRights({
        passwordHash: hash,
        phoneVerifiedAt: verified,
        maxUserId: "max-123",
      } as AccountShape),
      true,
    );
  });

  it("R5.2: задан phoneVerifiedAt, пустой/отсутствующий passwordHash → true (Legacy_Verified_Account)", () => {
    assert.equal(
      hasPublishingRights({ passwordHash: null, phoneVerifiedAt: verified } as AccountShape),
      true,
    );
    assert.equal(
      hasPublishingRights({ passwordHash: "", phoneVerifiedAt: verified } as AccountShape),
      true,
    );
  });

  it("R5.3: нет passwordHash И нет phoneVerifiedAt → false", () => {
    assert.equal(
      hasPublishingRights({ passwordHash: null, phoneVerifiedAt: null } as AccountShape),
      false,
    );
    assert.equal(
      hasPublishingRights({ passwordHash: "", phoneVerifiedAt: null } as AccountShape),
      false,
    );
  });

  it("R5.6: maxUserId не даёт прав сам по себе (нет пароля и нет верификации)", () => {
    assert.equal(
      hasPublishingRights({
        passwordHash: null,
        phoneVerifiedAt: null,
        maxUserId: "max-999",
      } as AccountShape),
      false,
    );
  });

  it("null/undefined аккаунт → false (нет прав)", () => {
    assert.equal(hasPublishingRights(null), false);
    assert.equal(hasPublishingRights(undefined), false);
  });
});
