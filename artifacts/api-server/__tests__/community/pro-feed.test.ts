/**
 * Unit tests for PRO_Public_Layer feed behavior (Task 5.2).
 *
 * **Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.6** — All_Russia_Feed по
 * умолчанию и My_City_Filter:
 *   • 6.2 — по умолчанию отображается All_Russia_Feed выбранной специальности;
 *   • 6.3 — пока фильтр не применён, лента остаётся All_Russia даже без
 *     локальных тем в текущем городе;
 *   • 6.4 — явное применение My_City_Filter переопределяет дефолт и показывает
 *     только локальные темы текущего города;
 *   • 6.5 — при фильтре и отсутствии локальных тем лента пустая, БЕЗ отката к
 *     All_Russia;
 *   • 6.6 — фильтр активируется только при явном применении, не автоматически.
 *
 * Тестируем чистые, детерминированные функции `resolveProFeedMode` и
 * `proFeedIncludesThread`, которые зеркалят SQL-условия `FeedService.getProFeed`
 * и не обращаются к БД. Сам DB-метод покрывается интеграционным/роут-слоем.
 *
 * Run: npx tsx --test ./__tests__/community/pro-feed.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// `@workspace/db` кидает при загрузке модуля без DATABASE_URL; тестируемые
// функции чистые и не выполняют запросов — фиктивной строки достаточно.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const {
  resolveProFeedMode,
  proFeedIncludesThread,
} = await import("../../src/lib/feedService.js");

type ProFeedThreadShape = Parameters<typeof proFeedIncludesThread>[0];
type ProFeedFilter = Parameters<typeof proFeedIncludesThread>[1];

/** Собрать PRO-тему с разумными дефолтами (публичная тема специальности 1). */
function makeThread(overrides: Partial<ProFeedThreadShape> = {}): ProFeedThreadShape {
  return {
    zone: "pro_public",
    specialtyId: 1,
    isLocal: false,
    cityId: null,
    visibility: "public",
    ...overrides,
  };
}

// ─── resolveProFeedMode — активация фильтра только явно (Requirement 6.6) ────

describe("resolveProFeedMode (Requirements 6.2, 6.6)", () => {
  it("дефолт (фильтр не применён) → all_russia (Requirement 6.2)", () => {
    assert.equal(resolveProFeedMode(false), "all_russia");
  });

  it("явное применение фильтра → my_city (Requirement 6.4)", () => {
    assert.equal(resolveProFeedMode(true), "my_city");
  });
});

// ─── Дефолт All_Russia_Feed (Requirements 6.2, 6.3) ──────────────────────────

describe("proFeedIncludesThread — дефолт All_Russia (Requirements 6.2, 6.3)", () => {
  const defaultFilter: ProFeedFilter = {
    specialtyId: 1,
    cityFilterApplied: false,
  };

  it("включает тему специальности из любого города (агрегация по стране)", () => {
    assert.equal(
      proFeedIncludesThread(makeThread({ cityId: 77, isLocal: false }), defaultFilter),
      true,
    );
    assert.equal(
      proFeedIncludesThread(makeThread({ cityId: 12, isLocal: true }), defaultFilter),
      true,
    );
    assert.equal(
      proFeedIncludesThread(makeThread({ cityId: null }), defaultFilter),
      true,
    );
  });

  it("остаётся All_Russia даже если локальных тем текущего города нет (Requirement 6.3)", () => {
    // Тема другого города всё равно попадает в дефолтную ленту — она не пустеет.
    const otherCityThread = makeThread({ cityId: 999, isLocal: true });
    assert.equal(
      proFeedIncludesThread(otherCityThread, { ...defaultFilter, currentCityId: 1 }),
      true,
    );
  });

  it("исключает тему другой специальности (Requirement 6.1)", () => {
    assert.equal(
      proFeedIncludesThread(makeThread({ specialtyId: 2 }), defaultFilter),
      false,
    );
  });

  it("исключает контент вне публичного PRO-слоя (зона/видимость)", () => {
    assert.equal(proFeedIncludesThread(makeThread({ zone: "pro_protected" }), defaultFilter), false);
    assert.equal(proFeedIncludesThread(makeThread({ zone: "sosedi" }), defaultFilter), false);
    assert.equal(proFeedIncludesThread(makeThread({ visibility: "hidden" }), defaultFilter), false);
    assert.equal(proFeedIncludesThread(makeThread({ visibility: "protected" }), defaultFilter), false);
  });
});

// ─── My_City_Filter (Requirements 6.4, 6.5) ──────────────────────────────────

describe("proFeedIncludesThread — My_City_Filter (Requirements 6.4, 6.5)", () => {
  const cityFilter: ProFeedFilter = {
    specialtyId: 1,
    cityFilterApplied: true,
    currentCityId: 1,
  };

  it("включает только локальные темы текущего города (Requirement 6.4)", () => {
    assert.equal(
      proFeedIncludesThread(makeThread({ isLocal: true, cityId: 1 }), cityFilter),
      true,
    );
  });

  it("исключает нелокальные темы текущего города (только локальный контент, 6.4)", () => {
    assert.equal(
      proFeedIncludesThread(makeThread({ isLocal: false, cityId: 1 }), cityFilter),
      false,
    );
  });

  it("исключает локальные темы другого города (только текущий город, 6.4)", () => {
    assert.equal(
      proFeedIncludesThread(makeThread({ isLocal: true, cityId: 2 }), cityFilter),
      false,
    );
  });

  it("не откатывается к All_Russia: тема другого города НЕ попадает (Requirement 6.5)", () => {
    // Даже если локальных тек текущего города нет, тема другого города при
    // активном фильтре исключается — лента остаётся локальной/пустой.
    const otherCity = makeThread({ isLocal: true, cityId: 999 });
    assert.equal(proFeedIncludesThread(otherCity, cityFilter), false);
    const nonLocalCurrentCity = makeThread({ isLocal: false, cityId: 1 });
    assert.equal(proFeedIncludesThread(nonLocalCurrentCity, cityFilter), false);
  });

  it("без текущего города при активном фильтре ничего не включает (Requirement 6.5)", () => {
    const noCity: ProFeedFilter = { specialtyId: 1, cityFilterApplied: true, currentCityId: null };
    assert.equal(proFeedIncludesThread(makeThread({ isLocal: true, cityId: 1 }), noCity), false);
  });
});

// ─── Переопределение дефолта фильтром (Requirements 6.4, 6.6) ─────────────────

describe("My_City_Filter переопределяет дефолт (Requirements 6.4, 6.6)", () => {
  it("одна и та же нелокальная тема: в дефолте включена, при фильтре — нет", () => {
    const thread = makeThread({ isLocal: false, cityId: 1 });
    assert.equal(
      proFeedIncludesThread(thread, { specialtyId: 1, cityFilterApplied: false, currentCityId: 1 }),
      true,
      "в дефолте (All_Russia) нелокальная тема специальности включается",
    );
    assert.equal(
      proFeedIncludesThread(thread, { specialtyId: 1, cityFilterApplied: true, currentCityId: 1 }),
      false,
      "при My_City_Filter нелокальная тема исключается (переопределение дефолта)",
    );
  });
});
