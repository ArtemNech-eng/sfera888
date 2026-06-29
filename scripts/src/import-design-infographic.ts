/**
 * Import ready-made design infographics as PUBLISHED AI-design pages (SEO).
 *
 * Назначение: взять ГОТОВУЮ инфографику (одно изображение на проект — как то,
 * что выдаёт `infographicComposer`, или сделанное вручную/во внешнем тулзе) и
 * опубликовать страницу `/dizajn/{slug}` сразу как `status=completed`,
 * `is_public=true` — БЕЗ запуска AI-пайплайна (Layout_Planner / FAL / текст).
 *
 * Это «редакторский» Showcase_Project (без `anon_id`): он индексируется и
 * наполняет каталог для SEO, не требуя рабочего ключа AI-модели.
 *
 * Как это рендерится: благодаря адаптивному `DesignBoard` (фикс
 * ai-design-quality-fix §A) проект с ОДНИМ изображением показывается как
 * большая картинка во всю ширину + текстовые блоки (описание, материалы,
 * смета, решения, палитра) — текст идёт в индекс, картинка даёт визуал.
 *
 * Запуск (там, где доступны БД и R2 — Railway / `railway run`):
 *   pnpm --filter @workspace/scripts exec tsx ./src/import-design-infographic.ts --manifest=./data/design-import.json            # dry-run
 *   pnpm --filter @workspace/scripts exec tsx ./src/import-design-infographic.ts --manifest=./data/design-import.json --apply
 *
 * NEVER prints DATABASE_URL / R2 secrets.
 */

if (!process.env["DATABASE_URL"]) {
  console.error("\n[import-design] ERROR: DATABASE_URL is not set.\n");
  process.exit(1);
}

import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const { db, pool, designsTable, citiesTable } = await import("@workspace/db");
import type {
  DesignMaterial,
  DesignEstimateItem,
  DesignSolution,
  DesignColorSwatch,
  DesignView,
} from "@workspace/db";

// ── CLI ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const dryRun = !apply;
const manifestArg = args.find((x) => x.startsWith("--manifest="));
const manifestPath = manifestArg
  ? manifestArg.slice("--manifest=".length)
  : "./data/design-import.json";

console.log(`[import-design] mode=${dryRun ? "DRY-RUN" : "APPLY"} manifest=${manifestPath}`);

// ── Manifest types ───────────────────────────────────────────────────────────

interface ImportContent {
  h1: string;
  seoTitle: string;
  seoDescription: string;
  description: string;
  materials: DesignMaterial[];
  estimate: DesignEstimateItem[];
  solutions: DesignSolution[];
  colorPalette: DesignColorSwatch[];
}

interface ImportProject {
  /** Локальный путь к файлу инфографики (jpg/png), относительно scripts/. */
  image: string;
  room: string; // bedroom | kitchen | bathroom | living_room | hallway | nursery | apartment
  style: string; // japandi | modern | scandinavian | loft | minimalism | neoclassic | classic
  citySlug: string; // krasnodar | rostov-na-donu | stavropol | volgograd | ...
  district: string;
  area: number; // м²
  budget: number; // ₽
  durationWeeks: number;
  content: ImportContent;
}

interface Manifest {
  projects: ImportProject[];
}

// ── R2 upload ────────────────────────────────────────────────────────────────

function getS3(): S3Client {
  const endpoint = process.env["R2_ENDPOINT"];
  const accessKeyId = process.env["R2_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 not configured (R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY).");
  }
  return new S3Client({
    endpoint,
    region: process.env["R2_REGION"] || "auto",
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

function contentTypeFor(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

/** Загружает буфер в R2 и возвращает публичный URL (как uploadJpegToR2 воркера). */
async function uploadToR2(
  s3: S3Client,
  keyInBucket: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const bucket = process.env["R2_BUCKET_NAME"] || process.env["DEFAULT_OBJECT_STORAGE_BUCKET_ID"];
  if (!bucket) throw new Error("R2_BUCKET_NAME / DEFAULT_OBJECT_STORAGE_BUCKET_ID not set.");
  await s3.send(
    new PutObjectCommand({ Bucket: bucket, Key: keyInBucket, Body: buffer, ContentType: contentType }),
  );
  const base = (process.env["R2_PUBLIC_URL"] || "").replace(/\/+$/, "");
  if (base) return `${base}/${keyInBucket}`;
  return "/api/marketplace/dizajn/img/" + keyInBucket.replace(/^dizajn\//, "");
}

// ── City resolution (как в seed-ai-designs) ─────────────────────────────────

const CITY_DATA: Record<string, { name: string; nameIn: string; region: string }> = {
  "krasnodar": { name: "Краснодар", nameIn: "в Краснодаре", region: "Краснодарский край" },
  "rostov-na-donu": { name: "Ростов-на-Дону", nameIn: "в Ростове-на-Дону", region: "Ростовская область" },
  "stavropol": { name: "Ставрополь", nameIn: "в Ставрополе", region: "Ставропольский край" },
  "volgograd": { name: "Волгоград", nameIn: "в Волгограде", region: "Волгоградская область" },
};

async function ensureCities(slugs: Set<string>): Promise<Map<string, number>> {
  const existing = await db
    .select({ id: citiesTable.id, slug: citiesTable.slug, name: citiesTable.name })
    .from(citiesTable);
  const slugToId = new Map<string, number>();
  for (const c of existing) if (c.slug) slugToId.set(c.slug, c.id);

  if (!dryRun) {
    await pool.query(
      "SELECT setval(pg_get_serial_sequence('cities', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM cities), 0), 1))",
    );
  }

  for (const slug of slugs) {
    if (slugToId.has(slug)) continue;
    const meta = CITY_DATA[slug];
    if (!meta) {
      console.warn(`[import-design] Unknown city slug: ${slug} — pass an existing slug or add it to CITY_DATA`);
      continue;
    }
    if (dryRun) {
      console.log(`  [dry-run] would upsert city: ${slug} (${meta.name})`);
      slugToId.set(slug, -1);
      continue;
    }
    const byName = existing.find((c) => c.name === meta.name);
    if (byName) {
      await pool.query("UPDATE cities SET slug = $1, name_in = $2, region = $3 WHERE id = $4", [
        slug, meta.nameIn, meta.region, byName.id,
      ]);
      slugToId.set(slug, byName.id);
    } else {
      const [created] = await db
        .insert(citiesTable)
        .values({ name: meta.name, slug, nameIn: meta.nameIn, region: meta.region, timezone: "Europe/Moscow", isActive: true })
        .returning({ id: citiesTable.id });
      if (created) slugToId.set(slug, created.id);
    }
  }
  return slugToId;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function buildSlug(p: ImportProject, suffix: string): string {
  return `${p.room.replace(/_/g, "-")}-${p.style}-${suffix}`;
}

async function main() {
  const raw = await readFile(resolve(manifestPath), "utf-8");
  const manifest = JSON.parse(raw) as Manifest;
  const projects = manifest.projects ?? [];
  console.log(`[import-design] Plan: ${projects.length} projects`);

  if (projects.length === 0) {
    console.log("[import-design] Empty manifest — nothing to do.");
    return;
  }

  if (dryRun) {
    for (const p of projects.slice(0, 5)) {
      console.log(`  [dry-run] ${p.room}/${p.style} ${p.area}м² ${p.budget}₽ — ${p.district}, ${p.citySlug} — img=${p.image}`);
      console.log(`            h1="${p.content.h1}" materials=${p.content.materials.length} estimate=${p.content.estimate.length} solutions=${p.content.solutions.length}`);
    }
    console.log("\n[import-design] DRY RUN — re-run with --apply to upload images + insert pages.");
    return;
  }

  const cityMap = await ensureCities(new Set(projects.map((p) => p.citySlug)));
  const s3 = getS3();

  let ok = 0;
  let fail = 0;
  for (const p of projects) {
    const cityId = cityMap.get(p.citySlug) ?? null;
    if (cityId === null || cityId === -1) {
      console.warn(`  ✗ ${p.room}/${p.style}: city ${p.citySlug} not resolved — skipping`);
      fail++;
      continue;
    }
    const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
    const slug = buildSlug(p, suffix);
    try {
      const buf = await readFile(resolve(p.image));
      const ct = contentTypeFor(p.image);
      const ext = ct === "image/png" ? "png" : ct === "image/webp" ? "webp" : "jpg";
      const key = `dizajn/results/import_${slug}_infographic.${ext}`;
      const url = await uploadToR2(s3, key, buf, ct);

      // Один артефакт-изображение = большая инфографика во всю ширину (ROW1
      // с одним view рендерится адаптивно после фикса §A).
      const views: DesignView[] = [{ url, label: "Дизайн-проект", position: 1 }];

      await db.insert(designsTable).values({
        slug,
        anonId: null, // editorial Showcase_Project — без владельца, всегда публичный
        roomType: p.room,
        style: p.style,
        cityId,
        district: p.district,
        area: p.area.toString(),
        budget: p.budget,
        durationWeeks: p.durationWeeks,
        inputImageUrl: null,
        views,
        detailCrops: [],
        resultImageUrl: url, // карточка в каталоге / og-image
        topDownPlanUrl: null,
        h1: p.content.h1,
        seoTitle: p.content.seoTitle,
        seoDescription: p.content.seoDescription,
        description: p.content.description,
        materials: p.content.materials,
        estimate: p.content.estimate,
        solutions: p.content.solutions,
        colorPalette: p.content.colorPalette,
        status: "completed",
        progress: 100,
        currentStep: null,
        errorMessage: null,
        isPublic: true,
        publicConsentAt: new Date(),
      });
      ok++;
      console.log(`  ✓ /dizajn/${slug}`);
    } catch (e) {
      fail++;
      console.error(`  ✗ ${p.room}/${p.style}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\n[import-design] Done. ok=${ok} fail=${fail}.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[import-design] fatal:", e);
    process.exit(1);
  });
