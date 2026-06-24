# Implementation Plan: AI_Design_Product

## Overview

Реализация выполняется на TypeScript в существующей кодовой базе `artifacts/api-server` (Express + Drizzle + Postgres) и `artifacts/marketplace` (Next.js). Тестовый стэк — Vitest + `fast-check` для property-based тестов. Каждая задача ссылается на конкретные пункты `requirements.md` и (где применимо) на номер свойства из секции `Correctness Properties` в `design.md`.

Стратегия — расширение, не переписывание: существующие модули (`falAi.ts`, `designContent.ts`, `infographicComposer.ts`, `colorExtraction.ts`, `objectStorage.ts`, `designWorker.ts`) переиспользуются и дорабатываются точечно. Новые модули кладутся рядом по уже сложившейся раскладке `lib/*.ts` и `middlewares/*.ts`.

Convert the feature design into a series of prompts for a code-generation LLM that will implement each step with incremental progress. Make sure that each prompt builds on the previous prompts, and ends with wiring things together. There should be no hanging or orphaned code that isn't integrated into a previous step. Focus ONLY on tasks that involve writing, modifying, or testing code.

## Tasks

- [x] 1. Миграция БД и схемы Drizzle
  - [x] 1.1 Создать миграцию `artifacts/api-server/migrations/2026-01-15-ai-design-product.sql`
    - `ALTER TABLE designs` добавить `layout_json jsonb`, `top_down_plan_url text`, `picked_furniture jsonb`, `progress integer NOT NULL DEFAULT 0`, `current_step varchar(60)`, `pdf_url text`, `pdf_rendering_at timestamp`
    - `CREATE TABLE furniture_products` со всеми полями и тремя индексами (`picker_idx`, GIN на `style_tags`, GIN на `room_types`)
    - `CREATE TABLE finishing_materials` со всеми полями и тремя индексами
    - `CREATE TABLE rate_limit_buckets` с PRIMARY KEY на `bucket_key`
    - `ALTER TABLE cities ADD COLUMN work_coefficient_kopeks_per_sqm integer`
    - _Requirements: 5.2, 6.4, 8.6, 10.1, 10.6, 11.1, 11.4, 13.5, 3.3, 3.4_
  - [x] 1.2 Расширить Drizzle-схемы в `lib/db/src/schema/`
    - Добавить новые колонки в существующий `designs.ts`
    - Добавить колонку `workCoefficientKopeksPerSqm` в `cities` (settings.ts)
    - Создать `furniture-products.ts`, `finishing-materials.ts`, `rate-limit-buckets.ts` по образцу из дизайна
    - _Requirements: 5.2, 6.4, 8.6, 10.1, 10.6, 11.1, 11.4, 13.5, 3.3, 3.4_
  - [x] 1.3 Вынести общие типы `LayoutJson` и `PickedFurnitureRow` в `lib/db/src/types/`
    - `layout.ts`: тип `LayoutJson` (room/door/window/furniture[]), `Wall`, `FurnitureItem`
    - `furniture.ts`: тип `PickedFurnitureRow`
    - Чистые типы, без импортов из `api-server`, чтобы избежать циркулярки
    - _Requirements: 6.2, 6.3, 10.6_

- [x] 2. Anon_Id middleware
  - [x] 2.1 Реализовать `artifacts/api-server/src/middlewares/anonIdMiddleware.ts`
    - Чтение cookie `kiro_anon_id`, валидация regex UUID v4
    - При отсутствии или невалидном — `randomUUID()`, `res.cookie(...)` со сроком 365 дней, `httpOnly`, `sameSite: lax`, `secure` в production
    - Декларация `Express.Request.anonId?: string`
    - _Requirements: 4.1, 4.2_
  - [x] 2.2 Подключить middleware в `artifacts/api-server/src/app.ts`
    - Зарегистрировать после `cookieParser()` и до `app.use("/api", router)`
    - _Requirements: 4.2_

- [x] 3. Captcha — Cloudflare Turnstile
  - [x] 3.1 Реализовать `artifacts/api-server/src/lib/turnstile.ts`
    - Функция `verifyTurnstileToken({ token, remoteIp, expectedAction })` → `TurnstileVerifyResult`
    - POST на `https://challenges.cloudflare.com/turnstile/v0/siteverify` с `secret` и `response`
    - Проверка `expectedAction = "ai_design_submit"`; несовпадение → `success: false`
    - Dev-режим: при отсутствии `TURNSTILE_SECRET_KEY` возвращать `success: true`
    - _Requirements: 3.1, 3.2_

- [x] 4. Rate_Limiter на Postgres
  - [x] 4.1 Реализовать `artifacts/api-server/src/lib/designRateLimit.ts`
    - `checkAndIncrement(kind, rawKey)` через `INSERT ... ON CONFLICT DO UPDATE` со сбросом счётчика по 24-часовому fixed window
    - `decrement(kind, rawKey)` для отката при отказе по schema/min-area
    - Лимиты: `anon = 3`, `ip = 5` в сутки
    - _Requirements: 3.3, 3.4, 3.5, 3.6, 3.7_
  - [x]* 4.2 Property test для Rate_Limiter в `tests/dizajn/rate-limiter.property.test.ts`
    - **Property 5: Daily rate-limiter enforces (anonId, ipHash) thresholds with strict 24h window**
    - **Validates: Requirements 3.3, 3.4, 3.5, 3.6, 3.7**

- [x] 5. Geometric_Validator
  - [x] 5.1 Реализовать `artifacts/api-server/src/lib/geometricValidator.ts`
    - `checkMinArea(roomType, widthCm, lengthCm)` по фиксированной таблице минимумов из Requirement 2.2
    - `validateLayout(room, furniture)` с тремя проверками: AABB-containment, non-intersection (допуск ≤1 см), door clearance
    - BFS на сетке 5 см с морфологической дилатацией радиусом 6 ячеек для проверки прохода 60 см от двери до функциональных предметов (`bed`, `wardrobe` для bedroom)
    - Возврат `ValidationResult { ok, violations[] }` с человеко-читаемыми `detailRu` для retry-prompts
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.9_
  - [x]* 5.2 Property test для `checkMinArea` в `tests/dizajn/min-area.property.test.ts`
    - **Property 6: Min-area pre-flight matches fixed thresholds**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.9**
  - [x]* 5.3 Property tests для `validateLayout` в `tests/dizajn/geometric-validator.property.test.ts`
    - **Property 7: Geometric_Validator detects out-of-room, intersection and door blockage**
    - **Property 8: Geometric_Validator finds 60-cm path to functional items**
    - **Validates: Requirements 2.4, 2.5, 2.6**

- [x] 6. Layout_Planner
  - [x] 6.1 Реализовать `artifacts/api-server/src/lib/layoutPlanner.ts`
    - `generateLayoutJson(input)` через OpenAI client с `response_format: { type: "json_schema", json_schema: { name: "RoomLayout", strict: true, schema: {...} } }` (полная схема из дизайна с `additionalProperties: false` на каждом уровне)
    - Поддержка `previousViolations` в подсказке для retry
    - Цикл retry ≤ 2 раз при невалидной JSON-схеме или отказе `Geometric_Validator`; при дальнейшей неудаче — бросить `LayoutGenerationError`
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 2.7, 2.8_
  - [x]* 6.2 Property test ретраев в `tests/dizajn/layout-planner-retry.property.test.ts`
    - **Property 9: Layout_Planner retries at most twice on validation failure**
    - **Validates: Requirements 2.7, 2.8, 6.5**
  - [x]* 6.3 Property test round-trip в `tests/dizajn/layout-json-roundtrip.property.test.ts`
    - **Property 14: Layout_JSON round-trip and persistence**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

- [x] 7. Top_Down_Plan_Renderer
  - [x] 7.1 Реализовать `artifacts/api-server/src/lib/topDownPlan.ts`
    - `renderTopDownPlanPng(layout)` — построение SVG-строки для шаблона `bedroom`: внешние стены, дверь с дугой открывания, окно, прямоугольник на каждый предмет с поворотом, подписи длин стен в см и габаритов главной мебели
    - Конвертация SVG → PNG через `sharp` (детерминированно)
    - `uploadTopDownPlan(designId, png)` — загрузка в R2 по ключу `dizajn/plans/{designId}.png` через существующий `objectStorage.ts`
    - Для типов помещения отличных от `bedroom` — заглушка-placeholder; никакого AI-fallback при ошибке (Requirement 8.5)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_
  - [x]* 7.2 Property test в `tests/dizajn/topdown-plan.property.test.ts`
    - **Property 16: Top_Down_Plan is deterministic and structurally complete**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**

- [x] 8. Isometric_Callout_Renderer
  - [x] 8.1 Реализовать `artifacts/api-server/src/lib/isometricCallouts.ts`
    - `composeIsometricWithCallouts(baseImage, layout, roomType)` — программное наложение SVG-выносок на AI-изображение
    - Калибровочная изометрическая проекция 30°: `screen_x = (x - y)·cos30°·s + cx`, `screen_y = (x + y)·sin30°·s - z·s + cy`; единый `scale` подбирается так, чтобы прямоугольник комнаты с отступом 10% помещался в кадр
    - Список функциональных типов для bedroom: `bed`, `wardrobe`, `nightstand`, `desk`
    - Композитинг через `sharp(pngBuffer).composite([{ input: svgBuffer }]).jpeg()`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_
  - [x] 8.2 Удалить хардкоженные элементы из `artifacts/api-server/src/lib/infographicComposer.ts`
    - Удалить `buildIsometricCalloutsSvg` (выноски теперь рисуются на этапе Isometric_Render)
    - Заменить хардкоженный `buildFloorPlanSvg` на вставку готового PNG из `top_down_plan_url`
    - _Requirements: 8.7, 9.3_
  - [x]* 8.3 Property test в `tests/dizajn/isometric-callouts.property.test.ts`
    - **Property 17: Isometric callouts are derived from Layout_JSON, not hardcoded**
    - **Validates: Requirements 9.2, 9.3_

- [x] 9. AI_Image_Provider — выбор и обёртка edit-image
  - [x] 9.1 Добавить обёртку `falGenerateFluxKontextPro` в `artifacts/api-server/src/lib/falAi.ts`
    - Тот же интерфейс `FalGenerationResult`, что и у существующих `falGenerate*`, чтобы переключаться без переделки воркера
    - _Requirements: 7.5, 7.6_
  - [x] 9.2 Реализовать `artifacts/api-server/src/lib/designConfig.ts`
    - `getEditImageProvider(): "gpt_image_1_5_edit" | "flux_kontext_pro"` из env `AI_DESIGN_EDIT_PROVIDER`
    - Default + санитайзер неизвестных значений
    - Параметр `getCostCeilingKopeks()` из `DESIGN_COST_CEILING_KOPEKS`
    - _Requirements: 7.5, 14.5_

- [x] 10. Cost_Guard
  - [x] 10.1 Реализовать `artifacts/api-server/src/lib/designCostGuard.ts`
    - Класс `BudgetExceededError(designId, spentKopeks)`
    - `enforceCostCeiling(designId)` — `SELECT SUM(cost_kopeks) FROM design_generations WHERE design_id = ?`, при превышении лимита из `getCostCeilingKopeks()` бросать `BudgetExceededError`
    - _Requirements: 14.5, 14.7_

- [x] 11. Furniture_Matcher
  - [x] 11.1 Реализовать `artifacts/api-server/src/lib/furnitureMatcher.ts`
    - `pickFurniture({ layout, roomType, style, budgetRub })` — для каждого `FurnitureItem` из Layout_JSON один `SELECT` из `furniture_products`
    - Условия отбора: `is_available = true`, `room_types @> ARRAY[roomType]`, `style_tags` совместимы по таблице из дизайна, `|dim - layout.dim| ≤ 15` см по всем трём осям
    - Постпроцесс по бюджету (≤ 45% от `budget`): замена самых дорогих SKU на дешёвые альтернативы
    - При отсутствии кандидатов — `sku=null`, `pricePaidKopeks=0`, не блокировать пайплайн
    - _Requirements: 10.1, 10.3, 10.4, 10.5, 10.6_
  - [x]* 11.2 Property test в `tests/dizajn/furniture-matcher.property.test.ts`
    - **Property 18: Furniture_Matcher honors dim/style constraints and budget guard**
    - **Validates: Requirements 10.3, 10.4, 10.5**

- [x] 12. Materials_Estimator + Real_Estimate
  - [x] 12.1 Реализовать `artifacts/api-server/src/lib/materialsEstimator.ts`
    - `buildRealEstimate({ layout, roomType, style, cityId, pickedFurniture })` — 4 компоненты по формулам из дизайна
    - Подбор материалов из `finishing_materials` для категорий `walls`/`floor`/`ceiling`/`other`
    - Расчёт площадей: пол = ceiling = `w·l/10000`; стены = `(2·(w+l)·h/10000) - 4` м²
    - `worksKopeks = workCoeff × roomAreaSqm`; default `800_000` копеек/м² при `cityId IS NULL`
    - `otherKopeks = round(0.1 × (materials + furniture + works))`
    - Возврат массива из ровно 4 строк в фиксированном порядке `[Отделочные материалы, Мебель, Работы, Прочие расходы]`; нулевые компоненты сохраняются как 0 без подмены на default
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.7_
  - [x]* 12.2 Property test в `tests/dizajn/real-estimate.property.test.ts`
    - **Property 19: Real_Estimate arithmetic identity and structure**
    - **Validates: Requirements 11.2, 11.3, 11.4, 11.5, 11.7**

- [x] 13. Slug_Generation
  - [x] 13.1 Расширить `artifacts/api-server/src/lib/slug.ts` функцией `pickUniqueSlug`
    - Базовый slug `roomType.replace('_','-')-{style}-...`, regex `^[a-z0-9-]+$`, длина ≤ 160
    - Коллизия — суффикс-номер с проверкой по `designs.slug`
    - _Requirements: 1.8, 1.9_
  - [x]* 13.2 Property test в `tests/dizajn/slug.property.test.ts`
    - **Property 23: Slug generation is well-formed and unique**
    - **Validates: Requirements 1.8, 1.9**

- [x] 14. Color_Palette — закрепить контракт существующего `colorExtraction.ts`
  - [x]* 14.1 Property test в `tests/dizajn/color-palette.property.test.ts`
    - **Property 20: Color_Palette extraction returns 5 valid HEX colors**
    - **Validates: Requirements 12.1**

- [x] 15. Worker FSM — рефакторинг `designWorker.ts`
  - [x] 15.1 Рефакторинг `processDesign` в детерминированный конечный автомат
    - Шаги: Layout_JSON → Geometric_Validator → Hero_Render (text-to-image) → 5×Angle_Render параллельно (через `getEditImageProvider()`) → Top_Down_Plan → Isometric_Render с `composeIsometricWithCallouts` → detail crops через `sharp` → `pickFurniture` → `buildRealEstimate` → `Color_Palette` → AI-текст (`generateDesignContent`) → `composeInfographic`
    - После каждого крупного шага `UPDATE designs SET progress=?, current_step=?`
    - Обязательные шаги (Layout_JSON, Hero_Render, AI-текст, Real_Estimate) — фейл → `status=failed`; остальные шаги — фейл → продолжать с пустым полем
    - 1 повтор для Angle_Render и Isometric, 2 повтора для Layout_JSON
    - `enforceCostCeiling(designId)` перед и после каждого AI-вызова; `BudgetExceededError` → `failed` с `error_message = "превышен бюджет генерации"`
    - Сохранять `layout_json`, `top_down_plan_url`, `picked_furniture`, `views[]`, `color_palette`, `estimate`, `materials`, `solutions`, `result_image_url` (Infographic) в `designs`
    - _Requirements: 5.1, 5.2, 5.7, 7.1, 7.2, 7.3, 7.4, 7.7, 7.8, 9.1, 9.4, 9.5, 12.1, 12.2, 14.1, 14.2, 14.3, 14.5, 14.6, 14.7, 15.2_
  - [x]* 15.2 Property test FSM в `tests/dizajn/worker-fsm.property.test.ts`
    - **Property 13: Worker selects one oldest generating row per tick, with watchdog and monotonic progress**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.7, 15.2**
  - [x]* 15.3 Property test композиции views в `tests/dizajn/views-composition.property.test.ts`
    - **Property 15: 6-view composition and env-driven edit-image provider**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.7, 7.8**
  - [x]* 15.4 Property test статусов в `tests/dizajn/pipeline-status.property.test.ts`
    - **Property 22: Pipeline status semantics with Cost_Ceiling guard**
    - **Validates: Requirements 14.1, 14.2, 14.3, 14.5, 14.6, 14.7**

- [x] 16. POST /api/marketplace/dizajn/generate
  - [x] 16.1 Определить Zod-схему `Design_Form` в `artifacts/api-server/src/lib/dizajnFormSchema.ts`
    - Enum `roomType` с MVP-гейтом — отказ для всех значений кроме `bedroom` с кодом ошибки `mvp_room_locked`
    - Enum `style`, диапазоны `widthCm` (200..800), `lengthCm` (200..800), `heightCm` (220..350), `budget` (50000..5000000)
    - Optional `features[]`
    - При ошибке возвращать список нарушений по полям
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.10_
  - [x] 16.2 Обновить обработчик `POST /generate` в `artifacts/api-server/src/routes/dizajn.ts`
    - Порядок: `req.anonId` (из middleware) → `verifyTurnstileToken` (fail → 400 `invalid_captcha`) → `checkAndIncrement("anon", req.anonId)` и `checkAndIncrement("ip", clientIp)` (fail → 429) → Zod-валидация (fail → 400 + `decrement` обоих счётчиков) → `checkMinArea` (fail → 400 + `decrement`) → `pickUniqueSlug` → `INSERT INTO designs` со `status=generating`, `progress=0`
    - Ответ 202 с `{ slug }` для редиректа на `/dizajn/{slug}`
    - При сбое в воркере по Cost_Ceiling `decrement` намеренно не вызывается (Requirement 3.7)
    - _Requirements: 1.8, 1.9, 1.10, 2.3, 3.1, 3.2, 3.5, 3.6, 3.7, 4.1_
  - [x]* 16.3 Property tests формы и транзакционных эффектов в `tests/dizajn/generate-form.property.test.ts`
    - **Property 1: Form schema accepts valid input and rejects with full violation list**
    - **Property 2: POST /generate has consistent transactional effects**
    - **Property 3: MVP room gating**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 1.9, 1.10, 2.3**
  - [x]* 16.4 Property test порядка проверок в `tests/dizajn/captcha-order.property.test.ts`
    - **Property 4: Captcha verifies before any other validation**
    - **Validates: Requirements 3.2**

- [x] 17. Чекпоинт — фундамент готов
  - Ensure all tests pass, ask the user if questions arise.

- [x] 18. Эндпоинты опроса статуса, «мои дизайны» и PDF
  - [x] 18.1 Добавить три новых route в `artifacts/api-server/src/routes/dizajn.ts`
    - `GET /:slug/status` — лёгкий polling, возвращает `{ status, progress, currentStep, errorMessage }`, `Cache-Control: no-store`
    - `GET /mine` — список записей `designs` для текущего `req.anonId`, ORDER BY `created_at DESC`, LIMIT 50, поля `slug`, `roomType`, `style`, `status`, `progress`, `resultImageUrl`, `createdAt`
    - `GET /:slug/pdf` — синхронный вызов `getOrRenderPdf(designId)` с заголовками `Content-Type: application/pdf` и `Content-Disposition: attachment`; при ошибке `503 pdf_temporarily_unavailable`
    - _Requirements: 4.3, 4.7, 5.3, 5.4, 5.5, 5.6, 13.1, 13.2, 13.5, 13.6_
  - [x]* 18.2 Property tests владения и видимости в `tests/dizajn/anon-ownership.property.test.ts`
    - **Property 10: Anon_Id cookie is issued exactly once and persisted as owner**
    - **Property 11: My_Designs_List returns own designs sorted DESC with required keys**
    - **Property 12: Public_Page visibility and ownership badge**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 15.3**

- [x] 19. PDF_Renderer — Puppeteer + R2 cache
  - [x] 19.1 Реализовать `artifacts/api-server/src/lib/pdfRenderer.ts`
    - `renderDesignPdf(designId, html): Promise<Buffer>` через `puppeteer-core` + `@sparticuz/chromium-min`, формат A4 портрет
    - HTML собирается серверным рендером разметки, аналогичной `DesignBoard.tsx`, в фиксированном порядке секций: Cover (h1, Hero_Render) → Параметры → Top_Down_Plan → Isometric_Render → 6 ракурсов → Color_Palette → Materials → Estimate → Solutions → Furniture
    - URL `chestnye-mastera.ru/dizajn/{slug}` на обложке и в footer каждой страницы
    - `getOrRenderPdf(designId)` — проверка R2 ключа `dizajn/pdf/{designId}.pdf`; если есть — отдать буфер; иначе soft-lock через `designs.pdf_rendering_at` (timestamp-based, 30 с ожидания), рендер, сохранение в R2, обновление `designs.pdf_url`
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_
  - [x]* 19.2 Property test композиции и кэширования в `tests/dizajn/pdf-renderer.property.test.ts`
    - **Property 21: PDF artifact composition is ordered, cached and self-referential**
    - **Validates: Requirements 13.3, 13.4, 13.5, 13.7**

- [x] 20. Публичная страница формы `/ai-design`
  - [x] 20.1 Реализовать `artifacts/marketplace/app/ai-design/page.tsx`
    - Форма с полями: `roomType` (только `bedroom` активен, остальные с пометкой «скоро»), `style`, `widthCm`, `lengthCm`, `heightCm`, `budget`, чекбоксы `features`
    - Cloudflare Turnstile widget с `sitekey = TURNSTILE_SITE_KEY`, action `ai_design_submit`
    - Подсказки типичных размеров рядом с полями ширины/длины (для bedroom — «обычно 12–18 м²»), без автоподстановки
    - На submit — POST `/api/marketplace/dizajn/generate` с `cf-turnstile-response`, при 202 редирект на `/dizajn/{slug}`, при 400/429 — отображение сообщений ошибок
    - _Requirements: 1.1, 1.3, 1.7, 1.9, 1.10, 3.1, 3.5_

- [x] 21. Страница «мои дизайны» `/dizajn/mine`
  - [x] 21.1 Реализовать `artifacts/marketplace/app/dizajn/mine/page.tsx`
    - Запрос `GET /api/marketplace/dizajn/mine` с автоматическим cookie `kiro_anon_id`
    - Карточки проектов: миниатюра `resultImageUrl`, `roomType`/`style`, бейдж текущего `status` (с прогрессом для `generating`), `createdAt` в локализованной форме
    - Ссылка на `/dizajn/{slug}`
    - _Requirements: 4.3, 4.7_

- [x] 22. Обновления `DesignBoard.tsx`
  - [x] 22.1 Расширить `artifacts/marketplace/components/dizajn/DesignBoard.tsx`
    - Блок «Вид сверху» рендерит `top_down_plan_url`; placeholder только если поле `null`
    - Новый блок «Подобранная мебель» по `picked_furniture[]`: миниатюра, название, цена, ссылка `partner_url`; для `sku=null` — заглушка «уточняется»
    - Кнопка «Скачать PDF» при `status=completed`, скрыта во время повторного рендера или при последней ошибке `pdf_temporarily_unavailable`
    - Polling `GET /:slug/status` каждые 3 секунды, пока `status=generating`; шкала прогресса с подписью текущего шага; остановка polling при переходе в `completed`/`failed`
    - Бейдж «ваш проект» при `designAnonId === current cookie kiro_anon_id`
    - Скрывать пустые секции при отсутствующих опциональных артефактах
    - _Requirements: 4.4, 4.5, 4.6, 5.4, 5.5, 5.6, 8.7, 10.7, 13.1, 13.6, 14.4_

- [x] 23. Каталоги-сиды
  - [x] 23.1 Сид `furniture_products` — скрипт `artifacts/api-server/src/scripts/seedFurniture.ts`
    - 100–200 SKU с `room_types ⊃ {bedroom}`, по разным типам (`bed`, `wardrobe`, `nightstand`, `desk`, `chair`, `dresser`, `shelf`, `rug`)
    - Покрытие всех 7 стилей: `modern`, `scandinavian`, `loft`, `minimalism`, `neoclassic`, `japandi`, `classic`
    - Идемпотентный `INSERT ... ON CONFLICT (sku) DO UPDATE`
    - _Requirements: 10.1, 10.2_
  - [x] 23.2 Сид `finishing_materials` — скрипт `artifacts/api-server/src/scripts/seedFinishingMaterials.ts`
    - Для каждого стиля × категории `walls`/`floor`/`ceiling`/`other` хотя бы один доступный SKU с `room_types ⊃ {bedroom}`
    - _Requirements: 11.1_
  - [x] 23.3 Сид `cities.work_coefficient_kopeks_per_sqm` — скрипт `artifacts/api-server/src/scripts/seedCityCoefficients.ts`
    - Заполнить значения для топ-30 городов; остальные оставить `NULL` (используется default 800000 копеек/м²)
    - _Requirements: 11.4_

- [x] 24. Showcase admin endpoint
  - [x] 24.1 Реализовать `artifacts/api-server/src/routes/admin/dizajnShowcase.ts`
    - Эндпоинт создания `Showcase_Project` с возможностью передать ручные `h1`, `description`, `materials`, `estimate`, `solutions` (поведение `hasSeedContent` уже существует в `designContent.ts`)
    - Запись `designs.anon_id = NULL` для отличия от пользовательских проектов
    - Feature-flag через env `AI_DESIGN_SHOWCASE_ADMIN_ENABLED` (default `false`); при выключенном флаге — 404
    - _Requirements: 15.1, 15.4, 15.5_

- [x] 25. Identity_Preservation pilot — оффлайн-скрипт
  - [x] 25.1 Реализовать `scripts/src/identity-preservation-pilot.ts`
    - Чтение `scripts/data/identity-preservation-inputs.csv` (10 фиксированных входов × 7 стилей)
    - Для каждого входа двойной прогон 5×Angle_Render через `falGenerateGptImageEdit` и `falGenerateFluxKontextPro` (через abstraction из 9.1)
    - CLIP similarity через `@xenova/transformers` (`Xenova/clip-vit-base-patch32`)
    - Δ E (CIELAB) на доминантном цвете через `colorExtraction.ts`
    - Сохранение результатов в `scripts/data/identity-preservation-results.csv`
    - _Requirements: 7.6_
  - [x] 25.2 Зафиксировать решение в `docs/ai-design/identity-preservation-pilot.md`
    - Протокол выборки (14 проектов × 6 рендеров × 2 провайдера)
    - Метрики и пороги (CLIP ≥ 0.85, Δ E ≤ 5)
    - Победитель и значение `AI_DESIGN_EDIT_PROVIDER` для production
    - Ссылка на CSV с сырыми данными
    - _Requirements: 7.6_

- [x] 26. Финальный чекпоинт
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Задачи с постфиксом `*` опциональны и могут быть пропущены ради быстрого MVP, но property-тесты — обязательная часть для алгоритмических компонентов перед релизом (см. `Testing Strategy` в design.md).
- Каждая задача ссылается на конкретные пункты `requirements.md` для трассируемости.
- 23 свойства из секции `Correctness Properties` в `design.md` распределены по 18 sub-задачам с явной аннотацией номера свойства и валидируемых требований.
- Воркер `designWorker.ts` рефакторится одной задачей (15.1), потому что шаги пайплайна сильно связаны и распыление по нескольким задачам с одним и тем же файлом ломает порядок коммитов.
- Все новые модули по соглашениям проекта кладутся в `artifacts/api-server/src/lib/` и `artifacts/api-server/src/middlewares/`. Drizzle-схемы — в `lib/db/src/schema/`.
- Cost_Ceiling = $0.30 USD ≈ 3000 копеек (env `DESIGN_COST_CEILING_KOPEKS`); провайдер edit-image — env `AI_DESIGN_EDIT_PROVIDER` ∈ {`gpt_image_1_5_edit`, `flux_kontext_pro`}.
- Identity_Preservation pilot (25.1, 25.2) — оффлайн-скрипт для разработки, его результат фиксирует значение env-переменной перед релизом и не выполняется в проде.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1", "5.1", "6.1", "7.1", "8.1", "9.1", "9.2", "10.1", "11.1", "12.1", "13.1", "16.1", "19.1", "24.1"] },
    { "id": 2, "tasks": ["2.2", "8.2", "15.1", "16.2", "23.1", "23.2", "23.3", "25.1"] },
    { "id": 3, "tasks": ["18.1", "20.1", "21.1", "22.1", "25.2"] },
    { "id": 3, "tasks": ["18.1", "20.1", "21.1", "22.1"] },
    { "id": 4, "tasks": ["4.2", "5.2", "5.3", "6.2", "6.3", "7.2", "8.3", "11.2", "12.2", "13.2", "14.1", "15.2", "15.3", "15.4", "16.3", "16.4", "18.2", "19.2"] }
  ]
}
```
