/**
 * Property test P4 for `communityAuth.ts` → `registerAccount`.
 *
 * Property 4: Отказ регистрации не создаёт состояния.
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 7.2**
 *
 * Module under test (`src/lib/communityAuth.ts`):
 *   - `registerAccount(input, deps): Promise<RegisterResult>`
 *       Порядок проверок (строго фиксирован в реализации):
 *         обязательные поля (телефон → пароль) → `normalizeRuPhone` →
 *         `validatePassword` → captcha (пустой токен — БЕЗ вызова верификатора) →
 *         уникальность телефона → `hashPassword` → `createWithPassword`.
 *
 * Свойство P4 (design.md): для ЛЮБОГО входа, нарушающего хотя бы одно
 * предусловие (ненормализуемый телефон, пустое обязательное поле, пароль вне
 * 8..72, уже существующий нормализованный телефон, отсутствующий/пустой
 * captcha-токен, или captcha-токен, не прошедший проверку):
 *   - `registerAccount` возвращает `{ ok: false, reason }` с СООТВЕТСТВУЮЩЕЙ
 *     причиной (порядок причин совпадает с порядком проверок реализации);
 *   - НЕ создаёт ни одного Community_Account (`createWithPassword` не вызывается,
 *     Requirement 2.8, 7.2);
 *   - НЕ устанавливает Community_Session — доменная функция чиста относительно
 *     HTTP/сессии и на отказе возвращает `ok:false`, из-за чего роут-слой не
 *     присваивает `session.communityAccountId` (см. ПРИМЕЧАНИЕ О СЕССИИ);
 *   - при пустом (после trim) captcha-токене серверная проверка captcha НЕ
 *     вызывается вовсе (Requirement 2.5).
 *
 * ПРИМЕЧАНИЕ О СЕССИИ (R2.8): отдельного роут-хендлера `POST /register`,
 * который присваивает `session.communityAccountId`, на момент этого теста ещё
 * нет (task 4.2). `registerAccount` — чистая доменная функция и НАМЕРЕННО не
 * касается HTTP/сессии. Единственный сигнал, гейтящий установку сессии в
 * роут-слое, — это `result.ok`. Поэтому здесь проверяется доменный инвариант,
 * делающий установку сессии НЕВОЗМОЖНОЙ: любой отказ возвращает `ok:false` и не
 * несёт `account`. Собственно отсутствие присваивания сессии на отказе
 * проверяется роут-тестами (task 4.2 / 8.1).
 *
 * Run via Node's built-in test runner:
 *   tsx --test ./__tests__/community/registration-rejection.property.test.ts
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
const { registerAccount, normalizeRuPhone } = communityAuth;

// ─── Fakes ────────────────────────────────────────────────────────────────

/**
 * In-memory fake `CommunityAccountRepository`, отслеживающий число вызовов
 * `createWithPassword` (создание аккаунта) отдельно от предзаполненных строк.
 * `seed(phone)` кладёт существующий аккаунт БЕЗ увеличения счётчика создания —
 * так тест моделирует «телефон уже зарегистрирован» без ложного срабатывания
 * инварианта «ни одного аккаунта не создано».
 */
function makeFakeRepo() {
  const rows: any[] = [];
  const counters = { createCalls: 0, findCalls: 0 };
  let nextId = 1;
  const repo = {
    seed(phone: string) {
      rows.push({
        id: nextId++,
        phone,
        phoneVerifiedAt: null,
        passwordHash: "seededhash",
        role: "resident",
        zhkId: null,
        maxUserId: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      });
    },
    async findByPhone(phone: string) {
      counters.findCalls++;
      return rows.find((a) => a.phone === phone) ?? null;
    },
    async createWithPassword(phone: string, passwordHash: string) {
      counters.createCalls++;
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
      rows.push(row);
      return row;
    },
    // Методы, не используемые password-регистрацией — падаем громко.
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
  return { repo: repo as any, rows, counters };
}

// ─── Arbitraries — валидные компоненты (чтобы изолировать ОДНО нарушение) ────

const digitArb = fc.constantFrom("0", "1", "2", "3", "4", "5", "6", "7", "8", "9");

/** Национальный 10-значный номер (без кода страны). */
const national10Arb: fc.Arbitrary<string> = fc
  .array(digitArb, { minLength: 10, maxLength: 10 })
  .map((xs) => xs.join(""));

type PhoneForm = "ten" | "eight" | "seven" | "plus7";
const formArb = fc.constantFrom<PhoneForm>("ten", "eight", "seven", "plus7");

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

/** Валидный сырой телефон (нормализуется к `+7XXXXXXXXXX`). */
const validRawPhoneArb: fc.Arbitrary<string> = fc
  .record({ national10: national10Arb, form: formArb })
  .map(({ national10, form }) => renderForm(national10, form));

/** Валидный пароль длиной 8..72 включительно (с явными границами 8 и 72). */
const validPasswordArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 6, arbitrary: fc.string({ minLength: 8, maxLength: 72 }) },
  {
    weight: 2,
    arbitrary: fc.constantFrom("12345678", "p".repeat(72), "        ", "Пароль!8"),
  },
);

/** Проходящий captcha-токен: непустой после `.trim()`. */
const validCaptchaTokenArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter((s) => s.trim().length > 0);

// ─── Arbitraries — нарушители отдельных предусловий ─────────────────────────

/**
 * Непустой (после trim) телефон, который НЕ приводится к Normalized_Phone.
 * Цифровые последовательности неверной длины (1..9 или 12..14) и буквенный
 * мусор (0 цифр) — все дают `normalizeRuPhone(...) === null`.
 */
const invalidNonEmptyPhoneArb: fc.Arbitrary<string> = fc
  .oneof(
    // Неверное число цифр: слишком мало (1..9) или слишком много (12..14).
    fc
      .integer({ min: 1, max: 9 })
      .chain((n) => fc.array(digitArb, { minLength: n, maxLength: n }))
      .map((xs) => xs.join("")),
    fc
      .integer({ min: 12, max: 14 })
      .chain((n) => fc.array(digitArb, { minLength: n, maxLength: n }))
      .map((xs) => xs.join("")),
    // Буквенный мусор без цифр (после `\D+` → пустая цифровая строка).
    fc
      .string({ minLength: 1, maxLength: 12 })
      .map((s) => s.replace(/\d/g, "x"))
      .filter((s) => s.trim().length > 0),
  )
  .filter((s) => normalizeRuPhone(s) === null);

/** Пустой/пробельный телефон → `phone_missing` (после trim пусто). */
const emptyPhoneArb: fc.Arbitrary<string> = fc.constantFrom("", " ", "   ", "\t", "  \t ");

/** Пустой пароль → `password_missing` (реализация не тримит пароль). */
const emptyPasswordArb: fc.Arbitrary<string> = fc.constant("");

/**
 * Пароль недопустимой длины: 7 (ниже нижней) или 73 (выше верхней) — обе
 * граничные длины обязательны в генераторе. Плюс произвольные длины 1..7 и
 * 73..90 для покрытия остального невалидного диапазона.
 */
const badLengthPasswordArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom("1234567" /* 7 */, "p".repeat(73) /* 73 */) },
  {
    weight: 2,
    arbitrary: fc
      .oneof(fc.integer({ min: 1, max: 7 }), fc.integer({ min: 73, max: 90 }))
      .map((len) => "a".repeat(len)),
  },
);

/** Пустой/пробельный captcha-токен → `captcha_missing` БЕЗ вызова верификатора. */
const emptyCaptchaArb: fc.Arbitrary<string> = fc.constantFrom("", " ", "   ", "\t", "\n  ");

// ─── Дискриминированный генератор сценариев нарушения ───────────────────────

interface Scenario {
  /** Человекочитаемая метка сценария (для сообщений об ошибках). */
  label: string;
  input: { phone: string; password: string; captchaToken: string };
  /** Ожидаемая причина отказа (по порядку проверок реализации). */
  expectedReason: string;
  /** Ожидается ли, что серверная проверка captcha будет вызвана. */
  captchaCalled: boolean;
  /** Фейковый результат captcha, когда она вызывается (`true` = success). */
  captchaSuccess: boolean;
  /** Телефон для предзаполнения репозитория (сценарий `phone_taken`). */
  seedNormalizedPhone?: string;
}

/**
 * Каждый сценарий изолирует РОВНО ОДНО нарушение, оставляя прочие поля
 * валидными, чтобы ожидаемая причина была детерминирована порядком проверок:
 *   phone_missing → phone_invalid → password_missing → password_invalid →
 *   captcha_missing → captcha_failed → phone_taken.
 */
const scenarioArb: fc.Arbitrary<Scenario> = fc.oneof(
  // (R2.3) пустой телефон → phone_missing (проверяется ПЕРВЫМ; captcha не вызывается).
  fc
    .record({ phone: emptyPhoneArb, password: validPasswordArb, captchaToken: validCaptchaTokenArb })
    .map((r) => ({
      label: "empty_phone",
      input: r,
      expectedReason: "phone_missing",
      captchaCalled: false,
      captchaSuccess: true,
    })),
  // (R2.1) ненормализуемый телефон → phone_invalid (captcha не вызывается).
  fc
    .record({ phone: invalidNonEmptyPhoneArb, password: validPasswordArb, captchaToken: validCaptchaTokenArb })
    .map((r) => ({
      label: "invalid_phone",
      input: r,
      expectedReason: "phone_invalid",
      captchaCalled: false,
      captchaSuccess: true,
    })),
  // (R2.3) пустой пароль → password_missing (captcha не вызывается).
  fc
    .record({ phone: validRawPhoneArb, password: emptyPasswordArb, captchaToken: validCaptchaTokenArb })
    .map((r) => ({
      label: "empty_password",
      input: r,
      expectedReason: "password_missing",
      captchaCalled: false,
      captchaSuccess: true,
    })),
  // (R2.2) пароль вне 8..72 → password_invalid (captcha не вызывается).
  fc
    .record({ phone: validRawPhoneArb, password: badLengthPasswordArb, captchaToken: validCaptchaTokenArb })
    .map((r) => ({
      label: "bad_password_length",
      input: r,
      expectedReason: "password_invalid",
      captchaCalled: false,
      captchaSuccess: true,
    })),
  // (R2.5) пустой/пробельный captcha-токен → captcha_missing, БЕЗ вызова верификатора.
  fc
    .record({ phone: validRawPhoneArb, password: validPasswordArb, captchaToken: emptyCaptchaArb })
    .map((r) => ({
      label: "empty_captcha",
      input: r,
      expectedReason: "captcha_missing",
      captchaCalled: false,
      captchaSuccess: true,
    })),
  // (R2.6) captcha-токен передан, но не прошёл проверку → captcha_failed (captcha вызвана).
  fc
    .record({ phone: validRawPhoneArb, password: validPasswordArb, captchaToken: validCaptchaTokenArb })
    .map((r) => ({
      label: "failing_captcha",
      input: r,
      expectedReason: "captcha_failed",
      captchaCalled: true,
      captchaSuccess: false,
    })),
  // (R2.4) уже существующий Normalized_Phone → phone_taken (captcha вызвана до проверки уникальности).
  fc
    .record({ national10: national10Arb, form: formArb, password: validPasswordArb, captchaToken: validCaptchaTokenArb })
    .map(({ national10, form, password, captchaToken }) => {
      const raw = renderForm(national10, form);
      const normalized = normalizeRuPhone(raw)!; // валиден по построению
      return {
        label: "phone_taken",
        input: { phone: raw, password, captchaToken },
        expectedReason: "phone_taken",
        captchaCalled: true,
        captchaSuccess: true,
        seedNormalizedPhone: normalized,
      };
    }),
);

// Детерминированный fake `hashPassword` — на отказе НЕ должен вызываться вовсе.
async function fakeHashPassword(pw: string): Promise<string> {
  return "fakehash$" + pw;
}
async function fakeVerifyPassword(): Promise<boolean> {
  return false;
}

// ─── Property 4 — отказ регистрации не создаёт состояния ────────────────────

describe("registerAccount — P4: отказ регистрации не создаёт состояния", () => {
  // Feature: community-phone-registration, Property 4: отказ регистрации не
  // создаёт состояния (соответствующая причина; ни одного созданного аккаунта;
  // сессия не устанавливается; при пустом captcha-токене верификатор не вызван).
  // Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 7.2

  it("для входа с нарушенным предусловием — отказ, 0 аккаунтов, captcha не вызвана при пустом токене", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        const { repo, counters } = makeFakeRepo();
        if (scenario.seedNormalizedPhone) {
          repo.seed(scenario.seedNormalizedPhone);
        }

        // Spy verifyCaptcha: считает вызовы и возвращает сконфигурированный исход.
        let captchaCalls = 0;
        const verifyCaptcha = async () => {
          captchaCalls++;
          return { success: scenario.captchaSuccess };
        };

        // Spy hashPassword: на отказе не должен вызываться (хеширование — шаг 6,
        // после всех проверок и уникальности).
        let hashCalls = 0;
        const hashPassword = async (pw: string) => {
          hashCalls++;
          return fakeHashPassword(pw);
        };

        const result = await registerAccount(scenario.input, {
          accounts: repo,
          verifyCaptcha,
          hashPassword,
          verifyPassword: fakeVerifyPassword,
        });

        // (R2.8) Регистрация отклонена.
        assert.equal(
          result.ok,
          false,
          `[${scenario.label}] ожидался отказ ok:false; got=${JSON.stringify(result)}`,
        );
        if (result.ok) return; // narrow

        // Соответствующая причина (порядок проверок реализации).
        assert.equal(
          result.reason,
          scenario.expectedReason,
          `[${scenario.label}] неверная причина отказа`,
        );

        // (R2.8, R7.2) Ни одного Community_Account не создано.
        assert.equal(
          counters.createCalls,
          0,
          `[${scenario.label}] createWithPassword не должен вызываться на отказе`,
        );

        // Хеширование пароля не выполнялось (нет создаваемого аккаунта).
        assert.equal(
          hashCalls,
          0,
          `[${scenario.label}] hashPassword не должен вызываться на отказе`,
        );

        // (R2.8) Сессия невозможна: результат не несёт account и ok=false — роут
        // не присвоит session.communityAccountId (см. ПРИМЕЧАНИЕ О СЕССИИ).
        assert.ok(
          !("account" in result),
          `[${scenario.label}] отказ не должен нести account`,
        );

        // (R2.5) Инвариант вызова captcha:
        //  - при пустом captcha-токене (и при любом отказе ДО шага captcha)
        //    верификатор НЕ вызывается вовсе;
        //  - иначе (captcha_failed / phone_taken) — вызван ровно один раз.
        if (scenario.captchaCalled) {
          assert.equal(
            captchaCalls,
            1,
            `[${scenario.label}] verifyCaptcha должен быть вызван ровно один раз`,
          );
        } else {
          assert.equal(
            captchaCalls,
            0,
            `[${scenario.label}] verifyCaptcha НЕ должен вызываться (пустой токен / отказ до шага captcha)`,
          );
        }
      }),
      { numRuns: 200 },
    );
  });
});

// ─── Явные примеры каждой причины отказа (документируют порядок проверок) ────

describe("registerAccount — P4: явные примеры каждой причины отказа", () => {
  // Feature: community-phone-registration, Property 4: отказ регистрации не
  // создаёт состояния — примеры-якоря для каждой причины.
  // Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 7.2

  const okCaptcha = async () => ({ success: true });
  const failCaptcha = async () => ({ success: false });

  it("пустой телефон → phone_missing (retry:false), 0 аккаунтов, captcha не вызвана", async () => {
    const { repo, counters } = makeFakeRepo();
    let captchaCalls = 0;
    const result = await registerAccount(
      { phone: "   ", password: "hunter22", captchaToken: "tok" },
      {
        accounts: repo,
        verifyCaptcha: async () => {
          captchaCalls++;
          return { success: true };
        },
        hashPassword: fakeHashPassword,
        verifyPassword: fakeVerifyPassword,
      },
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "phone_missing");
    assert.equal(result.retry, false);
    assert.equal(counters.createCalls, 0);
    assert.equal(captchaCalls, 0);
  });

  it("ненормализуемый телефон → phone_invalid, 0 аккаунтов, captcha не вызвана", async () => {
    const { repo, counters } = makeFakeRepo();
    let captchaCalls = 0;
    const result = await registerAccount(
      { phone: "12345", password: "hunter22", captchaToken: "tok" },
      {
        accounts: repo,
        verifyCaptcha: async () => {
          captchaCalls++;
          return { success: true };
        },
        hashPassword: fakeHashPassword,
        verifyPassword: fakeVerifyPassword,
      },
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "phone_invalid");
    assert.equal(counters.createCalls, 0);
    assert.equal(captchaCalls, 0);
  });

  it("пустой пароль → password_missing, 0 аккаунтов, captcha не вызвана", async () => {
    const { repo, counters } = makeFakeRepo();
    let captchaCalls = 0;
    const result = await registerAccount(
      { phone: "89161234567", password: "", captchaToken: "tok" },
      {
        accounts: repo,
        verifyCaptcha: async () => {
          captchaCalls++;
          return { success: true };
        },
        hashPassword: fakeHashPassword,
        verifyPassword: fakeVerifyPassword,
      },
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "password_missing");
    assert.equal(counters.createCalls, 0);
    assert.equal(captchaCalls, 0);
  });

  it("пароль длиной 7 → password_invalid; длиной 73 → password_invalid", async () => {
    for (const password of ["1234567", "p".repeat(73)]) {
      const { repo, counters } = makeFakeRepo();
      const result = await registerAccount(
        { phone: "89161234567", password, captchaToken: "tok" },
        {
          accounts: repo,
          verifyCaptcha: okCaptcha,
          hashPassword: fakeHashPassword,
          verifyPassword: fakeVerifyPassword,
        },
      );
      assert.equal(result.ok, false, `пароль длиной ${password.length}`);
      if (result.ok) return;
      assert.equal(result.reason, "password_invalid");
      assert.equal(counters.createCalls, 0);
    }
  });

  it("пустой captcha-токен → captcha_missing (retry:true), captcha НЕ вызвана (R2.5)", async () => {
    const { repo, counters } = makeFakeRepo();
    let captchaCalls = 0;
    const result = await registerAccount(
      { phone: "89161234567", password: "hunter22", captchaToken: "   " },
      {
        accounts: repo,
        verifyCaptcha: async () => {
          captchaCalls++;
          return { success: true };
        },
        hashPassword: fakeHashPassword,
        verifyPassword: fakeVerifyPassword,
      },
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "captcha_missing");
    assert.equal(result.retry, true);
    assert.equal(counters.createCalls, 0);
    assert.equal(captchaCalls, 0, "серверная проверка captcha не должна вызываться при пустом токене");
  });

  it("captcha не пройдена → captcha_failed (retry:true), captcha вызвана, 0 аккаунтов", async () => {
    const { repo, counters } = makeFakeRepo();
    let captchaCalls = 0;
    const result = await registerAccount(
      { phone: "89161234567", password: "hunter22", captchaToken: "bad-token" },
      {
        accounts: repo,
        verifyCaptcha: async () => {
          captchaCalls++;
          return { success: false };
        },
        hashPassword: fakeHashPassword,
        verifyPassword: fakeVerifyPassword,
      },
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "captcha_failed");
    assert.equal(result.retry, true);
    assert.equal(counters.createCalls, 0);
    assert.equal(captchaCalls, 1);
  });

  it("уже зарегистрированный телефон → phone_taken, второй аккаунт не создан", async () => {
    const { repo, counters } = makeFakeRepo();
    repo.seed("+79161234567");
    let captchaCalls = 0;
    const result = await registerAccount(
      { phone: "8 (916) 123-45-67", password: "hunter22", captchaToken: "tok" },
      {
        accounts: repo,
        verifyCaptcha: async () => {
          captchaCalls++;
          return { success: true };
        },
        hashPassword: fakeHashPassword,
        verifyPassword: fakeVerifyPassword,
      },
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "phone_taken");
    assert.equal(counters.createCalls, 0, "дублирующий аккаунт не создаётся");
    assert.equal(captchaCalls, 1, "captcha проверяется до проверки уникальности");
  });
});
