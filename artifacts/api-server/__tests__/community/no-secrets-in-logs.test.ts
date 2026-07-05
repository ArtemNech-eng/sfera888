/**
 * Example test: отсутствие секретов в журнале приложения (Task 4.5).
 *
 * // Feature: community-phone-registration, Task 4.5 (no secrets in logs), Validates: Requirements 6.5
 *
 * **Validates: Requirements 6.5**
 *   • 6.5 — WHEN Community_Auth_Service записывает любую запись в журналы
 *     приложения (включая записи об ошибках и трассировки стека), THE
 *     Community_Auth_Service SHALL исключать значения Password и Password_Hash
 *     из содержимого записи.
 *
 * Роут-хендлеры `register` / `login` логируют ошибки через `console.error`
 * внутри try/catch. Тест ПРИНУДИТЕЛЬНО заводит catch-путь: инъектированные
 * зависимости бросают Error (`hashPassword` при регистрации, `verifyPassword`
 * при входе). Перехватываем ВСЕ аргументы `console.error` (со стрингификацией,
 * включая стек любого Error) и утверждаем, что в журнале НЕТ ни открытого
 * Password, ни значения Password_Hash-сентинела.
 *
 * Хендлеры прогоняются напрямую с фейковыми зависимостями и mock req/res —
 * без БД, без сети/SMS и без поднятия HTTP-сервера.
 *
 * Run: pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { CommunityAccount } from "@workspace/db";
import type { CommunityAccountRepository } from "../../src/lib/communityAuth.js";
import type { AuthRouterDeps } from "../../src/routes/community/auth.js";

// `@workspace/db` бросает при загрузке модуля без DATABASE_URL. Тестируемая
// логика маршрутов чистая (сервисы инъектируются), поэтому даём фиктивный URL
// исключительно чтобы пройти проверку импорта, и подгружаем роутер динамически.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { makeHandlers } = await import("../../src/routes/community/auth.js");

// ─── Отличительные секреты (не должны попасть ни в одну запись журнала) ───────

/** Отличительный открытый Password — искомая «утечка» при регистрации. */
const SECRET_PASSWORD = "SuperSecretPassw0rd!";
/** Отличительный Password_Hash-сентинел — искомая «утечка» при входе. */
const HASH_SENTINEL = "HASH_SENTINEL_$2b$10$xxxxxx";

// ─── Тестовые дублёры ────────────────────────────────────────────────────────

/** Mock Response, захватывающий статус и тело (chainable status/json). */
function mockRes() {
  const res: {
    statusCode: number;
    body: any;
    status: (code: number) => typeof res;
    json: (payload: unknown) => typeof res;
  } = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

/** Минимальный mock Request с объектом сессии. */
function mockReq(opts: { body?: unknown; ip?: string }): any {
  return {
    session: { cookie: {} },
    body: opts.body,
    ip: opts.ip ?? "127.0.0.1",
    headers: {},
  };
}

/**
 * Перехват console.error: заменяет его собирающим коллектором, сериализует ВСЕ
 * аргументы (включая message и stack любого Error) в единый текст и гарантирует
 * восстановление оригинала в finally.
 */
async function captureConsoleError(run: () => Promise<void>): Promise<string> {
  const original = console.error;
  const parts: string[] = [];
  const serialize = (arg: unknown): string => {
    if (arg instanceof Error) {
      // Полностью раскрываем ошибку: имя, сообщение и трассировку стека.
      return `${arg.name}: ${arg.message}\n${arg.stack ?? ""}`;
    }
    if (typeof arg === "string") return arg;
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  };
  console.error = (...args: unknown[]) => {
    parts.push(args.map(serialize).join(" "));
  };
  try {
    await run();
  } finally {
    console.error = original;
  }
  return parts.join("\n");
}

/** Фейковый репозиторий: findByPhone / createWithPassword (password-поток). */
function createFakeAccounts(seed: CommunityAccount[] = []): CommunityAccountRepository {
  const rows: CommunityAccount[] = [...seed];
  let nextId = seed.length + 1;
  return {
    async findByPhone(phone) {
      return rows.find((r) => r.phone === phone) ?? null;
    },
    async createWithPassword(phone, passwordHash) {
      const row = {
        id: nextId++,
        phone,
        passwordHash,
        phoneVerifiedAt: null,
        role: "resident",
        zhkId: null,
        maxUserId: null,
        createdAt: new Date(),
      } as CommunityAccount;
      rows.push(row);
      return row;
    },
    async createVerified(): Promise<never> {
      throw new Error("createVerified не должен вызываться в этом тесте");
    },
    async markVerified(): Promise<never> {
      throw new Error("markVerified не должен вызываться в этом тесте");
    },
    async linkMax(): Promise<never> {
      throw new Error("linkMax не должен вызываться в этом тесте");
    },
  };
}

/** Собрать зависимости роутера с инъекцией password-потока. */
function makeDeps(auth: AuthRouterDeps["auth"]): AuthRouterDeps {
  return {
    verification: {},
    loadAccount: async () => null,
    auth,
  };
}

// ─── Requirement 6.5 — регистрация: ошибка в catch-пути не логирует Password ──

describe("community/auth — секреты отсутствуют в журнале (R6.5)", () => {
  it("register: ошибка (hashPassword бросает) → журнал НЕ содержит открытый Password", async () => {
    const accounts = createFakeAccounts();
    const deps = makeDeps({
      accounts,
      // Captcha проходит, чтобы дойти до хеширования.
      verifyCaptcha: async () => ({ success: true }),
      // Хеширование бросает — заводит catch-путь хендлера (и логирование).
      hashPassword: async () => {
        throw new Error("bcrypt backend failure while hashing");
      },
      verifyPassword: async () => false,
    });
    const handlers = makeHandlers(deps);

    const res = mockRes();
    const logged = await captureConsoleError(async () => {
      await handlers.register(
        mockReq({
          body: {
            phone: "+79161234567",
            password: SECRET_PASSWORD,
            captchaToken: "smart-token",
          },
        }),
        res as any,
      );
    });

    // Catch-путь действительно сработал: внутренняя ошибка → 500, что-то залогировано.
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error, "internal_error");
    assert.ok(logged.length > 0, "ожидалась запись в журнале об ошибке регистрации");

    // Главный инвариант R6.5: открытый Password не попал в журнал.
    assert.ok(
      !logged.includes(SECRET_PASSWORD),
      `открытый Password не должен присутствовать в журнале; запись:\n${logged}`,
    );
  });

  it("login: ошибка (verifyPassword бросает) → журнал НЕ содержит Password и Password_Hash", async () => {
    // Сид-аккаунт с отличительным Password_Hash-сентинелом.
    const seeded = {
      id: 1,
      phone: "+79161234567",
      passwordHash: HASH_SENTINEL,
      phoneVerifiedAt: null,
      role: "resident",
      zhkId: null,
      maxUserId: null,
      createdAt: new Date(),
    } as CommunityAccount;

    const accounts = createFakeAccounts([seeded]);
    const deps = makeDeps({
      accounts,
      verifyCaptcha: async () => ({ success: true }),
      hashPassword: async () => "unused",
      // Проверка пароля бросает — заводит catch-путь хендлера входа.
      verifyPassword: async () => {
        throw new Error("bcrypt compare backend failure");
      },
    });
    const handlers = makeHandlers(deps);

    const res = mockRes();
    const logged = await captureConsoleError(async () => {
      await handlers.login(
        mockReq({
          body: { phone: "+79161234567", password: SECRET_PASSWORD },
        }),
        res as any,
      );
    });

    // Catch-путь сработал: внутренняя ошибка → 500, запись в журнале есть.
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error, "internal_error");
    assert.ok(logged.length > 0, "ожидалась запись в журнале об ошибке входа");

    // Инвариант R6.5: ни открытый Password, ни Password_Hash не попали в журнал.
    assert.ok(
      !logged.includes(SECRET_PASSWORD),
      `открытый Password не должен присутствовать в журнале; запись:\n${logged}`,
    );
    assert.ok(
      !logged.includes(HASH_SENTINEL),
      `Password_Hash не должен присутствовать в журнале; запись:\n${logged}`,
    );
  });
});
