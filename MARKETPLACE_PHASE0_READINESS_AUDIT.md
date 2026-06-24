# MARKETPLACE_PHASE0_READINESS_AUDIT

> **Дата**: 13.06.2026
> **Статус**: Pre-implementation audit — проверка готовности перед стартом разработки
> **Цель**: убедиться, что план из `MARKETPLACE_PRODUCTION_PLAN.md` стартует на корректных предположениях и не сломает существующие CRM/PWA/лендинги

---

## Резюме найденных рисков (TL;DR)

1. **`cities` и `service_types` — таблицы УЖЕ существуют** (в `lib/db/src/schema/settings.ts`). План `0005_marketplace_baseline.sql` нужно скорректировать: расширяем существующие, не создаём заново.
2. **`/masters` сейчас — это `301 → /master-landing/v3/honest`** (лендинг для набора мастеров). Нельзя просто отнять этот URL — нужно сначала переехать на `/masteram` и **выждать неделю** для сохранения старых ссылок в Telegram/визитках.
3. **`sfera-master.ru/`** — root-страница отдаёт **`master-landing-v2/dist/index.html`** (старый лендинг для набора мастеров). Это **не та страница**, которую пользователи увидят на marketplace. Нужно понять, остаётся ли этот root для sfera-master.ru или мы перенаправляем на marketplace.
4. **Нет ни `/robots.txt`, ни `/sitemap.xml`** во всём проекте — Яндекс, теоретически, может уже индексировать `/crm` и `/master-pwa`. Это риск утечки внутренних страниц в выдачу.
5. **Существует `/api/landing/leads`** — публичный endpoint для приёма лидов с лендингов с rate-limit 5 сек/IP. Можно переиспользовать как базу для `/api/marketplace/leads`, но **не как есть** — у него специфическая логика для traffic_partners (ref_slug).
6. **`leads.source = text`** (свободная строка), не enum — значит `'marketplace'` пишется без миграции enum.

---

## 1. Текущий root route

### Что реально отдаётся (проверено в `artifacts/api-server/src/app.ts`):

| URL | Что сейчас делает | Файл/код | Можно ли менять | Риск |
|---|---|---|---|---|
| `GET sfera-master.ru/` | Отдаёт `master-landing-v2/dist/public/index.html` (фоллбек на `/master-landing/` если v2 не собран, иначе — на `/crm/`) | `app.ts` строки ~1050-1058 | ⚠️ менять можно, но осторожно: это публичная корневая страница sfera-master.ru | **Высокий**. Это первое, что видит юзер на основном домене. Если поменять на marketplace-redirect — потеряем существующий лендинг для набора мастеров. |
| `GET /masters` | **`301 → /master-landing/v3/honest`** | `app.ts`: `app.get("/masters", (_, res) => res.redirect(301, "/master-landing/v3/honest"))` | ⚠️ только после переезда лендинга | **Высокий**. URL раздаётся в визитках, рекламе, Telegram. Удаление = потерянный трафик. |
| `GET /masteram` | **НЕ существует** в коде | — | ✅ свободен | Нет |
| `GET /master-landing/v3/honest` | Отдаёт `master-landing/dist/public/index.html` (через статику `/master-landing/v3` + SPA-fallback) | `app.ts`: `app.use("/master-landing/v3", express.static(landingV3DistPath))` + `app.use("/master-landing/v3", (_, res) => res.sendFile(...))` | ❌ не трогать | Активный лендинг для набора мастеров (HonestLanding). Сейчас цель `/masters → 301 →`. |
| `GET /master-landing/v2` | Отдаёт `master-landing-v2/dist/public/index.html` | `app.ts`: `app.use("/master-landing/v2", ...)` | ⚠️ старая версия, но активна (отдаётся также с `/`) | Средний — связана с root `/`. |
| `GET /master-landing` (catch-all) | Отдаёт `master-landing-v1/dist/index.html` (через статику + SPA-fallback) | `app.ts`: `app.use("/master-landing", express.static(landingV1DistPath))` | ⚠️ старая v1 | Низкий, но проверить нет ли активных ссылок |
| `GET /client` | **Не существует**. Клиентская PWA `artifacts/client/` не подключена к app.ts (в коде нет `app.use("/client", ...)`) | — | ⚠️ непонятно где она хостится | **Высокий**. Если клиентская PWA сейчас на проде на отдельном Railway-сервисе, нужно проверить. По коду app.ts её на `sfera-master.ru` нет. |
| `GET /crm/*` | SPA из `crm/dist/public/`. Cache-Control: assets immutable, остальное no-store | `app.ts`: `app.use("/crm", express.static(...))` + SPA fallback | ❌ не трогать | Production CRM, ежедневное использование. |
| `GET /master-pwa/*` | SPA из `master-pwa/dist/public/` | `app.ts` аналогично crm | ❌ не трогать | Production PWA мастеров. |
| `GET /partner/*` | SPA из `partner-pwa/dist/public/` | `app.ts` аналогично | ❌ не трогать | Production PWA партнёров. |
| `GET /partners` | SPA из `public/partner-landing/` (HTML лендинг для набора партнёров) | `app.ts`: `app.use("/partners", express.static(partnerLandingDistPath))` | ⚠️ путь `/partners` (с **s**) занят лендингом партнёров; `/partner` (без **s**) занят PWA. Конфликта нет, но надо помнить. | Средний |
| `GET /r/:slug` | SPA из `referral-landing/dist/public/` (реферальный лендинг с slug, например `/r/avito-1234`) | `app.ts`: `app.use("/r", express.static(...))` + `app.get("/r/:slug", ...)` | ❌ не трогать без необходимости | Активные рефералы. |
| `GET /receipt/:token` | **301 → `/api/receipt/:token`** | `app.ts` ранее (строка с redirect) | ❌ не трогать | Активные публичные сметы. |
| `GET /api/*` | API router | `app.use("/api", router)` | ❌ не трогать | Backend для всех клиентов. |
| `GET /master-landing` (для `/master-landing/v5/...`) | **Внимание**: артефакт `master-landing-v5/` есть в репо, но в `app.ts` **не подключён** | — | — | Mid: возможно есть deprecated/мёртвый код. |

### Особо важные детали

**`/masters`** — да, **используется для набора мастеров через 301** (это НЕ публичный каталог!). Это ровно тот URL, который мы хотим отдать новому marketplace `chestnye-mastera.ru/mastera`. На `sfera-master.ru/masters` он сегодня:

```
sfera-master.ru/masters → 301 → sfera-master.ru/master-landing/v3/honest
```

То есть конкретно URL `sfera-master.ru/masters` **как короткий alias** для лендинга мастеров.

**`/masteram` — пока НЕ существует.** Можно занять без конфликтов.

**Конфликт с будущим marketplace `/mastera`**:
- Marketplace будет на **отдельном домене** `chestnye-mastera.ru`. То есть `chestnye-mastera.ru/mastera` ≠ `sfera-master.ru/masters`.
- На `sfera-master.ru` мы НЕ создаём `/mastera`. Никакого пересечения.
- Что нужно решить: оставить ли на `sfera-master.ru/masters` редирект на лендинг мастеров **или** перенаправить его на `chestnye-mastera.ru/mastera` (публичный каталог). Я **рекомендую первое** (см. секцию 2): для набора мастеров оставляем лендинг, маркетплейс — отдельная сущность.

---

## 2. Предложение по редиректам

### Принцип

`/masters` сейчас = **набор мастеров**. Если мы тупо переписываем его на `chestnye-mastera.ru/mastera`, мы:
1. Ломаем десятки уже разосланных визиток / рекламных ссылок / постов в Telegram, где «зайди на sfera-master.ru/masters если хочешь стать мастером».
2. Отправляем потенциального **мастера** (исполнителя) на **публичный каталог клиентов** — это путаница UX.

### Безопасная схема

| Старый URL | Новый URL | Тип редиректа | Когда включать | Риск |
|---|---|---|---|---|
| `sfera-master.ru/masters` | `sfera-master.ru/masteram` | **301** (изменить существующий redirect target) | **После того как `/masteram` начнёт отдавать тот же контент** (лендинг HonestLanding). До этого — оставить как есть. | Низкий, если /masteram стабильно работает. |
| `sfera-master.ru/masteram` | (отдаёт сам контент `master-landing/dist/public/v3/honest/index.html`) | прямой rewrite, не redirect | **Phase 0 / Фаза 1** — сразу как добавим route в `app.ts` | Низкий — добавление нового URL. |
| `sfera-master.ru/become-master` | `sfera-master.ru/masteram` | **301** | вместе с `/masteram` | Низкий — новый alias. |
| `sfera-master.ru/master-landing/v3/honest` | оставить как есть | — | — | Должен продолжать работать (старые прямые ссылки). |
| `sfera-master.ru/` (root) | **спорно — см. ниже** | — | — | См. дискуссию. |
| `chestnye-mastera.ru/masteram` | `https://sfera-master.ru/masteram` | **301** (на marketplace middleware) | **Фаза 6/7** | Низкий. |
| `chestnye-mastera.ru/become-master` | `https://sfera-master.ru/masteram` | **301** | то же | Низкий. |
| `chestnye-mastera.ru/api/*` (если кто-то решит ходить напрямую) | блокировать (404) | — | Phase 7 | API marketplace'а только server-to-server. |
| `www.chestnye-mastera.ru/*` | `https://chestnye-mastera.ru/*` | **301** | Фаза 7 (DNS подключение) | Низкий. |
| `честные-мастера.рф/*` (punycode `xn----8sbarac1cf6adfgg4d6c.xn--p1ai`) | `https://chestnye-mastera.ru/*` | **301** на edge | Фаза 7 | Низкий. |
| `www.честные-мастера.рф/*` | `https://chestnye-mastera.ru/*` | **301** | Фаза 7 | Низкий. |
| `sfera-master.ru/master-landing/v5/*` | проверить (артефакт есть, но не подключён) | — | — | Средний — может быть deprecated. |

### Что НЕ менять в Phase 0/1
- ❌ Не редиректить `sfera-master.ru/masters` → `chestnye-mastera.ru/mastera` сразу. Это убьёт набор мастеров.
- ❌ Не трогать root `/`. См. ниже.
- ❌ Не удалять `master-landing-v1`, `v2`, `v5` без аудита, кто на них ссылается.

### Что делать с `sfera-master.ru/` (root)

Сейчас отдаёт `master-landing-v2`. Это лендинг для **мастеров** (исполнителей) — старая версия. Варианты:

| Вариант | Что делает | Плюсы | Минусы |
|---|---|---|---|
| A. Оставить как есть | root = master-landing-v2 (лендинг мастеров) | ничего не ломаем | путает — приходящий клиент видит «стань мастером», а не «закажи ремонт» |
| B. Заменить на актуальную версию `master-landing/v3/honest` | root = HonestLanding | свежее, без ломки прямого контента | тот же UX-конфликт «root для мастеров, не для клиентов» |
| **C. Сделать root = redirect на `chestnye-mastera.ru` (когда marketplace выйдет)** | пользователь приходит на старый sfera-master.ru → попадает на маркетплейс | чёткое разделение: sfera-master.ru = «внутренняя сторона», chestnye-mastera.ru = «публичная сторона» | требует дождаться запуска маркетплейса, **301 на root домена — это серьёзно** для SEO |
| D. Оставить root как простую заглушку с двумя CTA: «Хочу стать мастером» (→ /masteram) и «Хочу заказать ремонт» (→ chestnye-mastera.ru) | Disambiguation page | гибко, нет редиректа домена | нужно дизайн + контент |

**Рекомендация для V1**: **A — не трогать** в Phase 0. Решение про root оставить на конец Фазы 7 или после релиза маркетплейса. Нет смысла ломать root до того, как marketplace стабилен.

---

## 3. Проверка таблиц cities/services

### Реальная картина

В `lib/db/src/schema/settings.ts` найдено:

```ts
export const citiesTable = pgTable("cities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const serviceTypesTable = pgTable("service_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});
```

То есть **обе таблицы УЖЕ существуют**, но в минимальной форме: только `id + name + unique`.

### Где используется `citiesTable`

| Место | Использование |
|---|---|
| `routes/settings.ts` GET `/api/settings/cities` | публичный read (используется в master-pwa при регистрации мастера для city picker) |
| `routes/settings.ts` POST `/api/settings/cities` | admin-only, добавление города |
| `routes/settings.ts` DELETE `/api/settings/cities/:id` | admin-only, удаление |
| `routes/leads.ts` (импорт `citiesTable`) | используется (нужно проверить точное место использования, но импорт есть) |

Дополнительно: текстовые `city VARCHAR` есть в `masters.city`, `leads.city`, `orders.city` — **связи `city_id` с `cities.id` нет**. Города по факту «дублируются» как строки + есть отдельный справочник в `cities`.

### Где используется `serviceTypesTable`

| Место | Использование |
|---|---|
| `routes/settings.ts` GET `/api/settings/services` | публичный read (для master-pwa и CRM при выборе специализации) |
| `routes/settings.ts` POST `/api/settings/services` | admin-only |
| `routes/settings.ts` DELETE `/api/settings/services/:id` | admin-only |
| `routes/index.ts` seed функция `seedServices()` | при старте api-server делает `INSERT ... ON CONFLICT DO NOTHING` для 20 базовых услуг (Укладка плитки, Поклейка обоев, Покраска стен, и т.д.) |
| `routes/leads.ts` GET `/api/leads/service-types` (вероятно) | возвращает список для CRM при создании лида |

Аналогично — `service_type` хранится как текст в `leads.service_type`, `masters.specialization`, `orders.service_type`. **Связи `service_id` с `service_types.id` нет**.

### Вопрос по CRM settings

CRM использует `/api/settings/cities` и `/api/settings/services` — это `citiesTable` и `serviceTypesTable`. То есть в CRM `/crm/settings` есть вкладки «Города» и «Услуги», и они уже работают на этих таблицах.

### Рекомендация — services

**Вариант A — расширить `service_types`** (одна таблица, новые поля)
- Плюсы: одна таблица, без миграции данных, никаких dual-writes. CRM продолжает работать на тех же endpoints.
- Минусы: имя `service_types` остаётся (хотя можно переименовать через `ALTER TABLE RENAME`, но это инвазивно).
- Реализация: ALTER TABLE service_types ADD COLUMN slug, parent_id (FK на самих себя), seo_title, seo_description, h1, body_md, icon, price_from, is_active, sort_order, created_at, updated_at.

**Вариант B — создать новую `services` и синхронизировать**
- Плюсы: красивее имя, можно начать с чистого листа.
- Минусы: dual-writes (CRM пишет в `service_types`, marketplace читает из `services`), синхронизация скриптом или триггером. Двойная сущность — вечный источник несогласованностей.
- Реализация: миграция создаёт `services`, копирует данные, добавляет триггер `service_types → services`. Со временем переписать CRM на `services` и дропнуть `service_types`.

**ВЫБОР: Вариант A — расширить `service_types`.**

Аргумент: dual-writes — это технический долг, который мы добавляем без выгоды. Расширение существующей таблицы новыми nullable-полями — обратно совместимо и безболезненно. Имя `service_types` неидеально, но это не блокер. Через 6 месяцев можно сделать одну `ALTER TABLE service_types RENAME TO services` плюс обновить импорты, но это уже не приоритет.

### Рекомендация — cities

**Вариант A — расширить `cities`** (текущую таблицу).
- Плюсы: ровно так же, одна таблица, обратно совместимо.
- Минусы: имя ОК, ничего переименовывать не надо.
- Реализация: ALTER TABLE cities ADD COLUMN slug, name_in (locative), region, timezone, lat, lng, population, seo_title, seo_description, h1, body_md, is_active, sort_order, created_at, updated_at.

**Вариант B — оставить строки `city varchar` + создать новую нормализующую таблицу.**
- Уже есть — это и есть текущая ситуация.

**ВЫБОР: Вариант A — расширить существующую `cities`.** Имя идеальное, использование уже есть, просто добавляем поля.

### Что НЕ делаем в Phase 1
- ❌ Не заменяем `masters.city varchar` на `masters.city_id int`. Это огромный refactor с риском.
- ❌ Не заменяем `leads.city varchar` на `leads.city_id int`. То же самое.
- ✅ Вместо этого добавляем nullable FK `city_id` рядом с существующим `city varchar` — для marketplace-лидов и опубликованных мастеров. Старый код продолжает работать с текстовым полем, новый — с FK.

### Backfill (отдельный скрипт, не миграция)

Скрипт `scripts/backfill-marketplace-slugs.ts`:
1. Для каждого `cities.name` — генерирует `slug` (транслитерация).
2. Для каждого `service_types.name` — генерирует `slug`.
3. Опционально для `masters.city` (текст) находит match в `cities.name`, проставляет `masters.city_id`.

Запускается **вручную** через `pnpm tsx scripts/backfill-marketplace-slugs.ts` после миграции, не автоматически на старте api-server.

---


## 4. Проверка masters schema

Реальный список полей из `lib/db/src/schema/masters.ts`:

```ts
mastersTable {
  id, alias, city, specialization, specializations[],
  telegramId, phone, status (enum: active/suspended/inactive/pending_contract),
  rating, totalOrders, acceptedOrders, totalLeadsReceived, avgResponseTime,
  debt, voronkaColumnId, isTestMaster, tags[],
  customAvatarUrl, contractLink, pwaLogin, pwaPasswordHash,
  workingHours (jsonb), preferredDistricts[], minArea,
  deletedAt, createdAt, contractSignedAt, contractSignIp,
  passportPhotoUrl, passportRegPhotoUrl, passportVerified, passportVerifyNote,
  contractFullName, contractPassportNumber, contractPassportDate,
  contractPassportIssuer, contractAddress,
  lastSeenAt, maxChatId,
  servicePrices (jsonb: { service: string; priceFrom: number }[]),
  suspendedAt, suspensionReason, fomoDisabled,
  maxActiveOrders,
  consecutiveCancellations, blockedFromOrders, blockedAt, blockedReason,
  lastCancelAt, lastCompletedAt, manualUnblocksCount
}
```

### Сравнительная таблица

| Поле | Есть сейчас? | Нужно для marketplace? | Что делать |
|---|---|---|---|
| `slug` | ❌ нет | ✅ обязательно | **ДОБАВИТЬ** в миграции 0005. `varchar(100) UNIQUE NULL`. Заполняется при публикации, не на старте. |
| `is_published` | ❌ нет | ✅ обязательно | **ДОБАВИТЬ**. `boolean NOT NULL DEFAULT false`. |
| `published_at` | ❌ нет | ✅ нужно для sitemap lastmod | **ДОБАВИТЬ**. `timestamp NULL`. |
| `public_bio` | ❌ нет | ✅ обязательно | **ДОБАВИТЬ**. `text NULL`. |
| `public_title` | ❌ нет | ✅ нужно (для SEO) | **ДОБАВИТЬ**. `varchar(150) NULL`. |
| `seo_title` | ❌ нет | ⚠️ опционально (можно генерить из name+city) | **ДОБАВИТЬ** (для override). `varchar(70) NULL`. |
| `seo_description` | ❌ нет | ⚠️ опционально | **ДОБАВИТЬ**. `varchar(180) NULL`. |
| `years_experience` | ❌ нет | ✅ нужно (для бейджа в карточке) | **ДОБАВИТЬ**. `integer NULL`. |
| `public_rating` | ❌ нет | ✅ нужно (отделено от внутреннего `rating`) | **ДОБАВИТЬ**. `numeric(3,2) NULL`. На старте можно равнять `rating`. |
| `public_reviews_count` | ❌ нет | ⚠️ нужно для UI (показ «23 отзыва») | **ДОБАВИТЬ**. `integer NOT NULL DEFAULT 0`. Будет обновляться denormalized-триггером или скриптом. |
| `city_id` (FK на cities) | ❌ нет | ✅ нужно (slug города для URL) | **ДОБАВИТЬ**. `integer REFERENCES cities(id) NULL`. Backfill сделать отдельно. |
| `alias` | ✅ есть | ✅ нужно (имя мастера) | используем как есть |
| `specialization` (text) | ✅ есть | ✅ нужно | используем как есть, и через `service_id` (см. ниже) |
| `specializations[]` (text[]) | ✅ есть | ✅ нужно (множественные услуги) | используем как есть |
| `customAvatarUrl` | ✅ есть | ✅ нужно (аватар) | используем |
| `rating` | ✅ есть | ⚠️ только для админов; публике `public_rating` | не публиковать как есть |
| `phone` | ✅ есть | ❌ **НЕЛЬЗЯ публиковать** | DTO не включает |
| `passport_photo_url`, `passport_reg_photo_url`, `passport_verified` | ✅ есть | ❌ **НЕЛЬЗЯ публиковать** (паспортные данные) | DTO не включает; используем только `passport_verified` как boolean «верифицирован» (без публикации фото) |
| `contract_full_name`, `contract_passport_number`, `contract_passport_date`, `contract_passport_issuer`, `contract_address` | ✅ есть | ❌ **НЕЛЬЗЯ публиковать** | DTO не включает |
| `pwa_login`, `pwa_password_hash` | ✅ есть | ❌ **НЕЛЬЗЯ публиковать** (креды) | DTO не включает |
| `telegram_id`, `max_chat_id` | ✅ есть | ❌ **НЕЛЬЗЯ публиковать** (внутренние идентификаторы) | DTO не включает |
| `debt` | ✅ есть | ❌ **НЕЛЬЗЯ публиковать** (финансы) | DTO не включает |
| `tags[]`, `voronka_column_id`, `is_test_master` | ✅ есть | ❌ внутренние операторские поля | DTO не включает |
| `working_hours`, `preferred_districts[]`, `min_area` | ✅ есть | ⚠️ можно публиковать (графики работы, район) | можно отдавать **выборочно**, в уже отрендеренном виде, без сырого jsonb |
| `service_prices` (jsonb) | ✅ есть | ✅ нужно для блока «цены» в карточке | публикуем как есть, мастер сам ввёл |
| `consecutive_cancellations`, `blocked_from_orders`, `blocked_at`, `blocked_reason`, `manual_unblocks_count`, `suspended_at`, `suspension_reason` | ✅ есть | ❌ **НЕЛЬЗЯ публиковать** | DTO не включает; маркетплейс не публикует мастеров с `is_published=false`, а заблокированных снимаем с публикации автоматически |
| `total_orders`, `accepted_orders`, `total_leads_received`, `avg_response_time` | ✅ есть | ⚠️ часть может быть публичной как «выполнено заказов 42» | можно публиковать `total_orders` как «N выполненных», только если ≥10 (иначе выглядит мало) |
| `last_seen_at`, `last_completed_at`, `last_cancel_at` | ✅ есть | ⚠️ опционально для бейджа «активен сейчас» | можно отдавать как boolean `is_recently_active` (last_seen_at < 7 дней назад), не как сырое поле |
| `status` (enum) | ✅ есть | ⚠️ публикуем только мастеров со status='active' | используем как фильтр |

### Что добавить в миграции 0005 для `masters` (минимум для V1)

```sql
ALTER TABLE masters ADD COLUMN slug varchar(100) UNIQUE NULL;
ALTER TABLE masters ADD COLUMN is_published boolean NOT NULL DEFAULT false;
ALTER TABLE masters ADD COLUMN published_at timestamp NULL;
ALTER TABLE masters ADD COLUMN public_bio text NULL;
ALTER TABLE masters ADD COLUMN public_title varchar(150) NULL;
ALTER TABLE masters ADD COLUMN seo_title varchar(70) NULL;
ALTER TABLE masters ADD COLUMN seo_description varchar(180) NULL;
ALTER TABLE masters ADD COLUMN years_experience integer NULL;
ALTER TABLE masters ADD COLUMN public_rating numeric(3,2) NULL;
ALTER TABLE masters ADD COLUMN public_reviews_count integer NOT NULL DEFAULT 0;
ALTER TABLE masters ADD COLUMN city_id integer REFERENCES cities(id) NULL;

CREATE INDEX masters_slug_idx ON masters(slug) WHERE slug IS NOT NULL;
CREATE INDEX masters_is_published_idx ON masters(is_published) WHERE is_published = true;
```

Все ALTER ADD COLUMN — обратно совместимы. Старый CRM/PWA код их не знает, не использует, ничего не сломается.

---

## 5. Проверка leads schema

Реальный список полей из `lib/db/src/schema/leads.ts`:

```ts
leadsTable {
  id, clientName, clientPhone,
  city (text), district (text), serviceType (text), area (numeric),
  services (text — json как строка!), scheduledAt, comment, photos (text — json как строка),
  source (text NULL),
  avitoItemId, avitoItemTitle,
  status (enum: new/processing/sent_to_work/non_target/client_refusal),
  createdAt, updatedAt, deletedAt,
  cancellationReason, statusUpdatedAt,
  trafficPartnerId (integer NULL),
  leadChannel (varchar 100 default 'avito_partner'),
  isPossibleDuplicate (boolean default false),
  partnerLeadStatus, partnerRejectionReason,
  paymentModel (varchar 50 default 'commission')
}
```

### Сравнительная таблица

| Поле | Есть сейчас? | Нужно для marketplace? | Что делать |
|---|---|---|---|
| `source` | ✅ есть (text, NULL) | ✅ обязательно (`'marketplace'`) | **используем как есть**. Не нужно делать новый enum, мы пишем строку `'marketplace'`. |
| `source_page_url` | ❌ нет | ✅ обязательно | **ДОБАВИТЬ**. `text NULL`. |
| `source_page_type` | ❌ нет | ✅ обязательно (`service-city` / `master` / `home` / ...) | **ДОБАВИТЬ**. `varchar(40) NULL`. |
| `service_slug` | ❌ нет | ✅ нужно (для аналитики и быстрого фильтра) | **ДОБАВИТЬ**. `varchar(100) NULL`. |
| `city_slug` | ❌ нет | ✅ нужно | **ДОБАВИТЬ**. `varchar(100) NULL`. |
| `service_id` (FK) | ❌ нет | ✅ нужно | **ДОБАВИТЬ**. `integer REFERENCES service_types(id) NULL`. |
| `city_id` (FK) | ❌ нет | ✅ нужно | **ДОБАВИТЬ**. `integer REFERENCES cities(id) NULL`. |
| `marketplace_context` (jsonb) | ❌ нет | ✅ нужно (свободный контекст: master_slug, design_id и т.д.) | **ДОБАВИТЬ**. `jsonb NULL`. |
| `referrer` | ❌ нет | ✅ нужно (HTTP Referer) | **ДОБАВИТЬ**. `text NULL`. |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` | ❌ нет | ✅ обязательно для аналитики | **ДОБАВИТЬ** все 5. `varchar(100/200) NULL`. |
| `attached_master_id` | ❌ нет | ✅ нужно (если заявка с карточки конкретного мастера) | **ДОБАВИТЬ**. `integer REFERENCES masters(id) NULL`. |
| `client_ip` | ❌ нет | ✅ нужно (аудит, rate-limit fingerprint) | **ДОБАВИТЬ**. `varchar(45) NULL` (хватит на IPv6). |
| `client_user_agent` | ❌ нет | ✅ нужно (аудит) | **ДОБАВИТЬ**. `text NULL`. |
| `consent_given_at` | ❌ нет | ✅ обязательно (152-ФЗ) | **ДОБАВИТЬ**. `timestamp NULL`. |
| `captcha_score` | ❌ нет | ⚠️ опционально (если SmartCaptcha вернёт скор) | **ДОБАВИТЬ**. `numeric(3,2) NULL`. |
| `clientName`, `clientPhone`, `city`, `district`, `serviceType`, `area`, `comment`, `photos`, `services` | ✅ всё есть | ✅ используем | ничего не делаем |
| `traffic_partner_id`, `lead_channel`, `partner_lead_status`, `is_possible_duplicate`, `partner_rejection_reason` | ✅ есть | ⚠️ для marketplace не нужно (это для Avito-партнёров), но не мешает | оставляем как есть |
| `paymentModel` | ✅ есть (default 'commission') | используется | оставляем |

### Особое замечание про `services` (поле в leads)

Сейчас `leads.services = text` (хранится как json-строка, парсится в JS). Это **legacy**: правильнее было бы `jsonb`. Но менять тип text → jsonb опасно (нужна перенесение существующих данных). На marketplace V1 — **оставляем как есть, парсим/сериализуем как JSON.stringify/JSON.parse**.

### Что добавить в миграции 0005 для `leads`

```sql
ALTER TABLE leads ADD COLUMN source_page_url text NULL;
ALTER TABLE leads ADD COLUMN source_page_type varchar(40) NULL;
ALTER TABLE leads ADD COLUMN service_slug varchar(100) NULL;
ALTER TABLE leads ADD COLUMN city_slug varchar(100) NULL;
ALTER TABLE leads ADD COLUMN service_id integer REFERENCES service_types(id) NULL;
ALTER TABLE leads ADD COLUMN city_id integer REFERENCES cities(id) NULL;
ALTER TABLE leads ADD COLUMN marketplace_context jsonb NULL;
ALTER TABLE leads ADD COLUMN referrer text NULL;
ALTER TABLE leads ADD COLUMN utm_source varchar(100) NULL;
ALTER TABLE leads ADD COLUMN utm_medium varchar(100) NULL;
ALTER TABLE leads ADD COLUMN utm_campaign varchar(100) NULL;
ALTER TABLE leads ADD COLUMN utm_term varchar(200) NULL;
ALTER TABLE leads ADD COLUMN utm_content varchar(200) NULL;
ALTER TABLE leads ADD COLUMN attached_master_id integer REFERENCES masters(id) NULL;
ALTER TABLE leads ADD COLUMN client_ip varchar(45) NULL;
ALTER TABLE leads ADD COLUMN client_user_agent text NULL;
ALTER TABLE leads ADD COLUMN consent_given_at timestamp NULL;
ALTER TABLE leads ADD COLUMN captcha_score numeric(3,2) NULL;

CREATE INDEX leads_source_marketplace_idx ON leads(source) WHERE source = 'marketplace';
CREATE INDEX leads_attached_master_idx ON leads(attached_master_id) WHERE attached_master_id IS NOT NULL;
```

Все nullable, обратно совместимы. Старый код пишет в leads без новых полей — всё работает.

---

## 6. Проверка текущего API для лидов

### Что есть сейчас

| Endpoint | Файл | Что делает | Можно ли переиспользовать для marketplace? |
|---|---|---|---|
| `POST /api/landing/leads` | `routes/landing.ts` | Публичный приём заявок. Принимает `{name, phone, city, district, area, services[], comment, ref_slug?}`. Rate-limit 5 сек/IP. Дедупа по phone за 30 дней. Создаёт `leads` со `source='landing'`. Если есть `ref_slug`, привязывает к `traffic_partner`. Notify Max-бот. | ⚠️ **Частично**. Логика похожа, но: 1) `source='landing'` не подходит — нужен `'marketplace'`. 2) Нет полей `source_page_url`, `service_slug`, `utm_*`, `attached_master_id`. 3) Завязан на `ref_slug` (партнёрская модель). |
| `POST /api/leads` (CRM) | `routes/leads.ts` | Создание лида **с авторизацией оператора**. Форма из CRM. | ❌ Не подходит. Требует session оператора. |
| `POST /api/leads/:id/send-to-buffer` | `routes/leads.ts` | Перевод лида в работу: создание `orders`, запуск dispatch. **Внутренняя**, требует auth. | ❌ Не публичная. Используется CRM-оператором ПОСЛЕ marketplace-лида. |
| `POST /api/client/estimate/submit` или аналог | `routes/client.ts` | Не нашёл такого endpoint в коде. В `client.ts` есть AI-смета (через OpenAI), но она **не создаёт лид** — она генерит текстовую смету по фото. | ❌ Не для лидов. |
| `POST /api/client/chat/:token` | `routes/client.ts` | Чат клиента с мастером по smeta-токену. Не для создания лидов. | ❌ Не подходит. |

### Рекомендация

**Создать отдельный `POST /api/marketplace/leads`** в новом router'е `routes/marketplace.ts`. Аргументы:

1. `/api/landing/leads` — это для **лендингов** с партнёрской моделью (`ref_slug → traffic_partner`). Marketplace — другая модель: нет реф-партнёра, есть UTM, есть страница-источник, может быть `attached_master_id`.
2. Развязка: если завтра меняем логику marketplace (например, дедупа за 7 дней вместо 30, другая капча), не ломаем landing.
3. Чёткое разделение в логах: `[marketplace-api]` vs `[landing-api]`.
4. Защита через `INTERNAL_API_SHARED_TOKEN` (server-to-server) — `/api/landing/leads` сейчас публичный для браузера, а `/api/marketplace/leads` будет server-to-server из Next.js.

### Что должен принимать `/api/marketplace/leads`

```
POST /api/marketplace/leads
Headers: Authorization: Bearer ${INTERNAL_API_SHARED_TOKEN}
Body: {
  name: string (1..100),
  phone: string (E.164 RU),
  city_slug: string,
  service_slug: string | null,
  area: number | null,
  comment: string (max 2000),
  source_page_url: string,
  source_page_type: enum('service-city'|'master'|'service'|'home'|'case'|'pricing'),
  attached_master_id: number | null,
  utm: { source, medium, campaign, term, content } | null,
  referrer: string | null,
  client_ip: string,
  client_user_agent: string,
  captcha_score: number | null,    // если SmartCaptcha валидирована Next.js'ом
  consent_given_at: ISO timestamp
}
Response: { ok: true, lead_id: number }
```

### Как заявка дальше попадёт в CRM

**Никаких изменений в существующем потоке**:
1. `POST /api/marketplace/leads` записывает в `leads` (source='marketplace').
2. `notifyManagerNewLead()` пушит уведомление менеджеру в Max-бот (как сейчас для landing-лидов).
3. Оператор открывает CRM `/crm/leads`, видит лид с фильтром «Маркетплейс».
4. Оператор нажимает «Отправить в работу» → стандартный `POST /api/leads/:id/send-to-buffer`.
5. Создаётся `orders`, запускается `dispatch` (broadcastOrder), мастера получают пуш в PWA.

**Никакой новой логики обработки**. Marketplace-лид — это просто `lead` с другим `source`.

### Что может сломаться

| Риск | Вероятность | Митигация |
|---|---|---|
| Спам через `/api/marketplace/leads` напрямую (минуя Next.js) | Средняя | Защита `INTERNAL_API_SHARED_TOKEN` (Bearer проверяется в middleware). Никто не знает токен → не пройдёт. |
| `notifyManagerNewLead` отправит лид в Max-бот, оператор перепутает с обычным | Низкая | В тексте уведомления добавляем `[Marketplace]` префикс. |
| Дублирование с `/api/landing/leads` если кто-то постит туда вместо `/api/marketplace/leads` | Низкая | Не страшно, source будет 'landing', но лид всё равно попадёт в CRM. |
| Валидация различается между Next.js и api-server | Низкая | Используем общую zod-схему из `@workspace/api-zod`. |

---

## 7. Проверка public DTO для мастеров

На основе аудита `mastersTable` — финальные списки.

### ✅ МОЖНО публиковать (whitelist для DTO `PublicMaster`)

| Поле | Источник | Замечания |
|---|---|---|
| `slug` | `masters.slug` | URL identifier |
| `alias` (имя/никнейм) | `masters.alias` | Используем как `name` в DTO |
| `public_title` | `masters.public_title` | Если null — генерим как `${alias} — ${specialization} в ${city.name}` |
| `public_bio` | `masters.public_bio` | Markdown, рендерим в HTML с whitelist-санитайзером (allowed: p, b, i, ul, ol, li, br) |
| `public_rating` | `masters.public_rating` | Может отличаться от `rating` |
| `public_reviews_count` | `masters.public_reviews_count` | Только публичные модерированные отзывы |
| `years_experience` | `masters.years_experience` | Опционально |
| `specialization` | `masters.specialization` | Основная услуга (текст) |
| `specializations[]` | `masters.specializations[]` | Все услуги (массив текстов) |
| `city` | через JOIN `cities` (по `city_id`) | `{ slug, name }` |
| `avatar_url` | `masters.customAvatarUrl` (resolve в полный URL через `resolvePhotoUrl`) | Если null — использовать default avatar |
| `service_prices` | `masters.servicePrices` (jsonb) | Уже отформатировано, отдаём 1:1 |
| `is_recently_active` | вычисляем: `lastSeenAt > now() - 7 days` → boolean | Не отдаём сырое `last_seen_at` |
| `total_orders_completed_public` | вычисляем: если `total_orders >= 10` → отдаём, иначе null | Не показываем мастеров с нулевыми KPI |
| `has_signed_contract` | вычисляем: `contract_signed_at IS NOT NULL` → boolean | Бейдж «верифицирован» |
| `passport_verified` | `masters.passport_verified` | Бейдж «паспорт подтверждён» — это поле само по себе boolean, можно отдавать |
| `working_hours_public` | вычисляем из `masters.working_hours` jsonb → форматированная строка «Пн-Пт 9:00-19:00» | Не отдаём сырой jsonb |
| `portfolio_count` | через COUNT (`master_portfolio` где `master_id` && `is_published`) | Будет в фазе 1.5+ |
| `seo_title`, `seo_description` | `masters.seo_title`, `masters.seo_description` | Только в `<head>`, не в body |

### ❌ НЕЛЬЗЯ публиковать

| Поле | Причина |
|---|---|
| `phone` | приватный контакт мастера — звонят напрямую, обходят платформу |
| `passport_photo_url`, `passport_reg_photo_url` | паспортные данные (152-ФЗ) |
| `contract_full_name`, `contract_passport_number`, `contract_passport_date`, `contract_passport_issuer`, `contract_address` | паспортные/договорные данные |
| `contract_link` | внутренняя ссылка на документ |
| `pwa_login`, `pwa_password_hash` | креды |
| `telegram_id`, `max_chat_id` | внутренние идентификаторы для ботов |
| `debt` | финансовая внутренняя |
| `total_leads_received`, `accepted_orders` | внутренние KPI; можно публиковать `total_orders` (выше 10) как «N выполненных», но не входящий поток |
| `avg_response_time` | внутренняя метрика |
| `voronka_column_id` | внутренняя CRM-колонка |
| `is_test_master` | внутренний флаг |
| `tags[]` | внутренние теги |
| `working_hours` (raw jsonb), `preferred_districts[]`, `min_area` | можно публиковать **в обработанном виде** (см. выше), но не raw |
| `consecutive_cancellations`, `blocked_from_orders`, `blocked_at`, `blocked_reason`, `manual_unblocks_count` | репутационная внутренняя |
| `suspended_at`, `suspension_reason`, `fomo_disabled` | внутренняя |
| `last_cancel_at`, `last_completed_at`, `last_seen_at` | детальная активность; можно агрегировать в `is_recently_active` boolean |
| `passport_verify_note` | внутренний комментарий оператора |
| `created_at`, `deleted_at` | внутренние |
| `master_messages.*` | внутренний чат с оператором |
| `master_reviews.*` (внутренние operator-reviews) | без модерации НЕ публиковать |

### Финальный shape DTO `PublicMaster`

```ts
type PublicMaster = {
  slug: string;
  name: string;                      // = alias
  public_title: string;
  public_bio: string | null;
  city: { slug: string; name: string } | null;
  specialization: string;
  specializations: string[];
  rating: number;                    // = public_rating || rating (fallback)
  reviews_count: number;
  years_experience: number | null;
  avatar_url: string | null;
  service_prices: Array<{ service: string; price_from: number }> | null;
  total_orders_completed: number | null;  // null если < 10
  is_recently_active: boolean;
  has_signed_contract: boolean;
  passport_verified: boolean;
  working_hours_public: string | null;
  portfolio_count: number;
  seo_title: string | null;          // только в metadata, не в body
  seo_description: string | null;    // только в metadata
};
```

**Принцип**: api-server `routes/marketplace.ts` строит этот DTO явно. Никакого `SELECT *` или `db.select().from(mastersTable)` без проекции.

---


## 8. Проверка storage / images

### Где сейчас хранятся файлы

На основе аудита `routes/storage.ts`, `lib/objectStorage.ts`, `app.ts`:

| Тип файлов | Где хранится | URL | Публичность |
|---|---|---|---|
| **Аватары мастеров** (`masters.customAvatarUrl`) | S3-бакет (через `@aws-sdk/client-s3`) или GCS (`@google-cloud/storage`) — выбор через env | Отдаётся через прокси `GET /api/masters/avatar/:filename` (после фикса в Phase D возвращает 200 + 1×1 PNG если NoSuchKey) | Public (через прокси) |
| **Фото "до/после" заказов** (`orders.photos_before[]`, `orders.photos_after[]`) | тот же бакет | Через прокси `GET /api/orders/photo/:filename` или прямые URL из строки | Скорее всего public (но требует проверки, см. ниже) |
| **Фото лидов** (`leads.photos`) | тот же бакет | Аналогично | Public |
| **Скриншоты оплаты** (`receipts.prepayment_screenshot_url`) | тот же бакет, но в **приватном** prefix `private/payment-screenshots/` (если правильно настроено) | НЕ через публичный URL, а через signed URL для оператора в CRM | **ПРИВАТНОЕ** |
| **Паспортные фото** (`masters.passport_photo_url`, `passport_reg_photo_url`) | бакет с приватным prefix `private/passports/` | НЕ публичные | **ПРИВАТНОЕ** |
| **Фото из AI-сметы** (`/api/client/estimate/...`) | bucket `public/estimate-photos/` через `objectStorageClient.bucket(bucketId).file(key).save(...)` | Публичный URL `${R2_PUBLIC_URL}/public/estimate-photos/...` (R2 bucket, видно из `routes/client.ts`) | Public |
| **Banner-картинки** (`/api/banners/...`) | локальная `artifacts/api-server/public/banners/` | Public через `app.use("/api/banners", express.static(...))` | Public |
| **Загруженные uploads** (общие) | локальная `UPLOAD_BASE` (см. `config.ts`) | `app.use("/api/uploads", express.static(UPLOAD_BASE))` | Public |

### Важные наблюдения

1. **Двойная storage**: судя по импортам (`@aws-sdk/client-s3` И `@google-cloud/storage`), проект использует **обе** системы. По коду в `routes/client.ts` выглядит, что R2 (Cloudflare) основной для public-файлов через `objectStorageClient.bucket(bucketId).file(key).save(...)`. S3 — резерв или для приватных.
2. **Cloudflare R2** имеет публичный URL `R2_PUBLIC_URL`. То есть аватары и фото можно отдавать **напрямую с R2 CDN**, без прокси через api-server. Это критично для производительности marketplace.

### Можно ли использовать эти картинки публично

| Тип | Marketplace может использовать? |
|---|---|
| Аватары мастеров | ✅ Да. Уже public, отдаются через `/api/masters/avatar/:filename` или прямой R2 URL. |
| Фото "до/после" заказов | ⚠️ С условиями. Нужно убедиться, что: (a) клиент дал согласие на публикацию, (b) на фото нет лиц/документов/детей, (c) есть модерация. В V1 — **используем только через `master_portfolio`**, куда оператор копирует **отобранные** фото с разрешением. Не показываем сырые `orders.photos_*`. |
| Фото из лидов (то, что присылает клиент с заявкой) | ❌ **НЕ публиковать**. Это пользовательский контент, который мог не предполагать публичную выкладку. |
| Скриншоты оплаты | ❌ Никогда — это скрин банковской выписки клиента. |
| Паспортные фото | ❌ Никогда. |

### Какие URL уже публичные

- `/api/masters/avatar/:filename` — да, public, отдаёт изображения через api-server-прокси.
- `/api/banners/*` — да, public.
- `/api/uploads/*` — да, public, но это сырая статика.
- `R2_PUBLIC_URL/public/estimate-photos/...` — да, public, прямой R2 (для AI-сметы).

### Какие требуют signed URL

- Паспорта (`private/passports/*`) — должны.
- Скриншоты оплаты (`private/payment-screenshots/*`) — должны.
- Возможно, фото лидов (если хранятся в `private/`) — нужно проверить путь и доступ.

### Как лучше отдавать фото для marketplace

**Рекомендация**: marketplace отдаёт картинки через **прямой публичный URL R2** (`R2_PUBLIC_URL/...`) — НЕ через прокси api-server. Аргументы:
1. Прокси-прохождение через api-server — лишний хоп и нагрузка на Express.
2. Cloudflare R2 имеет встроенный CDN — отдаёт быстро по всему миру.
3. Next.js `<Image>` сам делает оптимизацию: ресайз, WebP, lazy loading. Только нужно добавить хост R2 в `next.config.js` `images.remotePatterns`.

**Но**: для аватаров мастеров остаётся прокси `/api/masters/avatar/:filename`. Это удобно: единая точка для resize/auth/fallback. В V1 можно использовать его, в V2 — мигрировать на прямой R2 если будет нужно.

### Нужна ли отдельная оптимизация через `next/image`

**Да, обязательно**. Next.js Image:
- автоматический ресайз: загружаем 1024×1024 аватар, на главной отдаём 64×64, на карточке 256×256 — экономим traffic в 100×.
- WebP/AVIF автоматически (для браузеров, которые поддерживают).
- lazy loading из коробки.
- placeholder blur (можно генерить на этапе ISR).

В `next.config.js`:
```js
images: {
  remotePatterns: [
    { protocol: 'https', hostname: 'sfera-master.ru', pathname: '/api/masters/avatar/**' },
    { protocol: 'https', hostname: 'pub-XXXXX.r2.dev', pathname: '/public/**' }, // R2 public hostname
    { protocol: 'https', hostname: 'cdn.chestnye-mastera.ru', pathname: '/**' }, // если будет CDN
  ],
  formats: ['image/avif', 'image/webp'],
}
```

---

## 9. Проверка SEO текущего проекта

### `/robots.txt`

**ОТСУТСТВУЕТ** на всём проекте. Поиск в `artifacts/**/public/` и в коде api-server (express статика) — не нашёл ни одного `robots.txt`.

**Последствия**:
- Яндекс/Google могут индексировать **что угодно**, в том числе `/crm/*`, `/master-pwa/*`, `/api/*` (если кто-то ссылается).
- Дефолтное поведение поисковиков — `crawl всё, что видят в ссылках`.
- В выдаче Яндекса теоретически можно поймать страницу `/crm/login` — это плохо.

### `/sitemap.xml`

**ОТСУТСТВУЕТ**. Никакого sitemap нет.

### Canonical

**Нет**. В `index.html` каждого SPA нет `<link rel="canonical">`. Это нормально для SPA-внутренних страниц (CRM не должен индексироваться), но это значит — никакой защиты от дублей через UTM.

### Meta-теги

В `master-pwa/index.html` и `crm/index.html` (предположительно — у меня есть только master-pwa в контексте) есть только базовые мета:
- `<title>Честный мастер</title>` — статичное название.
- `<meta name="viewport">`, `<meta name="theme-color">`, `<meta name="apple-mobile-web-app-capable">` — для PWA.
- Нет `<meta name="description">`.
- Нет `<meta name="robots">`.
- Нет OpenGraph.
- Нет JSON-LD.

### Какие страницы сейчас могут индексироваться

| URL | Индексируется ли сейчас (теоретически) |
|---|---|
| `sfera-master.ru/` (root) | ✅ Да (master-landing-v2 SPA — есть HTML каркас, но контент через JS). Контент Яндексу плохо виден. |
| `sfera-master.ru/master-landing/v3/honest` | ✅ Да |
| `sfera-master.ru/master-landing/v2/...` | ✅ Да |
| `sfera-master.ru/masters` | ✅ Через 301 редирект → /master-landing/v3 |
| `sfera-master.ru/r/:slug` | ⚠️ Зависит от того, какая ссылка на referral попала к боту-краулеру |
| `sfera-master.ru/partner` | ✅ Да (PWA) — ПЛОХО, не должна индексироваться |
| `sfera-master.ru/crm` | ✅ Да (потенциально) — ПЛОХО |
| `sfera-master.ru/master-pwa` | ✅ Да — ПЛОХО |
| `sfera-master.ru/api/*` | ⚠️ возможно (если в публичных страницах есть `<a href="/api/...">`) |
| `sfera-master.ru/api/receipt/:token` | ✅ Да — это публичная страница сметы. Сейчас отдаёт полный SSR HTML. Должна быть `noindex` (временные данные клиента). |
| `sfera-master.ru/smeta/:token` | ⚠️ через клиентскую PWA |
| `sfera-master.ru/uploads/*`, `/banners/*` | ✅ Картинки — ОК, могут индексироваться. |

### Закрыты ли `/crm` и `/master-pwa` от индексации

**Нет**. Никакой защиты:
- robots.txt отсутствует.
- noindex meta нет.
- HTTP-заголовка `X-Robots-Tag: noindex` нет.
- Авторизация — только session cookie. У не-залогиненного пользователя `/crm/login` отдаёт SPA с формой. Поисковик увидит форму, проиндексирует страницу.

### Риск: внутренние страницы в выдаче Яндекса

**Риск средний-высокий**. Если кто-то хоть раз постил ссылку на `/crm/login` или `/master-pwa/profile` — она могла попасть в индекс. Решение требуется **до** запуска маркетплейса (иначе Яндекс может счесть домен «кашей»).

### Что нужно добавить в Phase 0 / Phase 1

1. **На `sfera-master.ru` срочно добавить `/robots.txt`** (через express route в `app.ts`):
   ```
   GET /robots.txt → текстовый ответ:

   User-agent: *
   Disallow: /crm/
   Disallow: /master-pwa/
   Disallow: /partner/
   Disallow: /api/
   Disallow: /smeta/
   Disallow: /uploads/
   Allow: /
   Allow: /master-landing/
   Allow: /masteram
   Allow: /r/

   Host: sfera-master.ru
   ```
   
2. **Добавить `<meta name="robots" content="noindex, nofollow" />` в index.html CRM, master-pwa, partner-pwa**. Это вторая линия защиты, если бот не подчиняется robots.txt.

3. **Добавить HTTP-заголовок** для роутов `/crm`, `/master-pwa`, `/partner` в `app.ts`:
   ```
   res.setHeader('X-Robots-Tag', 'noindex, nofollow');
   ```

4. **На `chestnye-mastera.ru` сделать `robots.txt` и `sitemap.xml`** через Next.js `app/robots.ts` и `app/sitemap.ts` (на этапе Фазы 6).

5. **На `честные-мастера.рф` отдать `User-agent: * \n Disallow: /`** — полный disallow, потому что весь контент 301-редиректится на `chestnye-mastera.ru`, индексировать alias-домен не нужно.

---

## 10. Финальное решение по первой миграции

### Принципы

1. **Минимум для V1**, без избыточности. Только то, что блокирует переход к фазе 2 (backend API).
2. **Все новые поля nullable или с DEFAULT**. Никакого `NOT NULL` без default.
3. **Без удаления полей**. Только `ADD COLUMN` и `CREATE TABLE`.
4. **Без переименования таблиц**.
5. **Никаких триггеров, кроме `updated_at`-триггеров на новых таблицах** (если нужно).
6. **Backfill — отдельным скриптом**, не миграцией.
7. **Идемпотентность**: миграция должна выполниться повторно без ошибок (через `IF NOT EXISTS` для индексов и `ALTER TABLE ADD COLUMN IF NOT EXISTS`).

### Состав миграции `0005_marketplace_baseline.sql`

#### A. Расширение `cities`

```sql
ALTER TABLE cities ADD COLUMN IF NOT EXISTS slug varchar(100);
ALTER TABLE cities ADD COLUMN IF NOT EXISTS name_in varchar(100);
ALTER TABLE cities ADD COLUMN IF NOT EXISTS region varchar(100);
ALTER TABLE cities ADD COLUMN IF NOT EXISTS timezone varchar(50) DEFAULT 'Europe/Moscow';
ALTER TABLE cities ADD COLUMN IF NOT EXISTS lat numeric(9,6);
ALTER TABLE cities ADD COLUMN IF NOT EXISTS lng numeric(9,6);
ALTER TABLE cities ADD COLUMN IF NOT EXISTS population integer;
ALTER TABLE cities ADD COLUMN IF NOT EXISTS seo_title varchar(70);
ALTER TABLE cities ADD COLUMN IF NOT EXISTS seo_description varchar(180);
ALTER TABLE cities ADD COLUMN IF NOT EXISTS h1 varchar(100);
ALTER TABLE cities ADD COLUMN IF NOT EXISTS body_md text;
ALTER TABLE cities ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE cities ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE cities ADD COLUMN IF NOT EXISTS created_at timestamp NOT NULL DEFAULT now();
ALTER TABLE cities ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS cities_slug_key ON cities(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS cities_is_active_idx ON cities(is_active) WHERE is_active = true;
```

#### B. Расширение `service_types`

```sql
ALTER TABLE service_types ADD COLUMN IF NOT EXISTS slug varchar(100);
ALTER TABLE service_types ADD COLUMN IF NOT EXISTS name_genitive varchar(255);
ALTER TABLE service_types ADD COLUMN IF NOT EXISTS parent_id integer REFERENCES service_types(id) ON DELETE SET NULL;
ALTER TABLE service_types ADD COLUMN IF NOT EXISTS icon varchar(50);
ALTER TABLE service_types ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE service_types ADD COLUMN IF NOT EXISTS body_md text;
ALTER TABLE service_types ADD COLUMN IF NOT EXISTS seo_title varchar(70);
ALTER TABLE service_types ADD COLUMN IF NOT EXISTS seo_description varchar(180);
ALTER TABLE service_types ADD COLUMN IF NOT EXISTS h1 varchar(100);
ALTER TABLE service_types ADD COLUMN IF NOT EXISTS price_from integer;
ALTER TABLE service_types ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE service_types ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE service_types ADD COLUMN IF NOT EXISTS created_at timestamp NOT NULL DEFAULT now();
ALTER TABLE service_types ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS service_types_slug_key ON service_types(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS service_types_parent_idx ON service_types(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS service_types_is_active_idx ON service_types(is_active) WHERE is_active = true;
```

#### C. Расширение `masters` (publication fields)

```sql
ALTER TABLE masters ADD COLUMN IF NOT EXISTS slug varchar(100);
ALTER TABLE masters ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false;
ALTER TABLE masters ADD COLUMN IF NOT EXISTS published_at timestamp;
ALTER TABLE masters ADD COLUMN IF NOT EXISTS public_bio text;
ALTER TABLE masters ADD COLUMN IF NOT EXISTS public_title varchar(150);
ALTER TABLE masters ADD COLUMN IF NOT EXISTS seo_title varchar(70);
ALTER TABLE masters ADD COLUMN IF NOT EXISTS seo_description varchar(180);
ALTER TABLE masters ADD COLUMN IF NOT EXISTS years_experience integer;
ALTER TABLE masters ADD COLUMN IF NOT EXISTS public_rating numeric(3,2);
ALTER TABLE masters ADD COLUMN IF NOT EXISTS public_reviews_count integer NOT NULL DEFAULT 0;
ALTER TABLE masters ADD COLUMN IF NOT EXISTS city_id integer REFERENCES cities(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS masters_slug_key ON masters(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS masters_is_published_idx ON masters(is_published) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS masters_city_id_idx ON masters(city_id) WHERE city_id IS NOT NULL;
```

#### D. Расширение `leads` (source tracking)

```sql
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_page_url text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_page_type varchar(40);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS service_slug varchar(100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS city_slug varchar(100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS service_id integer REFERENCES service_types(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS city_id integer REFERENCES cities(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS marketplace_context jsonb;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS referrer text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_source varchar(100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_medium varchar(100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_campaign varchar(100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_term varchar(200);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_content varchar(200);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS attached_master_id integer REFERENCES masters(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS client_ip varchar(45);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS client_user_agent text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_given_at timestamp;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS captcha_score numeric(3,2);

CREATE INDEX IF NOT EXISTS leads_source_marketplace_idx ON leads(source) WHERE source = 'marketplace';
CREATE INDEX IF NOT EXISTS leads_attached_master_idx ON leads(attached_master_id) WHERE attached_master_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_city_id_idx ON leads(city_id) WHERE city_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_service_id_idx ON leads(service_id) WHERE service_id IS NOT NULL;
```

### Что НЕ делаем в этой миграции

- ❌ **Не создаём** `master_portfolio` (это в Фазе 4, когда пойдут кейсы).
- ❌ **Не создаём** `master_reviews_public` (тоже Фаза 4 или позже).
- ❌ **Не создаём** `seo_redirects` (Фаза 6 — можно прямо в next.config.js хранить).
- ❌ **Не делаем backfill** в самой миграции (отдельный скрипт).
- ❌ **Не меняем существующие колонки** (никаких `ALTER COLUMN`).
- ❌ **Не делаем** `NOT NULL` для `slug`, потому что у существующих мастеров его нет.

### Размер изменений

- 4 ALTER TABLE с ~13+15+11+18 = **57 ADD COLUMN** (все nullable / с default).
- 9 CREATE INDEX (все partial, не блокирующие).

### Ожидаемое время выполнения миграции

На prod БД с ~1000 мастеров и ~10000 лидов:
- ALTER ADD COLUMN — мгновенно (Postgres не переписывает таблицу для nullable colum without default или для default-constants).
- CREATE INDEX — < 5 секунд для каждого, total ~30 секунд.
- **Итого: ~30-60 секунд блокировки**, без переписывания таблиц.

### Откат

Миграция написана с `IF NOT EXISTS` — можно прогнать повторно без ошибок. Откат:
```sql
-- 0005_rollback.sql
ALTER TABLE leads DROP COLUMN IF EXISTS source_page_url;
ALTER TABLE leads DROP COLUMN IF EXISTS source_page_type;
-- ... (все 18 leads-полей)
ALTER TABLE masters DROP COLUMN IF EXISTS slug;
-- ... (11 masters-полей)
-- service_types и cities — оставить новые поля, они никому не мешают
```

В Drizzle нет автоматического down-migration, поэтому скрипт отката пишется вручную.

### План выполнения

1. **Staging**: написать миграцию → запустить → smoke-test CRM/PWA (5 минут).
2. **Backup prod**: Railway → Postgres → manual snapshot.
3. **Prod**: запустить миграцию через `pnpm db:migrate` или прямой psql.
4. **Smoke-test prod**: открыть CRM, зайти как оператор, проверить что лиды/мастера/города/услуги работают как раньше.
5. **Rollback готов**: если что-то сломается — `0005_rollback.sql`.

---

## 11. Первая безопасная задача на код

### Выбор задачи

**Задача**: добавить базовый SEO/security-каркас на `sfera-master.ru` ДО того, как трогать БД и marketplace.

Конкретно — **`/robots.txt` + `noindex` для CRM/PWA**.

### Зачем это первая задача

1. **Production-safe**: добавляем 1 endpoint в `app.ts` + 3 строки в `index.html` каждого SPA. Никаких изменений БД, никаких новых пакетов, никаких миграций.
2. **Рискогрузка нулевая**: добавление `/robots.txt` не влияет ни на что в текущей системе. Самое большее, что может пойти не так — Яндекс перестанет индексировать `/crm` (а это и есть цель).
3. **Срочно**: если внутренние страницы попадут в выдачу до запуска marketplace, восстанавливать репутацию домена — головная боль на месяцы.
4. **Откатывается мгновенно**: если что — git revert, перезапуск Railway service.
5. **Готовит почву** для marketplace: когда мы выйдем с `chestnye-mastera.ru`, на `sfera-master.ru` уже будет правильный `robots.txt`, и поисковики корректно разделят два домена.

### Какие файлы трогать

**1. `artifacts/api-server/src/app.ts`** — добавить:
   - GET `/robots.txt` route (~15 строк), отдаёт текст с `Disallow: /crm/, /master-pwa/, /partner/, /api/, /smeta/, /uploads/`.
   - middleware (~5 строк), который для путей `/crm/*`, `/master-pwa/*`, `/partner/*` выставляет HTTP-заголовок `X-Robots-Tag: noindex, nofollow`.

**2. `artifacts/crm/index.html`** — добавить 1 строку:
   ```html
   <meta name="robots" content="noindex, nofollow" />
   ```

**3. `artifacts/master-pwa/index.html`** — добавить ту же строку.

**4. `artifacts/partner-pwa/index.html`** — добавить ту же строку.

**5. (Опционально) `artifacts/api-server/src/app.ts`** — для роутов `/api/receipt/:token` (публичная смета) добавить `<meta name="robots" content="noindex">` в HTML-output (это персональная страница клиента, не должна индексироваться).

### Какие тесты выполнить

1. **Unit-test** `routes.test.ts` (новый): GET /robots.txt → 200, content-type text/plain, тело содержит `Disallow: /crm/`.
2. **Manual smoke-test** на staging:
   - `curl -i https://staging.sfera-master.ru/robots.txt` → 200 + правильный текст.
   - `curl -i https://staging.sfera-master.ru/crm/login` → headers содержат `X-Robots-Tag: noindex, nofollow`.
   - `curl -s https://staging.sfera-master.ru/crm/login | grep -i 'robots'` → находит `<meta name="robots" content="noindex, nofollow">`.
3. **Yandex.Webmaster** — после prod-deploy: проверка robots.txt через `https://webmaster.yandex.ru/site/tools/robotstxt/`.
4. **Google Robots Tester** — `https://search.google.com/u/0/search-console/robots-testing-tool`.

### Как проверить, что CRM/PWA не сломались

1. Залогиниться в `/crm` как оператор — должен открыться dashboard. Проверка: открываются `/crm/leads`, `/crm/masters`, `/crm/finance` без ошибок в консоли.
2. Залогиниться в `/master-pwa` как мастер — должен открыться home. Проверка: лента заявок, профиль, чат.
3. Открыть `/partner` — лендинг/PWA партнёра загружается.
4. `/api/health` отдаёт 200.
5. `/master-landing/v3/honest` загружается (для набора мастеров).
6. `sfera-master.ru/` — root отдаёт `master-landing-v2`.

### Definition of Done

- [ ] `GET /robots.txt` существует, возвращает правильный текст.
- [ ] HTTP-заголовок `X-Robots-Tag: noindex, nofollow` присутствует на всех ответах от `/crm/*`, `/master-pwa/*`, `/partner/*`.
- [ ] Meta-тег `<meta name="robots" content="noindex, nofollow" />` есть в HTML CRM, master-pwa, partner-pwa.
- [ ] `pnpm typecheck` проходит без ошибок.
- [ ] `pnpm --filter @workspace/api-server test` — все тесты зелёные.
- [ ] `pnpm --filter @workspace/api-server exec tsx ./build.ts` — успешный билд.
- [ ] На staging: ручная проверка всех точек (см. выше).
- [ ] На prod: после деплоя — smoke-test критичных URL (CRM login, PWA home, API health, root).
- [ ] Yandex.Webmaster показывает корректный `Disallow` для `/crm/`, `/master-pwa/`, `/partner/`.
- [ ] Деплой совершён через PR с код-ревью (один разработчик пишет, другой проверяет — особенно регулярки путей в middleware).
- [ ] В коммит-сообщении явно указано: `chore(seo): add robots.txt + noindex headers for internal SPAs (Phase 0)`.

### Что НЕ делает эта задача

- ❌ Не трогает БД.
- ❌ Не создаёт marketplace-артефакт.
- ❌ Не добавляет новые маршруты, кроме `/robots.txt`.
- ❌ Не меняет логику авторизации.
- ❌ Не переименовывает существующие URL (`/masters` остаётся как есть).
- ❌ Не добавляет sitemap (это будет на marketplace домене позже).

### Оценка

- **Время на реализацию**: 1-2 часа (1 разработчик).
- **Время на ревью + деплой**: 1 час.
- **Откат при проблемах**: 5 минут (Railway redeploy предыдущего билда).

### Что идёт после неё (последовательность Phase 0 / 1 задач)

1. ✅ **(Эта задача)** robots.txt + noindex для CRM/PWA.
2. Добавить short alias `/masteram` (отдаёт тот же контент, что `/master-landing/v3/honest`). Не меняет существующий `/masters`.
3. Подготовить миграцию `0005_marketplace_baseline.sql` (текст SQL + Drizzle schema-расширения), но **НЕ запускать**. Только на code-review.
4. Применить миграцию на staging → smoke-test CRM/PWA.
5. Применить миграцию на prod (с backup'ом и rollback-планом).
6. Backfill-скрипт slug'ов для городов и услуг.
7. Создать каркас `routes/marketplace.ts` (только эндпоинты `/cities`, `/services` для начала, с `requireMarketplaceAuth`).

Эта последовательность даёт **видимый прогресс** в Phase 0 + 1, при этом каждая задача независимо production-safe и легко откатывается.

---

> Конец Readiness Audit. План `MARKETPLACE_PRODUCTION_PLAN.md` остаётся базовым, с учётом найденных корректировок:
> 1. `cities` и `service_types` уже существуют — расширяем, не создаём.
> 2. `/masters` → `/masteram` редирект сделать **до** запуска маркетплейса.
> 3. SEO-защита внутренних SPA — самая первая задача.
> 4. Состав миграции `0005_marketplace_baseline.sql` уточнён (4 ALTER + 9 INDEX).
