/**
 * Backfill marketplace slugs for `cities` and `service_types`.
 *
 * Generates a human-readable URL slug from `name` for any row where
 * `slug IS NULL` or `slug = ''`. Idempotent: running twice changes nothing
 * after the first apply.
 *
 * Dry-run by default. Pass `--apply` to actually run UPDATE.
 *
 *   # dry-run, default scope (all)
 *   pnpm --filter @workspace/scripts exec tsx ./src/backfill-marketplace-slugs.ts
 *
 *   # apply
 *   pnpm --filter @workspace/scripts exec tsx ./src/backfill-marketplace-slugs.ts --apply
 *
 *   # only one table
 *   pnpm --filter @workspace/scripts exec tsx ./src/backfill-marketplace-slugs.ts --table=cities
 *
 *   # limit number of rows considered (debug / canary)
 *   pnpm --filter @workspace/scripts exec tsx ./src/backfill-marketplace-slugs.ts --limit=10
 *
 * NOTE: DATABASE_URL must be set in env. The script never prints it.
 *       Does NOT touch `masters` or `leads` — only `cities` and `service_types`.
 */

// `@workspace/db` is imported lazily inside main() so that:
//   1. --self-test and --help can run without DATABASE_URL set,
//   2. we can print a friendly error before `@workspace/db` throws its own.

// ─────────────────────────────────────────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────────────────────────────────────────

type TableScope = "cities" | "service_types" | "all";

interface CliOpts {
  apply: boolean;
  table: TableScope;
  limit?: number;
  selfTest: boolean;
}

function parseArgs(argv: string[]): CliOpts {
  const opts: CliOpts = { apply: false, table: "all", selfTest: false };
  for (const raw of argv) {
    if (raw === "--apply") {
      opts.apply = true;
    } else if (raw === "--self-test") {
      opts.selfTest = true;
    } else if (raw.startsWith("--table=")) {
      const value = raw.slice("--table=".length);
      if (value !== "cities" && value !== "service_types" && value !== "all") {
        console.error(`[backfill-slugs] ERROR: --table must be one of: cities | service_types | all (got "${value}")`);
        process.exit(1);
      }
      opts.table = value;
    } else if (raw.startsWith("--limit=")) {
      const n = Number(raw.slice("--limit=".length));
      if (!Number.isInteger(n) || n <= 0) {
        console.error(`[backfill-slugs] ERROR: --limit must be a positive integer (got "${raw}")`);
        process.exit(1);
      }
      opts.limit = n;
    } else if (raw === "--help" || raw === "-h") {
      console.log(`Usage:
  tsx ./src/backfill-marketplace-slugs.ts [--apply] [--table=cities|service_types|all] [--limit=N] [--self-test]

Defaults: dry-run, all tables, no limit.
--self-test runs slugify checks without touching the database.`);
      process.exit(0);
    } else if (raw.startsWith("--")) {
      console.error(`[backfill-slugs] ERROR: unknown flag "${raw}"`);
      process.exit(1);
    }
  }
  return opts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Slugify (Russian → latin transliteration, GOST-7.79 system B simplified)
// ─────────────────────────────────────────────────────────────────────────────

const TRANSLIT: Record<string, string> = {
  "а": "a", "б": "b", "в": "v", "г": "g", "д": "d",
  "е": "e", "ё": "yo", "ж": "zh", "з": "z", "и": "i",
  "й": "y", "к": "k", "л": "l", "м": "m", "н": "n",
  "о": "o", "п": "p", "р": "r", "с": "s", "т": "t",
  "у": "u", "ф": "f", "х": "h", "ц": "ts", "ч": "ch",
  "ш": "sh", "щ": "shch", "ъ": "", "ы": "y", "ь": "",
  "э": "e", "ю": "yu", "я": "ya",
};

/**
 * Convert a free-form name to a URL-safe slug.
 *   "Краснодар"        → "krasnodar"
 *   "Санкт-Петербург"  → "sankt-peterburg"
 *   "Сантехник"        → "santehnik"
 *   "Ремонт ванной"    → "remont-vannoy"
 */
export function slugify(input: string): string {
  const lower = input.toLowerCase();
  let out = "";
  for (const ch of lower) {
    if (TRANSLIT[ch] !== undefined) {
      out += TRANSLIT[ch];
    } else if (/[a-z0-9]/.test(ch)) {
      out += ch;
    } else {
      // any other char (space, punctuation, emoji, latin letter accent) → separator
      out += "-";
    }
  }
  // collapse multiple dashes, trim leading/trailing dashes
  out = out.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  return out;
}

/**
 * Pick a slug that is unique in `taken`. If the base slug collides, try
 * `${base}-2`, `${base}-3`, …  Length is capped at `maxLen` (varchar limit
 * for `cities.slug` and `service_types.slug` is 100).
 */
function uniqueSlug(base: string, taken: Set<string>, maxLen = 100): string {
  // Empty base (e.g. name was only emojis) — not normally expected, but be safe.
  const safeBase = base || "item";
  // Truncate base so that the suffix (e.g. "-99") still fits.
  const trimBase = (extra: number) => safeBase.slice(0, Math.max(1, maxLen - extra));

  if (!taken.has(safeBase) && safeBase.length <= maxLen) {
    return safeBase;
  }
  for (let n = 2; n < 10_000; n++) {
    const suffix = `-${n}`;
    const cand = trimBase(suffix.length) + suffix;
    if (!taken.has(cand)) return cand;
  }
  // Effectively unreachable in our data, but bail clearly if it ever happens.
  throw new Error(`[backfill-slugs] could not find unique slug for base "${safeBase}" after 9999 attempts`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Backfill
// ─────────────────────────────────────────────────────────────────────────────

interface UpdateRow {
  id: number;
  name: string;
  oldSlug: string | null;
  newSlug: string;
}

interface TableSummary {
  table: string;
  scanned: number;
  updates: UpdateRow[];
}

const ALLOWED_TABLES = new Set(["cities", "service_types"]);

// Minimal structural type for the pg.Pool we receive from `@workspace/db`.
// Avoids depending on `@types/pg` (which is not in `@workspace/scripts` deps).
interface DbQueryResult<T> { rows: T[]; rowCount: number | null }
interface DbClient {
  query<T = unknown>(text: string, params?: unknown[]): Promise<DbQueryResult<T>>;
  release(): void;
}
interface DbPool {
  query<T = unknown>(text: string, params?: unknown[]): Promise<DbQueryResult<T>>;
  connect(): Promise<DbClient>;
  end(): Promise<void>;
}

async function backfillTable(pool: DbPool, tableName: string, opts: CliOpts): Promise<TableSummary> {
  if (!ALLOWED_TABLES.has(tableName)) {
    throw new Error(`[backfill-slugs] refusing to operate on table "${tableName}" (whitelist: ${[...ALLOWED_TABLES].join(", ")})`);
  }

  const limitClause = opts.limit ? `LIMIT ${opts.limit}` : "";
  // Read rows that need a slug (NULL or empty string).
  const missing = await pool.query<{ id: number; name: string; slug: string | null }>(
    `SELECT id, name, slug FROM ${tableName}
     WHERE slug IS NULL OR slug = ''
     ORDER BY id ASC
     ${limitClause}`,
  );
  // Read all currently-taken slugs in this table to ensure uniqueness.
  const existing = await pool.query<{ slug: string }>(
    `SELECT slug FROM ${tableName} WHERE slug IS NOT NULL AND slug <> ''`,
  );
  const taken = new Set<string>(existing.rows.map((r: { slug: string }) => r.slug));

  const updates: UpdateRow[] = [];
  for (const row of missing.rows) {
    const base = slugify(row.name);
    const newSlug = uniqueSlug(base, taken);
    taken.add(newSlug);
    updates.push({ id: row.id, name: row.name, oldSlug: row.slug, newSlug });
  }

  if (opts.apply && updates.length > 0) {
    // Run UPDATEs in a single transaction to keep the table consistent.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const u of updates) {
        await client.query(`UPDATE ${tableName} SET slug = $1 WHERE id = $2`, [u.newSlug, u.id]);
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  return { table: tableName, scanned: missing.rows.length, updates };
}

function printSummary(s: TableSummary) {
  console.log(`\n── ${s.table} ──────────────────────────────────────────────`);
  console.log(`scanned (slug IS NULL OR slug = ''): ${s.scanned}`);
  console.log(`will be updated:                      ${s.updates.length}`);
  if (s.updates.length > 0) {
    const idW = Math.max(2, ...s.updates.map(u => String(u.id).length));
    const nameW = Math.min(40, Math.max(4, ...s.updates.map(u => u.name.length)));
    console.log(`\n  ${"id".padEnd(idW)}  ${"name".padEnd(nameW)}  oldSlug    →  newSlug`);
    console.log(`  ${"-".repeat(idW)}  ${"-".repeat(nameW)}  ---------     -------`);
    for (const u of s.updates) {
      const name = u.name.length > nameW ? u.name.slice(0, nameW - 1) + "…" : u.name.padEnd(nameW);
      const oldSlugView = u.oldSlug === null ? "(NULL)   " : `'${u.oldSlug}'`.padEnd(9);
      console.log(`  ${String(u.id).padStart(idW)}  ${name}  ${oldSlugView}  →  ${u.newSlug}`);
    }
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  // Self-test mode: verify slugify on known examples, no DB access.
  if (opts.selfTest) {
    const cases: Array<[string, string]> = [
      ["Краснодар", "krasnodar"],
      ["Москва", "moskva"],
      ["Санкт-Петербург", "sankt-peterburg"],
      ["Сантехник", "santehnik"],
      ["Ремонт ванной", "remont-vannoy"],
      ["Электрик", "elektrik"],
      ["  Москва  ", "moskva"],
      ["!!Только спецсимволы???", "tolko-spetssimvoly"],
      ["Ёлки", "yolki"],
      ["Йошкар-Ола", "yoshkar-ola"],
      ["Нижний Новгород", "nizhniy-novgorod"],
    ];
    let pass = 0, fail = 0;
    for (const [inp, exp] of cases) {
      const got = slugify(inp);
      if (got === exp) {
        console.log(`  OK   ${JSON.stringify(inp)} -> ${JSON.stringify(got)}`);
        pass++;
      } else {
        console.log(`  FAIL ${JSON.stringify(inp)} -> ${JSON.stringify(got)} (expected ${JSON.stringify(exp)})`);
        fail++;
      }
    }
    // Test uniqueSlug
    const taken = new Set<string>(["krasnodar"]);
    const u1 = uniqueSlug("krasnodar", taken); taken.add(u1);
    const u2 = uniqueSlug("krasnodar", taken); taken.add(u2);
    const u3 = uniqueSlug("moskva", taken); taken.add(u3);
    const collisionsOk = u1 === "krasnodar-2" && u2 === "krasnodar-3" && u3 === "moskva";
    console.log(`  ${collisionsOk ? "OK  " : "FAIL"} uniqueSlug collision chain: ${u1}, ${u2}, ${u3}`);
    if (collisionsOk) pass++; else fail++;

    console.log(`\n[backfill-slugs] self-test: ${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
  }

  // From here on we need the DB.
  if (!process.env["DATABASE_URL"]) {
    console.error("");
    console.error("[backfill-slugs] ERROR: DATABASE_URL is not set.");
    console.error("");
    console.error("Provide it via environment variable, e.g.:");
    console.error("  PowerShell: $env:DATABASE_URL='postgresql://...'; pnpm --filter @workspace/scripts exec tsx ./src/backfill-marketplace-slugs.ts");
    console.error("  cmd:        set DATABASE_URL=postgresql://... && pnpm --filter @workspace/scripts exec tsx ./src/backfill-marketplace-slugs.ts");
    console.error("  bash:       DATABASE_URL='postgresql://...' pnpm --filter @workspace/scripts exec tsx ./src/backfill-marketplace-slugs.ts");
    console.error("");
    console.error("DATABASE_URL is never logged by this script.");
    process.exit(1);
  }

  // Lazy import so --self-test / --help can run without DATABASE_URL.
  const { pool } = await import("@workspace/db");

  console.log("[backfill-slugs] starting");
  console.log(`  mode:   ${opts.apply ? "APPLY (will UPDATE database)" : "DRY-RUN (no changes will be written)"}`);
  console.log(`  table:  ${opts.table}`);
  if (opts.limit) console.log(`  limit:  ${opts.limit}`);

  const targets: string[] =
    opts.table === "all" ? ["cities", "service_types"] :
    opts.table === "cities" ? ["cities"] :
    ["service_types"];

  const summaries: TableSummary[] = [];
  for (const t of targets) {
    summaries.push(await backfillTable(pool, t, opts));
  }
  for (const s of summaries) printSummary(s);

  const totalUpdates = summaries.reduce((acc, s) => acc + s.updates.length, 0);
  const totalScanned = summaries.reduce((acc, s) => acc + s.scanned, 0);
  console.log("\n── total ───────────────────────────────────────────────");
  console.log(`scanned: ${totalScanned}`);
  console.log(`updates: ${totalUpdates}  (${opts.apply ? "applied" : "would-be-applied — re-run with --apply to commit"})`);

  await pool.end();
  process.exit(0);
}

main().catch((e: unknown) => {
  // Print a concise error. Never echo connection strings or pool internals.
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[backfill-slugs] ERROR: ${msg}`);
  process.exit(1);
});
