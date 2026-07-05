/**
 * Property test for the pure Locality_Page metadata builder — noindex gating
 * (community-generalized-locality, task 9.3).
 *
 * Module under test: `./communityLocalityMeta.ts` (`buildLocalityMetadata`,
 * created in task 9.1). It is intentionally pure (the absolute `baseUrl` is
 * passed in), so this test runs fully in-memory without the Next.js request
 * machinery, a browser, or Postgres.
 *
 * Runner / convention. The marketplace (Next.js 15) package has NO test runner
 * of its own, so — per the spec's testing strategy and mirroring the sibling
 * Property 13 test (`communityLocalityMeta.property.test.ts`, task 9.2) — this
 * test reuses Node's built-in test runner (`node:test`) driven by `tsx`, with
 * `fast-check` for generators. Run:
 *
 *   pnpm --filter @workspace/marketplace test
 *   # or, directly:
 *   npx tsx --test ./lib/locality-noindex.property.test.ts
 *
 * The property runs a minimum of 100 iterations (`{ numRuns: 200 }`).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  buildLocalityMetadata,
  LOCALITY_NOINDEX_ROBOTS,
} from "./communityLocalityMeta";

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/**
 * Locality_Kind space, deliberately widened beyond the valid set so the noindex
 * gate is exercised for `zhk`/`district`/`settlement` AND for unknown/absent
 * kinds (which resolve to `zhk`, Requirement 1.4, 9.6). Gating must depend only
 * on `isIndexable`, never on `kind`.
 */
const kindArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom("zhk", "district", "settlement"),
  fc.constant(undefined),
  fc.constant(null),
  fc.constantFrom("ЖК", "town", "", "  ", "DISTRICT", "villa"),
  fc.string(),
);

/** Name space: arbitrary Unicode incl. Cyrillic, plus empty/whitespace-only. */
const nameArb: fc.Arbitrary<string> = fc.oneof(
  fc.string(),
  fc.constantFrom("", "   ", "\t", "\n  ", " \u00a0 "),
  fc.constantFrom(
    "Черёмушки",
    "ФМР",
    "ЖК «Заря»",
    "посёлок Северный",
    "Краснодар-Сити",
  ),
);

/** Realistic slug: url-safe `[a-z0-9-]`, non-empty, length 1..60. */
const slugArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-".split("")), {
    minLength: 1,
    maxLength: 60,
  })
  .map((chars) => chars.join(""))
  .filter((s) => /[a-z0-9]/.test(s));

/** Base URL with and without a trailing slash. */
const baseUrlArb: fc.Arbitrary<string> = fc.constantFrom(
  "https://chestnye-mastera.ru",
  "https://chestnye-mastera.ru/",
);

/** is_indexable tri-state: true / false / undefined (never evaluated). */
const isIndexableArb: fc.Arbitrary<boolean | undefined> = fc.constantFrom(
  true,
  false,
  undefined,
);

// ─── Property 14 — Noindex gating ─────────────────────────────────────────────
// Feature: community-generalized-locality, Property 14: Noindex gating

describe("communityLocalityMeta — Property 14: Noindex gating", () => {
  // **Validates: Requirements 6.7**

  it("noindex присутствует тогда и только тогда, когда isIndexable === false", () => {
    fc.assert(
      fc.property(
        nameArb,
        slugArb,
        kindArb,
        baseUrlArb,
        isIndexableArb,
        (name, slug, kind, baseUrl, isIndexable) => {
          const meta = buildLocalityMetadata(
            { name, slug, kind: kind as string | null | undefined, isIndexable },
            baseUrl,
          );

          const hasNoindex =
            Object.prototype.hasOwnProperty.call(meta, "robots") &&
            meta.robots !== undefined;

          // Biconditional: noindex directive present ⇔ isIndexable === false.
          assert.equal(
            hasNoindex,
            isIndexable === false,
            `noindex должен присутствовать тогда и только тогда, когда ` +
              `isIndexable === false (isIndexable=${String(isIndexable)}, ` +
              `kind=${String(kind)})`,
          );

          if (isIndexable === false) {
            // Директива noindex обязана иметь каноническую форму.
            assert.deepEqual(
              meta.robots,
              { index: false, follow: false },
              "robots должен быть { index: false, follow: false }",
            );
            assert.deepEqual(
              meta.robots,
              LOCALITY_NOINDEX_ROBOTS,
              "robots должен совпадать с общим LOCALITY_NOINDEX_ROBOTS",
            );
          } else {
            // isIndexable === true | undefined ⇒ ключ robots отсутствует.
            assert.equal(meta.robots, undefined);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("конкретные случаи гейтинга noindex", () => {
    const base = "https://chestnye-mastera.ru";

    // false ⇒ noindex присутствует
    const blocked = buildLocalityMetadata(
      { name: "ФМР", slug: "fmr", kind: "district", isIndexable: false },
      base,
    );
    assert.deepEqual(blocked.robots, { index: false, follow: false });

    // true ⇒ ключ robots отсутствует
    const indexable = buildLocalityMetadata(
      { name: "Заря", slug: "zarya", kind: "zhk", isIndexable: true },
      base,
    );
    assert.equal(indexable.robots, undefined);
    assert.equal(
      Object.prototype.hasOwnProperty.call(indexable, "robots"),
      false,
    );

    // undefined (никогда не оценивалась) ⇒ ключ robots отсутствует
    const neverEvaluated = buildLocalityMetadata(
      { name: "Северный", slug: "severnyy", kind: "settlement" },
      base,
    );
    assert.equal(neverEvaluated.robots, undefined);
    assert.equal(
      Object.prototype.hasOwnProperty.call(neverEvaluated, "robots"),
      false,
    );
  });
});
