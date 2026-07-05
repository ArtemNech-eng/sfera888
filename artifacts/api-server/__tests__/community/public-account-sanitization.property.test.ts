/**
 * Property test P7 for `communityAuth.ts` → `toPublicAccount`.
 *
 * Property 7: Публичный DTO аккаунта никогда не раскрывает password_hash.
 *
 * **Validates: Requirements 1.4, 3.2, 4.4, 6.2**
 *
 * Module under test (`src/lib/communityAuth.ts`):
 *   - `toPublicAccount(account: CommunityAccount): PublicCommunityAccount`
 *       Единственная сериализация Community_Account в HTTP-ответ. Проекция —
 *       allow-list по явно перечисленным полям, поэтому `password_hash`
 *       (в snake_case на уровне БД) и `passwordHash` (в camelCase на уровне
 *       Drizzle-модели) не могут попасть в результат ни при каком значении.
 *
 * Свойство P7 (design.md): для ЛЮБОГО Community_Account (с заданным или пустым
 * `password_hash`) результат `toPublicAccount` не содержит ключа `password_hash`
 * (и его значения) ни на одном уровне сериализуемого объекта; это справедливо
 * для всех ответов, несущих данные аккаунта (регистрация, вход, `/me`).
 *
 * Здесь свойство усилено: проверяем отсутствие как snake_case-ключа
 * (`password_hash`), так и camelCase-ключа (`passwordHash`) на ЛЮБОМ уровне
 * вложенности как самого DTO-объекта, так и его JSON-строкового представления
 * (round-trip через `JSON.stringify`), плюс отсутствие значения хеша среди
 * значений DTO.
 *
 * Run via Node's built-in test runner:
 *   tsx --test ./__tests__/community/public-account-sanitization.property.test.ts
 */

// `communityAuth.ts` статически импортирует `@workspace/db`, который бросает на
// этапе загрузки модуля, если `DATABASE_URL` не задан. pg.Pool не подключается
// лениво, поэтому фиктивной строки достаточно — `toPublicAccount` чист и не
// выполняет никаких запросов к БД/сети.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// Динамический импорт с `.js`-расширением: гарантирует, что присваивание
// `DATABASE_URL` выше выполнится ДО загрузки `@workspace/db`.
const communityAuth = await import("../../src/lib/communityAuth.js");
const { toPublicAccount } = communityAuth;

// Тип строки таблицы `community_accounts` (Drizzle $inferSelect).
type CommunityAccount = Parameters<typeof toPublicAccount>[0];

// ─── Arbitraries ────────────────────────────────────────────────────────────

/**
 * Значения `passwordHash`, покрывающие все состояния поля:
 *   - реалистичные bcrypt-подобные хеши (`$2a$` / `$2b$` / `$2y$`);
 *   - пустая строка (пароль не задан «пустым» значением);
 *   - `null` (пароль не задан вовсе — колонка NULL);
 *   - произвольные строки (устойчивость к неожиданному содержимому).
 */
const bcryptLikeHashArb = fc
  .tuple(
    fc.constantFrom("$2a$", "$2b$", "$2y$"),
    fc.integer({ min: 4, max: 15 }).map((c) => String(c).padStart(2, "0")),
    // 22-символьная соль + 31-символьный хеш в bcrypt-алфавите (приближение).
    fc
      .array(
        fc.constantFrom(
          ..."./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".split(
            "",
          ),
        ),
        { minLength: 53, maxLength: 53 },
      )
      .map((xs) => xs.join("")),
  )
  .map(([prefix, cost, tail]) => `${prefix}${cost}$${tail}`);

const passwordHashArb: fc.Arbitrary<string | null> = fc.oneof(
  bcryptLikeHashArb,
  fc.constant(""),
  fc.constant(null),
  fc.string({ maxLength: 100 }),
);

/** Произвольный Community_Account с варьируемым `passwordHash`. */
const communityAccountArb: fc.Arbitrary<CommunityAccount> = fc.record({
  id: fc.integer({ min: 1, max: 1_000_000 }),
  phone: fc
    .array(fc.constantFrom(..."0123456789".split("")), {
      minLength: 10,
      maxLength: 10,
    })
    .map((xs) => "+7" + xs.join("")),
  phoneVerifiedAt: fc.oneof(
    fc.constant(null),
    fc.date({ min: new Date("2020-01-01"), max: new Date("2030-01-01") }),
  ),
  passwordHash: passwordHashArb,
  role: fc.constantFrom("resident", "master"),
  zhkId: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 100_000 })),
  maxUserId: fc.oneof(fc.constant(null), fc.string({ maxLength: 80 })),
  createdAt: fc.date({
    min: new Date("2020-01-01"),
    max: new Date("2030-01-01"),
  }),
}) as fc.Arbitrary<CommunityAccount>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FORBIDDEN_KEYS = ["password_hash", "passwordHash"];

/**
 * Рекурсивно собрать все ключи объекта/массива на всех уровнях вложенности.
 * `Date` трактуется как лист (не рекурсируем в её собственные свойства).
 */
function collectKeys(value: unknown, acc: string[] = []): string[] {
  if (value === null || typeof value !== "object") return acc;
  if (value instanceof Date) return acc;
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, acc);
    return acc;
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    acc.push(key);
    collectKeys((value as Record<string, unknown>)[key], acc);
  }
  return acc;
}

// ─── Property 7 — DTO не раскрывает password_hash ─────────────────────────────

describe("toPublicAccount — P7: публичный DTO никогда не раскрывает password_hash", () => {
  // Feature: community-phone-registration, Property 7: публичный DTO аккаунта
  // никогда не раскрывает password_hash (ни ключа, ни значения, ни на одном
  // уровне сериализуемого объекта, ни в JSON round-trip).
  // Validates: Requirements 1.4, 3.2, 4.4, 6.2

  it("DTO не содержит ключа password_hash/passwordHash ни на одном уровне (объект и JSON round-trip)", () => {
    fc.assert(
      fc.property(communityAccountArb, (account) => {
        const dto = toPublicAccount(account);

        // 1) Нет запрещённых ключей в самом DTO-объекте (на всех уровнях).
        const keys = collectKeys(dto);
        for (const forbidden of FORBIDDEN_KEYS) {
          assert.ok(
            !keys.includes(forbidden),
            `DTO не должен содержать ключ "${forbidden}"; ключи: ${keys.join(", ")}`,
          );
        }

        // 2) Round-trip через JSON.stringify тоже не раскрывает ключ.
        const json = JSON.stringify(dto);
        for (const forbidden of FORBIDDEN_KEYS) {
          assert.ok(
            !json.includes(`"${forbidden}"`),
            `JSON-представление DTO не должно содержать ключ "${forbidden}"`,
          );
        }

        // 3) Ключи распарсенного JSON тоже свободны от запрещённых имён.
        const parsedKeys = collectKeys(JSON.parse(json));
        for (const forbidden of FORBIDDEN_KEYS) {
          assert.ok(
            !parsedKeys.includes(forbidden),
            `Распарсенный JSON DTO не должен содержать ключ "${forbidden}"`,
          );
        }
      }),
      { numRuns: 300 },
    );
  });

  it("значение passwordHash никогда не присутствует среди значений DTO (любой хеш)", () => {
    fc.assert(
      fc.property(communityAccountArb, (account) => {
        const dto = toPublicAccount(account);
        const hash = account.passwordHash;

        // Проверяем только непустые хеши: пустая строка/`null` не являются
        // раскрываемым секретом. Сравнение по РАВЕНСТВУ значений (а не по
        // подстроке) робастно к патологичным коротким значениям вроде `"`,
        // которые структурно присутствуют в любом JSON.
        if (typeof hash === "string" && hash.length > 0) {
          const values = Object.values(dto as Record<string, unknown>);
          for (const v of values) {
            assert.notEqual(
              v,
              hash,
              `значение хеша не должно присутствовать среди значений DTO`,
            );
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it("реалистичный bcrypt-хеш не утекает в JSON-представление DTO (подстрока)", () => {
    // Для реалистичного (длинного, некопирующегося структурно) секрета
    // корректно проверять и отсутствие подстроки в JSON. Патологичные короткие
    // значения (напр. один символ `"`) исключены: они структурно присутствуют
    // в любом JSON и не являются раскрытием секрета.
    fc.assert(
      fc.property(
        communityAccountArb,
        bcryptLikeHashArb,
        (account, realisticHash) => {
          const withRealHash = {
            ...account,
            passwordHash: realisticHash,
          } as CommunityAccount;
          const dto = toPublicAccount(withRealHash);
          const json = JSON.stringify(dto);
          assert.ok(
            !json.includes(realisticHash),
            `JSON-представление DTO не должно содержать значение bcrypt-хеша`,
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it("DTO содержит только ожидаемый allow-list полей", () => {
    const EXPECTED_KEYS = [
      "id",
      "phone",
      "role",
      "zhkId",
      "maxUserId",
      "phoneVerifiedAt",
      "hasPublishingRights",
      "createdAt",
    ].sort();

    fc.assert(
      fc.property(communityAccountArb, (account) => {
        const dto = toPublicAccount(account);
        assert.deepEqual(Object.keys(dto).sort(), EXPECTED_KEYS);
      }),
      { numRuns: 100 },
    );
  });

  it("явный пример: аккаунт с заданным bcrypt-хешем → DTO без password_hash", () => {
    const account = {
      id: 42,
      phone: "+79991234567",
      phoneVerifiedAt: null,
      passwordHash:
        "$2b$10$abcdefghijklmnopqrstuuWb1Yk4b2Zq3l4m5n6o7p8q9r0s1t2u3",
      role: "resident",
      zhkId: null,
      maxUserId: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    } as CommunityAccount;

    const dto = toPublicAccount(account);
    const json = JSON.stringify(dto);

    assert.ok(!("password_hash" in (dto as object)));
    assert.ok(!("passwordHash" in (dto as object)));
    assert.ok(!json.includes("password_hash"));
    assert.ok(!json.includes("passwordHash"));
    assert.ok(!json.includes(account.passwordHash as string));
    // Наличие пароля даёт права публикации немедленно (R5.1) — sanity check.
    assert.equal(dto.hasPublishingRights, true);
  });
});
