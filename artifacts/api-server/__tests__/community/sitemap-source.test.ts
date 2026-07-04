/**
 * Unit tests for the community sitemap source mapper (Task 11.2).
 *
 * **Validates: Requirements 16.1, 16.3, 5.2, 6.5** — источник sitemap отдаёт
 * ТОЛЬКО индексируемые слаги (города целевого SEO-набора, ЖК выше порога
 * контента, специальности PRO), а пустые/битые слаги отбрасываются, чтобы в
 * sitemap не попадали «тонкие»/невалидные записи.
 *
 * Тестируем ЧИСТЫЙ маппер `toCommunitySitemap` без БД. `@workspace/db` бросает
 * при загрузке без DATABASE_URL — задаём фиктивную строку до динамического
 * импорта.
 *
 * Run: pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { toCommunitySitemap } = await import("../../src/routes/community/sitemap.js");

describe("toCommunitySitemap (Requirements 16.1, 16.3, 5.2, 6.5)", () => {
  it("собирает слаги городов, ЖК и специальностей", () => {
    const out = toCommunitySitemap(
      [{ slug: "moskva" }, { slug: "sankt-peterburg" }],
      [{ slug: "zhk-solnechnyy" }],
      [{ slug: "plitochnik" }, { slug: "elektrik" }],
    );
    assert.deepEqual(out.cities, ["moskva", "sankt-peterburg"]);
    assert.deepEqual(out.zhk, ["zhk-solnechnyy"]);
    assert.deepEqual(out.specialties, ["plitochnik", "elektrik"]);
  });

  it("отбрасывает пустые/пробельные/null-слаги (нет «тонких»/битых записей)", () => {
    const out = toCommunitySitemap(
      [{ slug: "moskva" }, { slug: "" }, { slug: "   " }, { slug: null }],
      [{ slug: null }],
      [{ slug: "plitochnik" }],
    );
    assert.deepEqual(out.cities, ["moskva"]);
    assert.deepEqual(out.zhk, []);
    assert.deepEqual(out.specialties, ["plitochnik"]);
  });

  it("пустой вход → пустые списки (валидная деградация sitemap)", () => {
    const out = toCommunitySitemap([], [], []);
    assert.deepEqual(out, { cities: [], zhk: [], specialties: [] });
  });

  it("тримит окружающие пробелы у валидных слагов", () => {
    const out = toCommunitySitemap([{ slug: "  moskva  " }], [], []);
    assert.deepEqual(out.cities, ["moskva"]);
  });
});
