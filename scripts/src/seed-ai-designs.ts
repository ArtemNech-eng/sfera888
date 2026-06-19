/**
 * Seed AI-design starter content (план D из обсуждения SEO-засева):
 *   • 20 hero дизайнов — куроированные комбинации, длинные prompts с
 *     детализированным описанием материалов и решений
 *   • 50 standard дизайнов — random выборка из cartesian product, обычные
 *     prompts
 *
 * Архитектура:
 *   1. Скрипт INSERT'ит rows в `designs` со статусом 'generating',
 *      `input_image_url=NULL` (text2img mode), уникальными anon_id и
 *      случайными параметрами (room/style/area/budget/duration/city).
 *   2. На Railway api-server's `designWorker` polls каждые 5s и подхватывает
 *      pending rows. Branch'ится на text2img mode когда inputImageUrl=null
 *      (см. designWorker.ts).
 *   3. Worker генерит 4 view renders + GPT artefacts + color palette,
 *      переводит в status='completed', is_public=true.
 *   4. Sitemap revalidate (1h) автоматом включит новые URL'ы.
 *
 * Использование:
 *
 *   pnpm --filter @workspace/scripts exec tsx ./src/seed-ai-designs.ts            # dry-run, печатает план
 *   pnpm --filter @workspace/scripts exec tsx ./src/seed-ai-designs.ts --apply    # реально создаёт rows
 *   pnpm --filter @workspace/scripts exec tsx ./src/seed-ai-designs.ts --apply --mode=hero
 *   pnpm --filter @workspace/scripts exec tsx ./src/seed-ai-designs.ts --apply --mode=standard
 *
 * Требования:
 *   • DATABASE_URL — подключение к prod-БД (где api-server'овский worker крутится)
 *   • FAL_API_KEY на стороне api-server (worker сам прочитает) — баланс должен
 *     быть пополнен ~$5 на 70 дизайнов × 4 render × $0.01
 *
 * Cost: ~$2.80 в Fal.ai + ~$0.07 в OpenAI ≈ $3 разово.
 * Время: 70 designs × 30s в worker = ~35 минут wall time после вставки.
 *
 * NEVER prints DATABASE_URL.
 */

if (!process.env["DATABASE_URL"]) {
  console.error("\n[seed-ai-designs] ERROR: DATABASE_URL is not set.\n");
  console.error("Provide via env, e.g.:");
  console.error("  PowerShell: $env:DATABASE_URL='postgresql://...'; pnpm --filter @workspace/scripts exec tsx ./src/seed-ai-designs.ts");
  console.error("  bash:       DATABASE_URL='postgresql://...' pnpm --filter @workspace/scripts exec tsx ./src/seed-ai-designs.ts");
  process.exit(1);
}

import { randomUUID } from "node:crypto";

const { db, designsTable, citiesTable } = await import("@workspace/db");

// ── CLI args ────────────────────────────────────────────────────────────────

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const dryRun = !apply;
const mode = (() => {
  for (const a of args) {
    if (a.startsWith("--mode=")) return a.slice("--mode=".length);
  }
  return "all" as const;
})() as "all" | "hero" | "standard";

if (!["all", "hero", "standard"].includes(mode)) {
  console.error(`[seed-ai-designs] invalid --mode=${mode}. Allowed: all | hero | standard`);
  process.exit(1);
}

console.log(`[seed-ai-designs] mode=${mode} dry-run=${dryRun ? "YES (no DB writes)" : "NO (will INSERT)"}`);

// ── Combinations ────────────────────────────────────────────────────────────

interface DesignSpec {
  room: string;
  style: string;
  area: number;
  budget: number;
  durationWeeks: number;
  citySlug: string | null;
  isHero: boolean;
}

/**
 * 20 hero combos — куроированный список под популярные SEO-запросы.
 * Каждый «user» создаёт 1 дизайн (уникальные anon_id).
 */
const HERO_SPECS: DesignSpec[] = [
  { room: "bathroom", style: "modern", area: 4, budget: 220000, durationWeeks: 6, citySlug: "moskva", isHero: true },
  { room: "bathroom", style: "scandinavian", area: 5, budget: 250000, durationWeeks: 7, citySlug: "sankt-peterburg", isHero: true },
  { room: "bathroom", style: "loft", area: 6, budget: 280000, durationWeeks: 8, citySlug: "moskva", isHero: true },
  { room: "bathroom", style: "minimalism", area: 4, budget: 200000, durationWeeks: 6, citySlug: "moskva", isHero: true },
  { room: "kitchen", style: "modern", area: 8, budget: 300000, durationWeeks: 7, citySlug: "moskva", isHero: true },
  { room: "kitchen", style: "scandinavian", area: 10, budget: 380000, durationWeeks: 8, citySlug: "sankt-peterburg", isHero: true },
  { room: "kitchen", style: "modern", area: 12, budget: 420000, durationWeeks: 9, citySlug: "krasnodar", isHero: true },
  { room: "kitchen", style: "japandi", area: 9, budget: 350000, durationWeeks: 8, citySlug: "moskva", isHero: true },
  { room: "living_room", style: "modern", area: 18, budget: 350000, durationWeeks: 8, citySlug: "moskva", isHero: true },
  { room: "living_room", style: "loft", area: 20, budget: 420000, durationWeeks: 9, citySlug: "moskva", isHero: true },
  { room: "living_room", style: "scandinavian", area: 16, budget: 280000, durationWeeks: 7, citySlug: "sankt-peterburg", isHero: true },
  { room: "living_room", style: "minimalism", area: 22, budget: 380000, durationWeeks: 8, citySlug: "moskva", isHero: true },
  { room: "bedroom", style: "scandinavian", area: 12, budget: 220000, durationWeeks: 6, citySlug: "moskva", isHero: true },
  { room: "bedroom", style: "japandi", area: 14, budget: 280000, durationWeeks: 7, citySlug: "moskva", isHero: true },
  { room: "bedroom", style: "modern", area: 10, budget: 180000, durationWeeks: 5, citySlug: "sankt-peterburg", isHero: true },
  { room: "hallway", style: "modern", area: 5, budget: 90000, durationWeeks: 3, citySlug: "moskva", isHero: true },
  { room: "hallway", style: "loft", area: 6, budget: 110000, durationWeeks: 4, citySlug: "moskva", isHero: true },
  { room: "apartment", style: "scandinavian", area: 35, budget: 750000, durationWeeks: 14, citySlug: "moskva", isHero: true },
  { room: "apartment", style: "modern", area: 50, budget: 1100000, durationWeeks: 18, citySlug: "moskva", isHero: true },
  { room: "apartment", style: "neoclassic", area: 60, budget: 1500000, durationWeeks: 22, citySlug: "moskva", isHero: true },
];

/** Картезианское произведение для standard combos. */
const ROOMS = ["bathroom", "kitchen", "living_room", "bedroom", "hallway", "apartment"] as const;
const STYLES = ["modern", "scandinavian", "loft", "minimalism", "neoclassic", "japandi"] as const;
const AREA_BUCKETS_BY_ROOM: Record<string, number[]> = {
  bathroom: [3, 4, 5, 6, 7, 8],
  kitchen: [6, 8, 9, 10, 12, 14, 16],
  living_room: [14, 16, 18, 20, 22, 25, 28, 30],
  bedroom: [9, 10, 12, 14, 16, 18, 20],
  hallway: [3, 4, 5, 6, 7, 8],
  apartment: [30, 35, 40, 45, 50, 55, 60, 70, 80, 100],
};
const POPULAR_CITY_SLUGS = ["moskva", "sankt-peterburg", "krasnodar", "ekaterinburg", "novosibirsk"];

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function generateStandardSpecs(count: number): DesignSpec[] {
  const out: DesignSpec[] = [];
  const seen = new Set<string>();
  let attempts = 0;
  while (out.length < count && attempts < count * 10) {
    attempts++;
    const room = pickRandom(ROOMS);
    const style = pickRandom(STYLES);
    const area = pickRandom(AREA_BUCKETS_BY_ROOM[room]!);
    const citySlug = pickRandom(POPULAR_CITY_SLUGS);
    const key = `${room}-${style}-${area}-${citySlug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Бюджет реалистичный для room+area: ~12-25K ₽/м² для отдельных
    // комнат, ~18-35K ₽/м² для квартир под-ключ.
    const isApt = room === "apartment";
    const ratePerM2 = isApt
      ? 18000 + Math.floor(Math.random() * 17000)
      : 12000 + Math.floor(Math.random() * 13000);
    const budget = Math.round((area * ratePerM2) / 10000) * 10000;
    const durationWeeks = isApt
      ? 12 + Math.floor(Math.random() * 12) // 12-24
      : 4 + Math.floor(Math.random() * 6);  // 4-10
    out.push({
      room,
      style,
      area,
      budget,
      durationWeeks,
      citySlug,
      isHero: false,
    });
  }
  return out;
}

const STANDARD_SPECS = generateStandardSpecs(50);

// ── Anon ID generation (mimic organic distribution) ────────────────────────
//
// Hero — каждый дизайн = уникальный «пользователь» (20 unique anon_ids).
// Standard — миксованный: 35 unique + 5 групп × 3 (повторные пользователи).

function buildAnonIds(specs: DesignSpec[]): string[] {
  const ids: string[] = [];
  const heroes = specs.filter((s) => s.isHero);
  const standards = specs.filter((s) => !s.isHero);

  // 1 hero = 1 unique anon_id
  for (const _ of heroes) ids.push(randomUUID());

  // Standard: split into "single" + "clustered" groups
  const singleCount = Math.max(0, standards.length - 15);
  const clusterCount = Math.min(standards.length - singleCount, 15); // 5 × 3
  const singles: string[] = Array.from({ length: singleCount }, () => randomUUID());
  const clusterIds: string[] = [];
  const numClusters = 5;
  for (let i = 0; i < numClusters; i++) {
    const groupId = randomUUID();
    const groupSize = Math.floor(clusterCount / numClusters);
    for (let j = 0; j < groupSize; j++) clusterIds.push(groupId);
  }
  // Pad if remainder
  while (singles.length + clusterIds.length < standards.length) singles.push(randomUUID());

  ids.push(...singles, ...clusterIds);
  return ids;
}

// ── Slug builder ────────────────────────────────────────────────────────────
function buildSlug(room: string, style: string): string {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
  return `${room.replace(/_/g, "-")}-${style}-${suffix}`;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const allSpecs: DesignSpec[] = [];
  if (mode === "all" || mode === "hero") allSpecs.push(...HERO_SPECS);
  if (mode === "all" || mode === "standard") allSpecs.push(...STANDARD_SPECS);

  const anonIds = buildAnonIds(allSpecs);

  // Resolve city slugs → IDs. Тянем все cities одним запросом (их немного,
  // <100), фильтруем в JS — избегаем drizzle-orm direct import (нет в
  // scripts/package.json deps).
  const usedCitySlugs = new Set(
    allSpecs.map((s) => s.citySlug).filter((s): s is string => Boolean(s)),
  );
  const allCities = usedCitySlugs.size > 0
    ? await db.select({ id: citiesTable.id, slug: citiesTable.slug }).from(citiesTable)
    : [];
  const citySlugToId = new Map<string, number>();
  for (const c of allCities) {
    if (c.slug && usedCitySlugs.has(c.slug)) citySlugToId.set(c.slug, c.id);
  }

  console.log(`[seed-ai-designs] Resolved cities: ${citySlugToId.size}/${usedCitySlugs.size}`);

  // Print plan
  console.log(`\n[seed-ai-designs] Plan: ${allSpecs.length} designs (${HERO_SPECS.length} hero + ${STANDARD_SPECS.length} standard)`);
  console.log(`  Cost: ~$${(allSpecs.length * 0.05).toFixed(2)} в Fal.ai + ~$${(allSpecs.length * 0.001).toFixed(2)} в OpenAI`);
  console.log(`  Время: ~${Math.ceil((allSpecs.length * 30) / 60)} min wall time (worker processes ~1 каждые 5-30s)`);

  if (dryRun) {
    console.log("\n[seed-ai-designs] DRY RUN — no DB writes. Sample plan (first 5):");
    for (const spec of allSpecs.slice(0, 5)) {
      console.log(`  • ${spec.room} ${spec.style} ${spec.area}m² ${spec.budget}₽ ${spec.durationWeeks}w ${spec.citySlug ?? "—"} hero=${spec.isHero}`);
    }
    console.log("\n[seed-ai-designs] To apply: re-run with --apply flag.");
    process.exit(0);
  }

  // Apply mode — INSERT all rows.
  console.log(`\n[seed-ai-designs] Inserting ${allSpecs.length} designs into DB...`);
  let inserted = 0;
  let failed = 0;
  for (let i = 0; i < allSpecs.length; i++) {
    const spec = allSpecs[i]!;
    const anonId = anonIds[i]!;
    const cityId = spec.citySlug ? citySlugToId.get(spec.citySlug) ?? null : null;
    const slug = buildSlug(spec.room, spec.style);

    try {
      await db.insert(designsTable).values({
        slug,
        anonId,
        roomType: spec.room,
        style: spec.style,
        cityId,
        area: spec.area.toString(),
        budget: spec.budget,
        durationWeeks: spec.durationWeeks,
        // text2img mode — worker генерит без init image
        inputImageUrl: null,
        status: "generating",
      });
      inserted++;
      if (inserted % 10 === 0) {
        console.log(`  ✓ inserted ${inserted}/${allSpecs.length}`);
      }
    } catch (e) {
      failed++;
      console.error(`  ✗ failed ${spec.room}-${spec.style}-${spec.area}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\n[seed-ai-designs] Done. Inserted: ${inserted}, failed: ${failed}.`);
  console.log(`[seed-ai-designs] Worker will process pending designs over the next ~${Math.ceil((inserted * 30) / 60)} minutes.`);
  console.log(`[seed-ai-designs] Monitor via: SELECT status, count(*) FROM designs GROUP BY status;`);
  process.exit(0);
}

main().catch((e) => {
  console.error("[seed-ai-designs] fatal:", e);
  process.exit(1);
});
