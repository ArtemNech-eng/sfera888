/**
 * Property test for My_City_Filter exclusivity in PRO_Public_Layer feeds.
 *
 * Property 6: эксклюзивность My_City_Filter.
 *
 * **Validates: Requirements 6.4, 6.5 (Property 6)**
 *   • 6.4 — при явно применённом My_City_Filter лента ограничена ТОЛЬКО
 *     локальными рабочими темами текущего города (`is_local = true` И
 *     `city_id = currentCityId`), показывая исключительно локальный контент;
 *   • 6.5 — если локальных тем текущего города нет, лента остаётся пустой и
 *     НЕ выполняется возврат (fallback) к All_Russia_Feed.
 *
 * Модуль под тестом:
 *   - `resolveProFeedMode` / `proFeedIncludesThread` из
 *     `artifacts/api-server/src/lib/feedService.ts`.
 *
 * Контекст. My_City_Filter в дизайне реализован не отдельной таблицей, а
 * дополнительными условиями `.where()` метода `FeedService.getProFeed`
 * (`is_local = true` И `city_id = currentCityId` поверх `zone = 'pro_public'`,
 * `visibility = 'public'`, `specialty_id = ?`). Эти условия не исполнимы без
 * БД, поэтому инвариант проверяется на ЧИСТОМ предикате
 * `proFeedIncludesThread`, который зеркалит ту же семантику. Тест доказывает
 * инвариант для произвольного набора PRO-тем со случайными зонами, городами,
 * специальностями и признаком локальности (fast-check).
 *
 * Свойства при применённом фильтре (`cityFilterApplied = true`,
 * `currentCityId` задан):
 *   6a  Эксклюзивность: КАЖДАЯ прошедшая предикат тема удовлетворяет
 *       `zone = 'pro_public'` ∧ `visibility = 'public'` ∧
 *       `specialtyId = filter.specialtyId` ∧ `isLocal = true` ∧
 *       `cityId = currentCityId`.
 *   6b  Никогда не включается тема другого города или нелокальная тема
 *       (отсутствие отката к All_Russia_Feed, Requirement 6.5).
 *   6c  Отсутствие локальных тем ⇒ выборка пуста (пустая лента, без fallback).
 *
 * Run via Node's built-in test runner:
 *   npx tsx --test ./__tests__/community/city-filter.property.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// `@workspace/db` кидает при загрузке модуля без DATABASE_URL; тестируемые
// функции чистые и не выполняют запросов — фиктивной строки достаточно
// (как в pro-feed.test.ts).
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
const { resolveProFeedMode, proFeedIncludesThread } = await import(
  "../../src/lib/feedService.js"
);

type ProFeedThreadShape = Parameters<typeof proFeedIncludesThread>[0];
type ProFeedFilter = Parameters<typeof proFeedIncludesThread>[1];

// ─── Generators ──────────────────────────────────────────────────────────────

/** Возможные зоны тем: только `pro_public` попадает в публичную PRO-ленту. */
const zoneArb: fc.Arbitrary<string> = fc.constantFrom(
  "pro_public",
  "pro_protected",
  "sosedi",
);

/** Возможные значения видимости: только `public` попадает в публичную ленту. */
const visibilityArb: fc.Arbitrary<string> = fc.constantFrom(
  "public",
  "protected",
  "hidden",
);

/** Небольшой диапазон id, чтобы генерировались совпадения города/специальности. */
const smallIdArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 5 });

/** Произвольная PRO-тема со случайными зоной/видимостью/городом/специальностью. */
const threadArb: fc.Arbitrary<ProFeedThreadShape> = fc.record({
  zone: zoneArb,
  specialtyId: fc.option(smallIdArb, { nil: null }),
  isLocal: fc.boolean(),
  cityId: fc.option(smallIdArb, { nil: null }),
  visibility: visibilityArb,
});

/** Смешанный набор тем (может быть пустым). */
const threadsArb: fc.Arbitrary<ProFeedThreadShape[]> = fc.array(threadArb, {
  minLength: 0,
  maxLength: 60,
});

/** Фильтр с применённым My_City_Filter и заданным текущим городом. */
const appliedFilterArb: fc.Arbitrary<ProFeedFilter> = fc.record({
  specialtyId: smallIdArb,
  cityFilterApplied: fc.constant(true),
  currentCityId: smallIdArb,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Property 6: эксклюзивность My_City_Filter (Requirements 6.4, 6.5)", () => {
  // -----------------------------------------------------------------------
  // Property 6a — эксклюзивность выборки при применённом фильтре.
  // Validates: Requirements 6.4
  // -----------------------------------------------------------------------
  it("каждая прошедшая тема — локальная тема текущего города нужной специальности", () => {
    fc.assert(
      fc.property(threadsArb, appliedFilterArb, (threads, filter) => {
        // Режим ленты при явном фильтре — строго my_city (Requirement 6.6/6.4).
        assert.equal(resolveProFeedMode(filter.cityFilterApplied), "my_city");

        const included = threads.filter((t) => proFeedIncludesThread(t, filter));
        for (const t of included) {
          assert.equal(
            t.zone,
            "pro_public",
            `Не-pro_public тема попала в My_City выборку: ${JSON.stringify(t)}`,
          );
          assert.equal(
            t.visibility,
            "public",
            `Непубличная тема попала в My_City выборку: ${JSON.stringify(t)}`,
          );
          assert.equal(
            t.specialtyId,
            filter.specialtyId,
            `Тема другой специальности попала в выборку: ${JSON.stringify(t)}`,
          );
          assert.equal(
            t.isLocal,
            true,
            `Нелокальная тема попала в My_City выборку: ${JSON.stringify(t)}`,
          );
          assert.equal(
            t.cityId,
            filter.currentCityId,
            `Тема другого города попала в My_City выборку: ${JSON.stringify(t)}`,
          );
        }
      }),
      { numRuns: 400 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 6b — нет отката к All_Russia: чужой город / нелокальные исключены.
  // Validates: Requirements 6.5
  // -----------------------------------------------------------------------
  it("тема другого города или нелокальная тема никогда не включается (нет fallback к All_Russia)", () => {
    fc.assert(
      fc.property(threadsArb, appliedFilterArb, (threads, filter) => {
        for (const t of threads) {
          const included = proFeedIncludesThread(t, filter);
          const isForeignCity = t.cityId !== filter.currentCityId;
          const isNonLocal = t.isLocal !== true;
          if (isForeignCity || isNonLocal) {
            assert.equal(
              included,
              false,
              `Не-локальная/чужая тема просочилась в My_City выборку: ${JSON.stringify(
                t,
              )} при filter=${JSON.stringify(filter)}`,
            );
          }
        }
      }),
      { numRuns: 400 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 6c — отсутствие локальных тем ⇒ пустая лента (без fallback).
  // Validates: Requirements 6.5
  // -----------------------------------------------------------------------
  it("если ни одна тема не является локальной темой текущего города — выборка пуста", () => {
    // Генерируем наборы, где заведомо НЕТ локальных тем текущего города:
    // либо не-локальные, либо другого города.
    const noMatchThreadArb: fc.Arbitrary<ProFeedThreadShape> = threadArb.map(
      (t) => ({ ...t, isLocal: false }),
    );

    fc.assert(
      fc.property(
        fc.array(noMatchThreadArb, { minLength: 0, maxLength: 60 }),
        appliedFilterArb,
        (threads, filter) => {
          const included = threads.filter((t) =>
            proFeedIncludesThread(t, filter),
          );
          assert.equal(
            included.length,
            0,
            `При отсутствии локальных тем выборка не пуста (fallback к All_Russia): ${JSON.stringify(
              included,
            )}`,
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 6d — сравнение с дефолтом: фильтр строго сужает выборку.
  // Validates: Requirements 6.4
  // -----------------------------------------------------------------------
  it("My_City выборка — подмножество дефолтной All_Russia выборки той же специальности", () => {
    fc.assert(
      fc.property(threadsArb, appliedFilterArb, (threads, filter) => {
        const defaultFilter: ProFeedFilter = {
          specialtyId: filter.specialtyId,
          cityFilterApplied: false,
          currentCityId: filter.currentCityId,
        };
        for (const t of threads) {
          if (proFeedIncludesThread(t, filter)) {
            assert.equal(
              proFeedIncludesThread(t, defaultFilter),
              true,
              `Тема прошла My_City, но не прошла бы дефолт All_Russia: ${JSON.stringify(
                t,
              )}`,
            );
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  // -----------------------------------------------------------------------
  // Concrete example — смешанный набор: остаётся только локальная тема города.
  // -----------------------------------------------------------------------
  it("конкретный смешанный набор: остаётся лишь локальная тема текущего города", () => {
    const filter: ProFeedFilter = {
      specialtyId: 1,
      cityFilterApplied: true,
      currentCityId: 1,
    };
    const mixed: ProFeedThreadShape[] = [
      { zone: "pro_public", specialtyId: 1, isLocal: true, cityId: 1, visibility: "public" }, // ✓
      { zone: "pro_public", specialtyId: 1, isLocal: false, cityId: 1, visibility: "public" }, // нелокальная
      { zone: "pro_public", specialtyId: 1, isLocal: true, cityId: 2, visibility: "public" }, // другой город
      { zone: "pro_public", specialtyId: 2, isLocal: true, cityId: 1, visibility: "public" }, // другая специальность
      { zone: "pro_protected", specialtyId: 1, isLocal: true, cityId: 1, visibility: "public" }, // закрытый слой
      { zone: "pro_public", specialtyId: 1, isLocal: true, cityId: 1, visibility: "hidden" }, // непубличная
    ];

    const included = mixed.filter((t) => proFeedIncludesThread(t, filter));
    assert.equal(included.length, 1);
    assert.deepEqual(included[0], mixed[0]);
    assert.ok(included.every((t) => t.isLocal === true && t.cityId === 1));
  });
});
