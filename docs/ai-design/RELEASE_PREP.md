# AI_Design_Product — Release Preparation

**Статус:** спека `.kiro/specs/ai-design-product/` полностью реализована (76 / 76 задач), property-based тесты `__tests__/dizajn/*.property.test.ts` зелёные. Этот документ — единая точка входа для деплоя на staging / прод: env, миграция, сиды, identity-preservation pilot и smoke-тест.

**Не делает этот документ:** не запускает миграцию, сиды и пилот автоматически — все три шага требуют подтверждения оператора. Команды ниже — для ручного выполнения.

**Связанные документы:**

- Спека: [`.kiro/specs/ai-design-product/`](../../.kiro/specs/ai-design-product/) (`requirements.md`, `design.md`, `tasks.md`).
- Identity-preservation pilot: [`docs/ai-design/identity-preservation-pilot.md`](./identity-preservation-pilot.md).
- Миграция: [`artifacts/api-server/migrations/2026-01-15-ai-design-product.sql`](../../artifacts/api-server/migrations/2026-01-15-ai-design-product.sql).
- Seed-скрипты: [`artifacts/api-server/src/scripts/`](../../artifacts/api-server/src/scripts/).

---

## 1. Required environment variables

Таблица — точный отражает фактические `process.env.*` чтения в коде (по `grep`-аудиту `artifacts/api-server/src/lib/*` и `artifacts/marketplace/app/ai-design/page.tsx`). Колонки:

- **Где используется** — `api-server` / `marketplace` / `both`.
- **Обязательность** — `required (prod)`: без значения деградация (Captcha → bypass, Worker → throw, PDF → 503). `optional`: есть документированный fallback.
- **Module / file** — конкретное место, читающее env.

### 1.1 Captcha (Cloudflare Turnstile)

| Ключ | Описание | Пример | Обязательность | Где | Module |
| --- | --- | --- | --- | --- | --- |
| `TURNSTILE_SECRET_KEY` | Серверный secret для `siteverify` POST. Если пуст — `verifyTurnstileToken` short-circuits в `success: true` (dev/E2E mode). | `0x4AAAAAAAA...` | required (prod) | api-server | `src/lib/turnstile.ts` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Публичный sitekey, отдаётся в `<div class="cf-turnstile" data-sitekey="...">` на `/ai-design`. Без префикса `NEXT_PUBLIC_` Next.js не экспонирует значение в bundle. Если пуст — fallback на Cloudflare test sitekey `1x00000000000000000000AA` (всегда валидный токен), ОК для dev. | `0x4AAAAAAAB...` | required (prod) | marketplace | `app/ai-design/page.tsx` |

> Замечание: в `design.md` упомянуто имя `TURNSTILE_SITE_KEY` без `NEXT_PUBLIC_`, но реальное чтение в `app/ai-design/page.tsx:39` — именно `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. На Railway / в `.env` нужно класть оба — `NEXT_PUBLIC_TURNSTILE_SITE_KEY` для marketplace бандла и `TURNSTILE_SECRET_KEY` для api-server.

### 1.2 Pipeline runtime

| Ключ | Описание | Пример | Обязательность | Где | Module |
| --- | --- | --- | --- | --- | --- |
| `AI_DESIGN_EDIT_PROVIDER` | Провайдер edit-image для Angle_Render: `gpt_image_1_5_edit` \| `flux_kontext_pro`. Любое другое значение → fallback на `gpt_image_1_5_edit` с warning. Финальный выбор фиксируется по итогам identity-preservation pilot (см. §4). | `gpt_image_1_5_edit` | optional (default) | api-server | `src/lib/designConfig.ts` |
| `DESIGN_COST_CEILING_KOPEKS` | Лимит суммарной стоимости AI-вызовов на один Design_Project (kopeks). Worker остановит пайплайн, если сумма `design_generations.cost_kopeks` ≥ лимита. `0` разрешён (means "no AI calls"). Negative / NaN → fallback `3000`. | `3000` | optional (default 3000) | api-server | `src/lib/designConfig.ts`, `src/lib/designCostGuard.ts` |
| `FAL_API_KEY` | Ключ Fal.ai для Hero/Angle/Iso рендера. Без него любая `falGenerate*` обёртка бросает `Error("FAL_API_KEY is not set")` и пайплайн уходит в `failed`. | `key-...` | required | api-server (+ scripts pilot) | `src/lib/falAi.ts` (5 функций), `scripts/src/identity-preservation-pilot.ts` |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Ключ OpenAI-совместимого шлюза (OpenRouter / прямой OpenAI / прокси). Используется `Layout_Planner` (генерация `Layout_JSON`) и `designContent` (h1/seoTitle/seoDescription/description/solutions). | `sk-...` | required | api-server | `src/lib/layoutPlanner.ts`, `src/lib/designContent.ts`, `src/lib/aiContent.ts` |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Base URL шлюза. Для прямого OpenAI: `https://api.openai.com/v1`. | `https://openrouter.ai/api/v1` | optional | api-server | те же модули + множество других AI-вызовов |
| `AI_INTEGRATIONS_OPENAI_MODEL` | Базовая модель шлюза для AI-вызовов вне дизайна (dispatcher, manager-bot и т.д.). | `claude-opus-4-7` | optional | api-server | `src/lib/dispatcherAI.ts`, `aiContent.ts`, `layoutPlanner.ts`, `designContent.ts` (как fallback) |
| `AI_INTEGRATIONS_DESIGN_MODEL` | Override модели специально для `Layout_Planner` и `designContent` (если шлюз требует более «умную» модель для structured JSON). Fallback chain: `AI_INTEGRATIONS_DESIGN_MODEL` → `AI_INTEGRATIONS_OPENAI_MODEL` → `claude-opus-4-7`. | `anthropic/claude-opus-4-7` | optional | api-server | `src/lib/layoutPlanner.ts`, `src/lib/designContent.ts` |

### 1.3 PDF & R2

| Ключ | Описание | Пример | Обязательность | Где | Module |
| --- | --- | --- | --- | --- | --- |
| `CHROMIUM_REMOTE_PATH` | URL/путь к remote Chromium-binary для `@sparticuz/chromium-min` (Puppeteer headless нужен для PDF-рендера). Без него `chromium.executablePath()` не сможет резолвить бинарь и `getOrRenderPdf` бросит `PdfRenderError` → route `/dizajn/:slug/pdf` отдаст 503 (Requirement 13.6). Страница `/dizajn/{slug}` остаётся доступной. | `https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar` | required (prod) | api-server | `src/lib/pdfRenderer.ts` |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | Имя R2 / GCS bucket для всех загрузок: AI-рендеры, top-down plan, PDF кэш. Без него `Top_Down_Plan` / PDF-cache / Design_Worker бросают синхронные ошибки конфигурации. | `sfera-public` | required | api-server | `src/lib/topDownPlan.ts`, `src/lib/pdfRenderer.ts`, `src/lib/designWorker.ts`, `routes/dizajn.ts`, и др. |
| `R2_ENDPOINT` | S3-совместимый endpoint Cloudflare R2 (`https://<account>.r2.cloudflarestorage.com`). | `https://abcd.r2.cloudflarestorage.com` | required | api-server | `src/lib/objectStorage.ts` |
| `R2_ACCESS_KEY_ID` | Access key для S3 SDK. | `xxxx` | required | api-server | `src/lib/objectStorage.ts` |
| `R2_SECRET_ACCESS_KEY` | Secret key для S3 SDK. | `xxxx` | required | api-server | `src/lib/objectStorage.ts` |
| `R2_REGION` | Регион клиента S3. Для R2 — `auto`. | `auto` | optional (default `auto`) | api-server | `src/lib/objectStorage.ts` |
| `R2_PUBLIC_URL` | Публичный CDN-URL bucket'а (R2 custom domain). Используется для нормализации путей и для `routes/client.ts` / `routes/masters.ts` (avatar-загрузки). Для дизайнов прямого использования нет, но без него часть фоток может рендериться через прокси. | `https://cdn.chestnye-mastera.ru` | optional | api-server | `src/lib/objectStorage.ts`, `routes/masters.ts`, `routes/client.ts` |

### 1.4 Marketplace base URL

| Ключ | Описание | Пример | Обязательность | Где | Module |
| --- | --- | --- | --- | --- | --- |
| `MARKETPLACE_PUBLIC_URL` | Публичный URL marketplace. PDF использует его в footer и для абсолютных `<img>` URL. Default — `https://chestnye-mastera.ru`. | `https://chestnye-mastera.ru` | optional (default) | both | api-server: `src/lib/pdfRenderer.ts`, `src/lib/marketplaceRevalidate.ts`, `src/lib/indexNow.ts`, `routes/masters.ts`; marketplace: `lib/env.ts` |

### 1.5 База данных

| Ключ | Описание | Пример | Обязательность | Где | Module |
| --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | Postgres connection string. Используется и api-server, и migration runner, и pool в `@workspace/db`. Без него `pg.Pool` бросит при первом коннекте. | `postgres://user:pwd@host:5432/db` | required | both (через `@workspace/db`) | `lib/db/src/index.ts` |

### 1.6 Опциональные модели Fal.ai

Все необязательные — есть hard-coded дефолты в `src/lib/falAi.ts`. Меняются через env только если Fal обновит модель и нужно зафиксировать новый литерал без редеплоя.

| Ключ | Default | Использование |
| --- | --- | --- |
| `FAL_MODEL` | `fal-ai/flux/dev/image-to-image` | legacy `falGenerate` (img2img, не используется в новом пайплайне) |
| `FAL_MODEL_PANORAMIC` | `fal-ai/flux-pro/v1.1-ultra` | `falGeneratePanoramic` |
| `FAL_MODEL_GPT_IMAGE` | `fal-ai/gpt-image-1.5` | Hero_Render и Angle_Render через gpt-image (база `…/edit` для Angle) |
| `FAL_MODEL_TEXT` | `fal-ai/flux/dev` | text-to-image fallback |
| `FAL_MODEL_FLUX_KONTEXT_PRO` | `fal-ai/flux-pro/kontext` | Angle_Render через flux-kontext (если pilot выберет этот провайдер) |

### 1.7 Документированные но в коде не читаемые

| Ключ | Где упомянут | Статус |
| --- | --- | --- |
| `AI_DESIGN_USD_TO_KOPEKS_RATE` | `design.md` §Cost_Ceiling, `docs/ai-design/identity-preservation-pilot.md` §3.3 | **NOT READ in code.** В `falAi.ts` стоимость одного вызова приходит как hardcoded `APPROX_COST_KOPEKS = 100` (≈ $0.01). Если понадобится адаптивная конверсия — нужен патч `falAi.ts`. До тех пор класть в env смысла нет. |
| `TURNSTILE_SITE_KEY` (без `NEXT_PUBLIC_`) | `design.md` §Captcha_Provider, §«Готовность к запуску» | **NOT READ in code.** В marketplace используется `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (см. §1.1). Опечатка в design.md. |
| `FAL_KEY` | `design.md` §«Готовность к запуску» | **NOT READ in code.** В коде используется `FAL_API_KEY`. Опечатка в design.md. |

---

## 2. Database migration runbook

Спека для AI_Design_Product добавляет один SQL-файл: `artifacts/api-server/migrations/2026-01-15-ai-design-product.sql`. Все DDL обёрнуты в `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` — миграция идемпотентна, повторный запуск безопасен.

**Что меняет:**

- `ALTER TABLE designs` — добавляет 7 колонок (`layout_json jsonb`, `top_down_plan_url text`, `picked_furniture jsonb`, `progress integer NOT NULL DEFAULT 0`, `current_step varchar(60)`, `pdf_url text`, `pdf_rendering_at timestamp`).
- `CREATE TABLE furniture_products` + 3 индекса (`furniture_products_picker_idx` partial, `furniture_products_styles_gin`, `furniture_products_rooms_gin`).
- `CREATE TABLE finishing_materials` + 3 индекса (аналогично).
- `CREATE TABLE rate_limit_buckets` + индекс `rate_limit_buckets_window_idx`.
- `ALTER TABLE cities` — добавляет `work_coefficient_kopeks_per_sqm integer` (NULL допустим).

**Зависимости:** только существующая таблица `designs` (она уже есть в проде) и `cities`. Никаких FK на новые таблицы из существующих — добавление колонок и таблиц не блокирует другие сервисы.

### 2.1 Применение через psql (рекомендуемый путь)

`pnpm db:migrate` (он же `scripts/src/db-migrate.ts`) применяет inline-DDL для legacy-таблиц и **не подхватывает** SQL-файлы из `artifacts/api-server/migrations/`. Поэтому миграция AI_Design_Product применяется явно:

```cmd
:: Из корня репо. DATABASE_URL должна указывать на целевой стенд
:: (staging / production). На Windows кириллический путь работает только из cmd /c.
cmd /c "psql %DATABASE_URL% -v ON_ERROR_STOP=1 -f artifacts\api-server\migrations\2026-01-15-ai-design-product.sql"
```

PowerShell-эквивалент (если psql в PATH, без перенаправления вывода):

```powershell
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f artifacts/api-server/migrations/2026-01-15-ai-design-product.sql
```

**Что ожидать в выводе:**

```
ALTER TABLE
COMMENT
COMMENT
...
CREATE TABLE
CREATE INDEX
...
ALTER TABLE
COMMENT
```

При повторном применении — те же команды, но без эффекта (`NOTICE: relation "..." already exists, skipping`). Это корректное поведение.

### 2.2 Применение через drizzle-kit (если предпочтительно)

Drizzle-config (`lib/db/drizzle.config.ts`) указывает на `out: "./migrations"` (т.е. `lib/db/migrations`), но реальные SQL-файлы лежат в `artifacts/api-server/migrations/`. Поэтому drizzle-kit не годится для применения этого файла «из коробки» — используем psql (§2.1).

### 2.3 Откатные шаги (документирую, не выполняю)

Если нужно откатить миграцию — выполнить вручную (оператор подтверждает!) на стенде:

```sql
-- 1. Удалить ratelimit-таблицу. Это сбросит счётчики rate-limiter'а — после
--    отката следующая попытка генерации с того же anonId/IP пройдёт.
DROP TABLE IF EXISTS rate_limit_buckets;

-- 2. Удалить новые каталоги. Furniture_Matcher и Materials_Estimator
--    перестанут отдавать SKU; Design_Worker уйдёт в `failed`.
DROP TABLE IF EXISTS furniture_products;
DROP TABLE IF EXISTS finishing_materials;

-- 3. Снять расширение designs. Это сотрёт layout_json / top_down_plan_url /
--    picked_furniture / progress / current_step / pdf_url / pdf_rendering_at
--    у уже сгенерированных дизайнов. Делать ТОЛЬКО если уверены, что
--    данные не нужны.
ALTER TABLE designs
  DROP COLUMN IF EXISTS layout_json,
  DROP COLUMN IF EXISTS top_down_plan_url,
  DROP COLUMN IF EXISTS picked_furniture,
  DROP COLUMN IF EXISTS progress,
  DROP COLUMN IF EXISTS current_step,
  DROP COLUMN IF EXISTS pdf_url,
  DROP COLUMN IF EXISTS pdf_rendering_at;

-- 4. Снять городской коэффициент. Materials_Estimator вернётся к
--    DEFAULT_WORK_COEFF_KOPEKS_PER_SQM = 800_000 для всех городов.
ALTER TABLE cities
  DROP COLUMN IF EXISTS work_coefficient_kopeks_per_sqm;
```

> Откат разрушителен (теряются `picked_furniture` / `pdf_url` всех проектов), поэтому отдельный `down.sql` НЕ создаётся автоматически — только этот документированный план.

### 2.4 Verification (что запустить ПОСЛЕ миграции)

```sql
-- 1. Проверить, что новые колонки в designs появились.
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'designs'
   AND column_name IN (
     'layout_json','top_down_plan_url','picked_furniture',
     'progress','current_step','pdf_url','pdf_rendering_at'
   )
 ORDER BY column_name;
-- Ожидание: 7 строк.

-- 2. Проверить, что 3 новые таблицы существуют.
SELECT table_name
  FROM information_schema.tables
 WHERE table_schema = 'public'
   AND table_name IN ('furniture_products','finishing_materials','rate_limit_buckets')
 ORDER BY table_name;
-- Ожидание: 3 строки.

-- 3. Проверить индексы на каталогах (важно для горячего пути Furniture_Matcher).
SELECT indexname FROM pg_indexes
 WHERE tablename IN ('furniture_products','finishing_materials','rate_limit_buckets')
 ORDER BY indexname;
-- Ожидание (без учёта PK):
--   finishing_materials_picker_idx
--   finishing_materials_rooms_gin
--   finishing_materials_styles_gin
--   furniture_products_picker_idx
--   furniture_products_rooms_gin
--   furniture_products_styles_gin
--   rate_limit_buckets_window_idx

-- 4. Проверить колонку cities.
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'cities' AND column_name = 'work_coefficient_kopeks_per_sqm';
-- Ожидание: 1 строка.

-- 5. Проверить, что counters пустые (новые таблицы — пусто после миграции, до сидов).
SELECT 'furniture_products' AS t, COUNT(*) FROM furniture_products
UNION ALL
SELECT 'finishing_materials', COUNT(*) FROM finishing_materials
UNION ALL
SELECT 'rate_limit_buckets',  COUNT(*) FROM rate_limit_buckets;
-- Ожидание: все count = 0 (до запуска сидов из §3).
```

---

## 3. Seed runbook

Три скрипта в `artifacts/api-server/src/scripts/`. Все три читают `DATABASE_URL` через `@workspace/db` и применяют изменения через Drizzle. **Все три идемпотентны** — `INSERT ... ON CONFLICT (sku) DO UPDATE` для каталогов, точечный `UPDATE cities SET ... WHERE name = ?` для коэффициентов.

> Перед запуском — миграция (§2) должна быть применена. Иначе `furniture_products` / `finishing_materials` ещё не существуют, и Drizzle уронит скрипт.

### 3.1 Furniture catalog (≈ 130 SKU)

```cmd
cmd /c "pnpm --filter @workspace/api-server exec tsx src/scripts/seedFurniture.ts > seed-furniture.log 2>&1"
```

**Что делает:**

- Заливает фиксированный массив `FURNITURE_SEED` (см. сам файл) через bulk `INSERT ... ON CONFLICT (sku) DO UPDATE`.
- Покрытие: 8 типов (`bed`, `wardrobe`, `nightstand`, `desk`, `chair`, `dresser`, `shelf`, `rug`) × 7 стилей (`modern`, `scandinavian`, `loft`, `minimalism`, `neoclassic`, `japandi`, `classic`).
- Распределение по типам (всего ≈ 130 SKU): bed 20, wardrobe 20, nightstand 18, desk 14, chair 14, dresser 14, shelf 14, rug 14.

**Идемпотентность:** да. Повторный запуск обновляет name/brand/price/dimensions/tags/is_available по тем же SKU и тыкает `updated_at = NOW()`. Удаления нет — SKU, убранный из массива, останется в БД (ручной cleanup при необходимости).

**Опции:**

- `--dry-run` — собирает values, но не пишет в БД (полезно при первом прогоне, чтобы убедиться, что массив парсится корректно).

**Ожидаемый результат:**

```sql
SELECT COUNT(*) FROM furniture_products;
-- ≈ 130
SELECT type, COUNT(*) FROM furniture_products GROUP BY type ORDER BY type;
-- bed 20, chair 14, desk 14, dresser 14, nightstand 18, rug 14, shelf 14, wardrobe 20
```

### 3.2 Finishing materials catalog (54 SKU)

```cmd
cmd /c "pnpm --filter @workspace/api-server exec tsx src/scripts/seedFinishingMaterials.ts > seed-finishing.log 2>&1"
```

**Что делает:**

- Заливает массив `ROWS` (см. сам файл) через bulk `INSERT ... ON CONFLICT (sku) DO UPDATE`.
- Перед записью — `assertCoverage(rows)`: для каждого из 7 стилей × 4 категорий (`walls`/`floor`/`ceiling`/`other`) есть хотя бы один доступный SKU с `bedroom` в `room_types`. Если массив случайно сломали — скрипт падает рано с понятной ошибкой `Coverage check failed: missing SKU for ...`.
- Категории: `walls` 14 SKU, `floor` 13 SKU, `ceiling` 12 SKU, `other` 14 SKU. Итого 53 (массив может слегка плавать; «54 SKU» в задании — округление; реальный count проверяется в БД).

**Идемпотентность:** да. ON CONFLICT обновляет name/brand/category/unit/price/tags/is_available и `updated_at = NOW()`. `created_at` сохраняется первоначальный.

**Ожидаемый результат:**

```sql
SELECT COUNT(*) FROM finishing_materials;
-- ≈ 53–54
SELECT category, COUNT(*) FROM finishing_materials GROUP BY category ORDER BY category;
-- ceiling 12, floor 13, other 14, walls 14
SELECT category, style_tag, COUNT(*)
  FROM finishing_materials, unnest(style_tags) AS style_tag
 WHERE 'bedroom' = ANY(room_types) AND is_available = true
 GROUP BY category, style_tag
 ORDER BY category, style_tag;
-- В каждом сочетании category × style — хотя бы 1 SKU.
```

### 3.3 City coefficients (топ-30)

```cmd
cmd /c "pnpm --filter @workspace/api-server exec tsx src/scripts/seedCityCoefficients.ts > seed-cities.log 2>&1"
```

**Что делает:**

- Для каждого имени из `CITY_COEFFICIENTS` выполняет `UPDATE cities SET work_coefficient_kopeks_per_sqm = ? WHERE name = ?`.
- Города, отсутствующие в `cities` (имя не совпадает буквально), **пропускаются с warning**, скрипт не падает (CRM может вести список городов отдельно, и порядок применения сидов не должен блокировать миграцию).

**Идемпотентность:** да. UPDATE по PK `name`, повторный запуск перезаписывает значения. Города, не упомянутые в `CITY_COEFFICIENTS`, остаются с `NULL` — `Materials_Estimator` использует общероссийский дефолт `DEFAULT_WORK_COEFF_KOPEKS_PER_SQM = 800_000` (см. `lib/materialsEstimator.ts`).

**Ожидаемый результат:**

```sql
SELECT COUNT(*) FROM cities WHERE work_coefficient_kopeks_per_sqm IS NOT NULL;
-- 30 (если все имена городов в БД совпадают с массивом). Если меньше —
-- посмотрите список skipped в seed-cities.log и поправьте имена в CRM
-- или в массиве CITY_COEFFICIENTS.

SELECT name, work_coefficient_kopeks_per_sqm
  FROM cities
 WHERE name IN ('Москва','Санкт-Петербург','Новосибирск')
 ORDER BY name;
-- Москва         1500000
-- Новосибирск    1000000
-- Санкт-Петербург 1300000
```

### 3.4 Порядок и единый прогон

Скрипты независимы (каталоги ничего не знают друг о друге, города — отдельная таблица), но рекомендуемый порядок:

```cmd
cmd /c "pnpm --filter @workspace/api-server exec tsx src/scripts/seedFurniture.ts > seed-furniture.log 2>&1 && pnpm --filter @workspace/api-server exec tsx src/scripts/seedFinishingMaterials.ts > seed-finishing.log 2>&1 && pnpm --filter @workspace/api-server exec tsx src/scripts/seedCityCoefficients.ts > seed-cities.log 2>&1"
```

Если один из шагов упал — соответствующий `*.log` содержит причину. Cleanup не требуется: следующий запуск по тому же скрипту просто доделает работу (идемпотентность).

---

## 4. Identity-preservation pilot runbook

Полный протокол и метрики — в [`docs/ai-design/identity-preservation-pilot.md`](./identity-preservation-pilot.md). Здесь — короткое how-to.

### 4.1 Зачем

`AI_Design_Product` отдаёт 6 ракурсов одной комнаты. Identity-preservation между Hero_Render и 5 Angle_Render целиком определяется обёрткой edit-image (`gpt_image_1_5_edit` vs `flux_kontext_pro`). Пилот — однократная процедура, которая по 14 фиксированным входам считает CLIP-similarity и Δ E на доминантном цвете и фиксирует победителя в env `AI_DESIGN_EDIT_PROVIDER`.

### 4.2 Env требования

| Ключ | Зачем |
| --- | --- |
| `FAL_API_KEY` | Без него скрипт бросает в `main()` (кроме `--dry-run`). |
| `DATABASE_URL` | Не нужен — пилот **не пишет в БД**, читает только локальные CSV. |

CLIP-метрика опциональна: `@xenova/transformers` помечен в `scripts/package.json` как `optionalDependencies`. Если пакет не установлен — `clipSim` остаётся пустым, скрипт не падает, но решение придётся принимать только по Δ E + manual blind eval. Установка:

```cmd
cmd /c "pnpm --filter @workspace/scripts add @xenova/transformers > install.log 2>&1"
```

Первый запуск с CLIP скачает ONNX-модель `Xenova/clip-vit-base-patch32` (~150 МБ) в `~/.cache/huggingface`.

### 4.3 Запуск

```cmd
:: Полный прогон (14 входов × 11 рендеров × оба провайдера ≈ 154 рендера, ~$7).
cmd /c "pnpm --filter @workspace/scripts identity-preservation-pilot > pilot.log 2>&1"

:: Быстрая проверка протокола без обращений к Fal/CLIP.
cmd /c "pnpm --filter @workspace/scripts identity-preservation-pilot -- --dry-run > pilot-dry.log 2>&1"

:: Прогнать одну строку CSV (для дебага конкретного стиля).
cmd /c "pnpm --filter @workspace/scripts identity-preservation-pilot -- --max-rows 1 > pilot-debug.log 2>&1"

:: Только один провайдер (например, после фикса в одном).
cmd /c "pnpm --filter @workspace/scripts identity-preservation-pilot -- --provider flux_kontext_pro > pilot-flux.log 2>&1"
```

> Пилот тратит реальные деньги Fal.ai. Полный прогон ≈ $7. Не запускайте автоматически без подтверждения оператора.

### 4.4 Где смотреть результаты

- **Stdout-сводка:** строка `[pilot] summary:` в конце `pilot.log` — таблица `n / meanCLIP / meanΔE / totalCostKopeks` по каждому провайдеру.
- **CSV:** `scripts/data/identity-preservation-results.csv`. Колонки: `inputId, style, provider, angleIdx, clipSim, deltaE, costKopeks, providerResponse`. Поле `providerResponse` — URL результата на стороне Fal (доступен ~24 часа), для blind-eval.

### 4.5 Что считается прохождением

Из `docs/ai-design/identity-preservation-pilot.md` §4:

1. Пара `(input, angleIdx)` провайдера X **проходит**, если `clipSim ≥ 0.85` И `deltaE ≤ 5`.
2. Победитель — провайдер с большим количеством прошедших пар. При близком счёте (разница < 1) выбираем более дешёвый по `Σ costKopeks`.
3. Победитель пишется в env `AI_DESIGN_EDIT_PROVIDER` и в `.env.example` бит-в-бит. Worker подхватывает env на следующем тике без перезапуска (`getEditImageProvider()` читает env лениво).
4. Если численные метрики неубедительны — manual blind eval (3 человека, голос большинства), переопределяет численный результат, но обязательно прикладывается к PR.

### 4.6 После прогона

- Обновить секции §7 и §8 в `docs/ai-design/identity-preservation-pilot.md` конкретными числами и победителем.
- Закоммитить `scripts/data/identity-preservation-results.csv`.
- Прописать `AI_DESIGN_EDIT_PROVIDER=...` в продовое окружение (Railway / `.env`) и в `.env.example`.

---

## 5. Smoke test checklist (staging / prod)

Ручной чек-лист после применения миграции, сидов и деплоя кода. Один полный прогон занимает 2–3 минуты + ожидание пайплайна (~3–5 минут).

> Для прода: пайплайн стоит реальные деньги (Fal + OpenAI). Один прогон ≈ 30 ₽. Не делайте десятки итераций — лучше один полный прогон, потом точечно проверить отдельные эндпоинты.

### 5.0 Quick smoke via test-render script

Для автоматизированного прогона всего пайплайна без ручного заполнения формы и капчи — есть скрипт `scripts/src/test-render.ts`. Он создаёт запись в `designs`, поднимает `startDesignWorker()` в текущем процессе и polling'ом печатает каждый из 11 шагов FSM с таймингами; в конце выдаёт публичный URL `/dizajn/{slug}` и суммарную стоимость из `design_generations.cost_kopeks`.

```cmd
:: Сначала проверка env (dry-run, ничего не пишет в БД, не вызывает Fal/OpenAI):
cmd /c "pnpm --filter @workspace/scripts test-render -- --dry-run"

:: Полный прогон с дефолтами (bedroom/modern, 320×400×270 см, 500 000 ₽, Краснодар).
:: Тратит ~30 ₽ на Fal+OpenAI. НЕ запускайте автоматически в CI.
cmd /c "pnpm --filter @workspace/scripts test-render"

:: Повторное наблюдение за уже созданной записью (если первый прогон упал или
:: вы хотите перезапустить пайплайн после фикса env):
cmd /c "pnpm --filter @workspace/scripts test-render -- --design-id=42"

:: Помощь:
cmd /c "pnpm --filter @workspace/scripts test-render -- --help"
```

Env, нужные скрипту: `DATABASE_URL`, `FAL_API_KEY`, `AI_INTEGRATIONS_OPENAI_API_KEY`, `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. Опционально — `MARKETPLACE_PUBLIC_URL` (для финального URL), `AI_DESIGN_EDIT_PROVIDER`, `DESIGN_COST_CEILING_KOPEKS`. Captcha (`TURNSTILE_*`) и Chromium (`CHROMIUM_REMOTE_PATH`) НЕ нужны: скрипт обходит HTTP-route и не дёргает PDF-renderer. Полный список — `--dry-run` на старте печатает env probe.

После завершения: открыть напечатанный URL в браузере и пройти ручной чек-лист §5.3–§5.5 (страница / PDF / `/dizajn/mine`). §5.1–§5.2 заменяются автоматизированным прогоном, но ручную проверку публичной формы (Turnstile + rate-limit) всё равно стоит сделать хотя бы один раз перед релизом.

### 5.1 Public form → generate (Requirement 1, 3)

1. Открыть `https://chestnye-mastera.ru/ai-design` (или staging-URL).
2. Заполнить форму: `roomType = bedroom` (единственный активный — Requirement 1.3), `style = modern`, `widthCm = 320`, `lengthCm = 400`, `heightCm = 270`, `budget = 500000`. Опционально город.
3. Дождаться загрузки Cloudflare Turnstile widget; пройти challenge.
4. Submit. Ожидаемое:
   - HTTP 202 от `POST /api/marketplace/dizajn/generate`.
   - Cookie `kiro_anon_id` установлена (UUID v4, max-age ≥ 365 дней — Requirement 4.2).
   - Браузер редиректит на `/dizajn/{slug}` с прогрессом 0%.

**Что проверить при сбое:**

- `400 invalid_captcha` — `TURNSTILE_SECRET_KEY` не задан или не совпадает с sitekey, проверяемым в браузере.
- `400 too_small` — введённая площадь меньше минимума (`bedroom ≥ 6 м²`).
- `429 rate_limited` — лимит `anon = 3` или `ip = 5` исчерпан за последние 24 часа (Requirement 3.3, 3.4). На staging — обнулить через `DELETE FROM rate_limit_buckets WHERE bucket_key LIKE 'anon:...';`.

### 5.2 Pipeline progress (Requirement 5)

5. На странице `/dizajn/{slug}` — прогресс-бар обновляется через `GET /api/marketplace/dizajn/{slug}/status` (poll каждые 3s). Должны последовательно появляться шаги: `layout_planning` → `geometric_validation` → `hero_render` → `angle_renders` → `top_down_plan` → `iso_callouts` → `furniture_picking` → `materials_estimate` → `colors` → `ai_content` → `infographic`. Прогресс должен дойти до **100** и `status` стать `completed` (Requirement 5.2).

**Что проверить при сбое:**

- Зависло на `layout_planning` — `AI_INTEGRATIONS_OPENAI_API_KEY` не задан или модель неответственная.
- Зависло на `hero_render` или `angle_renders` — `FAL_API_KEY` не задан или Fal вернул ошибку.
- Зависло на `top_down_plan` — `DEFAULT_OBJECT_STORAGE_BUCKET_ID` или R2 creds не заданы.
- Status = `failed` с error_message «cost_ceiling exceeded» — `DESIGN_COST_CEILING_KOPEKS` слишком низкий или один из провайдеров аномально дорогой.

### 5.3 Public design page (Requirements 8, 9, 10, 11)

6. На `/dizajn/{slug}` после `completed` — должны быть видимы:
   - **6 ракурсов** (1 Hero + 5 Angle) под Requirement 7. Все шесть должны выглядеть как одна и та же комната (стены, палитра, мебель).
   - **Top-down plan** PNG (Requirement 8.6) с подписями стен и мебели.
   - **Isometric callouts** (Requirement 9) — изометрические кропы с подписями ключевой мебели.
   - **Picked furniture rows** (Requirement 10.6) — список SKU с миниатюрой, ценой, габаритами и партнёрской ссылкой.
   - **Real estimate** (Requirement 11) — таблица отделки с city coefficient (если выбран город из топ-30).
   - **AI-текст** (Requirement 12): `h1`, `description`, `solutions[]`.

### 5.4 PDF (Requirement 13)

7. Нажать «Скачать PDF» → `GET /api/marketplace/dizajn/{slug}/pdf`. Ожидаемое:
   - Первый запрос: HTTP 200, `Content-Type: application/pdf`. Latency 5–15 секунд (Puppeteer рендер).
   - Повторный запрос на тот же slug: HTTP 200, latency < 1 секунды (R2-кэш по ключу `dizajn/pdf/{designId}.pdf`, Requirement 13.4).
   - PDF содержит footer с URL `chestnye-mastera.ru/dizajn/{slug}` на каждой странице (Requirement 13.7).
   - URL для скачивания подписан (signed URL через `getSignedUrl` в `lib/objectStorage.ts`). Прямое обращение к R2-ключу без подписи → 403.

**Что проверить при сбое:**

- HTTP 503 — `CHROMIUM_REMOTE_PATH` не задан или `puppeteer-core` / `@sparticuz/chromium-min` не установлены. Страница `/dizajn/{slug}` остаётся доступной (Requirement 13.6).

### 5.5 My designs (Requirement 4)

8. Открыть `/dizajn/mine`. Ожидаемое:
   - Список содержит свежесозданный проект (`anonId` в cookie совпадает с `designs.anon_id`).
   - Карточки сортированы по `createdAt DESC`.
   - Поля карточки: миниатюра `resultImageUrl`, `roomType`, `style`, бейдж `status` (с прогрессом для `generating`), локализованная дата.
   - Пометка «ваш проект» на `/dizajn/{slug}` показывается только своим `anonId` (Requirement 4.4).

**Что проверить при сбое:**

- Список пуст / 500 `anon_id_unavailable` — `anonIdMiddleware` не подмонтирован в express-цепочке. Проверить `app.ts`.

---

## 6. Готовность к запуску — чеклист

Сводный чеклист по всем секциям:

- [ ] Все env из §1.1, §1.2, §1.3, §1.4, §1.5 заданы на стенде. Проверить через Railway dashboard или `printenv`.
- [ ] `psql ...migrations/2026-01-15-ai-design-product.sql` выполнено успешно (§2.1). Запросы из §2.4 возвращают ожидаемые counts.
- [ ] `seedFurniture.ts`, `seedFinishingMaterials.ts`, `seedCityCoefficients.ts` отработали без ошибок (§3). `SELECT COUNT(*)` совпадают с ожидаемыми.
- [ ] Identity-preservation pilot прогнан, победитель зафиксирован в `AI_DESIGN_EDIT_PROVIDER`, секции §7 и §8 в `identity-preservation-pilot.md` заполнены (§4).
- [ ] Smoke-test (§5) пройден полностью: form → pipeline → `/dizajn/{slug}` → PDF → `/dizajn/mine`.
- [ ] PBT-тесты `__tests__/dizajn/*.property.test.ts` — зелёные на CI (уже есть, повторно проверить после деплоя).
