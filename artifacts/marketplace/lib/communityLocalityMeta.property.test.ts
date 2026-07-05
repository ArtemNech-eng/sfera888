/**
 * Property tests for the pure Locality_Page metadata builder
 * (`buildLocalityMetadata`) — Стадия 2 (community-generalized-locality).
 *
 * Module under test: `./communityLocalityMeta.ts` (created in task 9.1). It is
 * intentionally pure (the absolute `baseUrl` is passed in), so these tests run
 * fully in-memory without the Next.js request machinery or the marketplace API.
 *
 * Runner / convention. The marketplace (Next.js 15) package has NO test runner
 * of its own, so — per the spec's testing strategy — these tests reuse the same
 * convention as the api-server community property tests: Node's built-in test
 * runner (`node:test`) driven by `tsx`, with `fast-check` for generators. Run:
 *
 *   pnpm --filter @workspace/marketplace test
 *   # or, directly:
 *   npx tsx --test ./lib/communityLocalityMeta.property.test.ts
 *
 * Each property runs a minimum of 100 iterations (`{ numRuns: 200 }`).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { buildLocalityMetadata } from "./communityLocalityMeta";

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/**
 * Locality_Kind space, deliberately widened beyond the valid set: the builder
 * must produce complete, correct metadata for `zhk`/`district`/`settlement`
 * AND for unknown/absent kinds (which resolve to `zhk`, Requirement 1.4, 9.6).
 */
const kindArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom("zhk", "district", "settlement"),
  fc.constant(undefined),
  fc.constant(null),
  // invalid/garbage kind strings — must still yield valid metadata
  fc.constantFrom("ЖК", "town", "", "  ", "DISTRICT", "villa"),
  fc.string(),
);

/**
 * Name space: arbitrary Unicode incl. Cyrillic, plus empty/whitespace-only
 * inputs that must fall back to a non-empty default (Requirement 6.6).
 */
const nameArb: fc.Arbitrary<string> = fc.oneof(
  fc.string(),
  // whitespace-only / empty — exercises the non-empty fallback
  fc.constantFrom("", "   ", "\t", "\n  ", " \u00a0 "),
  // realistic Cyrillic locality names
  fc.constantFrom(
    "Черёмушки",
    "ФМР",
    "ЖК «Заря»",
    "посёлок Северный",
    "Краснодар-Сити",
  ),
);

/** Realistic slug: url-safe `[a-z0-9-]`, non-empty, length 1..100. */
const slugArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-".split("")), {
    minLength: 1,
    maxLength: 60,
  })
  .map((chars) => chars.join(""))
  .filter((s) => /[a-z0-9]/.test(s));

/** Base URL with and without a trailing slash (normalization must collapse it). */
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

// ─── Property 13 — SEO metadata completeness ──────────────────────────────────
// Feature: community-generalized-locality, Property 13: SEO metadata completeness

describe("communityLocalityMeta — Property 13: SEO metadata completeness", () => {
  // **Validates: Requirements 6.6**

  it("любой kind ⇒ непустой title, непустое описание, абсолютный canonical по slug", () => {
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

          // Непустой title (после trim не пуст).
          assert.equal(typeof meta.title, "string");
          assert.ok(
            meta.title.trim().length > 0,
            `title должен быть непустым: ${JSON.stringify(meta.title)}`,
          );

          // Непустое текстовое описание.
          assert.equal(typeof meta.description, "string");
          assert.ok(
            meta.description.trim().length > 0,
            `description должен быть непустым: ${JSON.stringify(meta.description)}`,
          );

          // Абсолютный canonical.
          assert.ok(
            meta.canonical.startsWith("https://"),
            `canonical должен быть абсолютным: ${meta.canonical}`,
          );

          // Нормализация baseUrl: без завершающих слэшей, ровно один `/zhk/`.
          const normalizedBase = baseUrl.replace(/\/+$/, "");
          assert.equal(
            meta.canonical,
            `${normalizedBase}/zhk/${slug}`,
            "canonical должен быть baseUrl(без хвостового /) + /zhk/<slug>",
          );

          // Соответствует slug и стартует с переданного baseUrl.
          assert.ok(
            meta.canonical.endsWith(`/zhk/${slug}`),
            `canonical должен оканчиваться на /zhk/<slug>: ${meta.canonical}`,
          );
          assert.ok(
            meta.canonical.startsWith(normalizedBase),
            `canonical должен начинаться с baseUrl: ${meta.canonical}`,
          );

          // Нет схлопнутого/двойного слэша перед /zhk/ (проверка нормализации).
          assert.ok(
            !meta.canonical.includes("ru//zhk/"),
            `не должно быть двойного слэша перед /zhk/: ${meta.canonical}`,
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  it("конкретные локации каждого kind дают валидные метаданные", () => {
    for (const kind of ["zhk", "district", "settlement", undefined]) {
      const meta = buildLocalityMetadata(
        { name: "Черёмушки", slug: "cheremushki", kind: kind as string | undefined },
        "https://chestnye-mastera.ru",
      );
      assert.ok(meta.title.trim().length > 0, `title для kind=${kind}`);
      assert.ok(meta.description.trim().length > 0, `description для kind=${kind}`);
      assert.equal(meta.canonical, "https://chestnye-mastera.ru/zhk/cheremushki");
    }
  });
});

// Property 14 (Noindex gating) lives in its own file:
//   ./locality-noindex.property.test.ts  (task 9.3)
