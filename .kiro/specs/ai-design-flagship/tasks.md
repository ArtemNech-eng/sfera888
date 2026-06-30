# Implementation Plan: AI_Design_Flagship

## Overview

Реализация на TypeScript в существующей кодовой базе: backend `artifacts/api-server` (Express + Drizzle + Postgres) и фронт `artifacts/marketplace` (Next.js). Тестовый стэк — Vitest + `fast-check` для property-based тестов; property-тесты живут в `artifacts/api-server/__tests__/dizajn/*.property.test.ts` (минимум 100 итераций на свойство).

Стратегия — расширение, а не переписывание. Фича выпрямляет разорванную цепочку запросов (единый `multipart/form-data` контракт на всём пути `Flagship_Form → Proxy_Route → Generate_Endpoint → Design_Worker`), консолидирует три точки входа в одну каноническую `/dizajn` и доводит загруженное фото до worker для `Image_To_Image_Mode`. Существующие модули (`designWorker.ts`, `dizajnFormSchema.ts`, `designRateLimit.ts`, `turnstile.ts`, `objectStorage.ts`, `app/dizajn/[slug]/page.tsx`, `app/sitemap.ts`) переиспользуются и дорабатываются точечно.

Convert the feature design into a series of prompts for a code-generation LLM that will implement each step with incremental progress. Make sure that each prompt builds on the previous prompts, and ends with wiring things together. There should be no hanging or orphaned code that isn't integrated into a previous step. Focus ONLY on tasks that involve writing, modifying, or testing code.

Каждое property-свойство оформляется отдельным тестом с комментарием-тегом:
`// Feature: ai-design-flagship, Property {number}: {property text}`

## Tasks

- [x] 1. Миграция БД и схема для входной палитры
  - [x] 1.1 Создать миграцию `artifacts/api-server/migrations/2026-XX-XX-ai-design-flagship-palette.sql`
    - `ALTER TABLE designs ADD COLUMN IF NOT EXISTS palette VARCHAR(40);` (nullable, обратная совместимость)
    - _Requirements: 2.4_
  - [x] 1.2 Добавить колонку `palette` в Drizzle-схему `lib/db/src/schema/designs.ts`
    - nullable `varchar(40)`; экспорт типа сохранить совместимым с существующими записями
    - _Requirements: 2.4_

- [x] 2. Агрегирующая валидация запроса (`dizajnFormSchema.ts`)
  - [x] 2.1 Расширить `artifacts/api-server/src/lib/dizajnFormSchema.ts`
    - Добавить `PALETTES` enum + тип `Palette`; интерфейс `PhotoMeta { mime; sizeBytes }`
    - Реализовать `validateGenerateRequest(body, photo)` — коэрсия multipart-строк в числа (`widthCm/lengthCm/heightCm/budget/cityId`), вызов `validateDesignForm` (whitelist `roomType`/`style`, диапазон `budget` 50k..5M, MVP-замок), валидация `palette`, валидация фото (MIME ∈ {image/jpeg,image/png}, размер ≤ 8 МБ), `checkMinArea(roomType,widthCm,lengthCm)` → `room_too_small`
    - Возвращать **список всех** нарушений (`violations[]`) с машиночитаемыми кодами: `invalid_enum_value`, `too_small`/`too_big`, `mvp_room_locked`, `room_too_small`, `invalid_photo_type`, `photo_too_large`, `invalid_palette`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.2, 6.3, 2.4_
  - [x]* 2.2 Property test для отклонения невалидного ввода
    - **Property 5: Invalid input is rejected without creating a project**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6**
    - Файл `__tests__/dizajn/flagship-validation.property.test.ts`; генераторы: невалидные `roomType`/`style`, `budget` вне диапазона, площадь ниже минимума, фото иного MIME, фото > 8 МБ
  - [x]* 2.3 Property test для полного списка нарушений
    - **Property 6: All violations are reported together**
    - **Validates: Requirements 5.7**
    - Генератор: K ≥ 1 независимых нарушений в одном запросе; проверять, что возвращены все K
  - [x]* 2.4 Property test для MVP-замка по типу помещения
    - **Property 7: MVP room lock rejects non-allowed room types with its own code**
    - **Validates: Requirements 6.2**
    - Генератор: валидные по whitelist, но не входящие в MVP-подмножество `Room_Type`; ожидать код `mvp_room_locked`

- [x] 3. Хелпер загрузки фото в Object_Storage
  - [x] 3.1 Реализовать `uploadRoomPhoto(buf, mime)` в `artifacts/api-server/src/lib/objectStorage.ts`
    - Запись в R2 по ключу `dizajn/uploads/{uuid}`; возврат R2-ключа при успехе, throw при сбое стораджа
    - _Requirements: 4.2, 3.5_
  - [x]* 3.2 Unit-тест хелпера загрузки (mocked R2)
    - Успех → возвращается ключ вида `dizajn/uploads/...`; сбой `put` → проброс ошибки
    - _Requirements: 4.2_

- [x] 4. Generate_Endpoint: приём multipart и порядок проверок
  - [x] 4.1 Подключить `multer` memory storage в `artifacts/api-server/src/routes/dizajn.ts`
    - `upload.single("image")`, `limits.fileSize = 8*1024*1024 + 1` (детект превышения как violation, не как ECONNRESET)
    - Гарантировать доступность текстовых полей (`cf-turnstile-response`/`turnstileToken`, параметры формы) в `req.body` после парсинга
    - _Requirements: 4.1, 4.3_
  - [x] 4.2 Реализовать handler `POST /generate` в фиксированном порядке
    - Порядок: `anonId` (500 `anon_id_unavailable`) → `verifyTurnstileToken` (400 `invalid_captcha`) → `checkAndIncrement("anon")` затем `("ip")` (429 `rate_limited` + `retryAfterSeconds`, откат уже учтённого) → `validateGenerateRequest` (400 `violations[]` + откат обоих счётчиков) → загрузка фото → выбор режима → `pickUniqueSlug` → INSERT `designs` (`status:'generating'`) → `202 {ok:true, design:{slug}}`
    - Фото присутствует и валидно → `uploadRoomPhoto` → успех: `inputImageUrl = R2-ключ`, `mode = Image_To_Image`; сбой стораджа: лог, `inputImageUrl = null`, `mode = Text_To_Image` (НЕ отклонять)
    - Фото отсутствует → `inputImageUrl = null`, `Text_To_Image_Mode`; `palette` записать в `designs.palette`
    - _Requirements: 2.7, 3.1, 3.2, 3.4, 3.5, 4.2, 4.4, 4.6, 4.7, 6.2, 7.2, 7.3, 7.4, 7.5_
  - [x]* 4.3 Property test выбора режима генерации
    - **Property 1: Generation mode is determined solely by photo presence**
    - **Validates: Requirements 3.1, 3.2, 3.4, 4.4, 4.7**
  - [x]* 4.4 Property test сохранения и привязки фото
    - **Property 2: Accepted photo is stored and linked**
    - **Validates: Requirements 3.5, 4.2**
  - [x]* 4.5 Property test деградации при сбое стораджа
    - **Property 3: Storage failure degrades to text-to-image without rejecting**
    - **Validates: Requirements 4.6**
  - [x]* 4.6 Property test гейта капчи
    - **Property 8: Captcha gate precedes and gates all side effects**
    - **Validates: Requirements 7.2**
  - [x]* 4.7 Property test rate-limit по двум ключам
    - **Property 9: Rate limiting checks both keys and blocks over-limit requests**
    - **Validates: Requirements 7.3, 7.4**
  - [x]* 4.8 Property test отката счётчиков при ошибке валидации
    - **Property 10: Validation failure rolls back consumed rate-limit counters**
    - **Validates: Requirements 7.5**

- [x] 5. Checkpoint — backend-контракт генерации
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Proxy_Route: сквозной multipart-passthrough
  - [x] 6.1 Обновить `artifacts/marketplace/app/api/dizajn/generate/route.ts`
    - Проксировать `multipart/form-data` без потери данных изображения; добавлять `anonId` из cookie `kiro_anon_id` (или генерировать UUID v4 + `Set-Cookie` 1 год, httpOnly, sameSite=lax); проброс `Authorization: Bearer <internalApiToken>`; без ручного `Content-Type`; status passthrough + `Cache-Control: no-store`
    - _Requirements: 4.1, 4.3_
  - [x]* 6.2 Property test единого контракта (round-trip)
    - **Property 4: Unified contract round-trips fields and photo bytes**
    - **Validates: Requirements 4.1, 4.3**
    - Генераторы: произвольные наборы полей + байтовые буферы фото; проверять сохранность значений и точных байтов, добавление только `anonId`

- [x] 7. Flagship_Form и клиентская квота
  - [x] 7.1 Реализовать/переиспользовать хук `useGenerationQuota` (`localStorage` `sfera_design_quota_v1`)
    - `{ used, tier }`, `FREE_ANON=1`, `remaining = max(0, limit-used)`, `record()` после 202, синхронизация между вкладками через `storage` event
    - _Requirements: 8.1, 8.4, 8.5_
  - [x]* 7.2 Property test списания квоты
    - **Property 12: Successful start consumes exactly one quota unit**
    - **Validates: Requirements 8.4**
  - [x] 7.3 Реализовать клиентский компонент `Flagship_Form` (`artifacts/marketplace/app/dizajn/_FlagshipForm.tsx`)
    - Контролы: file-input фото + preview (опц., JPG/PNG ≤ 8 МБ), плитки `roomType` (не-`bedroom` — disabled + бейдж «скоро»), плитки `style` (7 значений), плитки `palette`, сегмент/ввод `budget`, числовой `area` (м²), Turnstile-виджет `data-action="ai_design_submit"`, бейдж остатка `Free_Quota` (включая «0 осталось»)
    - `deriveRoomDims(areaSqm)` → `widthCm/lengthCm/heightCm`; клиентская предвалидация; сборка `FormData` (+ опц. `image`, `cf-turnstile-response`) и `POST /api/dizajn/generate`
    - При `remaining === 0` → открыть `Paywall_Modal`, не отправлять; per-field/top-level ошибки по `violations`/`error`; сброс Turnstile после неудачи
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 6.1, 7.1, 8.1, 8.2, 8.3_
  - [x]* 7.4 Property test paywall при нулевой квоте
    - **Property 11: Exhausted free quota opens the paywall instead of generating**
    - **Validates: Requirements 8.3**
  - [x] 7.5 Подключить `Flagship_Form` в `artifacts/marketplace/app/dizajn/page.tsx`
    - Страница рендерит ровно одну форму; canonical `/dizajn`; навигация `router.push('/dizajn/'+slug)` после `202` и `record()` один раз
    - _Requirements: 1.1, 1.2, 1.6, 2.7, 8.4_
  - [x]* 7.6 Unit-тест рендера формы и навигации
    - Ровно одна `Flagship_Form` со всеми контролами; заблокированные плитки помечены «скоро»; на mocked 202 — переход на `/dizajn/{slug}` и единичный вызов `record()`
    - _Requirements: 1.1, 2.1, 2.7, 6.1, 8.2_

- [x] 8. Редиректы и консолидация точек входа
  - [x] 8.1 Добавить 308-редиректы в `next.config.*`
    - `/ai-design` → `/dizajn` и `/hochu-takzhe` → `/dizajn` через `redirects()` с `permanent: true`; удалить устаревшие компоненты/обёртки после переноса UX в `Flagship_Form`
    - _Requirements: 1.3, 1.4_

- [x] 9. SEO-страница, маршрутизация, sitemap
  - [x] 9.1 Реализовать/закрепить `parseRoute(segment)` в `app/dizajn/[slug]/page.tsx`
    - Классификация: полный design-slug → full route; валидные комбинации `{room}-{style}`/`{room}`/`{style}` → aggregate route; иначе nothing → 404 + `noindex`
    - _Requirements: 9.6, 10.4_
  - [x]* 9.2 Property test детерминированной классификации маршрутов
    - **Property 15: Route parsing classifies every slug deterministically**
    - **Validates: Requirements 9.6, 10.4**
  - [x] 9.3 Закрепить предикат опроса `shouldContinuePolling(status)` для `Pending_Page`
    - Опрашивать тогда и только тогда, когда статус нетерминальный (`generating`); останавливаться на `completed`/`failed`
    - _Requirements: 2.8_
  - [x]* 9.4 Property test предиката опроса
    - **Property 16: Pending page polls until a terminal status**
    - **Validates: Requirements 2.8**
  - [x] 9.5 Закрепить SEO-метаданные `Public_Page` для завершённых проектов
    - canonical `/dizajn/{slug}`, OpenGraph + Twitter, JSON-LD граф (Article, BreadcrumbList, Service/Offer, ImageObject); ISR `revalidate` сделать конфигурируемым (revalidate=0 ⇒ полностью статическая)
    - _Requirements: 1.5, 9.1, 9.2, 9.3, 9.4, 9.5_
  - [x]* 9.6 Property test полноты SEO-метаданных
    - **Property 13: Completed projects expose full SEO metadata**
    - **Validates: Requirements 1.5, 9.2, 9.3**
  - [x] 9.7 Закрепить исключение незавершённых из индексации в `app/dizajn/[slug]/page.tsx`, `app/sitemap.ts` и агрегатах
    - `noindex` для статусов ≠ `completed`; фильтры `status='completed'` в `fetchPublishedDesignSlugs`/`fetchRecentDesigns`; `Aggregate_Page` и `Sitemap` только `completed`; завершённые остаются в sitemap при временной недоступности ассетов
    - _Requirements: 9.6, 9.7, 10.1, 10.2, 10.3, 10.5_
  - [x]* 9.8 Property test исключения незавершённых проектов
    - **Property 14: Non-completed projects are excluded from indexing everywhere**
    - **Validates: Requirements 10.1, 10.2, 10.3**
  - [x]* 9.9 Property test устойчивости sitemap для завершённых проектов
    - **Property 17: Completed projects persist in the sitemap despite transient unavailability**
    - **Validates: Requirements 10.5**

- [x] 10. Worker: проброс палитры и путь ошибки
  - [x] 10.1 Прокинуть `palette` в построение промпта `Design_Worker` (`artifacts/api-server/src/lib/designWorker.ts`)
    - Опциональный стилевой клаузис из `designs.palette`; не менять существующий контракт выбора стратегии/геометрии/cost guard
    - _Requirements: 3.3, 3.4_
  - [x]* 10.2 Unit-тест пути ошибки text-to-image
    - Сбой text2img → `status='failed'`, без повторов и скрытого восстановления
    - _Requirements: 3.8_

- [x] 11. Интеграция и регрессионная защита разорванной цепочки
  - [x] 11.1 Интеграционный тест: multipart с фото доходит до R2 и заполняет `input_image_url`
    - Реальный JPEG через `Proxy_Route` → mocked R2 `put` → `Generate_Endpoint` сохраняет non-null `input_image_url`, отвечает 202
    - _Requirements: 4.1, 4.2_
  - [x]* 11.2 Регрессионный сквозной тест ранее сломанного пути
    - Утверждать, что путь «форма с фото → прокси → backend» завершается non-null `input_image_url` и 202 (закрытие разрыва из Overview)
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Задачи с постфиксом `*` опциональны (тесты) и могут быть пропущены для ускоренного MVP, но рекомендованы для покрытия свойств.
- Каждая задача ссылается на конкретные пункты `requirements.md`; каждое property-свойство оформлено отдельным тестом с тегом-комментарием.
- Worker-внутренняя логика геометрии/cost guard (Req 3.6/3.7) принадлежит `.kiro/specs/ai-design-quality-fix` и здесь не перетестируется — фича лишь гарантирует корректное заполнение `input_image_url` HTTP-путём.
- Внешние зависимости (R2, Fal AI, Turnstile verify) мокаются в property-тестах ради дешёвых и детерминированных 100+ итераций; реальные R2-раунд-трипы покрыты интеграционными тестами.
- Чекпоинты обеспечивают инкрементальную валидацию между фазами.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1", "7.1", "8.1", "9.1", "9.3"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "3.2", "4.1", "7.2", "9.2", "9.4", "9.5", "9.7", "10.1"] },
    { "id": 3, "tasks": ["4.2", "6.1", "7.3", "9.6", "9.8", "9.9", "10.2"] },
    { "id": 4, "tasks": ["4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "6.2", "7.4", "7.5"] },
    { "id": 5, "tasks": ["7.6", "11.1", "11.2"] }
  ]
}
```
