/**
 * Unit tests for Geo_Service HTTP-слоя — резолвинг идентификатора публикующего
 * Community_Account (Task 3.4).
 *
 * **Validates: Requirement 4.1** — создание ЖК требует Community_Account
 * (уровень доступа 3). Здесь проверяется чистая функция `resolveAccountId`,
 * которая извлекает идентификатор аккаунта из запроса (заголовок в приоритете,
 * затем тело) и отбраковывает отсутствующие/некорректные значения. Сам гейт
 * прав публикации (`hasPublishingRights`) и обращение к БД покрываются
 * интеграционным/роут-слоем.
 *
 * Тест чистый: сеть/БД/таймеры не используются.
 *
 * Run: pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// `@workspace/db` кидает при загрузке модуля без DATABASE_URL. Тестируем чистую
// функцию без запросов, поэтому фиктивной строки достаточно (pg.Pool ленив).
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { resolveAccountId } = await import("../../src/routes/community/geo.js");

describe("community/geo.resolveAccountId (Requirement 4.1 — уровень доступа 3)", () => {
  it("берёт числовой идентификатор из заголовка X-Community-Account-Id", () => {
    assert.equal(
      resolveAccountId({ headers: { "x-community-account-id": "42" } }),
      42,
    );
  });

  it("берёт идентификатор из тела accountId, если заголовка нет", () => {
    assert.equal(resolveAccountId({ headers: {}, body: { accountId: 7 } }), 7);
  });

  it("заголовок имеет приоритет над телом", () => {
    assert.equal(
      resolveAccountId({
        headers: { "x-community-account-id": "5" },
        body: { accountId: 99 },
      }),
      5,
    );
  });

  it("обрезает пробелы в строковом заголовке", () => {
    assert.equal(
      resolveAccountId({ headers: { "x-community-account-id": "  13  " } }),
      13,
    );
  });

  it("возвращает null, когда идентификатор отсутствует", () => {
    assert.equal(resolveAccountId({ headers: {} }), null);
    assert.equal(resolveAccountId({ headers: {}, body: {} }), null);
    assert.equal(resolveAccountId({}), null);
  });

  it("отклоняет некорректные значения (нечисло, ноль, отрицательное, дробное)", () => {
    assert.equal(resolveAccountId({ headers: { "x-community-account-id": "abc" } }), null);
    assert.equal(resolveAccountId({ headers: {}, body: { accountId: 0 } }), null);
    assert.equal(resolveAccountId({ headers: {}, body: { accountId: -3 } }), null);
    assert.equal(resolveAccountId({ headers: {}, body: { accountId: 2.5 } }), null);
    assert.equal(resolveAccountId({ headers: {}, body: { accountId: "" } }), null);
  });
});
