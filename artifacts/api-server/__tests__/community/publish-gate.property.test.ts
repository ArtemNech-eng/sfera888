/**
 * Property test P9 for `routes/community/feeds.ts` → `resolvePublisher` +
 * `createLocalTopic` handler.
 *
 * Property 9: Гейт публикации допускает только аутентифицированные аккаунты с
 * правами.
 *
 * **Validates: Requirements 4.2, 4.3, 4.7, 5.4, 5.5**
 *
 * Module under test (`src/routes/community/feeds.ts`):
 *   - `resolvePublisher(req, loadAccount)` — читает идентификатор публикующего
 *     Community_Account из Community_Session (`req.session.communityAccountId`,
 *     после task 5.1) и проверяет `hasPublishingRights` по загруженному
 *     аккаунту.
 *   - `makeHandlers(deps).createLocalTopic(req, res)` — вызывает
 *     `resolvePublisher` и создаёт публикацию через
 *     `feedService.createLocalTopic` ТОЛЬКО при `ok:true`.
 *
 * Свойство P9 (design.md): для ЛЮБОГО запроса на публикацию —
 *   • если в сессии отсутствует валидный `communityAccountId` (нет сессии,
 *     не число, не целое, ≤ 0), `resolvePublisher` возвращает 401 и публикация
 *     НЕ создаётся (`feedService.createLocalTopic` не вызывается) — R4.3, R4.7;
 *   • если аккаунт не удаётся загрузить (`loadAccount → null`) или у него нет
 *     Publishing_Rights (пустой `passwordHash` И отсутствующий
 *     `phoneVerifiedAt`), возвращается 403 и публикация НЕ создаётся —
 *     R4.2, R5.4, R5.5;
 *   • публикация создаётся (вызывается `feedService.createLocalTopic`) ТОЛЬКО
 *     когда аккаунт из сессии существует и `hasPublishingRights` истинно.
 *
 * Тест прогоняет хендлер напрямую через `makeHandlers(deps)` со spy-реализацией
 * `feedService.createLocalTopic`, считающей вызовы, — без БД и без сервера.
 *
 * Run via Node's built-in test runner:
 *   tsx --test ./__tests__/community/publish-gate.property.test.ts
 */

// `@workspace/db` кидает при загрузке модуля без DATABASE_URL. Тестируемая
// логика маршрутов чистая (зависимости инъектируются), поэтому даём фиктивный
// URL исключительно чтобы пройти проверку импорта, и подгружаем роутер
// динамически.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import type { FeedsRouterDeps } from "../../src/routes/community/feeds.js";
import type {
  FeedResult,
  CreateLocalTopicResult,
  CreatePublicQuestionResult,
} from "../../src/lib/feedService.js";
import type { CommunityAccount } from "@workspace/db";

const { makeHandlers } = await import("../../src/routes/community/feeds.js");

// ─── Тестовые дублёры req/res ────────────────────────────────────────────────

/** Mock Response, захватывающий статус и тело. */
function mockRes() {
  const res: {
    statusCode: number;
    body: unknown;
    status: (code: number) => typeof res;
    json: (payload: unknown) => typeof res;
    setHeader: (k: string, v: string) => void;
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
    setHeader() {
      /* noop */
    },
  };
  return res;
}

/**
 * Минимальный mock Request. `session` подставляется как есть, чтобы точно
 * воспроизвести чтение `req.session.communityAccountId` в `resolvePublisher`.
 */
function mockReq(session: unknown, body: unknown = {}): any {
  return { params: {}, query: {}, headers: {}, body, session };
}

const EMPTY_FEED: FeedResult = { items: [], emptyState: true, nextCursor: null };

/**
 * Собрать deps роутера. `loadAccount` инъектируется на сценарий; spy
 * `feedService.createLocalTopic` считает вызовы и возвращает `created`.
 */
function makeDeps(
  loadAccount: FeedsRouterDeps["loadAccount"],
  counters: { createCalls: number },
): FeedsRouterDeps {
  return {
    feedService: {
      async getCityFeed() {
        return EMPTY_FEED;
      },
      async getLocalFeed() {
        return EMPTY_FEED;
      },
      async createLocalTopic(): Promise<CreateLocalTopicResult> {
        // Spy: публикация создана — считаем вызов (путь публикации).
        counters.createCalls++;
        return { status: "created", thread: { id: 777 } as any };
      },
      async createPublicQuestion(): Promise<CreatePublicQuestionResult> {
        return { status: "created", thread: { id: 778 } as any };
      },
    },
    async getCityBySlug() {
      return null;
    },
    async getZhkBySlug() {
      return null;
    },
    loadAccount,
  };
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Валидный положительный целочисленный id аккаунта из сессии. */
const validAccountIdArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 1_000_000 });

/**
 * Сессия БЕЗ валидного `communityAccountId` (R4.3, R4.7):
 *   • сессия отсутствует (`undefined`);
 *   • сессия без поля;
 *   • `communityAccountId` = 0 / отрицательный / нецелый / NaN / нечисловой.
 */
const invalidSessionArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant(undefined),
  fc.constant({}),
  fc.record({ communityAccountId: fc.constant(0) }),
  fc.record({ communityAccountId: fc.integer({ min: -1_000_000, max: -1 }) }),
  fc.record({
    communityAccountId: fc
      .float({ min: Math.fround(0.01), max: Math.fround(1000), noNaN: true })
      .filter((n) => !Number.isInteger(n)),
  }),
  fc.record({ communityAccountId: fc.constant(Number.NaN) }),
  fc.record({ communityAccountId: fc.constant(Number.POSITIVE_INFINITY) }),
  fc.record({ communityAccountId: fc.string() }),
  fc.record({ communityAccountId: fc.constant(null) }),
);

/** Произвольный `maxUserId` — не должен влиять на права (R5.6). */
const maxUserIdArb: fc.Arbitrary<string | null> = fc.oneof(
  fc.constant(null),
  fc.string({ minLength: 1, maxLength: 20 }),
);

const roleArb = fc.constantFrom("resident", "master");
const zhkIdArb: fc.Arbitrary<number | null> = fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 500 }));

/** Аккаунт С правами публикации: непустой `passwordHash` ИЛИ заданный `phoneVerifiedAt`. */
const accountWithRightsArb: fc.Arbitrary<CommunityAccount> = fc
  .record({
    id: validAccountIdArb,
    phone: fc.constant("+79990001122"),
    rightsKind: fc.constantFrom<"password" | "verified" | "both">("password", "verified", "both"),
    passwordHash: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.length > 0),
    verifiedAt: fc.date({ min: new Date("2020-01-01"), max: new Date("2030-01-01") }),
    role: roleArb,
    zhkId: zhkIdArb,
    maxUserId: maxUserIdArb,
  })
  .map((r): CommunityAccount => ({
    id: r.id,
    phone: r.phone,
    phoneVerifiedAt: r.rightsKind === "password" ? null : r.verifiedAt,
    passwordHash: r.rightsKind === "verified" ? null : r.passwordHash,
    role: r.role,
    zhkId: r.zhkId,
    maxUserId: r.maxUserId,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  } as CommunityAccount));

/** Аккаунт БЕЗ прав: пустой/отсутствующий `passwordHash` И отсутствующий `phoneVerifiedAt`. */
const accountWithoutRightsArb: fc.Arbitrary<CommunityAccount> = fc
  .record({
    id: validAccountIdArb,
    phone: fc.constant("+79990002233"),
    emptyHash: fc.constantFrom<null | "">(null, ""),
    role: roleArb,
    zhkId: zhkIdArb,
    maxUserId: maxUserIdArb,
  })
  .map((r): CommunityAccount => ({
    id: r.id,
    phone: r.phone,
    phoneVerifiedAt: null,
    passwordHash: r.emptyHash,
    role: r.role,
    zhkId: r.zhkId,
    maxUserId: r.maxUserId,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  } as CommunityAccount));

// ─── Дискриминированный генератор сценариев ─────────────────────────────────

interface Scenario {
  label: string;
  session: unknown;
  loadAccount: FeedsRouterDeps["loadAccount"];
  /** Ожидаемый исход: 401 / 403 / created (публикация). */
  expect: { status: 401 | 403 | 201; created: boolean };
}

const scenarioArb: fc.Arbitrary<Scenario> = fc.oneof(
  // (R4.3, R4.7) Нет валидного id в сессии → 401, публикация не создаётся.
  invalidSessionArb.map((session) => ({
    label: "no_valid_session",
    session,
    loadAccount: async () => {
      throw new Error("loadAccount не должен вызываться при невалидной сессии");
    },
    expect: { status: 401 as const, created: false },
  })),
  // (R4.2, R5.5) Валидная сессия, но аккаунт не загружается (null) → 403.
  validAccountIdArb.map((id) => ({
    label: "account_null",
    session: { communityAccountId: id },
    loadAccount: async () => null,
    expect: { status: 403 as const, created: false },
  })),
  // (R5.4) Валидная сессия, аккаунт без прав публикации → 403.
  fc.tuple(validAccountIdArb, accountWithoutRightsArb).map(([id, account]) => ({
    label: "account_no_rights",
    session: { communityAccountId: id },
    loadAccount: async () => account,
    expect: { status: 403 as const, created: false },
  })),
  // (R4.2, R5) Валидная сессия, аккаунт с правами → публикация создаётся.
  fc.tuple(validAccountIdArb, accountWithRightsArb).map(([id, account]) => ({
    label: "account_with_rights",
    session: { communityAccountId: id },
    loadAccount: async () => account,
    expect: { status: 201 as const, created: true },
  })),
);

// ─── Property 9 — гейт публикации ────────────────────────────────────────────

describe("createLocalTopic — P9: гейт публикации допускает только аутентифицированные аккаунты с правами", () => {
  // Feature: community-phone-registration, Property 9: гейт публикации допускает
  // только аутентифицированные аккаунты с правами (нет валидной сессии → 401 и
  // публикация не создаётся; аккаунт null/без прав → 403 и публикация не
  // создаётся; аккаунт с правами → публикация создаётся).
  // Validates: Requirements 4.2, 4.3, 4.7, 5.4, 5.5

  it("публикация создаётся тогда и только тогда, когда сессия валидна и у аккаунта есть права", async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        const counters = { createCalls: 0 };
        const deps = makeDeps(scenario.loadAccount, counters);
        const handlers = makeHandlers(deps);

        const res = mockRes();
        await handlers.createLocalTopic(
          mockReq(scenario.session, {
            category: "tool_sharing",
            title: "Дрель",
            body: "Одолжу дрель",
          }),
          res as any,
        );

        // Ожидаемый HTTP-статус.
        assert.equal(
          res.statusCode,
          scenario.expect.status,
          `[${scenario.label}] неверный статус: body=${JSON.stringify(res.body)}`,
        );

        // Инвариант «публикация создаётся ⇔ сессия валидна и есть права».
        assert.equal(
          counters.createCalls,
          scenario.expect.created ? 1 : 0,
          `[${scenario.label}] createLocalTopic вызван ${counters.createCalls} раз, ожидалось ${
            scenario.expect.created ? 1 : 0
          }`,
        );

        // Тела отказов совпадают с контрактом resolvePublisher.
        if (scenario.expect.status === 401) {
          assert.deepEqual(res.body, { error: "unauthorized" });
        } else if (scenario.expect.status === 403) {
          assert.deepEqual(res.body, {
            error: "forbidden",
            reason: "publishing_rights_required",
          });
        } else {
          assert.equal((res.body as any).status, "created");
        }
      }),
      { numRuns: 300 },
    );
  });
});

// ─── Явные примеры-якоря каждого исхода ──────────────────────────────────────

describe("createLocalTopic — P9: явные примеры каждого исхода гейта", () => {
  // Feature: community-phone-registration, Property 9: гейт публикации —
  // примеры-якоря (401 без сессии, 403 без прав/без аккаунта, 201 с правами).
  // Validates: Requirements 4.2, 4.3, 4.7, 5.4, 5.5

  const accountWithPassword: CommunityAccount = {
    id: 100,
    phone: "+79990001122",
    phoneVerifiedAt: null,
    passwordHash: "$2a$10$abcdefghijklmnopqrstuv",
    role: "resident",
    zhkId: 42,
    maxUserId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  } as CommunityAccount;

  const legacyVerifiedAccount: CommunityAccount = {
    ...accountWithPassword,
    id: 101,
    phone: "+79990002233",
    phoneVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    passwordHash: null,
  } as CommunityAccount;

  const noRightsAccount: CommunityAccount = {
    ...accountWithPassword,
    id: 102,
    phone: "+79990003344",
    phoneVerifiedAt: null,
    passwordHash: null,
  } as CommunityAccount;

  it("нет сессии → 401, createLocalTopic не вызван", async () => {
    const counters = { createCalls: 0 };
    const deps = makeDeps(async () => {
      throw new Error("loadAccount не должен вызываться");
    }, counters);
    const res = mockRes();
    await makeHandlers(deps).createLocalTopic(mockReq(undefined), res as any);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: "unauthorized" });
    assert.equal(counters.createCalls, 0);
  });

  it("communityAccountId = 0 → 401, createLocalTopic не вызван", async () => {
    const counters = { createCalls: 0 };
    const deps = makeDeps(async () => {
      throw new Error("loadAccount не должен вызываться");
    }, counters);
    const res = mockRes();
    await makeHandlers(deps).createLocalTopic(mockReq({ communityAccountId: 0 }), res as any);
    assert.equal(res.statusCode, 401);
    assert.equal(counters.createCalls, 0);
  });

  it("валидная сессия, аккаунт не найден → 403, createLocalTopic не вызван", async () => {
    const counters = { createCalls: 0 };
    const deps = makeDeps(async () => null, counters);
    const res = mockRes();
    await makeHandlers(deps).createLocalTopic(mockReq({ communityAccountId: 999 }), res as any);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: "forbidden", reason: "publishing_rights_required" });
    assert.equal(counters.createCalls, 0);
  });

  it("валидная сессия, аккаунт без прав → 403, createLocalTopic не вызван", async () => {
    const counters = { createCalls: 0 };
    const deps = makeDeps(async () => noRightsAccount, counters);
    const res = mockRes();
    await makeHandlers(deps).createLocalTopic(mockReq({ communityAccountId: 102 }), res as any);
    assert.equal(res.statusCode, 403);
    assert.equal(counters.createCalls, 0);
  });

  it("валидная сессия, аккаунт с паролем → 201, createLocalTopic вызван (публикация)", async () => {
    const counters = { createCalls: 0 };
    const deps = makeDeps(async () => accountWithPassword, counters);
    const res = mockRes();
    await makeHandlers(deps).createLocalTopic(mockReq({ communityAccountId: 100 }), res as any);
    assert.equal(res.statusCode, 201);
    assert.equal((res.body as any).status, "created");
    assert.equal(counters.createCalls, 1);
  });

  it("валидная сессия, Legacy_Verified_Account (phoneVerifiedAt) → 201, createLocalTopic вызван", async () => {
    const counters = { createCalls: 0 };
    const deps = makeDeps(async () => legacyVerifiedAccount, counters);
    const res = mockRes();
    await makeHandlers(deps).createLocalTopic(mockReq({ communityAccountId: 101 }), res as any);
    assert.equal(res.statusCode, 201);
    assert.equal(counters.createCalls, 1);
  });
});
