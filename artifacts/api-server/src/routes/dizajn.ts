/**
 * AI-дизайнер интерьера — public marketplace endpoints (план §22).
 *
 * Mount:  `/api/marketplace/dizajn/*`
 *
 * Endpoints:
 *   POST /generate          — start генерации (multipart, файл + room/style/...)
 *   GET  /:slug             — статус + полная инфа дизайн-проекта (для polling)
 *   GET  /                  — recent successful designs (для homepage feed)
 *
 * Async-flow: POST возвращает 202 + {slug,status='generating'} мгновенно.
 * Background worker (designWorker.ts) обрабатывает pending очередь, через
 * 10-30 секунд переводит в 'completed'. Клиент пуллит GET /:slug каждые 2s.
 */

import { Router, type Request, type Response } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import {
  db,
  designsTable,
  designImagesTable,
  citiesTable,
} from "@workspace/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { objectStorageClient } from "../lib/objectStorage.js";
import { setObjectAclPolicy } from "../lib/objectAcl.js";
import { preprocessUserUpload } from "../lib/falAi.js";

const router = Router();

const UPLOAD_LIMIT_BYTES = 8 * 1024 * 1024; // 8 MB raw upload
const RATE_LIMIT_PER_ANON_DAY = 5;
const RATE_LIMIT_PER_IP_DAY = 30;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_LIMIT_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Только изображения"));
  },
});

// ── ENUM-валидация ──────────────────────────────────────────────────────────

const VALID_ROOMS = new Set([
  "bathroom",
  "kitchen",
  "living_room",
  "bedroom",
  "hallway",
  "apartment",
]);
const VALID_STYLES = new Set([
  "modern",
  "scandinavian",
  "loft",
  "minimalism",
  "neoclassic",
  "japandi",
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── helpers ─────────────────────────────────────────────────────────────────

function buildSlug(room: string, style: string): string {
  // 8-character random suffix — достаточно для ~40 трлн уникальных slugs.
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
  return `${room.replace(/_/g, "-")}-${style}-${suffix}`;
}

async function checkRateLimit(anonId: string, clientIp: string | null): Promise<{
  ok: true;
} | {
  ok: false;
  reason: "anon_daily" | "ip_daily";
  retryAfterSeconds: number;
}> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // По anon_id (с учётом UTC last 24h).
  const anonRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(designsTable)
    .where(
      and(
        eq(designsTable.anonId, anonId),
        gte(designsTable.createdAt, dayAgo),
      ),
    );
  const anonCount = Number(anonRows[0]?.n ?? 0);
  if (anonCount >= RATE_LIMIT_PER_ANON_DAY) {
    return { ok: false, reason: "anon_daily", retryAfterSeconds: 86400 };
  }

  // По IP (если есть).
  if (clientIp) {
    // designsTable нет ip колонки — используем design_generations таблицу
    // позже. На MVP-старте rate-limit только по anon_id, IP-throttle добавим
    // отдельной миграцией если будет abuse.
    void RATE_LIMIT_PER_IP_DAY; // suppress unused-warning
  }

  return { ok: true };
}

function getClientIp(req: Request): string | null {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0]!.trim();
  }
  return req.socket.remoteAddress ?? null;
}

// ── POST /generate ──────────────────────────────────────────────────────────

router.post("/generate", upload.single("image"), async (req: Request, res: Response) => {
  try {
    // 1. Validate file
    if (!req.file) {
      res.status(400).json({ ok: false, error: "missing_file" });
      return;
    }

    // 2. Validate other fields
    const { room, style, area, citySlug, budget, durationWeeks, anonId: bodyAnonId } = req.body as {
      room?: string;
      style?: string;
      area?: string;
      citySlug?: string;
      budget?: string;
      durationWeeks?: string;
      anonId?: string;
    };

    if (!room || !VALID_ROOMS.has(room)) {
      res.status(400).json({ ok: false, error: "invalid_room" });
      return;
    }
    if (!style || !VALID_STYLES.has(style)) {
      res.status(400).json({ ok: false, error: "invalid_style" });
      return;
    }

    const anonId = bodyAnonId && UUID_RE.test(bodyAnonId) ? bodyAnonId : null;
    if (!anonId) {
      res.status(400).json({ ok: false, error: "missing_anon_id" });
      return;
    }

    const areaNum = area ? parseFloat(area) : null;
    const budgetNum = budget ? parseInt(budget, 10) : null;
    const durationWeeksNum = durationWeeks ? parseInt(durationWeeks, 10) : null;

    // 3. Resolve city if provided
    let cityId: number | null = null;
    if (citySlug && citySlug.length > 0) {
      const [city] = await db
        .select({ id: citiesTable.id })
        .from(citiesTable)
        .where(eq(citiesTable.slug, citySlug))
        .limit(1);
      if (city) cityId = city.id;
    }

    // 4. Rate limit
    const clientIp = getClientIp(req);
    const limit = await checkRateLimit(anonId, clientIp);
    if (!limit.ok) {
      res.status(429).json({
        ok: false,
        error: "rate_limit",
        reason: limit.reason,
        retryAfterSeconds: limit.retryAfterSeconds,
      });
      return;
    }

    // 5. Preprocess user upload
    const processedBuffer = await preprocessUserUpload(req.file.buffer);

    // 6. Upload to R2 (private, anon-scoped). Используем objectStorageClient
    // pattern из master-pwa.ts (DEFAULT_OBJECT_STORAGE_BUCKET_ID + key).
    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    if (!bucketId) {
      res.status(500).json({ ok: false, error: "storage_not_configured" });
      return;
    }
    const inputId = randomUUID();
    const inputKey = `dizajn/uploads/${inputId}.jpg`;
    await objectStorageClient
      .bucket(bucketId)
      .file(inputKey)
      .save(processedBuffer, { contentType: "image/jpeg" });
    // Public-readable так чтобы Fal.ai мог скачать.
    await setObjectAclPolicy(
      { bucketName: bucketId, objectName: inputKey },
      { owner: `anon:${anonId}`, visibility: "public" },
    );

    // URL который Fal.ai будет использовать для скачивания (внешний resolve).
    // Для R2 нужен PUBLIC_URL — ссылка на cloudflare-public домен.
    const r2PublicUrl = process.env.R2_PUBLIC_URL?.replace(/\/+$/, "");
    if (!r2PublicUrl) {
      res.status(500).json({ ok: false, error: "r2_public_url_not_set" });
      return;
    }
    const inputImageFalUrl = `${r2PublicUrl}/${inputKey}`;
    // А для собственного storage (показывать пользователю «фото до» в UI) —
    // через наш storage proxy.
    const inputImageInternalUrl = `/api/storage/objects/dizajn/uploads/${inputId}.jpg`;

    // 7. INSERT designs row
    const slug = buildSlug(room, style);
    const [created] = await db
      .insert(designsTable)
      .values({
        slug,
        anonId,
        roomType: room,
        style,
        cityId,
        area: areaNum != null ? areaNum.toString() : null,
        budget: budgetNum,
        durationWeeks: durationWeeksNum,
        // Сохраняем R2 public URL — worker возьмёт его для Fal.ai.
        // На UI «фото до» рендерится через inputImageInternalUrl (отдельная
        // колонка не нужна, т.к. /api/storage/objects/dizajn/uploads/X.jpg
        // вычисляется по slug+id).
        inputImageUrl: inputImageFalUrl,
        status: "generating",
      })
      .returning({ id: designsTable.id, slug: designsTable.slug });

    if (!created) {
      res.status(500).json({ ok: false, error: "insert_failed" });
      return;
    }

    // Мы используем R2 public URL для Fal-генерации; лог-сохраняем internal
    // URL в design_images type='input', чтобы UI мог отрендерить «до».
    await db.insert(designImagesTable).values({
      designId: created.id,
      type: "input",
      url: inputImageInternalUrl,
      sortOrder: 0,
    });

    res.status(202).json({
      ok: true,
      design: {
        id: created.id,
        slug: created.slug,
        status: "generating",
      },
    });
  } catch (e) {
    console.error("[dizajn/generate]", e);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// ── GET /:slug ──────────────────────────────────────────────────────────────

router.get("/:slug", async (req: Request, res: Response) => {
  const slug = typeof req.params.slug === "string" ? req.params.slug : "";
  if (!slug) {
    res.status(400).json({ ok: false, error: "missing_slug" });
    return;
  }

  try {
    const [row] = await db
      .select({
        design: designsTable,
        city: { name: citiesTable.name, slug: citiesTable.slug },
      })
      .from(designsTable)
      .leftJoin(citiesTable, eq(designsTable.cityId, citiesTable.id))
      .where(eq(designsTable.slug, slug))
      .limit(1);

    if (!row) {
      res.status(404).json({ ok: false, error: "not_found" });
      return;
    }

    const images = await db
      .select()
      .from(designImagesTable)
      .where(eq(designImagesTable.designId, row.design.id))
      .orderBy(designImagesTable.sortOrder);

    // Increment view-count если completed (best-effort, non-blocking).
    if (row.design.status === "completed") {
      void db
        .update(designsTable)
        .set({ viewCount: sql`${designsTable.viewCount} + 1` })
        .where(eq(designsTable.id, row.design.id))
        .catch(() => undefined);
    }

    // Estimate progress на основе времени с createdAt (для UI прогресс-бара).
    const elapsedMs = Date.now() - new Date(row.design.createdAt).getTime();
    const expectedMs = 30000;
    const progress = row.design.status === "generating"
      ? Math.min(95, Math.floor((elapsedMs / expectedMs) * 100))
      : row.design.status === "completed"
        ? 100
        : 0;

    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      design: {
        id: row.design.id,
        slug: row.design.slug,
        status: row.design.status,
        roomType: row.design.roomType,
        style: row.design.style,
        area: row.design.area ? parseFloat(row.design.area) : null,
        budget: row.design.budget,
        durationWeeks: row.design.durationWeeks,
        cityName: row.city?.name ?? null,
        citySlug: row.city?.slug ?? null,
        h1: row.design.h1,
        seoTitle: row.design.seoTitle,
        seoDescription: row.design.seoDescription,
        description: row.design.description,
        materials: row.design.materials,
        estimate: row.design.estimate,
        solutions: row.design.solutions,
        colorPalette: row.design.colorPalette,
        resultImageUrl: row.design.resultImageUrl,
        images: images.map((img) => ({
          type: img.type,
          url: img.url,
          width: img.width,
          height: img.height,
          sortOrder: img.sortOrder,
        })),
        viewCount: row.design.viewCount,
        saveCount: row.design.saveCount,
        progress,
        errorMessage: row.design.errorMessage,
        createdAt: row.design.createdAt,
      },
    });
  } catch (e) {
    console.error("[dizajn/:slug]", e);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// ── GET / (recent feed) ─────────────────────────────────────────────────────

router.get("/", async (req: Request, res: Response) => {
  const limitRaw = parseInt(String(req.query.limit ?? "12"), 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 12;
  const room = typeof req.query.room === "string" ? req.query.room : undefined;
  const style = typeof req.query.style === "string" ? req.query.style : undefined;

  try {
    const conds = [
      eq(designsTable.isPublic, true),
      eq(designsTable.status, "completed"),
    ];
    if (room && VALID_ROOMS.has(room)) conds.push(eq(designsTable.roomType, room));
    if (style && VALID_STYLES.has(style)) conds.push(eq(designsTable.style, style));

    const rows = await db
      .select()
      .from(designsTable)
      .where(and(...conds))
      .orderBy(desc(designsTable.createdAt))
      .limit(limit);

    res.set("Cache-Control", "public, max-age=300, s-maxage=300");
    res.json({
      items: rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        roomType: r.roomType,
        style: r.style,
        h1: r.h1,
        resultImageUrl: r.resultImageUrl,
        viewCount: r.viewCount,
        saveCount: r.saveCount,
      })),
      limit,
    });
  } catch (e) {
    console.error("[dizajn/list]", e);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

export default router;
