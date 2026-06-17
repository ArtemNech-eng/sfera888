/**
 * Backfill `master_portfolio.slug` for cases that were saved before the
 * auto-slug logic shipped (commit 3b11e648, plan §11.7).
 *
 * Generates `{slugify(title)}-{id}` for any row where `slug IS NULL` OR
 * `slug = ''`. The numeric suffix guarantees uniqueness across the table.
 * Idempotent — re-running after the first apply changes nothing.
 *
 * Dry-run by default. Pass `--apply` to run UPDATE.
 *
 *   # dry-run
 *   railway run --service Postgres -- node ./_proxy-run.cjs \
 *     pnpm --filter @workspace/scripts exec tsx ./src/backfill-portfolio-slugs.ts
 *
 *   # apply
 *   railway run --service Postgres -- node ./_proxy-run.cjs \
 *     pnpm --filter @workspace/scripts exec tsx ./src/backfill-portfolio-slugs.ts --apply
 *
 *   # canary with limit
 *   ... ./src/backfill-portfolio-slugs.ts --apply --limit=10
 *
 * NOTE: DATABASE_URL must be set in env. The script never prints it.
 *       Only touches `master_portfolio.slug` — no other columns or tables.
 *       Uses raw SQL via the pool from @workspace/db so it doesn't pull
 *       in drizzle-orm directly (matches the pattern in
 *       backfill-marketplace-slugs.ts).
 */

interface CliOpts {
  apply: boolean;
  limit?: number;
}

function parseArgs(argv: string[]): CliOpts {
  const opts: CliOpts = { apply: false };
  for (const raw of argv) {
    if (raw === "--apply") {
      opts.apply = true;
    } else if (raw.startsWith("--limit=")) {
      const n = Number(raw.slice("--limit=".length));
      if (!Number.isInteger(n) || n <= 0) {
        console.error(`[backfill-portfolio-slugs] ERROR: --limit must be a positive integer (got "${raw}")`);
        process.exit(1);
      }
      opts.limit = n;
    } else if (raw === "--help" || raw === "-h") {
      console.log("Usage: tsx ./src/backfill-portfolio-slugs.ts [--apply] [--limit=N]");
      process.exit(0);
    }
  }
  return opts;
}

// Same transliteration table as @workspace/api-server/src/lib/slug.ts.
// Duplicated here to avoid pulling in api-server deps for a one-off script.
const TRANSLIT: Record<string, string> = {
  "а": "a", "б": "b", "в": "v", "г": "g", "д": "d",
  "е": "e", "ё": "yo", "ж": "zh", "з": "z", "и": "i",
  "й": "y", "к": "k", "л": "l", "м": "m", "н": "n",
  "о": "o", "п": "p", "р": "r", "с": "s", "т": "t",
  "у": "u", "ф": "f", "х": "h", "ц": "ts", "ч": "ch",
  "ш": "sh", "щ": "shch", "ъ": "", "ы": "y", "ь": "",
  "э": "e", "ю": "yu", "я": "ya",
};

function slugify(input: string): string {
  const lower = input.toLowerCase();
  let out = "";
  for (const ch of lower) {
    if (TRANSLIT[ch] !== undefined) {
      out += TRANSLIT[ch];
    } else if (/[a-z0-9]/.test(ch)) {
      out += ch;
    } else {
      out += "-";
    }
  }
  return out.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}

function buildSlug(title: string | null | undefined, id: number): string {
  const titlePart = (title ?? "").trim();
  const base = titlePart.length > 0 ? slugify(titlePart) : "";
  const suffix = `-${id}`;
  const maxLen = 150;
  const baseMax = maxLen - suffix.length;
  const trimmed = base.length > 0 ? base.slice(0, baseMax) : "case";
  const cleaned = trimmed.replace(/-+$/g, "") || "case";
  return `${cleaned}${suffix}`;
}

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

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`[backfill-portfolio-slugs] mode=${opts.apply ? "APPLY" : "dry-run"}${opts.limit != null ? ` limit=${opts.limit}` : ""}`);

  if (!process.env["DATABASE_URL"]) {
    console.error("[backfill-portfolio-slugs] FATAL: DATABASE_URL not set");
    process.exit(1);
  }

  // @workspace/db exports `pool` (pg.Pool) — same pattern as
  // backfill-marketplace-slugs.ts.
  const dbModule = await import("@workspace/db") as unknown as { pool: DbPool };
  const pool = dbModule.pool;
  if (!pool) {
    console.error("[backfill-portfolio-slugs] FATAL: @workspace/db did not export `pool`");
    process.exit(1);
  }

  const limitClause = opts.limit ? `LIMIT ${opts.limit}` : "";
  const rows = await pool.query<{ id: number; title: string; slug: string | null }>(
    `SELECT id, title, slug FROM master_portfolio
     WHERE slug IS NULL OR slug = ''
     ORDER BY id ASC
     ${limitClause}`,
  );

  console.log(`[backfill-portfolio-slugs] found ${rows.rows.length} case(s) without a slug`);
  if (rows.rows.length === 0) {
    console.log(`[backfill-portfolio-slugs] nothing to do`);
    await pool.end().catch(() => {});
    return;
  }

  // Print full plan in dry-run, sample in apply mode.
  const sample = rows.rows.slice(0, 20);
  for (const row of sample) {
    const newSlug = buildSlug(row.title, row.id);
    console.log(`  case#${row.id}  "${row.title}"  ->  "${newSlug}"`);
  }
  if (rows.rows.length > sample.length) {
    console.log(`  … and ${rows.rows.length - sample.length} more`);
  }

  if (!opts.apply) {
    console.log(`\n[backfill-portfolio-slugs] dry-run done — would update ${rows.rows.length} row(s); pass --apply to commit`);
    await pool.end().catch(() => {});
    return;
  }

  // Apply mode — single transaction.
  const client = await pool.connect();
  let updated = 0;
  let skipped = 0;
  try {
    await client.query("BEGIN");
    for (const row of rows.rows) {
      const newSlug = buildSlug(row.title, row.id);
      try {
        const r = await client.query(
          `UPDATE master_portfolio SET slug = $1 WHERE id = $2 AND (slug IS NULL OR slug = '')`,
          [newSlug, row.id],
        );
        if ((r.rowCount ?? 0) > 0) updated++; else skipped++;
      } catch (e: unknown) {
        // Unique-violation should be impossible (id suffix), but log and skip.
        console.error(`[backfill-portfolio-slugs] case#${row.id} failed:`, e instanceof Error ? e.message : e);
        skipped++;
      }
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  console.log(`\n[backfill-portfolio-slugs] DONE — applied ${updated}, skipped ${skipped}`);
  await pool.end().catch(() => {});
}

main().catch((e) => {
  console.error(`[backfill-portfolio-slugs] fatal:`, e instanceof Error ? e.message : e);
  process.exit(1);
});
