/**
 * Unit tests for Geo_Service attribute shaping (Task 3.1).
 *
 * **Validates: Requirement 1.7** — на странице ЖК отображаются только
 * заполненные атрибуты (developer, completionDate, buildings); незаполненные
 * атрибуты в ответ не включаются.
 *
 * Тестируем чистую, детерминированную функцию `shapeZhkAttributes`, которая не
 * обращается к БД. Резолвинг по slug (`getCityBySlug` / `getZhkBySlug`) требует
 * реального соединения с Postgres и покрывается интеграционным/роут-слоем.
 *
 * Run: pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Zhk } from "@workspace/db";

// `@workspace/db` кидает при загрузке модуля, если не задан DATABASE_URL. Тест
// проверяет чистую функцию `shapeZhkAttributes` и не выполняет ни одного
// запроса, поэтому фиктивной строки подключения достаточно: `pg.Pool`
// ленивый и коннектится только при реальном запросе. Импорт модуля под тестом —
// динамический, чтобы env успел выставиться до вычисления его импортов.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { shapeZhkAttributes } = await import("../../src/lib/geoService.js");

/** Собрать строку `zhk` с разумными дефолтами и точечными переопределениями. */
function makeZhk(overrides: Partial<Zhk> = {}): Zhk {
  const base = {
    id: 1,
    slug: "zhk-primer",
    name: "ЖК Пример",
    nameNormalized: "жк пример",
    cityId: 10,
    developer: null,
    completionDate: null,
    buildings: null,
    status: "NON_LIVING",
    isSeeded: false,
    contentScore: 0,
    isIndexable: false,
    createdByAccountId: null,
    seoTitle: null,
    seoDescription: null,
    h1: null,
    bodyMd: null,
    createdAt: new Date("2026-01-20T00:00:00Z"),
  };
  return { ...base, ...overrides } as Zhk;
}

describe("geoService.shapeZhkAttributes (Requirement 1.7)", () => {
  it("всегда отдаёт базовые поля", () => {
    const view = shapeZhkAttributes(makeZhk());
    assert.equal(view.id, 1);
    assert.equal(view.slug, "zhk-primer");
    assert.equal(view.name, "ЖК Пример");
    assert.equal(view.cityId, 10);
    assert.equal(view.status, "NON_LIVING");
  });

  it("не включает незаполненные атрибуты (null)", () => {
    const view = shapeZhkAttributes(makeZhk());
    assert.equal("developer" in view, false);
    assert.equal("completionDate" in view, false);
    assert.equal("buildings" in view, false);
  });

  it("не включает атрибуты-строки, состоящие только из пробелов", () => {
    const view = shapeZhkAttributes(
      makeZhk({ developer: "   ", completionDate: "\t\n" }),
    );
    assert.equal("developer" in view, false);
    assert.equal("completionDate" in view, false);
  });

  it("не включает пустой список корпусов", () => {
    const view = shapeZhkAttributes(makeZhk({ buildings: [] }));
    assert.equal("buildings" in view, false);
  });

  it("включает заполненный developer (с обрезкой пробелов)", () => {
    const view = shapeZhkAttributes(makeZhk({ developer: "  ПИК  " }));
    assert.equal(view.developer, "ПИК");
  });

  it("включает заполненный срок сдачи", () => {
    const view = shapeZhkAttributes(makeZhk({ completionDate: "IV кв. 2026" }));
    assert.equal(view.completionDate, "IV кв. 2026");
  });

  it("включает непустой список корпусов как есть", () => {
    const buildings = [
      { name: "Корпус 1", completionDate: "2026-06-01" },
      { name: "Корпус 2" },
    ];
    const view = shapeZhkAttributes(makeZhk({ buildings }));
    assert.deepEqual(view.buildings, buildings);
  });

  it("включает только заполненные атрибуты при частичном заполнении", () => {
    const view = shapeZhkAttributes(
      makeZhk({ developer: "Самолёт", completionDate: null, buildings: null }),
    );
    assert.equal(view.developer, "Самолёт");
    assert.equal("completionDate" in view, false);
    assert.equal("buildings" in view, false);
  });
});
