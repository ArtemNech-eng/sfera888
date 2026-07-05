/**
 * Property test P3 for `communityAuth.ts` → `registerAccount`.
 *
 * Property 3: Успешная регистрация — полный инвариант.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.5, 1.6**
 *
 * Module under test (`src/lib/communityAuth.ts`):
 *   - `registerAccount(input, deps): Promise<RegisterResult>`
 *       Регистрация Community_Account по телефону и паролю. Порядок:
 *       обязательные поля → `normalizeRuPhone` → `validatePassword` → captcha →
 *       уникальность телефона → `hashPassword` → `createWithPassword` (INSERT).
 *
 * Свойство P3 (design.md): для ЛЮБОГО входа с нормализуемым телефоном,
 * отсутствующим в репозитории, паролем длиной 8–72 символа и проходящим
 * captcha-токеном:
 *   - `registerAccount` создаёт РОВНО ОДИН Community_Account;
 *   - у него `phone === normalizeRuPhone(rawPhone)` (R1.5);
 *   - `password_hash` непустой и НЕ равен открытому паролю (R1.2);
 *   - `hasPublishingRights(account)` истинно немедленно (R1.6);
 *   - роут-хендлер устанавливает `session.communityAccountId` = id аккаунта (R1.3).
 *
 * ПРИМЕЧАНИЕ О СЕССИИ (R1.3): отдельного роут-хендлера `POST /register`,
 * устанавливающего `session.communityAccountId`, на момент этого теста ещё нет
 * (task 4.2 в плане не завершён). `registerAccount` — чистая доменная функция и
 * НАМЕРЕННО не касается HTTP/сессии (см. её doc-comment). Поэтому здесь
 * проверяется доменный инвариант, который делает установку сессии возможной:
 * успешная регистрация возвращает `{ ok: true, account }` c валидным целочисленным
 * `account.id`, пригодным для записи в `session.communityAccountId`. Собственно
 * присваивание сессии проверяется роут-тестами (task 4.2 / 8.1).
 *
 * Run via Node's built-in test runner:
 *   tsx --test ./__tests__/community/registration-success.property.test.ts
 */

// `communityAuth.ts` статически импортирует `@workspace/db`, который бросает на
// этапе загрузки модуля, если `DATABASE_URL` не задан. pg.Pool не подключается
// лениво, поэтому фиктивной строки достаточно — `registerAccount` в этом тесте
// работает через инъектированный fake-репозиторий и не выполняет запросов к БД.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// Динамический импорт с `.js`-расширением: гарантирует, что присваивание
// `DATABASE_URL` выше выполнится ДО загрузки `@workspace/db`.
const communityAuth = await import("../../src/lib/communityAuth.js");
const { registerAccount, hasPublishingRights, normalizeRuPhone } = communityAuth;

type CommunityAccount = Parameters<typeof hasPublishingRights>[0] extends
  | infer T
  | null
  | undefined
  ? T
  : never;

// ─── Fakes ────────────────────────────────────────────────────────────────

/**
 * In-memory fake `CommunityAccountRepository`, отслеживающий созданные строки и
 * присваивающий последовательные id. Реальная БД/сеть не задействуются.
 * Возвращаем сам инстанс, чтобы тест мог инспектировать `created`.
 */
function makeFakeRepo() {
  const created: any[] = [];
  let nextId = 1;
  const repo = {
    async findByPhone(phone: string) {
      return created.find((a) => a.phone === phone) ?? null;
    },
    async createWithPassword(phone: string, passwordHash: string) {
      const row = {
        id: nextId++,
        phone,
        phoneVerifiedAt: null,
        passwordHash,
        role: "resident",
        zhkId: null,
        maxUserId: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      };
      created.push(row);
      return row;
    },
    // Методы, не используемые регистрацией по паролю — на случай вызова падаем
    // громко, чтобы уловить неожиданный путь исполнения.
    async createVerified(): Promise<never> {
      throw new Error("createVerified не должен вызываться при password-регистрации");
    },
    async markVerified(): Promise<never> {
      throw new Error("markVerified не должен вызываться при password-регистрации");
    },
    async linkMax(): Promise<never> {
      throw new Error("linkMax не должен вызываться при password-регистрации");
    },
  };
  return { repo: repo as any, created };
}

/**
 * Детерминированный `hashPassword`: непустая трансформация пароля, гарантированно
 * отличная от открытого текста (префикс + reverse). Достаточно для P3 —
 * настоящий bcrypt round-trip проверяется отдельно в P5 (task 3.7).
 */
const FAKE_HASH_PREFIX = "fakehash$";
function fakeHash(pw: string): string {
  return FAKE_HASH_PREFIX + pw.split("").reverse().join("");
}
async function fakeHashPassword(pw: string): Promise<string> {
  return fakeHash(pw);
}
async function fakeVerifyPassword(pw: string, hash: string): Promise<boolean> {
  return fakeHash(pw) === hash;
}

// ─── Arbitraries ────────────────────────────────────────────────────────────

const digitArb = fc.constantFrom("0", "1", "2", "3", "4", "5", "6", "7", "8", "9");

/** Национальный 10-значный номер (без кода страны). */
const national10Arb: fc.Arbitrary<string> = fc
  .array(digitArb, { minLength: 10, maxLength: 10 })
  .map((xs) => xs.join(""));

type PhoneForm = "ten" | "eight" | "seven" | "plus7";
const formArb = fc.constantFrom<PhoneForm>("ten", "eight", "seven", "plus7");

/** Рендер одного и того же номера в разных эквивалентных формах. */
function renderForm(national10: string, form: PhoneForm): string {
  switch (form) {
    case "ten":
      return national10;
    case "eight":
      return "8" + national10;
    case "seven":
      return "7" + national10;
    case "plus7":
      return "+7" + national10;
  }
}

/** Нецифровые разделители, отбрасываемые нормализатором (`\D+`). */
const sepArb = fc.constantFrom("", " ", "-", "(", ")", ".", "\t", "/");

/** Сырой телефон: валидная форма + произвольные разделители внутри/вокруг. */
const rawPhoneArb: fc.Arbitrary<string> = fc
  .record({
    national10: national10Arb,
    form: formArb,
    lead: sepArb,
    mid: sepArb,
    trail: sepArb,
  })
  .map(({ national10, form, lead, mid, trail }) => {
    const rendered = renderForm(national10, form);
    // Вставим разделитель в середину, не ломая цифровую последовательность.
    const cut = Math.floor(rendered.length / 2);
    const withMid = rendered.slice(0, cut) + mid + rendered.slice(cut);
    return lead + withMid + trail;
  });

/**
 * Пароль длиной 8–72 символа включительно (Password_Policy). Границы 8 и 72
 * включаются явно, чтобы прогнать инвариант на краях допустимого диапазона.
 */
const passwordArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 6, arbitrary: fc.string({ minLength: 8, maxLength: 72 }) },
  {
    weight: 2,
    arbitrary: fc.constantFrom(
      "12345678", // ровно 8
      "p".repeat(72), // ровно 72
      "        ", // 8 пробелов — значимые символы
      "Пароль!8", // юникод, ровно 8 кодовых единиц
    ),
  },
);

/**
 * Passing captcha-токен: непустой ПОСЛЕ `.trim()`. `registerAccount` трактует
 * токен, пустой после тримминга (включая строку из одних пробелов), как
 * `captcha_missing` и отклоняет БЕЗ вызова верификатора (Requirement 2.5) —
 * это НЕ «проходящий токен». Предусловие P3 — именно проходящий токен, поэтому
 * генератор гарантирует хотя бы один непробельный символ.
 */
const captchaTokenArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter((s) => s.trim().length > 0);

// ─── Property 3 — успешная регистрация: полный инвариант ────────────────────

describe("registerAccount — P3: успешная регистрация (полный инвариант)", () => {
  // Feature: community-phone-registration, Property 3: успешная регистрация —
  // полный инвариант (ровно один аккаунт; phone == normalizeRuPhone(raw);
  // password_hash непуст и != plaintext; hasPublishingRights истинно немедленно;
  // account.id пригоден для session.communityAccountId).
  // Validates: Requirements 1.1, 1.2, 1.3, 1.5, 1.6

  it("для валидного входа создаётся ровно один аккаунт с корректным инвариантом", async () => {
    await fc.assert(
      fc.asyncProperty(
        rawPhoneArb,
        passwordArb,
        captchaTokenArb,
        async (rawPhone, password, captchaToken) => {
          const { repo, created } = makeFakeRepo();

          // Spy verifyCaptcha: всегда success, считает вызовы.
          let captchaCalls = 0;
          const verifyCaptcha = async () => {
            captchaCalls++;
            return { success: true };
          };

          let hashCalls = 0;
          const hashPassword = async (pw: string) => {
            hashCalls++;
            return fakeHash(pw);
          };

          const result = await registerAccount(
            { phone: rawPhone, password, captchaToken },
            {
              accounts: repo,
              verifyCaptcha,
              hashPassword,
              verifyPassword: fakeVerifyPassword,
            },
          );

          // (R1.1) Регистрация завершилась успехом.
          assert.equal(result.ok, true, `ожидался ok:true для валидного входа; got=${JSON.stringify(result)}`);
          if (!result.ok) return; // narrow

          const account = result.account;

          // (R1.1) Создан РОВНО ОДИН Community_Account.
          assert.equal(created.length, 1, `должен быть создан ровно один аккаунт, создано ${created.length}`);
          assert.equal(account.id, created[0].id, "возвращённый аккаунт совпадает с созданной строкой");

          // (R1.5) phone равен нормализованному телефону.
          const expectedPhone = normalizeRuPhone(rawPhone);
          assert.notEqual(expectedPhone, null, "тестовый телефон обязан нормализоваться");
          assert.equal(account.phone, expectedPhone, "phone == normalizeRuPhone(rawPhone)");

          // (R1.2) password_hash непустой и НЕ равен открытому паролю.
          assert.equal(typeof account.passwordHash, "string");
          assert.ok(account.passwordHash!.length > 0, "password_hash непустой");
          assert.notEqual(account.passwordHash, password, "password_hash != открытый пароль");
          assert.equal(hashCalls, 1, "hashPassword вызван ровно один раз");

          // (R1.6) hasPublishingRights истинно немедленно.
          assert.equal(
            hasPublishingRights(account as CommunityAccount),
            true,
            "созданный аккаунт немедленно обладает Publishing_Rights",
          );

          // (R1.3) account.id — валидный целочисленный идентификатор, пригодный
          // для session.communityAccountId (собственно присваивание сессии — в
          // роут-тестах, task 4.2 / 8.1; см. заголовок файла).
          assert.ok(Number.isInteger(account.id) && account.id > 0, "account.id пригоден для сессии");

          // Санити: captcha проверялась ровно один раз (непустой токен → вызов).
          assert.equal(captchaCalls, 1, "verifyCaptcha вызван ровно один раз");
        },
      ),
      { numRuns: 200 },
    );
  });

  it("явный пример: 8XXXXXXXXXX + пароль длиной 8 → +7XXXXXXXXXX, права немедленно", async () => {
    const { repo, created } = makeFakeRepo();
    const result = await registerAccount(
      { phone: "89161234567", password: "hunter22", captchaToken: "tok" },
      {
        accounts: repo,
        verifyCaptcha: async () => ({ success: true }),
        hashPassword: fakeHashPassword,
        verifyPassword: fakeVerifyPassword,
      },
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(created.length, 1);
    assert.equal(result.account.phone, "+79161234567");
    assert.notEqual(result.account.passwordHash, "hunter22");
    assert.ok((result.account.passwordHash ?? "").length > 0);
    assert.equal(hasPublishingRights(result.account as CommunityAccount), true);
    assert.ok(Number.isInteger(result.account.id) && result.account.id > 0);
  });
});
