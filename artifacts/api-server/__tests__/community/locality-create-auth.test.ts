/**
 * Feature: community-generalized-locality, Task 5.3: create without phone verification
 *
 * Unit tests for the POST /zhk access-control guard (уровень доступа 3).
 *
 * **Validates: Requirements 4.5** — создание Locality_Record без завершённой
 * Phone_Verification отклоняется (403 `verification_required`) и не сохраняет
 * запись; отсутствие идентификатора Community_Account → 401 `account_required`.
 *
 * Гейт (`resolveCommunityPublisher` / `makeRequireCommunityPublisher`) тестируется
 * с инъектированным загрузчиком аккаунта и mock req/res/next — без реального
 * Postgres и без поднятия HTTP-сервера. Отсутствие персистентности проверяется
 * тем, что при отклонении гейта `next` не вызывается (нижележащий обработчик
 * создания, вызывающий `GeoService.createLocality`, не выполняется), а для
 * пути 401 загрузчик аккаунта вообще не запрашивается.
 *
 * Run: pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CommunityAccount } from "@workspace/db";

// `@workspace/db` кидает при загрузке модуля без DATABASE_URL. Здесь мы
// инъектируем загрузчик аккаунта и не выполняем ни одного запроса, поэтому
// фиктивной строки достаточно (pg.Pool ленив). Импорт — динамический.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { resolveCommunityPublisher, makeRequireCommunityPublisher } = await import(
  "../../src/routes/community/geo.js"
);

// ─── Тестовые дублёры ────────────────────────────────────────────────────────

/** Mock Response, захватывающий статус и тело. */
function mockRes() {
  const res: {
    statusCode: number;
    body: unknown;
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

/** Верифицированный аккаунт (Phone_Verification завершена). */
function verifiedAccount(): CommunityAccount {
  return {
    id: 42,
    phone: "+79991234567",
    phoneVerifiedAt: new Date("2026-01-01T00:00:00Z"),
    role: "resident",
    zhkId: null,
    maxUserId: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  } as CommunityAccount;
}

/** Аккаунт без завершённой Phone_Verification. */
function unverifiedAccount(): CommunityAccount {
  return { ...verifiedAccount(), phoneVerifiedAt: null } as CommunityAccount;
}

// ─── resolveCommunityPublisher — чистая логика гейта (R4.5) ───────────────────

describe("resolveCommunityPublisher — гейт создания Locality (R4.5)", () => {
  it("нет идентификатора аккаунта → 401 account_required, загрузчик НЕ вызывается", async () => {
    let loads = 0;
    const load = async (id: number) => {
      loads++;
      void id;
      return verifiedAccount();
    };

    const resolution = await resolveCommunityPublisher({ headers: {}, body: {} }, load);

    assert.equal(resolution.ok, false);
    if (!resolution.ok) {
      assert.equal(resolution.status, 401);
      assert.deepEqual(resolution.body, { error: "account_required" });
    }
    // Ничего не читается из хранилища → ничего не может быть сохранено.
    assert.equal(loads, 0);
  });

  it("аккаунт без Phone_Verification → 403 verification_required", async () => {
    const load = async () => unverifiedAccount();

    const resolution = await resolveCommunityPublisher(
      { headers: { "x-community-account-id": "42" } },
      load,
    );

    assert.equal(resolution.ok, false);
    if (!resolution.ok) {
      assert.equal(resolution.status, 403);
      assert.deepEqual(resolution.body, { error: "verification_required" });
    }
  });

  it("аккаунт не найден → 403 verification_required (публикация запрещена)", async () => {
    const load = async () => undefined;

    const resolution = await resolveCommunityPublisher(
      { headers: { "x-community-account-id": "999" } },
      load,
    );

    assert.equal(resolution.ok, false);
    if (!resolution.ok) {
      assert.equal(resolution.status, 403);
      assert.deepEqual(resolution.body, { error: "verification_required" });
    }
  });

  it("верифицированный аккаунт проходит гейт (контраст)", async () => {
    const account = verifiedAccount();
    const load = async () => account;

    const resolution = await resolveCommunityPublisher(
      { headers: { "x-community-account-id": "42" } },
      load,
    );

    assert.equal(resolution.ok, true);
    if (resolution.ok) {
      assert.equal(resolution.account.id, 42);
    }
  });
});

// ─── makeRequireCommunityPublisher — middleware поверх POST /zhk (R4.5) ───────

describe("POST /zhk middleware — доступ к созданию Locality (R4.5)", () => {
  it("без идентификатора аккаунта → 401 и создание НЕ достигается (createLocality не вызывается)", async () => {
    let createLocalityCalls = 0;
    // `next` — заглушка нижележащего обработчика создания: если бы он вызвался,
    // он бы обратился к GeoService.createLocality. Считаем вызовы.
    const next = () => {
      createLocalityCalls++;
    };
    let loads = 0;
    const guard = makeRequireCommunityPublisher(async (id) => {
      loads++;
      void id;
      return verifiedAccount();
    });

    const req: any = { headers: {}, body: { name: "Черёмушки", citySlug: "krasnodar" } };
    const res = mockRes();
    await guard(req, res as any, next);

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: "account_required" });
    // Гейт не пропустил дальше → обработчик создания не выполнен → нет записи.
    assert.equal(createLocalityCalls, 0);
    assert.equal(req.communityAccount, undefined);
    // При 401 хранилище аккаунтов даже не опрашивается.
    assert.equal(loads, 0);
  });

  it("аккаунт без Phone_Verification → 403 verification_required и запись НЕ создаётся", async () => {
    let createLocalityCalls = 0;
    const next = () => {
      createLocalityCalls++;
    };
    const guard = makeRequireCommunityPublisher(async () => unverifiedAccount());

    const req: any = {
      headers: { "x-community-account-id": "42" },
      body: { name: "Черёмушки", citySlug: "krasnodar" },
    };
    const res = mockRes();
    await guard(req, res as any, next);

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: "verification_required" });
    // Гейт отклонил публикацию до обработчика → Locality_Record не сохранён.
    assert.equal(createLocalityCalls, 0);
    assert.equal(req.communityAccount, undefined);
  });

  it("верифицированный аккаунт → next вызывается и достигает пути создания (контраст)", async () => {
    let createLocalityCalls = 0;
    const next = () => {
      createLocalityCalls++;
    };
    const account = verifiedAccount();
    const guard = makeRequireCommunityPublisher(async () => account);

    const req: any = {
      headers: { "x-community-account-id": "42" },
      body: { name: "Черёмушки", citySlug: "krasnodar" },
    };
    const res = mockRes();
    await guard(req, res as any, next);

    // Гейт пройден: обработчик создания достигнут ровно один раз.
    assert.equal(createLocalityCalls, 1);
    // Ответ об ошибке гейта не отправлялся.
    assert.equal(res.statusCode, 200);
    // Публикующий аккаунт проброшен в обработчик.
    assert.equal(req.communityAccount?.id, 42);
  });
});
