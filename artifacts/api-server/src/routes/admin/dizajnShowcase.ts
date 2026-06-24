/**
 * Showcase admin endpoint — `POST /api/admin/dizajn/showcase`.
 *
 * Создание `Showcase_Project` оператором (Requirement 15.4–15.5).
 *
 * Особенности:
 *   • Feature-flag `AI_DESIGN_SHOWCASE_ADMIN_ENABLED` (default `false`).
 *     Любой запрос при выключенном флаге отдаёт 404 — публично эндпоинт
 *     выглядит несуществующим (Requirement 15.5).
 *   • `designs.anon_id = NULL` — отличает Showcase_Project от пользовательских
 *     проектов, созданных через `Design_Form` (Requirement 15.1).
 *   • Опциональные поля `h1`, `seoTitle`, `seoDescription`, `description`,
 *     `materials`, `estimate`, `solutions` подхватываются `hasSeedContent`-
 *     веткой в `designWorker.ts` и не перегенерируются AI_Content_Provider
 *     (Requirement 15.4). Воркер требует одновременного присутствия `h1`,
 *     `description`, и непустых `materials`/`estimate`/`solutions`; передача
 *     части полей не активирует seed-режим, оставшиеся поля сгенерирует AI.
 *   • Статус `generating`, прогресс 0 — `Design_Worker` процессит обе
 *     категории записей одинаково (Requirement 15.2).
 *   • `isPublic = true` по умолчанию — Showcase предназначен для публичной
 *     витрины, и сохранять консент не требуется (это редакторский контент,
 *     а не пользовательский UGC).
 *
 * Авторизация: сессионный `requireRole("admin")` — повторяет паттерн
 * остальных CRM-роутов (`routes/masters.ts`, `routes/finance.ts`, …).
 * Гейт по флагу выполняется до авторизации, чтобы при отключённой фиче
 * 404 возвращался даже для зашедших в CRM пользователей.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import {
  db,
  designsTable,
  citiesTable,
  type DesignMaterial,
  type DesignEstimateItem,
  type DesignSolution,
} from "@workspace/db";
import { requireRole } from "../../middlewares/requireAuth.js";
import { pickUniqueSlug } from "../../lib/slug.js";
import {
  ROOM_TYPES,
  STYLES,
  WIDTH_CM_MIN,
  WIDTH_CM_MAX,
  LENGTH_CM_MIN,
  LENGTH_CM_MAX,
  HEIGHT_CM_MIN,
  HEIGHT_CM_MAX,
  BUDGET_MIN_RUB,
  BUDGET_MAX_RUB,
} from "../../lib/dizajnFormSchema.js";

// ── feature flag ───────────────────────────────────────────────────────────

const SHOWCASE_FLAG_ENV = "AI_DESIGN_SHOWCASE_ADMIN_ENABLED";

function isShowcaseAdminEnabled(): boolean {
  return process.env[SHOWCASE_FLAG_ENV] === "true";
}

/**
 * Гейт по feature-flag. Выполняется **до** аутентификации, чтобы при
 * выключенной фиче эндпоинт был неотличим от несуществующего пути даже
 * для авторизованных пользователей (Requirement 15.5).
 */
function gateByFeatureFlag(req: Request, res: Response, next: NextFunction): void {
  if (!isShowcaseAdminEnabled()) {
    res.status(404).json({ ok: false, error: "not_found" });
    return;
  }
  next();
}

// ── input schema ───────────────────────────────────────────────────────────

const designMaterialSchema: z.ZodType<DesignMaterial> = z.object({
  category: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
});

const designEstimateItemSchema: z.ZodType<DesignEstimateItem> = z.object({
  category: z.string().min(1).max(120),
  amountKopeks: z.number().int().nonnegative(),
});

const designSolutionSchema: z.ZodType<DesignSolution> = z.object({
  text: z.string().min(1).max(500),
});

/**
 * Тело `POST /api/admin/dizajn/showcase`.
 *
 * MVP-гейт по `roomType` (Requirement 1.3) намеренно НЕ применяется: фича
 * редакторской курации остаётся за feature-flag и активируется уже после
 * расширения `Geometric_Validator` и шаблонов `Top_Down_Plan` на остальные
 * типы помещений. Если оператор включит флаг и попытается создать, скажем,
 * `kitchen` — `Design_Worker` обработает запись; шаги, которые поддержаны
 * только для `bedroom`, отдадут placeholder (Requirement 8.5) и не сорвут
 * пайплайн.
 */
const showcaseInputSchema = z.object({
  roomType: z.enum(ROOM_TYPES),
  style: z.enum(STYLES),
  widthCm: z.number().int().min(WIDTH_CM_MIN).max(WIDTH_CM_MAX),
  lengthCm: z.number().int().min(LENGTH_CM_MIN).max(LENGTH_CM_MAX),
  heightCm: z.number().int().min(HEIGHT_CM_MIN).max(HEIGHT_CM_MAX),
  budget: z.number().int().min(BUDGET_MIN_RUB).max(BUDGET_MAX_RUB),
  cityId: z.number().int().positive().optional(),
  district: z.string().min(1).max(100).optional(),
  durationWeeks: z.number().int().min(1).max(104).optional(),
  features: z.array(z.string().min(1).max(64)).max(20).optional(),

  // Seed content — все поля опциональны независимо. Если оператор передаст
  // полный набор `h1` + `description` + непустые `materials`/`estimate`/
  // `solutions`, `hasSeedContent` в `designWorker.ts` вернёт true и AI text
  // gen скипнется. Передача части полей оставит остальные на AI.
  h1: z.string().min(1).max(160).optional(),
  seoTitle: z.string().min(1).max(120).optional(),
  seoDescription: z.string().min(1).max(220).optional(),
  description: z.string().min(1).max(5000).optional(),
  materials: z.array(designMaterialSchema).min(1).max(20).optional(),
  estimate: z.array(designEstimateItemSchema).min(1).max(20).optional(),
  solutions: z.array(designSolutionSchema).min(1).max(20).optional(),

  // По умолчанию showcase публичен — это редакторский контент для витрины.
  // Оператор может скрыть позже (отдельный эндпоинт за рамками этой задачи).
  isPublic: z.boolean().optional(),
});

type ShowcaseInput = z.infer<typeof showcaseInputSchema>;

// ── router ─────────────────────────────────────────────────────────────────

const router = Router();

router.post(
  "/showcase",
  gateByFeatureFlag,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const parsed = showcaseInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: "validation_error",
        violations: parsed.error.issues.map((issue) => ({
          path: issue.path.map((segment) => String(segment)).join("."),
          code: issue.code,
          message: issue.message,
        })),
      });
      return;
    }
    const body: ShowcaseInput = parsed.data;

    // Проверяем `cityId` явно, чтобы дать читаемую 400, а не падать на FK
    // в момент INSERT с непрозрачной 500.
    if (body.cityId !== undefined) {
      const [city] = await db
        .select({ id: citiesTable.id })
        .from(citiesTable)
        .where(eq(citiesTable.id, body.cityId))
        .limit(1);
      if (!city) {
        res.status(400).json({ ok: false, error: "invalid_city_id" });
        return;
      }
    }

    // designs.area хранится как numeric(10,2) в м². Считаем из cm².
    const areaSqm = (body.widthCm * body.lengthCm) / 10_000;
    const areaStr = areaSqm.toFixed(2);
    const isPublic = body.isPublic ?? true;

    try {
      const slug = await pickUniqueSlug({
        roomType: body.roomType,
        style: body.style,
      });

      const [created] = await db
        .insert(designsTable)
        .values({
          slug,
          // Requirement 15.1: Showcase_Project отличается от пользовательского
          // через `anon_id IS NULL`.
          anonId: null,
          roomType: body.roomType,
          style: body.style,
          cityId: body.cityId ?? null,
          district: body.district ?? null,
          area: areaStr,
          budget: body.budget,
          durationWeeks: body.durationWeeks ?? null,
          // Showcase идёт на публичную витрину сразу — иначе оператор не сможет
          // сравнить финальный рендер с тем, что увидит посетитель.
          isPublic,
          publicConsentAt: isPublic ? new Date() : null,
          // Optional seed content. Воркер сам решит, заполнять ли AI-текстом
          // (см. `hasSeedContent` в `designWorker.ts`).
          h1: body.h1 ?? null,
          seoTitle: body.seoTitle ?? null,
          seoDescription: body.seoDescription ?? null,
          description: body.description ?? null,
          materials: body.materials ?? null,
          estimate: body.estimate ?? null,
          solutions: body.solutions ?? null,
          // Requirement 15.2: воркер процессит обе категории одинаково.
          status: "generating",
          progress: 0,
          currentStep: null,
        })
        .returning({ id: designsTable.id, slug: designsTable.slug });

      if (!created) {
        res.status(500).json({ ok: false, error: "insert_failed" });
        return;
      }

      res.status(202).json({
        ok: true,
        design: {
          id: created.id,
          slug: created.slug,
          status: "generating",
        },
      });
    } catch (e) {
      const errMessage = e instanceof Error ? e.message : String(e);
      console.error("[admin/dizajn/showcase]", errMessage, e);
      res.status(500).json({
        ok: false,
        error: "internal_error",
        message: errMessage.slice(0, 500),
      });
    }
  },
);

export default router;
