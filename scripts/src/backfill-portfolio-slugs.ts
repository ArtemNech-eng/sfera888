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
 *   pnpm --filter @workspace/scripts exec tsx ./src/backfill-portfolio-slugs.ts
 *
 *   # apply
 *   pnpm --filter @workspace/scripts exec tsx ./src/backfill-portfolio-slugs.ts --apply
 *
 *   # limit (canary)
 *   pnpm --filter @workspace/scripts exec tsx ./src/backfill-portfolio-slugs.ts --apply --limit=10
 *
 * NOTE: DATABASE_URL must be set in env. The script never prints it.
 *       Only touches `master_portfolio.slug` — no other columns or tables.
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

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`[backfill-portfolio-slugs] mode=${opts.apply ? "APPLY" : "dry-run"}${opts.limit != null ? ` limit=${opts.limit}` : ""}`);

  const { db, masterPortfolioTable } = await import("@workspace/db");
  const { eq, isNull, or, sql } = await import("drizzle-orm");

  // Find cases without a slug.
  const conds = or(
    isNull(masterPortfolioTable.slug),
    eq(masterPortfolioTable.slug, ""),
  );

  const rows = await db
    .select({
      id: masterPortfolioTable.id,
      title: masterPortfolioTable.title,
      slug: masterPortfolioTable.slug,
    })
    .from(masterPortfolioTable)
    .where(conds)
    .orderBy(masterPortfolioTable.id)
    .limit(opts.limit ?? 100000);

  console.log(`[backfill-portfolio-slugs] found ${rows.length} case(s) without a slug`);
  if (rows.length === 0) {
    console.log(`[backfill-portfolio-slugs] nothing to do`);
    return;
  }

  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    const newSlug = buildSlug(row.title, row.id);
    if (!opts.apply) {
      console.log(`[dry-run] case#${row.id} "${row.title}" -> "${newSlug}"`);
      skipped++;
      continue;
    }
    try {
      await db
        .update(masterPortfolioTable)
        .set({ slug: newSlug })
        .where(eq(masterPortfolioTable.id, row.id));
      updated++;
      if (updated % 50 === 0) {
        console.log(`[backfill-portfolio-slugs] applied ${updated}/${rows.length}`);
      }
    } catch (e: unknown) {
      // Unique-violation should be impossible thanks to id suffix, but log
      // and skip just in case so a single bad row doesn't kill the batch.
      console.error(`[backfill-portfolio-slugs] case#${row.id} failed:`, e instanceof Error ? e.message : e);
      skipped++;
    }
  }

  if (opts.apply) {
    console.log(`[backfill-portfolio-slugs] DONE — applied ${updated}, skipped ${skipped}`);
  } else {
    console.log(`[backfill-portfolio-slugs] dry-run done — would update ${rows.length} row(s); pass --apply to commit`);
  }

  // Drizzle's pool stays open; force exit.
  process.exit(0);
}

main().catch((e) => {
  console.error(`[backfill-portfolio-slugs] fatal:`, e instanceof Error ? e.message : e);
  process.exit(1);
});
