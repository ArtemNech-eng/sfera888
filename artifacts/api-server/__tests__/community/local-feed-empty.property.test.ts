// Feature: community-generalized-locality, Property 11: Empty feed for empty locality
/**
 * Property test for Empty Local_Feed (Community Generalized Locality, Стадия 2).
 *
 * Property 11: *For any* existing Locality with zero bound Community_Threads,
 *              the Local_Feed SHALL be empty (zero threads) and SHALL NOT
 *              return an error.
 *
 * **Validates: Requirements 2.6**
 *
 * Module under test (`src/lib/feedService.ts`):
 *   - `FeedService.getLocalFeed(zhkId, query)` reads `community_threads` with
 *     the fixed base conditions
 *         zone = 'sosedi' ∧ scope = 'zhk' ∧ zhk_id = <Locality.id> ∧
 *         visibility = 'public'
 *     and, via the shared private `readFeed`, returns a `FeedResult`:
 *         { items, emptyState, nextCursor }
 *     where on the first page (no cursor) `emptyState = items.length === 0`
 *     and `nextCursor = null` when there is no further page. When NO row
 *     matches the base filter the query yields zero rows and `readFeed`
 *     returns `{ items: [], emptyState: true, nextCursor: null }` WITHOUT
 *     throwing (generalized-locality Requirement 2.6; hochu-takzhe Requirement
 *     3.6). The selection is kind-agnostic — it depends only on `zhk_id` +
 *     `scope = 'zhk'` and never branches on Locality_Kind.
 *
 * DB seam / harness note.
 *   `getLocalFeed` composes a Drizzle query (`.select().from().where(and(...))
 *   .orderBy(...).limit(...)`) whose predicate is an opaque SQL object; it can
 *   only be exercised end-to-end against a real Postgres. This repository has
 *   NO ephemeral/transactional-Postgres test harness (no testcontainers,
 *   pg-mem, pglite, or DATABASE_URL-backed fixture) — the existing community
 *   property tests (`local-feed.property.test.ts` for Property 8,
 *   `zhk-dedup.property.test.ts`, `city-filter.property.test.ts`) instead
 *   exercise an IN-MEMORY model that MIRRORS the exact query semantics under a
 *   fake `DATABASE_URL`, because `@workspace/db` instantiates a `pg.Pool` at
 *   module-load time. This test follows that established convention: the
 *   in-memory `localFeedResult` mirrors the base filter, the
 *   `created_at DESC, id DESC` ordering, and the `{ items, emptyState,
 *   nextCursor }` result shape of `getLocalFeed`/`readFeed` verbatim, and the
 *   property is asserted over generated thread sets that contain ZERO threads
 *   bound to the target locality. The real module is loaded (anchoring the
 *   test to its exported page-size constants), but no real query is issued.
 *
 * Run via Node's built-in test runner:
 *   npx tsx --test ./__tests__/community/local-feed-empty.property.test.ts
 */

// `feedService.ts` statically imports `@workspace/db`, which instantiates a
// pg.Pool at module-load time and throws when `DATABASE_URL` is unset. pg.Pool
// does not connect lazily, so a fake connection string is enough — no real
// query is performed here (the empty-feed contract is mirrored in memory).
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// Dynamic import with a `.js` extension guarantees the `DATABASE_URL`
// assignment above runs BEFORE `@workspace/db` is loaded. We pull the real
// page-size constants so the test tracks the production values.
const feedService = await import("../../src/lib/feedService.js");
const { MAX_FEED_LIMIT, DEFAULT_FEED_LIMIT } = feedService;

// ─── Local_Feed base conditions (mirror of getLocalFeed) ─────────────────────
// Kept local to the test so a regression in the production constants cannot
// silently satisfy the mirror.
const SOSEDI_ZONE = "sosedi";
const SCOPE_ZHK = "zhk";
const SCOPE_CITY = "city";
const PUBLIC_VISIBILITY = "public";

/** Locality_Kind values — the feed logic must be identical for every one. */
const LOCALITY_KINDS = ["zhk", "district", "settlement"] as const;
type LocalityKind = (typeof LOCALITY_KINDS)[number];

/** Minimal shape of a `community_threads` row relevant to the Local_Feed. */
interface ThreadRow {
  id: number;
  zone: string;
  scope: string;
  zhkId: number | null;
  cityId: number | null;
  visibility: string;
  createdAt: Date;
}

/** The `FeedResult` shape produced by `getLocalFeed` (mirror). */
interface FeedResultMirror {
  items: ThreadRow[];
  emptyState: boolean;
  nextCursor: string | null;
}

/** created_at DESC, ties broken by id DESC (mirrors `desc(createdAt), desc(id)`). */
function compareLocalFeed(a: ThreadRow, b: ThreadRow): number {
  const byDate = b.createdAt.getTime() - a.createdAt.getTime();
  if (byDate !== 0) return byDate;
  return b.id - a.id; // id descending on tie
}

/** Predicate mirroring the fixed base filter of `getLocalFeed`. */
function isBoundToLocality(t: ThreadRow, localityId: number): boolean {
  return (
    t.zone === SOSEDI_ZONE &&
    t.scope === SCOPE_ZHK &&
    t.zhkId === localityId &&
    t.visibility === PUBLIC_VISIBILITY
  );
}

/**
 * IN-MEMORY mirror of `FeedService.getLocalFeed(localityId).` for the FIRST
 * page (no cursor) — reproduces the exact base filter, ordering, and the
 * `{ items, emptyState, nextCursor }` result shape of the production
 * `readFeed`:
 *
 *   WHERE zone='sosedi' AND scope='zhk' AND zhk_id=<localityId>
 *         AND visibility='public'
 *   ORDER BY created_at DESC, id DESC
 *   LIMIT <limit>
 *
 *   emptyState = items.length === 0   (first page, no cursor)
 *   nextCursor = null when there is no further page
 *
 * The Locality_Kind is intentionally NOT a parameter: the selection depends
 * only on `zhk_id` + `scope='zhk'`, mirroring the kind-agnostic production code.
 */
function localFeedResult(
  threads: readonly ThreadRow[],
  localityId: number,
  limit: number,
): FeedResultMirror {
  const matched = threads
    .filter((t) => isBoundToLocality(t, localityId))
    .slice()
    .sort(compareLocalFeed);

  const hasMore = matched.length > limit;
  const items = hasMore ? matched.slice(0, limit) : matched;

  return {
    items,
    // Empty state only on the first page (no cursor) — mirrors `readFeed`.
    emptyState: items.length === 0,
    nextCursor: hasMore ? "cursor" : null,
  };
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

// The Locality under test — the generated thread sets are constrained so that
// NO thread is ever bound to this id (that is the whole point of Property 11).
const TARGET_LOCALITY_ID = 1;
const OTHER_LOCALITY_IDS = [2, 3, 4];
const CITY_IDS = [10, 11, 12];

const createdAtArb: fc.Arbitrary<Date> = fc
  .constantFrom(
    Date.UTC(2026, 0, 1, 8, 0, 0),
    Date.UTC(2026, 0, 2, 12, 0, 0),
    Date.UTC(2026, 5, 10, 18, 45, 0),
  )
  .map((ms) => new Date(ms));

/**
 * A thread spec that is GUARANTEED NOT to bind to `TARGET_LOCALITY_ID`. Each
 * spec violates at least one clause of the base filter, covering every way a
 * locality can end up with zero bound threads:
 *
 *   • "other_locality"  — sosedi/zhk/public but bound to a DIFFERENT locality
 *   • "city_scope"      — sosedi but scope='city' (bound to a city, zhk_id null)
 *   • "wrong_zone"      — zhk/public but a non-sosedi zone (pro layers)
 *   • "non_public"      — sosedi/zhk but visibility != 'public'
 *   • "null_zhk"        — sosedi/zhk/public but zhk_id is null
 */
type UnboundKind = "other_locality" | "city_scope" | "wrong_zone" | "non_public" | "null_zhk";

const unboundKindArb = fc.constantFrom<UnboundKind>(
  "other_locality",
  "city_scope",
  "wrong_zone",
  "non_public",
  "null_zhk",
);

const unboundSpecArb = fc
  .record({
    variant: unboundKindArb,
    otherLocality: fc.constantFrom(...OTHER_LOCALITY_IDS),
    cityId: fc.constantFrom(...CITY_IDS),
    zone: fc.constantFrom("pro_public", "pro_protected"),
    visibility: fc.constantFrom("protected", "hidden", "draft"),
    createdAt: createdAtArb,
  })
  .map((r): Omit<ThreadRow, "id"> => {
    switch (r.variant) {
      case "other_locality":
        return {
          zone: SOSEDI_ZONE,
          scope: SCOPE_ZHK,
          zhkId: r.otherLocality, // != TARGET_LOCALITY_ID
          cityId: null,
          visibility: PUBLIC_VISIBILITY,
          createdAt: r.createdAt,
        };
      case "city_scope":
        return {
          zone: SOSEDI_ZONE,
          scope: SCOPE_CITY,
          zhkId: null,
          cityId: r.cityId,
          visibility: PUBLIC_VISIBILITY,
          createdAt: r.createdAt,
        };
      case "wrong_zone":
        return {
          zone: r.zone, // not 'sosedi'
          scope: SCOPE_ZHK,
          zhkId: TARGET_LOCALITY_ID, // even bound to target, wrong zone excludes it
          cityId: null,
          visibility: PUBLIC_VISIBILITY,
          createdAt: r.createdAt,
        };
      case "non_public":
        return {
          zone: SOSEDI_ZONE,
          scope: SCOPE_ZHK,
          zhkId: TARGET_LOCALITY_ID, // bound to target, but not public
          cityId: null,
          visibility: r.visibility, // != 'public'
          createdAt: r.createdAt,
        };
      case "null_zhk":
      default:
        return {
          zone: SOSEDI_ZONE,
          scope: SCOPE_ZHK,
          zhkId: null,
          cityId: null,
          visibility: PUBLIC_VISIBILITY,
          createdAt: r.createdAt,
        };
    }
  });

/**
 * A set of threads (0..MAX_FEED_LIMIT), NONE of which is bound to the target
 * locality. `minLength: 0` includes the completely-empty thread set. Ids are
 * assigned sequentially by array index (guaranteeing uniqueness).
 */
const emptyForTargetThreadsArb: fc.Arbitrary<ThreadRow[]> = fc
  .array(unboundSpecArb, { minLength: 0, maxLength: MAX_FEED_LIMIT })
  .map((specs) => specs.map((s, i) => ({ ...s, id: i + 1 })));

// ─── Property 11 — empty feed for a locality with zero bound threads ─────────

describe("Local_Feed — Property 11: empty feed for empty locality", () => {
  // Validates: Requirements 2.6

  it("a locality with zero bound threads yields an empty feed and no error", () => {
    fc.assert(
      fc.property(emptyForTargetThreadsArb, (threads) => {
        // Sanity: the generator must never bind a thread to the target.
        assert.equal(
          threads.some((t) => isBoundToLocality(t, TARGET_LOCALITY_ID)),
          false,
          "generator invariant violated: a thread is bound to the target locality",
        );

        // Computing the feed must not throw (no error on empty locality).
        let result: FeedResultMirror;
        assert.doesNotThrow(() => {
          result = localFeedResult(threads, TARGET_LOCALITY_ID, DEFAULT_FEED_LIMIT);
        });

        // Zero threads, explicit empty state, no pagination cursor.
        assert.deepEqual(result!.items, [], "feed must contain zero threads");
        assert.equal(result!.items.length, 0, "feed length must be exactly zero");
        assert.equal(result!.emptyState, true, "emptyState must be true for an empty locality");
        assert.equal(result!.nextCursor, null, "nextCursor must be null when the feed is empty");
      }),
      { numRuns: 300 },
    );
  });

  it("is kind-agnostic: an empty locality is empty regardless of Locality_Kind", () => {
    // Kind does not participate in the selection; an unbound thread set must
    // produce the same empty result whether the locality is a zhk, district,
    // or settlement.
    const kindArb = fc.constantFrom<LocalityKind>(...LOCALITY_KINDS);

    fc.assert(
      fc.property(emptyForTargetThreadsArb, kindArb, (threads, _kind) => {
        const result = localFeedResult(threads, TARGET_LOCALITY_ID, DEFAULT_FEED_LIMIT);
        assert.deepEqual(result.items, []);
        assert.equal(result.emptyState, true);
        assert.equal(result.nextCursor, null);
      }),
      { numRuns: 300 },
    );
  });
});

// ─── Concrete examples — the distinct "empty" shapes ─────────────────────────

describe("Local_Feed — Property 11: concrete empty-locality examples", () => {
  it("completely empty thread set → empty feed, no error", () => {
    const result = localFeedResult([], TARGET_LOCALITY_ID, DEFAULT_FEED_LIMIT);
    assert.deepEqual(result.items, []);
    assert.equal(result.emptyState, true);
    assert.equal(result.nextCursor, null);
  });

  it("threads exist but all bound elsewhere / wrong scope / zone / visibility → empty feed", () => {
    const base = Date.UTC(2026, 0, 1, 8, 0, 0);
    const t = (ms: number) => new Date(base + ms);
    const threads: ThreadRow[] = [
      // sosedi/zhk/public but ANOTHER locality
      { id: 1, zone: SOSEDI_ZONE, scope: SCOPE_ZHK, zhkId: 2, cityId: null, visibility: "public", createdAt: t(0) },
      // sosedi but city scope
      { id: 2, zone: SOSEDI_ZONE, scope: SCOPE_CITY, zhkId: null, cityId: 10, visibility: "public", createdAt: t(100) },
      // bound to target id but wrong (non-sosedi) zone
      { id: 3, zone: "pro_public", scope: SCOPE_ZHK, zhkId: 1, cityId: null, visibility: "public", createdAt: t(200) },
      // bound to target id but not public
      { id: 4, zone: SOSEDI_ZONE, scope: SCOPE_ZHK, zhkId: 1, cityId: null, visibility: "hidden", createdAt: t(300) },
      // sosedi/zhk/public but null zhk_id
      { id: 5, zone: SOSEDI_ZONE, scope: SCOPE_ZHK, zhkId: null, cityId: null, visibility: "public", createdAt: t(400) },
    ];

    const result = localFeedResult(threads, TARGET_LOCALITY_ID, DEFAULT_FEED_LIMIT);
    assert.deepEqual(result.items, [], "no thread is bound to the target locality");
    assert.equal(result.emptyState, true);
    assert.equal(result.nextCursor, null);
  });
});
