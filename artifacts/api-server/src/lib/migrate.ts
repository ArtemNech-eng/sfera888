import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { pool } from "@workspace/db";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Locate the drizzle migrations folder.
 *
 * The lookup is layout-agnostic so the same code works in both modes:
 *   • dev (tsx)        — running from `artifacts/api-server/src/lib/migrate.ts`,
 *                        the migrations live in `lib/db/migrations/` four levels up.
 *   • prod (esbuild)   — bundled to `artifacts/api-server/dist/index.cjs` and the
 *                        migrations folder is copied next to it as `dist/migrations/`
 *                        (handled by `build.ts`).
 */
function resolveMigrationsFolder(): string {
  const candidates = [
    path.resolve(__dirname, "./migrations"),                  // prod: dist/migrations
    path.resolve(__dirname, "../migrations"),                 // prod: dist/lib/migrations (just in case esbuild keeps tree)
    path.resolve(__dirname, "../../../../lib/db/migrations"), // dev: src/lib → lib/db/migrations
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "meta/_journal.json"))) return candidate;
  }
  throw new Error(
    `[migrate] migrations folder not found. Searched:\n  ${candidates.join("\n  ")}`,
  );
}

/**
 * If the database already contains schema (typical production case) but
 * `drizzle.__drizzle_migrations` does not exist yet, mark the baseline
 * migration (`0000_*`) as already applied. Without this the very first
 * `migrate()` call would try to `CREATE TABLE` on top of existing tables
 * and crash with `relation already exists`.
 *
 * Idempotent: running on a freshly-bootstrapped DB is a no-op, and on a
 * truly empty DB the function exits early so `migrate()` can build the
 * full schema from scratch.
 */
async function bootstrapBaselineIfNeeded(migrationsFolder: string): Promise<void> {
  const client = await pool.connect();
  try {
    // Already initialized?
    const driz = await client.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
       LIMIT 1`,
    );
    if (driz.rows.length > 0) {
      const populated = await client.query(`SELECT 1 FROM drizzle.__drizzle_migrations LIMIT 1`);
      if (populated.rows.length > 0) return;
    }

    // Empty database? Let migrate() build everything.
    const established = await client.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'users'
       LIMIT 1`,
    );
    if (established.rows.length === 0) return;

    // Existing DB → record baseline as applied.
    const journalPath = path.join(migrationsFolder, "meta/_journal.json");
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8")) as {
      entries: Array<{ idx: number; tag: string; when: number; breakpoints: boolean }>;
    };
    const baseline = journal.entries[0];
    if (!baseline) throw new Error("[migrate] empty journal — cannot bootstrap");

    const sqlPath = path.join(migrationsFolder, `${baseline.tag}.sql`);
    const sqlContent = fs.readFileSync(sqlPath, "utf-8");
    // Hash algorithm matches drizzle-orm/migrator.js → readMigrationFiles().
    const hash = crypto.createHash("sha256").update(sqlContent).digest("hex");

    await client.query(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
    await client.query(
      `CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
         id SERIAL PRIMARY KEY,
         hash text NOT NULL,
         created_at bigint
       )`,
    );
    await client.query(
      `INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2)`,
      [hash, baseline.when],
    );
    console.log(`[migrate] bootstrap: existing DB detected, marked baseline "${baseline.tag}" as applied`);
  } finally {
    client.release();
  }
}

/**
 * Apply pending drizzle migrations on startup.
 *
 * Workflow:
 *   1. `pnpm --filter @workspace/db exec drizzle-kit generate --name=<change>`
 *      diffs the schema and emits a new SQL file under `lib/db/migrations/`.
 *   2. The next time the API server starts, `runDrizzleMigrations()` applies
 *      anything that hasn't been recorded in `drizzle.__drizzle_migrations`.
 *
 * Safe to call multiple times — drizzle skips already-applied migrations.
 */
export async function runDrizzleMigrations(): Promise<void> {
  const migrationsFolder = resolveMigrationsFolder();
  console.log(`[migrate] using migrations folder: ${migrationsFolder}`);

  await bootstrapBaselineIfNeeded(migrationsFolder);

  const db = drizzle(pool);
  await migrate(db, { migrationsFolder });
  console.log("[migrate] drizzle migrations up to date");
}
