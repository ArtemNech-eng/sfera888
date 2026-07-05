// Feature: community-phone-registration, Task 8.1 (end-to-end register→publish→logout→401), Validates: Requirements 1.3, 4.1, 4.3, 5.4, 8.5
//
// Сквозной интеграционный тест password-потока сообщества «ХочуТакже».
//
// Проверяет, что session-backed поток работает от начала до конца через РЕАЛЬНЫЙ
// стек Express + express-session (in-memory MemoryStore), без Postgres, сети,
// SMS и bcrypt-сети. Роутеры собираются РЕАЛЬНЫМИ фабриками:
//   • createAuthRouter(deps)  → POST /register, /login, /logout, GET /me
//   • createFeedsRouter(deps) → POST /zhk (createLocalTopic) за resolvePublisher
//
// Зависимости инъектируются так, чтобы оба роутера делили ОДНО in-memory
// хранилище аккаунтов: аккаунт, созданный при /register, немедленно виден
// feeds-роутеру через loadAccount по id из Community_Session.
//
// **Requirements под проверкой:**
//   • 1.3 — успешная регистрация устанавливает Community_Session (cookie
//     `connect.sid` в Set-Cookie).
//   • 8.5 — успешная регистрация устанавливает контекст аутентифицированного
//     аккаунта через Community_Session (последующие запросы аутентифицированы).
//   • 5.4 — публикация допускается только для аккаунта с Publishing_Rights,
//     разрешённого из сессии (созданный аккаунт имеет непустой passwordHash).
//   • 4.1 — logout завершает Community_Session; идентификатор по этой сессии
//     после выхода недоступен.
//   • 4.3 — запрос без действительной Community_Session (после logout)
//     отклоняется как неаутентифицированный (401) на гейте публикации.
//
// Драйвер — встроенный node fetch против сервера на эфемерном порту
// (app.listen(0)); Set-Cookie от /register вручную сохраняется в cookie-jar и
// отправляется в последующих запросах.
//
// Run (pnpm-store tsx, не bare npx):
//   node_modules/.bin/tsx --test ./__tests__/community/register-publish-logout.integration.test.ts

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import type { CommunityAccount } from "@workspace/db";
import type { CommunityAccountRepository } from "../../src/lib/communityAuth.js";
import type { CreateLocalTopicResult } from "../../src/lib/feedService.js";

// `@workspace/db` бросает при импорте без DATABASE_URL. Логика роутеров чистая
// (все сервисы инъектируются), поэтому даём фиктивный URL и подгружаем модули
// динамически — реальный Postgres не задействуется.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const express = (await import("express")).default;
const session = (await import("express-session")).default;
const { createAuthRouter } = await import("../../src/routes/community/auth.js");
const { createFeedsRouter } = await import("../../src/routes/community/feeds.js");

// ─── Общее in-memory хранилище аккаунтов (делится auth- и feeds-роутерами) ───

/**
 * Хранилище Community_Account по id. Оба роутера читают из НЕГО: auth создаёт
 * аккаунт при /register, feeds резолвит его по id из сессии при публикации.
 */
class AccountStore {
  private readonly byId = new Map<number, CommunityAccount>();
  private nextId = 1;

  createWithPassword(phone: string, passwordHash: string): CommunityAccount {
    const account = {
      id: this.nextId++,
      phone,
      passwordHash,
      phoneVerifiedAt: null,
      role: "resident",
      zhkId: 42,
      maxUserId: null,
      createdAt: new Date(),
    } as CommunityAccount;
    this.byId.set(account.id, account);
    return account;
  }

  findByPhone(phone: string): CommunityAccount | null {
    for (const a of this.byId.values()) if (a.phone === phone) return a;
    return null;
  }

  loadById(id: number): CommunityAccount | null {
    return this.byId.get(id) ?? null;
  }
}

/** Репозиторий поверх общего стора (password-поток регистрации/входа). */
function makeAccountsRepo(store: AccountStore): CommunityAccountRepository {
  return {
    async findByPhone(phone) {
      return store.findByPhone(phone);
    },
    async createWithPassword(phone, passwordHash) {
      return store.createWithPassword(phone, passwordHash);
    },
    async createVerified(): Promise<never> {
      throw new Error("createVerified не используется в password-потоке");
    },
    async markVerified(): Promise<never> {
      throw new Error("markVerified не используется в password-потоке");
    },
    async linkMax(): Promise<never> {
      throw new Error("linkMax не используется в этом тесте");
    },
  };
}

// ─── Простой cookie-jar поверх node fetch ────────────────────────────────────

/** Минимальный cookie-jar: хранит name=value из Set-Cookie и отдаёт Cookie-заголовок. */
class CookieJar {
  private readonly cookies = new Map<string, string>();

  capture(res: Response): void {
    // Node 18+ отдаёт несколько Set-Cookie через getSetCookie().
    const setCookies =
      typeof (res.headers as any).getSetCookie === "function"
        ? (res.headers as any).getSetCookie()
        : ([res.headers.get("set-cookie")].filter(Boolean) as string[]);
    for (const raw of setCookies) {
      const first = raw.split(";", 1)[0]!;
      const eq = first.indexOf("=");
      if (eq <= 0) continue;
      const name = first.slice(0, eq).trim();
      const value = first.slice(eq + 1).trim();
      this.cookies.set(name, value);
    }
  }

  header(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  has(name: string): boolean {
    return this.cookies.has(name);
  }
}

// ─── Тестовый сервер ─────────────────────────────────────────────────────────

let server: Server;
let baseUrl: string;
let store: AccountStore;
/** Захватывает вход createLocalTopic, чтобы проверить автора из сессии (R5.4). */
let capturedTopicInput: { authorAccountId?: number } | null = null;

before(async () => {
  store = new AccountStore();
  const accounts = makeAccountsRepo(store);

  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: "test-secret-community-phone-registration",
      resave: false,
      saveUninitialized: false,
      store: new session.MemoryStore(),
      cookie: {},
    }),
  );

  // Auth-роутер: password-поток без БД/сети/bcrypt-сети.
  app.use(
    "/api/community/auth",
    createAuthRouter({
      loadAccount: async (id) => store.loadById(id),
      auth: {
        accounts,
        // Детерминированная «проверка» captcha — всегда успех.
        verifyCaptcha: async () => ({ success: true }),
        // Детерминированный хеш (не bcrypt-сеть): непустой и ≠ открытому паролю.
        hashPassword: async (pw: string) => `hashed:${pw}`,
        verifyPassword: async (pw: string, hash: string) => hash === `hashed:${pw}`,
      },
    }),
  );

  // Feeds-роутер: loadAccount читает ТОТ ЖЕ стор по id из сессии; createLocalTopic
  // фиктивно возвращает созданную тему (публикация от аккаунта сессии).
  app.use(
    "/api/community/feeds",
    createFeedsRouter({
      loadAccount: async (id) => store.loadById(id),
      feedService: {
        async getCityFeed() {
          return { items: [], emptyState: true, nextCursor: null };
        },
        async getLocalFeed() {
          return { items: [], emptyState: true, nextCursor: null };
        },
        async createLocalTopic(input): Promise<CreateLocalTopicResult> {
          capturedTopicInput = input as { authorAccountId?: number };
          return { status: "created", thread: { id: 999 } as any };
        },
        async createPublicQuestion() {
          return { status: "created", thread: { id: 1000 } as any };
        },
      },
      async getZhkBySlug(slug) {
        return slug === "zhk-solnechnyy"
          ? { id: 42, slug, name: "ЖК Солнечный", cityId: 7, status: "NON_LIVING" }
          : null;
      },
      async getCityBySlug() {
        return null;
      },
    }),
  );

  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// ─── Сквозной сценарий ───────────────────────────────────────────────────────

describe("community password-поток — сквозной: register → publish → logout → 401", () => {
  // Validates: Requirements 1.3, 4.1, 4.3, 5.4, 8.5
  it("register устанавливает сессию; публикация от аккаунта сессии; после logout — 401", async () => {
    const jar = new CookieJar();

    // ── 1) POST /register → 201 + Set-Cookie с connect.sid (R1.3, R8.5).
    const registerRes = await fetch(`${baseUrl}/api/community/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phone: "+79161234567",
        password: "hunter22pass",
        captchaToken: "smart-token",
      }),
    });
    jar.capture(registerRes);
    const registerBody = (await registerRes.json()) as any;

    assert.equal(registerRes.status, 201, "успешная регистрация → 201");
    assert.equal(registerBody.ok, true);
    assert.ok(
      jar.has("connect.sid"),
      "R1.3/R8.5: регистрация должна установить Community_Session (cookie connect.sid)",
    );
    // Публичный DTO без password_hash.
    assert.equal(registerBody.account.passwordHash, undefined);
    const accountId = registerBody.account.id as number;

    // ── 2) POST /feeds/zhk с cookie → 201 created, автор из сессии (R5.4, R8.5).
    const publishRes = await fetch(`${baseUrl}/api/community/feeds/zhk`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: jar.header() },
      body: JSON.stringify({
        category: "tool_sharing",
        title: "Одолжу дрель",
        body: "Есть дрель на выходные",
      }),
    });
    const publishBody = (await publishRes.json()) as any;

    assert.equal(
      publishRes.status,
      201,
      "R5.4/R8.5: аккаунт из сессии с Publishing_Rights публикует → 201 created",
    );
    assert.equal(publishBody.status, "created");
    assert.equal(publishBody.thread.id, 999);
    assert.equal(
      capturedTopicInput?.authorAccountId,
      accountId,
      "R5.4: автор темы берётся из аккаунта сессии, а не из тела запроса",
    );

    // ── 3) POST /logout с cookie → 200 { ok: true } (R4.1).
    const logoutRes = await fetch(`${baseUrl}/api/community/auth/logout`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: jar.header() },
    });
    const logoutBody = (await logoutRes.json()) as any;

    assert.equal(logoutRes.status, 200, "R4.1: logout при действительной сессии → 200");
    assert.deepEqual(logoutBody, { ok: true });

    // ── 4) Повторная публикация с уничтоженной сессией → 401 (R4.3).
    const afterLogoutRes = await fetch(`${baseUrl}/api/community/feeds/zhk`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: jar.header() },
      body: JSON.stringify({
        category: "tool_sharing",
        title: "Ещё раз",
        body: "Попытка после выхода",
      }),
    });
    const afterLogoutBody = (await afterLogoutRes.json()) as any;

    assert.equal(
      afterLogoutRes.status,
      401,
      "R4.3: запрос без действительной Community_Session (после logout) → 401 unauthorized",
    );
    assert.deepEqual(afterLogoutBody, { error: "unauthorized" });
  });
});
