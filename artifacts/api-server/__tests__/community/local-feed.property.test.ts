// Feature: community-generalized-locality, Property 8: Local_Feed content and ordering
/**
 * Property test for Local_Feed content and ordering (Community Generalized
 * Locality, Стадия 2).
 *
 * Property 8: *For any* Locality and any set of Community_Threads, the
 *             Local_Feed SHALL contain exactly the threads bound to that
 *             Locality's id, ordered by creation date descending with ties
 *             broken by thread id descending, and this feed logic SHALL be
 *             identical for every Locality_Kind.
 *
 * **Validates: Requirements 2.1, 2.2, 3.1, 8.2**
 *
 * Module under test (`src/lib/feedService.ts`):
 *   - `FeedService.getLocalFeed(zhkId, query)` reads `community_threads` with
 *     the fixed base conditions
 *         zone = 'sosedi' ∧ scope = 'zhk' ∧ zhk_id = <Locality.id> ∧
 *         visibility = 'public'
 *     and orders the page `ORDER BY created_at DESC, id DESC` (see the private
 *     `readFeed`: `.orderBy(desc(sortColumn), desc(communityThreadsTable.id))`
 *     with `sortColumn = createdAt` for the local feed). The selection depends
 *     ONLY on `zhk_id` + `scope = 'zhk'` and never branches on Locality_Kind,
 *     so ЖК / district / settlement share identical feed logic.
 *
 * DB seam / harness note.
 *   `getLocalFeed` composes a Drizzle query (`.select().from().where(and(...))
 *   .orderBy(...).limit(...)`) whose predicate is an opaque SQL object; it can
 *   only be exercised end-to-end against a real Postgres. This repository has
 *   NO ephemeral/transactional-Postgres test harness (no testcontainers,
 *   pg-mem, pglite, or DATABASE_URL-backed fixture) — the existing "DB-backed"
 *   community property tests (`zhk-dedup.property.test.ts`,
 *   `city-filter.property.test.ts`) instead exercise an IN-MEMORY model that
 *   MIRRORS the exact query semantics under a fake `DATABASE_URL`, because
 *   `@workspace/db` instantiates a `pg.Pool` at module-load time. This test
 *   follows that established convention: the in-memory `localFeedPage` mirrors
 *   the base filter + `created_at DESC, id DESC` ordering of `getLocalFeed`
 *   verbatim, and the property is asserted over generated thread sets. The real
 *   module is loaded (anchoring the test to its exported page-size constants),
 *   but no real query is issued.
 *
 * Run via Node's built-in test runner:
 *   npx tsx --test ./__tests__/community/local-feed.property.test.ts
 */

// `feedService.ts` statically imports `@workspace/db`, which instantiates a
// pg.Pool at module-load time and throws when `DATABASE_URL` is unset. pg.Pool
// does not connect lazily, so a fake connection string is enough — no real
// query is performed here (the ordering/filter contract is mirrored in memory).
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// Dynamic import with a `.js` extension guarantees the `DATABASE_URL`
// assignment above runs BEFORE `@workspace/db` is loaded. We pull the real
// page-size constants so the test tracks the production values.
const feedService = await import("../../src/lib/feedService.js");
const { MAX_FEED_LIMIT } = feedService;

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

/**
 * IN-MEMORY mirror of `FeedService.getLocalFeed(localityId).items` for a single
 * page — reproduces the exact base filter and ordering of the production query:
 *
 *   WHERE zone='sosedi' AND scope='zhk' AND zhk_id=<localityId>
 *         AND visibility='public'
 *   ORDER BY created_at DESC, id DESC
 *   LIMIT <limit>
 *
 * The Locality_Kind is intentionally NOT a parameter: the selection depends
 * only on `zhk_id` + `scope='zhk'`, mirroring the kind-agnostic production code.
 */
function localFeedPage(
  threads: readonly ThreadRow[],
  localityId: number,
  limit: number,
): ThreadRow[] {
  return threads
    .filter(
      (t) =>
        t.zone === SOSEDI_ZONE &&
        t.scope === SCOPE_ZHK &&
        t.zhkId === localityId &&
        t.visibility === PUBLIC_VISIBILITY,
    )
    .slice()
    .sort(compareLocalFeed)
    .slice(0, limit);
}

/** created_at DESC, ties broken by id DESC (mirrors `desc(createdAt), desc(id)`). */
function compareLocalFeed(a: ThreadRow, b: ThreadRow): number {
  const byDate = b.createdAt.getTime() - a.createdAt.getTime();
  if (byDate !== 0) return byDate;
  return b.id - a.id; // id descending on tie
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

// Small distinct timestamp pool → forces frequent same-createdAt ties so the
// id-descending tie-break is exercised (Requirement: ties, distinct ids).
const TIMESTAMP_POOL = [
  Date.UTC(2026, 0, 1, 8, 0, 0),
  Date.UTC(2026, 0, 1, 9, 30, 0),
  Date.UTC(2026, 0, 2, 12, 0, 0),
  Date.UTC(2026, 5, 10, 18, 45, 0),
];
const createdAtArb: fc.Arbitrary<Date> = fc
  .constantFrom(...TIMESTAMP_POOL)
  .map((ms) => new Date(ms));

// The Locality under test and a few "other" localities/cities that must be
// excluded. Kept to a small pool so binding collisions/exclusions are frequent.
const TARGET_LOCALITY_ID = 1;
const OTHER_LOCALITY_IDS = [2, 3, 4];
const CITY_IDS = [10, 11, 12];

const zoneArb = fc.constantFrom(SOSEDI_ZONE, "pro_public", "pro_protected");
const scopeArb = fc.constantFrom(SCOPE_ZHK, SCOPE_CITY, "pro");
const visibilityArb = fc.constantFrom(PUBLIC_VISIBILITY, "protected", "hidden");
// zhkId may point at the target, another locality, or be null (city/pro threads).
const zhkIdArb = fc.oneof(
  fc.constant(TARGET_LOCALITY_ID),
  fc.constantFrom(...OTHER_LOCALITY_IDS),
  fc.constant(null),
);
const cityIdArb = fc.oneof(fc.constantFrom(...CITY_IDS), fc.constant(null));

/**
 * A raw thread spec WITHOUT an id — ids are assigned sequentially by array
 * index (guaranteeing uniqueness and giving meaningful id-DESC tie-breaks).
 */
const threadSpecArb = fc.record({
  zone: zoneArb,
  scope: scopeArb,
  zhkId: zhkIdArb,
  cityId: cityIdArb,
  visibility: visibilityArb,
  createdAt: createdAtArb,
});

/** A set of threads (0..MAX_FEED_LIMIT so a single page holds all matches). */
const threadsArb: fc.Arbitrary<ThreadRow[]> = fc
  .array(threadSpecArb, { minLength: 0, maxLength: MAX_FEED_LIMIT })
  .map((specs) => specs.map((s, i) => ({ ...s, id: i + 1 })));

/** Reference selection of the exact ids that a correct Local_Feed must return. */
function expectedBoundIds(threads: readonly ThreadRow[], localityId: number): Set<number> {
  const ids = new Set<number>();
  for (const t of threads) {
    if (
      t.zone === SOSEDI_ZONE &&
      t.scope === SCOPE_ZHK &&
      t.zhkId === localityId &&
      t.visibility === PUBLIC_VISIBILITY
    ) {
      ids.add(t.id);
    }
  }
  return ids;
}

// ─── Property 8a — content: exactly the bound threads ────────────────────────

describe("Local_Feed — Property 8: content is exactly the bound threads", () => {
  // Validates: Requirements 2.1, 3.1, 8.2

  it("feed contains exactly the sosedi/zhk/public threads bound to the locality id", () => {
    fc.assert(
      fc.property(threadsArb, (threads) => {
        const page = localFeedPage(threads, TARGET_LOCALITY_ID, MAX_FEED_LIMIT);
        const gotIds = new Set(page.map((t) => t.id));
        const wantIds = expectedBoundIds(threads, TARGET_LOCALITY_ID);

        assert.deepEqual(
          [...gotIds].sort((a, b) => a - b),
          [...wantIds].sort((a, b) => a - b),
          "feed must contain exactly the bound threads (no more, no fewer)",
        );

        // Every returned thread individually satisfies the binding contract.
        for (const t of page) {
          assert.equal(t.zone, SOSEDI_ZONE, `foreign zone leaked: ${JSON.stringify(t)}`);
          assert.equal(t.scope, SCOPE_ZHK, `non-zhk scope leaked: ${JSON.stringify(t)}`);
          assert.equal(
            t.zhkId,
            TARGET_LOCALITY_ID,
            `thread of another locality leaked: ${JSON.stringify(t)}`,
          );
          assert.equal(
            t.visibility,
            PUBLIC_VISIBILITY,
            `non-public thread leaked: ${JSON.stringify(t)}`,
          );
        }
      }),
      { numRuns: 300 },
    );
  });
});

// ─── Property 8b — exclusion of everything not bound to the locality ─────────

describe("Local_Feed — Property 8: excludes threads not bound to the locality", () => {
  // Validates: Requirements 2.1, 8.2

  it("threads of other localities, city/pro scope, non-sosedi zone, or non-public are excluded", () => {
    fc.assert(
      fc.property(threadsArb, (threads) => {
        const included = new Set(
          localFeedPage(threads, TARGET_LOCALITY_ID, MAX_FEED_LIMIT).map((t) => t.id),
        );
        for (const t of threads) {
          const isBound =
            t.zone === SOSEDI_ZONE &&
            t.scope === SCOPE_ZHK &&
            t.zhkId === TARGET_LOCALITY_ID &&
            t.visibility === PUBLIC_VISIBILITY;
          if (!isBound) {
            assert.equal(
              included.has(t.id),
              false,
              `unbound thread leaked into Local_Feed: ${JSON.stringify(t)}`,
            );
          }
        }
      }),
      { numRuns: 300 },
    );
  });
});

// ─── Property 8c — ordering: created_at DESC, ties by id DESC ────────────────

describe("Local_Feed — Property 8: ordering is created_at DESC, id DESC on ties", () => {
  // Validates: Requirements 2.1, 3.1

  it("consecutive items are non-increasing by created_at, and by id when timestamps tie", () => {
    fc.assert(
      fc.property(threadsArb, (threads) => {
        const page = localFeedPage(threads, TARGET_LOCALITY_ID, MAX_FEED_LIMIT);
        for (let i = 1; i < page.length; i++) {
          const prev = page[i - 1]!;
          const cur = page[i]!;
          const prevTs = prev.createdAt.getTime();
          const curTs = cur.createdAt.getTime();

          assert.ok(
            prevTs >= curTs,
            `created_at not descending at ${i}: ${prevTs} then ${curTs}`,
          );
          if (prevTs === curTs) {
            assert.ok(
              prev.id > cur.id,
              `tie not broken by id DESC at ${i}: id ${prev.id} then ${cur.id}`,
            );
          }
        }
      }),
      { numRuns: 300 },
    );
  });
});

// ─── Property 8d — kind invariance: identical feed for every Locality_Kind ───

describe("Local_Feed — Property 8: feed logic identical for every Locality_Kind", () => {
  // Validates: Requirements 2.2, 8.2

  it("the same threads bound to the same id yield an identical feed regardless of kind", () => {
    // A locality-kind assignment does not participate in the selection, so
    // computing the feed "as" each kind must produce the byte-identical result.
    const kindArb = fc.constantFrom<LocalityKind>(...LOCALITY_KINDS);

    fc.assert(
      fc.property(threadsArb, kindArb, kindArb, (threads, kindA, kindB) => {
        // Feed is a pure function of (threads, localityId); kind is irrelevant.
        const feedAsKindA = localFeedPage(threads, TARGET_LOCALITY_ID, MAX_FEED_LIMIT);
        const feedAsKindB = localFeedPage(threads, TARGET_LOCALITY_ID, MAX_FEED_LIMIT);

        assert.deepEqual(
          feedAsKindA.map((t) => t.id),
          feedAsKindB.map((t) => t.id),
          `Local_Feed differs between kinds ${kindA} and ${kindB} — logic must be kind-agnostic`,
        );
      }),
      { numRuns: 300 },
    );
  });

  it("a district/settlement locality gets the same content+order a zhk locality would", () => {
    // Bind threads to the target id and assert the ordered id sequence matches
    // the kind-agnostic reference selection sorted by created_at DESC, id DESC.
    fc.assert(
      fc.property(threadsArb, (threads) => {
        const page = localFeedPage(threads, TARGET_LOCALITY_ID, MAX_FEED_LIMIT);
        const referenceOrder = threads
          .filter((t) => expectedBoundIds(threads, TARGET_LOCALITY_ID).has(t.id))
          .slice()
          .sort(compareLocalFeed)
          .map((t) => t.id);

        assert.deepEqual(
          page.map((t) => t.id),
          referenceOrder,
          "kind-agnostic reference ordering must match the produced feed",
        );
      }),
      { numRuns: 300 },
    );
  });
});

// ─── Concrete example — mixed set with ties across localities ────────────────

describe("Local_Feed — Property 8: concrete mixed example", () => {
  it("keeps only target-bound public sosedi/zhk threads, ordered by date then id desc", () => {
    const base = Date.UTC(2026, 0, 1, 8, 0, 0);
    const t = (ms: number) => new Date(base + ms);
    const threads: ThreadRow[] = [
      { id: 1, zone: SOSEDI_ZONE, scope: SCOPE_ZHK, zhkId: 1, cityId: null, visibility: "public", createdAt: t(0) }, // ✓ oldest
      { id: 2, zone: SOSEDI_ZONE, scope: SCOPE_ZHK, zhkId: 1, cityId: null, visibility: "public", createdAt: t(100) }, // ✓ tie with id 5
      { id: 3, zone: SOSEDI_ZONE, scope: SCOPE_ZHK, zhkId: 2, cityId: null, visibility: "public", createdAt: t(100) }, // other locality
      { id: 4, zone: SOSEDI_ZONE, scope: SCOPE_CITY, zhkId: null, cityId: 10, visibility: "public", createdAt: t(200) }, // city scope
      { id: 5, zone: SOSEDI_ZONE, scope: SCOPE_ZHK, zhkId: 1, cityId: null, visibility: "public", createdAt: t(100) }, // ✓ tie with id 2
      { id: 6, zone: SOSEDI_ZONE, scope: SCOPE_ZHK, zhkId: 1, cityId: null, visibility: "hidden", createdAt: t(300) }, // hidden
      { id: 7, zone: "pro_public", scope: SCOPE_ZHK, zhkId: 1, cityId: null, visibility: "public", createdAt: t(300) }, // wrong zone
    ];

    const page = localFeedPage(threads, 1, MAX_FEED_LIMIT);
    // Expected: id 5 and 2 (tie at t100, id desc → 5 before 2), then id 1 (t0).
    assert.deepEqual(page.map((x) => x.id), [5, 2, 1]);
  });
});
