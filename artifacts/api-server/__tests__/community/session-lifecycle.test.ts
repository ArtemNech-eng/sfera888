/**
 * Example tests for Community Auth_Service session lifecycle + captcha
 * unavailability (Task 4.4).
 *
 * // Feature: community-phone-registration, Task 4.4 (session lifecycle + captcha unavailable)
 *
 * **Validates: Requirements 2.7, 4.1, 4.6**
 *   • 4.1 — logout при действительной сессии завершает Community_Session; после
 *     этого идентификатор аккаунта по этой сессии недоступен (последующий
 *     GET /me → 401 unauthorized).
 *   • 4.6 — logout без действительной сессии → 200 {ok:true, noSession:true},
 *     без ошибок и без изменения состояния других сессий.
 *   • 2.7 — серверная проверка Captcha недоступна (verifyCaptcha бросает) →
 *     регистрация отклоняется с 503 {reason:"captcha_unavailable", retry:true}.
 *
 * Хендлеры прогоняются напрямую с фейковыми зависимостями и mock req/res —
 * без БД, без сети/SMS и без поднятия HTTP-сервера.
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

/**
 * Session, эмулирующая express-session: `destroy(cb)` удаляет
 * `communityAccountId` (как реальный стор при уничтожении сессии) и вызывает cb.
 */
function makeSession(communityAccountId?: number): any {
  const session: any = {
    cookie: {},
    destroy(cb: (err?: unknown) => void) {
      delete session.communityAccountId;
      cb();
    },
  };
  if (typeof communityAccountId === "number") {
    session.communityAccountId = communityAccountId;
  }
  return session;
}

/** Минимальный mock Request с общим объектом сессии. */
function mockReq(opts: { session: any; body?: unknown; ip?: string }): any {
  return {
    session: opts.session,
    body: opts.body,
    ip: opts.ip ?? "127.0.0.1",
    headers: {},
  };
}

/** Фейковый репозиторий аккаунтов (password-поток): findByPhone / createWithPassword. */
function createFakeAccounts(): CommunityAccountRepository {
  const rows: CommunityAccount[] = [];
  let nextId = 1;
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

/** Собрать зависимости роутера; loadAccount читает из мапы аккаунтов по id. */
function makeDeps(
  overrides: Partial<AuthRouterDeps> = {},
  accountsById: Map<number, CommunityAccount> = new Map(),
): AuthRouterDeps {
  const verification: PhoneVerificationDeps = {};
  return {
    verification,
    loadAccount: async (id: number) => accountsById.get(id) ?? null,
    auth: {},
    ...overrides,
  };
}

// ─── Requirement 4.1 — logout уничтожает сессию; следующий /me → 401 ─────────

describe("community/auth logout — жизненный цикл сессии (R4.1, R4.6)", () => {
  it("logout при действительной сессии → {ok:true}; последующий GET /me → 401 unauthorized (R4.1)", async () => {
    const accountId = 7;
    const account = {
      id: accountId,
      phone: "+79161234567",
      passwordHash: "hash",
      phoneVerifiedAt: null,
      role: "resident",
      zhkId: null,
      maxUserId: null,
      createdAt: new Date(),
    } as CommunityAccount;

    const accountsById = new Map<number, CommunityAccount>([[accountId, account]]);
    const handlers = makeHandlers(makeDeps({}, accountsById));

    // Общий объект сессии: сначала аутентифицирован (communityAccountId задан).
    const session = makeSession(accountId);

    // /me до logout — сессия действительна, аккаунт найден → 200 с аккаунтом.
    const meBefore = mockRes();
    await handlers.me(mockReq({ session }), meBefore as any);
    assert.equal(meBefore.statusCode, 200);
    assert.equal(meBefore.body.account.id, accountId);

    // logout — завершает сессию (destroy удаляет communityAccountId) → 200 {ok:true}.
    const logoutRes = mockRes();
    await handlers.logout(mockReq({ session }), logoutRes as any);
    assert.equal(logoutRes.statusCode, 200);
    assert.deepEqual(logoutRes.body, { ok: true });

    // После logout идентификатор по этой сессии недоступен: /me → 401.
    const meAfter = mockRes();
    await handlers.me(mockReq({ session }), meAfter as any);
    assert.equal(meAfter.statusCode, 401);
    assert.deepEqual(meAfter.body, { error: "unauthorized" });
  });

  it("logout без действительной сессии → 200 {ok:true, noSession:true} (R4.6)", async () => {
    const handlers = makeHandlers(makeDeps());

    // Сессия без communityAccountId — не аутентифицирована.
    const session = makeSession();
    let destroyed = false;
    session.destroy = (cb: (err?: unknown) => void) => {
      destroyed = true;
      cb();
    };

    const res = mockRes();
    await handlers.logout(mockReq({ session }), res as any);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true, noSession: true });
    // Состояние других сессий не изменяется: destroy не вызывался.
    assert.equal(destroyed, false, "destroy не должен вызываться без активной сессии");
  });
});

// ─── Requirement 2.7 — captcha недоступна → 503 captcha_unavailable ──────────

describe("community/auth register — captcha недоступна (R2.7)", () => {
  it("verifyCaptcha бросает (сервис недоступен/таймаут) → 503 {reason:'captcha_unavailable', retry:true}", async () => {
    const accounts = createFakeAccounts();
    let captchaCalls = 0;

    const deps = makeDeps({
      auth: {
        accounts,
        // Fail-closed: серверная проверка captcha бросает (недоступность/таймаут).
        verifyCaptcha: async () => {
          captchaCalls++;
          throw new Error("captcha service timeout");
        },
        // hashPassword не должен вызываться (captcha падает до хеширования).
        hashPassword: async () => {
          throw new Error("hashPassword не должен вызываться при недоступной captcha");
        },
        verifyPassword: async () => false,
      },
    });
    const handlers = makeHandlers(deps);

    // Валидный телефон + пароль 8..72 + непустой captchaToken → доходит до captcha.
    const session = makeSession();
    const res = mockRes();
    await handlers.register(
      mockReq({
        session,
        body: { phone: "+79161234567", password: "hunter22", captchaToken: "smart-token" },
      }),
      res as any,
    );

    assert.equal(res.statusCode, 503);
    assert.equal(res.body.reason, "captcha_unavailable");
    assert.equal(res.body.retry, true);
    assert.equal(captchaCalls, 1, "серверная проверка captcha должна быть вызвана ровно один раз");
    // Отказ не устанавливает Community_Session.
    assert.equal(session.communityAccountId, undefined);
    // Аккаунт не создан: findByPhone по этому телефону возвращает null.
    assert.equal(await accounts.findByPhone("+79161234567"), null);
  });
});
