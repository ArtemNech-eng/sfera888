// Feature: community-phone-registration, Task 1.2: migration idempotence + backward compatibility
//
// Integration/regression test for the additive password migration
// (`migrations/2026-06-11-community-password.sql`) and the generalized
// Publishing_Rights predicate.
//
// **Task 1.2 contract**
//   - Re-running the additive `ALTER TABLE community_accounts ADD COLUMN IF NOT
//     EXISTS password_hash varchar(100)` MUST NOT fail on a second run
//     (idempotence).
//   - Existing rows are preserved and a Legacy_Verified_Account (a row with
//     `phone_verified_at` set and `password_hash` NULL) keeps Publishing_Rights
//     via the generalized `hasPublishingRights` predicate.
//
// **Validates: Requirements 5.2**
//
// ── Two complementary layers ──────────────────────────────────────────────────
// This file follows the community test convention of pairing a DB-free
// behavioural check with a real-Postgres integration check:
//
//   (1) Backward-compatibility regression (ALWAYS runs, no DB required):
//       asserts the generalized `hasPublishingRights` predicate grants rights to
//       a Legacy_Verified_Account (phone_verified_at set, password_hash NULL) and
//       to a password-only account, and denies rights only when BOTH are absent.
//       This is the faithful, DB-independent proof of Requirement 5.2's backward
//       compatibility clause and mirrors how sibling community tests verify pure
//       predicates without a database.
//
//   (2) Migration idempotence (real Postgres, SKIPS when none is reachable):
//       applies the ACTUAL migration file from disk twice against a real
//       Postgres in an ephemeral schema, then asserts the second run does not
//       error, existing rows are byte-for-byte preserved, the additive column is
//       present and NULL for pre-existing rows, and the generalized predicate
//       (fed the real post-migration row state) still grants Publishing_Rights to
//       the Legacy_Verified_Account. There is intentionally NO in-memory
//       substitute — the migration is real SQL DDL and the only faithful test
//       runs it against Postgres. It never fakes a pass.
//
// ── Harness (identical seam to the community migration sibling tests) ─────────
//   - Uses `TEST_DATABASE_URL` if set, else `DATABASE_URL` when it is not the
//     fake placeholder (`postgres://test:test@localhost:5432/test`).
//   - Probes connectivity once; if no Postgres is reachable, layer (2) SKIPS.
//   - Each case runs inside its own transaction that is ALWAYS rolled back. The
//     `community_accounts` table lives in an ephemeral schema (`mig_test`) so
//     ROLLBACK discards the schema, table, data, and every side effect.
//
// Run via Node's built-in test runner (matches the community convention):
//   npx tsx --test ./__tests__/community/community-password-migration.integration.test.ts
//   TEST_DATABASE_URL=postgres://user:pass@host:5432/db \
//     npx tsx --test ./__tests__/community/community-password-migration.integration.test.ts

// Keep the `@workspace/db` import (transitively pulled in by communityAuth) lazy
// and network-safe: a fake placeholder URL is fine because `hasPublishingRights`
// is a pure function and never touches the pool.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://test:test@localhost:5432/test";

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

import { hasPublishingRights } from "../../src/lib/communityAuth.js";

const { Pool } = pg;

// ─── Layer (1): DB-free backward-compatibility regression (always runs) ────────

describe("Community password migration (Task 1.2): backward-compatible Publishing_Rights (Requirement 5.2)", () => {
  // Validates: Requirements 5.2

  it("Legacy_Verified_Account (phone_verified_at set, password_hash NULL) keeps Publishing_Rights", () => {
    const legacy = { phoneVerifiedAt: new Date("2025-01-01T00:00:00Z"), passwordHash: null };
    assert.equal(
      hasPublishingRights(legacy),
      true,
      "Legacy_Verified_Account must retain publishing rights after the additive migration",
    );
  });

  it("Legacy_Verified_Account keeps rights even when password_hash is an empty string", () => {
    // An empty string is NOT a valid hash; rights must come purely from the
    // legacy phone_verified_at value (the generalized OR still holds).
    const legacyEmptyHash = { phoneVerifiedAt: new Date("2024-06-01T12:00:00Z"), passwordHash: "" };
    assert.equal(hasPublishingRights(legacyEmptyHash), true);
  });

  it("password-only account (registered via new flow) has Publishing_Rights", () => {
    const registered = { phoneVerifiedAt: null, passwordHash: "$2a$10$abcdefghijklmnopqrstuv" };
    assert.equal(hasPublishingRights(registered), true);
  });

  it("account with BOTH password_hash and phone_verified_at has Publishing_Rights", () => {
    const both = {
      phoneVerifiedAt: new Date("2025-03-03T03:03:03Z"),
      passwordHash: "$2a$10$abcdefghijklmnopqrstuv",
    };
    assert.equal(hasPublishingRights(both), true);
  });

  it("account with neither password_hash nor phone_verified_at has NO Publishing_Rights", () => {
    assert.equal(hasPublishingRights({ phoneVerifiedAt: null, passwordHash: null }), false);
    assert.equal(hasPublishingRights({ phoneVerifiedAt: null, passwordHash: "" }), false);
  });
});

// ─── Resolve migration SQL (applied verbatim; strip any outer BEGIN/COMMIT) ────

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  here,
  "../../migrations/2026-06-11-community-password.sql",
);
const rawMigration = readFileSync(migrationPath, "utf8");

// Strip ONLY outer transaction control so the DDL runs inside the test's
// controlling (always-rolled-back) transaction. The migration body is otherwise
// applied verbatim from disk. (This migration currently has no BEGIN/COMMIT, but
// stripping keeps the harness robust if that changes.)
const migrationBody = rawMigration
  .replace(/^\s*BEGIN\s*;\s*$/im, "")
  .replace(/^\s*COMMIT\s*;\s*$/im, "");

// Guard: the additive column statement must be present, otherwise this test is
// silently testing nothing.
assert.match(
  migrationBody,
  /ADD COLUMN IF NOT EXISTS\s+password_hash/i,
  "migration file does not contain the additive `ADD COLUMN IF NOT EXISTS password_hash` statement",
);

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
let pool: pg.Pool | null = null;
let dbAvailable = false;
let skipReason = "";

if (!dbUrl) {
  skipReason =
    "No real Postgres configured (set TEST_DATABASE_URL to a reachable Postgres).";
} else {
  try {
    pool = new Pool({ connectionString: dbUrl, max: 1, connectionTimeoutMillis: 3000 });
    const probe = await pool.connect();
    await probe.query("SELECT 1");
    probe.release();
    dbAvailable = true;
  } catch (err) {
    skipReason = `Postgres not reachable at configured URL: ${(err as Error).message}`;
    if (pool) {
      await pool.end().catch(() => {});
      pool = null;
    }
  }
}

// ─── Snapshot: full pre-existing community_accounts state that must survive ────

interface AccountStateRow {
  id: number;
  phone: string;
  phone_verified_at: Date | null;
  role: string;
  zhk_id: number | null;
  max_user_id: string | null;
}

async function snapshotAccounts(client: pg.PoolClient): Promise<AccountStateRow[]> {
  const res = await client.query(
    `SELECT id, phone, phone_verified_at, role, zhk_id, max_user_id
       FROM community_accounts
      ORDER BY id`,
  );
  return res.rows.map((r) => ({
    id: Number(r.id),
    phone: r.phone,
    phone_verified_at: r.phone_verified_at,
    role: r.role,
    zhk_id: r.zhk_id === null ? null : Number(r.zhk_id),
    max_user_id: r.max_user_id,
  }));
}

/** Whether the `community_accounts.password_hash` column exists in mig_test. */
async function passwordHashColumnExists(client: pg.PoolClient): Promise<boolean> {
  const res = await client.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = 'mig_test'
        AND table_name = 'community_accounts'
        AND column_name = 'password_hash'`,
  );
  return res.rowCount === 1;
}

/**
 * Runs the idempotence + backward-compat scenario inside a single controlling
 * transaction that is ALWAYS rolled back.
 *
 * Steps:
 *   1. Seed a PRE-migration `community_accounts` table (WITHOUT password_hash)
 *      holding a Legacy_Verified_Account (phone_verified_at set) and an
 *      unverified account (both NULL) + snapshot state.
 *   2. Apply the ACTUAL migration once, then a SECOND time — the second run
 *      MUST NOT error (idempotence).
 *   3. Assert the additive column exists and pre-existing rows are unchanged
 *      (identity/phone/verified/role/zhk/max preserved; password_hash NULL).
 *   4. Feed the real post-migration Legacy_Verified_Account row into the
 *      generalized `hasPublishingRights` predicate and assert it still grants
 *      Publishing_Rights; the unverified account is denied.
 */
async function runIdempotenceCase(client: pg.PoolClient): Promise<void> {
  await client.query("BEGIN");
  try {
    // Ephemeral schema so the migration's unqualified `community_accounts`
    // resolves to a throwaway table; ROLLBACK discards everything created here.
    await client.query("CREATE SCHEMA mig_test");
    await client.query("SET LOCAL search_path TO mig_test");

    // Pre-migration `community_accounts` shape — deliberately WITHOUT the
    // `password_hash` column (as it existed before this feature).
    await client.query(`
      CREATE TABLE community_accounts (
        id                serial PRIMARY KEY,
        phone             varchar(30) NOT NULL,
        phone_verified_at timestamp,
        role              varchar(20) NOT NULL DEFAULT 'resident',
        zhk_id            integer,
        max_user_id       varchar(80),
        created_at        timestamp   NOT NULL DEFAULT NOW(),
        CONSTRAINT community_accounts_phone_key UNIQUE (phone)
      )
    `);

    // Legacy_Verified_Account: verified via the old SMS path, no password.
    await client.query(
      `INSERT INTO community_accounts (phone, phone_verified_at, role, max_user_id)
       VALUES ($1, $2, $3, $4)`,
      ["+79990000001", new Date("2025-01-15T10:00:00Z"), "resident", "max-legacy-123"],
    );
    // Unverified account: neither verified nor password — no publishing rights.
    await client.query(
      `INSERT INTO community_accounts (phone, phone_verified_at, role)
       VALUES ($1, NULL, $2)`,
      ["+79990000002", "master"],
    );

    // Baseline snapshot + confirm the migration has NOT run yet.
    const preState = await snapshotAccounts(client);
    assert.equal(
      await passwordHashColumnExists(client),
      false,
      "pre-migration table unexpectedly already has a `password_hash` column",
    );

    // ── First application of the ACTUAL migration body (verbatim) ──
    await client.query(migrationBody);
    assert.equal(
      await passwordHashColumnExists(client),
      true,
      "first migration run did not add the `password_hash` column",
    );

    // ── Second application — the defining act of idempotence ──
    // Must succeed WITHOUT error thanks to `ADD COLUMN IF NOT EXISTS`.
    await assert.doesNotReject(
      async () => {
        await client.query(migrationBody);
      },
      "second application of the migration threw an error (not idempotent)",
    );

    // ── Existing rows preserved byte-for-byte (identity + all prior columns) ──
    const postState = await snapshotAccounts(client);
    assert.equal(
      postState.length,
      preState.length,
      `row count changed after migration (pre=${preState.length}, post=${postState.length})`,
    );
    assert.deepEqual(
      postState,
      preState,
      "migration altered a pre-existing row (id/phone/phone_verified_at/role/zhk_id/max_user_id not invariant)",
    );

    // The additive column is present and NULL for every pre-existing row.
    const hashes = await client.query(
      `SELECT phone, password_hash FROM community_accounts ORDER BY id`,
    );
    for (const row of hashes.rows) {
      assert.equal(
        row.password_hash,
        null,
        `pre-existing row ${row.phone} unexpectedly received a non-NULL password_hash`,
      );
    }

    // ── Backward compatibility: generalized predicate over REAL row state ──
    const rowsForPredicate = await client.query(
      `SELECT phone, phone_verified_at, password_hash
         FROM community_accounts ORDER BY id`,
    );
    const byPhone = new Map<string, { phoneVerifiedAt: Date | null; passwordHash: string | null }>();
    for (const r of rowsForPredicate.rows) {
      byPhone.set(r.phone, { phoneVerifiedAt: r.phone_verified_at, passwordHash: r.password_hash });
    }

    const legacy = byPhone.get("+79990000001")!;
    assert.equal(
      hasPublishingRights(legacy),
      true,
      "Legacy_Verified_Account lost Publishing_Rights after the migration re-run (Requirement 5.2)",
    );

    const unverified = byPhone.get("+79990000002")!;
    assert.equal(
      hasPublishingRights(unverified),
      false,
      "account with neither password_hash nor phone_verified_at must not have Publishing_Rights",
    );
  } finally {
    // Always discard — never persist test data or migration side effects.
    await client.query("ROLLBACK");
  }
}

// ─── Layer (2): real-Postgres migration idempotence (skips without a DB) ───────

describe(
  "Community password migration (Task 1.2): additive migration is idempotent and preserves existing rows (Requirement 5.2)",
  { skip: dbAvailable ? false : skipReason },
  () => {
    // Validates: Requirements 5.2

    let client: pg.PoolClient;

    before(async () => {
      client = await (pool as pg.Pool).connect();
    });

    after(async () => {
      client?.release();
      if (pool) await pool.end().catch(() => {});
    });

    it("re-running ADD COLUMN IF NOT EXISTS does not fail; Legacy_Verified_Account keeps publishing rights", async () => {
      await runIdempotenceCase(client);
    });
  },
);
