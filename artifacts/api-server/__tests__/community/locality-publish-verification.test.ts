/**
 * Feature: community-generalized-locality, Task 6.7: verification gate and city-feed fallback
 *
 * Unit tests for two publish behaviors of the generalized-locality community:
 *
 *   1. **Validates: Requirements 8.4** — публикация Community_Thread через
 *      Community_Account БЕЗ завершённой Phone_Verification отклоняется
 *      (verification_required), тема НЕ сохраняется. Публикующий гейт темы —
 *      `resolvePublisher` в `routes/community/feeds.ts`; хендлер публикации
 *      (`makeHandlers().createLocalTopic`) вызывает гейт ДО обращения к
 *      `FeedService.createLocalTopic`. При неверифицированном аккаунте гейт
 *      отвечает 403 `phone_verification_required` (семантически = требуется
 *      завершить Phone_Verification, R8.4) и НЕ доходит до пути создания —
 *      отсутствие персистентности доказывается тем, что шпион на
 *      `createLocalTopic` не вызывается (0 вызовов → 0 сохранённых тем). Для
 *      анонима без идентификатора аккаунта → 401 (создание тоже не достигается).
 *
 *   2. **Validates: Requirements 2.3** — Resident, не нашедший подходящей
 *      Locality своего типа, может опубликовать Community_Thread в City_Feed
 *      текущего City. Городской путь публикации — `FeedService.createPublicQuestion`
 *      с адресатом-городом (`cityId`, без `zhkId`): при существующем City он
 *      создаёт тему со `scope = 'city'`, привязанную к этому City (fallback на
 *      городскую ленту, когда локация не выбрана). Тест прогоняет НАСТОЯЩИЙ
 *      `createPublicQuestion` с инъектированным db-стабом (персистентность
 *      застаблена) — без реального Postgres.
 *
 * Оба теста — юнит-уровня: сервисы/загрузчик аккаунта инъектируются, БД
 * застаблена, HTTP-сервер не поднимается (паттерн из `feeds-routes.test.ts`,
 * `locality-create-auth.test.ts`, `community-phone-verification.test.ts`).
 *
 * Run: pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CommunityAccount } from "@workspace/db";

import type { FeedsRouterDeps } from "../../src/routes/community/feeds.js";
import type {
  FeedResult,
  CreateLocalTopicResult,
  CreatePublicQuestionResult,
} from "../../src/lib/feedService.js";
import type { CityView, ZhkView } from "../../src/lib/geoService.js";

// `@workspace/db` кидает при загрузке модуля без DATABASE_URL. Оба модуля под
// тестом импортируются динамически ПОСЛЕ выставления фиктивного URL; ни одного
// реального запроса не выполняется (pg.Pool ленив), а в тесте R2.3 используется
// полностью инъектированный db-стаб.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { makeHandlers, resolvePublisher, ACCOUNT_ID_HEADER } = await import(
  "../../src/routes/community/feeds.js"
);
const { FeedService } = await import("../../src/lib/feedService.js");

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
  headers?: Record<string, string>;
  body?: unknown;
}): any {
  return {
    params: opts.params ?? {},
    query: opts.query ?? {},
    headers: opts.headers ?? {},
    body: opts.body,
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
  slug: "cheremushki",
  name: "Черёмушки",
  cityId: 7,
  status: "NON_LIVING",
};

/** Верифицированный резидент (Phone_Verification завершена). */
const VERIFIED_ACCOUNT: CommunityAccount = {
  id: 100,
  phone: "+79990001122",
  phoneVerifiedAt: new Date("2026-01-01T00:00:00Z"),
  role: "resident",
  zhkId: 42,
  maxUserId: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
} as CommunityAccount;

/** Резидент без завершённой Phone_Verification. */
const UNVERIFIED_ACCOUNT: CommunityAccount = {
  ...VERIFIED_ACCOUNT,
  id: 101,
  phone: "+79990002233",
  phoneVerifiedAt: null,
} as CommunityAccount;

const EMPTY_FEED: FeedResult = { items: [], emptyState: true, nextCursor: null };

/**
 * Собрать FeedsRouterDeps со шпионом на `createLocalTopic`, чтобы доказать, что
 * при отклонении гейта путь создания темы НЕ достигается (тема не сохраняется).
 */
function makeDepsWithCreateSpy(): {
  deps: FeedsRouterDeps;
  createLocalTopicCalls: () => number;
} {
  let calls = 0;
  const deps: FeedsRouterDeps = {
    feedService: {
      async getCityFeed() {
        return EMPTY_FEED;
      },
      async getLocalFeed() {
        return EMPTY_FEED;
      },
      async createLocalTopic(): Promise<CreateLocalTopicResult> {
        calls++;
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
  };
  return { deps, createLocalTopicCalls: () => calls };
}

// ─── R8.4 — гейт Phone_Verification при публикации темы ──────────────────────

describe("Publish gate — Community_Thread без Phone_Verification отклоняется (R8.4)", () => {
  it("resolvePublisher: неверифицированный аккаунт → 403 (требуется Phone_Verification)", async () => {
    const { deps } = makeDepsWithCreateSpy();

    const resolution = await resolvePublisher(
      mockReq({ headers: { [ACCOUNT_ID_HEADER]: "101" } }),
      deps.loadAccount,
    );

    assert.equal(resolution.ok, false);
    if (!resolution.ok) {
      assert.equal(resolution.status, 403);
      // Индикация ошибки: требуется завершить Phone_Verification (R8.4).
      assert.equal(resolution.body.reason, "phone_verification_required");
    }
  });

  it("POST темы неверифицированным аккаунтом → 403 и тема НЕ сохраняется (createLocalTopic не вызывается)", async () => {
    const { deps, createLocalTopicCalls } = makeDepsWithCreateSpy();
    const h = makeHandlers(deps);
    const res = mockRes();

    await h.createLocalTopic(
      mockReq({
        headers: { [ACCOUNT_ID_HEADER]: "101" },
        body: { category: "tool_sharing", title: "Одолжу дрель", body: "Соседям" },
      }),
      res as any,
    );

    assert.equal(res.statusCode, 403);
    assert.equal((res.body as any).reason, "phone_verification_required");
    // Гейт отклонил публикацию ДО пути создания → тема не сохранена (0 вызовов).
    assert.equal(createLocalTopicCalls(), 0);
  });

  it("POST темы анонимом без идентификатора аккаунта → 401 и тема НЕ сохраняется", async () => {
    const { deps, createLocalTopicCalls } = makeDepsWithCreateSpy();
    const h = makeHandlers(deps);
    const res = mockRes();

    await h.createLocalTopic(
      mockReq({
        body: { category: "tool_sharing", title: "Одолжу дрель", body: "Соседям" },
      }),
      res as any,
    );

    assert.equal(res.statusCode, 401);
    assert.equal(createLocalTopicCalls(), 0);
  });

  it("контраст: верифицированный аккаунт проходит гейт и достигает пути создания (тема сохраняется)", async () => {
    const { deps, createLocalTopicCalls } = makeDepsWithCreateSpy();
    const h = makeHandlers(deps);
    const res = mockRes();

    await h.createLocalTopic(
      mockReq({
        headers: { [ACCOUNT_ID_HEADER]: "100" },
        body: { category: "tool_sharing", title: "Одолжу дрель", body: "Соседям" },
      }),
      res as any,
    );

    assert.equal(res.statusCode, 201);
    // Гейт пройден → путь создания достигнут ровно один раз.
    assert.equal(createLocalTopicCalls(), 1);
  });
});

// ─── R2.3 — fallback публикации в City_Feed, когда локации нет ───────────────

/**
 * Инъектируемый db-стаб для `FeedService.createPublicQuestion` по городскому
 * пути (`cityId`, без `zhkId`). Мимикрирует ровно те вызовы Drizzle, которые
 * делает метод в городской ветке:
 *   • `select({id}).from(cities).where(...).limit(1)` → `[ { id } ]`, если город
 *     существует, иначе `[]` (проверка существования City, R8.5-safe);
 *   • `insert(threads).values(v).returning()` → `[ row ]`, где row отражает
 *     переданные значения (эхо застабленной персистентности).
 * Реального Postgres нет — только детерминированный стаб.
 */
function makeCityDbStub(opts: { cityId: number; cityExists: boolean }) {
  let capturedInsert: any = null;
  const database = {
    select() {
      return {
        from() {
          return {
            where() {
              return {
                limit() {
                  return Promise.resolve(
                    opts.cityExists ? [{ id: opts.cityId }] : [],
                  );
                },
              };
            },
          };
        },
      };
    },
    insert() {
      return {
        values(vals: any) {
          capturedInsert = vals;
          return {
            returning() {
              // Эхо сохранённой строки: нормализуем undefined → null как БД.
              return Promise.resolve([
                {
                  id: 999,
                  ...vals,
                  zhkId: vals.zhkId ?? null,
                  cityId: vals.cityId ?? null,
                },
              ]);
            },
          };
        },
      };
    },
  };
  return { database, captured: () => capturedInsert };
}

describe("City_Feed fallback — Resident без подходящей Locality пишет в City_Feed (R2.3)", () => {
  it("публикация в City_Feed (адресат-город, без локации) → создаётся тема со scope='city', привязанная к City", async () => {
    const { database, captured } = makeCityDbStub({ cityId: CITY.id, cityExists: true });
    const svc = new FeedService(database as any);

    const result = await svc.createPublicQuestion({
      // Локация НЕ выбрана (zhkId отсутствует) → городская лента-fallback.
      cityId: CITY.id,
      category: null,
      title: "Ищу электрика по всему городу",
      body: "В моём районе пока нет своей локации — спрашиваю у города.",
    });

    assert.equal(result.status, "created");
    if (result.status === "created") {
      const thread = result.thread;
      // Тема уровня города (City_Feed), а не локальной ленты.
      assert.equal(thread.scope, "city");
      assert.equal(thread.cityId, CITY.id);
      // Не привязана ни к какой Locality (fallback именно на City_Feed).
      assert.equal(thread.zhkId, null);
    }
    // Городская ветка действительно писала scope='city' с city_id этого города.
    assert.equal(captured().scope, "city");
    assert.equal(captured().cityId, CITY.id);
  });

  it("контраст: путь City_Feed валидирует существование City (несуществующий город → no_target, ничего не создаётся)", async () => {
    const { database, captured } = makeCityDbStub({ cityId: CITY.id, cityExists: false });
    const svc = new FeedService(database as any);

    const result = await svc.createPublicQuestion({
      cityId: 12345,
      category: null,
      title: "Ищу электрика по всему городу",
      body: "Город не существует.",
    });

    assert.equal(result.status, "rejected");
    if (result.status === "rejected") {
      assert.equal(result.reason, "no_target");
    }
    // Отклонение произошло ДО вставки → ничего не сохранено.
    assert.equal(captured(), null);
  });
});
