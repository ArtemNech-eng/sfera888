/**
 * Unit tests for Community Auth_Service routes (Task 8.4).
 *
 * **Validates: Requirements 11.1, 11.2** — маршруты `/api/community/auth`:
 *   • POST /request-code — выпуск кода Phone_Verification (11.1);
 *   • POST /confirm-code — подтверждение кода, создание Community_Account с
 *     немедленными правами публикации (11.1, 11.4);
 *   • POST /link-max — опциональная привязка Max_Login, не влияющая на права
 *     (11.2, 11.4).
 *
 * Хендлеры прогоняются напрямую с фейковыми зависимостями и mock req/res —
 * без БД, без SMS и без поднятия HTTP-сервера.
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

// `@workspace/db` кидает при загрузке модуля без DATABASE_URL. Тестируемая
// логика маршрутов чистая (сервисы инъектируются), поэтому даём фиктивный URL
// исключительно чтобы пройти проверку импорта, и подгружаем роутер динамически.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { makeHandlers, resolveAccountId, ACCOUNT_ID_HEADER } = await import(
  "../../src/routes/community/auth.js"
);
const { createInMemoryCodeStore } = await import("../../src/lib/communityAuth.js");

// ─── Тестовые дублёры ────────────────────────────────────────────────────────

/** Mock Response, захватывающий статус и тело. */
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

/** Минимальный mock Request. */
function mockReq(opts: {
  headers?: Record<string, string>;
  body?: unknown;
}): any {
  return {
    headers: opts.headers ?? {},
    body: opts.body,
  };
}

/** Фейковый in-memory репозиторий аккаунтов (без БД). */
function createFakeAccounts(): CommunityAccountRepository & { rows: CommunityAccount[] } {
  const rows: CommunityAccount[] = [];
  let nextId = 1;
  const base = (phone: string): CommunityAccount =>
    ({
      id: nextId++,
      phone,
      phoneVerifiedAt: null,
      role: "resident",
      zhkId: null,
      maxUserId: null,
      createdAt: new Date(),
    }) as CommunityAccount;

  return {
    rows,
    async findByPhone(phone) {
      return rows.find((r) => r.phone === phone) ?? null;
    },
    async createVerified(phone, verifiedAt) {
      const row = base(phone);
      row.phoneVerifiedAt = verifiedAt;
      rows.push(row);
      return row;
    },
    async markVerified(accountId, verifiedAt) {
      const row = rows.find((r) => r.id === accountId)!;
      row.phoneVerifiedAt = verifiedAt;
      return row;
    },
    async linkMax(accountId, maxUserId) {
      const row = rows.find((r) => r.id === accountId)!;
      row.maxUserId = maxUserId;
      return row;
    },
  };
}

/** Собрать зависимости роутера с перехватом отправленного кода и общим репозиторием. */
function makeDeps(): {
  deps: AuthRouterDeps;
  sent: { code?: string };
  accounts: CommunityAccountRepository & { rows: CommunityAccount[] };
} {
  const sent: { code?: string } = {};
  const accounts = createFakeAccounts();
  const verification: PhoneVerificationDeps = {
    store: createInMemoryCodeStore(),
    accounts,
    sendCode: ({ code }) => {
      sent.code = code;
    },
  };
  // loadAccount читает из того же фейкового репозитория (по id).
  const loadAccount = async (id: number) => accounts.rows.find((r) => r.id === id) ?? null;
  return { deps: { verification, loadAccount }, sent, accounts };
}

describe("community/auth routes (Requirements 11.1, 11.2)", () => {
  it("POST /request-code выпускает код и НЕ возвращает его клиенту (R11.1)", async () => {
    const { deps, sent } = makeDeps();
    const handlers = makeHandlers(deps);

    const res = mockRes();
    await handlers.requestCode(mockReq({ body: { phone: "+7 999 123-45-67" } }), res as any);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.phone, "+79991234567");
    assert.ok(typeof res.body.expiresAt === "number");
    // Сам код не утекает в ответ, но доставлен через инъектируемый sender.
    assert.equal("code" in res.body, false);
    assert.ok(sent.code, "код должен быть доставлен sender-ом");
  });

  it("POST /request-code с некорректным телефоном → 400 phone_invalid", async () => {
    const { deps } = makeDeps();
    const handlers = makeHandlers(deps);

    const res = mockRes();
    await handlers.requestCode(mockReq({ body: { phone: "12345" } }), res as any);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, "phone_invalid");
  });

  it("POST /confirm-code создаёт аккаунт с НЕМЕДЛЕННЫМИ правами публикации (R11.1, R11.4)", async () => {
    const { deps, sent } = makeDeps();
    const handlers = makeHandlers(deps);

    const reqRes = mockRes();
    await handlers.requestCode(mockReq({ body: { phone: "+79991234567" } }), reqRes as any);

    const res = mockRes();
    await handlers.confirmCode(
      mockReq({ body: { phone: "+79991234567", code: sent.code } }),
      res as any,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    // Права выданы сразу: phoneVerifiedAt проставлен, Max не требовался.
    assert.ok(res.body.account.phoneVerifiedAt != null);
    assert.equal(res.body.account.maxUserId ?? null, null);
  });

  it("POST /confirm-code с неверным кодом → 400 code_invalid", async () => {
    const { deps } = makeDeps();
    const handlers = makeHandlers(deps);

    await handlers.requestCode(mockReq({ body: { phone: "+79991234567" } }), mockRes() as any);

    const res = mockRes();
    await handlers.confirmCode(
      mockReq({ body: { phone: "+79991234567", code: "000000-wrong" } }),
      res as any,
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, "code_invalid");
  });

  it("POST /confirm-code без предварительного запроса → 400 code_not_requested", async () => {
    const { deps } = makeDeps();
    const handlers = makeHandlers(deps);

    const res = mockRes();
    await handlers.confirmCode(
      mockReq({ body: { phone: "+79991234567", code: "123456" } }),
      res as any,
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, "code_not_requested");
  });

  it("POST /link-max привязывает Max к верифицированному аккаунту, не меняя прав (R11.2, R11.4)", async () => {
    const { deps, sent } = makeDeps();
    const handlers = makeHandlers(deps);

    await handlers.requestCode(mockReq({ body: { phone: "+79991234567" } }), mockRes() as any);
    const confirmRes = mockRes();
    await handlers.confirmCode(
      mockReq({ body: { phone: "+79991234567", code: sent.code } }),
      confirmRes as any,
    );
    const accountId = confirmRes.body.account.id;

    const res = mockRes();
    await handlers.linkMax(
      mockReq({
        headers: { [ACCOUNT_ID_HEADER]: String(accountId) },
        body: { maxUserId: "max-42" },
      }),
      res as any,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.account.maxUserId, "max-42");
    // Привязка Max не изменила факт верификации (права сохраняются по телефону).
    assert.ok(res.body.account.phoneVerifiedAt != null);
  });

  it("POST /link-max без идентификатора аккаунта → 401 account_required", async () => {
    const { deps } = makeDeps();
    const handlers = makeHandlers(deps);

    const res = mockRes();
    await handlers.linkMax(mockReq({ body: { maxUserId: "max-1" } }), res as any);

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, "account_required");
  });

  it("POST /link-max для неверифицированного аккаунта → 403 verification_required (Max не гейт, R11.4)", async () => {
    const { deps, accounts } = makeDeps();
    const handlers = makeHandlers(deps);

    // Аккаунт без Phone_Verification (черновиковое состояние).
    accounts.rows.push({
      id: 99,
      phone: "+79990000000",
      phoneVerifiedAt: null,
      role: "resident",
      zhkId: null,
      maxUserId: null,
      createdAt: new Date(),
    } as CommunityAccount);

    const res = mockRes();
    await handlers.linkMax(
      mockReq({ headers: { [ACCOUNT_ID_HEADER]: "99" }, body: { maxUserId: "max-1" } }),
      res as any,
    );

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, "verification_required");
  });

  it("POST /link-max без maxUserId → 400 max_user_id_required", async () => {
    const { deps, sent } = makeDeps();
    const handlers = makeHandlers(deps);

    await handlers.requestCode(mockReq({ body: { phone: "+79991234567" } }), mockRes() as any);
    const confirmRes = mockRes();
    await handlers.confirmCode(
      mockReq({ body: { phone: "+79991234567", code: sent.code } }),
      confirmRes as any,
    );
    const accountId = confirmRes.body.account.id;

    const res = mockRes();
    await handlers.linkMax(
      mockReq({ headers: { [ACCOUNT_ID_HEADER]: String(accountId) }, body: {} }),
      res as any,
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, "max_user_id_required");
  });
});

describe("community/auth.resolveAccountId", () => {
  it("берёт идентификатор из заголовка (приоритет) и тела", () => {
    assert.equal(resolveAccountId({ headers: { [ACCOUNT_ID_HEADER]: "42" } }), 42);
    assert.equal(resolveAccountId({ headers: {}, body: { accountId: 7 } }), 7);
    assert.equal(
      resolveAccountId({ headers: { [ACCOUNT_ID_HEADER]: "5" }, body: { accountId: 99 } }),
      5,
    );
  });

  it("возвращает null для отсутствующих/некорректных значений", () => {
    assert.equal(resolveAccountId({ headers: {} }), null);
    assert.equal(resolveAccountId({ headers: { [ACCOUNT_ID_HEADER]: "abc" } }), null);
    assert.equal(resolveAccountId({ headers: {}, body: { accountId: 0 } }), null);
    assert.equal(resolveAccountId({ headers: {}, body: { accountId: -3 } }), null);
  });
});
