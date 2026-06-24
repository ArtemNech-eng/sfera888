/**
 * AI-дизайнер интерьера — public marketplace endpoints (план §22).
 *
 * Mount:  `/api/marketplace/dizajn/*`
 *
 * Endpoints:
 *   POST /generate          — JSON-форма {roomType, style, widthCm, lengthCm,
 *                             heightCm, budget, features?, cityId?,
 *                             cf-turnstile-response} → 202 {slug}
 *   GET  /:slug             — статус + полная инфа дизайн-проекта (для polling)
 *   GET  /                  — recent successful designs (для homepage feed)
 *
 * Async-flow: POST возвращает 202 + {slug,status='generating'} мгновенно.
 * Background worker (designWorker.ts) обрабатывает pending очередь, через
 * 10-30 секунд переводит в 'completed'. Клиент пуллит GET /:slug каждые 2s.
 */

import { Router, type Request, type Response } from "express";
import { Readable } from "stream";
import {
  db,
  designsTable,
  designImagesTable,
  citiesTable,
  userSavesTable,
  leadsTable,
} from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "../lib/objectStorage.js";
import { verifyTurnstileToken } from "../lib/turnstile.js";
import {
  checkAndIncrement,
  decrement,
  type RateLimitKind,
} from "../lib/designRateLimit.js";
import {
  validateDesignForm,
  type DesignFormViolation,
} from "../lib/dizajnFormSchema.js";
import { checkMinArea } from "../lib/geometricValidator.js";
import { getOrRenderPdf, PdfRenderError } from "../lib/pdfRenderer.js";
import { pickUniqueSlug } from "../lib/slug.js";

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Whitelist of room/style strings used by GET / and GET /:slug — sourced from
// the historical handler. POST /generate now relies on Zod (`validateDesignForm`)
// instead of these sets, so they are kept here for the read-only endpoints only.
const VALID_ROOMS = new Set([
  "bathroom",
  "kitchen",
  "living_room",
  "bedroom",
  "hallway",
  "apartment",
  "nursery",
]);
const VALID_STYLES = new Set([
  "modern",
  "scandinavian",
  "loft",
  "minimalism",
  "neoclassic",
  "japandi",
  "classic",
]);

// ── helpers ─────────────────────────────────────────────────────────────────

function getClientIp(req: Request): string | null {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0]!.trim();
  }
  return req.socket.remoteAddress ?? null;
}

/** Бёзопасно вытащить токен капчи из тела запроса. Cloudflare Turnstile widget
 *  по соглашению присылает `cf-turnstile-response`; для удобства тестов и
 *  программного клиента также принимаем `turnstileToken`. */
function extractTurnstileToken(body: unknown): string {
  if (typeof body !== "object" || body === null) return "";
  const b = body as Record<string, unknown>;
  const cf = b["cf-turnstile-response"];
  if (typeof cf === "string" && cf.length > 0) return cf;
  const fallback = b["turnstileToken"];
  if (typeof fallback === "string" && fallback.length > 0) return fallback;
  return "";
}

/**
 * Откатить инкрементированные на этом запросе счётчики rate-limiter'а.
 *
 * Используется при неуспехах валидации формы и pre-flight `checkMinArea`
 * (Requirement 3.6). Намеренно НЕ вызывается при последующих сбоях в воркере
 * по `Cost_Ceiling` (Requirement 3.7) — это происходит уже в `Design_Worker`,
 * не в HTTP-обработчике.
 *
 * Принимает массив пар `(kind, key)`, инкрементированных в текущем запросе.
 * Идемпотентна: повторный вызов на нулевом счётчике — no-op.
 */
async function rollbackRateLimits(
  pairs: ReadonlyArray<readonly [RateLimitKind, string]>,
): Promise<void> {
  for (const [kind, key] of pairs) {
    try {
      await decrement(kind, key);
    } catch (e) {
      // Откат — best-effort; логируем, не падаем — пользователю и так уже
      // отдают 400, второстепенные ошибки только зашумят ответ.
      console.error("[dizajn/generate] decrement failed:", kind, e instanceof Error ? e.message : e);
    }
  }
}

// ── POST /generate ──────────────────────────────────────────────────────────
//
// Порядок проверок зафиксирован в `design.md` секция Rate_Limiter
// (Requirements 1.8, 1.9, 1.10, 2.3, 3.1, 3.2, 3.5, 3.6, 3.7, 4.1):
//
//   1. `req.anonId` (заполняется `anonIdMiddleware`, см. app.ts).
//   2. `verifyTurnstileToken(...)` — fail → 400 `invalid_captcha`.
//   3. `checkAndIncrement("anon", anonId)` и `checkAndIncrement("ip", ip)` —
//      fail хотя бы один → 429 `rate_limited` (с откатом другого, если уже
//      прошёл успешно).
//   4. Zod-валидация формы (`validateDesignForm`) — fail → 400 + `decrement`
//      обоих счётчиков.
//   5. `checkMinArea(roomType, widthCm, lengthCm)` — fail → 400 + `decrement`
//      обоих.
//   6. `pickUniqueSlug({ roomType, style })`.
//   7. `INSERT INTO designs (..., status='generating', progress=0,
//      anon_id = req.anonId)`.
//   8. 202 `{ ok: true, design: { slug } }` — фронт делает `router.push`
//      на `/dizajn/${slug}`.

router.post("/generate", async (req: Request, res: Response) => {
  // 1. Anon_Id из middleware. Это инвариант: middleware всегда устанавливает
  // req.anonId (либо из cookie, либо свежий UUID + Set-Cookie). Безопасно
  // полагаемся на типы; если поле всё же пустое — отдаём 500, потому что
  // продолжать без owner'а нельзя (Requirement 4.1).
  const anonId = req.anonId;
  if (typeof anonId !== "string" || !UUID_RE.test(anonId)) {
    console.error("[dizajn/generate] req.anonId missing — anonIdMiddleware not mounted?");
    res.status(500).json({ ok: false, error: "anon_id_unavailable" });
    return;
  }

  const clientIp = getClientIp(req);
  // Если IP не удалось получить (тестовый соккет, прокси без XFF) — используем
  // запасной ключ "unknown". Это вырождает IP-лимит для подобных запросов
  // в общий бакет, что приемлемо для anti-abuse: производственный фронт
  // всегда идёт через прокси с проброшенным XFF.
  const ipKey = clientIp ?? "unknown";

  // 2. Captcha verify — ПЕРВАЯ блокирующая проверка перед любыми внутренними
  // вызовами (Requirement 3.2 / Property 4). Никаких rate-limit/Zod/min-area
  // быть не должно до успешного `verifyTurnstileToken`.
  const turnstileToken = extractTurnstileToken(req.body);
  const captcha = await verifyTurnstileToken({
    token: turnstileToken,
    remoteIp: clientIp,
    expectedAction: "ai_design_submit",
  });
  if (!captcha.success) {
    res.status(400).json({ ok: false, error: "invalid_captcha" });
    return;
  }

  // 3. Rate-limit — anon, потом ip. Если anon уже за лимитом, ip даже не
  // трогаем (Property 2: «ни одна новая запись не появляется»). Если anon
  // прошёл, а ip упал — откатываем anon, чтобы не «расходовать» слот зря
  // (Requirement 3.5).
  const incremented: Array<readonly [RateLimitKind, string]> = [];

  const anonResult = await checkAndIncrement("anon", anonId);
  if (!anonResult.allowed) {
    res.status(429).json({
      ok: false,
      error: "rate_limited",
      retryAfterSeconds: anonResult.retryAfterSeconds,
      kind: "anon",
    });
    return;
  }
  incremented.push(["anon", anonId]);

  const ipResult = await checkAndIncrement("ip", ipKey);
  if (!ipResult.allowed) {
    await rollbackRateLimits(incremented);
    res.status(429).json({
      ok: false,
      error: "rate_limited",
      retryAfterSeconds: ipResult.retryAfterSeconds,
      kind: "ip",
    });
    return;
  }
  incremented.push(["ip", ipKey]);

  // 4. Zod-валидация формы. При нарушениях возвращаем ВСЕ violations
  // (Requirement 1.10) и откатываем оба счётчика (Requirement 3.6).
  const validation = validateDesignForm(req.body);
  if (!validation.ok) {
    await rollbackRateLimits(incremented);
    const violations: DesignFormViolation[] = validation.violations;
    res.status(400).json({
      ok: false,
      error: "validation_error",
      violations,
    });
    return;
  }
  const form = validation.data;

  // 5. Pre-flight площадь (Requirement 2.3). Откатываем счётчики при отказе.
  const minArea = checkMinArea(form.roomType, form.widthCm, form.lengthCm);
  if (!minArea.ok) {
    await rollbackRateLimits(incremented);
    res.status(400).json({
      ok: false,
      error: "room_too_small",
      roomType: form.roomType,
      areaSqm: Number(minArea.areaSqm.toFixed(2)),
      minSqm: minArea.minSqm,
      message:
        `Площадь ${minArea.areaSqm.toFixed(2)} м² меньше минимально допустимой ` +
        `${minArea.minSqm} м² для типа «${form.roomType}». Увеличьте размеры комнаты.`,
    });
    return;
  }

  // 6. Уникальный slug под `designs.slug` (Requirements 1.8, 1.9). Сама функция
  // делает SELECT по `designs.slug` и пытается суффиксировать `-2`, `-3`, ...
  // Объектный overload `pickUniqueSlug({ roomType, style })` гарантирует regex
  // `^[a-z0-9-]+$` и длину ≤ 160.
  let slug: string;
  try {
    slug = await pickUniqueSlug({
      roomType: form.roomType,
      style: form.style,
    });
  } catch (e) {
    // Если slug-поиск исчерпал maxAttempts (что чрезвычайно маловероятно)
    // или упал по DB — это серверная ошибка. На rate-limit она не возвращается:
    // пользователь сделал всё корректно, винить его не за что (Requirement 3.6
    // про «отказы по валидации», а не серверные сбои).
    const errMessage = e instanceof Error ? e.message : String(e);
    console.error("[dizajn/generate] slug pick failed:", errMessage);
    res.status(500).json({
      ok: false,
      error: "internal_error",
      message: errMessage.slice(0, 500),
    });
    return;
  }

  // 7. INSERT designs row. `area` хранится как numeric(10,2) в м² — считаем
  // из cm² по той же формуле, что и в `routes/admin/dizajnShowcase.ts`.
  // Width/length/height сохраняются в `layout_json` после генерации воркером;
  // на момент INSERT они известны только из формы и в текущей схеме отдельных
  // колонок не имеют.
  const areaSqm = (form.widthCm * form.lengthCm) / 10_000;
  const areaStr = areaSqm.toFixed(2);

  try {
    const [created] = await db
      .insert(designsTable)
      .values({
        slug,
        // Requirement 4.1: запись принадлежит текущему `kiro_anon_id`.
        anonId,
        roomType: form.roomType,
        style: form.style,
        cityId: form.cityId ?? null,
        area: areaStr,
        budget: form.budget,
        // Requirement 5.2: пайплайн начинает с status='generating', progress=0.
        status: "generating",
        progress: 0,
        currentStep: null,
      })
      .returning({ id: designsTable.id, slug: designsTable.slug });

    if (!created) {
      // Сюда мы попадаем только если drizzle вернул 0 строк — теоретически
      // невозможно для INSERT без конфликта; это серверная ошибка, decrement
      // не нужен (Requirement 3.7: бюджет/AI-вызовы тут ещё не были потрачены,
      // но и пользовательской вины нет).
      res.status(500).json({ ok: false, error: "insert_failed" });
      return;
    }

    // 8. 202 + slug — клиент делает `router.push('/dizajn/' + slug)`.
    res.status(202).json({
      ok: true,
      design: { slug: created.slug },
    });
  } catch (e) {
    const errMessage = e instanceof Error ? e.message : String(e);
    console.error("[dizajn/generate]", errMessage, e);
    res.status(500).json({
      ok: false,
      error: "internal_error",
      message: errMessage.slice(0, 500),
    });
  }
});

// ── GET /mine — список дизайнов текущего Anon_Id ───────────────────────────
//
// Requirements 4.3, 4.7: эндпоинт для страницы «мои дизайны». Фильтр по
// `designs.anon_id = req.anonId`, сортировка `created_at DESC`, лимит 50,
// поля строго ограничены безопасным набором (без layout_json, materials,
// estimate, picked_furniture и прочих heavy-payload колонок — они нужны
// только на странице конкретного проекта).
//
// ВАЖНО: маршрут зарегистрирован ДО `GET /:slug`, иначе express подхватил бы
// `/mine` параметром `:slug` и до этого хендлера запрос бы не дошёл.

router.get("/mine", async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");

  // anonIdMiddleware (см. middlewares/anonIdMiddleware.ts) обязан выставить
  // `req.anonId`. Если поле отсутствует — middleware не подключён, это
  // серверная ошибка, а не пустой результат.
  const anonId = req.anonId;
  if (typeof anonId !== "string" || !UUID_RE.test(anonId)) {
    console.error("[dizajn/mine] req.anonId missing — anonIdMiddleware not mounted?");
    res.status(500).json({ ok: false, error: "anon_id_unavailable" });
    return;
  }

  try {
    const rows = await db
      .select({
        slug: designsTable.slug,
        roomType: designsTable.roomType,
        style: designsTable.style,
        status: designsTable.status,
        progress: designsTable.progress,
        resultImageUrl: designsTable.resultImageUrl,
        createdAt: designsTable.createdAt,
      })
      .from(designsTable)
      .where(eq(designsTable.anonId, anonId))
      .orderBy(desc(designsTable.createdAt))
      .limit(50);

    res.json({ ok: true, items: rows });
  } catch (e) {
    console.error("[dizajn/mine]", e instanceof Error ? e.message : e);
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
  const anonIdParam = typeof req.query.anonId === "string" && UUID_RE.test(req.query.anonId) ? req.query.anonId : null;

  try {
    const [row] = await db
      .select({
        design: designsTable,
        city: { name: citiesTable.name, slug: citiesTable.slug, nameIn: citiesTable.nameIn },
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

    // Resolve isSavedByCurrentUser if anonId provided.
    let isSavedByCurrentUser = false;
    if (anonIdParam && row.design.status === "completed") {
      const [save] = await db
        .select({ id: userSavesTable.id })
        .from(userSavesTable)
        .where(
          and(
            eq(userSavesTable.anonId, anonIdParam),
            eq(userSavesTable.aiDesignId, row.design.id),
          ),
        )
        .limit(1);
      isSavedByCurrentUser = !!save;
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
    // R2-key → public URL helper (uploads / before / results / crops).
    const r2KeyToPublicUrl = (key: string | null): string | null => {
      if (!key) return null;
      if (key.startsWith("/")) return key; // уже internal URL (legacy)
      if (key.startsWith("http")) return key; // external URL — оставляем
      return "/api/marketplace/dizajn/img/" + key.replace(/^dizajn\//, "");
    };

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
        cityNameIn: row.city?.nameIn ?? null,
        district: row.design.district,
        h1: row.design.h1,
        seoTitle: row.design.seoTitle,
        seoDescription: row.design.seoDescription,
        description: row.design.description,
        materials: row.design.materials,
        estimate: row.design.estimate,
        solutions: row.design.solutions,
        colorPalette: row.design.colorPalette,
        resultImageUrl: row.design.resultImageUrl,
        inputImageUrl: r2KeyToPublicUrl(row.design.inputImageUrl),
        views: row.design.views,
        detailCrops: row.design.detailCrops,
        images: images.map((img) => ({
          type: img.type,
          url: img.url,
          width: img.width,
          height: img.height,
          sortOrder: img.sortOrder,
        })),
        // Программный 2D-план + подобранная мебель + текущий шаг
        // пайплайна — нужны странице дизайна для отрисовки соответствующих
        // секций (Requirements 8.6/8.7, 10.6/10.7, 5.2/5.4) и owner-бейджа
        // (Requirement 4.4). `designAnonId` — это `anon_id` владельца,
        // фронт сравнивает его с cookie `kiro_anon_id` на клиенте.
        topDownPlanUrl: r2KeyToPublicUrl(row.design.topDownPlanUrl),
        pickedFurniture: row.design.pickedFurniture,
        currentStep: row.design.currentStep,
        designAnonId: row.design.anonId,
        viewCount: row.design.viewCount,
        saveCount: row.design.saveCount,
        isSavedByCurrentUser,
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

// ── GET /:slug/status — лёгкий polling без heavy joins ─────────────────────
//
// Requirements 5.3, 5.4, 5.5, 5.6: фронт-end опрашивает каждые 3 секунды,
// пока `status=generating`. Возвращаем только то, что нужно для UI
// прогресс-бара: текущий статус, прогресс 0..100, имя текущего шага и
// `errorMessage` для экрана ошибки. Никаких JOIN'ов, изображений и
// counter-апдейтов — это «горячая» точка, которая должна быть максимально
// дешёвой по latency и DB-нагрузке.

router.get("/:slug/status", async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  const slug = typeof req.params.slug === "string" ? req.params.slug : "";
  if (!slug) {
    res.status(404).json({ ok: false, error: "not_found" });
    return;
  }

  try {
    const [row] = await db
      .select({
        status: designsTable.status,
        progress: designsTable.progress,
        currentStep: designsTable.currentStep,
        errorMessage: designsTable.errorMessage,
      })
      .from(designsTable)
      .where(eq(designsTable.slug, slug))
      .limit(1);

    if (!row) {
      res.status(404).json({ ok: false, error: "not_found" });
      return;
    }

    res.json({
      ok: true,
      status: row.status,
      progress: row.progress,
      currentStep: row.currentStep,
      errorMessage: row.errorMessage,
    });
  } catch (e) {
    console.error("[dizajn/:slug/status]", e instanceof Error ? e.message : e);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// ── GET /:slug/pdf — синхронный рендер/выдача PDF ──────────────────────────
//
// Requirements 13.1, 13.2, 13.5, 13.6: lazy-render с кэшем в R2.
// `getOrRenderPdf(designId)`:
//   - возвращает кэшированный буфер из `dizajn/pdf/{designId}.pdf`, если уже есть;
//   - иначе берёт soft-lock через `designs.pdf_rendering_at`, рендерит,
//     грузит в R2 и снимает lock.
//
// Соответствие Requirement 13.6: при любой ошибке рендера фронт получает
// `503 { error: "pdf_temporarily_unavailable" }` и показывает на месте
// кнопки сообщение «PDF временно недоступен», не блокируя просмотр страницы.

router.get("/:slug/pdf", async (req: Request, res: Response) => {
  const slug = typeof req.params.slug === "string" ? req.params.slug : "";
  if (!slug) {
    res.status(404).json({ ok: false, error: "not_found" });
    return;
  }

  try {
    const [row] = await db
      .select({ id: designsTable.id })
      .from(designsTable)
      .where(eq(designsTable.slug, slug))
      .limit(1);

    if (!row) {
      res.status(404).json({ ok: false, error: "not_found" });
      return;
    }

    let buffer: Buffer;
    try {
      buffer = await getOrRenderPdf(row.id);
    } catch (e) {
      // PdfRenderError — ожидаемый класс ошибок: проблема рендера, soft-lock,
      // отсутствующие зависимости и т.п. Отдаём 503, чтобы фронт показал
      // пометку «временно недоступен» (Requirement 13.6) — без 5xx-стектрейса
      // в логах мониторинга.
      if (e instanceof PdfRenderError) {
        console.warn(
          "[dizajn/:slug/pdf] render failed:",
          e.message,
          e.cause instanceof Error ? e.cause.message : e.cause,
        );
        res.status(503).json({ ok: false, error: "pdf_temporarily_unavailable" });
        return;
      }
      throw e;
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="design-${slug}.pdf"`);
    res.setHeader("Content-Length", String(buffer.length));
    res.end(buffer);
  } catch (e) {
    console.error("[dizajn/:slug/pdf]", e instanceof Error ? e.message : e);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// ── GET / (recent feed) ─────────────────────────────────────────────────────

router.get("/", async (req: Request, res: Response) => {
  const limitRaw = parseInt(String(req.query.limit ?? "12"), 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 1000) : 12;
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

// ── POST /:slug/save — toggle save (anon-id) ───────────────────────────────
//
// Mirror /raboty/:slug/save logic (marketplace.ts). Polymorphic user_saves
// разруливает target_type через ai_design_id колонку.

const PG_UNIQUE_VIOLATION = "23505";

router.post("/:slug/save", async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  const slug = typeof req.params.slug === "string" ? req.params.slug : "";
  if (!slug) {
    res.status(404).json({ ok: false, error: "not_found" });
    return;
  }

  const bodyAnonId = (req.body as { anonId?: unknown })?.anonId;
  if (typeof bodyAnonId !== "string" || !UUID_RE.test(bodyAnonId)) {
    res.status(400).json({ ok: false, error: "missing_anon_id" });
    return;
  }
  const anonId = bodyAnonId;

  try {
    const [design] = await db
      .select({ id: designsTable.id })
      .from(designsTable)
      .where(
        and(
          eq(designsTable.slug, slug),
          eq(designsTable.isPublic, true),
          eq(designsTable.status, "completed"),
        ),
      )
      .limit(1);
    if (!design) {
      res.status(404).json({ ok: false, error: "not_found" });
      return;
    }

    const result = await db.transaction(async (tx): Promise<{ saved: boolean; count: number }> => {
      try {
        await tx.insert(userSavesTable).values({ anonId, aiDesignId: design.id });
        const [updated] = await tx
          .update(designsTable)
          .set({ saveCount: sql`${designsTable.saveCount} + 1` })
          .where(eq(designsTable.id, design.id))
          .returning({ count: designsTable.saveCount });
        return { saved: true, count: Number(updated?.count ?? 0) };
      } catch (err: unknown) {
        const code = (err as { code?: string } | null)?.code;
        if (code !== PG_UNIQUE_VIOLATION) throw err;
        await tx
          .delete(userSavesTable)
          .where(
            and(
              eq(userSavesTable.anonId, anonId),
              eq(userSavesTable.aiDesignId, design.id),
            ),
          );
        const [updated] = await tx
          .update(designsTable)
          .set({ saveCount: sql`GREATEST(${designsTable.saveCount} - 1, 0)` })
          .where(eq(designsTable.id, design.id))
          .returning({ count: designsTable.saveCount });
        return { saved: false, count: Number(updated?.count ?? 0) };
      }
    });

    res.json({ ok: true, ...result });
  } catch (e: unknown) {
    console.error("[dizajn/:slug/save]", e instanceof Error ? e.message : e);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// ── POST /:slug/lead — create lead with prefill from design ────────────────
//
// «Хочу такой же» CTA на странице дизайна. Создаёт лид связанный с
// `designs.lead_id` для будущей аналитики conversion.

router.post("/:slug/lead", async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  const slug = typeof req.params.slug === "string" ? req.params.slug : "";
  if (!slug) {
    res.status(404).json({ ok: false, error: "not_found" });
    return;
  }

  const body = req.body as {
    clientName?: string;
    clientPhone?: string;
    comment?: string;
  };
  const clientName = (body.clientName ?? "").trim();
  const clientPhone = (body.clientPhone ?? "").trim();
  const comment = (body.comment ?? "").trim();

  if (clientName.length < 2 || clientPhone.length < 10) {
    res.status(400).json({ ok: false, error: "validation_error" });
    return;
  }

  try {
    // 1. Resolve design.
    const [row] = await db
      .select({
        design: designsTable,
        city: { name: citiesTable.name, slug: citiesTable.slug },
      })
      .from(designsTable)
      .leftJoin(citiesTable, eq(designsTable.cityId, citiesTable.id))
      .where(
        and(
          eq(designsTable.slug, slug),
          eq(designsTable.isPublic, true),
          eq(designsTable.status, "completed"),
        ),
      )
      .limit(1);
    if (!row) {
      res.status(404).json({ ok: false, error: "not_found" });
      return;
    }

    // 2. Build lead context.
    const designUrl = `/dizajn/${slug}`;
    const styleLabel = STYLE_LABELS_RU[row.design.style] ?? row.design.style;
    const roomLabel = ROOM_LABELS_RU[row.design.roomType] ?? row.design.roomType;
    const fullComment = [
      `AI-дизайн: ${row.design.h1 ?? `${roomLabel} в стиле ${styleLabel}`}`,
      `URL: ${designUrl}`,
      comment ? `Комментарий клиента: ${comment}` : null,
    ]
      .filter((x): x is string => Boolean(x))
      .join("\n");

    // 3. Insert lead. Reuse existing schema fields.
    const [lead] = await db
      .insert(leadsTable)
      .values({
        clientName,
        clientPhone,
        city: row.city?.name ?? "Не указан",
        district: "",
        serviceType: `Дизайн ${roomLabel}`,
        // area NOT NULL — fall back to "0.00" если в дизайне не указана.
        area: row.design.area ?? "0.00",
        comment: fullComment,
        source: "marketplace",
        sourcePageType: "ai_design",
        sourcePageUrl: designUrl,
        citySlug: row.city?.slug ?? null,
        marketplaceContext: { aiDesignSlug: slug } as Record<string, unknown>,
        status: "new",
        designId: row.design.id,
      })
      .returning({ id: leadsTable.id });

    if (!lead) {
      res.status(500).json({ ok: false, error: "insert_failed" });
      return;
    }

    // 4. Link lead back to design (if not yet).
    if (!row.design.leadId) {
      await db
        .update(designsTable)
        .set({ leadId: lead.id, updatedAt: new Date() })
        .where(eq(designsTable.id, row.design.id));
    }

    res.json({ ok: true, leadId: lead.id });
  } catch (e: unknown) {
    console.error("[dizajn/:slug/lead]", e instanceof Error ? e.message : e);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

const ROOM_LABELS_RU: Record<string, string> = {
  bathroom: "ванной",
  kitchen: "кухни",
  living_room: "гостиной",
  bedroom: "спальни",
  hallway: "прихожей",
  apartment: "квартиры",
};

const STYLE_LABELS_RU: Record<string, string> = {
  modern: "современный",
  scandinavian: "скандинавский",
  loft: "лофт",
  minimalism: "минимализм",
  neoclassic: "неоклассика",
  japandi: "японди",
};

// ── GET /img/:type/:filename — stream R2 image (public, cached) ────────────

router.get("/img/:type/:filename", async (req: Request, res: Response) => {
  const type = typeof req.params.type === "string" ? req.params.type : "";
  const filename = typeof req.params.filename === "string" ? req.params.filename : "";
  // Allowlist: uploads (user-photo), results (4 view renders),
  // before (text2img «было» для seed-проектов), crops (6 deталей через sharp),
  // isometric (5-й ракурс — 3D-план через FLUX Pro Ultra).
  if (!["uploads", "results", "before", "crops", "isometric"].includes(type)) {
    res.status(404).json({ ok: false, error: "invalid_type" });
    return;
  }
  if (!/^[a-zA-Z0-9_\-.]+$/.test(filename)) {
    res.status(400).json({ ok: false, error: "invalid_filename" });
    return;
  }
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) {
    res.status(500).json({ ok: false, error: "storage_not_configured" });
    return;
  }
  const key = `dizajn/${type}/${filename}`;

  try {
    const response = await s3Client.send(
      new GetObjectCommand({ Bucket: bucketId, Key: key }),
    );
    res.setHeader("Content-Type", response.ContentType ?? "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    if (response.ContentLength) {
      res.setHeader("Content-Length", String(response.ContentLength));
    }
    if (response.Body) {
      // AWS SDK v3 returns Body as Node Readable in Node.js runtime
      // (IncomingMessage), Web ReadableStream in browser, or Blob. We pipe
      // directly if it's a Node stream; otherwise convert via fromWeb.
      const body = response.Body as unknown;
      if (body && typeof (body as { pipe?: unknown }).pipe === "function") {
        (body as Readable).pipe(res);
      } else if (typeof (body as { getReader?: unknown }).getReader === "function") {
        Readable.fromWeb(body as ReadableStream<Uint8Array>).pipe(res);
      } else if (typeof (body as { transformToByteArray?: unknown }).transformToByteArray === "function") {
        // Smithy SDK stream wrapper — buffer it (small images, OK).
        const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
        res.end(Buffer.from(bytes));
      } else {
        res.end();
      }
    } else {
      res.end();
    }
  } catch (e) {
    console.error("[dizajn/img]", key, e instanceof Error ? e.message : e);
    res.status(404).json({ ok: false, error: "not_found" });
  }
});

export default router;
