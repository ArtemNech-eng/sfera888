/**
 * Unit tests for Community PRO routes (Task 5.5).
 *
 * **Validates: Requirements 6.1, 6.2, 6.4** — GET PRO_Public_Layer ленты по
 * Specialty с применением My_City_Filter. Дополнительно закрепляют смежные
 * требования маршрута: All_Russia по умолчанию (R6.2, R6.3), активация фильтра
 * только по явному query-параметру (R6.6), 404 на несуществующую специальность,
 * пустая лента без ошибки (R6.5).
 *
 * Хендлеры прогоняются напрямую с фейковыми зависимостями и mock req/res —
 * без БД и без поднятия HTTP-сервера.
 *
 * Run: pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { ProRouterDeps, SpecialtyView } from "../../src/routes/community/pro.js";
import type { ProFeedQuery, ProFeedResult } from "../../src/lib/feedService.js";

// `@workspace/db` кидает при загрузке модуля без DATABASE_URL. Тестируемая
// логика маршрутов чистая (сервисы инъектируются), поэтому даём фиктивный URL
// исключительно чтобы пройти проверку импорта, и подгружаем роутер динамически.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { makeHandlers, parseProFeedQuery } = await import(
  "../../src/routes/community/pro.js"
);

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

/** Минимальный mock Request. */
function mockReq(opts: {
  params?: Record<string, string>;
  query?: Record<string, unknown>;
}): any {
  return {
    params: opts.params ?? {},
    query: opts.query ?? {},
    headers: {},
    body: undefined,
  };
}

const SPECIALTY: SpecialtyView = {
  id: 3,
  slug: "plitochnik",
  name: "Плиточник",
};

const ALL_RUSSIA_FEED: ProFeedResult = {
  items: [
    {
      id: 1,
      title: "Как резать керамогранит",
      body: "Совет по инструменту",
      category: "tools",
      cityId: null,
      zhkId: null,
      authorAccountId: 200,
      isSeeded: false,
      lastActivityAt: new Date("2026-03-01T00:00:00Z"),
      createdAt: new Date("2026-03-01T00:00:00Z"),
      specialtyId: 3,
      isLocal: false,
    },
  ],
  emptyState: false,
  nextCursor: null,
  feedMode: "all_russia",
  cityFilterApplied: false,
};

const EMPTY_MY_CITY_FEED: ProFeedResult = {
  items: [],
  emptyState: true,
  nextCursor: null,
  feedMode: "my_city",
  cityFilterApplied: true,
};

/** Собрать deps с разумными дефолтами и точечными переопределениями. */
function makeDeps(overrides: Partial<ProRouterDeps> = {}): ProRouterDeps {
  return {
    feedService: {
      async getProFeed() {
        return ALL_RUSSIA_FEED;
      },
    },
    async getSpecialtyBySlug(slug) {
      return slug === SPECIALTY.slug ? SPECIALTY : null;
    },
    ...overrides,
  };
}

// ─── parseProFeedQuery ───────────────────────────────────────────────────────

describe("parseProFeedQuery", () => {
  it("извлекает числовой limit и непустой cursor", () => {
    const q = parseProFeedQuery({ limit: "15", cursor: "abc" });
    assert.equal(q.limit, 15);
    assert.equal(q.cursor, "abc");
  });

  it("по умолчанию My_City_Filter выключен → All_Russia (R6.2, R6.6)", () => {
    const q = parseProFeedQuery({});
    assert.equal(q.cityFilter, false);
    assert.equal(q.currentCityId, undefined);
  });

  it("активирует My_City_Filter только при cityFilter=true/1 (R6.6)", () => {
    assert.equal(parseProFeedQuery({ cityFilter: "true" }).cityFilter, true);
    assert.equal(parseProFeedQuery({ cityFilter: "1" }).cityFilter, true);
    // Любое иное значение не активирует фильтр (Requirement 6.6).
    assert.equal(parseProFeedQuery({ cityFilter: "yes" }).cityFilter, false);
    assert.equal(parseProFeedQuery({ cityFilter: "false" }).cityFilter, false);
  });

  it("извлекает cityId как положительное целое currentCityId (R6.4)", () => {
    assert.equal(parseProFeedQuery({ cityId: "7" }).currentCityId, 7);
    // Некорректный cityId игнорируется.
    assert.equal(parseProFeedQuery({ cityId: "0" }).currentCityId, undefined);
    assert.equal(parseProFeedQuery({ cityId: "-3" }).currentCityId, undefined);
    assert.equal(parseProFeedQuery({ cityId: "abc" }).currentCityId, undefined);
  });
});

// ─── GET PRO_Public лента (Requirements 6.1, 6.2, 6.4) ───────────────────────

describe("GET /:specialtySlug — PRO_Public лента (R6.1, R6.2)", () => {
  it("резолвит специальность по slug и отдаёт All_Russia по умолчанию (R6.1, R6.2)", async () => {
    const h = makeHandlers(makeDeps());
    const res = mockRes();
    await h.getProFeed(mockReq({ params: { specialtySlug: "plitochnik" } }), res as any);

    assert.equal(res.statusCode, 200);
    const body = res.body as any;
    assert.equal(body.specialty.slug, "plitochnik");
    assert.equal(body.feed.items.length, 1);
    assert.equal(body.feed.feedMode, "all_russia");
    assert.equal(body.feed.cityFilterApplied, false);
    // Публичная лента отдаётся с кэш-заголовком.
    assert.equal(
      res.headers["cache-control"],
      "public, max-age=60, stale-while-revalidate=300",
    );
  });

  it("несуществующая специальность → 404 (not_found)", async () => {
    const h = makeHandlers(makeDeps());
    const res = mockRes();
    await h.getProFeed(mockReq({ params: { specialtySlug: "no-such" } }), res as any);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: "not_found" });
  });

  it("прокидывает разобранные параметры My_City_Filter в getProFeed (R6.4, R6.6)", async () => {
    let receivedId: number | undefined;
    let receivedQuery: ProFeedQuery | undefined;
    const h = makeHandlers(
      makeDeps({
        feedService: {
          async getProFeed(specialtyId, query) {
            receivedId = specialtyId;
            receivedQuery = query;
            return EMPTY_MY_CITY_FEED;
          },
        },
      }),
    );
    const res = mockRes();
    await h.getProFeed(
      mockReq({
        params: { specialtySlug: "plitochnik" },
        query: { cityFilter: "true", cityId: "7" },
      }),
      res as any,
    );

    assert.equal(res.statusCode, 200);
    // Фильтр применяется к id разрешённой специальности (R6.1).
    assert.equal(receivedId, 3);
    assert.equal(receivedQuery?.cityFilter, true);
    assert.equal(receivedQuery?.currentCityId, 7);
  });

  it("My_City_Filter без локальных тем → 200 с emptyState, без отката к All_Russia (R6.5)", async () => {
    const h = makeHandlers(
      makeDeps({
        feedService: {
          async getProFeed() {
            return EMPTY_MY_CITY_FEED;
          },
        },
      }),
    );
    const res = mockRes();
    await h.getProFeed(
      mockReq({
        params: { specialtySlug: "plitochnik" },
        query: { cityFilter: "true", cityId: "7" },
      }),
      res as any,
    );

    assert.equal(res.statusCode, 200);
    const body = res.body as any;
    assert.equal(body.feed.emptyState, true);
    assert.equal(body.feed.feedMode, "my_city");
    assert.equal(body.feed.items.length, 0);
  });

  it("ошибка сервиса → 500 (internal_error)", async () => {
    const h = makeHandlers(
      makeDeps({
        feedService: {
          async getProFeed() {
            throw new Error("db down");
          },
        },
      }),
    );
    const res = mockRes();
    await h.getProFeed(mockReq({ params: { specialtySlug: "plitochnik" } }), res as any);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: "internal_error" });
  });
});
