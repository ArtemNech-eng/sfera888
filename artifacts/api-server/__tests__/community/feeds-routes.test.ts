/**
 * Unit tests for Community Feeds routes (Task 4.4).
 *
 * **Validates: Requirements 2.1, 3.3** — GET City_Feed / Local_Feed по slug и
 * POST темы Local_Feed уровня доступа 3. Дополнительно закрепляют смежные
 * требования маршрутов: 404 на несуществующий slug (R1.5), пустое состояние без
 * ошибки (R1.3, R3.6), гейт уровня 3 (R11) и сохранение черновика при отклонении
 * (R3.4, R3.5).
 *
 * Хендлеры прогоняются напрямую с фейковыми зависимостями и mock req/res —
 * без БД и без поднятия HTTP-сервера.
 *
 * Run: pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { FeedsRouterDeps } from "../../src/routes/community/feeds.js";
import type { FeedResult, CreateLocalTopicResult, CreatePublicQuestionResult } from "../../src/lib/feedService.js";
import type { CityView, ZhkView } from "../../src/lib/geoService.js";
import type { CommunityAccount } from "@workspace/db";

// `@workspace/db` кидает при загрузке модуля без DATABASE_URL. Тестируемая
// логика маршрутов чистая (сервисы инъектируются), поэтому даём фиктивный URL
// исключительно чтобы пройти проверку импорта, и подгружаем роутер динамически.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { makeHandlers, parseFeedQuery, resolvePublisher } =
  await import("../../src/routes/community/feeds.js");

// ─── Тестовые дублёры ────────────────────────────────────────────────────────

/** Mock Response, захватывающий статус, тело и заголовки. */
function mockRes() {
  const res: {
    statusCode: number;
    body: unknown;
    headers: Record<string, string>;
    status: (code: number) => typeof res;
    json: (payload: unknown) => typeof res;
    setHeader: (k: string, v: string) => void;
  } = {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
  };
  return res;
}

/** Минимальный mock Request. Публикующий аккаунт передаётся через
 *  Community_Session (`session.communityAccountId`), как в проде. */
function mockReq(opts: {
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  body?: unknown;
  session?: { communityAccountId?: number };
}): any {
  return {
    params: opts.params ?? {},
    query: opts.query ?? {},
    headers: opts.headers ?? {},
    body: opts.body,
    session: opts.session ?? {},
  };
}

const CITY: CityView = {
  id: 7,
  slug: "krasnodar",
  name: "Краснодар",
  region: null,
  seoTitle: null,
  seoDescription: null,
  h1: null,
  bodyMd: null,
};

const ZHK: ZhkView = {
  id: 42,
  slug: "zhk-solnechnyy",
  name: "ЖК Солнечный",
  cityId: 7,
  status: "NON_LIVING",
};

const VERIFIED_ACCOUNT: CommunityAccount = {
  id: 100,
  phone: "+79990001122",
  phoneVerifiedAt: new Date("2026-01-01T00:00:00Z"),
  role: "resident",
  zhkId: 42,
  maxUserId: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

const UNVERIFIED_ACCOUNT: CommunityAccount = {
  ...VERIFIED_ACCOUNT,
  id: 101,
  phone: "+79990002233",
  phoneVerifiedAt: null,
};

const EMPTY_FEED: FeedResult = { items: [], emptyState: true, nextCursor: null };
const NON_EMPTY_FEED: FeedResult = {
  items: [
    {
      id: 1,
      title: "Где купить ламинат",
      body: "Ищу магазин",
      category: null,
      cityId: 7,
      zhkId: null,
      authorAccountId: 100,
      isSeeded: false,
      lastActivityAt: new Date("2026-02-01T00:00:00Z"),
      createdAt: new Date("2026-02-01T00:00:00Z"),
    },
  ],
  emptyState: false,
  nextCursor: null,
};

/** Собрать deps с разумными дефолтами и точечными переопределениями. */
function makeDeps(overrides: Partial<FeedsRouterDeps> = {}): FeedsRouterDeps {
  return {
    feedService: {
      async getCityFeed() {
        return NON_EMPTY_FEED;
      },
      async getLocalFeed() {
        return EMPTY_FEED;
      },
      async createLocalTopic(): Promise<CreateLocalTopicResult> {
        return { status: "created", thread: { id: 555 } as any };
      },
      async createPublicQuestion(): Promise<CreatePublicQuestionResult> {
        return { status: "created", thread: { id: 556 } as any };
      },
    },
    async getCityBySlug(slug) {
      return slug === CITY.slug ? CITY : null;
    },
    async getZhkBySlug(slug) {
      return slug === ZHK.slug ? ZHK : null;
    },
    async loadAccount(id) {
      if (id === VERIFIED_ACCOUNT.id) return VERIFIED_ACCOUNT;
      if (id === UNVERIFIED_ACCOUNT.id) return UNVERIFIED_ACCOUNT;
      return null;
    },
    ...overrides,
  };
}

// ─── parseFeedQuery ──────────────────────────────────────────────────────────

describe("parseFeedQuery", () => {
  it("извлекает числовой limit и непустой cursor", () => {
    const q = parseFeedQuery({ limit: "15", cursor: "abc" });
    assert.equal(q.limit, 15);
    assert.equal(q.cursor, "abc");
  });

  it("игнорирует нечисловой limit и пустой cursor", () => {
    const q = parseFeedQuery({ limit: "nope", cursor: "  " });
    assert.equal(q.limit, undefined);
    assert.equal(q.cursor, undefined);
  });
});

// ─── GET City_Feed (Requirements 1.2, 2.1, 1.3, 1.5) ─────────────────────────

describe("GET /city/:citySlug — City_Feed (R2.1)", () => {
  it("резолвит город по slug и отдаёт City_Feed (R1.2, R2.1)", async () => {
    const h = makeHandlers(makeDeps());
    const res = mockRes();
    await h.getCityFeed(mockReq({ params: { citySlug: "krasnodar" } }), res as any);

    assert.equal(res.statusCode, 200);
    const body = res.body as any;
    assert.equal(body.city.slug, "krasnodar");
    assert.equal(body.feed.items.length, 1);
    assert.equal(body.feed.emptyState, false);
  });

  it("несуществующий город → 404 (R1.5)", async () => {
    const h = makeHandlers(makeDeps());
    const res = mockRes();
    await h.getCityFeed(mockReq({ params: { citySlug: "no-such" } }), res as any);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: "not_found" });
  });

  it("пустая лента → 200 с emptyState=true, без ошибки (R1.3)", async () => {
    const h = makeHandlers(makeDeps({
      feedService: {
        async getCityFeed() { return EMPTY_FEED; },
        async getLocalFeed() { return EMPTY_FEED; },
        async createLocalTopic() { return { status: "created", thread: {} as any }; },
        async createPublicQuestion() { return { status: "created", thread: {} as any }; },
      },
    }));
    const res = mockRes();
    await h.getCityFeed(mockReq({ params: { citySlug: "krasnodar" } }), res as any);

    assert.equal(res.statusCode, 200);
    assert.equal((res.body as any).feed.emptyState, true);
  });
});

// ─── GET Local_Feed (Requirements 1.4, 3.3, 3.6, 1.5) ────────────────────────

describe("GET /zhk/:zhkSlug — Local_Feed (R3.3)", () => {
  it("резолвит ЖК по slug и отдаёт Local_Feed (R1.4, R3.3)", async () => {
    const captured: number[] = [];
    const h = makeHandlers(makeDeps({
      feedService: {
        async getCityFeed() { return EMPTY_FEED; },
        async getLocalFeed(zhkId) { captured.push(zhkId); return EMPTY_FEED; },
        async createLocalTopic() { return { status: "created", thread: {} as any }; },
        async createPublicQuestion() { return { status: "created", thread: {} as any }; },
      },
    }));
    const res = mockRes();
    await h.getLocalFeed(mockReq({ params: { zhkSlug: "zhk-solnechnyy" } }), res as any);

    assert.equal(res.statusCode, 200);
    assert.equal((res.body as any).zhk.id, 42);
    // Лента запрашивается строго по id этого ЖК (исключая прочие) — R3.3.
    assert.deepEqual(captured, [42]);
  });

  it("несуществующий ЖК → 404 (R1.5)", async () => {
    const h = makeHandlers(makeDeps());
    const res = mockRes();
    await h.getLocalFeed(mockReq({ params: { zhkSlug: "ghost" } }), res as any);

    assert.equal(res.statusCode, 404);
  });
});

// ─── resolvePublisher — гейт уровня 3 (Requirement 11) ───────────────────────

describe("resolvePublisher — уровень доступа 3 (R11)", () => {
  it("нет сессии → 401", async () => {
    const r = await resolvePublisher(mockReq({}), makeDeps().loadAccount);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 401);
  });

  it("аккаунт без прав публикации → 403 publishing_rights_required (R5.4, R5.5)", async () => {
    const r = await resolvePublisher(
      mockReq({ session: { communityAccountId: 101 } }),
      makeDeps().loadAccount,
    );
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.status, 403);
      assert.equal(r.body.reason, "publishing_rights_required");
    }
  });

  it("аккаунт с правами публикации → ok", async () => {
    const r = await resolvePublisher(
      mockReq({ session: { communityAccountId: 100 } }),
      makeDeps().loadAccount,
    );
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.account.id, 100);
  });
});

// ─── POST /zhk — публикация темы (Requirements 3.1, 3.2, 3.4, 3.5, 11) ───────

describe("POST /zhk — создание темы Local_Feed (уровень 3)", () => {
  it("аноним без сессии → 401", async () => {
    const h = makeHandlers(makeDeps());
    const res = mockRes();
    await h.createLocalTopic(
      mockReq({ body: { category: "tool_sharing", title: "Дрель", body: "Одолжу" } }),
      res as any,
    );
    assert.equal(res.statusCode, 401);
  });

  it("аккаунт с правами публикации → 201 created (R3.2)", async () => {
    let received: any = null;
    const h = makeHandlers(makeDeps({
      feedService: {
        async getCityFeed() { return EMPTY_FEED; },
        async getLocalFeed() { return EMPTY_FEED; },
        async createLocalTopic(input) {
          received = input;
          return { status: "created", thread: { id: 777 } as any };
        },
        async createPublicQuestion() { return { status: "created", thread: {} as any }; },
      },
    }));
    const res = mockRes();
    await h.createLocalTopic(
      mockReq({
        session: { communityAccountId: 100 },
        body: { category: "tool_sharing", title: "Дрель", body: "Одолжу дрель" },
      }),
      res as any,
    );

    assert.equal(res.statusCode, 201);
    assert.equal((res.body as any).status, "created");
    assert.equal((res.body as any).thread.id, 777);
    // Автор проставлен из проверенного аккаунта, а не из тела запроса.
    assert.equal(received.authorAccountId, 100);
  });

  it("недопустимый ввод → 400 с причиной и сохранённым draftId (R3.4)", async () => {
    const h = makeHandlers(makeDeps({
      feedService: {
        async getCityFeed() { return EMPTY_FEED; },
        async getLocalFeed() { return EMPTY_FEED; },
        async createLocalTopic() {
          return { status: "rejected", reason: "invalid_category", draftId: 9 };
        },
        async createPublicQuestion() { return { status: "created", thread: {} as any }; },
      },
    }));
    const res = mockRes();
    await h.createLocalTopic(
      mockReq({
        session: { communityAccountId: 100 },
        body: { category: "bad", title: "T", body: "B" },
      }),
      res as any,
    );

    assert.equal(res.statusCode, 400);
    assert.equal((res.body as any).status, "rejected");
    assert.equal((res.body as any).reason, "invalid_category");
    assert.equal((res.body as any).draftId, 9);
  });

  it("нет привязки к ЖК → 400 no_zhk_binding с draftId (R3.5)", async () => {
    const h = makeHandlers(makeDeps({
      feedService: {
        async getCityFeed() { return EMPTY_FEED; },
        async getLocalFeed() { return EMPTY_FEED; },
        async createLocalTopic() {
          return { status: "rejected", reason: "no_zhk_binding", draftId: 12 };
        },
        async createPublicQuestion() { return { status: "created", thread: {} as any }; },
      },
    }));
    const res = mockRes();
    await h.createLocalTopic(
      mockReq({
        session: { communityAccountId: 100 },
        body: { category: "tool_sharing", title: "Дрель", body: "Одолжу" },
      }),
      res as any,
    );

    assert.equal(res.statusCode, 400);
    assert.equal((res.body as any).reason, "no_zhk_binding");
    assert.equal((res.body as any).draftId, 12);
  });
});
