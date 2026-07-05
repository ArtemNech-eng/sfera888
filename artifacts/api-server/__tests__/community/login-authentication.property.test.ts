/**
 * Property test P6 for `communityAuth.ts` → `loginAccount`.
 *
 * Property 6: Вход аутентифицирует по паре и не раскрывает фактор.
 *
 * **Validates: Requirements 3.1, 3.3, 3.4, 3.5, 3.6, 3.7, 6.4**
 *
 * Module under test (`src/lib/communityAuth.ts`):
 *   - `loginAccount(input, deps): Promise<LoginResult>`
 *       LoginResult = { ok: true; account } | { ok: false }.
 *       Порядок проверок (строго фиксирован в реализации), каждый отказ ЕДИНЫЙ
 *       и структурно идентичный `{ ok: false }`:
 *         1. `normalizeRuPhone(phone)` — ненормализуемый телефон (Requirement 3.3);
 *         2. `findByPhone(normalized)` — неизвестный телефон (Requirement 3.4);
 *         3. непустой `passwordHash` — отсутствует/пуст (Requirement 3.6);
 *         4. `verifyPassword(password, passwordHash)` — несовпадение (Requirement 3.5).
 *
 * Свойство P6 (design.md): для ЛЮБОГО репозитория аккаунтов и входа
 * `{phone, password}`: `loginAccount` возвращает УСПЕХ тогда и только тогда, когда
 *   (a) телефон нормализуется,
 *   (b) существует аккаунт с этим нормализованным телефоном,
 *   (c) у него задан непустой `password_hash`,
 *   (d) `verifyPassword(password, password_hash)` истинно.
 * Во всех остальных случаях (ненормализуемый телефон, неизвестный телефон,
 * отсутствующий хеш, неверный пароль) возвращается СТРУКТУРНО ИДЕНТИЧНЫЙ отказ
 * `{ ok: false }` без указания несовпавшего фактора (Requirement 3.7), Community_Session
 * не устанавливается, а хранимый `password_hash` остаётся НЕИЗМЕНЕН (Requirement 6.4).
 *
 * ПРИМЕЧАНИЕ О СЕССИИ (R3.1): отдельного роут-хендлера `POST /login`,
 * устанавливающего `session.communityAccountId`, эта чистая доменная функция
 * НАМЕРЕННО не касается. Единственный сигнал, гейтящий установку сессии в
 * роут-слое, — `result.ok`. Здесь проверяется доменный инвариант: успех несёт
 * валидный `account` (пригодный для `session.communityAccountId`), а любой отказ
 * — `{ ok: false }` без `account`, из-за чего роут НЕ установит сессию.
 *
 * Run via Node's built-in test runner (pnpm-store tsx binary):
 *   ./node_modules/.bin/tsx --test ./__tests__/community/login-authentication.property.test.ts
 */

// `communityAuth.ts` статически импортирует `@workspace/db`, который бросает на
// этапе загрузки модуля, если `DATABASE_URL` не задан. pg.Pool не подключается
// лениво, поэтому фиктивной строки достаточно — `loginAccount` в этом тесте
// работает через инъектированный fake-репозиторий и не выполняет запросов к БД.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// Динамический импорт с `.js`-расширением: гарантирует, что присваивание
// `DATABASE_URL` выше выполнится ДО загрузки `@workspace/db`.
const communityAuth = await import("../../src/lib/communityAuth.js");
const { loginAccount, normalizeRuPhone } = communityAuth;

// ─── Известная детерминированная «конвенция хеширования» ────────────────────

/**
 * Детерминированная замена bcryptjs для теста. `verifyPassword(pw, hash)` истинно
 * ⟺ `hash === convHash(pw)`. Base64 гарантирует, что хеш непуст, отличается от
 * открытого пароля и однозначно определяется паролем (никаких коллизий, никаких
 * ложных совпадений). Реальный bcrypt round-trip проверяется отдельно в P5.
 */
const HASH_PREFIX = "bcrypt-fake$";
function convHash(pw: string): string {
  return HASH_PREFIX + Buffer.from(pw, "utf8").toString("base64");
}
async function fakeVerifyPassword(pw: string, hash: string): Promise<boolean> {
  return convHash(pw) === hash;
}

// ─── Fake-аккаунт и репозиторий ─────────────────────────────────────────────

interface FakeAccount {
  id: number;
  phone: string; // Normalized_Phone (`+7XXXXXXXXXX`)
  phoneVerifiedAt: Date | null;
  passwordHash: string | null;
  role: string;
  zhkId: number | null;
  maxUserId: string | null;
  createdAt: Date;
}

/**
 * In-memory fake `CommunityAccountRepository` поверх посева. `findByPhone`
 * возвращает ССЫЛКУ на хранимый объект, поэтому любая мутация `passwordHash`
 * логикой входа была бы видна снаружи (проверка Requirement 6.4).
 */
function makeRepo(accounts: FakeAccount[]) {
  const counters = { findCalls: 0 };
  const repo = {
    async findByPhone(phone: string): Promise<FakeAccount | null> {
      counters.findCalls++;
      return accounts.find((a) => a.phone === phone) ?? null;
    },
    // Методы, не используемые входом — падаем громко при неожиданном вызове.
    async createVerified(): Promise<never> {
      throw new Error("createVerified не должен вызываться при входе");
    },
    async createWithPassword(): Promise<never> {
      throw new Error("createWithPassword не должен вызываться при входе");
    },
    async markVerified(): Promise<never> {
      throw new Error("markVerified не должен вызываться при входе");
    },
    async linkMax(): Promise<never> {
      throw new Error("linkMax не должен вызываться при входе");
    },
  };
  return { repo: repo as any, counters };
}

// ─── Arbitraries ────────────────────────────────────────────────────────────

const digitArb = fc.constantFrom("0", "1", "2", "3", "4", "5", "6", "7", "8", "9");

/** Национальный 10-значный номер (без кода страны). */
const national10Arb: fc.Arbitrary<string> = fc
  .array(digitArb, { minLength: 10, maxLength: 10 })
  .map((xs) => xs.join(""));

type PhoneForm = "ten" | "eight" | "seven" | "plus7";
const formArb = fc.constantFrom<PhoneForm>("ten", "eight", "seven", "plus7");

/** Одна и та же цифровая последовательность в разных эквивалентных формах. */
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
const sepArb = fc.constantFrom("", " ", "-", "(", ")", ".");

/** Сырой телефон из национального номера + форма + произвольные разделители. */
function renderRaw(national10: string, form: PhoneForm, lead: string, mid: string): string {
  const rendered = renderForm(national10, form);
  const cut = Math.floor(rendered.length / 2);
  return lead + rendered.slice(0, cut) + mid + rendered.slice(cut);
}

/** Пароль длиной 8–72 (Password_Policy), с явными границами 8 и 72. */
const passwordArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 6, arbitrary: fc.string({ minLength: 8, maxLength: 72 }) },
  {
    weight: 2,
    arbitrary: fc.constantFrom("12345678", "p".repeat(72), "        ", "Пароль!8"),
  },
);

/** Непустой телефон, который НЕ приводится к Normalized_Phone. */
const nonNormalizablePhoneArb: fc.Arbitrary<string> = fc
  .oneof(
    // Неверное число цифр: 1..9 или 12..14.
    fc
      .integer({ min: 1, max: 9 })
      .chain((n) => fc.array(digitArb, { minLength: n, maxLength: n }))
      .map((xs) => xs.join("")),
    fc
      .integer({ min: 12, max: 14 })
      .chain((n) => fc.array(digitArb, { minLength: n, maxLength: n }))
      .map((xs) => xs.join("")),
    // Буквенный мусор без цифр.
    fc.constantFrom("abcdef", "не телефон", "+++", "phone", "@@@@"),
  )
  .filter((s) => s.trim().length > 0 && normalizeRuPhone(s) === null);

// ─── Категории сценариев входа ──────────────────────────────────────────────
//
// Репозиторий детерминированно содержит:
//   • один аккаунт с непустым (валидным) `passwordHash` — цель success/wrong_password;
//   • один аккаунт с пустым/`null` `passwordHash`   — цель missing_hash;
//   • 0..3 случайных «шумовых» аккаунта (различные телефоны/хеши).
// Плюс зарезервированный национальный номер, ОТСУТСТВУЮЩИЙ в репозитории —
// цель unknown_phone. Это гарантирует покрытие всех пяти категорий.

type Category =
  | "success"
  | "wrong_password"
  | "missing_hash"
  | "unknown_phone"
  | "non_normalizable";

interface Scenario {
  accounts: FakeAccount[];
  input: { phone: unknown; password: unknown };
  category: Category;
  /** Ожидается ли успех по iff-условию P6. */
  expectSuccess: boolean;
  /** id аккаунта, ожидаемого при успехе (для success). */
  expectAccountId?: number;
  /** Должен ли `verifyPassword` быть вызван (только когда дошли до шага 4). */
  verifyShouldRun: boolean;
}

const missingHashKindArb = fc.constantFrom<"empty" | "null">("empty", "null");

const scenarioArb: fc.Arbitrary<Scenario> = fc
  .record({
    // >=4 различных номеров: valid, missing, unknown + шум.
    pool: fc.uniqueArray(national10Arb, { minLength: 4, maxLength: 9 }),
    validSecret: passwordArb,
    missingKind: missingHashKindArb,
    validVerified: fc.boolean(), // варьируем phoneVerifiedAt — на вход не влияет
    // Параметры «шумовых» аккаунтов (хеш валидного секрета или пустой).
    noiseHasHash: fc.array(fc.boolean(), { maxLength: 6 }),
    maxUserId: fc.option(fc.string({ maxLength: 12 }), { nil: null }),
    category: fc.constantFrom<Category>(
      "success",
      "wrong_password",
      "missing_hash",
      "unknown_phone",
      "non_normalizable",
    ),
    form: formArb,
    lead: sepArb,
    mid: sepArb,
    // Кандидат неверного пароля (для wrong_password); отфильтруем != validSecret.
    wrongPasswordSeed: fc.string({ maxLength: 80 }),
    // Пароль для категорий, где значение не влияет на исход.
    anyPassword: passwordArb,
    nonNormPhone: nonNormalizablePhoneArb,
  })
  .map((r) => {
    const validNational = r.pool[0];
    const missingNational = r.pool[1];
    const unknownNational = r.pool[2];
    const noiseNationals = r.pool.slice(3);

    let nextId = 1;
    const validAccount: FakeAccount = {
      id: nextId++,
      phone: "+7" + validNational,
      phoneVerifiedAt: r.validVerified ? new Date("2025-01-01T00:00:00.000Z") : null,
      passwordHash: convHash(r.validSecret),
      role: "resident",
      zhkId: null,
      maxUserId: r.maxUserId,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    const missingAccount: FakeAccount = {
      id: nextId++,
      phone: "+7" + missingNational,
      // Legacy/половинчатый аккаунт без пароля; phoneVerifiedAt тут не важен для входа.
      phoneVerifiedAt: null,
      passwordHash: r.missingKind === "empty" ? "" : null,
      role: "resident",
      zhkId: null,
      maxUserId: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    const noiseAccounts: FakeAccount[] = noiseNationals.map((nat, i) => ({
      id: nextId++,
      phone: "+7" + nat,
      phoneVerifiedAt: null,
      passwordHash: r.noiseHasHash[i] ? convHash("noise-secret-" + i) : "",
      role: "resident",
      zhkId: null,
      maxUserId: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    }));
    const accounts = [validAccount, missingAccount, ...noiseAccounts];

    // Неверный пароль: любой, чей хеш != хранимого (т.е. значение != validSecret).
    const wrongPassword =
      r.wrongPasswordSeed === r.validSecret
        ? r.validSecret + "x"
        : r.wrongPasswordSeed;

    let input: { phone: unknown; password: unknown };
    let expectSuccess = false;
    let expectAccountId: number | undefined;
    let verifyShouldRun = false;

    switch (r.category) {
      case "success":
        input = {
          phone: renderRaw(validNational, r.form, r.lead, r.mid),
          password: r.validSecret,
        };
        expectSuccess = true;
        expectAccountId = validAccount.id;
        verifyShouldRun = true;
        break;
      case "wrong_password":
        input = {
          phone: renderRaw(validNational, r.form, r.lead, r.mid),
          password: wrongPassword,
        };
        expectSuccess = false;
        verifyShouldRun = true;
        break;
      case "missing_hash":
        input = {
          phone: renderRaw(missingNational, r.form, r.lead, r.mid),
          password: r.anyPassword,
        };
        expectSuccess = false;
        verifyShouldRun = false; // отказ на шаге 3 — до verifyPassword
        break;
      case "unknown_phone":
        input = {
          phone: renderRaw(unknownNational, r.form, r.lead, r.mid),
          password: r.anyPassword,
        };
        expectSuccess = false;
        verifyShouldRun = false; // отказ на шаге 2
        break;
      case "non_normalizable":
        input = { phone: r.nonNormPhone, password: r.anyPassword };
        expectSuccess = false;
        verifyShouldRun = false; // отказ на шаге 1
        break;
    }

    return {
      accounts,
      input,
      category: r.category,
      expectSuccess,
      expectAccountId,
      verifyShouldRun,
    };
  });

// ─── Оракул iff-условия P6 ──────────────────────────────────────────────────
//
// Независимая эталонная реализация ТОЛЬКО iff-предиката (без мутаций и порядка
// раскрытия факторов): служит вторым свидетелем корректности `loginAccount`.
function oracleShouldSucceed(accounts: FakeAccount[], input: { phone: unknown; password: unknown }): FakeAccount | null {
  const raw = typeof input.phone === "string" ? input.phone.trim() : "";
  const phone = normalizeRuPhone(raw);
  if (phone === null) return null;
  const account = accounts.find((a) => a.phone === phone) ?? null;
  if (!account) return null;
  const hash = typeof account.passwordHash === "string" ? account.passwordHash : "";
  if (hash.length === 0) return null;
  const pw = typeof input.password === "string" ? input.password : "";
  if (convHash(pw) !== hash) return null;
  return account;
}

// ─── Property 6 — вход по паре, единый отказ, неизменность хеша ──────────────

describe("loginAccount — P6: вход по паре и неразглашение фактора", () => {
  // Feature: community-phone-registration, Property 6: вход аутентифицирует по
  // паре {phone, password} и не раскрывает фактор — успех ⟺ (телефон нормализуется
  // ∧ аккаунт существует ∧ непустой password_hash ∧ verifyPassword истинно); иначе
  // структурно идентичный { ok: false }, сессия не устанавливается, хеш неизменен.
  // Validates: Requirements 3.1, 3.3, 3.4, 3.5, 3.6, 3.7, 6.4

  it("успех ⟺ iff-условие; каждый отказ = { ok:false }; хеш неизменен; фактор не раскрыт", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        const { repo, counters } = makeRepo(scenario.accounts);

        // Снимок хранимых хешей ДО входа (Requirement 6.4 — неизменность).
        const hashesBefore = scenario.accounts.map((a) => a.passwordHash);

        let verifyCalls = 0;
        const verifyPassword = async (pw: string, hash: string) => {
          verifyCalls++;
          return fakeVerifyPassword(pw, hash);
        };

        const result = await loginAccount(scenario.input as any, {
          accounts: repo,
          verifyPassword,
        });

        // Второй свидетель: эталон iff.
        const oracleAccount = oracleShouldSucceed(scenario.accounts, scenario.input);
        const oracleSuccess = oracleAccount !== null;

        // Согласованность категории сценария и оракула (санити генератора).
        assert.equal(
          oracleSuccess,
          scenario.expectSuccess,
          `[${scenario.category}] оракул и ожидание категории разошлись`,
        );

        if (scenario.expectSuccess) {
          // (R3.1) Успех ⟺ iff-условие выполнено.
          assert.equal(
            result.ok,
            true,
            `[${scenario.category}] ожидался ok:true; got=${JSON.stringify(result)}`,
          );
          if (!result.ok) return; // narrow
          // Возвращён именно найденный аккаунт (пригоден для session.communityAccountId).
          assert.equal(result.account.id, scenario.expectAccountId, "возвращён корректный аккаунт");
          assert.equal(result.account.id, oracleAccount!.id, "аккаунт совпадает с оракулом");
          assert.ok(
            Number.isInteger(result.account.id) && result.account.id > 0,
            "account.id пригоден для сессии",
          );
        } else {
          // (R3.3–3.7) Любой отказ — СТРУКТУРНО ИДЕНТИЧНЫЙ { ok:false }, без reason
          // и без указания несовпавшего фактора; account не возвращается.
          assert.deepEqual(
            result,
            { ok: false },
            `[${scenario.category}] отказ должен быть ровно { ok:false } без раскрытия фактора`,
          );
          assert.ok(!("account" in (result as object)), "отказ не несёт account (сессия невозможна)");
        }

        // (R6.4) Хранимый password_hash НИ ОДНОГО аккаунта не изменился.
        const hashesAfter = scenario.accounts.map((a) => a.passwordHash);
        assert.deepEqual(
          hashesAfter,
          hashesBefore,
          `[${scenario.category}] password_hash не должен мутировать при входе`,
        );

        // Ленивость раскрытия фактора: verifyPassword вызывается ТОЛЬКО когда
        // телефон нормализован, аккаунт найден и хеш непуст (шаг 4). При отказе
        // на шагах 1–3 сравнение пароля не выполняется вовсе.
        if (scenario.verifyShouldRun) {
          assert.equal(verifyCalls, 1, `[${scenario.category}] verifyPassword ожидался ровно 1 вызов`);
        } else {
          assert.equal(verifyCalls, 0, `[${scenario.category}] verifyPassword не должен вызываться`);
          // Санити ленивости поиска: для ненормализуемого телефона репозиторий не опрашивается.
          if (scenario.category === "non_normalizable") {
            assert.equal(counters.findCalls, 0, "findByPhone не вызывается для ненормализуемого телефона");
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});

// ─── Явные примеры по каждой категории (якоря iff и единого отказа) ─────────

describe("loginAccount — P6: явные примеры каждой категории", () => {
  // Feature: community-phone-registration, Property 6: вход по паре и неразглашение фактора.
  // Validates: Requirements 3.1, 3.3, 3.4, 3.5, 3.6, 3.7, 6.4

  const SECRET = "hunter22";
  function seededRepo() {
    const accounts: FakeAccount[] = [
      {
        id: 1,
        phone: "+79161234567",
        phoneVerifiedAt: null,
        passwordHash: convHash(SECRET),
        role: "resident",
        zhkId: null,
        maxUserId: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        id: 2,
        phone: "+79990001122",
        phoneVerifiedAt: new Date("2025-01-01T00:00:00.000Z"),
        passwordHash: null, // Legacy_Verified_Account без пароля
        role: "resident",
        zhkId: null,
        maxUserId: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ];
    return { accounts, ...makeRepo(accounts) };
  }
  const deps = () => ({ verifyPassword: fakeVerifyPassword });

  it("success: 8XXXXXXXXXX + верный пароль → ok:true с этим аккаунтом", async () => {
    const { accounts, repo } = seededRepo();
    const result = await loginAccount(
      { phone: "8 (916) 123-45-67", password: SECRET },
      { accounts: repo, ...deps() },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.account.id, 1);
    assert.equal(result.account.phone, "+79161234567");
    // Хеш неизменен.
    assert.equal(accounts[0].passwordHash, convHash(SECRET));
  });

  it("wrong_password: верный телефон + неверный пароль → ровно { ok:false }", async () => {
    const { accounts, repo } = seededRepo();
    const before = accounts[0].passwordHash;
    const result = await loginAccount(
      { phone: "+79161234567", password: "not-the-secret" },
      { accounts: repo, ...deps() },
    );
    assert.deepEqual(result, { ok: false });
    assert.equal(accounts[0].passwordHash, before);
  });

  it("missing_hash: аккаунт без password_hash → ровно { ok:false } (verify не вызван)", async () => {
    const { repo, counters } = seededRepo();
    let verifyCalls = 0;
    const result = await loginAccount(
      { phone: "+79990001122", password: "whatever8" },
      {
        accounts: repo,
        verifyPassword: async (pw, hash) => {
          verifyCalls++;
          return fakeVerifyPassword(pw, hash);
        },
      },
    );
    assert.deepEqual(result, { ok: false });
    assert.equal(verifyCalls, 0, "при пустом хеше сравнение пароля не выполняется");
    assert.ok(counters.findCalls >= 1);
  });

  it("unknown_phone: телефон нормализуется, но аккаунта нет → ровно { ok:false }", async () => {
    const { repo } = seededRepo();
    const result = await loginAccount(
      { phone: "+79005556677", password: "whatever8" },
      { accounts: repo, ...deps() },
    );
    assert.deepEqual(result, { ok: false });
  });

  it("non_normalizable: телефон не нормализуется → ровно { ok:false } (findByPhone не вызван)", async () => {
    const { repo, counters } = seededRepo();
    const result = await loginAccount(
      { phone: "12345", password: "whatever8" },
      { accounts: repo, ...deps() },
    );
    assert.deepEqual(result, { ok: false });
    assert.equal(counters.findCalls, 0, "ненормализуемый телефон не доходит до репозитория");
  });

  it("единый отказ: unknown_phone и wrong_password структурно неотличимы (R3.7)", async () => {
    const a = await loginAccount(
      { phone: "+79005556677", password: "whatever8" },
      { accounts: seededRepo().repo, ...deps() },
    );
    const b = await loginAccount(
      { phone: "+79161234567", password: "wrong-pass" },
      { accounts: seededRepo().repo, ...deps() },
    );
    assert.deepEqual(a, b, "отказы по разным факторам должны быть идентичны");
    assert.deepEqual(a, { ok: false });
  });
});
