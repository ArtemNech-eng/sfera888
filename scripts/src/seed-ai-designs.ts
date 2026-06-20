/**
 * Seed AI-design v2 — 50 проектов как мини-кейсы для SEO L1.
 *
 * Концепция: каждая страница = полноценный мини-проект (см. план обсуждения
 * с user'ом). Не шаблонные «дизайн спальни» × 100К, а проработанные кейсы с
 * параметрами / районом / бюджетом / решениями / материалами / сметой.
 *
 * Распределение городов: Краснодар 15, Ростов-на-Дону 13, Ставрополь 11,
 * Волгоград 11 — итого 50.
 *
 * Тексты:
 *   • Проект №1 (флаг `seedContent` заполнен) — handwritten by Claude Opus
 *     в чате. Используется для тестового запуска: «сначала один проект
 *     сделаем, посмотрим». Если seed-контент задан, worker не вызывает
 *     designContent.ts (см. designWorker.ts: hasSeedContent check).
 *   • Проекты №2-50 — содержат только параметры. Worker запросит
 *     designContent.ts (наш AI-шлюз через OpenRouter), который ротирует
 *     8 narrative-стилей по seed=design.id.
 *
 * Использование:
 *   pnpm --filter @workspace/scripts exec tsx ./src/seed-ai-designs.ts                  # dry-run
 *   pnpm --filter @workspace/scripts exec tsx ./src/seed-ai-designs.ts --apply --limit=1
 *   pnpm --filter @workspace/scripts exec tsx ./src/seed-ai-designs.ts --apply
 *
 * Cost: ~$10-15 в Fal.ai (50 × 5 картинок × ~$0.025 — 1 before + 4 view).
 * NEVER prints DATABASE_URL.
 */

if (!process.env["DATABASE_URL"]) {
  console.error("\n[seed-ai-designs] ERROR: DATABASE_URL is not set.\n");
  process.exit(1);
}

import { randomUUID } from "node:crypto";

const { db, pool, designsTable, citiesTable } = await import("@workspace/db");
import type {
  DesignMaterial,
  DesignEstimateItem,
  DesignSolution,
} from "@workspace/db";

// ── CLI ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dryRun = !apply;
const limit = (() => {
  const a = args.find((x) => x.startsWith("--limit="));
  if (!a) return null;
  const n = parseInt(a.slice("--limit=".length), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
})();

console.log(
  `[seed-ai-designs] mode=${dryRun ? "DRY-RUN" : "APPLY"} limit=${limit ?? "all"}`,
);

// ── Type ────────────────────────────────────────────────────────────────────

interface SeedContent {
  h1: string;
  seoTitle: string;
  seoDescription: string;
  description: string;
  materials: DesignMaterial[];
  estimate: DesignEstimateItem[];
  solutions: DesignSolution[];
}

interface DesignSpec {
  /** Stable seed-id для slug suffix (детерминистичный run/re-run). */
  seedKey: string;
  room: string;
  style: string;
  area: number;
  budget: number;
  durationWeeks: number;
  citySlug: string;
  district: string;
  /** Если задано — worker возьмёт текст as-is. Иначе AI сгенерирует. */
  seedContent?: SeedContent;
}

// ── 4 cities — slugs we expect to exist (или upsert'нем сами). ──────────────

const CITY_DATA: Record<string, { name: string; nameIn: string; region: string }> = {
  "krasnodar": { name: "Краснодар", nameIn: "в Краснодаре", region: "Краснодарский край" },
  "rostov-na-donu": { name: "Ростов-на-Дону", nameIn: "в Ростове-на-Дону", region: "Ростовская область" },
  "stavropol": { name: "Ставрополь", nameIn: "в Ставрополе", region: "Ставропольский край" },
  "volgograd": { name: "Волгоград", nameIn: "в Волгограде", region: "Волгоградская область" },
};

// ── Project #1: handwritten content (для тест-запуска) ──────────────────────
//
// Narrative style: emotional_descriptive (атмосферное описание через ощущения).

const PROJECT_1_CONTENT: SeedContent = {
  h1: "Спальня 14 м² в стиле японди в Краснодаре",
  seoTitle: "Дизайн спальни 14 м² в стиле японди — 280 000 ₽, Краснодар",
  seoDescription: "AI-концепт спальни 14 м² в стиле японди для квартиры в Краснодаре. Подробная смета 280 000 ₽: материалы, мебель, освещение, текстиль.",
  description:
    "Утром в этой спальне солнце ложится на пол косыми тёплыми полосами — окно выходит на восток, а лёгкая льняная штора рассеивает свет, не глуша его. Главный материал здесь — дубовый шпон тёплого медового оттенка. Он на изголовье кровати, на фасадах встроенного шкафа и на узкой полке над прикроватной тумбой.\n\nСтены покрыты матовой краской цвета сливочной бумаги. Вечером сценарное освещение делает комнату совсем другой: бра у изголовья дают мягкий тёплый свет, прикроватные лампы светят локально, а потолочный круглый светильник работает только когда нужно полное освещение. Полы — широкая инженерная доска под маслом, ходить по ней можно босиком.",
  materials: [
    { category: "Стены", description: "Краска интерьерная матовая, цвет сливочно-белый, два слоя по подложке" },
    { category: "Изголовье", description: "Шпон дуба натуральный медовый, лак матовый на водной основе" },
    { category: "Пол", description: "Инженерная доска дуб, ширина 220 мм, масло-воск, монтаж на клей" },
    { category: "Потолок", description: "Гипсокартон с покраской, точка центрального светильника + контурная подсветка" },
    { category: "Шкаф", description: "Встроенный во всю стену 2,8 м, фасады из шпона дуба, system Blum-soft-close" },
    { category: "Текстиль", description: "Льняные шторы небелёного оттенка, плотный хлопок постельный" },
  ],
  estimate: [
    { category: "Отделочные материалы", amountKopeks: 8500000 },
    { category: "Мебель", amountKopeks: 13000000 },
    { category: "Освещение", amountKopeks: 2500000 },
    { category: "Текстиль и декор", amountKopeks: 2500000 },
    { category: "Прочие расходы", amountKopeks: 1500000 },
  ],
  solutions: [
    { text: "Кровать 160×200 поставлена изголовьем к глухой стене — оба прохода свободны, тумбы по сторонам не блокируются дверями шкафа." },
    { text: "Встроенный шкаф во всю длину одной стены: 2,8 м, без надстроек до потолка — визуально комната выглядит выше." },
    { text: "Бра-светильники над тумбами на высоте 1,4 м — свет на книгу не слепит партнёра, выключатели у изголовья." },
    { text: "Льняные шторы шириной в полтора окна — собранные сбоку дают эффект визуального расширения проёма." },
    { text: "Палитра ограничена тремя тонами: сливочный, медовый дуб, угольно-серый текстиль — цвет не «дробит» небольшое помещение." },
  ],
};

// ── 50 specs (project 1 has handwritten content; 2-50 inherit AI gen) ───────

const SPECS: DesignSpec[] = [
  // ─── Краснодар (15) ───────────────────────────────────────────────────────
  { seedKey: "krd-001", room: "bedroom", style: "japandi", area: 14, budget: 280000, durationWeeks: 7, citySlug: "krasnodar", district: "Фестивальный", seedContent: PROJECT_1_CONTENT },
  { seedKey: "krd-002", room: "kitchen", style: "modern", area: 9, budget: 350000, durationWeeks: 7, citySlug: "krasnodar", district: "Юбилейный" },
  { seedKey: "krd-003", room: "bathroom", style: "japandi", area: 5, budget: 250000, durationWeeks: 6, citySlug: "krasnodar", district: "Центральный" },
  { seedKey: "krd-004", room: "living_room", style: "loft", area: 22, budget: 480000, durationWeeks: 9, citySlug: "krasnodar", district: "Музыкальный" },
  { seedKey: "krd-005", room: "nursery", style: "scandinavian", area: 11, budget: 220000, durationWeeks: 6, citySlug: "krasnodar", district: "Энка" },
  { seedKey: "krd-006", room: "hallway", style: "minimalism", area: 5, budget: 95000, durationWeeks: 3, citySlug: "krasnodar", district: "Прикубанский" },
  { seedKey: "krd-007", room: "bedroom", style: "scandinavian", area: 12, budget: 240000, durationWeeks: 6, citySlug: "krasnodar", district: "Карасунский" },
  { seedKey: "krd-008", room: "apartment", style: "modern", area: 55, budget: 1300000, durationWeeks: 18, citySlug: "krasnodar", district: "Восточно-Кругликовский" },
  { seedKey: "krd-009", room: "kitchen", style: "scandinavian", area: 11, budget: 380000, durationWeeks: 8, citySlug: "krasnodar", district: "Гидрострой" },
  { seedKey: "krd-010", room: "bathroom", style: "classic", area: 6, budget: 320000, durationWeeks: 7, citySlug: "krasnodar", district: "Школьный" },
  { seedKey: "krd-011", room: "living_room", style: "japandi", area: 18, budget: 380000, durationWeeks: 8, citySlug: "krasnodar", district: "Российская" },
  { seedKey: "krd-012", room: "bedroom", style: "neoclassic", area: 16, budget: 350000, durationWeeks: 8, citySlug: "krasnodar", district: "Северный" },
  { seedKey: "krd-013", room: "nursery", style: "japandi", area: 10, budget: 200000, durationWeeks: 6, citySlug: "krasnodar", district: "Молодёжный" },
  { seedKey: "krd-014", room: "kitchen", style: "loft", area: 12, budget: 410000, durationWeeks: 8, citySlug: "krasnodar", district: "Пашковский" },
  { seedKey: "krd-015", room: "apartment", style: "japandi", area: 45, budget: 950000, durationWeeks: 16, citySlug: "krasnodar", district: "Западный" },

  // ─── Ростов-на-Дону (13) ──────────────────────────────────────────────────
  { seedKey: "rnd-001", room: "bedroom", style: "modern", area: 13, budget: 240000, durationWeeks: 6, citySlug: "rostov-na-donu", district: "Северный" },
  { seedKey: "rnd-002", room: "kitchen", style: "classic", area: 10, budget: 360000, durationWeeks: 8, citySlug: "rostov-na-donu", district: "Западный" },
  { seedKey: "rnd-003", room: "bathroom", style: "scandinavian", area: 4, budget: 180000, durationWeeks: 5, citySlug: "rostov-na-donu", district: "Левенцовка" },
  { seedKey: "rnd-004", room: "living_room", style: "scandinavian", area: 19, budget: 360000, durationWeeks: 8, citySlug: "rostov-na-donu", district: "ЗЖМ" },
  { seedKey: "rnd-005", room: "nursery", style: "minimalism", area: 12, budget: 220000, durationWeeks: 6, citySlug: "rostov-na-donu", district: "Сельмаш" },
  { seedKey: "rnd-006", room: "bedroom", style: "loft", area: 15, budget: 300000, durationWeeks: 7, citySlug: "rostov-na-donu", district: "Чкаловский" },
  { seedKey: "rnd-007", room: "apartment", style: "scandinavian", area: 42, budget: 850000, durationWeeks: 14, citySlug: "rostov-na-donu", district: "Темерник" },
  { seedKey: "rnd-008", room: "kitchen", style: "japandi", area: 8, budget: 290000, durationWeeks: 7, citySlug: "rostov-na-donu", district: "СЖМ" },
  { seedKey: "rnd-009", room: "hallway", style: "classic", area: 6, budget: 130000, durationWeeks: 4, citySlug: "rostov-na-donu", district: "Военвед" },
  { seedKey: "rnd-010", room: "living_room", style: "classic", area: 24, budget: 580000, durationWeeks: 10, citySlug: "rostov-na-donu", district: "Центральный" },
  { seedKey: "rnd-011", room: "bedroom", style: "minimalism", area: 10, budget: 180000, durationWeeks: 5, citySlug: "rostov-na-donu", district: "Каменка" },
  { seedKey: "rnd-012", room: "bathroom", style: "modern", area: 5, budget: 220000, durationWeeks: 6, citySlug: "rostov-na-donu", district: "Стройгородок" },
  { seedKey: "rnd-013", room: "apartment", style: "loft", area: 60, budget: 1450000, durationWeeks: 20, citySlug: "rostov-na-donu", district: "Ростовское море" },

  // ─── Ставрополь (11) ──────────────────────────────────────────────────────
  { seedKey: "stv-001", room: "bedroom", style: "classic", area: 14, budget: 270000, durationWeeks: 7, citySlug: "stavropol", district: "Центр" },
  { seedKey: "stv-002", room: "kitchen", style: "minimalism", area: 9, budget: 280000, durationWeeks: 7, citySlug: "stavropol", district: "Юго-западный" },
  { seedKey: "stv-003", room: "bathroom", style: "loft", area: 5, budget: 220000, durationWeeks: 6, citySlug: "stavropol", district: "Промышленный" },
  { seedKey: "stv-004", room: "living_room", style: "modern", area: 20, budget: 400000, durationWeeks: 9, citySlug: "stavropol", district: "Ленинский" },
  { seedKey: "stv-005", room: "nursery", style: "japandi", area: 11, budget: 200000, durationWeeks: 6, citySlug: "stavropol", district: "Перспективный" },
  { seedKey: "stv-006", room: "bedroom", style: "scandinavian", area: 12, budget: 220000, durationWeeks: 6, citySlug: "stavropol", district: "Октябрьский" },
  { seedKey: "stv-007", room: "apartment", style: "minimalism", area: 38, budget: 720000, durationWeeks: 13, citySlug: "stavropol", district: "204-й квартал" },
  { seedKey: "stv-008", room: "kitchen", style: "neoclassic", area: 11, budget: 350000, durationWeeks: 8, citySlug: "stavropol", district: "Северо-западный" },
  { seedKey: "stv-009", room: "hallway", style: "scandinavian", area: 4, budget: 75000, durationWeeks: 3, citySlug: "stavropol", district: "Чапаевка" },
  { seedKey: "stv-010", room: "living_room", style: "minimalism", area: 17, budget: 320000, durationWeeks: 7, citySlug: "stavropol", district: "Бельведер" },
  { seedKey: "stv-011", room: "apartment", style: "classic", area: 50, budget: 1100000, durationWeeks: 18, citySlug: "stavropol", district: "Центр" },

  // ─── Волгоград (11) ───────────────────────────────────────────────────────
  { seedKey: "vlg-001", room: "bedroom", style: "japandi", area: 13, budget: 240000, durationWeeks: 7, citySlug: "volgograd", district: "Центральный" },
  { seedKey: "vlg-002", room: "kitchen", style: "modern", area: 10, budget: 320000, durationWeeks: 7, citySlug: "volgograd", district: "Дзержинский" },
  { seedKey: "vlg-003", room: "bathroom", style: "minimalism", area: 4, budget: 170000, durationWeeks: 5, citySlug: "volgograd", district: "Краснооктябрьский" },
  { seedKey: "vlg-004", room: "living_room", style: "neoclassic", area: 21, budget: 450000, durationWeeks: 9, citySlug: "volgograd", district: "Ворошиловский" },
  { seedKey: "vlg-005", room: "nursery", style: "modern", area: 12, budget: 220000, durationWeeks: 6, citySlug: "volgograd", district: "Тракторозаводский" },
  { seedKey: "vlg-006", room: "bedroom", style: "loft", area: 12, budget: 230000, durationWeeks: 6, citySlug: "volgograd", district: "Кировский" },
  { seedKey: "vlg-007", room: "apartment", style: "japandi", area: 48, budget: 1000000, durationWeeks: 16, citySlug: "volgograd", district: "Советский" },
  { seedKey: "vlg-008", room: "kitchen", style: "scandinavian", area: 9, budget: 310000, durationWeeks: 7, citySlug: "volgograd", district: "Спартановка" },
  { seedKey: "vlg-009", room: "hallway", style: "loft", area: 5, budget: 100000, durationWeeks: 4, citySlug: "volgograd", district: "Красноармейский" },
  { seedKey: "vlg-010", room: "living_room", style: "scandinavian", area: 18, budget: 340000, durationWeeks: 8, citySlug: "volgograd", district: "Ангарский" },
  { seedKey: "vlg-011", room: "bathroom", style: "neoclassic", area: 6, budget: 280000, durationWeeks: 7, citySlug: "volgograd", district: "Тулака" },
];

// ── Slug builder (unique nano suffix) ───────────────────────────────────────

function buildSlug(spec: DesignSpec, suffix: string): string {
  return `${spec.room.replace(/_/g, "-")}-${spec.style}-${suffix}`;
}

// ── City upsert (Volgograd может отсутствовать) ─────────────────────────────

async function ensureCities(): Promise<Map<string, number>> {
  const usedSlugs = new Set(SPECS.map((s) => s.citySlug));
  const existing = await db
    .select({ id: citiesTable.id, slug: citiesTable.slug, name: citiesTable.name })
    .from(citiesTable);
  const slugToId = new Map<string, number>();
  for (const c of existing) {
    if (c.slug) slugToId.set(c.slug, c.id);
  }

  for (const slug of usedSlugs) {
    if (slugToId.has(slug)) continue;
    const meta = CITY_DATA[slug];
    if (!meta) {
      console.warn(`[seed-ai-designs] Unknown city slug: ${slug} — skipping upsert`);
      continue;
    }
    if (dryRun) {
      console.log(`  [dry-run] would upsert city: ${slug} (${meta.name})`);
      slugToId.set(slug, -1);
      continue;
    }
    // Try to find by name (existing CRM rows have name but no slug).
    const byName = existing.find((c) => c.name === meta.name);
    if (byName) {
      await pool.query(
        "UPDATE cities SET slug = $1, name_in = $2, region = $3 WHERE id = $4",
        [slug, meta.nameIn, meta.region, byName.id],
      );
      slugToId.set(slug, byName.id);
      console.log(`  ✓ updated city slug for ${meta.name}: ${slug}`);
    } else {
      const [created] = await db
        .insert(citiesTable)
        .values({
          name: meta.name,
          slug,
          nameIn: meta.nameIn,
          region: meta.region,
          timezone: "Europe/Moscow",
          isActive: true,
        })
        .returning({ id: citiesTable.id });
      if (created) {
        slugToId.set(slug, created.id);
        console.log(`  ✓ created city: ${meta.name} (${slug})`);
      }
    }
  }
  return slugToId;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const specs = limit ? SPECS.slice(0, limit) : SPECS;

  console.log(`[seed-ai-designs] Plan: ${specs.length} designs`);
  const handwritten = specs.filter((s) => s.seedContent).length;
  console.log(`  • handwritten content: ${handwritten}`);
  console.log(`  • AI-generated content: ${specs.length - handwritten}`);
  const estCost = specs.length * 0.13; // 5 images × ~$0.025
  console.log(`  • est. Fal.ai cost: $${estCost.toFixed(2)}`);

  if (dryRun) {
    console.log("\nFirst 3 specs:");
    for (const s of specs.slice(0, 3)) {
      console.log(`  ${s.seedKey}: ${s.room}/${s.style} ${s.area}m² ${s.budget}₽ — ${s.district}, ${s.citySlug}${s.seedContent ? " [HW]" : ""}`);
    }
    console.log("\n[seed-ai-designs] DRY RUN — re-run with --apply to insert.");
    return;
  }

  console.log("\n[seed-ai-designs] Resolving cities…");
  const cityMap = await ensureCities();

  console.log(`\n[seed-ai-designs] Inserting ${specs.length} designs…`);
  let ok = 0;
  let fail = 0;
  for (const spec of specs) {
    const cityId = cityMap.get(spec.citySlug) ?? null;
    if (cityId === null) {
      console.warn(`  ✗ ${spec.seedKey}: city ${spec.citySlug} not resolved — skipping`);
      fail++;
      continue;
    }
    const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
    const slug = buildSlug(spec, suffix);
    const anonId = randomUUID();

    try {
      await db.insert(designsTable).values({
        slug,
        anonId,
        roomType: spec.room,
        style: spec.style,
        cityId,
        district: spec.district,
        area: spec.area.toString(),
        budget: spec.budget,
        durationWeeks: spec.durationWeeks,
        inputImageUrl: null, // text2img — worker сам сгенерит «Было»
        // Если есть handwritten content — сразу записываем, worker
        // увидит hasSeedContent и не вызовет AI text gen.
        h1: spec.seedContent?.h1,
        seoTitle: spec.seedContent?.seoTitle,
        seoDescription: spec.seedContent?.seoDescription,
        description: spec.seedContent?.description,
        materials: spec.seedContent?.materials,
        estimate: spec.seedContent?.estimate,
        solutions: spec.seedContent?.solutions,
        status: "generating",
      });
      ok++;
      console.log(`  ✓ ${spec.seedKey}: /dizajn/${slug}`);
    } catch (e) {
      fail++;
      console.error(`  ✗ ${spec.seedKey}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\n[seed-ai-designs] Done. ok=${ok} fail=${fail}.`);
  console.log(`[seed-ai-designs] Worker процессит ~30s/проект — итого ~${Math.ceil(ok * 0.5)} мин.`);
  console.log(`[seed-ai-designs] Monitor: SELECT status, count(*) FROM designs WHERE id > (SELECT max(id)-${ok} FROM designs) GROUP BY status;`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[seed-ai-designs] fatal:", e);
    process.exit(1);
  });
