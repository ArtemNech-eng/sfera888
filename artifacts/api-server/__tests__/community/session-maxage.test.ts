/**
 * Smoke test for Community_Session cookie maxAge (Task 4.6).
 *
 * // Feature: community-phone-registration, Task 4.6 (session maxAge 30d), Validates: Requirements 4.5
 *
 * **Validates: Requirements 4.5** — WHILE с момента создания Community_Session
 * прошло не более 30 дней, THE Community_Auth_Service SHALL считать сессию
 * действительной. Гарантия срока обеспечивается тем, что при установке
 * community-сессии (успешные register/login) роут-хендлер выставляет
 * `req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000` (30 дней), переопределяя
 * глобальный дефолт `app.ts` (1 день).
 *
 * Хендлеры прогоняются напрямую с фейковыми зависимостями и mock req/res —
 * без БД, без сети/bcrypt-сети и без поднятия HTTP-сервера.
 *
 * Run: pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { CommunityAccount } from "@workspace/db";
import type {
  CommunityAccountRepository,
  PhoneVerificationDeps,
} from "../../src/lib/communityAuth.js";
import type { AuthRouterDeps } from "../../src/routes/community/auth.js";

// `@workspace/db` бросает при загрузке модуля без DATABASE_URL. Тестируемая
// логика маршрутов чистая (сервисы инъектируются), поэтому даём фиктивный URL
// исключительно чтобы пройти проверку импорта, и подгружаем роутер динамически.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { makeHandlers } = await import("../../src/routes/community/auth.js");

/** Ожидаемый срок действия Community_Session — ровно 30 дней (Requirement 4.5). */
const EXPECTED_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

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

/** Минимальный mock Request с сессией, несущей объект cookie (как express-session). */
function mockReq(opts: { session: any; body?: unknown; ip?: string }): any {
  return {
    session: opts.session,
    body: opts.body,
    ip: opts.ip ?? "127.0.0.1",
    headers: {},
  };
}

/** Фейковый репозиторий аккаунтов (password-поток): findByPhone / createWithPassword. */
function createFakeAccounts(seed: CommunityAccount[] = []): CommunityAccountRepository {
  const rows: CommunityAccount[] = [...seed];
  let nextId = seed.reduce((max, r) => Math.max(max, r.id), 0) + 1;
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

/** Собрать зависимости роутера с инъектированным password-потоком. */
function makeDeps(auth: AuthRouterDeps["auth"]): AuthRouterDeps {
  const verification: PhoneVerificationDeps = {};
  return {
    verification,
    loadAccount: async () => null,
    auth,
  };
}

// ─── Requirement 4.5 — cookie.maxAge == 30 дней при установке community-сессии ─

describe("community/auth — срок действия Community_Session (R4.5, smoke)", () => {
  it("успешный register выставляет session.communityAccountId и cookie.maxAge == 30 дней", async () => {
    const accounts = createFakeAccounts();
    const handlers = makeHandlers(
      makeDeps({
        accounts,
        // Captcha пройдена.
        verifyCaptcha: async () => ({ success: true }),
        // Детерминированный непустой хеш (без реального bcrypt).
        hashPassword: async () => "bcrypt-hash-value",
        verifyPassword: async () => true,
      }),
    );

    const session: any = { cookie: {} };
    const res = mockRes();
    await handlers.register(
      mockReq({
        session,
        body: { phone: "+79161234567", password: "hunter22", captchaToken: "smart-token" },
      }),
      res as any,
    );

    // Регистрация успешна → 201, сессия установлена.
    assert.equal(res.statusCode, 201, "успешная регистрация должна вернуть 201");
    assert.equal(typeof session.communityAccountId, "number");
    assert.ok(session.communityAccountId > 0, "communityAccountId должен быть установлен");
    // Ключевой инвариант R4.5: срок cookie ровно 30 дней.
    assert.equal(session.cookie.maxAge, EXPECTED_MAX_AGE_MS);
    assert.equal(session.cookie.maxAge, 2_592_000_000);
  });

  it("успешный login выставляет cookie.maxAge == 30 дней", async () => {
    const seeded = {
      id: 42,
      phone: "+79161234567",
      passwordHash: "bcrypt-hash-value",
      phoneVerifiedAt: null,
      role: "resident",
      zhkId: null,
      maxUserId: null,
      createdAt: new Date(),
    } as CommunityAccount;

    const accounts = createFakeAccounts([seeded]);
    const handlers = makeHandlers(
      makeDeps({
        accounts,
        // Пароль совпадает.
        verifyPassword: async () => true,
        hashPassword: async () => "bcrypt-hash-value",
      }),
    );

    const session: any = { cookie: {} };
    const res = mockRes();
    await handlers.login(
      mockReq({
        session,
        body: { phone: "+79161234567", password: "hunter22" },
      }),
      res as any,
    );

    assert.equal(res.statusCode, 200, "успешный вход должен вернуть 200");
    assert.equal(session.communityAccountId, 42);
    // Ключевой инвариант R4.5: срок cookie ровно 30 дней.
    assert.equal(session.cookie.maxAge, EXPECTED_MAX_AGE_MS);
    assert.equal(session.cookie.maxAge, 2_592_000_000);
  });
});
