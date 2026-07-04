/**
 * Property test for zone isolation between Sosedi_Zone and PRO_Zone.
 *
 * Property 3: изоляция зон на уровне выборок.
 *
 * **Validates: Requirements 5.3, 8.3 (Property 3)**
 *
 * Module under test:
 *   - `threadInZone` / `COMMUNITY_ZONES` / `PRO_ZONES` from
 *     `artifacts/api-server/src/lib/zoneService.ts`
 *
 * Контекст. Изоляция зон в дизайне реализована НЕ разделением таблиц, а
 * фильтрацией по дискриминатору `community_threads.zone`: каждый endpoint
 * подставляет в `.where()` условие `zoneCondition(zone)` (`eq(zone, target)`)
 * или `zonesCondition(zones)` (`inArray(zone, targets)`). Эти хелперы
 * возвращают drizzle-SQL и не исполнимы без БД, поэтому инвариант проверяется
 * на ЧИСТОМ предикате `threadInZone(threadZone, target)`, который зеркалит ту
 * же семантику членства в зоне, что и SQL. Тест доказывает инвариант для
 * произвольного набора тем со случайными зонами (fast-check).
 *
 * Свойства:
 *   3.1  Sosedi-выборка (`target = 'sosedi'`) не содержит ни одной темы с
 *        zone ∈ {pro_public, pro_protected} (Requirements 5.3, 8.3).
 *   3.2  Любая PRO-выборка (`pro_public`, `pro_protected` или набор PRO_ZONES)
 *        не содержит sosedi-тем (Requirements 5.3, 8.3).
 *   3.3  Взаимная непересекаемость: тема не может попасть одновременно в
 *        Sosedi-выборку и в любую PRO-выборку.
 *   3.4  Полнота и точность одиночной выборки: `threadInZone(z, target)`
 *        истинно ⇔ `z === target` (мирроринг `eq(zone, target)`).
 *
 * Run via Node's built-in test runner:
 *   npx tsx --test ./__tests__/community/zone-isolation.property.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  threadInZone,
  COMMUNITY_ZONES,
  PRO_ZONES,
  type CommunityZone,
} from "../../src/lib/zoneService.js";

// ─── Generators ──────────────────────────────────────────────────────────────

const zoneArb: fc.Arbitrary<CommunityZone> = fc.constantFrom(
  ...COMMUNITY_ZONES,
);

/** Минимальная форма темы для фильтрации по зоне. */
interface Thread {
  id: number;
  zone: CommunityZone;
}

const threadArb: fc.Arbitrary<Thread> = fc.record({
  id: fc.integer({ min: 1, max: 1_000_000 }),
  zone: zoneArb,
});

/** Смешанный набор тем со случайными зонами (может быть пустым). */
const threadsArb: fc.Arbitrary<Thread[]> = fc.array(threadArb, {
  minLength: 0,
  maxLength: 50,
});

const PRO_ZONE_SET: readonly CommunityZone[] = ["pro_public", "pro_protected"];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Zone isolation Property 3: выборки не смешивают зоны", () => {
  // -----------------------------------------------------------------------
  // Property 3.1 — Sosedi-выборка не содержит pro_*.
  // Validates: Requirements 5.3, 8.3
  // -----------------------------------------------------------------------
  it("Sosedi-выборка не содержит тем с zone ∈ {pro_public, pro_protected}", () => {
    fc.assert(
      fc.property(threadsArb, (threads) => {
        const sosedi = threads.filter((t) => threadInZone(t.zone, "sosedi"));
        for (const t of sosedi) {
          assert.equal(
            t.zone,
            "sosedi",
            `Sosedi-выборка пропустила PRO-тему: ${JSON.stringify(t)}`,
          );
          assert.ok(
            !PRO_ZONE_SET.includes(t.zone),
            `Sosedi-выборка содержит PRO-зону: ${t.zone}`,
          );
        }
      }),
      { numRuns: 300 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 3.2 — любая PRO-выборка не содержит sosedi.
  // Validates: Requirements 5.3, 8.3
  // -----------------------------------------------------------------------
  it("PRO-выборка (pro_public | pro_protected | набор PRO_ZONES) не содержит sosedi-тем", () => {
    // Целевые PRO-выборки: две одиночные зоны и объединённый набор PRO_ZONES.
    const proTargetArb = fc.constantFrom<CommunityZone | readonly CommunityZone[]>(
      "pro_public",
      "pro_protected",
      [...PRO_ZONES],
    );

    fc.assert(
      fc.property(threadsArb, proTargetArb, (threads, target) => {
        const selected = threads.filter((t) => threadInZone(t.zone, target));
        for (const t of selected) {
          assert.notEqual(
            t.zone,
            "sosedi",
            `PRO-выборка (target=${JSON.stringify(
              target,
            )}) пропустила sosedi-тему: ${JSON.stringify(t)}`,
          );
        }
      }),
      { numRuns: 300 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 3.3 — взаимная непересекаемость Sosedi и PRO выборок.
  // Validates: Requirements 5.3, 8.3
  // -----------------------------------------------------------------------
  it("тема не может попасть одновременно в Sosedi- и в PRO-выборку", () => {
    fc.assert(
      fc.property(threadArb, (t) => {
        const inSosedi = threadInZone(t.zone, "sosedi");
        const inPro = threadInZone(t.zone, [...PRO_ZONES]);
        assert.ok(
          !(inSosedi && inPro),
          `Тема попала в обе выборки одновременно: ${JSON.stringify(t)}`,
        );
      }),
      { numRuns: 300 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 3.4 — одиночная выборка точна: membership ⇔ равенство зоны.
  // Validates: Requirements 5.3, 8.3
  // -----------------------------------------------------------------------
  it("threadInZone(z, target) истинно ⇔ z === target (мирроринг eq(zone, target))", () => {
    fc.assert(
      fc.property(zoneArb, zoneArb, (threadZone, target) => {
        assert.equal(
          threadInZone(threadZone, target),
          threadZone === target,
          `Одиночная выборка неточна для (${threadZone}, ${target})`,
        );
      }),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------------
  // Concrete example — смешанный набор фильтруется по каждой зоне без утечек.
  // -----------------------------------------------------------------------
  it("конкретный смешанный набор: каждая выборка возвращает только свою зону", () => {
    const mixed: Thread[] = [
      { id: 1, zone: "sosedi" },
      { id: 2, zone: "pro_public" },
      { id: 3, zone: "pro_protected" },
      { id: 4, zone: "sosedi" },
      { id: 5, zone: "pro_public" },
    ];

    const sosedi = mixed.filter((t) => threadInZone(t.zone, "sosedi"));
    assert.deepEqual(
      sosedi.map((t) => t.id),
      [1, 4],
    );
    assert.ok(sosedi.every((t) => t.zone === "sosedi"));

    const proPublic = mixed.filter((t) => threadInZone(t.zone, "pro_public"));
    assert.deepEqual(
      proPublic.map((t) => t.id),
      [2, 5],
    );
    assert.ok(proPublic.every((t) => t.zone !== "sosedi"));

    const proAll = mixed.filter((t) => threadInZone(t.zone, [...PRO_ZONES]));
    assert.deepEqual(
      proAll.map((t) => t.id),
      [2, 3, 5],
    );
    assert.ok(proAll.every((t) => t.zone !== "sosedi"));
  });
});
