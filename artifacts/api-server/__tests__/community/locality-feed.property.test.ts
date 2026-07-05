// Feature: community-generalized-locality, Property 8: Local_Feed content and ordering
//
// Property test for Local_Feed content and ordering (Community Generalized
// Locality, Стадия 2).
//
// **Property 8: Local_Feed content and ordering**
//   *For any* Locality and any set of Community_Threads, the Local_Feed SHALL
//   contain exactly the threads bound to that Locality's id, ordered by
//   creation date descending with ties broken by thread id descending, and this
//   feed logic SHALL be identical for every Locality_Kind.
//
// **Validates: Requirements 2.1, 2.2, 3.1, 8.2**
//
// ── What is under test ────────────────────────────────────────────────────────
// The REAL production selection + ordering, i.e. `FeedService.getLocalFeed`
// (`src/lib/feedService.ts`). That method composes a Drizzle query whose base
// filter is
//     zone = 'sosedi' ∧ scope = 'zhk' ∧ zhk_id = <Locality.id> ∧
//     visibility = 'public'
// and whose page order is `ORDER BY created_at DESC, id DESC` (see the private
// `readFeed`: `.orderBy(desc(sortColumn), desc(communityThreadsTable.id))` with
// `sortColumn = createdAt` for the local feed). The predicate + ORDER BY are an
// OPAQUE SQL object — the only faithful way to verify content+ordering is to run
// the query against a real Postgres. This test does NOT re-implement the SQL in
// memory; it drives the actual `getLocalFeed` and compares its output to an
// independent reference selection.
//
// ── DB harness (matches the repo's DB-backed convention) ──────────────────────
// This repository verifies genuinely DB-dependent properties against a REAL
// Postgres gated on env — see the migration property tests
// (`migration-locality-kind.property.test.ts`, `migration-idempotence...`,
// `migration-rollback.integration.test.ts`). This test uses the identical seam:
//   - Uses `TEST_DATABASE_URL` if set, else `DATABASE_URL` when it is not the
//     fake placeholder (`postgres://test:test@localhost:5432/test`).
//   - Probes connectivity once; if no Postgres is reachable, the suite SKIPS.
//     It NEVER fakes a pass and NEVER weakens assertions to dodge the DB.
//
// `FeedService` is explicitly injectable (`constructor(database = db)` — "db
// инъектируется для тестируемости"). Each iteration therefore runs inside a
// single `db.transaction(...)` that is ALWAYS rolled back:
//   1. Create an ephemeral schema `feed_prop_test` on the SET LOCAL search_path,
//      with throwaway `zhk` + `community_threads` tables (no FKs) so the run is
//      self-contained and needs only a reachable Postgres, not a migrated one.
//   2. Seed Localities of MIXED kinds (zhk / district / settlement) and a
//      generated set of threads (bound to the target, bound elsewhere, or noise)
//      with varied `createdAt` INCLUDING TIES (same timestamp, distinct ids).
//   3. Run the REAL `new FeedService(tx).getLocalFeed(targetId)` against those
//      rows and compare to the independent reference selection.
//   4. Throw a rollback sentinel → the transaction (schema, tables, data) is
//      discarded; nothing leaks between iterations.
//
// Iterations: `{ numRuns: 100 }` for the main property when a Postgres is
// reachable (kind-invariance uses `{ numRuns: 50 }` to bound per-iteration DB
// cost while staying well above the 30-run floor).
//
// Run via Node's built-in test runner (matches the community convention):
//   TEST_DATABASE_URL=postgres://user:pass@host:5432/db \
//     npx tsx --test ./__tests__/community/locality-feed.property.test.ts

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import pg from "pg";

const { Pool } = pg;

// ─── Resolve a usable Postgres connection string ───────────────────────────────

const FAKE_URL = "postgres://test:test@localhost:5432/test";

function resolveDbUrl(): string | null {
  const testUrl = process.env.TEST_DATABASE_URL?.trim();
  if (testUrl) return testUrl;
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (dbUrl && dbUrl !== FAKE_URL) return dbUrl;
  return null;
}

const dbUrl = resolveDbUrl();
let dbAvailable = false;
let skipReason = "";

// Loaded lazily ONLY when a real Postgres is reachable (importing `@workspace/db`
// eagerly opens a pool against `DATABASE_URL`).
type DbModule = typeof import("@workspace/db");
type FeedServiceModule = typeof import("../../src/lib/feedService.js");
let dbmod: DbModule | null = null;
let feedmod: FeedServiceModule | null = null;
let sqlTag: typeof import("drizzle-orm").sql | null = null;

if (!dbUrl) {
  skipReason =
    "No real Postgres configured (set TEST_DATABASE_URL to a reachable Postgres).";
} else {
  // Probe connectivity with a throwaway pool before importing `@workspace/db`.
  let probePool: pg.Pool | null = null;
  try {
    probePool = new Pool({
      connectionString: dbUrl,
      max: 1,
      connectionTimeoutMillis: 3000,
    });
    const probe = await probePool.connect();
    await probe.query("SELECT 1");
    probe.release();
    dbAvailable = true;
  } catch (err) {
    skipReason = `Postgres not reachable at configured URL: ${(err as Error).message}`;
  } finally {
    if (probePool) await probePool.end().catch(() => {});
  }

  if (dbAvailable) {
    // Point `@workspace/db` at the resolved URL, THEN import it (and the real
    // FeedService + the `sql` tag) so the singleton pool binds to the real DB.
    process.env.DATABASE_URL = dbUrl;
    dbmod = await import("@workspace/db");
    feedmod = await import("../../src/lib/feedService.js");
    sqlTag = (await import("drizzle-orm")).sql;
  }
}

// ─── Local_Feed base-condition constants (reference, kept local) ──────────────
const SOSEDI_ZONE = "sosedi";
const SCOPE_ZHK = "zhk";
const SCOPE_CITY = "city";
const PUBLIC_VISIBILITY = "public";

/** Locality_Kind values — the feed logic must be identical for every one. */
const LOCALITY_KINDS = ["zhk", "district", "settlement"] as const;
type LocalityKind = (typeof LOCALITY_KINDS)[number];

// ─── Generators ────────────────────────────────────────────────────────────────

// Small distinct timestamp pool → forces frequent same-createdAt TIES so the
// id-descending tie-break is exercised (Property 8: ties, distinct ids).
const TIMESTAMP_POOL = [
  Date.UTC(2026, 0, 1, 8, 0, 0),
  Date.UTC(2026, 0, 1, 9, 30, 0),
  Date.UTC(2026, 0, 2, 12, 0, 0),
  Date.UTC(2026, 5, 10, 18, 45, 0),
];
const createdAtArb: fc.Arbitrary<Date> = fc
  .constantFrom(...TIMESTAMP_POOL)
  .map((ms) => new Date(ms));

// 1..4 localities of MIXED kinds. Index 0 is the feed target under test.
const localitiesArb: fc.Arbitrary<LocalityKind[]> = fc.array(
  fc.constantFrom<LocalityKind>(...LOCALITY_KINDS),
  { minLength: 1, maxLength: 4 },
);

/**
 * A raw thread spec (id + zhk binding assigned at seed time). `bindTo`:
 *   • "target" → bound to the locality under test
 *   • "other"  → bound to another seeded locality (or a foreign id when only one
 *                locality exists) — must be EXCLUDED from the target feed
 *   • "null"   → zhk_id NULL (city/pro-style) — must be EXCLUDED
 */
const threadSpecArb = fc.record({
  zone: fc.constantFrom(SOSEDI_ZONE, "pro_public", "pro_protected"),
  scope: fc.constantFrom(SCOPE_ZHK, SCOPE_CITY, "pro"),
  visibility: fc.constantFrom(PUBLIC_VISIBILITY, "protected", "hidden"),
  bindTo: fc.constantFrom("target", "other", "null"),
  createdAt: createdAtArb,
});

// A scenario: the localities to seed + the threads to seed (0..15 threads so a
// single MAX_FEED_LIMIT page holds every possible match; noise rows are filtered
// out in SQL and never consume the page budget).
const scenarioArb = fc.record({
  localities: localitiesArb,
  threads: fc.array(threadSpecArb, { minLength: 0, maxLength: 15 }),
});

// ─── Ephemeral-schema DDL (no FKs — self-contained) ───────────────────────────

const CREATE_ZHK = `
  CREATE TABLE zhk (
    id serial PRIMARY KEY,
    slug varchar(100) NOT NULL UNIQUE,
    name varchar(100) NOT NULL,
    name_normalized varchar(100) NOT NULL,
    city_id integer NOT NULL,
    kind varchar(16) NOT NULL DEFAULT 'zhk',
    developer varchar(200),
    completion_date varchar(40),
    buildings jsonb,
    status varchar(20) NOT NULL DEFAULT 'NON_LIVING',
    is_seeded boolean NOT NULL DEFAULT false,
    content_score integer NOT NULL DEFAULT 0,
    is_indexable boolean NOT NULL DEFAULT false,
    created_by_account_id integer,
    seo_title varchar(70),
    seo_description varchar(180),
    h1 varchar(100),
    body_md text,
    created_at timestamp NOT NULL DEFAULT now()
  )
`;

const CREATE_THREADS = `
  CREATE TABLE community_threads (
    id serial PRIMARY KEY,
    zone varchar(20) NOT NULL,
    scope varchar(10) NOT NULL,
    city_id integer,
    zhk_id integer,
    specialty_id integer,
    is_local boolean NOT NULL DEFAULT false,
    category varchar(40),
    title varchar(200) NOT NULL,
    body text NOT NULL,
    author_account_id integer,
    is_seeded boolean NOT NULL DEFAULT false,
    visibility varchar(12) NOT NULL DEFAULT 'public',
    moderation_status varchar(16) NOT NULL DEFAULT 'not_screened',
    last_activity_at timestamp NOT NULL DEFAULT now(),
    created_at timestamp NOT NULL DEFAULT now()
  )
`;

/** Rollback sentinel — thrown at the end of every iteration's transaction. */
class RollbackSentinel extends Error {}

/** A seeded thread's ground truth used to build the reference selection. */
interface SeededThread {
  id: number;
  zhkId: number | null;
  zone: string;
  scope: string;
  visibility: string;
  createdAt: Date;
}

/** Reference: created_at DESC, ties broken by id DESC (independent of the SQL). */
function referenceOrder(
  threads: readonly SeededThread[],
  targetId: number,
): number[] {
  return threads
    .filter(
      (t) =>
        t.zone === SOSEDI_ZONE &&
        t.scope === SCOPE_ZHK &&
        t.zhkId === targetId &&
        t.visibility === PUBLIC_VISIBILITY,
    )
    .slice()
    .sort((a, b) => {
      const byDate = b.createdAt.getTime() - a.createdAt.getTime();
      if (byDate !== 0) return byDate;
      return b.id - a.id; // id descending on tie
    })
    .map((t) => t.id);
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe(
  "Local_Feed — Property 8: content and ordering (real getLocalFeed, DB-backed)",
  { skip: dbAvailable ? false : skipReason },
  () => {
    // Validates: Requirements 2.1, 2.2, 3.1, 8.2

    const db = () => (dbmod as DbModule).db;
    const zhkTable = () => (dbmod as DbModule).zhkTable;
    const communityThreadsTable = () => (dbmod as DbModule).communityThreadsTable;
    const FeedService = () => (feedmod as FeedServiceModule).FeedService;
    const MAX_FEED_LIMIT = () => (feedmod as FeedServiceModule).MAX_FEED_LIMIT;
    const sql = () => sqlTag as NonNullable<typeof sqlTag>;

    /**
     * Run `fn(tx)` inside a transaction that is ALWAYS rolled back. The
     * ephemeral schema + tables created inside are discarded on rollback.
     */
    async function inRolledBackTx(
      fn: (tx: any) => Promise<void>,
    ): Promise<void> {
      try {
        await db().transaction(async (tx: any) => {
          await tx.execute(sql().raw("CREATE SCHEMA feed_prop_test"));
          await tx.execute(sql().raw("SET LOCAL search_path TO feed_prop_test"));
          await tx.execute(sql().raw(CREATE_ZHK));
          await tx.execute(sql().raw(CREATE_THREADS));
          await fn(tx);
          throw new RollbackSentinel();
        });
      } catch (err) {
        if (!(err instanceof RollbackSentinel)) throw err;
      }
    }

    /** Seed localities of mixed kinds; return their real serial ids (by index). */
    async function seedLocalities(
      tx: any,
      kinds: LocalityKind[],
    ): Promise<number[]> {
      const ids: number[] = [];
      for (let i = 0; i < kinds.length; i++) {
        const [row] = await tx
          .insert(zhkTable())
          .values({
            slug: `loc-${i}`,
            name: `Locality ${i}`,
            nameNormalized: `locality ${i}`,
            cityId: 1,
            kind: kinds[i],
          })
          .returning({ id: zhkTable().id });
        ids.push(row.id as number);
      }
      return ids;
    }

    /** Seed the generated threads; return their ground truth (id + createdAt). */
    async function seedThreads(
      tx: any,
      specs: Array<{
        zone: string;
        scope: string;
        visibility: string;
        bindTo: string;
        createdAt: Date;
      }>,
      targetId: number,
      otherId: number,
    ): Promise<SeededThread[]> {
      const seeded: SeededThread[] = [];
      for (const s of specs) {
        const zhkId =
          s.bindTo === "target" ? targetId : s.bindTo === "other" ? otherId : null;
        const [row] = await tx
          .insert(communityThreadsTable())
          .values({
            zone: s.zone,
            scope: s.scope,
            zhkId: zhkId ?? undefined,
            cityId: zhkId == null ? 1 : undefined,
            visibility: s.visibility,
            title: "t",
            body: "b",
            createdAt: s.createdAt,
            lastActivityAt: s.createdAt,
          })
          .returning({
            id: communityThreadsTable().id,
            createdAt: communityThreadsTable().createdAt,
          });
        seeded.push({
          id: row.id as number,
          zhkId,
          zone: s.zone,
          scope: s.scope,
          visibility: s.visibility,
          createdAt: new Date(row.createdAt as Date),
        });
      }
      return seeded;
    }

    let ready = false;
    before(() => {
      ready = dbAvailable && dbmod != null && feedmod != null && sqlTag != null;
    });
    after(async () => {
      if (dbmod) await (dbmod as DbModule).pool.end().catch(() => {});
    });

    it("getLocalFeed returns EXACTLY the bound threads, ordered created_at DESC then id DESC", async () => {
      assert.ok(ready, "DB module should be loaded when the suite is not skipped");

      await fc.assert(
        fc.asyncProperty(scenarioArb, async (scenario) => {
          await inRolledBackTx(async (tx) => {
            const localityIds = await seedLocalities(tx, scenario.localities);
            const targetId = localityIds[0]!;
            // "other" binds to a second locality when present, else a foreign id
            // that is guaranteed not to equal the target.
            const otherId =
              localityIds.length > 1 ? localityIds[1]! : targetId + 100000;

            const seeded = await seedThreads(
              tx,
              scenario.threads,
              targetId,
              otherId,
            );

            const svc = new (FeedService())(tx);
            const result = await svc.getLocalFeed(targetId, {
              limit: MAX_FEED_LIMIT(),
            });

            const gotIds = result.items.map((t: { id: number }) => t.id);
            const wantIds = referenceOrder(seeded, targetId);

            // Content + ordering in one shot: exact ordered id sequence.
            assert.deepEqual(
              gotIds,
              wantIds,
              "Local_Feed must be exactly the bound threads in created_at DESC, id DESC order",
            );

            // Every returned item independently satisfies the binding contract.
            for (const item of result.items as Array<{
              id: number;
              zhkId: number | null;
            }>) {
              assert.equal(
                item.zhkId,
                targetId,
                `thread not bound to the target locality leaked: ${JSON.stringify(item)}`,
              );
            }

            // Ordering invariant, re-checked directly on the produced page.
            const items = result.items as Array<{ id: number; createdAt: Date }>;
            for (let i = 1; i < items.length; i++) {
              const prevTs = new Date(items[i - 1]!.createdAt).getTime();
              const curTs = new Date(items[i]!.createdAt).getTime();
              assert.ok(prevTs >= curTs, `created_at not descending at ${i}`);
              if (prevTs === curTs) {
                assert.ok(
                  items[i - 1]!.id > items[i]!.id,
                  `tie not broken by id DESC at ${i}`,
                );
              }
            }
          });
        }),
        { numRuns: 100 },
      );
    });

    it("feed logic is IDENTICAL for every Locality_Kind (kind-invariance)", async () => {
      assert.ok(ready, "DB module should be loaded when the suite is not skipped");

      // Bind an identical thread structure to two localities of DIFFERENT kinds
      // and assert the two feeds are structurally identical (same length, same
      // created_at sequence, tie-breaks descending) — proving the selection
      // never branches on kind.
      const twoKindsArb = fc
        .tuple(
          fc.constantFrom<LocalityKind>(...LOCALITY_KINDS),
          fc.constantFrom<LocalityKind>(...LOCALITY_KINDS),
        )
        .filter(([a, b]) => a !== b);

      await fc.assert(
        fc.asyncProperty(
          twoKindsArb,
          fc.array(
            fc.record({
              visibility: fc.constantFrom(PUBLIC_VISIBILITY, "hidden"),
              createdAt: createdAtArb,
            }),
            { minLength: 0, maxLength: 12 },
          ),
          async ([kindA, kindB], threadShapes) => {
            await inRolledBackTx(async (tx) => {
              const ids = await seedLocalities(tx, [kindA, kindB]);
              const idA = ids[0]!;
              const idB = ids[1]!;

              // Seed the same shapes bound to A, then to B (all sosedi/zhk).
              const seededA = await seedThreads(
                tx,
                threadShapes.map((s) => ({
                  zone: SOSEDI_ZONE,
                  scope: SCOPE_ZHK,
                  visibility: s.visibility,
                  bindTo: "target",
                  createdAt: s.createdAt,
                })),
                idA,
                idB,
              );
              const seededB = await seedThreads(
                tx,
                threadShapes.map((s) => ({
                  zone: SOSEDI_ZONE,
                  scope: SCOPE_ZHK,
                  visibility: s.visibility,
                  bindTo: "target",
                  createdAt: s.createdAt,
                })),
                idB,
                idA,
              );

              const svc = new (FeedService())(tx);
              const feedA = await svc.getLocalFeed(idA, { limit: MAX_FEED_LIMIT() });
              const feedB = await svc.getLocalFeed(idB, { limit: MAX_FEED_LIMIT() });

              // Each feed matches its own kind-agnostic reference selection.
              assert.deepEqual(
                feedA.items.map((t: { id: number }) => t.id),
                referenceOrder(seededA, idA),
                `kind=${kindA} feed diverged from the kind-agnostic reference`,
              );
              assert.deepEqual(
                feedB.items.map((t: { id: number }) => t.id),
                referenceOrder(seededB, idB),
                `kind=${kindB} feed diverged from the kind-agnostic reference`,
              );

              // Same length + identical created_at ordering ⇒ identical logic.
              assert.equal(
                feedA.items.length,
                feedB.items.length,
                `feed length differs between kinds ${kindA} and ${kindB}`,
              );
              const tsA = feedA.items.map((t: { createdAt: Date }) =>
                new Date(t.createdAt).getTime(),
              );
              const tsB = feedB.items.map((t: { createdAt: Date }) =>
                new Date(t.createdAt).getTime(),
              );
              assert.deepEqual(
                tsA,
                tsB,
                `created_at ordering differs between kinds ${kindA} and ${kindB}`,
              );
            });
          },
        ),
        { numRuns: 50 },
      );
    });
  },
);
