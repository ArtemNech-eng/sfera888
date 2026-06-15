/**
 * Seed marketplace SEO content for `cities` and `service_types`.
 *
 * Whitelist-only: only writes columns explicitly listed in CITIES_DATA /
 * SERVICE_GENITIVE / buildServiceUpdate(). Never touches `slug`, `name` of
 * services, `is_active`, `id`, or anything in masters/leads/orders.
 *
 * Behaviour:
 *   • Dry-run by default — prints the diff, does NOT write.
 *   • --apply         — write the diff to the database.
 *   • --force         — also overwrite NON-NULL existing values
 *                       (without it, idempotent: only NULL fields are filled).
 *   • --table=cities|service_types|all  (default all)
 *
 *   pnpm --filter @workspace/scripts exec tsx ./src/seed-marketplace-seo-content.ts
 *   pnpm --filter @workspace/scripts exec tsx ./src/seed-marketplace-seo-content.ts --apply
 *   pnpm --filter @workspace/scripts exec tsx ./src/seed-marketplace-seo-content.ts --apply --force
 *
 * Note on `cities.name`: this script can also fix the existing
 * "Ростов на дону" → "Ростов-на-Дону" via the `name` field in CITIES_DATA,
 * but only with --force (because it overwrites a non-NULL value).
 *
 * NEVER prints DATABASE_URL.
 */

if (!process.env["DATABASE_URL"]) {
  console.error("\n[seed-seo] ERROR: DATABASE_URL is not set.\n");
  console.error("Provide via env, e.g.:");
  console.error("  PowerShell: $env:DATABASE_URL='postgresql://...'; pnpm --filter @workspace/scripts exec tsx ./src/seed-marketplace-seo-content.ts");
  console.error("  bash:       DATABASE_URL='postgresql://...' pnpm --filter @workspace/scripts exec tsx ./src/seed-marketplace-seo-content.ts");
  console.error("\nDATABASE_URL is never logged by this script.\n");
  process.exit(1);
}

const { pool } = await import("@workspace/db");

// ─────────────────────────────────────────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────────────────────────────────────────

type TableScope = "cities" | "service_types" | "all";
interface CliOpts {
  apply: boolean;
  force: boolean;
  table: TableScope;
}

function parseArgs(argv: string[]): CliOpts {
  const opts: CliOpts = { apply: false, force: false, table: "all" };
  for (const raw of argv) {
    if (raw === "--apply") opts.apply = true;
    else if (raw === "--force") opts.force = true;
    else if (raw === "--help" || raw === "-h") {
      console.log(`Usage:
  tsx ./src/seed-marketplace-seo-content.ts [--apply] [--force] [--table=cities|service_types|all]

  default       dry-run, fills only NULL fields
  --apply       actually run UPDATEs
  --force       also overwrite non-NULL values
  --table=...   limit scope`);
      process.exit(0);
    } else if (raw.startsWith("--table=")) {
      const value = raw.slice("--table=".length);
      if (value !== "cities" && value !== "service_types" && value !== "all") {
        console.error(`[seed-seo] ERROR: --table must be one of: cities | service_types | all (got "${value}")`);
        process.exit(1);
      }
      opts.table = value;
    } else if (raw.startsWith("--")) {
      console.error(`[seed-seo] ERROR: unknown flag "${raw}"`);
      process.exit(1);
    }
  }
  return opts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Whitelist column allow-list (CRITICAL — prevents accidental SQL surface).
// Any field name outside this set will be rejected by buildUpdateSql() below.
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_CITY_FIELDS = new Set([
  "name", "name_in", "region", "seo_title", "seo_description", "h1", "body_md",
]);
const ALLOWED_SERVICE_FIELDS = new Set([
  "name_genitive", "seo_title", "seo_description", "h1", "body_md",
]);

// ─────────────────────────────────────────────────────────────────────────────
// City SEO data (manual, curated)
// ─────────────────────────────────────────────────────────────────────────────

interface CityPlan {
  name?: string;
  name_in?: string;
  region?: string;
  seo_title?: string;
  seo_description?: string;
  h1?: string;
  body_md?: string;
}

const CITIES_DATA: Record<string, CityPlan> = {
  "krasnodar": {
    name_in: "Краснодаре",
    region: "Краснодарский край",
    h1: "Мастера в Краснодаре",
    seo_title: "Мастера в Краснодаре — Честные мастера",
    seo_description:
      "Найдите проверенного мастера в Краснодаре. Оставьте заявку — подберём исполнителя для ремонта и бытовых задач.",
    body_md:
      "Сервис «Честные мастера» помогает жителям Краснодара быстро найти проверенного исполнителя для ремонта, сантехники, электрики и бытовых задач. Все мастера проходят проверку документов перед началом работы.",
  },
  "stavropol": {
    name_in: "Ставрополе",
    region: "Ставропольский край",
    h1: "Мастера в Ставрополе",
    seo_title: "Мастера в Ставрополе — Честные мастера",
    seo_description:
      "Найдите проверенного мастера в Ставрополе. Оставьте заявку — подберём исполнителя для ремонта и бытовых задач.",
    body_md:
      "Сервис «Честные мастера» работает в Ставрополе и помогает быстро найти исполнителя для ремонта, отделки, монтажа и бытовых задач. Каждый мастер проходит проверку документов.",
  },
  "rostov-na-donu": {
    // Existing row in DB has `name = "Ростов на дону"` — apply --force to fix.
    name: "Ростов-на-Дону",
    name_in: "Ростове-на-Дону",
    region: "Ростовская область",
    h1: "Мастера в Ростове-на-Дону",
    seo_title: "Мастера в Ростове-на-Дону — Честные мастера",
    seo_description:
      "Найдите проверенного мастера в Ростове-на-Дону. Оставьте заявку — подберём исполнителя для ремонта и бытовых задач.",
    body_md:
      "Сервис «Честные мастера» работает в Ростове-на-Дону и помогает быстро найти исполнителя для ремонта, отделки, сантехники и других работ. Все мастера проходят проверку документов.",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Service genitive forms (Russian — for "найдите мастера для <gen>" phrasing
// in future SEO-text variants). Curated by hand — leaving null means the
// template falls back to nominative `name`.
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_GENITIVE: Record<string, string> = {
  "ukladka-plitki":              "укладки плитки",
  "pokleyka-oboev":              "поклейки обоев",
  "pokraska-sten":               "покраски стен",
  "montazh-laminata":            "монтажа ламината",
  "shtukaturka-sten":            "штукатурки стен",
  "elektromontazh":              "электромонтажа",
  "santehnika":                  "сантехнических работ",
  "natyazhnye-potolki":          "натяжных потолков",
  "kompleksnyy-remont":          "комплексного ремонта",
  "shpaklyovka-sten-i-potolkov": "шпаклёвки стен и потолков",
  "montazh-gipsokartona":        "монтажа гипсокартона",
  "demontazhnye-raboty":         "демонтажных работ",
  "montazh-mezhkomnatnyh-dverey":"монтажа межкомнатных дверей",
  "montazh-napolnyh-pokrytiy":   "монтажа напольных покрытий",
  "montazh-tyoplogo-pola":       "монтажа тёплого пола",
  "zvukoizolyatsiya":            "звукоизоляции",
  "otdelka-balkona-i-lodzhii":   "отделки балкона и лоджии",
  "montazh-kuhni":               "монтажа кухни",
  "chernovaya-otdelka":          "черновой отделки",
  "chistovaya-otdelka":          "чистовой отделки",
};

interface ServicePlan {
  name_genitive?: string;
  seo_title?: string;
  seo_description?: string;
  h1?: string;
  body_md?: string;
}

function buildServicePlan(name: string, slug: string): ServicePlan {
  const gen = SERVICE_GENITIVE[slug];
  return {
    name_genitive: gen,
    h1: name,
    seo_title: `${name} — Честные мастера`,
    seo_description:
      `Найдите мастера на услугу «${name}». Оставьте заявку — подберём проверенного исполнителя.`,
    body_md:
      `Услуга «${name}» доступна через сервис «Честные мастера». Опишите задачу, ` +
      `город и удобное время — мы подберём исполнителя. Заявка попадёт в систему, ` +
      `после чего мастер свяжется с вами для уточнения деталей.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic diff & UPDATE engine
// ─────────────────────────────────────────────────────────────────────────────

interface RowChange {
  id: number;
  slug: string | null;
  identity: string; // for log
  changes: Array<{ column: string; from: unknown; to: unknown; needsForce: boolean }>;
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

function diffRow(
  current: Record<string, unknown>,
  plan: Record<string, unknown>,
  allowed: Set<string>,
  identity: string,
  rowId: number,
  rowSlug: string | null,
): RowChange {
  const changes: RowChange["changes"] = [];
  for (const [col, desired] of Object.entries(plan)) {
    if (!allowed.has(col)) continue;          // safety net
    if (desired === undefined) continue;      // not specified
    const cur = current[col];
    const isCurrentEmpty = cur === null || cur === undefined || cur === "";
    if (isCurrentEmpty) {
      changes.push({ column: col, from: cur, to: desired, needsForce: false });
    } else if (cur !== desired) {
      changes.push({ column: col, from: cur, to: desired, needsForce: true });
    }
  }
  return { id: rowId, slug: rowSlug, identity, changes };
}

function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return "(NULL)";
  if (typeof v === "string") {
    if (v.length === 0) return '""';
    if (v.length > 60) return JSON.stringify(v.slice(0, 57) + "…");
    return JSON.stringify(v);
  }
  return String(v);
}

function printRowChange(rc: RowChange, force: boolean) {
  if (rc.changes.length === 0) return;
  const willApply = rc.changes.filter((c) => !c.needsForce || force);
  const skipped = rc.changes.filter((c) => c.needsForce && !force);
  console.log(`\n  ${rc.identity} (id=${rc.id}, slug=${rc.slug ?? "-"})`);
  for (const c of willApply) {
    const tag = c.needsForce ? " [overwrite]" : "";
    console.log(`    ${c.column.padEnd(18)} ${fmtCell(c.from)}  →  ${fmtCell(c.to)}${tag}`);
  }
  for (const c of skipped) {
    console.log(`    ${c.column.padEnd(18)} ${fmtCell(c.from)}  →  ${fmtCell(c.to)}    [SKIP — needs --force]`);
  }
}

async function applyChange(client: DbClient, table: "cities" | "service_types", rc: RowChange, force: boolean): Promise<number> {
  const willApply = rc.changes.filter((c) => !c.needsForce || force);
  if (willApply.length === 0) return 0;
  const setParts = willApply.map((c, i) => `"${c.column}" = $${i + 1}`);
  const params = willApply.map((c) => c.to);
  params.push(rc.id);
  const sql = `UPDATE ${table} SET ${setParts.join(", ")} WHERE id = $${params.length}`;
  const r = await client.query(sql, params);
  return r.rowCount ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

interface CityRow { id: number; slug: string | null; name: string; name_in: string | null; region: string | null; seo_title: string | null; seo_description: string | null; h1: string | null; body_md: string | null }
interface ServiceRow { id: number; slug: string | null; name: string; name_genitive: string | null; seo_title: string | null; seo_description: string | null; h1: string | null; body_md: string | null }

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log("[seed-seo] starting");
  console.log(`  mode:   ${opts.apply ? "APPLY (will UPDATE database)" : "DRY-RUN (no changes)"}`);
  console.log(`  force:  ${opts.force ? "yes (overwrite non-NULL)" : "no (only fill NULL)"}`);
  console.log(`  table:  ${opts.table}`);

  const dbPool = pool as unknown as DbPool;
  const targets: Array<"cities" | "service_types"> =
    opts.table === "all" ? ["cities", "service_types"] :
    opts.table === "cities" ? ["cities"] : ["service_types"];

  const allChanges: { cities: RowChange[]; service_types: RowChange[] } = { cities: [], service_types: [] };

  if (targets.includes("cities")) {
    const r = await dbPool.query<CityRow>(
      `SELECT id, slug, name, name_in, region, seo_title, seo_description, h1, body_md
       FROM cities ORDER BY id ASC`,
    );
    console.log(`\n── cities ──────────────────────────────────`);
    console.log(`scanned: ${r.rows.length}`);
    for (const row of r.rows) {
      const slug = row.slug;
      if (!slug || !(slug in CITIES_DATA)) continue;
      const plan = CITIES_DATA[slug] as Record<string, unknown>;
      const change = diffRow(
        row as unknown as Record<string, unknown>,
        plan,
        ALLOWED_CITY_FIELDS,
        `[cities] ${row.name}`,
        row.id,
        slug,
      );
      if (change.changes.length > 0) allChanges.cities.push(change);
    }
    console.log(`will update: ${allChanges.cities.length}`);
    for (const c of allChanges.cities) printRowChange(c, opts.force);
  }

  if (targets.includes("service_types")) {
    const r = await dbPool.query<ServiceRow>(
      `SELECT id, slug, name, name_genitive, seo_title, seo_description, h1, body_md
       FROM service_types ORDER BY id ASC`,
    );
    console.log(`\n── service_types ───────────────────────────`);
    console.log(`scanned: ${r.rows.length}`);
    for (const row of r.rows) {
      const slug = row.slug;
      if (!slug) continue;
      const plan = buildServicePlan(row.name, slug) as Record<string, unknown>;
      const change = diffRow(
        row as unknown as Record<string, unknown>,
        plan,
        ALLOWED_SERVICE_FIELDS,
        `[service_types] ${row.name}`,
        row.id,
        slug,
      );
      if (change.changes.length > 0) allChanges.service_types.push(change);
    }
    console.log(`will update: ${allChanges.service_types.length}`);
    for (const c of allChanges.service_types) printRowChange(c, opts.force);
  }

  if (!opts.apply) {
    console.log("\n── dry-run finished. Re-run with --apply to commit. ──");
    await dbPool.end();
    process.exit(0);
  }

  // APPLY mode — wrap each table in its own transaction.
  let totalUpdated = 0;
  if (allChanges.cities.length > 0) {
    const client = await dbPool.connect();
    try {
      await client.query("BEGIN");
      for (const c of allChanges.cities) {
        totalUpdated += await applyChange(client, "cities", c, opts.force);
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }
  if (allChanges.service_types.length > 0) {
    const client = await dbPool.connect();
    try {
      await client.query("BEGIN");
      for (const c of allChanges.service_types) {
        totalUpdated += await applyChange(client, "service_types", c, opts.force);
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  console.log(`\n── apply finished. ${totalUpdated} row(s) updated. ──`);
  await dbPool.end();
  process.exit(0);
}

main().catch(async (e: unknown) => {
  console.error("[seed-seo] ERROR:", e instanceof Error ? e.message : String(e));
  await pool.end().catch(() => {});
  process.exit(1);
});


// Marker so TypeScript treats this file as a module (top-level await needs it).
export {};
