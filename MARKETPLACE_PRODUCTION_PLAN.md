# MARKETPLACE_PRODUCTION_PLAN

> **Дата**: 13.06.2026
> **Статус**: ARCHITECTURE PLAN, не реализация
> **Цель**: пошагово спроектировать production-grade публичный SEO-маркетплейс мастеров поверх существующего проекта sfera-master.ru

---

## 1. Цель продукта

**Что строим**: публичная SEO-площадка `chestnye-mastera.ru` — отдельный продукт, ориентированный на органический поисковый трафик из Яндекс/Google.

**Стратегическое позиционирование**: **Российский Houzz с проверенными ценами и прямой связью с мастером**. Не каталог компаний, не доска объявлений — библиотека реальных ремонтов с фото до/после, ценами, сроками и автором каждой работы. Главная единица контента — **кейс мастера** (реально выполненный ремонт), а не профиль и не статья. Кейсы образуют long-tail SEO-актив, который физически невозможно скопировать (фото уникальны, цены и сроки верифицированы через нашу БД заказов), и формируют воронку «поиск кейса → понравилось → оставил заявку → лид направляется автору + похожим мастерам».

**Ключевое отличие от Профи.ру / Авито / Я.Услуги**: они продают **доступ к подрядчику** (lead-marketplace). Мы продаём **визуализированный результат** — пользователь видит «вот так может быть у меня, столько стоит, кто делал», и это конвертит лучше, чем абстрактный поиск мастера. Ключевое отличие от Houzz: они не показывают цены и не маршрутизируют сделки. Мы делаем и то, и другое.

**Ключевые сценарии**:
1. **Поиск услуги в городе** (короткий коммерческий запрос). Пользователь приходит из Яндекса по запросу типа «сантехник в Краснодаре» → попадает на SEO-страницу `/santehnik/krasnodar` → видит топ-N мастеров с рейтингом, ценами, отзывами → оставляет заявку.
2. **Поиск работы / визуализация** (long-tail, главный SEO-актив). Пользователь ищет «ремонт кухни 12 метров фото до после» / «укладка плитки в санузле цена» → попадает на страницу кейса `/raboty/remont-kuhni-12m-krasnodar-ivan-petrov` → видит фото до/после, стоимость, срок, автора, похожие работы → нажимает «хочу такую же» → форма с auto-fill контекстом кейса (услуга, площадь, ориентир по бюджету).
3. **AI-дизайн** (визуализация для ещё-не-определившегося клиента, фаза 4+). Пользователь ищет «дизайн кухни в скандинавском стиле» → попадает на страницу AI-дизайна → видит «мастера, которые делали похожее» (через image similarity на портфолио) → оставляет заявку.
4. **Сравнение мастеров** (информационно-сравнительный). Пользователь на `/mastera?city=krasnodar` → открывает карточку `/master/ivan-petrov` → видит агрегатор работ + отзывов + цен → оставляет заявку.

**Иерархия контента (по приоритету для SEO):**
1. **Кейсы** (`/raboty/[slug]`) — главный long-tail актив. Каждый кейс = отдельная индексируемая страница с уникальным фото-контентом и структурированными данными (цена, срок, площадь, материалы).
2. **Hub-страницы услуга × город** (`/[serviceSlug]/[citySlug]`) — короткий коммерческий запрос. Содержат внутри блок «Работы мастеров в этом городе» с превью кейсов.
3. **Профили мастеров** (`/master/[slug]`) — агрегаторы работ + контакт. Brand + local интент.
4. **Блог / советы** (`/sovety/[slug]`) — информационный трафик и E-E-A-T.

**Целевая воронка V1.5**: 70% органики идёт через кейсы, 20% через hub-страницы, 10% через мастеров и блог. К моменту 5000+ опубликованных кейсов это даёт диверсифицированный поисковый трафик, не зависящий от ранжирования любой одной страницы.

**Интеграция с существующей системой**:
- Заявка создаётся через **существующую таблицу `leads`** с `source='marketplace'` и расширенным контекстом (URL страницы, услуга, город, UTM).
- Дальше включается **существующий поток**: оператор в CRM видит лид → отправляет в работу (`send-to-buffer`) → создаётся `orders` → рассылка через `dispatch` → мастер получает в PWA.
- **Никакой новой логики обработки заказов** в V1 не пишем.

**Что приходит позже** (после V1):
- Подписки мастеров (Free / Pro / Enterprise).
- Покупка лидов поштучно из PWA.
- Эксклюзивные лиды (один мастер).
- AI-дизайнер интерьера с публичными SEO-страницами `/dizajn/[slug]`.
- Личный кабинет клиента.
- Свайп-формат подбора мастера (мобильный «Tinder для мастеров»).

**Это не MVP, это Production V1**: значит правильная архитектура с самого начала, с расчётом на масштабирование до сотен тысяч SEO-страниц без переделки. Никаких хаков «временно положим в localStorage» или «потом заменим».

---

## 2. Текущая архитектура и что сохраняем

### Что **остаётся как есть** (не трогаем):

| Часть | Статус |
|---|---|
| `https://sfera-master.ru/crm` | работает, операторы привыкли, не переписываем |
| `https://sfera-master.ru/master-pwa` | мастера используют ежедневно, push, чаты, заказы — не ломаем |
| `https://sfera-master.ru/api` | единственный backend для всех клиентов (CRM, PWA, marketplace, partner-pwa, client) |
| Postgres (Drizzle ORM, ~50 таблиц) | продолжаем использовать как single source of truth |
| Существующие миграции `lib/db/migrations/0000-0004` | трогать не будем, добавим **только новые** миграции (0005+) |
| Поток `lead → CRM → order → dispatch → PWA мастера` | работает, marketplace-лиды вписываются в этот же поток |
| Лендинги (master-landing v1/v2/v3/v5, partner-landing, referral-landing) | оставляем работать. Старый `/masters` redirect мы **переименуем**, но сам контент лендинга останется |
| Клиентская PWA (`artifacts/client/`) | оставляем для AI-сметы, smeta-страниц, чатов — это другой продукт, не маркетплейс |
| Avito-интеграция | не трогаем |
| Авторизация операторов и мастеров | не трогаем |

### Что **расширяем** (новые миграции, обратно-совместимо):

- В таблицу `masters` добавляем колонки для публикации (`slug`, `is_published`, `public_bio` и т.д.).
- В таблицу `leads` добавляем колонки для трекинга источника (`source_page_url`, `service_slug`, `city_slug` и т.д.).
- Создаём новые таблицы: `cities` (нормализация), `services` (нормализация), `master_portfolio`, `master_reviews_public`, `seo_redirects`.

### Что **создаём с нуля**:

- Новый артефакт `artifacts/marketplace/` (Next.js 15 App Router).
- Новый router в api-server: `routes/marketplace.ts` (server-to-server endpoints для marketplace).
- Новый домен `chestnye-mastera.ru` + Cloudflare/Yandex DNS + SSL + alias `честные-мастера.рф`.
- Новые env-переменные.

### Принцип:
> **Существующая система — это foundation. Marketplace — отдельный фасад поверх той же БД и API.** Никаких breaking changes в текущих эндпоинтах.

---

## 3. Доменная стратегия

### Зафиксированная топология:

| Домен | Роль | Поведение |
|---|---|---|
| `chestnye-mastera.ru` | **canonical-домен публичного маркетплейса** | основной, отдаёт SSR HTML, индексируется Яндексом/Google |
| `www.chestnye-mastera.ru` | alias | `301 → https://chestnye-mastera.ru$REQUEST_URI` |
| `честные-мастера.рф` (punycode `xn----8sbarac1cf6adfgg4d6c.xn--p1ai`) | брендовый кириллический alias | `301 → https://chestnye-mastera.ru$REQUEST_URI` |
| `www.честные-мастера.рф` | alias | `301 → https://chestnye-mastera.ru$REQUEST_URI` |
| `sfera-master.ru` | **внутренний** (CRM, PWA, API) | НЕ индексируется маркетплейсом, отдельные SPA как сейчас |
| `www.sfera-master.ru` | alias | `301 → https://sfera-master.ru` (уже работает в `app.ts`) |

### Правила:

1. **Canonical только на `chestnye-mastera.ru`**. На каждой публичной странице:
   ```html
   <link rel="canonical" href="https://chestnye-mastera.ru/santehnik/krasnodar" />
   ```
   Никогда не указывать `честные-мастера.рф` как canonical — это убьёт SEO.

2. **Sitemap.xml только с URL `chestnye-mastera.ru`**. Все ссылки в sitemap абсолютные с canonical-хостом.

3. **Robots.txt отдельный для каждого домена**:
   - `chestnye-mastera.ru/robots.txt` — разрешает индексацию маркетплейса, ссылается на sitemap.
   - `честные-мастера.рф/robots.txt` — отдаём `User-agent: * \n Disallow: /` (полный disallow), чтобы поисковик не индексировал alias-домен дублями.
   - `sfera-master.ru/robots.txt` — `Disallow: /crm`, `Disallow: /master-pwa`, `Disallow: /partner`, `Disallow: /api`. Sitemap не нужен (внутренний).

4. **301-редиректы выполняются на edge** (Cloudflare/Nginx/Next.js middleware), до достижения Next.js-страниц. Это критично, чтобы поисковик видел чистый редирект, а не цепочку.

5. **Никаких хардкоженных доменов в коде**. Все ссылки строятся через `process.env.MARKETPLACE_PUBLIC_URL`. В компонентах относительные пути (`/master/ivan`), абсолютные только в `<head>` (`canonical`, `og:url`, `sitemap`) через helper `absoluteUrl(path)`.

6. **Cookie-домены изолированы**: marketplace на `chestnye-mastera.ru` не использует session-cookie от `sfera-master.ru`. Marketplace **stateless** для публичного посетителя; авторизация мастера/оператора там не предусмотрена.

7. **Hreflang** не нужен — продукт русскоязычный, одна локаль `ru-RU`. На случай будущей экспансии оставить место в `LayoutHead.tsx` для добавления.

### Предлагаемые env-переменные:

```env
# === Marketplace (Next.js artifact) ===
MARKETPLACE_PUBLIC_URL=https://chestnye-mastera.ru
MARKETPLACE_CANONICAL_HOST=chestnye-mastera.ru
MARKETPLACE_ALIAS_HOSTS=честные-мастера.рф,xn----8sbarac1cf6adfgg4d6c.xn--p1ai,www.chestnye-mastera.ru,www.честные-мастера.рф,www.xn----8sbarac1cf6adfgg4d6c.xn--p1ai

# Server-to-server обращение к существующему API (только из server-side кода Next.js)
INTERNAL_API_BASE_URL=https://sfera-master.ru/api
INTERNAL_API_SHARED_TOKEN=<long-random-string-минимум-32-символа>

# Внешние ссылки (для footer/header marketplace и для CRM-нотификаций)
CRM_URL=https://sfera-master.ru/crm
MASTER_PWA_URL=https://sfera-master.ru/master-pwa

# Аналитика
YANDEX_METRIKA_ID=
GOOGLE_ANALYTICS_ID=

# Капча на публичной форме заявки
CAPTCHA_PROVIDER=yandex_smartcaptcha   # или cloudflare_turnstile
YANDEX_SMARTCAPTCHA_SITE_KEY=
YANDEX_SMARTCAPTCHA_SERVER_KEY=

# === Backend (api-server) ===
# Дополнить существующие
MARKETPLACE_PUBLIC_URL=https://chestnye-mastera.ru   # для абсолютных ссылок в push/email/CRM-нотификациях
MARKETPLACE_INGEST_TOKEN=<тот же INTERNAL_API_SHARED_TOKEN>   # для проверки server-to-server из Next.js
```

`INTERNAL_API_SHARED_TOKEN` хранится в env обоих сервисов и проверяется в middleware `requireMarketplaceAuth` на endpoint'ах `/api/marketplace/*`. Это защищает marketplace-API от прямого вызова из браузера и от ботов.

---

## 4. Где разместить marketplace в монорепо

### Структура

```
artifacts/
├── marketplace/                 ← НОВЫЙ артефакт
│   ├── app/                     Next.js 15 App Router
│   │   ├── (public)/
│   │   │   ├── layout.tsx       публичный layout (header, footer, SEO)
│   │   │   ├── page.tsx         главная /
│   │   │   ├── uslugi/
│   │   │   │   └── page.tsx     /uslugi
│   │   │   ├── mastera/
│   │   │   │   └── page.tsx     /mastera (каталог)
│   │   │   ├── master/[slug]/
│   │   │   │   └── page.tsx     /master/ivan-petrov
│   │   │   ├── [serviceSlug]/[citySlug]/
│   │   │   │   └── page.tsx     /santehnik/krasnodar
│   │   │   ├── ceny/[slug]/
│   │   │   │   └── page.tsx     /ceny/santehnik-krasnodar
│   │   │   ├── raboty/
│   │   │   │   ├── page.tsx     /raboty (главный фид)
│   │   │   │   ├── [serviceSlug]/page.tsx     /raboty/remont-kuhni
│   │   │   │   ├── [serviceSlug]/[citySlug]/page.tsx   /raboty/remont-kuhni/krasnodar
│   │   │   │   └── [slug]/page.tsx            /raboty/[slug] (страница кейса)
│   │   │   └── _components/
│   │   │       ├── MasterCard.tsx
│   │   │       ├── LeadForm.tsx
│   │   │       ├── Breadcrumbs.tsx
│   │   │       └── JsonLd.tsx
│   │   ├── api/
│   │   │   ├── leads/route.ts           POST приём заявки + проксирование в backend
│   │   │   ├── search/route.ts          GET автокомплит (city/service/master)
│   │   │   └── revalidate/route.ts      POST webhook для ревалидации страниц
│   │   ├── sitemap.ts                   динамический sitemap (Next.js нативный)
│   │   ├── robots.ts                    динамический robots.txt
│   │   ├── not-found.tsx
│   │   └── error.tsx
│   ├── components/                      shared client + server компоненты
│   ├── lib/
│   │   ├── api.ts                       fetch к INTERNAL_API_BASE_URL
│   │   ├── seo.ts                       generateMetadata helpers
│   │   ├── jsonLd.ts                    schema.org builders
│   │   ├── absoluteUrl.ts               helper canonical URL
│   │   └── domain-redirect.ts           middleware для .рф → .ru
│   ├── middleware.ts                    Next.js Edge middleware (canonical-host, www→non-www, .рф→.ru)
│   ├── public/                          favicon, og-image-default.png, robots.txt fallback
│   ├── next.config.js
│   ├── tsconfig.json
│   ├── package.json                     name: "@workspace/marketplace"
│   └── railway.json / Dockerfile
├── api-server/                  ← существующий, не трогаем (только новый router)
├── crm/                         ← без изменений
├── master-pwa/                  ← без изменений
└── ...
```

### Почему Next.js App Router

1. **Industry standard для SEO**. Cherry-picked для индексации Яндексом и Google: SSR/ISR/SSG из коробки, native sitemap.ts, robots.ts, generateMetadata API.
2. **Image Optimization** через `next/image` — критично для Core Web Vitals (LCP, CLS) и для портфолио/аватаров мастеров с разных размеров.
3. **App Router** — слой layouts, parallel routes, server components. Серверные компоненты дают нулевой JS на странице каталога мастеров (только клиентские части — форма заявки, фильтры).
4. **ISR (Incremental Static Regeneration)** — карточки мастеров, цены, тексты услуг можно кешировать на 1-24 часа и автоматически обновлять. Это **критично** для тысяч SEO-страниц `service × city`, чтобы они не генерировались на каждый запрос.
5. **React 19** — тот же стек, что в CRM/PWA. Команда уже знает.
6. **Native middleware** для канонизации хоста, www→non-www, .рф→.ru на Edge без задержек.
7. **Server actions** + `route.ts` для приёма формы заявки server-side — нет CORS, нет утечки backend-токена в браузер.

### Как встроить в pnpm workspace

В `pnpm-workspace.yaml` (уже есть `artifacts/*`) — Next.js-артефакт автоматически попадёт в workspace. Нужно:

1. `artifacts/marketplace/package.json` со `"name": "@workspace/marketplace"` и зависимостями `next`, `react@catalog:`, `react-dom@catalog:`.
2. Зависимости от monorepo-пакетов:
   ```json
   "dependencies": {
     "@workspace/api-zod": "workspace:*",   // переиспользуем zod-схемы
     "@workspace/db": "workspace:*"          // ИЛИ не использовать (см. ниже)
   }
   ```
3. Обновить root `package.json`:
   ```jsonc
   "scripts": {
     "build": "... && pnpm --filter @workspace/marketplace run build",
     "dev:marketplace": "pnpm --filter @workspace/marketplace run dev"
   }
   ```
4. `tsconfig.json` (root) — добавить ссылку на `artifacts/marketplace/tsconfig.json` (project references).

### `@workspace/db` напрямую vs server-to-server API — выбор

**Вариант A: Marketplace ходит напрямую в БД через `@workspace/db`** (Drizzle).

- Плюсы: меньше latency (1 хоп), нет дублирования query-логики.
- Минусы:
  - Marketplace становится вторым DB-клиентом. Любые миграции надо синхронизировать.
  - Раздуваем connection pool на Postgres (Railway tier ограничен).
  - Сложнее изоляция: если marketplace вытащит долгий query, могут страдать CRM/PWA.
  - Невозможно вынести marketplace на Vercel (там нет прямого доступа к Railway Postgres без публичного `DATABASE_URL`).

**Вариант B: Marketplace ходит через server-to-server API в существующий api-server** (через `INTERNAL_API_BASE_URL`).

- Плюсы:
  - Чёткая изоляция: marketplace — это «клиент», api-server — единственный владелец данных.
  - Легко выносить marketplace куда угодно (Railway, Vercel, отдельный VPS).
  - Кеширование: api-server возвращает данные с правильными `Cache-Control`-заголовками, Next.js делает ISR.
  - Аудит: все обращения marketplace логируются на api-server.
  - Можно отдавать заранее **отфильтрованный/санитизированный DTO** (без телефонов, паспортов, долгов).
- Минусы:
  - +1 hop latency (но 5-30ms, и кешируется).
  - Дублирование zod-схем (решается через `@workspace/api-zod`).

**Решение: Вариант B — server-to-server**.

DRY-принцип сохраняем через shared zod-схемы (`@workspace/api-zod`) и типы (DTO). Marketplace получает сериализованный JSON, не думает про Drizzle, sql-инъекции и connection pooling.

### Деплой — Railway или Vercel

| Критерий | Railway | Vercel |
|---|---|---|
| Цена | стабильная, текущий стек | бесплатный hobby + платный pro |
| ISR / On-demand revalidation | поддержка через Next.js (само) | нативная, optimized |
| Edge middleware | работает | нативный, ~50ms быстрее |
| Image Optimization | работает (с CPU нагрузкой) | offload на Vercel CDN |
| Single repo deploy | да, тот же Railway | да, через Git integration |
| Vendor lock-in | нет | средний |
| Российский трафик / RU IP | OK | OK (есть Frankfurt edge) |
| Проксирование к sfera-master.ru | внутри одного PaaS быстрее | через интернет |

**Рекомендация: на старте — Railway** (отдельный сервис в том же проекте, общий env, простой setup). Если в будущем вырастет нагрузка на изображения и SEO-страницы — мигрировать на **Vercel** с подключением Railway-API через `INTERNAL_API_BASE_URL`.

### Сравнение архитектурных вариантов

| Вариант | Плюсы | Минусы | Вердикт |
|---|---|---|---|
| **1. Next.js отдельным сервисом** (рекомендуемый) | SSR + ISR + Image Opt + middleware из коробки. Не ломает api-server. Команда знает React. | Доп. процесс, доп. деплой. Дублирование некоторых утилит. | ✅ ВЫБОР |
| 2. SSR внутри Express | Минимум новых зависимостей, всё в одном процессе. | Нет ISR, нет Image Opt, hydration вручную, layouts вручную, sitemap.xml вручную. На 1000+ SEO-страниц превращается в кошмар поддержки. | ❌ |
| 3. Astro | Лучшие Core Web Vitals (минимум JS), отличный SEO-DX. | Меньше экосистема, сложнее динамические части (форма заявки, поиск). React-компоненты импортируются как островки, но shared utils из monorepo надо настраивать руками. | ⚠️ Хороший вариант, но команда не знает Astro — обучение замедлит V1. |
| 4. Vite prerender (`vite-plugin-ssr` или ручной `react-dom/server`) | Минимум миграций. | Не дотягивает до Next.js по DX, ISR делать руками, sitemap руками. Подходит, если бы было 10-20 страниц, а не 1000+. | ❌ |

**Финальный выбор: Вариант 1 — Next.js 15 App Router отдельным сервисом на Railway.**

---

## 5. Карта будущих публичных маршрутов

### Конфликт с текущим `/masters`

Сейчас `https://sfera-master.ru/masters` (короткий alias) делает `301 → /master-landing/v3/honest`. Этот лендинг — для **набора мастеров на платформу** (не публичный каталог).

**На marketplace-домене `chestnye-mastera.ru` `/masters` будет каталогом мастеров.** Но на `sfera-master.ru` лендинг должен переехать. Предлагаю:

| Текущий URL | Новый URL | Зачем |
|---|---|---|
| `https://sfera-master.ru/masters` (redirect) | `https://sfera-master.ru/masteram` (прямой URL лендинга, без redirect) | короткий, понятный. «для мастеров». |
| `https://sfera-master.ru/master-landing/v3/honest` (полный путь) | оставить как есть (для прямых ссылок) | обратная совместимость со старыми визитками |
| `/become-master` | как alias `/masteram` (301 на `/masteram`) | для англоязычных ссылок в рекламе |

На marketplace-домене `chestnye-mastera.ru/masteram` тоже работает и **301 редиректит на `https://sfera-master.ru/masteram`** (лендинг для мастеров — это внутренняя сторона, на marketplace не попадает).

### Полный route map

#### Главные публичные

| Route | Статус | Назначение | Данные | SEO-meta | Schema.org | Sitemap | CTA / форма |
|---|---|---|---|---|---|---|---|
| `/` | V1 | главная маркетплейса | Hero, топ-услуги, топ-города, преимущества, CTA «найти мастера» | title: `Честные мастера — найдите мастера для ремонта`, description «...» | `Organization`, `WebSite` (с `SearchAction`) | ✅ priority 1.0 | поиск услуги/города (autocomplete) |
| `/uslugi` | V1 | каталог всех услуг | Список услуг с категориями, иконками, ценой «от» | `Все услуги ремонта — Честные мастера` | `BreadcrumbList`, `ItemList` of `Service` | ✅ priority 0.9 | переход на `/[serviceSlug]` |
| `/uslugi/[serviceSlug]` | V1 | страница услуги (общая, без города) | Описание услуги (body_md), типичные цены, мастера по всей РФ, города где есть мастера | `Сантехника — Честные мастера` | `Service`, `BreadcrumbList`, `FAQPage` | ✅ priority 0.8 | форма заявки (общая) |
| `/[serviceSlug]/[citySlug]` | V1 | **главная SEO-страница: услуга × город** | H1 `Сантехник в Краснодаре`, топ-N мастеров, цены, отзывы, FAQ, описание | `Сантехник в Краснодаре — заказать через Честных мастеров` | `Service`, `Place`, `BreadcrumbList`, `FAQPage`, `AggregateRating` | ✅ priority 0.9 (для top-100 пар) | форма заявки + клик в карточку мастера |
| `/ceny/[serviceSlug]-[citySlug]` или `/ceny/[serviceSlug]/[citySlug]` | V1 | страница цен на услугу в городе | Таблица услуг (под-работ) + цены от/до/средняя | `Цены на сантехнику в Краснодаре 2026` | `Service`, `OfferCatalog`, `BreadcrumbList` | ✅ priority 0.7 | форма заявки + переход на `/[service]/[city]` |
| `/mastera` | V1 | **каталог мастеров** | Грид карточек, фильтры (город, услуга, рейтинг), пагинация | `Все мастера — Честные мастера` | `BreadcrumbList`, `ItemList` of `LocalBusiness` | ✅ priority 0.8 | клик в карточку, фильтры |
| `/master/[slug]` | V1 | **публичная карточка мастера** (агрегатор работ) | Аватар, имя, рейтинг, город, услуги, **превью топ-6 работ → ссылка на /raboty?master=slug**, отзывы клиентов, прайс | `Иван Петров — сантехник в Краснодаре, рейтинг 4.9` | `LocalBusiness` или `ProfessionalService`, `BreadcrumbList`, `AggregateRating`, `Review`, `Service` | ✅ priority 0.7 | форма заявки (привязка к мастеру: `master_id` в lead) |
| `/raboty` | **V1** | **главный фид работ** (Houzz-аналог) | Грид кейсов с фото обложки, фильтры (услуга, город, тип помещения, ценовой диапазон, площадь), сортировка (новые / популярные / featured), пагинация ?page=N | `Работы мастеров — фото до/после, цены, сроки — Честные мастера` | `BreadcrumbList`, `ItemList` of `CreativeWork` | ✅ priority 0.8 | переход на `/raboty/[slug]` или фильтр |
| `/raboty/[serviceSlug]` | **V1** | фид работ по услуге | например `/raboty/remont-kuhni` — все кейсы ремонта кухни во всех городах | `Ремонт кухни — фото и цены работ — Честные мастера` | `BreadcrumbList`, `ItemList` of `CreativeWork`, `Service` | ✅ priority 0.7 (для top-50 услуг) | фильтр по городу/цене |
| `/raboty/[serviceSlug]/[citySlug]` | **V1** | фид работ по услуге в городе | `/raboty/remont-kuhni/krasnodar` | `Ремонт кухни в Краснодаре — 47 работ с фото и ценами` | `BreadcrumbList`, `ItemList` of `CreativeWork`, `Service`, `Place` | ✅ priority 0.7 (для top-100 пар) | фильтр + форма |
| `/raboty/[slug]` | **V1** | **страница конкретной работы** (главный SEO-актив) | H1 «Ремонт кухни 12 м² в Краснодаре под ключ», галерея до/после, цена, срок, площадь, материалы, описание ≥150 chars, **карточка мастера-автора**, **похожие работы (3-6)**, форма «Хочу такую же» с auto-fill контекстом кейса, отзыв клиента (если есть) | `Ремонт кухни 12 м² в Краснодаре — 280 000 ₽, 18 дней — Иван Петров` (динамический) | `CreativeWork`, `BreadcrumbList`, `ImageObject` (для каждого фото), `Person` (мастер), `Service`, `Offer` (цена+срок), `LocalBusiness` (мастер), `Review` (если есть отзыв клиента), `AggregateRating` (мастера) | ✅ priority 0.7 (только для кейсов с обязательными полями + ≥3 фото) | форма заявки с pre-fill: `service`, `city`, `area`, `case_id`, `near_to_master_id` |
| `/dizajn` | LATER (фаза 8) | каталог AI-дизайнов | — | — | — | — | — |
| `/dizajn/[slug]` | LATER | страница AI-дизайна → блок «мастера, которые делали похожее» (image similarity на `master_portfolio`) | — | — | — | — | — |

#### Служебные / не-индексируемые

| Route | Назначение | Robots |
|---|---|---|
| `/o-nas` | страница «о нас» | index, follow |
| `/kontakty` | контакты | index, follow |
| `/kak-eto-rabotaet` | как заказать | index, follow |
| `/dlya-masterov` или `/masteram` | редирект на `https://sfera-master.ru/masteram` (301) | — |
| `/policy/privacy` | политика конфиденциальности | index, follow (но можно noindex, follow — это технический документ) |
| `/policy/terms` | пользовательское соглашение | index, follow |
| `/policy/cookies` | политика cookies | index, follow |
| `/zayavka/spasibo` | страница «заявка принята» | **noindex, nofollow** (не уникальный контент) |
| `/search?q=...` | результаты внутреннего поиска | **noindex, follow** (избегаем индексации параметров) |
| `/404`, `/error` | системные | noindex, nofollow |

#### Принципы для всех публичных страниц:

- **Чистые URL**: только slug, никаких ID. `/master/ivan-petrov`, не `/master/123`.
- **Транслитерация русского**: библиотека `slugify` или собственный helper. `«Иван Петров» → ivan-petrov`. Для одинаковых имён — суффикс по городу или короткий хеш: `ivan-petrov-krasnodar`, `ivan-petrov-msk-x7f3`.
- **Кеширование** через ISR: `revalidate: 3600` (1 час) для каталогов и SEO-страниц, `revalidate: 1800` для карточки мастера, `revalidate: 86400` для статичных текстов о городах/услугах.
- **On-demand revalidation**: при публикации мастера / нового кейса / изменения slug → CRM дёргает webhook `POST /api/revalidate?path=/master/ivan-petrov` на marketplace, и страница обновляется без ожидания TTL.
- **404 обязательно**: если slug не найден — `notFound()` Next.js, не пустая страница. Статус 404 для поисковиков.
- **Пагинация**: `?page=2`, `?page=3` — на каталогах. С `<link rel="next">` и `<link rel="prev">`. ИЛИ infinite scroll на клиенте, но первая страница серверная (с топ-результатами).

---

## 6. Production V1 — что входит в первый релиз

### Входит в V1 (release-blockers):

#### Frontend (Next.js)
- ✅ Артефакт `artifacts/marketplace/` создан, билдится, деплоится.
- ✅ Главная `/` с hero, топ-услугами, топ-городами.
- ✅ Каталог услуг `/uslugi` + страницы `/uslugi/[slug]`.
- ✅ Каталог мастеров `/mastera` (фильтры по городу/услуге, сортировка, пагинация).
- ✅ Публичная карточка мастера `/master/[slug]` (без портфолио в первой итерации, если не успеваем — добавляем фото из `master.servicePrices` и из 3-5 успешных заказов).
- ✅ SEO-страницы услуга × город `/[serviceSlug]/[citySlug]` для топ-30 пар (Краснодар × сантехника, Москва × отделка и т.п.).
- ✅ Страницы цен `/ceny/[slug]` для топ-30 пар.
- ✅ **Каталог работ `/raboty/*` (Houzz-модель — главный SEO-актив)**: фид `/raboty`, фильтрация `/raboty/[serviceSlug]`, `/raboty/[serviceSlug]/[citySlug]`, страница кейса `/raboty/[slug]` с полной анатомией (фото до/после, цена, срок, площадь, материалы, мастер, похожие работы, форма «Хочу такую же»). Полная архитектура — секция 11.7. Реализуется в **Фазе 4.5**.
- ✅ Форма заявки на странице мастера, на странице услуга×город, на странице цен (один компонент `<LeadForm>`).
- ✅ Страница «спасибо» `/zayavka/spasibo` (noindex).
- ✅ Header (логотип, главное меню, поиск), Footer (контакты, ссылки на политики, ссылка на «для мастеров»).
- ✅ Mobile-responsive (320px+).
- ✅ Lighthouse SEO ≥ 90 на всех публичных страницах.
- ✅ Lighthouse Performance ≥ 80 на mobile (LCP < 2.5s, CLS < 0.1, INP < 200ms).

#### master-pwa (self-service публикация профиля и портфолио)
- ✅ Новая секция в `/profile.tsx` — «Публичный профиль на маркетплейсе»: поля `publicTitle`, `publicBio` (300–2000 chars), `yearsExperience`.
- ✅ Кнопка «Опубликовать» / «Скрыть с сайта» с обратной связью по причинам отказа (по полям).
- ✅ Live-превью ссылки `https://chestnye-mastera.ru/master/{slug}` после публикации.
- ✅ Новая секция «Портфолио»: грид кейсов, кнопка «+ Добавить», полный редактор со всеми обязательными полями из 11.7.5 (услуга, город, заголовок, описание ≥150 chars, цена, срок, дата, before/after upload, площадь, тип помещения, стиль, материалы, согласие клиента). Лимит 30 кейсов на мастера. Кнопка «Помочь AI» в поле описания. Чек-лист с прогрессом «X/8 полей готовы для публикации».
- ✅ api-server: endpoints `POST /api/master-pwa/profile/publish`, `POST /api/master-pwa/profile/unpublish`, портфолио CRUD (`GET/POST/PATCH/DELETE /api/master-pwa/portfolio`, `POST /api/master-pwa/portfolio/:id/photos`).
- ✅ api-server: автомодерация в `lib/marketplaceModeration.ts` (см. секцию 11.5) — применяется на publish и при правках `publicBio` / `publicTitle` после публикации.
- ✅ api-server: slug-генерация в `lib/slug.ts` (вынос `slugify()` из scripts).
- ✅ Audit-log: новая таблица `master_publication_log` (publish/unpublish/edit с user_id оператора + reason).

#### SEO-инфраструктура
- ✅ `<title>`, `<meta description>`, `<h1>` уникальные на каждой странице.
- ✅ Breadcrumbs (визуальный + JSON-LD).
- ✅ Schema.org JSON-LD на всех типах страниц.
- ✅ OpenGraph + Twitter cards (для шеринга в соцсетях/Telegram).
- ✅ Canonical URL.
- ✅ `robots.txt` (динамический через `app/robots.ts`).
- ✅ `sitemap.xml` + sub-sitemaps (`/sitemap-masters.xml`, `/sitemap-services.xml`, `/sitemap-service-city.xml`, `/sitemap-raboty.xml`).
- ✅ 301-редирект `www → non-www`.
- ✅ 301-редирект `честные-мастера.рф → chestnye-mastera.ru`.
- ✅ 301-редирект старого `sfera-master.ru/masters → /masteram`.
- ✅ Кастомная 404 страница со ссылками на главные разделы.
- ✅ noindex на /search?q=, /zayavka/spasibo, /policy/* (если решим).

#### Backend (api-server)
- ✅ Новый router `routes/marketplace.ts` со всеми server-to-server endpoints (см. секцию 8).
- ✅ Middleware `requireMarketplaceAuth` (проверяет `INTERNAL_API_SHARED_TOKEN` в заголовке).
- ✅ Endpoint `POST /api/marketplace/leads` создаёт `leads` с `source='marketplace'` + контекст.
- ✅ Endpoint `GET /api/marketplace/masters` (только опубликованные).
- ✅ Endpoint `GET /api/marketplace/master/:slug` (без приватных полей).
- ✅ Endpoint `GET /api/marketplace/service-city/:s/:c`.
- ✅ Endpoint `GET /api/marketplace/services`, `/cities`.
- ✅ Endpoint для on-demand revalidation: при изменении мастера/услуги — webhook на marketplace.
- ✅ Логирование всех запросов от marketplace (audit-trail).

#### БД (миграция 0005+)
- ✅ Расширение `masters`: `slug`, `is_published`, `public_bio`, `public_title`, `seo_title`, `seo_description`, `years_experience`, `published_at`.
- ✅ Новая таблица `cities` (нормализация городов).
- ✅ Новая таблица `services` (нормализация услуг, связь с category).
- ✅ Расширение `leads`: `source_page_url`, `source_page_type`, `service_slug`, `city_slug`, `marketplace_context (jsonb)`, `referrer`, `utm_source`, `utm_medium`, `utm_campaign`, `attached_master_id` (если форма со страницы мастера).
- ✅ Backfill: для существующих мастеров проставить `slug`, для городов/услуг — нормализовать из текстовых полей.

#### CRM
- ✅ Новая вкладка/секция `Маркетплейс` (или фильтр на `/crm/leads?source=marketplace`).
- ✅ Отображение source_page_url в карточке лида.
- ✅ Новая колонка в таблице мастеров: `Опубликован?` + кнопка «Опубликовать в маркетплейсе».
- ✅ Drawer мастера: вкладка «Публикация» — slug, public_bio, SEO-предпросмотр, кнопка «Открыть на marketplace».
- ✅ В `/crm/settings`: вкладка `Услуги`, вкладка `Города` (CRUD с slug и SEO-полями).
- ✅ При изменении опубликованного мастера — webhook на marketplace для revalidation.

#### Безопасность
- ✅ Капча на форме заявки (Yandex SmartCaptcha).
- ✅ Rate limit на `/api/leads` (Next.js): 5 запросов/мин/IP, 1 запрос/5 сек/телефон.
- ✅ Rate limit на `/api/marketplace/leads` (api-server): дублируется на бекенде.
- ✅ Чекбокс «Согласен на обработку персональных данных» — обязателен.
- ✅ Ссылка на политику конфиденциальности.
- ✅ Логирование IP, user-agent, source_page_url у каждого лида.

#### Деплой
- ✅ Railway service `marketplace-prod` (production).
- ✅ Railway service `marketplace-staging` (staging).
- ✅ Подключены домены: `chestnye-mastera.ru`, `www.chestnye-mastera.ru`, `честные-мастера.рф`, `www.честные-мастера.рф`.
- ✅ SSL-сертификаты (auto через Let's Encrypt / Cloudflare).
- ✅ Yandex.Metrika установлена.
- ✅ Google Analytics установлен.
- ✅ Yandex.Webmaster подтверждение хоста.
- ✅ Google Search Console подтверждение хоста.
- ✅ sitemap submitted в Yandex и Google.

### НЕ входит в V1 (откладываем):

- ❌ AI-дизайнер (`/dizajn/*`) — фаза 8.
- ❌ Подписки мастеров (Free/Pro/Enterprise) — фаза 8.
- ❌ Покупка лидов поштучно — фаза 8.
- ❌ Эксклюзивные лиды — фаза 8.
- ❌ Личный кабинет клиента (история заявок, статус заявки) — фаза 9. В V1 клиент вводит телефон в форме и через клиентскую PWA `sfera-master.ru/my-orders` смотрит заказы (это уже работает).
- ❌ Свайп-формат подбора мастера — фаза 9.
- ❌ Сложная автоматизация платежей — фаза 8 (вместе с подписками).
- ❌ Чат клиента с мастером **на маркетплейсе** — фаза 9 (сейчас есть на клиентской PWA).
- ❌ Многоязычность (en/uk/...).
- ❌ A/B тесты.
- ❌ Реферальная программа клиентов.
- ❌ Поиск с фасетами / Elasticsearch — V2.

---


## 7. Изменения БД для Production V1

### Принципы изменений

1. **Только новая миграция** (`0005_marketplace_baseline.sql`). Существующие миграции не трогаем.
2. **Все новые поля nullable или с default-значениями**, чтобы существующий код не сломался.
3. **Backfill отдельным скриптом** (`scripts/backfill-marketplace.ts`), запускается вручную после миграции.
4. **Нет breaking changes**: старые поля остаются, маркетплейс читает только публичные.

### `masters` — добавляем:

| Поле | Тип | Default | Назначение |
|---|---|---|---|
| `slug` | `varchar(100) UNIQUE` | NULL | URL-slug `/master/[slug]`, генерируется автоматически из `alias` при публикации |
| `is_published` | `boolean` | `false` | флаг публикации в маркетплейсе |
| `published_at` | `timestamp` | NULL | дата первой публикации (для sitemap lastmod) |
| `public_title` | `varchar(150)` | NULL | публичный заголовок: `Иван Петров — мастер сантехник в Краснодаре` |
| `public_bio` | `text` | NULL | публичное описание (plain text), 300-2000 chars; проходит автомодерацию (см. 11.5) |
| `seo_title` | `varchar(70)` | NULL | переопределение `<title>` если нужно |
| `seo_description` | `varchar(180)` | NULL | переопределение `<meta description>` |
| `years_experience` | `integer` | NULL | стаж лет — для отображения в карточке |
| `public_rating` | `numeric(3,2)` | NULL | рейтинг для публики (может отличаться от внутреннего, например, среднее по подтверждённым отзывам) |
| `public_reviews_count` | `integer` | `0` | счётчик публичных отзывов (denormalized для скорости) |

**Backfill**: всем существующим `is_published = false`. Slug генерируется при первой публикации (self-service из master-pwa или CRM-override) — `slugify(alias)` + suffix `-2`, `-3` для уникальности. **Slug сохраняется навсегда** — повторная публикация после unpublish даёт тот же URL (стабильность для SEO).

**Публикация требует прохождения автомодерации** — см. секцию 11.5. CRM-override позволяет оператору публиковать без проверок (для VIP-мастеров), фиксируется в `master_publication_log`.

### `services` — новая таблица (нормализация)

Сейчас есть `service_types (id, name)`. Расширяем до полной таблицы:

```
services
├── id                serial PK
├── slug              varchar(100) UNIQUE NOT NULL
├── name              varchar(255) NOT NULL
├── name_genitive     varchar(255)               // «сантехники» — для подзаголовков «Цены на сантехнику»
├── parent_id         integer REFERENCES services(id)  // для категорий: Электрика → Розетки и выключатели
├── icon              varchar(50)                // имя иконки lucide или эмодзи
├── description       text                        // короткое описание
├── body_md           text                        // SEO body (markdown)
├── seo_title         varchar(70)
├── seo_description   varchar(180)
├── h1                varchar(100)
├── price_from        integer                     // ориентировочно «от» (₽)
├── is_active         boolean DEFAULT true
├── sort_order        integer DEFAULT 0
├── created_at        timestamp NOT NULL DEFAULT now()
└── updated_at        timestamp NOT NULL DEFAULT now()
```

**Backfill**: из `service_types` копируем `id, name`, генерируем `slug` (транслит). Старая таблица остаётся для обратной совместимости api-server, на маркетплейс читаем только из новой `services`. Через 2-3 месяца после стабилизации — `service_types` помечаем deprecated и переводим всё на `services`.

### `cities` — новая таблица

Сейчас города — текстовые строки в `leads.city`, `orders.city`, `masters.city`. Создаём нормализованную таблицу:

```
cities
├── id                serial PK
├── slug              varchar(100) UNIQUE NOT NULL
├── name              varchar(100) NOT NULL
├── name_in           varchar(100)                // «в Краснодаре» — locative case
├── region            varchar(100)                // «Краснодарский край»
├── timezone          varchar(50) DEFAULT 'Europe/Moscow'
├── lat               numeric(9,6)
├── lng               numeric(9,6)
├── population        integer
├── seo_title         varchar(70)
├── seo_description   varchar(180)
├── h1                varchar(100)
├── body_md           text
├── is_active         boolean DEFAULT true
├── created_at        timestamp NOT NULL DEFAULT now()
└── updated_at        timestamp NOT NULL DEFAULT now()
```

**Backfill**: `SELECT DISTINCT city FROM masters UNION orders UNION leads`, нормализуем регистр, транслитерируем в slug. Города админ может потом отредактировать (исправить регион, добавить координаты).

В `masters`, `leads`, `orders` **НЕ заменяем** `city varchar` на `city_id`. Это слишком инвазивное изменение. Вместо этого добавляем nullable FK:

| Поле | Таблица | Тип | Назначение |
|---|---|---|---|
| `city_id` | `masters` | `integer REFERENCES cities(id) NULL` | связь, заполняется при публикации |
| `city_id` | `leads` | `integer REFERENCES cities(id) NULL` | заполняется при создании marketplace-лида |
| `service_id` | `leads` | `integer REFERENCES services(id) NULL` | основная услуга (для marketplace-лидов) |

Текстовые `city`/`service_type` остаются как есть — для обратной совместимости со старым кодом и Avito-импортами.

### `master_portfolio` — новая таблица

> **Houzz-модель: каждая запись = первичная единица контента маркетплейса.** Расширенная схема с обязательными полями для SEO-качества и юридической чистоты.

```
master_portfolio
├── id                    serial PK
├── master_id             integer REFERENCES masters(id) ON DELETE CASCADE
├── service_id            integer REFERENCES services(id) NOT NULL    -- обязательно для индексации в /raboty/[serviceSlug]
├── city_id               integer REFERENCES cities(id) NOT NULL      -- обязательно для индексации в /raboty/[serviceSlug]/[citySlug]
├── title                 varchar(150) NOT NULL                       -- например «Ремонт кухни 12 м² в стиле минимализм»
├── slug                  varchar(180) UNIQUE NOT NULL                -- /raboty/[slug] — формат `[service]-[area]m-[city]-[masterAlias]-[hash]`
├── description           text NOT NULL                               -- ≥150 chars (валидация на API), что было сделано
├── room_type             varchar(50)                                 -- enum: kitchen, bathroom, living_room, hallway, balcony, outdoor, other (для фильтрации в /raboty)
├── style_tags            text[] DEFAULT '{}'                         -- например ['minimalism','scandi','loft'] (для тегов и похожих работ)
├── before_photos         text[] DEFAULT '{}'                         -- URL'ы в R2/S3
├── after_photos          text[] DEFAULT '{}'                         -- ≥1 обязательно (валидация)
├── progress_photos       text[] DEFAULT '{}'                         -- опциональные «в процессе»
├── cover_photo_url       text                                        -- главная обложка (выбирается из after_photos[0] или вручную) для list views и og:image
├── before_after_layout   varchar(20) DEFAULT 'pair'                  -- pair / gallery / single — как рендерить
├── price_total           numeric(12,2) NOT NULL                      -- итоговая стоимость, обязательно
├── price_breakdown       jsonb                                       -- опционально: [{title:"плитка", amount:50000}, ...] для расширенной разбивки
├── duration_days         integer NOT NULL                            -- срок работ, обязательно
├── area_sqm              numeric(10,2)                               -- площадь м² (только для room-based, кухня/санузел/жилая)
├── materials_used        text[] DEFAULT '{}'                         -- теги материалов («керамогранит Cersanit», «затирка Litokol»)
├── completed_at          date NOT NULL                               -- когда завершён ремонт, обязательно
├── client_consent_given  boolean NOT NULL DEFAULT false              -- юридический gate: чекбокс «получено согласие клиента на публикацию» — без него статус draft
├── client_consent_at     timestamp                                   -- когда подтверждено
├── client_review_text    text                                        -- если клиент оставил отзыв
├── client_rating         integer CHECK (client_rating BETWEEN 1 AND 5)
├── order_id              integer REFERENCES orders(id) NULL          -- опциональная ссылка на реальный заказ — даёт E-E-A-T-сигнал, цены/срок верифицируются
├── status                varchar(20) NOT NULL DEFAULT 'draft'        -- draft / pending_review / published / unpublished / rejected
├── reject_reason         text                                        -- если rejected — почему
├── moderation_flags      jsonb                                       -- результат AI-модерации: nsfw_score, copy_detected_url, banned_words[]
├── reverse_image_check   varchar(20)                                 -- pending / clean / suspicious / stolen — результат reverse image search
├── view_count            integer DEFAULT 0
├── lead_count            integer DEFAULT 0                           -- сколько лидов сгенерил кейс (для лидерборда и приоритета в diспетчере)
├── is_featured           boolean DEFAULT false                       -- редакторский pick для главной /raboty
├── sort_order            integer DEFAULT 0
├── seo_title             varchar(70)                                 -- override автогенерации (если оператор/мастер хочет ручной title)
├── seo_description       varchar(180)                                -- то же для description
├── published_at          timestamp                                   -- когда впервые опубликован (для sort by recency и показа «новое»)
├── unpublished_at        timestamp                                   -- если был снят, для аудита
├── deleted_at            timestamp                                   -- soft delete
├── created_at            timestamp NOT NULL DEFAULT now()
└── updated_at            timestamp NOT NULL DEFAULT now()

INDEX idx_portfolio_published ON (status, published_at DESC) WHERE status='published' AND deleted_at IS NULL;
INDEX idx_portfolio_service_city ON (service_id, city_id, status, published_at DESC) WHERE status='published';
INDEX idx_portfolio_master ON (master_id, status, sort_order, created_at DESC);
INDEX idx_portfolio_room ON (room_type, status) WHERE status='published';
INDEX idx_portfolio_featured ON (is_featured, published_at DESC) WHERE is_featured=true AND status='published';
GIN INDEX idx_portfolio_styles ON style_tags;
GIN INDEX idx_portfolio_materials ON materials_used;
```

**Обязательные поля для перехода `draft → published`** (validation gate в API):
- `service_id`, `city_id` (FK)
- `title` ≥ 10 символов
- `description` ≥ 150 символов
- `price_total` > 0
- `duration_days` > 0
- `completed_at` (date in past)
- `after_photos.length` ≥ 1 (рекомендуется и `before_photos.length` ≥ 1, но не строго)
- `cover_photo_url` (если не задан — берём `after_photos[0]`)
- `client_consent_given = true` (юридический must)

Если хоть одно поле отсутствует — кейс остаётся в `draft`, не попадает на `/raboty/*`, не индексируется, **не отдаётся в sitemap**. Мастер видит чек-лист «дозаполните чтобы попасть в каталог».

**Источник данных** в V1:
- Self-service: мастер в PWA или на своей странице маркетплейса (фаза A секции 18) загружает кейсы.
- CRM-помощь: оператор может «опубликовать заказ как кейс» — выбирает `completed`-заказ в CRM → форма pre-filled из `orders` (service, city, completed_at, price_total, area), оператор добивает фото и описание → запись в `master_portfolio` со ссылкой на `order_id`.
- AI-helper: при описании кейса мастер может нажать «Помочь AI» → существующий AI-диспетчер расширяет короткое описание до текста ≥150 chars (см. подсекцию AI-helper в 11.7).

**Reverse image search** (защита от воровства фото):
- При upload каждого фото → отправляем превью в Yandex.Images reverse search API (или собственный perceptual hash + Bloom filter по уже виденным фото).
- Если фото найдено в интернете до того, как мастер его опубликовал → `reverse_image_check='suspicious'`, кейс уходит на ручную модерацию (`status='pending_review'`).
- Если perceptual hash совпадает с уже опубликованным кейсом другого мастера → `reverse_image_check='stolen'`, автоматический reject.
- Если кейс маркируется `clean` сразу — uplift в публикацию без ручной модерации.

### `master_portfolio_views` — таблица аналитики (опционально, V1.5)

```
master_portfolio_views
├── id            bigserial PK
├── portfolio_id  integer REFERENCES master_portfolio(id) ON DELETE CASCADE
├── ip_hash       varchar(64)                          -- sha256(ip+salt) для дедупликации просмотров
├── referrer      text                                 -- откуда пришли (yandex, google, internal)
├── city_geoip    varchar(100)                         -- город по IP, для аналитики местного интереса
├── viewed_at     timestamp NOT NULL DEFAULT now()
INDEX idx_portfolio_views_portfolio_time ON (portfolio_id, viewed_at DESC)
```

Для лидерборда «топ работ месяца» и аналитики мастеру в PWA («ваш кейс посмотрели N раз, X из них из Краснодара»). Можно отложить до V1.5.

### `master_reviews_public` — новая таблица

Текущая `master_reviews` — это **внутренние отзывы операторов о мастере** (sentiment positive/negative/neutral, текст). Их нельзя публиковать без модерации.

Создаём отдельную:

```
master_reviews_public
├── id                serial PK
├── master_id         integer REFERENCES masters(id) ON DELETE CASCADE
├── order_id          integer REFERENCES orders(id) NULL    // если отзыв привязан к конкретному заказу
├── client_name       varchar(150) NOT NULL                  // имя из orders или ввод оператором
├── client_phone_hash varchar(64)                            // sha256(phone) для дедупликации, без сохранения phone
├── client_city       varchar(100)
├── rating            integer NOT NULL CHECK (rating BETWEEN 1 AND 5)
├── text              text NOT NULL
├── photos            text[] DEFAULT '{}'                    // фото от клиента
├── moderation_status varchar(20) NOT NULL DEFAULT 'pending'  // pending / approved / rejected
├── moderated_by      integer REFERENCES users(id)
├── moderated_at      timestamp
├── moderation_note   text
├── is_featured       boolean DEFAULT false
├── created_at        timestamp NOT NULL DEFAULT now()
└── updated_at        timestamp NOT NULL DEFAULT now()
```

**Источник данных** в V1:
- Источник 1: после `orders.status = completed` и `orders.client_rating IS NOT NULL` — оператор вручную в CRM может скопировать `clientReview` в публичный отзыв (с ручной модерацией).
- Источник 2: позже (фаза 9) — клиентская PWA отправит форму отзыва после завершения заказа.

В V1 **достаточно ручного создания через CRM**. Не публикуем неотмодерированные.

### `leads` — добавляем поля для трекинга источника

| Поле | Тип | Default | Назначение |
|---|---|---|---|
| `source_page_url` | `text` | NULL | полный URL страницы откуда заявка: `https://chestnye-mastera.ru/santehnik/krasnodar` |
| `source_page_type` | `varchar(40)` | NULL | категория страницы: `service-city`, `master`, `service`, `home`, `case`, `pricing` |
| `service_slug` | `varchar(100)` | NULL | для marketplace — slug услуги со страницы |
| `city_slug` | `varchar(100)` | NULL | для marketplace — slug города со страницы |
| `service_id` | `integer REFERENCES services(id)` | NULL | FK на services |
| `city_id` | `integer REFERENCES cities(id)` | NULL | FK на cities |
| `marketplace_context` | `jsonb` | NULL | свободный контекст: `{ master_slug?, master_id?, design_id?, case_slug? }` |
| `referrer` | `text` | NULL | HTTP referrer header (если был) |
| `utm_source` | `varchar(100)` | NULL | UTM-метка из query |
| `utm_medium` | `varchar(100)` | NULL | UTM-метка |
| `utm_campaign` | `varchar(100)` | NULL | UTM-метка |
| `utm_term` | `varchar(200)` | NULL | UTM-метка |
| `utm_content` | `varchar(200)` | NULL | UTM-метка |
| `attached_master_id` | `integer REFERENCES masters(id)` | NULL | если заявка из карточки мастера — фиксируем интересующего мастера (потом в CRM можно показать оператору) |
| `client_ip` | `varchar(45)` | NULL | IP клиента (IPv4 или IPv6), для аудита и rate limit |
| `client_user_agent` | `text` | NULL | UA, для аудита |
| `consent_given_at` | `timestamp` | NULL | когда юзер согласился на обработку ПДн (важно для 152-ФЗ) |
| `captcha_score` | `numeric(3,2)` | NULL | если используем Turnstile/SmartCaptcha с риск-скором |

Существующее поле `source` (`text`) уже есть в схеме — там будет строка `marketplace`. Не делаем новый enum, чтобы не ломать миграцию.

### `seo_redirects` — новая таблица (для управления редиректами через CRM)

Чтобы оператор мог настраивать редиректы без деплоя (например, переименовали slug мастера, нужно сохранить старую ссылку):

```
seo_redirects
├── id                serial PK
├── from_path         varchar(500) UNIQUE NOT NULL
├── to_path           varchar(500) NOT NULL
├── status_code       integer NOT NULL DEFAULT 301      // 301 / 302 / 308
├── is_active         boolean DEFAULT true
├── note              text
├── created_at        timestamp NOT NULL DEFAULT now()
└── created_by        integer REFERENCES users(id)
```

Marketplace в `middleware.ts` проверяет эту таблицу (с кешем 60 секунд) и применяет редирект.

### Что НЕЛЬЗЯ публиковать на marketplace

При проектировании DTO `getMasterPublic(slug)` явно **исключаем**:

| Поле | Причина |
|---|---|
| `phone` (мастера) | звонят напрямую, обходят платформу. Показываем только после оформления заявки и согласия мастера. В V1 — вообще не показываем. |
| `passport_photo_url`, `passport_reg_photo_url`, `contract_*` | паспортные данные мастера, защищённые ПДн |
| `pwa_login`, `pwa_password_hash` | креды |
| `telegram_id`, `max_chat_id` | внутренние идентификаторы |
| `debt`, `master_wallet.*`, `master_deposits.*` | финансовая внутренняя инфо |
| `consecutive_cancellations`, `blocked_*`, `manual_unblocks_count` | репутационная внутренняя |
| `is_test_master`, `tags[]`, `voronka_column_id`, `working_hours`, `preferred_districts[]` | внутренние операторские поля |
| `total_leads_received`, `accepted_orders` (если меньше 10 — может выглядеть отталкивающе) | внутренние KPI |
| `client_phone`, `client_name` (в leads/orders) | ПДн клиентов |
| `operator_note`, `cancel_reason`, `cancel_type` | служебные комментарии |
| `master_reviews` (внутренние) | без модерации не публикуются |
| `bot_memory`, `dispatcher_followups` | внутренние логи |

**Правило**: marketplace API **никогда не отдаёт `SELECT *`**. Только явный whitelist полей в DTO.

---

## 8. API-архитектура marketplace

### Server-to-server flow

```
Пользователь на chestnye-mastera.ru/santehnik/krasnodar
       ↓
   Заполняет форму заявки (LeadForm.tsx — client component)
       ↓
   <form action="/api/leads" method="POST">
       ↓ POST на тот же домен (chestnye-mastera.ru/api/leads)
   Next.js Route Handler app/api/leads/route.ts
       ↓ (на сервере)
       1. Валидирует zod-схемой
       2. Проверяет капчу (server-side)
       3. Проверяет rate limit
       4. Извлекает IP, UA, referrer, UTM из заголовков
       5. Делает fetch на INTERNAL_API_BASE_URL
       ↓ POST https://sfera-master.ru/api/marketplace/leads
       (header: Authorization: Bearer ${INTERNAL_API_SHARED_TOKEN})
   api-server: routes/marketplace.ts → POST /leads
       ↓
       1. middleware requireMarketplaceAuth (проверка токена)
       2. валидация zod (повторно, defence in depth)
       3. дедуп по телефону за 30 дней (как в /api/landing/leads)
       4. INSERT INTO leads (..., source='marketplace', source_page_url, service_id, city_id, ...)
       5. notifyManagerNewLead() в Max-бот (как сейчас)
       ↓
       Возврат { ok, lead_id } обратно в Next.js
   Next.js → редирект на /zayavka/spasibo
       ↓
       Пользователь видит «спасибо за заявку»
       ↓
   В CRM /crm/leads (вкладка «Маркетплейс») оператор видит лид
       ↓
   Оператор нажимает «Отправить мастерам» → POST /leads/:id/send-to-buffer
       ↓
   Создаётся orders, запускается dispatch, мастера получают пуш в PWA
```

### Endpoints на marketplace (Next.js)

Все они — **route handlers** в `app/api/*/route.ts`. Marketplace ходит к ним только своими страницами.

| Endpoint | Method | Принимает | Возвращает | Назначение |
|---|---|---|---|---|
| `/api/leads` | POST | `{ name, phone, city_slug, service_slug, area?, comment, captcha_token, consent }` | `{ ok, lead_id, redirect_to }` | Приём формы заявки. Проксирует в backend. |
| `/api/search?q=...` | GET | `q` (минимум 2 символа) | `{ services: [], cities: [], masters: [] }` | Автокомплит для поиска в header. Кешируется на 5 мин. |
| `/api/revalidate` | POST | `{ paths: string[], token }` | `{ ok, revalidated }` | Webhook для on-demand revalidation. Защищён `INTERNAL_API_SHARED_TOKEN`. Дёргается из api-server при изменении мастера/услуги/города. |

**Важно**: `/api/masters`, `/api/services`, `/api/cities` на marketplace **не делаем как публичные клиентские endpoints**. Все данные для страниц подгружаются через server components → fetch к `INTERNAL_API_BASE_URL`. Это даёт:
- автоматический cache через `fetch(..., { next: { revalidate: 3600 } })`;
- нет CORS (запрос server-side);
- токен `INTERNAL_API_SHARED_TOKEN` не утекает в браузер;
- защита от прямого скрапинга (хотя данные публичные, скорость скрапинга ограничивается).

### Endpoints на api-server (новый router `routes/marketplace.ts`)

Все защищены middleware `requireMarketplaceAuth` (Bearer token). Никогда не вызываются из браузера напрямую.

| Endpoint | Method | Параметры | Возвращает | Кеш |
|---|---|---|---|---|
| `/api/marketplace/leads` | POST | body: `{ name, phone, city_slug, service_slug, area?, comment, source_page_url, source_page_type, attached_master_id?, utm: {...}, ip, user_agent, referrer }` | `{ ok, lead_id }` | нет (write) |
| `/api/marketplace/services` | GET | `?active=true` | `Service[]` (slug, name, parent_id, price_from, icon) | `Cache-Control: public, max-age=300, stale-while-revalidate=3600` |
| `/api/marketplace/services/:slug` | GET | — | `Service` + `body_md` + список топ-городов где есть мастера | как выше |
| `/api/marketplace/cities` | GET | `?active=true` | `City[]` (slug, name, region, masters_count) | как выше |
| `/api/marketplace/cities/:slug` | GET | — | `City` + `body_md` + топ-услуги в городе | как выше |
| `/api/marketplace/masters` | GET | `?city=&service=&page=&limit=&sort=rating` | `{ items: PublicMaster[], total, page, limit }` | `max-age=300` |
| `/api/marketplace/master/:slug` | GET | — | `PublicMaster` + portfolio + reviews | `max-age=600` |
| `/api/marketplace/service-city/:s/:c` | GET | `?limit=20` | `{ service: Service, city: City, masters: PublicMaster[], avg_rating, total_masters, faq: [] }` | `max-age=600` |
| `/api/marketplace/cases` | GET | `?service=&city=&limit=&page=` | `{ items: Case[], total }` | `max-age=600` |
| `/api/marketplace/cases/:slug` | GET | — | `Case` (полные фото, отзыв, мастер) | `max-age=600` |
| `/api/marketplace/sitemap-data` | GET | `?type=masters\|services\|service-city\|cases` | массив `{ slug, lastmod, priority }` | `max-age=3600` |
| `/api/marketplace/seo-redirects` | GET | — | `[{ from, to, status }]` | `max-age=60` |

#### DTO `PublicMaster`:

```ts
{
  slug: string;
  alias: string;                   // имя
  public_title: string | null;
  public_bio: string | null;
  city: { slug, name } | null;
  services: Array<{ slug, name }>;
  rating: number;                  // public_rating
  reviews_count: number;
  years_experience: number | null;
  avatar_url: string | null;       // resolved URL
  portfolio_count: number;
  has_contract: boolean;           // для бейджа «верифицирован»
  // НЕТ: phone, passport_*, debt, internal_notes, blocked_*, …
}
```

### CORS policy

Marketplace-endpoints `/api/marketplace/*` на api-server **НЕ имеют CORS** для браузера. Только server-to-server через токен.

Существующий CORS на api-server (`app.ts: getAllowedOrigins`) добавляем `https://chestnye-mastera.ru` — но **только для legacy/будущих публичных endpoints типа `/api/landing/leads`** (если будем продолжать использовать). Сами marketplace-страницы делают fetch server-side, CORS им не нужен.

### Защита формы заявки

1. **Капча**: Yandex SmartCaptcha (для России — лучше для бот-детекции российских ботов).
   - На фронте: `<SmartCaptcha />` от Yandex. Получает `captcha_token`.
   - На сервере (Next.js route): проверка через `https://smartcaptcha.yandexcloud.net/validate` с `secret_key`. Если invalid → 400.
2. **Rate limit (Next.js)**: `lru-cache` или `@upstash/ratelimit` (Redis). Лимиты:
   - 5 заявок/мин/IP.
   - 1 заявка/30 сек/IP.
   - 1 заявка/5 минут/телефон (защита от A/B-тестирования бота).
3. **Rate limit (api-server)**: defence-in-depth. На `/api/marketplace/leads`:
   - 20 заявок/мин/IP (от того же next.js-сервиса — IP будет один).
   - 1 заявка/5 минут/телефон.
4. **Honeypot field**: скрытое поле `<input name="website" tabindex="-1" autocomplete="off" />` — ботам сложно не заполнить. Если заполнено → молча отклоняем (return 200, чтобы бот не понял).
5. **Проверка `Origin` / `Referer`** на Next.js route — должен быть `chestnye-mastera.ru`. Если не он — 400.
6. **Минимальное время заполнения**: на форме фиксируем `formMountedAt` в hidden field. Если submit прилетел через < 2 секунд после рендера — отклоняем (бот заполняет мгновенно).
7. **Логирование** в `leads.client_ip`, `client_user_agent`, `referrer`, `captcha_score`, `marketplace_context` для аудита подозрительных паттернов.

### CSRF

Поскольку форма submit'ится на тот же домен (Next.js же отдаёт страницу), достаточно `same-origin` cookie + `Origin` header check. Дополнительно — `csrfToken` в hidden field, генерируемый при рендере страницы и проверяемый на route handler. Реализовать через `next-csrf` или вручную через подписанный cookie.

---

## 9. CRM-изменения

### Для мастеров (`/crm/masters`)

> **Self-service публикация — основной путь** (master-pwa). CRM-override используется
> оператором для аварийных и админских кейсов:
> - принудительная разпубликация по жалобе клиента или мастера;
> - редактирование `publicTitle` / `publicBio` за мастера, если он не отвечает;
> - ручная публикация без автомодерации (VIP-мастера, исключение из общего правила).
>
> Любое действие оператора через override логируется в `master_publication_log`
> (см. 11.5) с reason — для аудита.

Новая колонка в таблице:
- **«Опубликован»** — иконка/badge зелёный/серый. Сортировка по `is_published`.

Новый фильтр:
- «Только опубликованные / только неопубликованные / все».

Действие в context-menu / toolbar:
- **«Опубликовать (override)»** (одиночное; массовая публикация не предусмотрена — каждый мастер требует индивидуальной проверки):
  - дополнительный confirm с предупреждением «вы публикуете без автомодерации»;
  - запрашивает текстовое поле `reason` (обязательно);
  - валидация только базовая: `alias` заполнен, `city` заполнен, `phone` заполнен, `status='active'`;
  - генерация `slug` из `alias` + проверка уникальности (если ещё нет);
  - дёргает webhook `POST chestnye-mastera.ru/api/revalidate` для `/sitemap.xml`, `/master/{slug}`, `/mastera`, `/{service}/{city}`;
  - устанавливает `published_at = now()`;
  - запись в `master_publication_log` с `actor='operator'`, `action='publish_override'`, `reason`.
- **«Снять с публикации (жалоба)»**:
  - запрашивает обязательный `reason` (жалоба клиента, нарушение правил и т.д.);
  - запись в `master_publication_log` с `actor='operator'`, `action='unpublish_complaint'`, `reason`.

Drawer мастера (расширяется новой вкладкой):

**Вкладка «Публикация»**:
- toggle `is_published`;
- input `slug` (можно вручную поправить, при изменении — старый slug добавляется в `seo_redirects`);
- textarea `public_bio` (markdown editor, лимит символов);
- input `public_title` (с превью «как увидит Google»);
- input `seo_title`, `seo_description` (опционально, по умолчанию генерится автоматически);
- input `years_experience`;
- секция **«SEO-предпросмотр»**: показывает Google snippet (title + URL + description) как будет в выдаче;
- секция **«Превью карточки»**: iframe или ссылка `Открыть на маркетплейсе ↗` → `https://chestnye-mastera.ru/master/{slug}`;
- секция **«Портфолио»**: список из `master_portfolio`, кнопки «добавить», «опубликовать заказ как кейс».
- секция **«Публичные отзывы»**: список модерируемых отзывов, кнопки approve/reject.

**Вкладка «Услуги и цены»**:
- редактирование `master.servicePrices` (json) — массив `{ service_id, price_from }`. С привязкой к нормализованной `services`.

### Для лидов (`/crm/leads`)

Новая вкладка/фильтр **«Маркетплейс»**:
- фильтр `source = 'marketplace'`.
- колонки: `source_page_type`, `service_slug` + `city_slug`, `attached_master_id` (если есть).

Drawer лида (детальный просмотр):
- секция **«Источник заявки»**:
  - источник: `marketplace`
  - URL страницы: `https://chestnye-mastera.ru/santehnik/krasnodar` (кликабельная ссылка для оператора)
  - тип страницы: `service-city`
  - привязанный мастер: ссылка на drawer мастера (если есть)
  - UTM: source / medium / campaign
  - Referrer
  - IP / user-agent (показывается только админу)
- если `source_page_type='master'` — оператор видит «клиент пришёл с карточки мастера X» и может **сразу назначить именно этого мастера** (опция «Отправить только мастеру X» в send-to-buffer).

### Для услуг и городов

Новые разделы в `/crm/settings`:

**Вкладка «Услуги»**:
- таблица services (CRUD).
- колонки: name, slug, parent (категория), price_from, is_active.
- редактирование: name, slug, name_genitive, parent_id, icon, description, body_md (markdown editor), seo_title, seo_description, h1, price_from, is_active, sort_order.
- кнопка «Опубликовать на маркетплейсе» — после изменения дёргает revalidation для `/uslugi/{slug}`.

**Вкладка «Города»**:
- таблица cities (CRUD).
- колонки: name, slug, region, masters_count, is_active.
- редактирование: name, slug, name_in (locative), region, lat/lng, population, seo_title, seo_description, h1, body_md.

**Вкладка «SEO-редиректы»**:
- таблица `seo_redirects`.
- CRUD: from_path → to_path, status_code, is_active.

### Аналитика для маркетплейса (отдельная вкладка позже)

В V1 не делаем отдельный дашборд маркетплейса — KPI можно посмотреть через Yandex.Metrika и через стандартный фильтр `source=marketplace` в `/crm/leads`. В V1.5/V2 — добавить:
- конверсия страница → заявка по типам страниц.
- топ-страницы по заявкам.
- LTV лида с маркетплейса (создан → orders.completed → выплачена комиссия).
- А/Б тесты CTA.

---

## 10. PWA-изменения

### Принцип V1: **минимальные правки**.

Маркетплейс-лиды попадают в существующий поток через `leads → orders → dispatch → push в PWA`. Мастер видит обычный заказ, без отличий. **Это правильно для V1**: не сегментируем мастеров, не путаем UX, не создаём новые экраны.

### Что нужно добавить (минимум):

1. **В карточке заказа в PWA** (`/master-pwa/orders` и в Home в карточке нового заказа) — мелкое поле «Источник: маркетплейс» (просто info-text). Это поможет мастеру понимать, откуда лид. Реализуется одной строкой в JSX, читая `order.source` или `order.lead.source`.

2. **Если `attached_master_id` совпадает с мастером** — показывать badge «Клиент выбрал именно вас» (мотивация). Это получаем через `dispatch.attached_master_id` (если решим прокидывать).

3. **В лидах с маркетплейса**, если `source_page_type='design'` (фаза 8 +) — превью изображения дизайна в карточке.

В **V1 ничего другого не меняем** в PWA. Сервис-воркер, manifest, login — без изменений.

### Что отложено:

- ❌ Новая лента «маркетплейс-лиды» с возможностью купить лид.
- ❌ Подписки.
- ❌ Анонимный режим (телефон скрыт, только город+район+цена).
- ❌ Эксклюзивные лиды.
- ❌ Cтатистика «вы получили 23 лида с маркетплейса этом месяце».

Все эти вещи — фаза 8. Архитектурно мы оставляем для них место (в `leads` есть `marketplace_context`, в `master_wallet` есть `balance` для будущих списаний).

---

## 11. SEO-требования

### Обязательное на каждой публичной странице

| Элемент | Реализация |
|---|---|
| **SSR HTML с контентом** | Server components Next.js по умолчанию. Никаких `'use client'` для основного контента. Hydration только для интерактивных частей (форма, фильтры). |
| `<title>` | `generateMetadata` в каждой странице. Уникальный, ≤60 chars, шаблон `${seo_title || name} — Честные мастера` |
| `<meta description>` | `generateMetadata`. Уникальное, ≤160 chars. Если нет в БД — генерится по шаблону. |
| `<h1>` | один на странице, в верхней части main content. |
| **Breadcrumbs** | визуальный компонент `<Breadcrumbs>` + JSON-LD `BreadcrumbList`. Пример: `Главная > Услуги > Сантехника > Краснодар`. |
| `<link rel="canonical">` | абсолютный URL через `absoluteUrl(path)`. На страницах с пагинацией — canonical на первую страницу или с параметром (по выбору, обычно на чистый URL без `?page=1`). |
| **OpenGraph** | `og:title`, `og:description`, `og:url`, `og:image` (1200×630), `og:type`, `og:site_name`. На карточке мастера — `og:image` = аватар мастера или генерируемый превью. |
| **Twitter card** | `twitter:card=summary_large_image`, `twitter:title`, `twitter:description`, `twitter:image`. |
| **JSON-LD schema.org** | см. подсекцию ниже |
| `<meta name="robots">` | по умолчанию `index, follow`. Для служебных — `noindex, nofollow` или `noindex, follow` (для пагинации, фильтров с параметрами). |
| **Sitemap inclusion** | `app/sitemap.ts` в Next.js — динамически генерит `sitemap.xml` из БД. |
| **Clean URL** | без trailing slash на всех страницах (Next.js по умолчанию). Slug всегда в lower-case, дефисы вместо подчёркиваний. |
| **No duplicate content** | избегаем дублей: не индексируем `/?page=1`, `/search?q=...`, `?sort=...`. |
| **Pagination** | `<link rel="prev">`, `<link rel="next">`. На странице 2+ — обычно `noindex, follow`. |
| **Изображения с `alt`** | каждая `<Image>` обязан иметь `alt`. Если декоративная — `alt=""`. Аватары: `alt="Иван Петров — мастер сантехник в Краснодаре"`. |
| **Lazy loading** | `next/image` сам делает lazy для off-screen. Для outside-of-viewport hero — `priority={true}`. |
| **Core Web Vitals** | LCP < 2.5s — inline critical CSS, `next/font` для шрифтов с `display: swap`, prefetch hero-изображения. CLS < 0.1 — у всех `<Image>` явные `width/height`. INP < 200ms — минимум client JS, lazy hydration. |

### Schema.org JSON-LD — подробно по типам страниц

**На всех страницах в `<head>`** (через root layout):
- `Organization` (один раз, единственный для сайта):
  ```jsonld
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Честные мастера",
    "url": "https://chestnye-mastera.ru",
    "logo": "https://chestnye-mastera.ru/logo.png",
    "sameAs": [],
    "contactPoint": [{ "@type": "ContactPoint", "telephone": "+7-XXX-...", "contactType": "customer service" }]
  }
  ```
- `WebSite` с `SearchAction`:
  ```jsonld
  {
    "@type": "WebSite",
    "url": "https://chestnye-mastera.ru",
    "potentialAction": {
      "@type": "SearchAction",
      "target": "https://chestnye-mastera.ru/search?q={search_term_string}",
      "query-input": "required name=search_term_string"
    }
  }
  ```

**На карточке мастера `/master/[slug]`**:
- `LocalBusiness` (или более узкий `ProfessionalService`):
  ```jsonld
  {
    "@type": "LocalBusiness",
    "name": "Иван Петров",
    "description": "...public_bio...",
    "image": "...avatar...",
    "url": "https://chestnye-mastera.ru/master/ivan-petrov",
    "telephone": null,  // НЕ выставляем номер мастера
    "address": { "@type": "PostalAddress", "addressLocality": "Краснодар", "addressRegion": "Краснодарский край", "addressCountry": "RU" },
    "areaServed": { "@type": "City", "name": "Краснодар" },
    "aggregateRating": { "@type": "AggregateRating", "ratingValue": 4.9, "reviewCount": 23 },
    "review": [
      { "@type": "Review", "author": "Анна К.", "reviewRating": { "@type": "Rating", "ratingValue": 5 }, "reviewBody": "..." }
    ]
  }
  ```
- `BreadcrumbList`.

**На странице услуга × город `/[serviceSlug]/[citySlug]`**:
- `Service`:
  ```jsonld
  {
    "@type": "Service",
    "name": "Сантехнические работы",
    "areaServed": { "@type": "City", "name": "Краснодар" },
    "provider": { "@type": "Organization", "name": "Честные мастера" },
    "offers": {
      "@type": "AggregateOffer",
      "lowPrice": 1000,
      "highPrice": 50000,
      "priceCurrency": "RUB"
    }
  }
  ```
- `BreadcrumbList`.
- `FAQPage` (если есть FAQ-секция на странице):
  ```jsonld
  {
    "@type": "FAQPage",
    "mainEntity": [
      { "@type": "Question", "name": "Сколько стоит вызов сантехника в Краснодаре?", "acceptedAnswer": { "@type": "Answer", "text": "..." } }
    ]
  }
  ```

**На странице работы `/raboty/[slug]`** (полная схема — секция 11.7.4):
- `CreativeWork` (главный объект кейса с фото-галереей, автором, датами).
- `Service` + `Offer` (услуга + цена, для коммерческого ранжирования).
- `ImageObject` для каждого фото.
- `Person` (мастер-автор) — связь через `@id` с его `LocalBusiness` на странице `/master/[slug]`.
- `Review` + `AggregateRating` (если есть отзыв клиента и рейтинг).
- `BreadcrumbList`.

**На страницах цен `/ceny/...`**:
- `OfferCatalog` или `Service` с `priceRange` + список под-услуг как `Offer`.

### Helpers для SEO

В `artifacts/marketplace/lib/seo.ts`:

```ts
// абсолютный URL
absoluteUrl(path: string): string

// дефолтная generateMetadata
generatePageMetadata(opts: {
  title, description, canonical, ogImage, noindex
}): Metadata

// JSON-LD builder
jsonLdBreadcrumbs(items: { name, url }[]): JsonLdScript
jsonLdLocalBusiness(master): JsonLdScript
jsonLdService(service, city): JsonLdScript
```

И на каждой странице:
```ts
export async function generateMetadata({ params }) {
  const master = await fetchMaster(params.slug);
  if (!master) return { title: 'Мастер не найден' };
  return generatePageMetadata({
    title: master.seo_title || `${master.alias} — мастер ${master.specialization} в ${master.city.name}`,
    description: master.seo_description || `${master.public_bio?.slice(0, 150)}...`,
    canonical: absoluteUrl(`/master/${master.slug}`),
    ogImage: master.avatar_url || '/og-default.png',
  });
}
```

---


## 11.5 Публикация профиля мастера: требования и автомодерация

> **Дополнение к секции 11.** Описывает что должен заполнить мастер, чтобы карточка
> попала на маркетплейс, и как backend защищается от спама/мусорных профилей
> без ручной модерации.

### Принципы

1. **Self-service из master-pwa — основной путь.** Мастер редактирует свой профиль и сам нажимает «Опубликовать».
2. **CRM-override** — оператор может опубликовать VIP-мастера без автомодерации, разпубликовать по жалобе, или редактировать поля за мастера. Все override-действия логируются в `master_publication_log` с обязательным `reason`.
3. **Slug фиксируется на первой публикации навсегда** — повторная публикация после unpublish даёт тот же URL (стабильность ссылок для SEO).
4. **Каждый PATCH `publicBio` / `publicTitle` прогоняется через автомодерацию**, даже после первой публикации (защита от подмены контента: «опубликовался → подсунул телефон»).
5. **Никаких внешних API для модерации** в V1 — только локальные regex и offline-библиотеки. Цель: <50ms на проверку, нулевая зависимость от стороннего сервиса.

### Обязательные поля для публикации

Backend-валидация в `POST /api/master-pwa/profile/publish`. При недостающих полях возвращает `400` с массивом `{ field, code, message }` — UI master-pwa показывает по полям.

| Поле | Источник | Требование |
|---|---|---|
| `alias` | `masters` | непустое (есть всегда после регистрации) |
| `city` | `masters` | непустое + matches `cities.name` |
| `phone` | `masters` | заполнен (контакт оператора, **не публикуется**) |
| `specializations` | `masters` | ≥ 1 элемента, каждая существует в `service_types.name` |
| `servicePrices` | `masters` | ≥ 2 позиций с `priceFrom > 0` |
| `customAvatarUrl` | `masters` | не NULL — фото обязательно |
| `publicBio` | `masters` | 300–2000 chars после trim, прошёл автомодерацию |
| `yearsExperience` | `masters` | целое 0..70 (0 допустим — для новичков; поле обязательно заполнить) |
| `publicTitle` | `masters` | опц. 5–150 chars; если пусто — fallback `${alias}, ${первая_специализация} в ${город}` |
| `seoTitle` | `masters` | опц. ≤70 chars; auto-generate если пусто |
| `seoDescription` | `masters` | опц. ≤180 chars; auto-generate из `publicBio[0..160]` если пусто |

### Автомодерация текстовых полей

Срабатывает на:
- `POST /api/master-pwa/profile/publish`
- `PATCH /api/master-pwa/profile` если в payload есть `publicBio` или `publicTitle` — даже при `is_published=true`
- `POST /api/master-pwa/portfolio` и `PATCH /api/master-pwa/portfolio/:id` для полей `title`, `description` (те же правила)

Helper: `artifacts/api-server/src/lib/marketplaceModeration.ts` экспортирует `validateText(text, opts) → { ok, errors }`.

#### Запрещённый контент (custom regex — собственный код для полного контроля)

- **Телефоны**:
  - Цифровые: `/(?:\+?[78])?[\s\-(]*\d{3}[\s\-)]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}/`
  - Скрытые буквами: `/(восемь|семь|девять|восем)\s*(сот[ыь]?|тысяч)/i` (минимально, обходы скорее ломают семантику)
- **Email**: `/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i`
- **URL и домены**: `/(https?:\/\/|www\.[a-z]|t\.me\/|wa\.me\/|vk\.com\/|instagram\.com\/)/i`
- **Социальные хэндлы и упоминания мессенджеров**:
  `/@[a-z0-9_]{4,}|telegram|whatsapp|viber|вотсап|вотсапп|телеграм|телеграмм|инстаграм|вконтакте/i`
- **HTML/markdown-инъекции**: strip всех `<...>` тегов, экранирование при выводе в HTML.
- **Чрезмерный CAPS**: отношение заглавных букв к строчным > 0.5 на тексте длиннее 30 chars → reject.

#### Нецензурная лексика — библиотека [`obscenity`](https://www.npmjs.com/package/obscenity)

- l33t-нормализация (а→a латинская, 0→о, повторы букв «суууука»);
- кастомный `DataSet` с ~40 русскими корнями (положены в код `lib/marketplaceModeration.ts`, не в БД, чтобы быстро правились с PR);
- порог: ≥ 1 совпадение → reject c кодом `PROFANITY`.

Зависимость добавляется в `artifacts/api-server/package.json`:
```json
"obscenity": "^0.4.x"
```

#### Минимальные требования к качеству

- ≥ 5 слов длиной > 2 символов (защита от «ааааа….»);
- ratio кириллических символов ≥ 0.5 (защита от latin-spam, эмодзи-залива).

#### Формат ответа при отказе

```json
{
  "ok": false,
  "errors": [
    {
      "field": "publicBio",
      "code": "CONTAINS_PHONE",
      "message": "В описании указан телефон — уберите контактные данные."
    },
    {
      "field": "publicBio",
      "code": "TOO_SHORT",
      "message": "Минимум 300 символов, у вас 142."
    }
  ]
}
```

UI master-pwa разбирает массив `errors` и подсвечивает соответствующее поле с конкретным сообщением.

### Slug-генерация

Helper: `artifacts/api-server/src/lib/slug.ts` — экспортирует `slugify(input)` и `pickUniqueSlug(base, takenChecker)`.
- Алгоритм такой же как в `scripts/src/backfill-marketplace-slugs.ts` (GOST-7.79 system B simplified, lowercase, дефисы вместо пробелов).
- Уникальность: если `slug` занят — пробуем `${slug}-2`, `${slug}-3`, … (cap 9999).
- Slug **никогда не меняется** после первой публикации, даже если `alias` правится. При смене `alias` — старый `slug` остаётся.
- Если оператору нужен новый slug — он меняет вручную в CRM, и старый автоматически добавляется в `seo_redirects` (301 на новый URL).

### CRM override

В `/crm/masters` drawer мастера, вкладка **«Публикация»**:
- Toggle `is_published` (мгновенный publish/unpublish без автомодерации — операторская воля).
- Редактирование `publicTitle`, `publicBio`, `yearsExperience`, `seoTitle`, `seoDescription` за мастера.
- Кнопка «Снять с публикации (жалоба)» — обязательный текстовый `reason`, запись в `master_publication_log`.
- Превью карточки: `Открыть на marketplace ↗` → `https://chestnye-mastera.ru/master/{slug}`.

### Audit log: новая таблица `master_publication_log`

```
master_publication_log
├── id              serial PK
├── master_id       integer NOT NULL REFERENCES masters(id) ON DELETE CASCADE
├── actor           varchar(20) NOT NULL    -- 'master' | 'operator'
├── actor_id        integer                  -- masters.id или users.id (nullable, зависит от actor)
├── action           varchar(40) NOT NULL    -- 'publish' | 'unpublish' | 'publish_override' | 'unpublish_complaint' | 'edit_public_fields'
├── reason           text                     -- обязателен для override и unpublish_complaint
├── changes          jsonb                    -- для 'edit_public_fields': { fieldName: { from, to } }
├── created_at       timestamp NOT NULL DEFAULT now()
└── ip               varchar(45)              -- IP актора (нужен для аудита)

INDEX master_publication_log_master_id_idx ON master_id
INDEX master_publication_log_action_idx ON action
INDEX master_publication_log_created_at_idx ON created_at DESC
```

Эта таблица вводится **новой миграцией `0007_master_publication_log.sql`** (миграция 0006 уже занята AI-дизайнером, см. конец секции 11.5).

### Sitemap revalidation

После publish/unpublish (из master-pwa или CRM) backend вызывает:
```
POST ${MARKETPLACE_PUBLIC_URL}/api/revalidate
Authorization: Bearer ${INTERNAL_API_SHARED_TOKEN}
Content-Type: application/json

{ "paths": ["/sitemap.xml", "/master/${slug}", "/mastera"] }
```

Этот endpoint в `artifacts/marketplace/app/api/revalidate/route.ts` вызывает `revalidatePath()` для каждого. Sitemap обновляется мгновенно — не ждём 60 сек ISR.

Сам endpoint `/api/revalidate` тоже создаётся в рамках этой фичи (план это уже предполагал, но реально не было).

### SEO-сигналы на `/master/[slug]` (расширения к секции 11)

Уже описано в #11. Добавляется:
- **Schema.org `Service[]`** — для каждой `specialization` в DTO добавляется отдельный `Service` JSON-LD с `offers.lowPrice` из соответствующей записи `servicePrices`. Это даёт карточке вес для коммерческих запросов «цена сантехника краснодар».
- **`AggregateRating` рендерится только при `publicReviewsCount ≥ 1`** — Яндекс штрафует пустые рейтинги.
- **Внутренние ссылки** — каждая `specialization` мастера в карточке оборачивается в `<Link href="/${serviceSlug}/${citySlug}">` — это распределяет PageRank внутри сайта и поднимает SEO-страницы услуга×город.
- **`dateModified`** — JSON-LD `dateModified = max(masters.publishedAt, latest master_portfolio.updatedAt)`. Обновляется при каждом publish и при любых правках портфолио.

### Портфолио в V1 (self-service из PWA)

Используется существующая таблица `master_portfolio` (создана в 0005). Новые endpoints в `artifacts/api-server/src/routes/master-pwa.ts`:

| Endpoint | Назначение |
|---|---|
| `GET /api/master-pwa/portfolio` | список своих кейсов (включая неопубликованные) |
| `POST /api/master-pwa/portfolio` | создать кейс (title, description, serviceTypeId, cityId, priceFrom, priceTo, area, completedAt) |
| `PATCH /api/master-pwa/portfolio/:id` | обновить кейс |
| `DELETE /api/master-pwa/portfolio/:id` | удалить кейс |
| `POST /api/master-pwa/portfolio/:id/photos` | загрузить before/after photo (тот же flow что аватар, с image-resize через sharp) |

Правила:
- **Автомодерация title/description** — те же фильтры что для `publicBio` (телефоны, email, URL, мат, CAPS, кириллица). Каждое сохранение прогоняется заново.
- **Лимит 30 кейсов** на мастера (защита от спама/демпинга в выдаче).
- При сохранении проходит модерацию → автоматически `is_published=true` для записи. При найденных нарушениях — `400` с `errors[]`, кейс не сохраняется.
- Фото обязательно: ≥ 1 в `beforePhotos` или ≥ 1 в `afterPhotos` (рекомендуется обе категории, но не строго).
- Удалённые кейсы делаются soft-delete (`deleted_at`) для возможности восстановления оператором.

UI в `master-pwa/profile.tsx` — новая секция «Портфолио»: грид мини-кейсов с миниатюрой первого фото, кнопка «+ Добавить кейс», модал с before/after upload, услугой/городом из выпадашек, мета-полями (цена, площадь, дата). Каждый кейс кликабелен → drawer редактирования с теми же полями.

### Что меняется в `services` справочнике для master-pwa

`master-pwa/profile.tsx` сейчас читает `/api/settings/services` и `/api/settings/cities` для выпадашек. Нужно убедиться, что они возвращают ID + name (а не только name) — для портфолио нужен `serviceTypeId` и `cityId` как FK. Если эти endpoints возвращают только name — расширяем их (минимальная правка, BC сохраняется).

---


## 11.6 Контент-стратегия и блог мастеров: путь к органике

> **Дополнение к секциям 11 / 11.5 / 16.** Описывает, как маркетплейс становится
> «полезным порталом» для органики Яндекса, а не статичным каталогом мастеров.
> Ядро стратегии — превратить мастера в публичного эксперта, который ведёт блог.
>
> **В терминах Лови Инсайт это «Журнал»** (`/journal/{slug}`) — раздел статей с
> тегами (#дизайн, #обзоры квартир), временем чтения, обложкой. У нас аналог
> называется `/sovety` (см. URL-схему в §5). См. также §11.13 о видео-формате
> для статей в виде «видео-инструкций» (Формат 3).

### Принципы

1. Технически чистый SEO (sitemap/robots/schema/canonical) — необходимое, но недостаточное условие. Без полезного контента портал не выйдет в топ-10.
2. Контент должен быть **уникален, экспертен, локален и свеж**. Это четыре столба ранжирования в Яндексе после Y1 (2023) и AI-моделей качества 2024+.
3. Производитель контента — **сам мастер**. Мы делаем платформу авторов, а не контент-фабрику.
4. Каждая страница должна давать читателю **законченный ответ** + предложение действия (форма заявки, ссылка на мастера). Это снижает bounce и увеличивает dwell time.

### A. Уникализация SEO-страниц услуга × город

**Риск без действий**: 50 услуг × 50 городов = 2500 шаблонных страниц с одним общим `service.body_md`. Яндекс это видит и считает дублями. Алгоритм Y1 не пускает их в топ.

**Решение** — новая таблица `service_city_overrides` (см. ниже), где для каждой пары `(service_type_id, city_id)` хранится:
- уникальный `body_md` 300–500 chars (генерируется через AI с правкой оператором, либо пишется ручкой)
- `seo_title`, `seo_description`, `h1` локализованные («Сантехник в Краснодаре» vs «Сантехник в Москве» — разные акценты на местные особенности)
- `faq` — список вопросов-ответов с упоминанием районов, цен, особенностей региона

Дополнительно на странице услуга×город рендерим **только реальный контент этого города**:
- мастера с `masters.city = cities.name` и `is_published=true`
- кейсы из `master_portfolio` с `city_id`
- отзывы из `master_reviews_public` с `client_city`
- локальные цены: средние из `master.servicePrices` мастеров этого города

Backfill `service_city_overrides`: оператор в CRM запускает «генерацию overrides» — AI создаёт 50–100 черновиков, оператор за 2–3 часа правит критичные. Остальные пары остаются с дефолтным `service.body_md` и `noindex` (пока не написан уникальный текст).

### B. Информационный трафик через блог мастеров (главный долгосрочный движок)

Длиннохвостые информационные запросы дают в 3–5 раз больше трафика, чем коммерческие, и тёплые лиды:
- «как заменить смеситель в хрущёвке»
- «сколько стоит ремонт ванной 4 м² в Краснодаре»
- «как принять работу сантехника» (чек-лист)
- «гост для штукатурки стен» (для специалистов)

Цель: за 12 месяцев — **400–800 уникальных статей** (78 мастеров × 5–10 в год).

**URL-структура (гибрид)**:
| URL | Назначение |
|---|---|
| `/blog` | лента всех статей (SEO catalog, пагинация, фильтр по услуге/городу) |
| `/blog/[slug]` | статья (canonical, sitemap-included) |
| `/blog/category/[serviceSlug]` | статьи по услуге (например `/blog/category/santehnika`) |
| `/master/[masterSlug]/blog` | агрегация статей конкретного мастера (canonical, sitemap-included) |
| `/blog/avtor/[masterSlug]` | 301 → `/master/[masterSlug]/blog` (короткий человеко-читаемый алиас) |

Каждая статья несёт `<link rel="author">` на профиль мастера + JSON-LD `Article` с `author=Person` и `publisher=Organization`.

**Внутренние ссылки** в статье обязательны (валидируется при модерации):
- ≥ 1 ссылка на профиль автора `/master/[slug]`
- ≥ 1 ссылка на услугу `/uslugi/[serviceSlug]` или `/[serviceSlug]/[citySlug]`
- ≥ 0 ссылок на другие статьи (related)

Это распределяет PageRank к коммерческим страницам.

### C. E-E-A-T — экспертность и доверие

Яндекс с 2024 проверяет авторство и квалификацию автора в YMYL-нишах (включая ремонт квартир — там деньги/безопасность).

**Что добавляем**:
- Карточка автора в каждой статье (фото, имя, стаж, специализация, рейтинг, ссылка на портфолио, ссылка на сертификаты).
- Таблица `master_certifications` (см. ниже) — мастер загружает дипломы/сертификаты через PWA, оператор подтверждает. Подтверждённые рендерятся на профиле и под каждой статьёй.
- Editorial guidelines — публичная страница `/redakcionnaya-politika` объясняет, кто пишет, как модерируется, что запрещено. Сигнал доверия для Яндекса и для пользователей.
- Footer на всех страницах — реквизиты (ИП Коваленко И.Г. ИНН 262409599800), ссылки на политики, контакты, ссылка на «о редакции».
- JSON-LD `Person` для каждого мастера-автора (с `jobTitle`, `description`, `image`, `worksFor`, `award`).

### D. Поведенческие факторы (CTR + dwell time)

Самое сильное оружие Яндекса. Награждает страницы, где пользователи задерживаются и не уходят на выдачу.

Что повышает время на странице:
- **TOC** в длинной статье (table of contents с якорями).
- **Калькулятор сметы** прямо на странице услуги (вводит площадь → расчёт → форма заявки). +30–60 сек dwell.
- **Видео-блоки** (YouTube/Rutube embed) — пользователь смотрит → сильный сигнал.
- **Сравнительные таблицы** цен по городам/услугам.
- **Related articles** в конце статьи (минимум 3).
- **Комментарии** (см. ниже) — если пользователь читает обсуждение, это +3–5 минут dwell.
- **«Спросить мастера»** — комментарий-вопрос автоматически тригерит лид при наличии телефона.

Что повышает CTR в выдаче:
- Уникальные `<title>` ≤ 60 chars с цифрами / годом / эмодзи (умеренно).
- `<meta description>` 150–160 chars с явным предложением действия.
- Богатые сниппеты через JSON-LD: AggregateRating звёзды, FAQ quick answers, breadcrumbs.

### E. Local SEO — Яндекс.Бизнес, Карты, 2GIS

Не упомянуто в текущем плане, а это до 30% органики для местных услуг.

**Действия**:
- Создание профиля компании в Яндекс.Бизнес (`chestnye-mastera.ru`, реквизиты ИП Коваленко).
- Регистрация в 2GIS (если регион присутствует).
- В перспективе (фаза 2): каждый Pro-мастер получает связку с собственным профилем в Яндекс.Бизнес.
- Подключение Яндекс.Карты-виджета на страницах `/[serviceSlug]/[citySlug]` и `/master/[slug]` (с привязкой к городу обслуживания).
- JSON-LD `LocalBusiness` для основного бренда «Честные мастера» в `<head>` всех страниц.

### F. Свежесть и активность

Яндекс смотрит на динамику обновлений. Сигналы свежести:
- Лента «**Недавно выполненные заказы в Краснодаре**» на странице услуга×город — рендерится из реальных `orders.completed` за последние 30 дней (анонимизированных: «Анна К. — ремонт ванной — Краснодар, 12 дней назад»). Auto-обновляется без ручной работы.
- Daily target: ≥ 1 новая статья от любого мастера в сутки. Если не публикуется — оператор пингует мастеров через push.
- Виджет «**Последние ответы мастеров**» в footer — показывает свежие комменты.
- `<time itemprop="dateModified">` обновляется на любой правке статьи / профиля мастера / портфолио.

### G. Page Experience

Уже зафиксировано в #11. Дополнительно:
- AMP не делаем (Яндекс отказался от AMP-приоритета в 2023).
- Турбо-страницы Яндекса — не делаем (теряем контроль над UX, лиды утекают).
- Mobile FCP < 1.5s на 3G (LCP — это уже LCP).
- Touch-targets ≥ 48px (доступность + ранжирование).

---

### Master Blog Platform — детализация фичи

#### Onboarding автора (постепенный)

| Условие | Что разблокируется |
|---|---|
| Профиль опубликован (`is_published=true`) + ≥ 1 кейс портфолио | секция «Блог» в PWA становится доступна |
| Первые 3 статьи — на ручной модерации оператора | публикуются после approve |
| После 3 approved → `master.is_trusted_author = true` | автопубликация после автомодерации, выборочный sample-check оператором (10% статей) |
| Жалоба на статью / профанити / spam-обнаружение | `is_trusted_author=false`, возврат к ручной модерации; запись в `master_publication_log` |

#### Форматы контента (фазами)

| Фаза | Формат | Что добавляется |
|---|---|---|
| V1 (первый релиз) | **Articles** (long-form how-to, 1500+ chars) | базовая платформа |
| V1 (вместе) | **Комментарии** под статьями | +UGC, +behavioral |
| V2 | **Q&A** — клиент задаёт вопрос, мастера отвечают, ответы рендерятся как самостоятельные страницы | новая страница `/voprosy/[slug]` |
| V2.5 | **Tips** — короткие посты 200–500 слов, social-style лента | страница `/sovety` |
| V3 | **Live Cases** — auto-collect из `orders.completed` с согласия мастера | лента `/raboty` |

В V1 — только `kind='article'` и комментарии.

#### Редактор: TipTap

- Lazy-loaded React.lazy chunk (~150 КБ, грузится только на странице `/profile/blog/edit`).
- Базовые extensions: StarterKit (bold/italic/headings/lists/blockquote/code), Image, Link, CodeBlock, TextAlign, Placeholder, CharacterCount.
- Custom extensions:
  - `BeforeAfterSlider` — drag-разделитель для двух фото
  - `ServicePriceCard` — встроенная карточка цены из `master.servicePrices`
  - `MasterCallout` — выделенный совет в рамке
  - `RelatedArticleCard` — preview другой статьи
- Output:
  - Native: TipTap JSON в `content_posts.body_json` (для редактирования)
  - Render: sanitized HTML через DOMPurify в `content_posts.body_html` (для SSR)
- Mobile UX: floating toolbar в нижней части экрана, sticky при скролле; голосовой ввод работает; paste из мессенджеров корректно очищается.
- Auto-save в localStorage каждые 5 секунд (до отправки на сервер).

#### Многослойная модерация

| Слой | Что проверяет | Где работает |
|---|---|---|
| 1 | Автомодерация regex (телефоны/email/URL/@handles/мат через `obscenity`) — те же правила что для `publicBio` (см. 11.5) | бэкенд при save/publish |
| 2 | Quality gates: длина body ≥ 1500 chars, ≥ 3 параграфа, ≥ 1 изображение, ≥ 1 internal link на профиль мастера или услугу, заголовок 20–200 chars | бэкенд |
| 3 | Manual approve первых 3 статей мастера в CRM (обязательно для всех новых авторов) | оператор в `/crm/blog` |
| 4 | После 3 approved → `is_trusted_author=true`, автопубликация + случайная 10% выборка для оператора | бэкенд + cron (раз в час) |
| 5 | User reports («пожаловаться на статью») → re-moderation | бэкенд + queue в CRM |
| 6 | IndexNow API call после publish — мгновенное уведомление Яндекса/Bing о новой странице | бэкенд (fire-and-forget) |

При нарушении любого слоя — статья переходит в `status='rejected'` с `rejection_message` для мастера; в PWA он видит конкретные причины.

#### Комментарии под статьями

Реализуется в V1 (вместе со статьями).

- **Гостевой формат** (без регистрации): имя + телефон + капча + согласие на ПД. Телефон хешируется (`SHA-256`), не отображается публично; нужен для anti-spam и для возможности связи мастера с автором вопроса (через оператора).
- **Авто-модерация** комментариев: те же regex-правила что для тела статьи; pre-moderation для всех гостевых комментов первые 30 дней работы платформы, потом — moderation после публикации (post-moderation) для не-репортированных авторов.
- **Threading**: 1 уровень глубины (комментарий → ответ; ответ на ответ становится комментарием первого уровня с упоминанием).
- **Verified-бейдж** ответа автора статьи (мастера).
- **Notifications**: push мастеру в PWA при новом комменте на его статью.
- **Anti-spam**: rate-limit 3 коммента/час/IP, hidden honeypot field, captcha (Yandex SmartCaptcha — та же что на форме заявки), глобальный score за фразы-маркеры спама.

#### Стимулы для авторов (все четыре)

1. **Прямая выгода — dashboard в PWA**:
   - Виджет «Твои статьи»: всего просмотров, комментов, лидов
   - На каждой статье: views graph 30d, click-throughs на профиль, comments
   - Сравнение с топ-авторами в нише

2. **Геймификация**:
   - Бейджи: «Первая статья», «10 статей», «1 000 просмотров», «100 лидов»
   - Leaderboard «Топ-эксперт месяца» в каждом городе и каждой услуге
   - Профиль автора в PWA: уровень, прогресс до следующего бейджа

3. **Финансовая привязка**:
   - Tracking: `lead.attached_post_id` фиксируется когда форма заявки на странице `/blog/[slug]`
   - Если мастер автор статьи и лид через эту статью пришёл → комиссия по этому заказу снижается (например, с 10% до 5%)
   - В PWA при назначении заказа мастер видит «Этот заказ пришёл с твоей статьи "Х", комиссия снижена»

4. **AI-ассистент** (переиспользует существующую AI-инфру):
   - **Никакой новой инфры**. Используется тот же OpenAI-compatible client что у `dispatcherAI` / `managerBot` / `routes/leads.ts` (env: `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`).
   - Helper: новый модуль `artifacts/api-server/src/lib/aiContent.ts` — отдельный файл для изоляции от dispatcher-логики, но клиент тот же.
   - **Сценарии и модели** (выбираем дешёвую модель по умолчанию, чтобы не выжигать бюджет):
     | Сценарий | Модель (по умолчанию) | Где |
     |---|---|---|
     | Generate draft from theses (мастер вводит 5–10 тезисов → черновик 1500–2500 chars) | `gpt-4o-mini` | `POST /api/master-pwa/blog/draft-from-theses` |
     | Polish draft (улучшение стиля по запросу мастера) | `gpt-4o-mini` | `POST /api/master-pwa/blog/polish` |
     | Generate SEO-meta (title / excerpt / seoTitle / seoDescription) | `gpt-4o-mini` | вызывается на publish если поля пусты |
     | AI-quality check (опц. слой модерации: проверка полезности, плагиата, water content) | `gpt-4o-mini` | бэкенд при `status=pending` |
     | Generate `service_city_overrides.body_md` (backfill, ручной запуск из CRM) | `gpt-5-mini` или `claude-opus-4-7` | CRM-action, выбор в env `BLOG_AI_BACKFILL_MODEL` |
   - Префакт-промпт: AI получает контекст мастера (city, specializations, портфолио, годы стажа) + тезисы и пишет в стиле эксперта от первого лица. Добавляет TODO-маркеры (`[TODO: укажите конкретную модель смесителя]`) там, где нужны конкретные цифры/факты от мастера, чтобы черновик не был анонимной «AI-водой».
   - **Rate-limit**: 5 черновиков/день/мастер + 10 polish-операций/день/мастер. Защищает от перерасхода.
   - **Env-флаг** `BLOG_AI_ASSISTANT_ENABLED` (default `true`) для аварийного отключения без деплоя.
   - **Логирование**: каждый AI-вызов фиксируется в `botMemoryTable` (или новой `ai_content_log`) с masterId, scenario, model, tokens_in, tokens_out, cost_estimate — для аналитики затрат.

#### Метрики автора в PWA dashboard

- Total views all time / 30d / 7d
- Total comments / leads attributed
- Топ-статья (по views и по leads)
- На каждой статье: views graph, click-throughs to profile, comments
- Прогресс к next badge
- Текущий уровень `is_trusted_author` (yes/no, сколько approved до достижения)

---

### БД: новые таблицы (детализация секции 16)

Миграция **`0008_content_platform.sql`** (после `0007_master_publication_log.sql`).

```sql
-- Основная таблица постов
CREATE TABLE content_posts (
  id                  serial PRIMARY KEY,
  author_id           integer NOT NULL REFERENCES masters(id) ON DELETE RESTRICT,
  kind                varchar(20) NOT NULL DEFAULT 'article',  -- 'article'|'qa'|'tip'|'case'
  slug                varchar(160) UNIQUE NOT NULL,
  title               varchar(200) NOT NULL,
  cover_url           text,
  excerpt             varchar(300),                            -- preview для каталогов
  body_json           jsonb,                                   -- TipTap native
  body_html           text,                                    -- sanitized HTML для SSR
  reading_time_min    integer,
  service_type_ids    integer[] NOT NULL DEFAULT '{}',
  city_ids            integer[] NOT NULL DEFAULT '{}',
  status              varchar(20) NOT NULL DEFAULT 'draft',
                      -- 'draft'|'pending'|'published'|'rejected'|'archived'
  pending_reason      varchar(40),                             -- code если rejected
  rejection_message   text,                                    -- заметка оператора
  is_trusted_publish  boolean NOT NULL DEFAULT false,          -- snapshot trusted-status автора
  ai_generated        boolean NOT NULL DEFAULT false,          -- черновик создан AI-ассистентом
  view_count          integer NOT NULL DEFAULT 0,
  comment_count       integer NOT NULL DEFAULT 0,
  lead_count          integer NOT NULL DEFAULT 0,
  published_at        timestamp,
  created_at          timestamp NOT NULL DEFAULT now(),
  updated_at          timestamp NOT NULL DEFAULT now(),
  deleted_at          timestamp
);
CREATE INDEX content_posts_author_id_idx ON content_posts(author_id);
CREATE INDEX content_posts_status_idx ON content_posts(status);
CREATE INDEX content_posts_published_at_idx ON content_posts(published_at DESC);
CREATE INDEX content_posts_service_types_idx ON content_posts USING GIN(service_type_ids);
CREATE INDEX content_posts_cities_idx ON content_posts USING GIN(city_ids);

-- Версионирование (для undo и аудита, храним последние 10)
CREATE TABLE content_post_versions (
  id           serial PRIMARY KEY,
  post_id      integer NOT NULL REFERENCES content_posts(id) ON DELETE CASCADE,
  body_json    jsonb NOT NULL,
  saved_at     timestamp NOT NULL DEFAULT now()
);
CREATE INDEX content_post_versions_post_idx ON content_post_versions(post_id, saved_at DESC);

-- Комментарии (V1)
CREATE TABLE content_post_comments (
  id              serial PRIMARY KEY,
  post_id         integer NOT NULL REFERENCES content_posts(id) ON DELETE CASCADE,
  parent_id       integer REFERENCES content_post_comments(id) ON DELETE CASCADE,
  author_kind     varchar(10) NOT NULL,                  -- 'guest'|'master'
  author_master_id integer REFERENCES masters(id),
  guest_name      varchar(50),
  guest_phone_hash varchar(64),                          -- sha256, never displayed
  body            text NOT NULL,
  status          varchar(20) NOT NULL DEFAULT 'pending',-- 'pending'|'approved'|'rejected'|'spam'
  ip              varchar(45),
  user_agent      varchar(500),
  created_at      timestamp NOT NULL DEFAULT now()
);
CREATE INDEX content_post_comments_post_idx ON content_post_comments(post_id, status, created_at DESC);

-- Просмотры по дням (для аналитики автора)
CREATE TABLE content_post_views_daily (
  id        serial PRIMARY KEY,
  post_id   integer NOT NULL REFERENCES content_posts(id) ON DELETE CASCADE,
  day       date NOT NULL,
  count     integer NOT NULL DEFAULT 0,
  UNIQUE (post_id, day)
);
CREATE INDEX content_post_views_daily_day_idx ON content_post_views_daily(day);

-- Уникальный текст для пар услуга × город (для уникализации SEO-страниц)
CREATE TABLE service_city_overrides (
  id                serial PRIMARY KEY,
  service_type_id   integer NOT NULL REFERENCES service_types(id),
  city_id           integer NOT NULL REFERENCES cities(id),
  body_md           text,
  seo_title         varchar(70),
  seo_description   varchar(180),
  h1                varchar(150),
  faq               jsonb,                          -- [{ q, a }, ...]
  generated_by      varchar(20),                    -- 'human'|'ai'|'mixed'
  reviewed_by       integer,                        -- users.id (operator)
  reviewed_at       timestamp,
  created_at        timestamp NOT NULL DEFAULT now(),
  updated_at        timestamp NOT NULL DEFAULT now(),
  UNIQUE (service_type_id, city_id)
);
CREATE INDEX svc_city_overrides_pair_idx ON service_city_overrides(service_type_id, city_id);

-- Сертификаты мастеров (для E-E-A-T)
CREATE TABLE master_certifications (
  id            serial PRIMARY KEY,
  master_id     integer NOT NULL REFERENCES masters(id) ON DELETE CASCADE,
  title         varchar(150) NOT NULL,
  issuer        varchar(150),
  issued_at     date,
  document_url  text,                              -- скан PDF/JPG
  is_verified   boolean NOT NULL DEFAULT false,
  verified_by   integer,                            -- users.id (operator)
  verified_at   timestamp,
  is_published  boolean NOT NULL DEFAULT true,
  created_at    timestamp NOT NULL DEFAULT now()
);
CREATE INDEX master_certifications_master_idx ON master_certifications(master_id);

-- AI-журнал для аналитики затрат и аудита
CREATE TABLE ai_content_log (
  id              serial PRIMARY KEY,
  master_id       integer REFERENCES masters(id) ON DELETE SET NULL,
  scenario        varchar(40) NOT NULL,             -- 'draft'|'polish'|'seo_meta'|'quality_check'|'svc_city_backfill'
  model           varchar(50) NOT NULL,
  post_id         integer REFERENCES content_posts(id) ON DELETE SET NULL,
  tokens_in       integer,
  tokens_out      integer,
  cost_estimate   numeric(10,4),
  status          varchar(20) NOT NULL,             -- 'success'|'error'|'rate_limited'
  error_message   text,
  created_at      timestamp NOT NULL DEFAULT now()
);
CREATE INDEX ai_content_log_master_idx ON ai_content_log(master_id, created_at DESC);
CREATE INDEX ai_content_log_scenario_idx ON ai_content_log(scenario, created_at DESC);

-- Расширение masters (для trusted author + bio дополнения)
ALTER TABLE masters ADD COLUMN is_trusted_author boolean NOT NULL DEFAULT false;
ALTER TABLE masters ADD COLUMN articles_published_count integer NOT NULL DEFAULT 0;
ALTER TABLE masters ADD COLUMN articles_total_views integer NOT NULL DEFAULT 0;

-- Расширение leads (привязка к статье как источнику)
ALTER TABLE leads ADD COLUMN attached_post_id integer REFERENCES content_posts(id) ON DELETE SET NULL;
CREATE INDEX leads_attached_post_idx ON leads(attached_post_id) WHERE attached_post_id IS NOT NULL;
```

---

### CRM: модерация контента и управление SEO

Новый раздел **`/crm/content`**:

- **Очередь модерации**: `status='pending'` посты, отсортированы по `created_at DESC`. Bulk approve/reject. Diff с предыдущей версией если правка.
- **Жалобы**: посты с открытыми report'ами, отдельная вкладка.
- **Trusted authors**: список мастеров с `is_trusted_author=true`, статистика (views/leads/comments), кнопка «снять trust».
- **Service×City overrides**: CRUD `service_city_overrides`, фильтр «без override», кнопка «сгенерировать через AI» (использует `BLOG_AI_BACKFILL_MODEL`).
- **Сертификаты на верификацию**: посты `master_certifications` с `is_verified=false`, превью документа.
- **Комментарии**: модерация `content_post_comments` со status='pending'.
- **AI cost dashboard**: суммы по `ai_content_log` за день/неделю/месяц, разбивка по моделям и сценариям.

Аналитика для оператора (отдельный дашборд):
- Топ-статьи по просмотрам / лидам
- Топ-авторы
- Услуги с пробелом контента (мало статей)
- Города с пробелом контента
- Динамика индексации в Яндекс.Webmaster (через API)

### Phasing

| Фаза | Что делается |
|---|---|
| **V1.x** (после релиза публикации профилей и портфолио) | Миграция 0008. Editor TipTap. Onboarding автора. Articles + комментарии. Автомодерация. CRM-очередь. IndexNow. AI-ассистент (draft/polish/SEO-meta) через существующую инфру. |
| **V1.5** | service_city_overrides backfill (AI + ручная правка топ-100 пар). master_certifications. Гейминг (бейджи, leaderboard). Финансовый трекер (lead → article → commission discount). AI-quality check. |
| **V2** | Q&A формат. Yandex.Бизнес интеграция. Калькуляторы смет в страницах услуг. |
| **V2.5+** | Tips, Live Cases, видео-блоки, расширенные TipTap extensions (BeforeAfterSlider, ServicePriceCard, MasterCallout, RelatedArticleCard). |

---


## 11.7 Каталог работ как самостоятельный продукт (Houzz-модель)

> **Дополнение к секциям 1, 5, 7, 11.5.** Описывает кейсы как **первичную единицу контента** маркетплейса, а не как sub-страницу профиля мастера. Это смещение приоритета: профиль мастера становится агрегатором его работ, а каждая работа — самостоятельная SEO-страница.

### 11.7.1. Принципы

1. **Кейс = продукт, не приложение к профилю.** Главные SEO-входы — `/raboty/[slug]`. Профиль мастера `/master/[slug]` — агрегатор и точка контакта, не главное место поиска. Аналогия: Houzz Project, не Houzz Pro.
2. **Качество > количество.** 500 хорошо оформленных кейсов с фото до/после, ценами и описанием ≥150 chars дают больше SEO-эффекта, чем 5000 тонких. Ниже — формальный gate.
3. **Каждый кейс — уникальный контент с верифицируемыми фактами.** Цена, срок, площадь — числами. Фото уникальные (reverse image search). Опционально — `order_id` ссылка на реальный заказ из нашей БД (это E-E-A-T-сигнал высшего уровня, такого нет у Houzz, Профи и Авито).
4. **Юридическая чистота.** Без `client_consent_given=true` кейс не публикуется, пока мастер не подтвердит согласие клиента (ст. 152.1 ГК РФ — изображение помещения).
5. **Авто-маршрутизация лидов.** Кнопка «Хочу такую же» на каждом кейсе → форма с auto-fill контекстом → лид направляется автору-мастеру первым (приоритет 30 минут), при отсутствии отклика → broadcast топ-5 похожих мастеров.

### 11.7.2. URL-схема и иерархия

| URL | Назначение | Что показывает |
|---|---|---|
| `/raboty` | главный фид | грид всех опубликованных кейсов, сортировка new/popular/featured, фильтры |
| `/raboty/[serviceSlug]` | фид по услуге | например `/raboty/remont-kuhni` — все ремонты кухни во всех городах |
| `/raboty/[serviceSlug]/[citySlug]` | фид по услуге × городу | `/raboty/remont-kuhni/krasnodar` — long-tail SEO-страница, ранжируется по «ремонт кухни Краснодар фото» |
| `/raboty/[slug]` | страница конкретного кейса | главный SEO-актив. Slug-формат: `[service-slug]-[area]m-[city-slug]-[master-alias]-[short-hash]` (например `remont-kuhni-12m-krasnodar-ivan-petrov-x7f3`) |
| `/raboty?style=minimalism` | фильтр по стилю | `style_tags` GIN-индекс. Не canonical — индексация через тэги/breadcrumbs |
| `/raboty?room=kitchen&min_price=200000&max_price=500000` | расширенные фильтры | через query params, `noindex` |
| `/master/[slug]` (изменение) | агрегатор работ мастера | хедер мастера + **превью топ-6 кейсов с CTA «все работы → /raboty?master=ivan-petrov»** + отзывы + услуги |

### 11.7.3. Анатомия страницы кейса `/raboty/[slug]`

Структура контента (видна и поисковику, и пользователю):

```
H1: Ремонт кухни 12 м² в Краснодаре — стоимость 280 000 ₽, срок 18 дней
Breadcrumbs: Главная → Работы → Ремонт кухни → Краснодар → этот кейс

[Hero galleria: cover_photo + before/after layout]

H2: Стоимость и сроки
   Цена: 280 000 ₽
   Срок: 18 дней
   Площадь: 12 м²
   Завершено: июнь 2026

H2: Фото до и после
   [галерея before_photos и after_photos в выбранном layout]
   [progress_photos если есть — секция «В процессе»]

H2: Что было сделано
   [description ≥150 chars, форматирование как абзацы и списки]

H2: Использованные материалы и оборудование
   [теги materials_used]

H2: Стиль интерьера
   [style_tags как ссылки на /raboty?style=...]

H2: Мастер
   [компактная карточка: avatar, alias, рейтинг, город, ссылка на /master/[slug]]
   [мини-блок: «На платформе с YYYY», «Завершено N заказов»]

H2: Похожие работы
   [3-6 карточек из той же service+city с похожими стилями или ценовым диапазоном]
   [алгоритм: SQL по service_id + city_id + style_tags overlap, sort by published_at DESC]

H2: Хотите такую же?
   [форма заявки с pre-filled полями:
      service = case.service_id (read-only)
      city = case.city_id (read-only)
      area_hint = case.area_sqm (читаемая подсказка)
      budget_hint = case.price_total
      near_to_master_id = case.master_id (для приоритетного routing)
      case_id = case.id (трекинг источника)]

H2: Отзыв клиента
   [только если client_review_text есть и client_rating заполнен]
   [Schema.org Review]

[Footer: ссылки на /raboty, /master/[slug], /[service]/[city]]
```

### 11.7.4. SEO-meta и schema.org

**`<title>`** (генерация по шаблону, override через `seo_title`):
- `{title} в {city} — {price_total} ₽, {duration_days} дней — {master_alias}`
- Например: «Ремонт кухни 12 м² в Краснодаре — 280 000 ₽, 18 дней — Иван Петров»
- Длина 70 chars, обрезка с многоточием при переполнении.

**`<meta description>`** (override через `seo_description`):
- `{first 150 chars of description}... Цена {price_total} ₽, срок {duration_days} дней. Мастер {master_alias}, рейтинг {rating}.`
- Длина 180 chars.

**`<link rel="canonical">`** = `https://chestnye-mastera.ru/raboty/[slug]`. Никогда не указываем фильтрованные URL как canonical.

**Open Graph**:
- `og:image` = `cover_photo_url` (или `after_photos[0]`)
- `og:title`, `og:description` — те же, что в `<title>` / `<meta>`
- `og:type` = `article`

**JSON-LD** (несколько графов на странице):

```jsonld
{
  "@context": "https://schema.org",
  "@type": "CreativeWork",
  "@id": "https://chestnye-mastera.ru/raboty/[slug]#case",
  "name": "Ремонт кухни 12 м² в Краснодаре",
  "description": "[первые 200 chars description]",
  "image": ["[cover_photo]", "[after_photos[0..3]]", "[before_photos[0..3]]"],
  "creator": {
    "@type": "Person",
    "@id": "https://chestnye-mastera.ru/master/[masterSlug]#person",
    "name": "Иван Петров"
  },
  "dateCreated": "[completed_at]",
  "datePublished": "[published_at]",
  "locationCreated": {
    "@type": "Place",
    "address": { "@type": "PostalAddress", "addressLocality": "Краснодар", "addressCountry": "RU" }
  },
  "keywords": ["ремонт кухни", "минимализм", "Краснодар", "12 м²", "плитка"]
}

{
  "@context": "https://schema.org",
  "@type": "Service",
  "@id": "https://chestnye-mastera.ru/raboty/[slug]#service",
  "serviceType": "Ремонт кухни",
  "areaServed": { "@type": "City", "name": "Краснодар" },
  "provider": { "@id": "https://chestnye-mastera.ru/master/[masterSlug]#person" },
  "offers": {
    "@type": "Offer",
    "price": 280000,
    "priceCurrency": "RUB",
    "businessFunction": "http://purl.org/goodrelations/v1#ProvideService"
  }
}

{
  "@context": "https://schema.org",
  "@type": "ImageObject",
  "contentUrl": "[cover_photo_url]",
  "creator": { "@id": "https://chestnye-mastera.ru/master/[masterSlug]#person" },
  "license": "https://chestnye-mastera.ru/policy/terms"
}
```

Если есть `client_review_text`:
```jsonld
{
  "@type": "Review",
  "reviewRating": { "@type": "Rating", "ratingValue": "[client_rating]", "bestRating": "5" },
  "author": { "@type": "Person", "name": "[client_name_first_last_initial]" },
  "reviewBody": "[client_review_text]",
  "itemReviewed": { "@id": "https://chestnye-mastera.ru/raboty/[slug]#service" }
}
```

### 11.7.5. Gate перед публикацией (validation)

Endpoint `POST /api/master-pwa/portfolio/[id]/publish` (или автоматически при сохранении если все поля заполнены):

```ts
function validateForPublish(c: PortfolioCase): ValidationResult {
  const errors: string[] = [];
  if (!c.serviceId) errors.push("Выберите услугу");
  if (!c.cityId) errors.push("Выберите город");
  if (!c.title || c.title.length < 10) errors.push("Заголовок: минимум 10 символов");
  if (!c.description || c.description.length < 150) errors.push("Описание: минимум 150 символов");
  if (!(c.priceTotal > 0)) errors.push("Укажите итоговую стоимость");
  if (!(c.durationDays > 0)) errors.push("Укажите срок работ в днях");
  if (!c.completedAt) errors.push("Укажите дату завершения");
  if ((c.afterPhotos ?? []).length < 1) errors.push("Загрузите минимум одно фото «после»");
  if (!c.clientConsentGiven) errors.push("Подтвердите получение согласия клиента на публикацию");
  return { ok: errors.length === 0, errors };
}
```

Если есть ошибки — кейс остаётся `draft`, мастер видит чек-лист «Что доделать чтобы попасть в каталог» и progress-bar (например 6/8 полей готовы).

### 11.7.6. AI-helper для описаний (использует существующий AI-диспетчер)

Мастера часто пишут плохо или коротко. Чтобы это не убивало SEO — кнопка «Помочь AI» в форме редактирования:

1. Мастер заполняет: услуга, город, площадь, цена, срок, опционально материалы и стиль.
2. Мастер пишет короткие тезисы: «убрал плитку, поменял трубы, сделал тёплый пол, поставил гарнитур ИКЕА».
3. Нажимает «Помочь AI» → существующий AI-диспетчер (тот же, что в `dispatcherAI.ts`) с новым промптом:
   ```
   Ты помогаешь мастеру по ремонту описать его выполненную работу для публикации
   на маркетплейсе. Возьми тезисы и преврати в развёрнутый текст 200-400 слов
   на русском языке. Упомяни этапы работ, использованные материалы, нюансы.
   Не используй маркетинговые клише («команда профессионалов»). Пиши от
   первого лица единственного числа («я снял», «мы с напарником положили»).
   Тезисы: [...]
   ```
4. Текст возвращается в editable textarea — мастер может редактировать перед публикацией.
5. Логирование вызовов в `ai_content_log` (таблица из 11.6) с указанием стоимости.

Стоимость: ~$0.001-0.005 за описание (zhe gpt-4o-mini или claude-haiku). При 5000 кейсов — единоразовые расходы $25 max.

### 11.7.7. Reverse image search

При upload каждого фото:

1. Сохраняем перцептивный хеш (`pHash`) в новое поле `master_portfolio_photo_hashes` (отдельная таблица: `id, portfolio_id, photo_url, phash, created_at`).
2. Перед публикацией кейса проверяем:
   - **Internal collision**: `pHash` совпадает с уже опубликованным фото другого мастера → `reverse_image_check='stolen'`, автоматический reject.
   - **External match**: посылаем превью в Yandex.Images reverse search API. Если найдено в интернете до даты загрузки на платформу → `reverse_image_check='suspicious'`, ручная модерация.
   - **Clean**: ничего не найдено → `reverse_image_check='clean'`, публикация без задержки.
3. При rejected → лог в `master_publication_log` с `action='portfolio_reject_stolen_photo'`, мастер видит причину в PWA.

Yandex.Images API запрещает массовое использование без договора, поэтому в V1 можно ограничиться **только internal collision check** (наш собственный pHash storage). External check — фаза 2, когда есть бюджет на коммерческий доступ или альтернатива (Bing Visual Search, TinEye).

### 11.7.8. Воронка лида с кейса

```
Поиск Яндекса («ремонт кухни 12 метров фото»)
   ↓
Лендинг /raboty/[slug] (кейс)
   ↓
Просмотр (галерея, цена, срок, мастер)
   ↓
Клик «Хочу такую же»
   ↓
Форма с pre-filled полями (service, city, area_hint, budget_hint, case_id, near_to_master_id)
   ↓
POST /api/marketplace/leads со source='marketplace_case' и context.case_id
   ↓
Lead создан в leads table, привязан к мастеру через near_to_master_id
   ↓
30 минут exclusive period для автора кейса (push в его PWA)
   ↓
Если автор принял — direct assign, диспетчер не подключается
Если автор отказался / нет ответа — стандартный broadcast (top-5 похожих мастеров: тот же service, тот же city, рейтинг ≥X)
   ↓
Стандартный flow заказа дальше (как в V1)
   ↓
master_portfolio.lead_count += 1 (для лидерборда и приоритета в priorityAssign)
```

Изменения в `leads`:
- `source` дополняем значением `marketplace_case`
- `context_jsonb` (если ещё не было) с полями `{case_id, near_to_master_id, area_hint, budget_hint}`

Изменения в диспетчере:
- В `priorityAssign.ts` добавляем правило: если `lead.context.near_to_master_id IS NOT NULL` → попытка direct assign на этого мастера (timeout 30 min, push). Только если отказ или таймаут → стандартный broadcast.
- Эта логика уже частично есть для других сценариев (manual assign), переиспользуем.

### 11.7.9. Аналитика и стимулы для мастеров

В PWA-дашборде мастера новый блок «Мои работы» (фаза A секции 18):
- Список своих кейсов с метриками: views (за 7/30 дней), leads (сколько заявок принёс этот кейс), статус (draft/published/featured)
- Прогресс-бар «5 / 30 опубликованных кейсов»
- Подсказки: «Вы публикуетесь редко — кейс дал 12 заявок за месяц», «Заполните `area_sqm` чтобы кейс попал в фильтрацию»

Стимулы (расширение секции 11.6 для контента):
- 1-й опубликованный кейс — ачивка «Старт автора»
- 5 кейсов — приоритет в диспетчере (`priorityAssign` weight bonus 1.0×, по 0.05× за каждый дополнительный кейс до cap 1.5×)
- Кейс в `is_featured=true` (выбрал оператор) — отдельная ачивка + ↑5 позиций в каталоге `/mastera`
- Лидерборд «Топ работ месяца» (на главной маркетплейса блок) — публичная мотивация
- Уведомления при достижении трафика: «Ваш кейс посмотрели 100 раз», «Кейс принёс первый лид»

### 11.7.10. Модерация при объёме

При 5000+ кейсов вручную модерировать невозможно. Многослойный pipeline:

1. **Auto-pass на upload** (мгновенно):
   - Текст: фильтры из 11.5 (телефоны, мат, спам). Если flag → `pending_review`.
   - Фото: pHash check (internal collision). Если совпадение → `pending_review` или auto-reject.
   - Required fields filled → `published`.

2. **AI second-pass** (асинхронно, через 5-30 секунд):
   - Текст: GPT-mini на «соответствует ли описание ремонтной тематике». Откидываем «продам квартиру», «ищу работу», прочий мусор.
   - Фото: NSFW detection (через тот же Fal/CV API что для AI-дизайна). Auto-reject если +0.5 уверенности.

3. **Manual review queue** для `pending_review` (CRM-вкладка):
   - SLA 48 часов
   - Оператор видит превью + reason flags + действия (approve/reject/edit-then-approve)
   - Bulk approve для massовых случаев

4. **Reactive moderation** (после публикации):
   - Жалоба «не моя работа» / «нарушение прав» — кнопка на странице кейса (рендерится только для авторизованных)
   - Триггер `unpublished` + escalation в CRM (`master_publication_log` action `portfolio_unpublish_complaint`)

Мастер всегда может удалить свой кейс сам через CRUD (soft delete `deleted_at`). Оператор может скрыть через CRM (override-unpublish аналогично 11.5).

### 11.7.11. Что меняется в существующих секциях плана

- **Секция 5 (Routes):** `/raboty/*` становятся V1, не V1.5. URLs `/kejsy/*` — устаревшие, не используем (внутренний термин был «кейсы», публичный — «работы», ближе к Houzz semantics).
- **Секция 7 (БД):** таблица `master_portfolio` уже расширена выше. Добавляется `master_portfolio_photo_hashes` для reverse image search. Опционально `master_portfolio_views` для аналитики.
- **Секция 11.5:** правила автомодерации текста применяются к `title` / `description` / `materials_used` кейса.
- **Секция 11.6:** AI-helper для кейсов использует ту же инфраструктуру (`ai_content_log`, лимиты, мониторинг стоимости), что и для блога.
- **Секция 16 (Phasing):** добавляется отдельная Фаза 4.5 «Кейсы как контент-актив» (см. ниже).
- **Секция 18 (Эволюция UX):** Фаза A (inline-edit на публичной странице) включает редактор кейсов прямо на странице мастера или на странице кейса (если автор просматривает свой). Фаза B приводит UI кейсов в кабинет на `chestnye-mastera.ru/cabinet/raboty`.

### 11.7.12. Метрики успеха

V1 (через 3 месяца после релиза):
- ≥500 опубликованных кейсов с заполненными обязательными полями
- ≥50 кейсов в индексе Яндекса (sitemap-raboty.xml пингуется через IndexNow)
- ≥10 заявок в неделю с источником `marketplace_case`

V1.5 (через 6 месяцев):
- ≥2000 опубликованных кейсов
- ≥300 кейсов индексированы
- ≥50 заявок в неделю с `marketplace_case`
- ≥5 кейсов в ТОП-20 Яндекса по long-tail запросам типа «ремонт кухни X метров фото»

V2 (через 12 месяцев):
- ≥5000 опубликованных кейсов
- ≥1500 индексированы
- 30%+ всех лидов с маркетплейса — через кейсы
- Узнаваемость в нише «фото ремонтов» — органические упоминания, цитаты в Pinterest, переходы из соцсетей

---


## 11.8 Автогенерация SEO-meta на масштаб 100k+ страниц

> **Дополнение к секциям 11, 11.7 и 12.** На целевом масштабе (100к мастеров, миллионы кейсов) ручное редактирование `<title>` / `<meta description>` физически невозможно. Эта секция фиксирует **полностью автоматическую** стратегию SEO-meta без AI, с гарантией уникальности через высокую кардинальность переменных.

### 11.8.1. Главный принцип

`<title>` и `<meta description>` — это **display-сигналы** (CTR в SERP), не главные ranking-факторы. Поисковики (особенно Яндекс с 2024) ранжируют по:

1. **Schema.org structured data** (60-70% веса) — у нас уже автоматически на всех страницах
2. **Уникальность body контента** — у нас публикация исходно от пользователя (master.publicBio, portfolio.description, отзывы клиентов)
3. **Внутренние ссылки и behaviour signals** — у нас «похожие работы», авто-фид, кликабельные карточки
4. **Page Experience** (Core Web Vitals, mobile-first) — у нас Next.js + ISR
5. **Title/Description** — даёт 5-10% веса и влияет на CTR (косвенно на ранжирование)

Поэтому стратегия: автогенерируем title/description из шаблонов, оптимизируем body и schema.org.

### 11.8.2. Стратегия высокой кардинальности

Каждая страница имеет 4-7 структурированных переменных. Перемножение даёт миллиарды уникальных комбинаций.

**Пример для master profile**:
- `name` (50 000+)
- `city` (200+)
- `service` (50+)
- `rating` (10 значений)
- `years_experience` (50)
- `completed_orders` (1000+)
- `reviews_count` (100+)

**5×10⁵ × 200 × 50 × 10 × 50 × 1000 ≈ 5×10¹³ комбинаций.**

Даже при 100 000 мастеров шанс совпадения title — практически 0.

**Аналогично для кейсов** — `title × city × price × area × duration × master × room_type × style` дают экспоненциально больше уникальных вариантов.

### 11.8.3. Каскад шаблонов с приоритетами

Для каждой страницы — несколько шаблонов, выбирается **первый, у которого есть все нужные данные**.

#### Master profile `/master/[slug]`

```
Title (выбираем первый подходящий):
1. {Name} — {service} в {city}, ★{rating} ({reviews} отзывов)        # если rating ≥ 4.5 и reviews ≥ 3
2. {Name} — {service} в {city}, {N} лет опыта                         # если years_experience ≥ 5
3. {Name} — {service} в {city}, {N} выполненных заказов               # если completed_orders ≥ 10
4. {Name} — мастер по {service} в {city}                              # стандарт
5. {Name} — мастер в {city}                                           # fallback (нет специализации)

Description:
1. {publicBio первые 120 chars}... | ★{rating}, {city}                 # если publicBio ≥ 100 chars
2. Услуги: {top-3 specs}. {city}, цены от {min_price} ₽. {N} отзывов.  # если есть servicePrices
3. {Name}, мастер по {service} в {city}. Рейтинг {rating}. Заявка онлайн.  # fallback
```

Все поля проверяются на наличие. Если оператор/мастер задал `seoTitle`/`seoDescription` — они переопределяют.

#### Portfolio case `/raboty/[slug]`

```
Title:
1. {title} в {city} — {price} ₽, {duration} дней, {area} м²            # все данные
2. {title} в {city} — {price} ₽ под ключ, {duration} дней              # без area
3. {title} в {city} — {price} ₽ — {master_alias}                       # только цена
4. {title} в {city} — фото и стоимость работы                          # только базовые

Description:
1. Take master's description first 120 chars + " Цена {price} ₽, срок {duration}. Мастер {alias}."
2. Если description пуст: "Ремонт {service} в {city} от мастера {alias}. Цена {price}, срок {duration}, {area} м². Фото до и после."
3. Fallback: "{title} — фото ремонта от мастера {alias} в {city}."
```

#### Service-city `/[serviceSlug]/[citySlug]`

Уже работает корректно: `service.seoTitle` если задан + автоген. Добавить:
- Если `master_count > 0`: добавить `, {N} мастеров от {min_price} ₽` к title
- Если `avg_rating > 4`: добавить `★{rating}` к description

#### Hub-фиды `/raboty/[serviceSlug]/[citySlug]`

```
Title: "Работы мастеров: {service} в {city} — {N} проектов с фото и ценами"
Description: "Реальные ремонты {service_genitive} в {city} от {master_count} мастеров. Цены от {min} ₽. Фото до и после, отзывы клиентов."
```

### 11.8.4. Override priority chain

```
1. Operator-set seoTitle/seoDescription через CRM (если есть и не пусто)
2. Master-set seoTitle/seoDescription через master-pwa (если есть и не пусто)
3. Auto-generated по каскаду шаблонов
4. Fallback на минимальный безопасный variant
```

Override никогда не используется по умолчанию — только если оператор/мастер явно задал. Это защита от плохих ручных правок.

### 11.8.5. Технические требования к auto-generated meta

**Title**:
- Длина 30-70 chars (Google) / 30-65 chars (Яндекс)
- Если получается короче 30 → суффикс « — Честные мастера»
- Если получается длиннее 70 → обрезка по границе слова + «...»

**Description**:
- Длина 120-180 chars
- Если короче 120 → дополнить шаблонным фолбэком
- Если длиннее 180 → обрезка с «...» по границе слова
- Не должно содержать `\n`, многократные пробелы

**Канонизация перед использованием**:
- Strip HTML тэги
- Replace markdown → plain text
- Decode HTML entities
- Collapse whitespace

### 11.8.6. Server-side helpers (один раз, переиспользовать везде)

`artifacts/marketplace/lib/seoMeta.ts`:

```ts
buildMasterMeta(master: Master, stats: MasterStats): { title: string; description: string }
buildCaseMeta(case: PortfolioCase, master: Master): { title: string; description: string }
buildServiceCityMeta(service: Service, city: City, stats: Stats): { title: string; description: string }
buildHubMeta(service: Service, city: City | null, total: number): { title: string; description: string }
buildHomepageMeta(): { title: string; description: string }
buildBlogPostMeta(post: BlogPost): { title: string; description: string }  // когда блог появится

// Хелперы:
truncateToTitle(s: string, max = 70): string
truncateToDescription(s: string, max = 180): string
extractFirstSentences(text: string, maxChars = 130): string
sanitizeText(s: string): string  // strip md, collapse whitespace
ratingFormatted(value: string | null): string | null
ratingPlural(n: number): string
```

Все pure-функции, легко тестируются, переиспользуются в `generateMetadata`.

### 11.8.7. IndexNow API — мгновенная индексация (критично для масштаба)

Без IndexNow Yandex/Google индексирует новые URLs **1-4 недели**. С IndexNow — **часы**. На 100k+ страницах с регулярными обновлениями это критично.

**Реализация**:
1. Сгенерировать `IndexNow key` (32 случайных hex символа), сохранить в env `INDEXNOW_KEY`
2. Расположить файл `https://chestnye-mastera.ru/{key}.txt` с содержимым `{key}` для верификации
3. При публикации/изменении страницы (master, case, service-city) → POST в `https://yandex.com/indexnow`:
   ```
   POST /indexnow HTTP/1.1
   Content-Type: application/json; charset=utf-8
   {
     "host": "chestnye-mastera.ru",
     "key": "{INDEXNOW_KEY}",
     "urlList": ["https://chestnye-mastera.ru/raboty/{slug}", ...]
   }
   ```
4. То же самое в `https://www.bing.com/indexnow` (Bing/Microsoft принимает те же запросы, нагружает Yandex и Google).

Привязать к существующему `revalidateMarketplacePaths` — каждый revalidate автоматически пингует IndexNow.

### 11.8.8. Sitemap segmentation на масштабе

Лимиты: 50 000 URLs / 50 MB на один sitemap (Google + Yandex).

**Структура для масштаба 100k+ мастеров и миллионов кейсов**:

```
/sitemap.xml                       — sitemap index (содержит ссылки на под-карты)
/sitemap-static.xml                — главные статические (5-10 URLs)
/sitemap-services.xml              — /uslugi/[slug] (50-200 URLs)
/sitemap-cities.xml                — /goroda/[slug] (200-1000 URLs)
/sitemap-hubs-1.xml…/sitemap-hubs-N.xml — /[service]/[city] (10000-100000 URLs, по 50k на файл)
/sitemap-masters-1.xml…/sitemap-masters-N.xml — /master/[slug] (по 50k на файл)
/sitemap-raboty-1.xml…/sitemap-raboty-N.xml — /raboty/[slug] (по 50k на файл, могут быть миллионы файлов)
/sitemap-raboty-hubs.xml           — /raboty/[service]/[city] (10000-50000 URLs)
/sitemap-blog.xml                  — /sovety/[slug] (когда появится)
```

**Динамическая пагинация** sitemap'ов в Next.js: `app/sitemap-raboty.xml/[page]/route.ts` — обрабатывает `?page=N`, отдаёт 50k URLs с offset.

**Priority dynamic**:
- Featured cases / verified masters → `0.85-0.9`
- Standard published → `0.7`
- Recent (≤30 дней) → +0.05 boost
- Pages с lead conversions ≥ 5 → `0.85`

### 11.8.9. Robots.txt и crawl budget

```
User-agent: *
Allow: /
Disallow: /api/
Disallow: /search?
Disallow: /raboty?*       # фильтрованные виды → noindex или canonical на чистый
Disallow: /zayavka/spasibo
Disallow: /*?utm_*
Disallow: /*?yclid=
Disallow: /*?gclid=

Sitemap: https://chestnye-mastera.ru/sitemap.xml

User-agent: YandexBot
Crawl-delay: 1            # для Яндекса можно ускорить
```

Для агрессивных ботов (Bytespider, GPTBot etc.) можно отдельно `Disallow: /` если не хотим индексации.

### 11.8.10. Image SEO (важно для visual-heavy сайта)

Каждое фото — это потенциальный `Image Search` траф. Сейчас у нас `<img>` без alt — это пробел.

**Что нужно автоматизировать**:
- `alt` для каждого фото портфолио: `"{title} — фото {до|после|в процессе} ремонта в {city}"`
- `alt` для аватара мастера: `"{Name} — мастер в {city}"`
- `alt` для иконок услуг: имя услуги
- Для обложки case-страницы: явный alt с ключевыми словами

**ImageObject в schema.org JSON-LD** для каждого фото (особенно `cover_photo` и `before/after pair`):
```json
{
  "@type": "ImageObject",
  "contentUrl": "...",
  "name": "Ремонт кухни 12 м² — фото после",
  "creator": { "@id": "...master..." },
  "license": "https://chestnye-mastera.ru/policy/terms"
}
```

**Конвертация в WebP/AVIF** при upload (sharp в backend) — улучшает Core Web Vitals (LCP), без потери качества. Опционально, но критично для mobile.

### 11.8.11. Internal linking algorithm

Самый сильный SEO-сигнал, который можно автоматизировать.

**Master profile`/master/[slug]`**:
- ✅ Превью топ-6 кейсов с CTA «все работы → /raboty?master=alias` (уже есть)
- Добавить: «Похожие мастера в {city}» — топ-3 с похожим service
- Добавить: «Услуги в {city}» — ссылки на /[service]/{city} для всех услуг этого мастера

**Portfolio case `/raboty/[slug]`**:
- ✅ Похожие работы (3-6 кейсов) (уже есть)
- ✅ Карточка мастера (уже есть)
- Добавить: ссылки на `/raboty/{service}/{city}` (hub-страница) и `/raboty/{service}` (service фид)

**Hub `/raboty/[service]/[city]`**:
- Топ-9 кейсов
- Топ-N мастеров с этой услугой в этом городе
- Похожие города (где есть та же услуга)
- Похожие услуги в этом городе

**Service-city `/[service]/[city]`**:
- ✅ Топ-N мастеров (есть)
- Добавить: блок «Работы мастеров» — топ-6 кейсов из `/raboty/{service}/{city}`
- Добавить: ссылка на полный фид

### 11.8.12. SEO-monitoring (что отслеживать)

После релиза автоматики нужно мониторить:

1. **Yandex.Webmaster**:
   - Количество страниц в индексе по типам
   - Ошибки сканирования
   - SERP-импрешены и CTR
   - Запросы, по которым ранжируем
2. **Yandex.Metrika**:
   - Поисковый трафик по типам страниц (мастера / кейсы / hubs)
   - Bounce rate per page type
   - CTR-цели «отправил заявку»
3. **Google Search Console** аналогично
4. **Custom dashboard в CRM** (V1.5):
   - Топ кейсов по lead_count и view_count
   - Конверсия page → lead per type
   - CTR title/description

### 11.8.13. Чек-лист «полностью автоматический SEO для масштаба»

**Итерация 1 (V1)** — каскадные SEO-meta:
- [x] `lib/seoMeta.ts` с каскадными шаблонами для всех 6 типов страниц (commit `17b9ae61`)
- [x] Override через `seoTitle`/`seoDescription` для master (читается в `buildMasterMeta`)
- [x] Schema.org для всех типов страниц (CreativeWork + Service+Offer + ImageObject + Review)
- [x] Length normalisers (title 30-70 chars, description 120-180 chars)

**Итерация 2 (V1)** — мгновенная индексация и portfolio revalidation:
- [x] IndexNow API при revalidate (`lib/indexNow.ts`, commit `5d0e7187`)
- [x] `/api/indexnow-key` route на marketplace для верификации
- [x] `casePublicationPaths()` helper и применение в portfolio CRUD (master-pwa + masters routes)
- [x] Image alt-текст для PhotoGallery на странице кейса

**Итерация 3 (V1.5)** — что осталось:

> **🔴 БЛОКИРУЮЩАЯ ЗАДАЧА — выполняется первой**:
> - [ ] **Cabinet Migration (§18)** — единый домен `chestnye-mastera.ru/cabinet/*` для всего рабочего кабинета мастера. **3 недели работы, ~6 фаз** (auth-мост, перенос компонентов, migration tooling, soft-rollout). После — все следующие фичи Итерации 3 строятся в новом cabinet, без double work.

> **После завершения Cabinet Migration**:
- [ ] **Image alt на остальных страницах** — master profile (PortfolioCard, Avatar), `/raboty` feed (CaseCard), service-city (карточки мастеров). Используем готовые `buildPortfolioImageAlt`, `buildMasterAvatarAlt`, `buildMasterCaseCardAlt`.
- [ ] **Sitemap segmentation** — единый sitemap.xml становится тесным при 50k+ URLs. Делим на `sitemap-masters-N.xml`, `sitemap-raboty-N.xml`, `sitemap-hubs.xml`, `sitemap-idei.xml`. Понадобится при 5к+ опубликованных мастеров и 50к+ кейсов.
- [ ] **Dynamic priority в sitemap** — featured / verified / high-conversion → `0.85-0.9`, recent (≤30 дней) +0.05 boost, default `0.7`.
- [ ] **DB миграция: `master_portfolio.seo_title` + `seo_description`** — операторский override для VIP-кейсов.
- [ ] **DB миграция: `master_portfolio.room_type` + `style_tags[]`** — таксономия для каталога Идей (см. **§11.11**). GIN-индекс на style_tags, btree на (room_type, is_published).
- [ ] **Robots.txt enrichment** — crawl-delay для агрессивных ботов, явные `Disallow` для query-фильтрованных URLs.
- [ ] **WebP/AVIF конвертация при upload** — `sharp` в backend конвертит загруженные фото в WebP. Улучшает Core Web Vitals (LCP).
- [ ] **CRM-дашборд индексации** (`/crm/marketplace-seo`) — топ кейсов по view/lead_count, типы страниц с просадкой CTR, инкрементальный счётчик новых страниц в индексе.
- [ ] **Internal linking enrichment**:
  - На master profile добавить блоки «Похожие мастера в {city}» и «Услуги в {city}»
  - На странице кейса — ссылки на hub-фид и `/idei/{room}/{style}`
  - На service-city добавить блок «Работы мастеров» с превью
  - На /idei/* — все взаимные ссылки (см. §11.11.10)
- [ ] **`/raboty/[serviceSlug](/[citySlug])` filter routes** — long-tail SEO hubs (например `/raboty/remont-kuhni/krasnodar`).
- [ ] **Master motivation engine (§11.9)** — view/lead-счётчики на кейс, дашборд `/cabinet/dashboard`, profile completeness, лидерборд, ачивки, push при milestone. **(После Cabinet Migration — единожды в новом cabinet)**.
- [ ] **Cross-city inspiration model (§11.10)** — geo-detection через middleware, расширение `priorityAssign` для cross-city routing, inspiration credit для авторов, UX «Ваш город» в фиде и на странице кейса.
- [ ] **Каталог Идей `/idei/{room}/{style}` (§11.11)** — таксономия (10 room × 12 style + building/color/materials = до 1000 страниц), Pinterest-style masonry, backend endpoint, ItemList JSON-LD, sub-sitemap, тегирование existing кейсов через `/cabinet/portfolio`.
- [ ] **Дизайнеры как класс пользователей (§11.12, V2+)** — таблицы `designers` + `designer_projects`, страница `/designer/{slug}` с бейджами и метаданными (от 1500₽/м², своя бригада, авторский надзор и т.д.), фид `/proekty/*`, лендинг `/dlya-dizajnerov`, revenue share с воплощения.
- [ ] **Видео-контент (§11.13)** — три формата: рум-туры от мастеров (массовый УГК через `/cabinet/portfolio/{id}/video`), автогенерённое before/after (через ffmpeg), видео-инструкции от топ-авторов. Хранение в Yandex.Cloud + CDN, дублирование в VK Видео для виральности. Бейдж «Видеомастер» + boost в priorityAssign.

**Активация (после деплоя `5d0e7187`)**:
- Сгенерировать `INDEXNOW_KEY` (32 hex)
- Установить env `INDEXNOW_KEY=<значение>` на двух Railway-сервисах: `sfera888` и `marketplace`
- После redeploy проверить: `curl https://chestnye-mastera.ru/api/indexnow-key` → должен вернуть значение
- Зарегистрировать сайт в Yandex.Webmaster + включить там IndexNow

### 11.8.14. Что НЕ делаем

1. **AI-генерация title/description** — Яндекс детектит и снижает позиции. Шаблоны лучше.
2. **Длинные title с key-stuffing** — `Сантехник Краснодар недорого срочно вызов мастера 24/7` — антипаттерн.
3. **Автогенерация описания через scraping** — копирайт + штрафы.
4. **Spinner-text** (rephrasing одного текста для разных страниц) — это шаблонная генерация, поисковики штрафуют.
5. **Polluting sitemap** мусорными URLs (фильтрованные, поиск, query-string) — сжигает crawl budget.

---


## 11.9 Master motivation engine: «работа = заявка»

> **Дополнение к секциям 11.7 и 11.8.** Описывает не SEO, а **психологию мастера**. Цель — чтобы мастер публиковал кейсы не потому что мы попросили, а потому что **сам видит выгоду**: каждая работа = ещё один шанс получить клиента. Без этого слоя контент-стратегия не запустится: 100k-кейсов нужны, но мастера не загрузят их «из воздуха».

### 11.9.1. Концепция

В голове мастера должна закрепиться формула:

> **+1 кейс = +N показов = +M заявок**

Не «заполнить профиль», не «загрузить фото для красоты», а **бизнес-актив**, который работает за мастера 24/7. Аналогия — продавец на маркетплейсе, который заполняет карточки товаров: больше карточек → больше показов → больше продаж.

Принципы:
1. **Прозрачность цифр.** Мастер видит реальные view/lead-счётчики на каждый кейс. Без них вся мотивация — пустые слова.
2. **Позитивный framing.** Не «у вас не сделано», а «следующий шаг даст вам X». Punishing-копи снижает retention.
3. **Конкретные обещания.** Каждый «бенефит» (показы, попадание в раздел, приоритет) должен быть **реализован в системе**. Иначе через месяц теряем доверие.
4. **Геймификация умеренная.** Бейджи и лидерборд — да, но не превращать в Foursquare. Главное — реальные деньги (заявки), не очки.

### 11.9.2. Метрики на каждый кейс

Расширения существующей таблицы `master_portfolio` (часть в схеме уже есть, часть нужно добавить):

```sql
-- Уже в схеме:
view_count    integer DEFAULT 0     -- сколько раз страницу /raboty/[slug] открыли
lead_count    integer DEFAULT 0     -- сколько лидов сгенерила страница

-- Добавить миграцией:
inspiration_count   integer DEFAULT 0   -- сколько раз кейс показывался в /idei (cross-city, см. 11.10)
last_lead_at        timestamp           -- дата последнего лида с кейса
last_view_at        timestamp           -- дата последнего просмотра
```

Дополнительно — отдельная таблица `master_portfolio_views` для time-series аналитики:

```sql
master_portfolio_views (
  id            bigserial PK,
  portfolio_id  integer FK,
  ip_hash       varchar(64),                 -- sha256(ip+salt) — дедупликация
  referrer      text,                        -- yandex / google / internal
  city_geoip    varchar(100),                -- город по IP, для cross-city аналитики
  viewed_at     timestamp NOT NULL DEFAULT now()
)
```

При каждом открытии `/raboty/[slug]` → инкремент `view_count` + запись в `master_portfolio_views`. Дедупликация по ip_hash в окне 24 часа.

### 11.9.3. Дашборд мастера в master-pwa

Новая секция «Мои работы» на главной экране master-pwa:

```
┌──────────────────────────────────────────────────┐
│ Ваши работы (3 опубликовано из 30 возможных)    │
│                                                   │
│ [Превью] Ремонт кухни 12 м²                      │
│          👁 234 просмотра  ·  📨 5 заявок         │
│          За месяц: +47 просмотров, +1 заявка     │
│                                                   │
│ [Превью] Ремонт ванной 4 м²                      │
│          👁 89 просмотров   ·  📨 1 заявка        │
│                                                   │
│ [Превью] Укладка плитки в санузле                │
│          👁 12 просмотров   ·  📨 0 заявок        │
│          ⚠ Добавьте описание для роста показов   │
│                                                   │
│ [+ Добавить новую работу]                        │
└──────────────────────────────────────────────────┘
```

Что в дашборде:
- **Просмотры** (`view_count` + delta за 30 дней)
- **Заявки с этой работы** (`lead_count` + delta)
- **Inspiration**: «Ваш кейс вдохновил людей в N городах» (из cross-city логики, см. 11.10)
- **Конверсия**: views → leads % (отображается если view_count ≥ 50)
- **Подсказки** для слабых кейсов: «Добавьте описание ≥150 chars», «Загрузите фото "до"», «Заполните цену»

### 11.9.4. Profile completeness — позитивный framing

Карточка наверху Profile-страницы:

```
┌─────────────────────────────────────────────────┐
│ Профиль на 60% готов к продвижению              │
│ ████████████░░░░░░░ 6/10 шагов                  │
│                                                 │
│ Следующий шаг: Добавьте 1 кейс                  │
│ Получите:                                        │
│   ✓ Попадание в раздел /raboty                  │
│   ✓ Кейс будет показан в /idei                  │
│   ✓ Возможность получать заявки через           │
│     кнопку «Хочу такую же»                      │
│                                                 │
│ [Добавить кейс →]                               │
└─────────────────────────────────────────────────┘
```

Шаги:
1. ✅ Зарегистрирован
2. ✅ Указан город
3. ✅ Указана специализация
4. ⬜ Загружен аватар → «Профиль с фото открывают чаще»
5. ⬜ Заполнено `publicBio` ≥100 chars → «Текст помогает Яндексу понять о чём вы»
6. ⬜ Указан стаж в годах → «Стаж — ключевой сигнал доверия»
7. ⬜ Заполнен прайс ≥1 услуги → «Карточки с ценами ранжируются выше»
8. ⬜ 1-й кейс опубликован → «Каждая работа = страница в Яндексе и шанс получить заявку»
9. ⬜ 3 кейса → «3+ работ — порог для попадания в раздел Идеи»
10. ⬜ 5 кейсов → «5+ работ — приоритет в диспетчере (вы получаете заявки раньше)»

**Принципы копи:**
- Каждый шаг — что мастер **получит**, не что у него **пусто**.
- Цифры конкретные (не абстрактные «больше показов»).
- Глагол повелительный, обещание измеримое.

### 11.9.5. Связь с диспетчером — реальный приоритет

Один из самых сильных рычагов — **реальный приоритет в priorityAssign**:

```ts
function calculateMasterScore(master, lead) {
  let score = baseScore(master, lead);
  const publishedCases = master.publishedPortfolioCount;
  if (publishedCases >= 5) score *= 1.15;
  else if (publishedCases >= 3) score *= 1.08;
  else if (publishedCases >= 1) score *= 1.03;

  // Бонус за inspiration (cross-city, см. 11.10)
  if (master.inspirationLast30Days >= 10) score *= 1.10;

  return score;
}
```

В дашборде мастер видит:
> «Вы публикуете 5+ работ → +15% к приоритету в диспетчере. Заявки приходят раньше других мастеров.»

### 11.9.6. Лидерборд месяца

Публичный (доступен авторизованным):
- **Топ-10 авторов месяца** по сумме `view_count + lead_count × 50`
- Город / специализация фильтры
- На странице мастера-победителя — бейдж «Топ автор месяца»
- В дашборде каждого мастера — его собственная позиция в лидерборде месяца

### 11.9.7. Ачивки и бейджи

Минимальный набор:
- 🌱 «Старт автора» — первая опубликованная работа
- 📚 «5 работ» — 5 опубликованных кейсов
- 🔥 «Первая заявка с кейса» — кейс принёс лида
- ⭐ «Топ автор месяца» — призовое место в лидерборде
- 💎 «Вдохновитель России» — кейс набрал 1000+ просмотров (cross-city)

Хранятся в новой таблице `master_achievements (master_id, code, granted_at)`. Отображаются на публичной странице мастера + в дашборде. Не более 3-4 видимы одновременно.

### 11.9.8. Email / push нотификации мастеру

При наступлении milestone мастер получает push (через существующую инфру):
- «Ваш кейс посмотрели 100 раз» — первое пересечение порога
- «С кейса пришла первая заявка» — first lead conversion
- «Вы поднялись в топ-10 авторов месяца»
- Слабые кейсы: «Кейс "Ремонт ванной" посмотрели 50 раз, но заявок 0. Возможно, добавить цены?»

### 11.9.9. Что добавить в существующий редактор кейса

В `<PortfolioEditor>` master-pwa:
- Перед save — preview-блок «Что увидит клиент»
- После save — toast «Кейс опубликован → доступен на /raboty/{slug}» с прямой ссылкой
- Внизу — кнопки шеринга «Поделиться в Telegram / WhatsApp» (мастер шарит свой кейс → больше просмотров → больше заявок)

### 11.9.10. Метрики успеха

V1 (через 1 месяц после релиза):
- Среднее число опубликованных кейсов на активного мастера ≥ 1.5
- 30%+ мастеров опубликовали хотя бы один кейс
- 10%+ мастеров опубликовали 5+ кейсов

V1.5 (через 3 месяца):
- Среднее ≥ 3.5
- 60%+ опубликовали хотя бы один
- 25%+ опубликовали 5+
- Лидерборд месяца имеет 50+ участников

V2 (через 6 месяцев):
- Среднее ≥ 5
- 80%+ опубликовали хотя бы один
- 40%+ опубликовали 5+
- Каждый активный мастер публикует 1+ нового кейса в месяц

---


## 11.10 Cross-city inspiration model: «Хочу также» и геораутинг

> **Дополнение к 11.7 и 11.9.** Описывает архитектуру **расцепления контента и логистики**. Контент (работа) — global; лид (заявка) — local. Это и есть killer feature, отличающая нас от Houzz/Pinterest (без локального routing) и от Авито/Профи (без вдохновляющего контента).

### 11.10.1. Концепция

Сегодня:
- Юзер из Москвы видит кейс «Ремонт кухни в Краснодаре» → его не интересует мастер в Краснодаре, ему нужен в Москве → конверсия в лид падает.
- Мы вынуждены показывать только локальный контент → объём контента маленький → SEO слабое.

Цель:
- **Контент работает на всю Россию.** Кейс из Краснодара может нравиться москвичу, новосибирцу, питерцу.
- **Лид направляется в город пользователя.** Когда юзер кликает «Хочу также», система определяет его город и матчит мастеров **там**.
- **Автор кейса не теряет.** За «вдохновение» он получает компенсацию (приоритет в его городе + бонус-баллы).

### 11.10.2. Контент vs локация — две оси атрибутов

Каждый кейс имеет:

**Контент-эссенция (для match по сходству, кросс-город):**
- `service_type_id` (ремонт кухни / ванной / электрика / ...)
- `room_type` (kitchen / bathroom / living / hallway / outdoor / ...)  ← **новое поле**
- `style_tags` text[] (`[minimalism, scandi, loft, classic]`) ← **новое поле**
- `price_range_band` (1-100k / 100-300k / 300-700k / 700k+) ← вычисляемое из `price_total`
- `area_band` (до 5 м² / 5-15 / 15-50 / 50+) ← вычисляемое из `area_sqm`

**Локация выполнения (для отображения в карточке, не для match):**
- `city_id` (где работа была сделана)
- `master_id` (кто делал)

При построении «Похожие работы» / «Идеи» используются **только контент-атрибуты**. Юзер из Москвы видит кейсы из Краснодара, Питера, Сочи — если они стилистически близки.

### 11.10.3. Geo-detection пользователя

Где брать город пользователя:

1. **Cookie `user_city_slug`** — приоритет 1. Один раз заполнили → 90 дней.
2. **Geo-IP** — приоритет 2. По IP при первом заходе. MaxMind GeoLite2 (бесплатно) или Yandex.Geo API.
3. **URL hint** — приоритет 3. Если юзер пришёл с `/santehnik/krasnodar` — Краснодар как контекст.
4. **Manual override** — на любом этапе юзер может в шапке выбрать город из dropdown «Ваш город: Москва ▾».

Архитектура:

```ts
// middleware.ts (Next.js Edge)
export function middleware(req) {
  const cookie = req.cookies.get("user_city_slug")?.value;
  if (cookie) return; // already detected

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const cityCode = lookupCityByIp(ip); // edge-cached MaxMind
  if (cityCode) {
    const res = NextResponse.next();
    res.cookies.set("user_city_slug", cityCode, { maxAge: 90 * 24 * 3600, sameSite: "lax" });
    return res;
  }
}
```

На SSR-страницах кейса/идеи cookie доступна → можно сразу показать «Подходящие мастера в Москве» в sidebar.

**Privacy**: city_slug сохраняется в cookie, не в БД. На сервере не персистится. Общая локация города не считается ПДн (РФ ст. 152-ФЗ).

### 11.10.4. Кнопка «Хочу также» — алгоритм

Текущая реализация на странице кейса: лид направляется автору-мастеру (см. 11.7.8). Это правильно когда **юзер в том же городе что и автор**. Если разные — нужна другая логика.

Новая блок-схема:

```
Юзер кликает «Хочу также» на /raboty/{slug}
      ↓
[1] Backend получает: case_id + user_city_slug (из cookie)
      ↓
[2] Резолвит case → service_type_id, room_type, style_tags, price_band, area_band
      ↓
[3] Случай A: case.city == user.city ИЛИ user.city == null
      → стандартный flow: лид автору + broadcast похожим (плана 11.7.8)
      → form проверяет/предлагает указать город
      ↓
[3'] Случай B: case.city != user.city (cross-city — основной кейс)
      → лид НЕ идёт автору-мастеру (он в другом городе)
      → broadcast: топ-N мастеров в user.city с матчем по
        service_type_id + style_tags overlap + price_band ±1
      → автор-кейса получает «inspiration credit» (см. 11.10.5)
```

API изменения:

```ts
// существующий POST /api/marketplace/leads
// добавляем в body schema:
{
  ...,
  city_slug: "moscow",          // явный город пользователя (обязательное)
  source_case_id: 142,          // если из «Хочу также»
  inspired_by_master_id: 88,    // автор кейса (для credit)
}
```

В `priorityAssign.ts` логика matching:

```ts
function findMatchingMasters(lead, sourceCase) {
  const candidates = await db.select().from(masters).where(and(
    eq(masters.city, lead.city),                          // ВАЖНО: город юзера
    eq(masters.isPublished, true),
    sql`${sourceCase.service_type_id} = ANY(masters.service_type_ids)`,
  ));

  return candidates
    .map(m => ({
      master: m,
      score: matchScore(m, sourceCase),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function matchScore(master, sourceCase) {
  let s = 1.0;

  // Перекрытие style_tags — самый сильный сигнал «делает похожее»
  const overlap = intersection(master.style_tags ?? [], sourceCase.style_tags ?? []);
  s *= (1 + overlap.length * 0.2);

  // Похожий ценовой диапазон
  const masterAvgPrice = avgPriceFromPortfolio(master);
  if (masterAvgPrice && sourceCase.price_total) {
    const ratio = Math.min(masterAvgPrice, sourceCase.price_total) / Math.max(masterAvgPrice, sourceCase.price_total);
    s *= (0.5 + ratio * 0.5);
  }

  // Уже есть кейсы в этой room/style — сильный сигнал
  if (master.has_case_in_room_type === sourceCase.room_type) s *= 1.3;

  // Существующие сигналы (рейтинг, активность, completeness)
  s *= existingSignals(master);

  return s;
}
```

### 11.10.5. Inspiration credit — компенсация автору

Когда кейс из Краснодара вдохновил юзера и привёл его лид к московскому мастеру — автор-краснодарец **не получает прямую заявку**, но получает:

1. **Inspiration counter** в `master_portfolio.inspiration_count` — счётчик публичный, отображается на странице кейса как «Этот кейс вдохновил X людей»
2. **Бонус-балл** в его городе — увеличение priority score в `priorityAssign` для лидов в его собственном городе:
   ```
   bonus = log10(inspiration_count_30d) × 0.05  (capped at +0.15)
   ```
   Если кейсы краснодарского мастера вдохновили 1000 людей за месяц → +15% к его приоритету в Краснодаре.
3. **Прозрачная коммуникация в дашборде**:
   ```
   ┌─────────────────────────────────────────────┐
   │ Ваш кейс «Ремонт кухни 12 м²»               │
   │   👁 234 просмотра                           │
   │   ✨ Вдохновил 47 людей в 12 городах        │
   │   📨 5 заявок (Краснодар) +                 │
   │      8 заявок мастерам в их городах         │
   │   🎁 Вам начислено +12% к приоритету        │
   │      в Краснодаре на 30 дней                │
   └─────────────────────────────────────────────┘
   ```

Это критично: **без компенсации мастер увидит «200 просмотров — 0 заявок» и решит что система не работает**, перестанет публиковать. С компенсацией — публикация выгодна даже если основной трафик уходит другим.

### 11.10.6. UX в фиде и на странице кейса

**Карточка в фиде** имеет два режима:
- Если case.city == user.city → бейдж «У вас в городе» (зелёный)
- Иначе → бейдж «📍 {city}» (нейтральный, информативный)

```
┌────────────────────────────────────┐
│ [фото]                             │
│ ★ В вашем городе                   │  ← или: 📍 Краснодар
│ Ремонт кухни 12 м²                 │
│ от 280 000 ₽                       │
│ Иван П.                            │
└────────────────────────────────────┘
```

**На странице кейса** — sidebar «Хочу такую же»:

```
┌──────────────────────────────────────┐
│ Хочу такую же                        │
│                                      │
│ Ваш город: ▾ [Москва / изменить]    │
│                                      │
│ → «Найдём мастеров в Москве,         │
│    которые делают похожие работы»    │
│                                      │
│ [Оставить заявку →]                  │
└──────────────────────────────────────┘
```

Если geo-IP не определил → кнопка «Хочу также» дисейблится пока город не выбран. Снижает confusion (юзер всегда понимает что произойдёт после клика).

Это honest framing: мы не скрываем что кейс из другого города, но даём инструменты для local match.

### 11.10.7. Аналитика cross-city

Для CRM-дашборда (см. 11.8.12 + 11.9):

- **Top inspiring cities**: какие города публикуют наибольший % cross-city просмотров (Москва часто потребитель, Краснодар часто producer)
- **Conversion funnel cross vs local**: процент cross-city просмотров → лидов
- **Top inspiring cases**: кейсы которые приводят больше всего лидов в другие города
- **Underutilized cities**: города где мало мастеров, но кейсы оттуда привлекают трафик → таргет для master acquisition

### 11.10.8. SEO следствия

Положительное:
- Контент работает на 1500+ городов России → длинный хвост по любым визуальным запросам
- Время на сайте растёт (юзер листает идеи)
- Behaviour signals → Яндекс ранжирует выше

Что важно настроить:
- Canonical всегда на `/raboty/[slug]` (а не `/raboty/[slug]?city=moscow`) — иначе раздробим вес
- Hreflang не нужен (одна локаль ru-RU)
- В meta-description упоминаем город выполнения, но title не локализуем — глобальная страница

### 11.10.9. Метрики успеха

V2 (через 3 месяца после запуска cross-city):
- ≥30% всех «Хочу также»-кликов идут от юзеров **из другого города** (cross-city работает)
- Среднее время на странице кейса ≥ 90 сек
- Conversion cross-city → лид ≥ 5%
- Бэк-поток: ≥ 20% мастеров получили хотя бы один inspiration credit

---


## 11.11 Каталог Идей: `/idei/{room}/{style}` — Pinterest-уровень для ремонта

> **Дополнение к 11.7 и 11.10.** Третий тип SEO-страниц после кейсов (`/raboty/[slug]`) и hub'ов услуга-город (`/[service]/[city]`). Это **«Pinterest для ремонта в РФ»** — раздел который агрегирует работы по теме (комната × стиль × бюджет), независимо от города. Закрывает огромный пласт визуальных long-tail запросов, на которые сегодня в РФ ранжируется Pinterest и реклама.

### 11.11.1. Концепция

Юзер ищет в Яндексе «ванная в стиле минимализм фото» — он не ищет мастера. Он ищет **идею**. Если он попадает на `/idei/vannaya/minimalism` и видит 50 реальных ремонтов с ценами и сроками, он:
1. Получает ответ на свой запрос (мы держим внимание)
2. Видит что эти ремонты **реально делали мастера** (доверие)
3. Может нажать «Хочу такую же» (конверсия в лид)

Это **третий тип SEO-страниц**:
1. `/raboty/[slug]` — конкретная работа (single intent)
2. `/[service]/[city]` — поиск услуги в городе (commercial intent)
3. `/idei/[room]/[style]` — **поиск идей и стилистики** (informational + visual intent) ← новый

### 11.11.2. URL-схема

```
/idei                                — главная (топ-категории, навигация)
/idei/{room}                         — все идеи по комнате (kitchen / bathroom / ...)
/idei/{room}/{style}                 — комната × стиль (kitchen/minimalism / ...)
/idei/{room}/{style}/{priceBand}     — расширенный фильтр [V2.5]
/idei?room=&style=&minPrice=&maxPrice=&page=  — query-фильтрация (noindex)
```

**Принцип**: чистые URLs без `?param` — для индексации. Query-params — только для пользовательской фильтрации, всегда `noindex`.

### 11.11.3. Таксономия

Многоосевая таксономия (заимствуем структуру у Сантехника-Онлайн / Лови Инсайт + расширяем для transactional модели):

**Ось 1: Room type** (фиксированный список, ~10):
- `kitchen` — кухня
- `bathroom` — ванная / санузел
- `living` — гостиная / зал
- `bedroom` — спальня
- `hallway` — коридор / прихожая
- `kids` — детская
- `office` — кабинет / рабочее место
- `balcony` — балкон / лоджия
- `outdoor` — фасад / двор / терраса
- `commercial` — коммерческое помещение

**Ось 2: Style** (фиксированный список, ~12):
- `minimalism`, `scandi`, `loft`, `classic`, `modern`, `provence`, `eco`, `industrial`, `art-deco`, `boho`, `japanese`, `mediterranean`

**Ось 3: Building type** (~5) — отдельная важная ось, у Лови Инсайт это «Здания»:
- `new_building` — новостройка
- `secondary` — вторичка
- `private_house` — частный дом
- `studio` — студия / однушка
- `commercial` — коммерческое помещение

**Ось 4: Color palette** (~6) — для визуального match:
- `light` — светлая
- `neutral` — нейтральная
- `warm` — тёплая (бежевая, охра)
- `dark` — тёмная
- `contrast` — контрастная (чёрно-белая)
- `bright` — яркая (акценты)

**Ось 5: Materials** (структурированный список тегов, ~15):
- `tile` (плитка) / `mosaic` / `porcelain_tile` (керамогранит)
- `paint` / `wallpaper` / `microcement`
- `wood` / `laminate` / `parquet` / `vinyl`
- `stone` / `marble` / `concrete`
- `pvc_panel` / `panel_drywall`

**Ось 6: Area band** (вычисляемая из `area_sqm`):
- `xs` — до 3 м²
- `s` — 3-5 м²
- `m` — 5-10 м²
- `l` — 10-20 м²
- `xl` — 20-50 м²
- `xxl` — 50+ м²

**Ось 7: Price band** (вычисляемая из `price_total`):
- `budget` — до 100к ₽
- `mid` — 100-300к ₽
- `premium` — 300-700к ₽
- `luxury` — 700к+ ₽

**Кардинальность hub-страниц**:
- Только room: 10
- Только style: 12
- Room × Style: 120
- Room × Building: 50
- Room × Style × Building: 600 (генерируем только для пар с ≥5 кейсов)
- Room × Color: 60
- Tag-страницы (хэштеги вроде «маленькие ванные», «санузлы в современном стиле»): 100-300 органически

Итого до **1000 индексируемых hub-страниц** только по таксономии. Каждая ранжирует на 5-50 ключей → **десятки тысяч long-tail-запросов**.

**Хэштеги-теги** (как у Лови Инсайт: `#маленькие ванные`, `#светло-серый`, `#современные маленькие кухни`) — это композитные теги из нескольких осей. Генерируются автоматически из комбинаций атрибутов кейса. Каждый = отдельная SEO-страница `/idei/tag/{tag-slug}`.

### 11.11.4. Анатомия страницы `/idei/{room}/{style}`

```
H1: Идеи ремонта: {Style} {Room} — фото и стоимость

Breadcrumbs: Главная → Идеи → {Room} → {Style}

[Hero / описание]
"Современный минимализм в ванной — 47 реальных проектов с фото до и после,
цены от 80 до 400 тыс ₽. Понравилась работа — оставьте заявку, найдём мастера в вашем городе."

[Фильтры (горизонтальный sticky toolbar): cityHint, Стиль, Здание, Цвет, Материал, Размер, Цена, Сортировка]

[Активные хэштеги-теги: #маленькие_ванные #санузлы_в_современном_стиле #светло-серый]

[Pinterest-style MASONRY GRID]
  - Колонки 2 (mobile) / 3 (tablet) / 4 (desktop)
  - Карточки переменной высоты (сохраняют aspect ratio фото)
  - Lazy-load + IntersectionObserver для бесконечной прокрутки
  - Каждая карточка:
      Cover-фото (after) с alt-текстом "{title} — {style} {room}"
      Заголовок (1-2 строки)
      Цена / площадь / город (компактно под фото)
      Бейдж: «У вас в городе» / «Из {city}»
      Hover/long-press: оверлей с CTA «Хочу такую же»
      Иконка ❤ / 📌 (сохранить в избранное)

[H2: Чем характерен {Style} {Room}]
SEO-описание стиля 200-400 chars (шаблоны для топ-комбинаций — ручные,
для прочих — генеративные из таксономии).

[H2: Похожие подборки]
- /idei/{room}/scandi (другой стиль той же комнаты)
- /idei/bathroom/{style} (тот же стиль, другая комната)

[H2: Мастера, делающие похожее в вашем городе]
{user_city из cookie}: топ-5 мастеров с матчем по style_tags + room_type.
Если city=null → CTA «Укажите город чтобы увидеть подходящих мастеров».

[H2: Цены]
"В России работы такого типа стоят от X до Y ₽
(данные из {N} кейсов, опубликованных мастерами)"
Простая таблица распределения цен по диапазонам.

[H2: FAQ]
Шаблонные вопросы по комбинации:
- Сколько стоит {style} {room} в России в среднем?
- Как долго делается {style} {room}?
- Какие материалы обычно используются?
- В каком стиле {room} наиболее популярен в РФ?
```

### 11.11.5. SEO-meta для /idei/* (продолжение секции 11.8)

В `lib/seoMeta.ts` добавляются билдеры:

```ts
buildIdeasIndexMeta(): { title, description }
buildIdeasRoomMeta(room: { code, label }): { title, description }
buildIdeasRoomStyleMeta(room, style, count, priceRange): { title, description }
```

Шаблоны:

```
Title для /idei/{room}/{style}:
1. {Style} {Room} — {N} реальных проектов с фото и ценами от {min} ₽
2. {Style} {Room} — фото и стоимость {N} работ мастеров
3. {Style} {Room} — идеи ремонта с реальными ценами

Description:
1. {N} реальных проектов в стиле "{style}" для {room}. Фото до и после, цены от {min} до {max} ₽, контакты мастеров. Понравилась работа — заявка уходит мастерам в вашем городе.
2. Подборка работ мастеров для {room} в стиле {style}: {N} проектов с фото, описанием и ценами.
```

### 11.11.6. JSON-LD для /idei/* страниц

Schema.org `ItemList` с `CreativeWork` для каждой работы:

```jsonld
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "Идеи ремонта: минимализм для ванной",
  "url": "https://chestnye-mastera.ru/idei/bathroom/minimalism",
  "numberOfItems": 47,
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "url": "https://chestnye-mastera.ru/raboty/{slug}",
      "name": "Ремонт ванной 4 м² в стиле минимализм",
      "image": "https://chestnye-mastera.ru/.../cover.webp"
    },
    ...
  ]
}
```

Плюс `BreadcrumbList` (Главная → Идеи → {room} → {style}).
Плюс `FAQPage` для FAQ-блока.

### 11.11.7. Backend endpoint

```
GET /api/marketplace/idei?room={code}&style={code}&page={n}&priceMin={n}&priceMax={n}

Response:
{
  items: PortfolioCase[],   // public DTO
  page, limit, total,
  filter: { room, style, priceRange },
  meta: {
    minPrice, maxPrice, avgPrice,
    cityCounts: {...},        // из каких городов работы (для бейджей)
  }
}
```

В БД query:

```sql
SELECT mp.*, m.alias, m.slug as master_slug, c.name as city_name, c.slug as city_slug
FROM master_portfolio mp
INNER JOIN masters m ON m.id = mp.master_id
LEFT JOIN cities c ON c.id = mp.city_id
WHERE mp.is_published = true
  AND m.is_published = true
  AND mp.slug IS NOT NULL
  AND mp.room_type = $1
  AND $2 = ANY(mp.style_tags)
  AND mp.price_total BETWEEN $3 AND $4
ORDER BY mp.is_featured DESC, mp.completed_at DESC NULLS LAST
LIMIT 24 OFFSET $5
```

Индексы:
- `idx_portfolio_room` (room_type, is_published)
- `idx_portfolio_style_gin` (GIN style_tags)
- `idx_portfolio_room_style` (room_type, style_tags) — composite если объёмы вырастут

### 11.11.8. Где брать room_type и style_tags для существующих кейсов

После миграции БД (добавление полей) существующие 100+ кейсов имеют `room_type=NULL`. Стратегии:

1. **Опросить мастеров**: показать в дашборде «Тегируйте свои работы по комнате/стилю — попадание в раздел Идеи». Геймификация — те, кто протегировал, получают бейдж + boost в diспетчере.

2. **AI-классификатор по фото** (фаза 2): отдельный сервис на `lib/aiClassifier.ts` который анализирует cover_photo через Yandex Vision или OpenAI Vision и предлагает теги. Мастер-апрувер.

3. **Backfill из текста**: парсить `title + description` на keyword'ы. Простая регулярка по списку стилей/комнат → если совпадает — суггестировать. Точность ~60%, нужна модерация.

4. **Default по services**: если service_type — «Ремонт кухни», то room_type автоматически `kitchen` (не идеально для подвида, но лучше чем NULL).

V1: использовать backfill (3) + опрос (1). AI (2) — V2.

### 11.11.9. Sitemap entries

Новый sub-sitemap:
```
/sitemap-idei.xml
```

Содержит:
- /idei (priority 0.8)
- /idei/{room} для каждой комнаты с ≥3 кейсами (priority 0.7)
- /idei/{room}/{style} для каждой пары с ≥5 кейсами (priority 0.75)
- /idei/{room}/{style}/{priceBand} [V2.5] для каждой тройки с ≥10 кейсами

Если страница имеет <5 кейсов — `noindex`, в sitemap не попадает (анти-thin-content).

### 11.11.10. Internal linking

`/idei/{room}/{style}` плотно связан с другими страницами:

- В шапке: ссылки на топ-комнаты (`/idei/kitchen`, `/idei/bathroom`, ...)
- На /idei/{room}/{style}: «Похожие подборки» — другие стили для той же комнаты
- На /raboty/{slug}: breadcrumb «Идеи → {room} → {style}» обратно
- На /master/{slug}: «Мастер в {style}» если у мастера много кейсов в этом стиле
- На /[service]/[city]: блок «Идеи: {style} {room}» в секции «Что мы делаем»

### 11.11.11. Связь с AI-дизайнером (план §17)

Когда AI-дизайнер запустится (фаза 8), интеграция с `/idei/*`:

- На странице AI-дизайна (`/dizajn/{room}/{style}`) → блок «Реальные работы в этом стиле» — топ-6 кейсов из соответствующего `/idei/{room}/{style}`
- На странице `/idei/{room}/{style}` → блок «Сгенерировать AI-дизайн в этом стиле» с промптом «{room} в стиле {style}» pre-filled
- Двунаправленная воронка: вдохновение от реального ремонта ↔ AI-визуализация → подбор мастера

Это и есть **полный путь** который описывал ты:
```
AI-дизайн / Идея → "Хочу такую же" → Мастер в моём городе → Заявка → Ремонт
```

### 11.11.12. Что меняется в существующих секциях

- **Секция 7 (БД)**: миграция `master_portfolio` — добавить `room_type varchar(50)`, `style_tags text[] DEFAULT '{}'`, индексы (GIN на style_tags, btree на room_type+is_published).
- **Секция 11.7**: gate для публикации обновляется — для попадания в `/idei` нужны ОБА поля. Без них кейс публикуется в `/raboty/{slug}` но не в `/idei` (отсутствие тегов = не попадание в подборки).
- **Секция 11.10**: matching cross-city уже использует style_tags — после ввода таксономии алгоритм работает точнее.
- **Секция 12 (Sitemap)**: новый sub-sitemap `/sitemap-idei.xml`.
- **Секция 16.3** (Content/Social Layer): ранее упомянутые «Идеи ремонта» (16.3.5) реализуются именно как `/idei/*`.

### 11.11.13. Метрики успеха

V2 (через 4-6 месяцев):
- 50+ страниц `/idei/{room}/{style}` с ≥10 кейсов каждая (минимум для индексации)
- ≥1000 кейсов протегированы (room + style)
- 20%+ всего органического трафика приходит на `/idei/*`
- Conversion `/idei` → лид ≥ 3% (информационный intent → lead)

V3 (через 12 месяцев):
- 120+ страниц `/idei/{room}/{style}` ранжируются в ТОП-30 Яндекса
- 5+ страниц в ТОП-10 по запросам типа «{style} {room} фото»
- Узнаваемость: люди приходят на сайт по запросу «идеи ремонта» (не «найти мастера»)

### 11.11.14. Что НЕ делаем в V1.5

- **AI-классификатор по фото** — слишком ранняя оптимизация. Пока есть мастера и backfill из текста — этого достаточно. Запускаем когда есть 5000+ кейсов и backfill становится узким местом.
- **Сложные фильтры** (кол-во комнат, тип жилья, ремонт под ключ vs частично) — добавляем по мере появления данных. V1.5: только room + style.
- **AI-генерация описаний для /idei** — категорийные тексты пишет редактор вручную для топ-50 пар. Для остальных — шаблон-генерация (по таксономии, не AI). Никакой AI-генерация на масштаб.

### 11.11.15. Конкурентный анализ и стратегические ориентиры

#### Позиционирование на российском рынке

Никто из текущих игроков не закрывает воронку «увидел красивый ремонт → нанял мастера → получил такой же результат» полностью.

| Игрок | Роль | Что закрывает | Что НЕ закрывает |
|---|---|---|---|
| **Лови Инсайт (Сантехника-Онлайн)** | контент-медиа от ритейлера | 10k+ дизайн-идей с тегами, видео-рум-туры, подкасты, 1159 дизайнеров | реальные цены ремонта, конверсия в работу, локальный routing |
| **INMYROOM** | дизайн-медиа | вдохновение, статьи, мебель, дизайнеры | путь до мастера, реальные сделки, выполненные ремонты с ценой |
| **Pinterest** | глобальное визуальное вдохновение | картинки на любые темы | локальность, мастера, цены, заявки |
| **Houzz** | (нет в РФ) | реальные ремонты + дизайнеры (на западных рынках) | не работает в РФ |
| **Авито** | доска объявлений | поиск мастера по городу, заявки | вдохновение, контент, реальные кейсы с фото до/после |
| **Профи.ру** | lead-маркетплейс | подбор мастера по запросу, рейтинги | контент, вдохновляющие кейсы, цены реальных работ |
| **Я.Услуги** | каталог | базовый поиск мастера | то же что Профи + слабая контентная часть |
| **«Мы» (Честные мастера)** | **полная воронка** | **реальные кейсы + цены + cross-city + заявка → местный мастер + AI-дизайн (план §17)** | — |

#### Что заимствуем у Лови Инсайт (best practice)

1. **Многоосевая таксономия** — фильтры по цвету / текстуре / комнате / стилю / зданию / материалу / размеру. Уже включены в нашу §11.11.3 (расширили до 7 осей).

2. **Хэштеги-теги.** `#маленькие_ванные`, `#санузлы_в_современном_стиле`, `#светло-серый` — отдельные SEO-страницы из композитных тегов. Низкая стоимость генерации, идеально для long-tail. Реализуем как `/idei/tag/{tag-slug}` с автоматической агрегацией.

3. **Pinterest-style masonry layout** в фиде идей. Колонки 2 (mobile) / 3 (tablet) / 4 (desktop), карточки переменной высоты, lazy-load с IntersectionObserver. Удержание/scroll-engagement выше grid-layout на 30-40%.

4. **Видео-контент** (рум-туры от мастеров) — наша масштабируемая версия их студийных съёмок. Мобильное видео 30-60 сек обхода готового ремонта от исполнителя. Дешёвый и аутентичный. Запускаем когда наберём 1000+ кейсов и решим что мастера готовы снимать.

5. **Подкасты для E-E-A-T.** «Личный бренд мастера», «Как ремонтировать кухню под ключ», диалоги мастер+оператор. Долгосрочная инвестиция в авторитет, V3+.

#### Что НЕ заимствуем

1. **Дизайнер как первичная сущность.** У Лови Инсайт дизайнер — звезда, у нас первичный класс — мастер-исполнитель (см. §11.12 — дизайнеры добавляются как вторая сущность позже).

2. **Студийные фотосессии.** Слишком дорого и не масштабируется. Наша ставка — массовое УГК с телефона.

3. **Монетизация через продажу товаров.** Они продают плитку и сантехнику, мы — комиссию с реализованных работ. Разные модели оптимизации контента.

4. **Дизайн-проекты как 3D-визуализации.** Концепты без воплощения вызывают меньше доверия. Наша ставка — **«было-стало»** с подтверждённой ценой.

#### Наш USP — три кита

> **Реально выполненный ремонт + Проверенная цена + Мастер для воплощения в любом городе.**

Никто не комбинирует все три. Это и есть стратегический gap.

#### Возможность партнёрства (V2/V3)

Не конкуренция, а симбиоз. У Сантехника-Онлайн:
- 10k+ контента
- Бренд и доверие
- Команда производства

У нас:
- Воронка и местный routing
- Транзакционная модель (комиссия с работ)
- 100k мастеров (через год)

Сценарий партнёрства:
- Мы интегрируем их каталог идей → добавляем кнопку «Хочу такое же — найти мастера в моём городе» → лид
- Revenue share: % с конверсии в сделку
- Они продолжают монетизироваться сантехникой, мы — работой
- Не каннибалим друг друга, **дополняем**

Условие переговоров: войти в нишу самостоятельным сильным игроком (≥500 кейсов, ≥100 заявок/месяц). До этого момента партнёрство невозможно по позиционированию.

---


## 11.12 Дизайнеры как отдельный класс пользователей (V2+)

> **Дополнение к §11.7, §11.10 и §11.11.** Описывает добавление **дизайнеров** в платформу как **второго первичного класса** наряду с мастерами-исполнителями. Цель — расширить контент-актив (дизайн-проекты как дополнение к выполненным работам) и достроить воронку «дизайн → мастер для воплощения».

### 11.12.1. Концепция

Сегодняшняя платформа: **мастер** = публикует выполненный ремонт + получает заявки на работу.

V2-расширение: добавляем **дизайнера** как отдельную сущность:
- Публикует **дизайн-проекты** (3D-визуализации, чертежи, концепции)
- Получает заявки на **разработку дизайн-проекта**
- Связан с мастерами через «Воплотить этот проект» — дизайнер передаёт лид мастеру и получает % с реализации
- Имеет публичную страницу `/designer/{slug}` (отдельный URL-неймспейс от мастеров)

Это **продолжение воронки**, а не замена:

```
Идея/тренд (Pinterest, /idei)
   ↓
Дизайн-проект (дизайнер) ← V2
   ↓
Воплощение проекта (мастер) ← V1 (текущее)
   ↓
Заявка → Сделка → Комиссия
```

### 11.12.2. Зачем нужны дизайнеры на платформе

1. **Расширение контент-актива.** Дизайн-проекты приносят отдельный класс контента: 3D-визуализации, мудборды, чертежи. Сильны для image search.

2. **Прогрев аудитории «холодных» юзеров.** Юзер, который ещё не знает что хочет ремонт → видит красивый дизайн-проект → загорается → хочет воплотить → лид мастеру. Воронка длиннее, но конверсия выше.

3. **Дополнительный канал лидов.** Дизайнер привлекает заказчиков → передаёт лид мастеру → получает revenue share. Мы агрегируем больше сделок.

4. **Конкуренция с Лови Инсайт / INMYROOM.** Они закрывают только дизайн. Мы добавляем дизайн + воплощение.

### 11.12.3. Архитектурные решения

**Отдельный класс сущности**, не подкласс мастера. Причина: дизайнер ≠ мастер. У дизайнера:
- Другой workflow (создаёт проект → согласовывает с заказчиком → передаёт мастеру)
- Другие материалы (3D-рендеры, чертежи, спецификации, мудборды)
- Другая монетизация (фикс-цена за проект ИЛИ % с реализации мастером)
- Другой стиль публикации контента (студия дизайна, бюро, индивидуальный дизайнер)

**Новые таблицы:**

```sql
-- designers — отдельная от masters
CREATE TABLE designers (
  id              serial PRIMARY KEY,
  alias           varchar(150) NOT NULL,
  slug            varchar(150) UNIQUE NOT NULL,
  city_id         integer REFERENCES cities(id),
  cities_served   integer[] DEFAULT '{}',  -- дизайнеры часто работают удалённо
  is_studio       boolean DEFAULT false,    -- студия / индивидуал
  bio             text,
  avatar_url      text,
  rating          numeric(3,2),
  reviews_count   integer DEFAULT 0,
  is_published    boolean DEFAULT false,
  is_verified     boolean DEFAULT false,    -- проверка портфолио оператором
  -- ...prices, contacts, social...
  created_at      timestamp DEFAULT now()
);

-- designer_projects — дизайн-проекты (аналог master_portfolio для мастеров)
CREATE TABLE designer_projects (
  id              serial PRIMARY KEY,
  designer_id     integer REFERENCES designers(id) ON DELETE CASCADE,
  slug            varchar(180) UNIQUE NOT NULL,
  title           varchar(150) NOT NULL,
  description     text NOT NULL,
  -- Контент-таксономия (общая с мастер-кейсами):
  service_type_id integer REFERENCES service_types(id),
  city_id         integer REFERENCES cities(id),  -- где проект (если воплощён) или null
  room_type       varchar(50),
  style_tags      text[] DEFAULT '{}',
  building_type   varchar(50),
  color_palette   varchar(50),
  -- Материалы/визуализация:
  visualization_photos  text[] DEFAULT '{}',  -- 3D-рендеры
  drawing_photos        text[] DEFAULT '{}',  -- чертежи / планировки (опционально)
  moodboard_photos      text[] DEFAULT '{}',  -- мудборд (опционально)
  realized_photos       text[] DEFAULT '{}',  -- фото реализации (если проект воплощён)
  -- Метрики:
  area_sqm        numeric(10,2),
  estimated_cost  numeric(12,2),               -- предполагаемая стоимость воплощения
  duration_days   integer,
  -- Связь с мастером (если проект воплощён):
  realized_by_master_id  integer REFERENCES masters(id) NULL,
  realized_at            timestamp,
  -- Публикация:
  is_published    boolean DEFAULT false,
  status          varchar(20) DEFAULT 'draft',
  view_count      integer DEFAULT 0,
  lead_count      integer DEFAULT 0,
  inspiration_count integer DEFAULT 0,
  created_at      timestamp DEFAULT now(),
  updated_at      timestamp DEFAULT now()
);
```

### 11.12.4. URL-схема

```
/designer                       — каталог дизайнеров (аналог /mastera)
/designer/{slug}                — публичная карточка дизайнера
/proekty                        — фид всех дизайн-проектов (аналог /raboty)
/proekty/{slug}                 — отдельный дизайн-проект
/proekty/{serviceSlug}          — фильтрованный фид
/proekty/{serviceSlug}/{citySlug} — long-tail
```

Всё это **третий и четвёртый** классы SEO-страниц после кейсов мастеров и идей. Они **не каннибалят** друг друга — разный intent:
- `/raboty/[slug]` — реальный выполненный ремонт с фото до/после (commercial intent)
- `/proekty/[slug]` — дизайн-проект (концепция), может быть невоплощённым (informational + commercial intent)
- `/idei/{room}/{style}` — агрегатор идей (informational intent)

### 11.12.4-А. Анатомия публичной страницы дизайнера `/designer/{slug}`

Страница — **профиль студии/индивидуала** + **портфолио** + **CTA на связь**. Структура (заимствуем у Лови Инсайт + адаптируем под нашу транзакционную модель):

```
[Hero блок]
  Аватар студии/дизайнера (или logo)
  Имя / название студии
  Город, на платформе с {год}

  [Бейджи статуса] (горизонтальный ряд)
    💎 Рекомендуем            ← редакторский pick (оператор в CRM ставит)
    📌 Пример                  ← featured кейс месяца
    ✍️ Автор статей           ← публикует в журнале (см. §11.6)
    🏆 Участник премии 2025   ← внешние конкурсы (опц.)
    ✅ Верифицирован           ← оператор проверил портфолио + договор

  [Меta-теги в виде chips]
    📐 от 1500 ₽ за м²        ← минимальная цена за м² проекта
    👷 Своя бригада           ← дизайнер имеет команду исполнителей
    🌐 Работает онлайн и офлайн
    🛒 Подбор товаров          ← помогает с закупкой материалов
    👁 Авторский надзор        ← контролирует процесс реализации
    🏢 {N} реализованных проектов
    ⭐ Рейтинг {X.X} ({N} отзывов)

  [Sticky CTA-блок справа]
    "Понравились работы дизайнера?"
    "Обсудите с ним свой проект"
    [Связаться →]              ← открывает форму заявки

[Bio / описание дизайнера] (если заполнено)
[Pinterest-style masonry grid его проектов]
[Отзывы клиентов]
[Связанные дизайнеры в этом стиле / городе]
```

**Все бейджи и метаданные — структурированные поля в БД**, не свободный текст. Это позволяет фильтровать в каталоге `/designer` и автоматически попадать в лонг-тейл SEO (например `/designer?has_brigade=true&city=moscow`).

Расширение схемы `designers`:

```sql
-- Добавляем в таблицу designers:
price_per_sqm_from   numeric(10,2),                  -- "от 1500 ₽/м²"
has_own_brigade      boolean DEFAULT false,           -- "Своя бригада"
works_remote         boolean DEFAULT true,            -- "Работает онлайн"
works_onsite         boolean DEFAULT true,            -- "Работает офлайн"
materials_sourcing   boolean DEFAULT false,           -- "Подбор товаров"
author_supervision   boolean DEFAULT false,           -- "Авторский надзор"
is_recommended       boolean DEFAULT false,           -- редакторский pick
is_featured          boolean DEFAULT false,           -- featured месяца
is_journal_author    boolean DEFAULT false,           -- автоматически true если опубликовал статью в §11.6
external_awards      jsonb,                           -- [{name, year, url}]
```

CRM `/crm/designers/{id}` — оператор управляет бейджами, верификацией, featured-статусом, видит метрики.

### 11.12.5. Воронка «дизайн-проект → мастер для воплощения»

На странице дизайн-проекта `/proekty/{slug}` блок:

```
┌──────────────────────────────────────────────┐
│ Хотите воплотить этот проект?                │
│                                              │
│ Найдём мастера в Москве, который сделает     │
│ ремонт по этому проекту. Дизайнер получит    │
│ авторский надзор.                            │
│                                              │
│ [Оставить заявку →]                          │
└──────────────────────────────────────────────┘
```

Алгоритм:
1. Юзер кликает «Оставить заявку»
2. Лид создаётся со ссылкой на проект (`source_project_id`)
3. Routing по тегам проекта: матчим мастеров в городе юзера со совпадением style_tags + room_type
4. Лид рассылается топ-N мастерам
5. Дизайнер получает уведомление «Ваш проект приведёт к сделке»
6. При завершении сделки — дизайнер получает % (например 5-10% от commission, обсуждаемо)

### 11.12.6. Связь дизайнер ↔ мастер

Два сценария:

**Сценарий A: «Я дизайнер, у меня есть мастер-партнёр».**
Дизайнер на платформе указывает доверенных мастеров. На странице дизайн-проекта они показываются как «Мастера, которых рекомендует автор проекта». Лид сначала идёт им (приоритет 30 минут), при отказе → broadcast.

**Сценарий B: «Дизайнер без мастера».**
Лид рассылается стандартным алгоритмом (топ-мастера в городе с матчем по тегам). Дизайнер всё равно получает % (revenue share), но без приоритета конкретному мастеру.

### 11.12.7. Onboarding дизайнера

Отдельный лендинг `/dlya-dizajnerov` (по аналогии с лендингом мастеров `/masteram`):

**Хero блок:**
- H1: «Отличное место для вашего портфолио»
- Подзаголовок: «Разместите свои проекты на «Честных мастерах» и получайте заявки на разработку дизайна и воплощение в реальном ремонте»

**Trust-блок (цифры):**
- «N+ заказчиков ежемесячно ищут дизайнера»  ← счётчик из metrika, обновляется
- «N+ мастеров готовы воплотить ваш проект»
- «Средняя выплата revenue share с реализации: X тыс ₽»

**Преимущества (3-4 блока):**
1. **Готовая воронка** — заказчики приходят из Яндекса по запросам типа «дизайн квартиры» и сразу видят ваше портфолио
2. **Воплощение проекта в любом городе** — наша сеть мастеров реализует ваш проект там, где живёт заказчик
3. **Revenue share с реализации** — помимо фикса за проект получаете % с работы мастера (5-10%)
4. **Авторский надзор** — мы платим бонус за супервизию воплощения

**Кнопка**: `[Разместить портфолио →]` — ведёт на форму регистрации дизайнера

**Сравнение Лови Инсайт (Сантехника-Онлайн)**:
| | Лови Инсайт | Мы |
|---|---|---|
| Что предлагает | размещение портфолио + ссылка на каталог сантехники | размещение + revenue share с реализации |
| Монетизация для дизайнера | косвенно (через известность) | прямой % с реализации проекта |
| Где живёт ваш клиент | где угодно — но мастера ищет сам | где угодно — мастер из нашей сети |
| Авторский надзор | вне платформы | оплачиваемый бонус |

UX:
- Простая регистрация: email/телефон → код → имя → город → загрузить 3-5 примеров → publish
- В первые 6 месяцев — **0% комиссии** с дизайн-сделок (стимул для приёма)
- Onboarding-чек-лист с прогрессом в дашборде (как у мастеров, см. §11.9.4)

### 11.12.8. Master-pwa и Designer-pwa

Дизайнерам — отдельный кабинет (`designer-pwa` или интегрированный в master-pwa с переключателем роли). UI похожий на master-pwa, но:
- Сверху не «заказы», а «проекты»
- Дашборд показывает: опубликованные проекты, view_count, lead_count, inspiration_count, % завершённых сделок
- Возможность связать профиль с мастером-партнёром

### 11.12.9. Что не делаем в V2

- **Не объединяем** designers и masters в одну таблицу. Они принципиально разные.
- **Не добавляем** дизайнерам полноценный кабинет ремонтных задач (как у мастеров) — это другой workflow.
- **Не делаем** marketplace дизайн-услуг (биржу проектов). Дизайнер на платформе = публикатор контента + получатель лидов на воплощение, не «купи проект за 50к».

### 11.12.10. Метрики успеха

V2 (через 6 месяцев после запуска):
- ≥100 опубликованных дизайнеров
- ≥500 опубликованных дизайн-проектов
- ≥20 заявок «воплотить проект» в месяц
- ≥10 успешных сделок дизайнер→мастер с revenue share

V3 (через 12 месяцев):
- ≥500 дизайнеров
- ≥3000 проектов
- ≥30% всех лидов проходят через дизайн-проекты
- Парсинг/синхронизация с Behance / Pinterest для импорта проектов (опц.)

### 11.12.11. Связь с другими секциями плана

- **§11.7 (кейсы мастеров)** — параллельный класс, не пересекается. Кейс = выполненный ремонт. Проект = концепция (может быть воплощённой).
- **§11.10 (cross-city)** — та же логика для дизайн-проектов. Москвич видит проект из Краснодара → лид в Москву.
- **§11.11 (Идеи)** — дизайн-проекты добавляются в `/idei/{room}/{style}` рядом с реальными ремонтами. На карточке бейдж «Дизайн-проект» / «Реализованный ремонт» для прозрачности.
- **§17 (AI-дизайнер)** — AI-дизайны и дизайнерские проекты разные сущности. AI = автоматическая генерация по фото комнаты юзера. Дизайнер = ручная работа специалиста. Могут работать в одной воронке.

---


## 11.13 Видео-контент: рум-туры, видео-кейсы, видео-инструкции

> **Дополнение к §11.7, §11.11, §11.12.** Описывает **видео как первоклассную сущность** контент-актива. Лови Инсайт показывает что рум-туры (видео-обходы интерьеров) — один из самых вовлекающих форматов в нише ремонта. Мы добавляем видео в три точки: к кейсам, дизайн-проектам и образовательным материалам. Преимущество перед Лови Инсайт: их видео — дорогие студийные съёмки, наше — массовое мобильное (УГК), что масштабируется.

### 11.13.1. Концепция

Текстовое описание + фото — стандарт V1. Видео — **next layer** контент-актива, дающий:

1. **Engagement signals для Яндекса.** Видео на странице → рост dwell time → буст в ранжировании. Yandex.Видео — отдельная воронка трафика.
2. **Доверие.** Видео-обход реального ремонта на 5x убедительнее статичных фото. «Вот как это выглядит в жизни» — самый сильный аргумент для лида.
3. **Виральность в соцсетях.** TikTok / Reels / Shorts работают на ремонте — массовая аудитория. Один кейс мастера может быть пересчитан тысячами просмотров.
4. **Расширение auidence.** Часть юзеров не читает текст, только смотрит видео. Без видео мы их теряем.

### 11.13.2. Три формата видео-контента

#### Формат 1: Рум-тур (видео-обход выполненного ремонта)

- **Что**: 30-90 сек видео обхода готового ремонта на телефон
- **Кто снимает**: мастер сам после завершения работы
- **Где привязано**: к `master_portfolio` (выполненный кейс) и `designer_projects` (если воплощён)
- **Стиль**: вертикальное (9:16) для соцсетей + горизонтальное (16:9) для главной страницы кейса
- **Сценарий**: «Зашли через дверь → прихожая → ванная → кухня → гостиная → закрытие». Ничего постановочного, естественный обход.
- **Аналог у Лови Инсайт**: их рум-туры (брутальный минимализм 48м², уютный интерьер в доме 1910 года, и т.д.). Только у них дорогие студийные съёмки от профессиональных операторов, у нас — массовый УГК.

#### Формат 2: Видео-кейс «было-стало»

- **Что**: 15-30 сек short-видео с трансформацией (плавный переход «до → после»)
- **Кто снимает**: мастер делает фото до, фото после, мы автоматически собираем видео из них (Ken Burns эффект + crossfade)
- **Где привязано**: к каждому кейсу с фото before/after
- **Стиль**: только вертикальное 9:16, оптимизировано под TikTok/Reels/Shorts
- **Автогенерация**: backend-сервис на ffmpeg делает видео из фото без участия мастера. Просто «Опубликовать кейс с before+after» → видео генерится в фоне → доступно через 30-60 сек.

#### Формат 3: Видео-инструкции / советы (V3+)

- **Что**: 1-3 минут видео мастера, объясняющего как делать что-то («Как класть плитку в маленькой ванной», «Какой выровнять пол»)
- **Кто снимает**: топ-мастера-авторы (бейдж «Автор статей» в их профиле)
- **Где привязано**: к статьям блога §11.6 + к страницам услуг
- **Монетизация**: автору-мастеру — приоритет в диспетчере (как и за статьи)
- **Аналог у Лови Инсайт**: их подкасты «Личный бренд дизайнера» и т.д., но видео-формат сильнее

### 11.13.3. Архитектура хранения видео

**Хостинг видео** — самая дорогая часть. Варианты:

**Вариант A: Yandex.Disk / Yandex.Cloud Object Storage** ✅ рекомендую
- Дешёвый (от 1 ₽/ГБ/мес)
- Российская инфра, без VPN-проблем
- Стрим через CDN Yandex.Cloud (50 ₽/ТБ трафика)
- Адаптивный битрейт (HLS) генерируется через Media Convert API

**Вариант B: VK Видео (как partner)**
- Бесплатный хостинг
- Виральность через VK
- Минус: видео-плеер встраивается через iframe, не наш контроль над дизайном

**Вариант C: YouTube embed**
- Бесплатно
- Виральность через Google
- Минус: блокировки в РФ, медленная загрузка для российских юзеров

**Вариант D: собственный плеер на R2 + Cloudflare Stream**
- Дорого (~$5/1000 minute viewed)
- Полный контроль
- Минус: высокие операционные расходы при росте

Рекомендация V1 (когда запустим видео): **Yandex.Cloud Object Storage + HLS** для основного контента, **дублирование на VK Видео** для виральности. YouTube — позже как backup.

**Расширение схемы:**

```sql
-- Новая таблица для видео:
CREATE TABLE master_portfolio_videos (
  id              serial PRIMARY KEY,
  portfolio_id    integer REFERENCES master_portfolio(id) ON DELETE CASCADE,
  type            varchar(20) NOT NULL,  -- room_tour | before_after | instruction
  source          varchar(50),           -- yandex_cloud / vk_video / youtube / generated
  source_url      text NOT NULL,         -- URL видео (HLS playlist или iframe src)
  duration_sec    integer,
  poster_url      text,                  -- preview frame для thumbnails
  width           integer,
  height          integer,
  is_vertical     boolean DEFAULT false,  -- 9:16 для соцсетей
  view_count      integer DEFAULT 0,
  is_published    boolean DEFAULT false,
  uploaded_at     timestamp DEFAULT now()
);
```

### 11.13.4. UX: где показывать видео

**На странице кейса `/raboty/{slug}`:**
- Видео-плеер встраивается **в Hero-блок** заменяя cover-фото (если есть рум-тур)
- Auto-play muted при попадании в viewport (как Pinterest)
- Click → открывает full-screen с sound on
- Под Hero — кнопка «Смотреть в полный экран»

**В фиде `/raboty` и `/idei`:**
- Видео-карточки в masonry grid имеют значок ▶ в углу
- На hover/long-press — auto-play preview (3-5 сек)
- Click → переход на страницу кейса с открытым видео

**На главной:**
- Отдельный блок «Свежие рум-туры» — горизонтальный scroll-rail с 6-8 видео-карточками

### 11.13.5. Yandex.Видео и SEO

Yandex.Видео — отдельная вертикаль поиска. Ранжирует по:
- Title видео (наш `title` кейса + «обход / рум-тур»)
- Description (текст рядом с видео)
- Schema.org `VideoObject` JSON-LD
- Длительность, разрешение, formats доступные
- Engagement (просмотры, time-on-page)

JSON-LD на странице с видео:
```jsonld
{
  "@context": "https://schema.org",
  "@type": "VideoObject",
  "name": "Рум-тур: Ремонт кухни 12 м² в Краснодаре",
  "description": "Обход готовой кухни в стиле минимализм после ремонта мастером Иваном Петровым",
  "thumbnailUrl": "...",
  "uploadDate": "2026-06-...",
  "duration": "PT45S",
  "contentUrl": "...",
  "embedUrl": "..."
}
```

Sitemap дополняется video-sub-sitemap (`/sitemap-videos.xml`) с правильным `<video:video>` namespace.

### 11.13.6. Стимулы для мастеров снимать видео

Видео — это extra-effort для мастера. Без сильной мотивации они не будут снимать. Стимулы:

1. **Бейдж «Видеомастер»** — мастер с 5+ видео получает бейдж в карточке + boost в каталоге
2. **Priority в диспетчере** — +10% к priority score (аналог §11.9.5 для текстовых кейсов)
3. **Первые 50 рум-туров** — бонус 2-5 тыс ₽ (стимул для tier-1 авторов, разовая инвестиция)
4. **Прозрачные метрики** — в дашборде «Ваше видео посмотрели X раз → Y лидов»
5. **Авто-генерация before/after** — без участия мастера. Просто загружает фото — видео генерится. Минимальный effort.

Аналог Лови Инсайт у нас:
> «У них дорогая студийная съёмка → 7 рум-туров за год. У нас массовый УГК → 100+ рум-туров в первый месяц.»

### 11.13.7. Технологии генерации before/after видео

Backend-сервис `lib/videoGenerator.ts`:
- Принимает массивы `beforePhotos[]` и `afterPhotos[]`
- Через `ffmpeg` (через `fluent-ffmpeg` Node-обёртку) делает:
  - Resize всех фото в 1080×1920 (9:16)
  - Ken Burns эффект на каждом кадре (slow zoom)
  - Crossfade переходы между фото (1 сек)
  - Опционально: текст-оверлей «До → После», метаданные (цена, срок, площадь)
  - Генерирует MP4 + HLS variants
- Загружает в Yandex.Cloud Object Storage
- Создаёт запись в `master_portfolio_videos` со ссылкой
- Время генерации: 30-90 сек на кейс

**Стоимость**: на Railway worker — почти бесплатно (CPU-bound, ffmpeg). Хранение — ~50 МБ/видео × 5000 кейсов × 1 ₽/ГБ = ~250 ₽/мес.

Запускаем как фоновую задачу (cron или event-driven) после публикации кейса с фото before+after.

### 11.13.8. Интеграция с TikTok / Reels / Shorts

**V3 фаза** — автопостинг сгенерированных видео в соцсети:
- API VK Видео / Reels / TikTok For Business / YouTube Shorts
- При публикации кейса с видео → автоматический cross-post в соцсети с тегами и ссылкой на наш сайт
- Каждый просмотр → backlink к нам → прямой трафик
- Yandex/Google ранжируют сайты с социальной активностью выше

В V1.5 — только **easy share buttons** в редакторе кейса: «Поделиться видео в Telegram / VK / WhatsApp».

### 11.13.9. Метрики успеха

V1.5 (через 2 месяца после запуска видео):
- ≥10% всех опубликованных кейсов имеют рум-тур или before/after видео
- Среднее dwell time на странице с видео ≥ 2 минут (vs 45 сек без)
- Yandex.Видео показывает 5+ наших видео в выдаче по запросам «ремонт {room} {city}»

V2 (через 6 месяцев):
- ≥40% кейсов с видео
- 100+ рум-туров от мастеров
- 1000+ автогенерённых before/after видео
- 1+ виральное видео (>100k просмотров) в соцсетях

V3 (через 12 месяцев):
- 90%+ кейсов с автогенерённым before/after
- 500+ рум-туров от мастеров (топ-авторы)
- Yandex.Видео — отдельный ощутимый source трафика (≥10% всех заходов)

### 11.13.10. Связь с другими секциями плана

- **§11.7 (кейсы мастеров)** — видео добавляется как **дополнительный** контент кейса. Не обязательно. Кейс без видео остаётся валидным.
- **§11.9 (motivation)** — стимулы для видео часть общей мотивационной логики мастера. Бейдж «Видеомастер», boost в priority.
- **§11.11 (Каталог Идей)** — видео-карточки в masonry с auto-play preview на hover. Engagement multiplier.
- **§11.12 (дизайнеры)** — рум-туры воплощённых дизайн-проектов = двойной актив (контент дизайнера + кейс мастера).
- **§17 (AI-дизайнер)** — в будущем AI может генерировать концептуальные видео-туры по фото комнаты юзера. Большая будущая фича.

### 11.13.11. Что НЕ делаем в V1

- **Не запускаем видео-функцию в первом релизе.** Сначала набираем 100+ кейсов с фото, потом включаем видео. Иначе фокус размывается.
- **Не делаем live-стримы.** Это другая инфра (RTMP, low-latency), не нужно для нашего use-case.
- **Не делаем платные видео-курсы** мастерам/дизайнерам. Это marketplace другого типа, сильно отвлекает.
- **Не пытаемся** заменить YouTube/TikTok. Мы — площадка для **специализированного** контента (ремонт + кейсы), не общая видео-сеть.

---


## 12. Sitemap / robots / redirects

### Sitemap

Используем нативный `app/sitemap.ts` Next.js. Если общий sitemap станет > 50000 URL — разбиваем на sub-sitemaps.

**Структура**:

```
chestnye-mastera.ru/sitemap.xml          ← sitemap index (ссылается на остальные)
chestnye-mastera.ru/sitemap-static.xml   ← главные статические страницы (5-10 URL)
chestnye-mastera.ru/sitemap-services.xml ← все /uslugi/[slug] (50-200 URL)
chestnye-mastera.ru/sitemap-cities.xml   ← все города (если будет страница /goroda)
chestnye-mastera.ru/sitemap-service-city.xml ← /[serviceSlug]/[citySlug] (~10000 URL для топ-комбинаций)
chestnye-mastera.ru/sitemap-pricing.xml  ← /ceny/[slug] (~10000 URL)
chestnye-mastera.ru/sitemap-masters.xml  ← /master/[slug] (только опубликованные)
chestnye-mastera.ru/sitemap-raboty.xml   ← /raboty/[slug] (опубликованные кейсы) + /raboty/[serviceSlug] + /raboty/[serviceSlug]/[citySlug]
chestnye-mastera.ru/sitemap-designs.xml  ← /dizajn/[slug] (фаза 8)
```

Для каждого URL:
- `<loc>` — абсолютный URL.
- `<lastmod>` — `published_at` или `updated_at`.
- `<changefreq>` — `weekly` для каталогов, `monthly` для статичных.
- `<priority>` — 1.0 для главной, 0.9 для каталогов услуг/мастеров, 0.7 для карточек.

Sub-sitemap'ы лимит — 50000 URL и 50MB. Если перевалим, бьём по городам/категориям.

**Кеширование**: sitemap-страницы не статические в ISR (потому что Next.js кеширует sitemap отдельно). Можно использовать `revalidate: 3600` или явный кеш на edge.

### Robots.txt

Динамический через `app/robots.ts`:

```
User-agent: *
Allow: /

Disallow: /api/
Disallow: /search?
Disallow: /zayavka/spasibo
Disallow: /*?utm_*
Disallow: /*?yclid=
Disallow: /*?gclid=
Disallow: /*?_yo*

# Yandex specific
User-agent: Yandex
Disallow: /api/
Disallow: /search?
Allow: /
Clean-param: utm_source&utm_medium&utm_campaign&utm_term&utm_content&yclid&gclid /

Sitemap: https://chestnye-mastera.ru/sitemap.xml
Host: chestnye-mastera.ru
```

`Clean-param` — Yandex-специфичная директива, схлопывает дубли с UTM в один canonical. Очень полезна.

### Redirects (Next.js middleware на edge)

**Реализация в `artifacts/marketplace/middleware.ts`** (Edge runtime, мгновенный):

```
1. Извлекаем host из request.headers.get('host')
2. Сравниваем с MARKETPLACE_CANONICAL_HOST
3. Если host НЕ canonical (например, www.chestnye-mastera.ru, честные-мастера.рф, www.честные-мастера.рф, punycode-вариант):
   → return NextResponse.redirect(new URL(request.url, `https://${MARKETPLACE_CANONICAL_HOST}${pathname}${search}`), 301)
4. Если canonical — пропускаем дальше
```

**Дополнительные редиректы** через `next.config.js`:

```js
async redirects() {
  return [
    // Старая ссылка на мастера (если переименовали slug) — обрабатывается через seo_redirects table в middleware, не здесь
    // Англоязычные алиасы для ссылок в рекламе
    { source: '/become-master', destination: 'https://sfera-master.ru/masteram', permanent: true },
    { source: '/for-masters', destination: 'https://sfera-master.ru/masteram', permanent: true },
    // Обратная совместимость старых URL с sfera-master.ru (если решим часть SEO-страниц перевести)
    { source: '/masters', destination: '/mastera', permanent: true },
  ];
}
```

**Из `seo_redirects` table** (в middleware.ts):

```
1. Кешируем `seo_redirects` в памяти на 60 сек.
2. Для каждого incoming запроса проверяем from_path === pathname.
3. Если есть match → redirect на to_path с указанным status_code.
```

**На стороне sfera-master.ru** (Express middleware в `app.ts`) — добавляем:

```
GET /masters       → 301 https://chestnye-mastera.ru/mastera   (главный каталог теперь на маркетплейсе)
GET /masters/*     → 301 https://chestnye-mastera.ru/mastera   (если кто-то по старым ссылкам зайдёт)
GET /master-landing/v3/honest → оставляем как было (это для набора мастеров)
```

И **новый короткий alias** `/masteram`:
```
GET /masteram → отдаёт master-landing/dist/public/v3/honest/index.html (тот же лендинг, новый URL)
```

### Canonical policy

| Случай | Canonical |
|---|---|
| Стандартная страница `/master/ivan-petrov` | `https://chestnye-mastera.ru/master/ivan-petrov` |
| Страница с пагинацией `/mastera?page=2` | `https://chestnye-mastera.ru/mastera?page=2` (себя на себя; страница 2 — это другая страница) |
| Страница с UTM `/santehnik/krasnodar?utm_source=ya` | `https://chestnye-mastera.ru/santehnik/krasnodar` (canonical без UTM) |
| Страница с фильтрами `/mastera?service=santehnika` | `https://chestnye-mastera.ru/mastera` (canonical на /mastera) — но **`<meta robots="noindex">`**, потому что отфильтрованный список — не уникальный контент |
| Дубль через alias-домен `честные-мастера.рф/...` | страница не открывается там вообще — 301 редирект на canonical-домен |

### Пагинация и `noindex`

- Каталоги `/mastera`, `/uslugi`, `/{service}/{city}` с пагинацией используют `?page=N`.
- На странице 2+ — `<meta name="robots" content="noindex, follow">`. Дубли в индексе не нужны, но поисковик идёт по ссылкам в карточки мастеров (`follow`).
- В `<head>` — `<link rel="prev" href="...?page=1">` + `<link rel="next" href="...?page=3">`.
- Canonical на странице 2+ указывает **на саму страницу** (`...?page=2`), не на page=1 — иначе теряется индексация глубоких страниц.
- Sitemap включает только page=1 каждой пагинации (deeper pages не как самостоятельные URL).

`X-Robots-Tag: noindex` дополнительно ставится HTTP-заголовком на:
- `/api/*` (любые JSON-эндпоинты)
- `/zayavka/spasibo`
- любые URL с `?` после прохождения Clean-param на стороне Яндекса (для подстраховки)

### Кастомная 404

Реализуется через `app/not-found.tsx` (см. также секцию 6 V1 release-blockers):
- HTTP **404** (не 200 — критично, иначе поисковик индексирует пустую страницу).
- `<title>Страница не найдена — Честные мастера</title>`.
- Контент: краткое сообщение + ссылки на главную, каталог услуг, каталог мастеров, поиск.
- `<meta name="robots" content="noindex, follow">`.

### Что проверять перед релизом (smoke checklist)

- ☐ `curl -I https://chestnye-mastera.ru/robots.txt` отдаёт 200, тело содержит `Sitemap:` строку и `Host: chestnye-mastera.ru`.
- ☐ `curl -I https://честные-мастера.рф/robots.txt` отдаёт 301 на canonical-хост (либо `Disallow: /` если редирект ставится на уровне страницы, не сервера).
- ☐ `curl -I https://www.chestnye-mastera.ru/master/ivan-petrov` → 301 на `https://chestnye-mastera.ru/master/ivan-petrov`.
- ☐ `curl https://chestnye-mastera.ru/sitemap.xml | xmllint --noout -` парсится без ошибок, размер < 10 МБ.
- ☐ Каждый sub-sitemap (`/sitemap-masters.xml`, `/sitemap-service-city.xml`) парсится отдельно, < 50 000 URL, < 50 МБ.
- ☐ Yandex Webmaster: «sitemap обработан, ошибок 0».
- ☐ Google Search Console: «sitemap submitted, discovered N URLs».
- ☐ Случайный несуществующий URL `https://chestnye-mastera.ru/aslfkj` отдаёт 404 (не 200).
- ☐ `<link rel="canonical">` на 5 случайных страницах указывает на абсолютный URL canonical-хоста.
- ☐ JSON-LD на `/master/[slug]`, `/[service]/[city]`, `/uslugi/[slug]` валиден (https://search.google.com/test/rich-results, https://webmaster.yandex.ru/tools/microtest/).
- ☐ Yandex Webmaster → раздел «Скорость» → mobile LCP < 2.5s, CLS < 0.1.

---

## 13. Безопасность и приватность

### Что нельзя отдавать публично (whitelist DTO в API)

См. секцию 7 — таблица «Что НЕЛЬЗЯ публиковать».

Принцип: **api-server возвращает только whitelisted поля**. Никакого `SELECT *` для marketplace endpoints. Каждое поле в DTO — явное.

### Скрытие телефонов

- **Телефон мастера** — никогда не публикуется на маркетплейсе. Контакт с мастером происходит **только через заявку**: клиент → форма → `leads` → CRM → оператор/диспетчер → мастер берёт в работу → мастер связывается с клиентом по телефону клиента.
- **Телефон клиента** — никогда не показывается на публичной странице. Виден только в CRM (для оператора) и в PWA мастера (после assign).
- **Email** — пока не используем для контактов.

### Защита формы заявки (детально)

| Слой | Защита | Что блокирует |
|---|---|---|
| 1 (UX) | Обязательный чекбокс «Согласен на обработку ПДн» | юридическое требование 152-ФЗ |
| 2 (UX) | Минимальное время заполнения 2 секунды (hidden timestamp) | примитивные боты |
| 3 (UX) | Honeypot field `<input name="website">` | боты, заполняющие все поля |
| 4 (Captcha) | Yandex SmartCaptcha (server-side validation) | ботов |
| 5 (Origin) | Проверка `Origin` / `Referer` headers | CSRF от чужих сайтов |
| 6 (CSRF) | CSRF-token в hidden field | CSRF |
| 7 (Rate limit) | Next.js: 5 req/min/IP, 1 req/30s/IP, 1 req/5min/phone | flooding |
| 8 (Rate limit) | api-server: 20 req/min/IP, 1 req/5min/phone | defence-in-depth |
| 9 (Validation) | zod-схема: name 2-100 chars, phone russian E.164, comment ≤2000 chars | мусор |
| 10 (Dedup) | проверка существующего лида с тем же phone за 30 дней | повторные заявки |
| 11 (Logging) | IP, UA, referrer, captcha_score → leads | аудит |
| 12 (Alerts) | если IP делает >50 заявок за час — alert админу + временный ban | DDoS |

### Согласие на обработку ПДн (152-ФЗ)

Обязательно:

1. **Чекбокс** перед submit формы:
   ```
   ☐ Я согласен(на) на обработку персональных данных в соответствии с
     [Политикой конфиденциальности](https://chestnye-mastera.ru/policy/privacy)
     и [Соглашением](https://chestnye-mastera.ru/policy/terms)
   ```
2. Чекбокс **не предзаполнен**.
3. Submit заблокирован, если не отмечен.
4. В БД сохраняем `leads.consent_given_at = now()` при успешной заявке.

### Документы (страницы)

Создать в V1:

- `/policy/privacy` — Политика конфиденциальности (юристы готовят, разработчики только верстают). Обязательно: оператор ПДн (ИП Коваленко И.Г., ИНН 262409599800), цели обработки, сроки хранения, права субъекта (доступ, удаление, отзыв согласия), куда писать для удаления.
- `/policy/terms` — Пользовательское соглашение.
- `/policy/cookies` — Политика использования cookies + cookie-banner на первом визите (хотя в РФ это не обязательно по 152-ФЗ, но GDPR-friendly и с Яндекса/Google ок).
- `/o-nas` — про компанию.
- `/kontakty` — контакты для саппорта.

Страницы можно хранить как статичный markdown в `marketplace/content/policy/*.md` и рендерить через MDX.

### Логирование и аудит

В api-server при каждом обращении marketplace:

```
[marketplace-api] action=createLead phone=+79*** city=krasnodar service=santehnika
                  source_page=/santehnik/krasnodar utm_source=ya ip=192.168.1.1
                  captcha_score=0.95 lead_id=12345
```

Логи отправляются в Railway logs + сохраняются в новую таблицу `marketplace_audit_log` (опционально, если нужен длительный аудит):

```
marketplace_audit_log
├── id, action, lead_id, master_slug, ip, user_agent, source_page_url,
├── payload (jsonb), created_at
```

В V1 — только Railway logs (без таблицы), потому что у нас уже есть `leads` где всё это пишется.

### Запрет хардкоженых секретов

Все ключи — в env. Никаких хардкоженных API-токенов в коде, особенно в client components Next.js (там код виден в браузере!). Перед деплоем — обязательная проверка через `git secrets` или `gitleaks`.

---

## 14. Деплой и инфраструктура

### Архитектура деплоя

```
                   ┌──────────────────────────────────────┐
Internet ──────────│ Cloudflare DNS + SSL (опционально)   │
                   └──────────────────────────────────────┘
                              ↓
        ┌─────────────────────┬─────────────────────────┐
        ↓                     ↓                         ↓
   chestnye-mastera.ru   sfera-master.ru        честные-мастера.рф
        ↓                     ↓                         ↓
   ┌──────────┐         ┌──────────┐          (DNS → CNAME на)
   │Railway   │         │Railway   │          chestnye-mastera.ru
   │service:  │         │service:  │
   │marketplace│        │api-server│
   │(Next.js) │         │(Express) │
   └──────────┘         └──────────┘
        ↓                     ↓
        └─────────────────────┘
                  ↓
            ┌──────────┐
            │Railway   │
            │Postgres  │
            └──────────┘
```

### Где деплоить marketplace

**Вариант 1 (рекомендую): Railway, отдельный service в том же project'е**.

- Service `marketplace-prod` (production, ветка `main`).
- Service `marketplace-staging` (staging, ветка `staging`).
- Общий Postgres (тот же `DATABASE_URL`).
- Общие env-переменные.

**Вариант 2 (на будущее): Vercel** — если упрёмся в лимиты Image Optimization на Railway.

### Подключение `chestnye-mastera.ru`

1. **Регистрация домена** у российского регистратора (REG.ru, RU-CENTER, Beget). Технически кириллический `.рф` регистрируется только через российских.
2. **DNS**:
   - Вариант A (рекомендую): **Cloudflare** — в Cloudflare добавляем оба домена (`chestnye-mastera.ru`, `xn----8sbarac1cf6adfgg4d6c.xn--p1ai`), у регистратора меняем NS на Cloudflare. Получаем хороший DNS, free SSL, edge cache, DDoS protection.
   - Вариант B: **Yandex Cloud DNS** — отечественный аналог, но менее удобен.
3. **A-records**:
   ```
   chestnye-mastera.ru          A   <Railway public IP>
   www.chestnye-mastera.ru      CNAME chestnye-mastera.ru
   xn----8sbarac1cf6adfgg4d6c.xn--p1ai     CNAME chestnye-mastera.ru
   www.xn----8sbarac1cf6adfgg4d6c.xn--p1ai CNAME chestnye-mastera.ru
   ```
4. **В Railway** в settings service-а `marketplace-prod` → Domains → Add Custom Domain → добавляем все 4 хоста. Railway автоматически выпустит Let's Encrypt сертификаты.
5. **HSTS** включаем после убеждённости что всё работает (через `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`).

### Подключение `честные-мастера.рф`

Это alias-домен, не требует никакой особой настройки кроме DNS на тот же IP. Все 301-редиректы делает Next.js middleware. **Он будет получать запросы**, но мгновенно отдавать редирект.

**Важно**: SSL-сертификат на кириллический домен Let's Encrypt выпускает через punycode. Railway это понимает, но **обязательно проверить, что сертификат покрывает оба варианта**:
- `xn----8sbarac1cf6adfgg4d6c.xn--p1ai`
- `www.xn----8sbarac1cf6adfgg4d6c.xn--p1ai`

Если Let's Encrypt не справляется — альтернатива через Cloudflare Edge Certificate.

### Env vars

Раздаём в три места:

**Railway service `marketplace-prod`**:
```
NODE_ENV=production
NEXT_PUBLIC_MARKETPLACE_PUBLIC_URL=https://chestnye-mastera.ru
MARKETPLACE_PUBLIC_URL=https://chestnye-mastera.ru
MARKETPLACE_CANONICAL_HOST=chestnye-mastera.ru
MARKETPLACE_ALIAS_HOSTS=честные-мастера.рф,xn----8sbarac1cf6adfgg4d6c.xn--p1ai,www.chestnye-mastera.ru,www.честные-мастера.рф,www.xn----8sbarac1cf6adfgg4d6c.xn--p1ai
INTERNAL_API_BASE_URL=https://sfera-master.ru/api
INTERNAL_API_SHARED_TOKEN=<32+ char>
NEXT_PUBLIC_YANDEX_METRIKA_ID=
NEXT_PUBLIC_YANDEX_SMARTCAPTCHA_SITE_KEY=
YANDEX_SMARTCAPTCHA_SERVER_KEY=
SENTRY_DSN=    # для error tracking
```

**Railway service `api-server` (existing, добавляем)**:
```
MARKETPLACE_PUBLIC_URL=https://chestnye-mastera.ru
MARKETPLACE_INGEST_TOKEN=<тот же token>   # для проверки бэйджа от marketplace
```

И в `getAllowedOrigins()` в `app.ts` — добавляем `https://chestnye-mastera.ru` (на случай legacy-publicendpoint), но marketplace через server-to-server CORS не нужен.

### CI/CD

В V1 — простой setup:

1. **GitHub Actions** (создаём `.github/workflows/ci.yml`):
   ```yaml
   on: [push, pull_request]
   jobs:
     typecheck:
       - pnpm install --frozen-lockfile
       - pnpm typecheck
     test:
       - pnpm --filter @workspace/api-server test
     build:
       - pnpm build
   ```
   Блокировать merge в `main` если что-то упало.

2. **Railway auto-deploy** на push в `main` (для prod) и `staging` (для staging).

3. **Pre-deploy hook**: Railway service `marketplace-prod` запускает миграции Drizzle перед startup. **НО**: миграции — общий `lib/db`, должен запускать **api-server**, а не marketplace. Поэтому миграции запускаются **только на api-server**, marketplace их не трогает.

### Staging environment

Для V1 **обязателен**:

- Отдельный Railway project или environment `staging`.
- Отдельный Postgres (snapshot prod-БД либо чистая БД).
- Отдельный домен `staging.chestnye-mastera.ru` (или `marketplace-staging.up.railway.app`).
- Все интеграции (капча, метрика) — sandbox-keys.
- Пометка «STAGING» в header (`<div>STAGING</div>` если `NODE_ENV !== 'production'`).
- `noindex, nofollow` на всём staging-домене.

Каждая фича — сначала на staging, проходит QA, потом merge в main.

### Backup БД перед миграциями

**Обязательно перед миграцией 0005** (расширение masters/leads + новые таблицы):

1. Railway dashboard → Postgres → Backup → Create snapshot (manual).
2. Или через `pg_dump`:
   ```
   pg_dump $DATABASE_URL > backup-2026-06-13-pre-0005.sql.gz
   ```
3. Хранить минимум 14 дней.
4. Проверить, что snapshot открывается (импорт в test-db).

### Rollback plan

Если миграция 0005 что-то сломает:

1. **Быстрый rollback кода**: в Railway → service `api-server` → Deployments → выбрать предыдущий deployment → Redeploy. ~1 минута.
2. **Откат БД**: миграция написана так, чтобы все новые поля были `NULL` allowed → старый код работает без них. Если же добавили `NOT NULL` колонку — пишем `down`-миграцию (удаление колонки) или восстанавливаем из backup.
3. **Marketplace упал**: домен временно поднимаем на «заглушку» (статичный HTML «технические работы»), при этом sfera-master.ru продолжает работать.
4. **План аварийного восстановления**: документируем в `INCIDENT_RUNBOOK.md`.

### Мониторинг

Минимум для V1:

- **Sentry** — для frontend errors на marketplace (free tier хватит).
- **Railway logs** — для backend.
- **Yandex.Metrika** — конверсии, поведение пользователей, цели «отправил заявку».
- **Yandex.Webmaster** + **Google Search Console** — индексация, ошибки crawl, sitemap status.
- **UptimeRobot** или Cloudflare Health Check — пингует `/api/health` каждые 5 минут.
- **Алёрт в Telegram-бот менеджеров** при 5xx ошибках на marketplace > 1% за 5 минут.

### Российская доступность (CDN / hosting)

> **Проблема.** Маркетплейс хостится на Railway US-West (под капотом GCP).
> Из России без VPN маршрут до GCP-IP периодически ломается из-за фильтрации
> Роскомнадзором. SEO-боты Яндекса/Google всегда смогут зайти, но реальные
> пользователи РФ — не всегда.
>
> Yandex-боты ходят с собственных IP-сетей и обычно не страдают от этой
> фильтрации. Но даже если страница попадает в индекс, **пользователь не
> сможет дойти до неё через клик в выдаче без VPN** — bounce 100%, поведенческие
> убьют ранжирование за 2–3 недели.
>
> Решаем послойно: от дешёвого quick-win к долгосрочной миграции.

#### Текущее состояние (V1)

NS `chestnye-mastera.ru` переведены на Cloudflare для удобства управления DNS,
но **Cloudflare Proxy выключен** (DNS Only, серая тучка). Эмпирически проверено:
с включённым proxy сайт **переставал** открываться из РФ (CF edge IPs
фильтруются Роскомнадзором сильнее, чем прямой Railway-host). Без proxy запросы
резолвятся напрямую в Railway US-West и проходят.

> ⚠️ Урок: CF proxy не universal-fix для российской аудитории. Если домен на CF —
> прежде чем включать «оранжевую тучку», тестировать через `check-host.net`
> из 5+ российских городов **до и после**. Если показатели ухудшаются — оставить
> DNS Only.

Cloudflare всё равно полезен для:
- Управление DNS-записями (быстрее, чем в Reg.ru)
- DNSSEC (включается в одно нажатие)
- DDoS-защита базового уровня (даже без proxy, через rate limit на API)
- Будущая возможность поставить CF Worker для геобалансировки между Railway/RU-CDN

#### Фаза 2: Yandex.Cloud CDN (когда понадобится)

Триггер: когда `check-host.net` начнёт показывать ⚠️ из российских городов или
когда Yandex.Webmaster покажет ухудшение «Скорости загрузки» в РФ.

1. Создать профиль CDN в Yandex.Cloud → origin `chestnye-mastera.up.railway.app`.
2. Привязать домен `cdn.chestnye-mastera.ru` (либо корневой через CNAME flattening) → Yandex CDN.
3. На marketplace: `next.config.js` → `assetPrefix = "https://cdn.chestnye-mastera.ru"` (только для статики). Динамические страницы — пока Railway напрямую.
4. Для динамики: либо включить proxying в Yandex CDN, либо положиться на Railway.

**Эффект:** статика (фото, JS/CSS бандлы, OG-image) грузится с российских PoP Yandex в <20мс. Server response time для роботов Яндекса улучшается.

**Цена:** ~₽500–1500/мес при ~10–50 ГБ/мес трафика.

**Альтернативы:** Selectel CDN, ngenix, Reg.Cloud CDN — все российские, цена сопоставима. Yandex CDN предпочтительнее из-за интеграции с Yandex.Metrika и собственных IP-сетей, которые точно не фильтруются.

#### Фаза 3: Полная миграция на российский хостинг (V2)

Когда трафик и нагрузка вырастут (>10к посетителей/сутки) — переехать целиком в РФ:

| Опция | Плюсы | Минусы | Цена |
|---|---|---|---|
| **Yandex.Cloud (Compute + Managed Postgres)** | Полная экосистема, русская поддержка, интеграция с Yandex.Metrika/Бизнес/SmartCaptcha | Документация местами слабее AWS | от ~₽3000/мес |
| **Selectel (Cloud + Managed Postgres)** | Лучшая цена в РФ, мощный API, давно на рынке | UI попроще | от ~₽2000/мес |
| **Reg.Cloud / Reg.ru** | Дёшево, удобно для домена + хостинга в одном месте | Слабее на масштаб | от ~₽1000/мес |

**Что мигрируем:**
- `marketplace` (Next.js) → Compute / Container Registry
- `api-server` — пока остаётся на Railway (CRM/PWA там же), для marketplace API-вызовы внешние
- В перспективе и api-server переезжает (Phase 3)

**Postgres** мигрируем последним — много данных, рискованно. Сначала marketplace + api-server, потом БД.

**Подготовка:**
- Все секреты (R2, OpenAI, etc.) — в Vault Secret Manager
- Docker-образ marketplace тестируем локально (`docker build .`)
- Backup БД перед миграцией (pg_dump + проверенный restore на staging)
- DNS TTL заранее снижаем до 60 сек, чтобы после переключения трафик быстро ушёл

#### Чек-лист «работает без VPN»

- ☐ `nslookup chestnye-mastera.ru` от российского провайдера → IP резолвится (любой, главное — отвечает)
- ☐ `curl -I https://chestnye-mastera.ru` от российского провайдера без VPN → HTTP 200
- ☐ `curl -I https://chestnye-mastera.ru/sitemap.xml` без VPN → 200, sitemap парсится
- ☐ Mobile-тест на 4G МТС/Мегафон/Билайн без VPN → страница рендерится за <3 сек
- ☐ Проверка через webresolver.ru или check-host.net из 5+ российских городов → status 200

---

## 15. Definition of Done для Production V1

Релиз можно считать готовым к проду, если **всё** ниже выполнено и проверено на staging:

### Функциональные
- [ ] Все публичные страницы открываются без авторизации (incognito-режим).
- [ ] HTML страницы содержит основной контент **без выполнения JS** (проверка через `curl -s https://chestnye-mastera.ru/santehnik/krasnodar | grep "Сантехник в Краснодаре"` — должно найтись).
- [ ] Заявка с marketplace **реально создаётся в `leads`** с `source='marketplace'`. Проверено end-to-end: форма → SQL `SELECT * FROM leads WHERE source='marketplace' ORDER BY created_at DESC LIMIT 1`.
- [ ] CRM `/crm/leads?source=marketplace` показывает marketplace-лиды с правильным URL источника.
- [ ] `send-to-buffer` работает на marketplace-лиде → `orders` создаётся → dispatch отправляет → мастер получает push в PWA.
- [ ] Существующие CRM, PWA мастера, API не сломаны (smoke-test после деплоя).
- [ ] Лендинг для мастеров переехал на `/masteram`, старый `/masters` редиректит на marketplace `/mastera`.

### SEO
- [ ] `/sitemap.xml` доступен, валидный XML, ссылается на sub-sitemaps.
- [ ] Sub-sitemaps доступны и валидны.
- [ ] `/robots.txt` доступен, содержит ссылку на `sitemap.xml`, `Allow: /`, нужные `Disallow`.
- [ ] Каждая публичная страница имеет уникальный `<title>` и `<meta description>`.
- [ ] `<link rel="canonical">` присутствует на всех публичных страницах с правильным URL.
- [ ] `https://www.chestnye-mastera.ru/...` редиректит 301 на `https://chestnye-mastera.ru/...`.
- [ ] `https://честные-мастера.рф/...` редиректит 301 на `https://chestnye-mastera.ru/...`.
- [ ] `https://www.честные-мастера.рф/...` редиректит 301 на `https://chestnye-mastera.ru/...`.
- [ ] JSON-LD валиден (проверено Yandex.Webmaster и Google Rich Results Test).
- [ ] Lighthouse SEO ≥ 90 на главной, /mastera, /master/:slug, /[service]/[city] (mobile profile).
- [ ] Lighthouse Performance ≥ 80 на тех же страницах (mobile).
- [ ] Lighthouse Accessibility ≥ 85.
- [ ] Sitemap submitted в Yandex.Webmaster и Google Search Console, статус «обработан без ошибок».

### Безопасность
- [ ] Капча работает на форме заявки.
- [ ] Rate limit срабатывает (тест: 6 заявок за минуту → 7-я отклонена 429).
- [ ] Чекбокс согласия на ПДн обязателен.
- [ ] Ссылки на политику конфиденциальности и пользовательское соглашение работают.
- [ ] Telegram/Email/паспорт мастеров **не отдаётся в API ответе** (проверено через `curl /api/marketplace/master/...`).
- [ ] Долги мастера, внутренние комментарии, заблокированный статус **не отдаются**.
- [ ] CSRF-token проверяется на форме заявки.
- [ ] HSTS включен (после периода тестирования).

### Технические
- [ ] `pnpm typecheck` проходит без ошибок.
- [ ] `pnpm build` проходит для всего workspace включая marketplace.
- [ ] `pnpm --filter @workspace/api-server test` — все тесты зелёные.
- [ ] Никаких mock-данных на production: все данные приходят из реальной БД.
- [ ] `console.log` в production-build минимизированы (есть только error/warn).
- [ ] Все env-переменные заданы (через скрипт `scripts/check-env.ts` или вручную перед деплоем).
- [ ] Sentry собирает ошибки.
- [ ] Yandex.Metrika считает события «отправил заявку».
- [ ] Backup БД сделан непосредственно перед миграцией 0005.

### Юридические/контентные
- [ ] Страница `/policy/privacy` опубликована, утверждена.
- [ ] Страница `/policy/terms` опубликована.
- [ ] На форме есть согласие на ПДн со ссылкой на политику.
- [ ] В footer есть юр. инфо: «ИП Коваленко И.Г., ИНН 262409599800».

### UX
- [ ] Все страницы выглядят корректно на мобильных (320px+).
- [ ] Нет «прыжков» лейаута (CLS < 0.1).
- [ ] Время до первого контента (FCP) < 1.5s на 4G.
- [ ] Шрифты не вызывают FOIT (используется `font-display: swap`).
- [ ] 404 страница показывается корректно для несуществующих slug.
- [ ] При успешной заявке пользователь попадает на `/zayavka/spasibo` с пояснением «оператор свяжется в течение N часов».

---

## 16. Фазовый план работ

### Фаза 0 — Подготовка (1 неделя)

**Цель**: создать фундамент для безопасной разработки.

- [ ] **Staging environment**: поднять Railway staging-окружение, склонировать prod-БД (или создать чистую с тестовыми данными).
- [ ] **CI**: настроить GitHub Actions с typecheck + tests + build на каждый PR.
- [ ] **Branch policy**: ветка `staging` → автодеплой на staging-сервисы; ветка `main` → автодеплой на prod после approval.
- [ ] **Backup**: настроить регулярный backup Postgres (Railway-вшитый) и проверить восстановление.
- [ ] **Domain checklist**: купить `chestnye-mastera.ru` и `честные-мастера.рф`, настроить DNS на Cloudflare. Получить root-доступ к регистратору (на случай восстановления).
- [ ] **Route audit**: пройти текущий sfera-master.ru, выписать все существующие public URL и их назначения. Зафиксировать какие переименовываем.
- [ ] **Юридический пакет**: ТЗ юристам на политику конфиденциальности, пользовательское соглашение, политику cookies, согласие на ПДн.
- [ ] **Дизайн-макеты**: запустить дизайнера (или взять из существующего client/master-pwa визуального языка) для главной, /mastera, /master/:slug, /[service]/[city], формы заявки. Mobile-first.
- [ ] **API спецификация**: написать OpenAPI/Zod-описание endpoints `/api/marketplace/*` (использовать `@workspace/api-zod`).

**Результат фазы 0**: команда готова работать, staging стоит, GitHub Actions зелёный.

---

### Фаза 1 — БД (1 неделя)

**Цель**: миграция 0005 на staging, потом prod.

- [ ] Написать миграцию `lib/db/migrations/0005_marketplace_baseline.sql`:
  - расширение `masters` (slug, is_published, public_*, seo_*).
  - новая таблица `cities`.
  - новая таблица `services` (на смену `service_types`).
  - новая таблица `master_portfolio`.
  - новая таблица `master_reviews_public`.
  - новая таблица `seo_redirects`.
  - расширение `leads` (source_page_url, marketplace_context, utm_*, attached_master_id, consent_given_at, …).
- [ ] Написать Drizzle-схемы: `lib/db/src/schema/cities.ts`, `services.ts`, `master-portfolio.ts`, `master-reviews-public.ts`, `seo-redirects.ts`. Расширить `masters.ts`, `leads.ts`.
- [ ] Backfill-скрипт `scripts/backfill-marketplace.ts`:
  - заполнить `cities` из `SELECT DISTINCT city FROM masters/leads/orders`.
  - заполнить `services` из `service_types`.
  - проставить `masters.is_published = false` всем (вручную позже опубликуем тестовых).
- [ ] Запустить миграцию на staging → проверить, что все существующие запросы из CRM/PWA продолжают работать.
- [ ] Сделать backup prod-БД, запустить миграцию на prod, повторить smoke-test.

**Результат фазы 1**: схема готова, никто не сломан.

---

### Фаза 2 — Backend API (1 неделя)

**Цель**: новый router `routes/marketplace.ts` с публичными endpoints (server-to-server).

- [ ] Создать `artifacts/api-server/src/routes/marketplace.ts`.
- [ ] Реализовать middleware `requireMarketplaceAuth` (проверка Bearer token).
- [ ] Endpoint `POST /api/marketplace/leads` (с дедупом, валидацией, нотификацией менеджера).
- [ ] Endpoint `GET /api/marketplace/services`, `GET /api/marketplace/services/:slug`.
- [ ] Endpoint `GET /api/marketplace/cities`, `GET /api/marketplace/cities/:slug`.
- [ ] Endpoint `GET /api/marketplace/masters` (фильтр city, service, sort, pagination).
- [ ] Endpoint `GET /api/marketplace/master/:slug` с DTO PublicMaster.
- [ ] Endpoint `GET /api/marketplace/service-city/:s/:c` (агрегат — мастера + статистика + faq).
- [ ] Endpoint `GET /api/marketplace/sitemap-data` для генерации sitemap.
- [ ] Endpoint `GET /api/marketplace/seo-redirects`.
- [ ] Endpoint `POST /api/marketplace/revalidate-callback` (для будущих webhook от CRM).
- [ ] Тесты на каждый endpoint (минимум валидация + happy path) в `__tests__/marketplace.test.ts`.
- [ ] Обновить `routes/index.ts` — подключить новый router.
- [ ] Обновить `getAllowedOrigins()` — добавить `https://chestnye-mastera.ru` (хотя CORS marketplace не нужен, оставим место).

**Результат фазы 2**: api-server готов отдавать публичные данные в санитизированном виде, marketplace может делать fetch.

---

### Фаза 3 — Next.js marketplace foundation (1.5 недели)

**Цель**: пустой Next.js-артефакт билдится, деплоится, layout+SEO-helpers готовы.

- [ ] Создать `artifacts/marketplace/` с `package.json` (`@workspace/marketplace`, Next.js 15, React 19 из catalog).
- [ ] `next.config.js`, `tsconfig.json` (с references на `@workspace/api-zod`).
- [ ] `app/layout.tsx` (root layout) — header/footer, шрифты, базовый metadata, JSON-LD Organization+WebSite.
- [ ] `app/(public)/layout.tsx` — публичный layout (отделён от системных страниц).
- [ ] `lib/api.ts` — fetch к `INTERNAL_API_BASE_URL` с авто-добавлением `Bearer` токена и retry.
- [ ] `lib/seo.ts` — generateMetadata helpers, absoluteUrl, jsonLd builders.
- [ ] `lib/jsonLd.ts` — все билдеры (Organization, WebSite, BreadcrumbList, LocalBusiness, Service, FAQPage, Article).
- [ ] `middleware.ts` — canonical-host redirect, www→non-www, .рф→.ru, кириллица→punycode, чтение `seo_redirects`.
- [ ] `app/sitemap.ts` — index sitemap.
- [ ] `app/robots.ts` — динамический robots.
- [ ] `app/not-found.tsx`, `app/error.tsx`.
- [ ] **Деплой на staging** Railway, подключение тестового домена (Railway preview URL).
- [ ] Smoke-test: открывается главная страница (с заглушкой), `/sitemap.xml` валиден, `/robots.txt` корректный.

**Результат фазы 3**: marketplace стоит на staging, ходит в API, готов к наполнению страницами.

---

### Фаза 4 — Публичные страницы (2 недели)

**Цель**: основные SEO-страницы с реальным контентом из БД.

#### Неделя 1
- [ ] `app/(public)/page.tsx` — главная: hero, топ-услуги (из `/api/marketplace/services`), топ-города, как работает, преимущества, CTA «найти мастера».
- [ ] `app/(public)/uslugi/page.tsx` — каталог услуг (с категориями, иконками).
- [ ] `app/(public)/uslugi/[slug]/page.tsx` — страница услуги (без города).
- [ ] `components/MasterCard.tsx` — карточка мастера для каталога.
- [ ] `components/Breadcrumbs.tsx` — visual + JSON-LD.
- [ ] `app/(public)/mastera/page.tsx` — каталог мастеров с фильтрами по городу/услуге, sort, pagination (server-side).
- [ ] `app/(public)/master/[slug]/page.tsx` — публичная карточка мастера (аватар, bio, услуги, портфолио, отзывы, кнопка «оставить заявку»).

#### Неделя 2
- [ ] `app/(public)/[serviceSlug]/[citySlug]/page.tsx` — главная SEO-страница услуга × город (топ-N мастеров, цены, FAQ, CTA-форма).
- [ ] `app/(public)/ceny/[slug]/page.tsx` — страница цен.
- [ ] `app/(public)/o-nas/page.tsx`, `kontakty/page.tsx`, `kak-eto-rabotaet/page.tsx`.
- [ ] `app/(public)/policy/privacy/page.tsx`, `terms/page.tsx`, `cookies/page.tsx` (MDX-контент от юристов).
- [ ] Базовые страницы фида работ: `app/(public)/raboty/page.tsx`, `raboty/[serviceSlug]/page.tsx`, `raboty/[serviceSlug]/[citySlug]/page.tsx` — пустые скелеты с серверным фетчем (без редактора, только публичные грид-страницы; страницы конкретных кейсов и редактор — Фаза 4.5).

**Результат фазы 4**: marketplace живой, по реальным данным, на staging.

---

### Фаза 4.5 — Кейсы как контент-актив (Houzz-модель) (2 недели)

**Цель**: запустить кейсы как полноценный SEO-актив с self-service редактором, валидацией качества, AI-помощником и воронкой «Хочу такую же». Полная архитектура — секция **11.7**.

#### Неделя 1 — БД, API, валидация

- [ ] **Миграция БД**: расширить таблицу `master_portfolio` всеми полями из секции 7 (`service_id NOT NULL`, `city_id NOT NULL`, `description NOT NULL`, `room_type`, `style_tags[]`, `before_after_layout`, `price_total NOT NULL`, `price_breakdown jsonb`, `duration_days NOT NULL`, `area_sqm`, `materials_used[]`, `completed_at NOT NULL`, `client_consent_given`, `client_consent_at`, `order_id` FK, `status` enum, `reject_reason`, `moderation_flags jsonb`, `reverse_image_check`, `lead_count`, `seo_title`, `seo_description`, `published_at`, `unpublished_at`, индексы по published+date, service+city, room, featured, GIN на тегах).
- [ ] **Миграция БД**: новая таблица `master_portfolio_photo_hashes` (id, portfolio_id FK, photo_url, phash bigint, created_at) для internal collision check.
- [ ] **Миграция БД**: расширить `leads` — `source` дополняется значением `marketplace_case`, `context_jsonb` с `case_id`, `near_to_master_id`, `area_hint`, `budget_hint` (если поля ещё нет).
- [ ] **Endpoints в `routes/master-pwa.ts` (self-service)**:
  - `GET /api/master-pwa/portfolio` — список своих (включая `draft`)
  - `POST /api/master-pwa/portfolio` — создать draft
  - `PATCH /api/master-pwa/portfolio/:id` — редактировать
  - `DELETE /api/master-pwa/portfolio/:id` — soft delete
  - `POST /api/master-pwa/portfolio/:id/photos` — upload (sharp resize, pHash compute, internal collision check)
  - `POST /api/master-pwa/portfolio/:id/publish` — gate-валидация → публикация (или 400 с errors[])
  - `POST /api/master-pwa/portfolio/:id/ai-describe` — AI-helper (через существующий dispatcherAI с новым промптом из 11.7.6, лог в `ai_content_log`)
- [ ] **Endpoints в `routes/marketplace.ts` (публичные)**:
  - `GET /api/marketplace/raboty?service=&city=&room=&style=&min_price=&max_price=&page=&sort=` — фид с фильтрами и пагинацией
  - `GET /api/marketplace/raboty/:slug` — кейс + автор + 3-6 похожих + контекст для формы
  - `GET /api/marketplace/raboty/by-master/:masterSlug` — для блока «все работы мастера»
  - `GET /api/marketplace/sitemap-data?type=raboty` — для `sitemap-raboty.xml`
- [ ] **Slug-генератор** для кейсов: `[service-slug]-[area]m-[city-slug]-[master-alias]-[short-hash]`. Уникальность гарантируется hash-суффиксом.
- [ ] **Гейт-валидация** (`validateForPublish`) на API. Возвращает `{ ok: false, errors: [...] }` со списком незаполненных полей. Frontend показывает чек-лист с прогрессом.
- [ ] **AI-helper промпт** в `dispatcherAI.ts` (новый сценарий `portfolio_describe`), стоимость логируется в `ai_content_log`.
- [ ] **Reverse image search (internal only в V1)**: pHash compute через `sharp` + Hamming distance по существующим хешам. External (Yandex.Images) — отложено до V2 / при появлении бюджета.

#### Неделя 2 — UI, SEO, лиды

- [ ] **Страница `/raboty/[slug]` (Next.js)**: полная анатомия из 11.7.3 — hero gallery (before/after layout), мета-блок (цена/срок/площадь), описание, материалы, стиль, карточка мастера, похожие работы (server-side fetch), форма «Хочу такую же» с pre-fill, отзыв клиента (если есть).
- [ ] **JSON-LD на странице кейса**: `CreativeWork`, `Service+Offer`, `ImageObject` для каждого фото, `Review` если есть отзыв (см. шаблоны в 11.7.4).
- [ ] **Страница `/raboty` (фид)**: фильтры (UI с query-params), грид карточек, пагинация, sort (new/popular/featured).
- [ ] **Страницы `/raboty/[serviceSlug]` и `/raboty/[serviceSlug]/[citySlug]`**: те же грид + breadcrumbs + динамический `<title>` и `<meta>` со счётчиком кейсов.
- [ ] **`<MasterCard>` обновление**: добавить превью топ-6 работ на `/master/[slug]` с CTA «все работы → /raboty?master=alias`.
- [ ] **Sitemap**: `app/sitemap-raboty.xml/route.ts` — все опубликованные кейсы + browse-страницы. Подхватывается в индексе.
- [ ] **Воронка «Хочу такую же»**: форма заявки с pre-fill полями. POST `/api/marketplace/leads` со `source='marketplace_case'` и `context.case_id` + `context.near_to_master_id`.
- [ ] **`priorityAssign.ts` обновление**: при `lead.context.near_to_master_id IS NOT NULL` → exclusive period 30 минут с push автору; при отказе/таймауте → стандартный broadcast по подходящим мастерам.
- [ ] **Счётчик `lead_count`**: при создании лида с `case_id` инкремент в `master_portfolio.lead_count`. Используется для лидерборда и приоритета.
- [ ] **`master-pwa/profile.tsx` (или новая страница `/portfolio`)**: грид своих кейсов (draft/published/rejected), кнопка «+Добавить кейс», модалка/drawer с полным редактором (все поля из 11.7.5), upload до 10 фото с превью, чекбокс согласия клиента, кнопка «Помочь AI» в поле описания, gate-валидация с чек-листом.
- [ ] **CRM-вкладка «Кейсы» в `/crm/content`**: очередь `pending_review`, флаги модерации, превью фото, действия (approve/reject/edit-then-approve), bulk approve.
- [ ] **CRM master-drawer**: вкладка «Маркетплейс» (уже есть из 11.5) расширяется списком кейсов с операторскими действиями (per-case unpublish, delete) — endpoints уже готовы из CRM-override итерации.
- [ ] **E2E test**: мастер заполняет форму → AI-helper → upload фото → publish → страница `/raboty/[slug]` доступна → пользователь нажимает «Хочу такую же» → лид создан с `source='marketplace_case'` → автор получил push.
- [ ] **IndexNow ping** на новый кейс при публикации (использует существующую инфру блога из 11.6).

**Результат фазы 4.5**: кейсы — отдельный продукт. Мастер может публиковать через self-service. Каждый кейс — индексируемая страница с обязательной структурированной разметкой. Воронка «кейс → лид → автор» работает.

---

### Фаза 5 — Заявки (1 неделя)

**Цель**: end-to-end приём заявок с marketplace в `leads` с трекингом источника.

- [ ] Компонент `<LeadForm>` (client component, `react-hook-form` + zod resolver).
- [ ] Поля: имя, телефон, город (autocomplete или dropdown), услуга (autocomplete или dropdown — может быть pre-filled со страницы), краткое описание, чекбокс согласия.
- [ ] Honeypot field, hidden timestamp, hidden CSRF token.
- [ ] Yandex SmartCaptcha интеграция.
- [ ] Route handler `app/api/leads/route.ts`:
  - валидация zod-схемой.
  - проверка origin/referer.
  - проверка captcha (server-side).
  - rate limit (in-memory или Upstash Redis).
  - сбор метаданных (ip, ua, referrer, utm из cookie/query, page url из referer).
  - вызов `POST sfera-master.ru/api/marketplace/leads` с Bearer token.
  - редирект на `/zayavka/spasibo`.
- [ ] Страница `/zayavka/spasibo` (noindex).
- [ ] CRM: вкладка «Маркетплейс» в `/crm/leads`, отображение source_page_url.
- [ ] CRM: drawer лида показывает контекст marketplace (страница, UTM, привязанный мастер).
- [ ] E2E test: на staging заявка из браузера → лид появляется в CRM → отправка в работу → push в PWA мастера.

**Результат фазы 5**: marketplace принимает заявки, операторы видят их в CRM.

---

### Фаза 6 — SEO infrastructure (1 неделя)

**Цель**: всё для индексации.

- [ ] `app/sitemap.ts` — индекс с ссылками на sub-sitemaps.
- [ ] Sub-sitemaps: `app/sitemaps/static/sitemap.ts`, `services/...`, `cities/...`, `service-city/...`, `pricing/...`, `masters/...`.
- [ ] Все sub-sitemaps читают из `/api/marketplace/sitemap-data?type=...`.
- [ ] Полный список JSON-LD на всех страницах (см. секцию 11).
- [ ] Все `generateMetadata` написаны и проверены (через `curl -s | grep '<title>'`).
- [ ] Тестирование Yandex.Webmaster: добавление сайта, валидация sitemap, проверка JSON-LD.
- [ ] Тестирование Google Search Console: то же самое.
- [ ] Lighthouse audit: все ключевые страницы ≥ 90 SEO.
- [ ] Канонизация хостов в middleware: финальная проверка для всех 6 alias-комбинаций.
- [ ] Yandex.Metrika установка + цель «отправил заявку».
- [ ] Google Analytics установка.
- [ ] Откат `/masters` с redirect на `/masteram`, добавление `/masteram` route на api-server.

**Результат фазы 6**: marketplace SEO-готов, ждёт релиза.

---

### Фаза 7 — Release (1 неделя)

**Цель**: production, индексация началась, мониторинг работает.

- [ ] **Staging full QA**: вручную пройти все страницы, формы, редиректы. Чек-лист DoD из секции 15.
- [ ] **Lighthouse audit на staging**: SEO ≥ 90, Performance ≥ 80, Accessibility ≥ 85.
- [ ] **Cross-browser test**: Chrome, Firefox, Safari (iOS), Yandex Browser.
- [ ] **Mobile test**: реальные устройства (iPhone, Android low-end, iPad).
- [ ] **Backup БД** перед prod-миграциями.
- [ ] **Production deploy**:
  - merge `staging` → `main`.
  - Railway автодеплой `marketplace-prod`.
  - smoke-test prod (все главные URL открываются).
- [ ] **Domain connect**:
  - `chestnye-mastera.ru` указывает на Railway prod.
  - alias-домены тоже.
  - SSL-сертификаты выпустились.
- [ ] **Yandex.Webmaster**: добавление сайта, подтверждение хоста, отправка sitemap.
- [ ] **Google Search Console**: то же.
- [ ] **Yandex.Metrika** на prod: проверка счётчика, цели работают.
- [ ] **Sentry** на prod: проверка отправки ошибок.
- [ ] **UptimeRobot** или Cloudflare Health Check на `/api/health`.
- [ ] **Алёрты в Telegram** при 5xx.
- [ ] **Сообщение команде**: marketplace опубликован, ссылка на dashboard аналитики, кому что писать при инцидентах.

**Результат фазы 7**: marketplace в проде, индексация запущена.

---

### Фаза 8 — Позже (после стабилизации V1, ~3 месяца)

Эти фичи **не входят в V1**, но архитектура для них готова:

- [ ] **Тарифы и подписки мастеров** (Free / Pro / Enterprise):
  - таблица `tariffs`, `master_subscriptions`, `payments`.
  - интеграция с ЮKassa для рекуррентных платежей.
  - страницы `/tarify`, `/master-pwa/subscription`.
  - CRM: `/crm/finance?tab=subscriptions`.

- [ ] **Покупка лидов** (out-of-quota):
  - расширение `leads` (price, max_purchases, is_exclusive).
  - таблица `lead_purchases`.
  - PWA: страница `/master-pwa/marketplace` с лентой лидов в анонимном виде.
  - модалка «купить лид» со списанием из `master_wallet.balance`.

- [ ] **Эксклюзивные лиды**: один мастер, цена выше, контакт сразу.

- [ ] **AI-дизайнер**:
  - Fal.ai интеграция (`lib/integrations/fal-ai/`).
  - таблицы `designs`, `design_generations`, `user_design_limits`.
  - страницы `/dizajn`, `/dizajn/[slug]`, `/dizajn/[room]`, `/dizajn/[room]/[style]`.
  - связка с `leads.design_id`.
  - **Связка с кейсами (Фаза 4.5):** на странице AI-дизайна показываем «мастера, которые делали похожее» — image similarity на существующих `master_portfolio.after_photos` (через embedding или perceptual hash).

- [ ] **Личный кабинет клиента**:
  - история заявок с marketplace.
  - чат с мастером (использовать существующий чат-механизм).
  - отзывы после завершения заказа.

- [ ] **Расширенная аналитика для marketplace**:
  - дашборд `/crm/marketplace-analytics`: конверсия, топ-страницы, LTV лидов.
  - А/Б тесты CTA, форм.

- [ ] **Свайп-формат подбора мастера** (мобильный «Tinder для мастеров»).

---

## Резюме для тех. директора

### Главные решения
1. **Stack**: Next.js 15 App Router, отдельный артефакт `artifacts/marketplace/`, развёртывание на Railway.
2. **Архитектура**: server-to-server через `INTERNAL_API_SHARED_TOKEN`, marketplace = тонкий публичный фасад поверх существующего api-server. Никакого прямого доступа к Postgres из marketplace.
3. **Domain**: canonical на `chestnye-mastera.ru`, alias `честные-мастера.рф` 301-редирект, не индексируется.
4. **БД**: одна миграция `0005`, все изменения обратно-совместимые. Никаких breaking changes.
5. **CRM/PWA**: минимальные правки, существующий поток заявок работает.

### Сроки V1 (грубо)

| Фаза | Длительность |
|---|---|
| 0 — Подготовка | 1 неделя |
| 1 — БД | 1 неделя |
| 2 — Backend API | 1 неделя |
| 3 — Next.js foundation | 1.5 недели |
| 4 — Публичные страницы | 2 недели |
| 5 — Заявки | 1 неделя |
| 6 — SEO | 1 неделя |
| 7 — Release | 1 неделя |
| **Итого V1** | **~9.5 недель** (≈2.5 месяца) |

С учётом параллелизации (фронт + бэк параллельно), 2 разработчика → **~6 недель**.

### Главные риски
1. **Lighthouse Performance < 80**: если bundle JS большой → переписать главную и `/[service]/[city]` максимально на server components, Image Optimization. Бюджет JS первого экрана — < 100KB.
2. **Дубли в индексе** через alias-домен или UTM: предотвращается canonical + Clean-param + 301 на edge.
3. **Сломать CRM/PWA**: миграция 0005 — все новые поля nullable, старый код работает. Smoke-test после каждого деплоя.
4. **Спам через форму**: 12 слоёв защиты (см. секцию 13).
5. **БД connection pool**: marketplace не ходит напрямую — server-to-server через api-server, пул не растёт.

### Что должно быть готово ДО старта работ
- Юридические документы (политика, соглашение).
- Дизайн-макеты ключевых страниц.
- Список стартовых городов (топ-30) и услуг (топ-50) для приоритетного SEO-контента.
- Контентные тексты для главной, /uslugi, /kak-eto-rabotaet.
- ИНН/реквизиты для footer.
- Регистрация доменов и DNS-настройка.

---

## 16. Content / Social Layer: контентная платформа мастеров и заказчиков

> **Статус**: стратегическое дополнение, **код не пишем сейчас**.
> Задача секции — зафиксировать долгосрочный вектор продукта и подготовить пространство для будущих сущностей БД и страниц.

### 16.1. Идея

В долгосрочной перспективе «Честные мастера» — это не только marketplace заявок, но и **контентная платформа** вокруг ремонта, дизайна и мастеров. Контент создают две стороны:

**Мастера**:
- кейсы «до/после»;
- работы объектов;
- советы;
- разборы ошибок;
- видео с объектов;
- посты о материалах, ценах, сроках;
- ответы на вопросы заказчиков.

**Заказчики**:
- AI-дизайны;
- вопросы;
- подборки идей;
- сохранённые варианты;
- запросы «хочу как на этом фото»;
- отзывы и оценки после завершения работы.

### 16.2. Задача платформы

- превращать пользовательский контент в SEO-страницы;
- связывать контент с услугами / городами / районами;
- вести пользователей к заявке;
- мотивировать мастеров улучшать профиль и публиковать работы;
- мотивировать заказчиков создавать AI-дизайны и оставлять заявки.

### 16.3. Основные типы страниц

#### 16.3.1. Работы мастеров (Houzz-модель — главный SEO-актив)

> **Полная архитектура и требования — см. секцию 11.7.** Здесь — короткое summary для секции 16.

URL:
- `/raboty` — главный фид
- `/raboty/[serviceSlug]` — фид по услуге
- `/raboty/[serviceSlug]/[citySlug]` — long-tail SEO-страница услуга × город
- `/raboty/[slug]` — конкретная работа (главный SEO-актив)

Контент кейса (обязательные поля для индексации):
- Заголовок ≥10 chars
- Описание ≥150 chars
- Услуга и город (FK)
- Цена итоговая (числом)
- Срок работ (дни)
- Дата завершения
- ≥1 фото «после» (рекомендуется и «до»)
- Согласие клиента на публикацию (юридический gate)

Контент кейса (опциональные, но усиливают SEO):
- Площадь м²
- Тип помещения (kitchen/bathroom/...)
- Стиль (теги: minimalism/scandi/loft/...)
- Использованные материалы (теги)
- Фото в процессе работы
- Отзыв клиента (Schema.org Review)
- `order_id` ссылка на реальный заказ из БД (E-E-A-T верификация)

Целевые SEO-запросы (long-tail):
- «ремонт кухни 12 метров фото»
- «ремонт ванной до после Краснодар»
- «укладка плитки санузел цена»
- «дизайн кухни минимализм»
- «ремонт квартиры 3 комнаты бюджет»

Ключевые механики (детали в 11.7):
- AI-helper для описаний (через существующий dispatcherAI с новым промптом)
- Reverse image search (pHash internal, Yandex.Images external)
- Воронка «Хочу такую же» с auto-fill контекстом → лид направляется автору первым
- Стимулы: ачивки, лидерборд, приоритет в диспетчере для авторов с 5+ кейсами
- Многослойная модерация: auto-pass + AI-second-pass + manual queue + reactive

Метрики успеха (V1 / V1.5 / V2):
- 500 / 2000 / 5000 опубликованных кейсов
- 50 / 300 / 1500 в индексе Яндекса
- 10 / 50 / ≥50/неделя заявок с `source='marketplace_case'`

#### 16.3.2. Советы мастеров

URL:
- `/sovety`
- `/sovety/[slug]`

Контент:
- экспертные статьи от мастеров;
- советы;
- разборы ошибок;
- чек-листы;
- объяснение цен.

Примеры заголовков:
- «Почему течёт смеситель после замены»;
- «Как выбрать плиточника»;
- «Сколько стоит ремонт ванной»;
- «Какие ошибки допускают при электромонтаже».

#### 16.3.3. Вопросы заказчиков

URL:
- `/voprosy`
- `/voprosy/[slug]`

Контент:
- вопрос клиента;
- ответы мастеров;
- кнопка «Оставить похожую заявку».

Примеры:
- «Почему гудит кран»;
- «Можно ли класть плитку на старую плитку»;
- «Сколько стоит заменить проводку».

#### 16.3.4. AI-дизайны заказчиков

URL:
- `/dizajn`
- `/dizajn/[slug]`

Контент:
- AI-изображение;
- стиль;
- помещение;
- город / район;
- примерная цена;
- похожие работы мастеров;
- кнопка «Хочу такой ремонт».

#### 16.3.5. Идеи ремонта

URL:
- `/idei`
- `/idei/[slug]`

Контент:
- подборки работ и AI-дизайнов;
- идеи для ванной, кухни, санузла;
- подборки по стилям.

### 16.4. Будущие сущности БД (НЕ реализовывать сейчас)

Это эскиз, чтобы при появлении задачи не возникло конфликтов имён или схем. Все поля nullable / с разумными default по тем же правилам, что и текущая миграция `0005_marketplace_baseline`.

```
content_posts
├── id                       serial PK
├── author_type              enum('master','client','platform')
├── author_master_id         integer NULL REFERENCES masters(id)
├── author_client_id         integer NULL                 -- будущая таблица clients
├── type                     enum('post','case','question','ai_design','idea')
├── title                    varchar(200)
├── slug                     varchar(120) UNIQUE
├── body_md                  text
├── city_id                  integer NULL REFERENCES cities(id)
├── service_type_id          integer NULL REFERENCES service_types(id)
├── status                   enum('draft','pending_review','published','rejected')
├── seo_title                varchar(180) NULL
├── seo_description          varchar(300) NULL
├── cover_image_url          varchar(500) NULL
├── published_at             timestamp NULL
├── created_at               timestamp DEFAULT now()
└── updated_at               timestamp DEFAULT now()

content_media
├── id                       serial PK
├── post_id                  integer REFERENCES content_posts(id) ON DELETE CASCADE
├── type                     enum('image','video')
├── url                      varchar(500)
├── thumbnail_url            varchar(500) NULL
├── alt                      varchar(255) NULL
└── sort_order               integer DEFAULT 0

content_reactions
├── id                       serial PK
├── post_id                  integer REFERENCES content_posts(id) ON DELETE CASCADE
├── user_fingerprint_or_client_id  varchar(120)        -- анонимный fingerprint или client_id
├── type                     enum('like','save')
└── created_at               timestamp DEFAULT now()
```

### 16.5. Мотивация мастеров

- профиль заполнен на X%;
- «добавьте 3 работы — получите больше показов»;
- «добавьте видео — попадёте выше в выдаче»;
- «отвечайте на вопросы — вас увидят клиенты»;
- публикации дают больше доверия и заявок;
- контентная активность может влиять на место в выдаче (внутренний скоринг).

### 16.6. Мотивация заказчиков

- «создайте AI-дизайн бесплатно»;
- «сохраните идею»;
- «задайте вопрос мастеру»;
- «получите подбор мастеров»;
- «хочу как на этом фото».

### 16.7. Модерация

- мастер создаёт черновик (status=`draft`);
- AI помогает привести текст в нормальный вид (тон, типографика, очистка от телефонов / адресов / лиц без согласия);
- контент получает статус `pending_review`;
- оператор одобряет (status=`published`) или отклоняет с причиной (status=`rejected`);
- после approval появляется публичная SEO-страница и попадает в sitemap;
- запреты: телефоны, адреса, документы, лица без согласия, реклама конкурирующих площадок.

### 16.8. Social mechanics

**Делаем в первой версии**:
- лайки;
- сохранения;
- кнопка «Поделиться»;
- кнопка «Хочу так же» (с переходом к заявке);
- блок похожих работ;
- подбор мастера под выбранный контент.

**Не делаем в первой версии**:
- комментарии;
- публичные споры;
- личные сообщения между пользователями;
- лента как Instagram / TenChat;
- подписки между пользователями.

Ограничение сделано осознанно: социальная лента и UGC-комментарии требуют тяжёлой модерации и отдельной анти-абуз инфраструктуры. На старте достаточно односторонних реакций (`like`, `save`).

### 16.9. Связь с SEO

Каждая единица контента — это отдельная индексируемая страница:

- каждая работа мастера → SEO-страница `/raboty/[slug]`;
- каждый AI-дизайн → SEO-страница `/dizajn/[slug]`;
- каждый вопрос → SEO-страница `/voprosy/[slug]`;
- каждый совет → SEO-страница `/sovety/[slug]`.

Все страницы перелинковываются с `/[serviceSlug]/[citySlug]` (cross-link к коммерческой карточке) и обратно. Каждая страница ведёт к форме заявки.

В sitemap каждый тип контента уходит в свой sub-sitemap (`/sitemap-raboty.xml`, `/sitemap-sovety.xml`, ...) с `lastmod = published_at | updated_at`.

### 16.10. Связь с будущим Tinder-подбором

Контент-страницы — естественная точка входа в свайп-подбор:

- пользователь пришёл на работу или AI-дизайн;
- нажал «хочу так же»;
- видит 5–10 подходящих мастеров (по услуге + городу + рейтингу);
- лайкает мастеров;
- выбранным мастерам уходит горячий лид (с контекстом исходной работы / дизайна).

Это даёт качественный лид с прямой привязкой к референсу: мастер видит, какой именно стиль / уровень работ ожидает клиент.

### 16.11. Приоритет реализации

**Сейчас не делать.** Порядок при подходе к этой секции:

1. service-city pages + lead flow — **готово**;
2. AI-дизайнер;
3. master portfolio / `/raboty`;
4. content posts / `/sovety`;
5. questions / `/voprosy`;
6. likes / saves;
7. tinder-style matching.

### 16.12. Вывод секции

«Честные мастера» должны эволюционировать из marketplace заявок в **self-growing SEO/content platform**, где мастера и заказчики создают контент, а платформа превращает его в трафик и заявки. Это закрывает классическую проблему marketplace'ов: «нечего показывать на старте» и «дорого закупать SEO-контент». UGC + AI-дизайны + кейсы мастеров создают непрерывный поток уникальных страниц.

---

## 17. AI-дизайнер: техническая реализация

> **Статус**: зафиксированный план реализации.
> **Связь с другими секциями**: расширение секции 16.3.4 (`/dizajn`), использует таблицы из миграции `0006_designs_baseline` (`designs`, `design_images`, `design_generations`, `user_design_limits`).
> **Граница**: эта секция описывает технический стек и pipeline; реальная разработка идёт отдельными задачами после готовности страниц-скелетов и foundation БД.

### 17.1. Зафиксированные решения

| Слой | Решение | Альтернативы (отклонены) |
|---|---|---|
| **AI-провайдер** | **Fal.ai** — SDXL + ControlNet depth | ReimagineHome (5× дороже), Replicate (медленнее), YandexART (нет ControlNet), Sber Kandinsky (хуже SDXL) |
| **Storage** | **Cloudflare R2** (S3-совместимый) | Yandex Object Storage (отложен — ниже скорость, важна международная инфра) |
| **Биллинг провайдеру** | международная карта компании | российская карта (отвалилась бы на Stripe) |
| **Бюджет** | до ~$15/мес для первых 1000 пользователей | apruved |
| **Приоритет** | **качество > скорость time-to-launch** | подтверждён юзером |

### 17.2. Архитектура pipeline

```
Клиент / браузер
  ├─ загрузка фото комнаты (input)
  ├─ выбор room_type, style
  ├─ опц. опис «что хочу» (свободный текст, до 280 символов)
  ↓
[1] /api/designs (POST, marketplace → api-server, server-to-server)
    • client-side: face-blur через MediaPipe Selfie Segmentation в браузере
    • server-side: проверка user_design_limits (phone/ip/cookie)
    • upload фото → R2 через signed PUT URL
    • INSERT designs (status='draft') + design_images(type='input')
    • return designId, signed input URL
  ↓
[2] /api/designs/:id/generate (POST)
    • check квоты ещё раз server-side
    • INSERT design_generations (status='pending', provider='fal.ai')
    • status переход designs.status='generating'
    • enqueue worker
  ↓
[3] Worker (in-process на api-server, без отдельного сервиса в V1)
    • call Fal.ai REST с ControlNet depth + i2i + style prompt
    • Fal вернёт URL результата (свой CDN, временный)
    • download → upload в R2 (постоянный URL)
    • сохранить thumbnail (sharp resize, 400×300, в R2)
    • UPDATE designs SET result_image_url, status='completed'
    • INSERT design_images(type='result'), design_images(type='thumbnail')
    • UPDATE design_generations SET status='success', cost_kopeks, completed_at
  ↓
[4] /api/designs/:id (GET, polling от клиента)
    • return status + image URLs (когда completed)
  ↓
[5] Клиент видит результат → CTA «Хочу такой ремонт»
    • откроет LeadForm с pre-filled designId
    • lead создаётся обычным flow + leads.design_id = X
    • обе таблицы связаны двумя FK (см. секцию 5 ревью миграции 0006)
```

**Latency budget на одну генерацию**: 5–8 секунд.
- Fal.ai SDXL+ControlNet: 3–6 сек
- + R2 round-trip (download Fal CDN → upload R2): 1–2 сек
- + thumbnail resize: 0.3 сек
- + БД: ~50 мс

**Polling client-side**: каждые 1.5 сек, 30 секунд таймаут. Если не успели — UX «работает в фоне» + email/push уведомление при готовности (на старте — просто оставить страницу открытой).

### 17.3. Этапы реализации (порядок)

| № | Этап | Что входит | Зависимости |
|---|---|---|---|
| **1** | **Storage foundation** (R2) | Cloudflare account + bucket `chestnye-mastera-designs`, R2 access keys в Railway env, server-side обёртка `lib/r2-storage.ts` (signed URL upload, download, ttl, public-read для result) | — |
| **2** | **Fal.ai integration** | Fal account, API key в Railway env, обёртка `lib/fal-client.ts` (i2i + ControlNet depth, prompt builder per style), retry/timeout логика | Этап 1 |
| **3** | **Backend API** (api-server) | `routes/designs.ts` — POST `/api/designs`, POST `/api/designs/:id/generate`, GET `/api/designs/:id`, защита Bearer'ом для marketplace, rate-limit per IP/phone/cookie через таблицу `user_design_limits` | Этапы 1, 2 |
| **4** | **Marketplace UI** — реальная форма | Замена `DesignerStubForm` на рабочую форму: file input → upload в R2 (через signed URL, fetch с api-server) → poll generation → show result. Использует уже готовые `/dizajn` и `/dizajn/new`. | Этап 3 |
| **5** | **Page `/dizajn/[slug]`** | Публичная SEO-страница одного дизайна. Только если `designs.is_public = true` и `public_consent_at` != null. JSON-LD `Article`, breadcrumbs, CTA «Хочу такой» → LeadForm с pre-filled designId. Sitemap append. | Этап 4 |
| **6** | **Каталог `/dizajn`** (полная версия) | Грид публичных дизайнов с фасетами (city + room_type + style), связь с `/[serviceSlug]/[citySlug]`, перелинковка | Этап 5 |
| **7** | **Tinder-style master matching** | После результата дизайна показать 5–10 мастеров под услугу + город, свайп лайков, отправка горячих лидов выбранным мастерам | Этапы 4, master portfolio |

Этапы **1-4** — обязательные для первого работающего MVP «загрузил фото → получил дизайн». **5-6** — публичный SEO-вход. **7** — отдельная задача после стабилизации основного pipeline.

### 17.4. Безопасность и privacy

- **Face-blur клиент-сайдом**, до отправки фото на сервер. MediaPipe Selfie Segmentation или встроенная Web ML — лица размываются в `<canvas>` ещё в браузере, на сервер уходит уже обезличенное изображение. Если MediaPipe не загрузился — отказ от загрузки + понятная подсказка.
- **EXIF strip**. Любая отправляемая картинка проходит через `sharp.metadata()` + `sharp().rotate().toBuffer()` без EXIF — координаты и device-info не утекают.
- **Server-side moderation pre-check** перед отправкой в Fal. Лёгкая проверка: размер ≤ 10 MB, MIME `image/jpeg|png|webp`, дополнительная NSFW-проверка через open-source модель (NudeNet через ONNX или вызов отдельного фильтра у Fal).
- **Fal.ai safety-checker** включён по дефолту — возвращает черное изображение для NSFW. Логируем как `failed` с `error_message='nsfw_detected'`.
- **Consent явный**. На странице `/dizajn/new` чекбокс «Согласен, что моё фото обрабатывается AI и хранится у нас до 90 дней». Срок хранения публикуется в политике.
- **Право на удаление**. Юзер с тем же телефоном (через подтверждение по СМС или через лид) может запросить удаление — функция в политике + ручка в CRM.
- **Watermark на бесплатные результаты**. SVG-overlay «честные-мастера.ру» внизу справа, прозрачность 30%. Применяется через `sharp.composite()` после Fal-результата. Защищает от перетекания контента в чужие площадки и работает как brand exposure при шеринге.

### 17.5. UX и latency

- **Pre-flight UX** пока загружается / отправляется в Fal:
  - skeleton с шагами: «обводим контуры комнаты → подбираем мебель → рендер финального изображения»;
  - текст-bullet'ы про что происходит (не врём — реально 3 фазы pipeline);
  - индикатор времени «обычно 5–8 секунд»;
- **После результата**:
  - до/после слайдер (drag-handle разделитель, как у ReimagineHome);
  - кнопка «Скачать» (с watermark);
  - **главный CTA**: «Хочу такой ремонт — найти мастера» → открывает LeadForm с pre-filled `serviceSlug=kompleksnyy-remont`, `designId`, и подстановкой описания «дизайн в стиле <style> для <room_type>»;
  - вторичные: «Сгенерировать ещё вариант» (расходует квоту), «Сделать публичной» (с consent чекбоксом, открывает `/dizajn/[slug]`);
- **Если генерация упала**:
  - retry один раз автоматически на тот же провайдер;
  - если снова fail — fallback на Replicate;
  - если оба не отвечают за 30 сек — отдаём «не удалось, оставьте заявку, мастер сам подберёт стиль» с прямым переходом к форме. Лид всё равно создан → не теряем юзера.

### 17.6. Стоимость и масштабирование

**Стартовая модель квот** (зафиксировано):
- **3 бесплатных генерации** на (phone + ip + cookie) — сложение по самому строгому из трёх ключей
- **После исчерпания: 10 ₽ за каждый рендер** (соответствует ~$0.10 — Fal.ai cost ~$0.20-0.40 при single-angle, при multi-angle ~$0.80-1.20 → нужен subsidy на старте, окупается через лиды)

**Платежи**:
- Telegram payments (через @sber_bot или @yoomoney_bot, как у партнёрской программы)
- Альтернатива: Stripe-link для зарубежных карт (минорная аудитория)
- Альтернатива бизнес-stimul: «Оставьте заявку мастеру → получите ещё 5 бесплатных генераций после первой консультации»

**Возврат средств**: если генерация упала на стороне провайдера → автоматический возврат рендера (квота восстанавливается).

**Прогноз стоимости** (всё в месяц, с учётом multi-angle = 4-6 рендеров на проект):

| Уровень нагрузки | Активных юзеров | Проектов | Рендеров | Fal.ai cost | Доход (10₽×платных) | Net |
|---|---|---|---|---|---|---|
| MVP (только free) | 100 | 100 | 400 | $80 | 0 | **-$80** (инвестиция) |
| Phase-2 (50% paid) | 1 000 | 1 500 | 6 000 | $1 200 | $30k₽ ≈ $300 | **-$900** (инвестиция) |
| Scale (60% paid) | 10 000 | 15 000 | 60 000 | $12 000 | $360k₽ ≈ $3 600 | **-$8 400** (компенсируется лидами) |

**Лидовая компенсация**: если 10% AI-проектов конвертятся в лид, и 30% лидов — в сделку, средняя комиссия 15 000 ₽:
- 15 000 проектов × 10% × 30% × 15 000 ₽ = **6.75 млн ₽/месяц** при 15k проектов
- Покрывает $8 400 затрат на AI с огромным запасом

**Точки переключения провайдера** (если Fal не подойдёт по качеству):
1. Recraft V3 — лучший photoreal interior, но 4× дороже. Включить как fallback при provider='recraft' в `design_generations` без изменения схемы.
2. Replicate с разными моделями (flux-dev, sdxl-controlnet variants) — простой A/B через ENV-переменную.

**Пороги для оптимизации**:
- если стоимость > $5000/мес → подключить кэш по `(input_image_hash, room_type, style)` — повторные одинаковые запросы возвращают тот же результат
- если latency > 15 сек p95 → рассмотреть Fal `inference-fastest` модели или собственный inference через Modal/Replicate-pro
- если NSFW false-positive высокий → custom safety-tuning или замена checker'а
- если paid-conversion < 10% → пересмотреть лимит free (увеличить до 5) или цену (снизить до 5₽/рендер)

### 17.7. Решённые / открытые вопросы

**Решено**:
- ✅ Provider: Fal.ai
- ✅ Storage: Cloudflare R2
- ✅ Биллинг: международная карта компании
- ✅ Качество > скорость time-to-launch
- ✅ Бюджет до ~$35/мес на phase-2 (1000 пользователей)
- ✅ Foundation БД готов (миграция `0006_designs_baseline` на prod)

**Открытое (ответить до этапа 1)**:
- Cloudflare account создан / нужно создать с нуля? (если есть DNS уже на Cloudflare — добавить R2 в тот же account)
- Bucket name: `chestnye-mastera-designs` ОК или другое?
- Срок хранения исходных фото клиента: 30 / 90 / бессрочно? (влияет на политику и retention worker)
- Watermark на бесплатные результаты — да / нет / только для публичных?
- Платный апгрейд (200 ₽ за 5 доп. генераций) — в первой версии или после стабилизации free-tier?

**Открытое (ответить до этапа 7)**:
- Tinder-стилевой подбор мастеров — автоматический после генерации или ручной CTA?
- Горячий лид нескольким мастерам — сколько одновременно (по аналогии с broadcast в текущей системе)?

### 17.8. Multi-angle rendering: разные ракурсы одной комнаты

> **Зафиксировано**: AI выдаёт не просто 1 картинку, а **набор ракурсов** одного интерьера. Это критично для UX (юзер видит проект целиком) и SEO (больше уникальных изображений на странице).

#### Архитектура

Один проект = 4-6 рендеров одной комнаты с разных углов:

| Ракурс | Что показывает | Использование |
|---|---|---|
| `wide_front` | Фронтальный широкий вид | Hero-изображение страницы, og:image, sitemap |
| `wide_corner` | Угловой вид (45°) | Carousel #2 |
| `detail_zone1` | Фрагмент: рабочая зона / гарнитур | Carousel #3, Image Search |
| `detail_zone2` | Фрагмент: декор / акцент | Carousel #4, Image Search |
| `floor_view` | Вид сверху (для room с полом-акцентом) | Опционально |
| `before_after_pair` | Композит «до AI / AI» | Hero для соц. сетей, кросс-постинг |

#### Реализация (Fal.ai с ControlNet)

```ts
// lib/fal-client.ts — расширение существующего клиента
async function generateMultiAngle(input: {
  sourceImageUrl: string,
  roomType: 'kitchen' | 'bathroom' | 'living' | ...,
  styleCode: 'japandi' | 'minimalism' | ...,
  prompt: string,
}): Promise<MultiAngleResult> {
  const angles = ANGLE_PROMPTS[input.roomType];

  // Параллельные вызовы Fal — каждый со своим camera prompt suffix
  const renders = await Promise.all(
    angles.map(angle =>
      falClient.run('fal-ai/fast-sdxl-i2i', {
        image_url: input.sourceImageUrl,
        prompt: `${input.prompt}, ${angle.cameraPrompt}, ${angle.lensPrompt}`,
        controlnet: { type: 'depth', image_url: input.sourceImageUrl },
        // Same seed = same composition, разные camera prompts = разные ракурсы
        seed: 42,
        num_inference_steps: 30,
      })
    )
  );

  return { angles: renders };
}

const ANGLE_PROMPTS = {
  kitchen: [
    { code: 'wide_front', cameraPrompt: 'wide angle front view, eye level', lensPrompt: '24mm lens' },
    { code: 'wide_corner', cameraPrompt: '45 degree corner view, eye level', lensPrompt: '24mm lens' },
    { code: 'detail_zone1', cameraPrompt: 'medium shot of cooking area, counter, hood', lensPrompt: '50mm lens' },
    { code: 'detail_zone2', cameraPrompt: 'medium shot of dining area, table, chairs', lensPrompt: '50mm lens' },
  ],
  bathroom: [
    { code: 'wide_front', cameraPrompt: 'wide angle front view from doorway', lensPrompt: '24mm lens' },
    { code: 'wide_corner', cameraPrompt: 'corner view, eye level', lensPrompt: '24mm lens' },
    { code: 'detail_zone1', cameraPrompt: 'medium shot of vanity, mirror, sink', lensPrompt: '50mm lens' },
    { code: 'detail_zone2', cameraPrompt: 'medium shot of shower or bath area', lensPrompt: '50mm lens' },
  ],
  // ... аналогично для других room_type
};
```

#### Стоимость

- 1 проект = 4-6 рендеров × $0.20-0.30 = **$0.80-1.80 на проект**
- При платной модели (10 ₽ × 4 рендера = 40 ₽/проект) пользователь платит за **«пакет ракурсов»**, не за отдельные кадры
- Free tier (3 проекта) = $2.40-5.40 на user, окупается через лиды

#### UX-показ

На странице `/ai-design/{slug}`:
1. **Hero**: `wide_front` крупно (1200×800)
2. **Mini-thumbnails справа**: остальные ракурсы кликабельные
3. **Click на thumb** → swap hero (без перезагрузки)
4. **Lightbox**: full-screen carousel со всеми ракурсами + до/после слайдер

#### Расширение БД

Существующая `design_images` уже поддерживает множество изображений. Добавить поле:
```sql
ALTER TABLE design_images
ADD COLUMN angle_code varchar(40),         -- 'wide_front' | 'detail_zone1' | ...
ADD COLUMN angle_order integer DEFAULT 0;  -- порядок в галерее
```

Worker запоминает angle_code при сохранении в R2.

### 17.9. AI-проект как SEO-страница (контент-фабрика)

> **Главное прозрение**: AI-дизайн — это не «фича для UX», это **двойной актив (UX + SEO)**. Каждая опубликованная генерация = индексируемая страница со структурированными данными.

#### URL-схема

```
/ai-design/{slug}                           — конкретный AI-проект
/ai-design/{room}                            — фид AI по комнате
/ai-design/{room}/{style}                    — фид AI по комнате+стилю
/ai-design/{room}/{style}/{areaBand}         — programmatic SEO (когда есть ≥5 проектов)
/ai-design/{room}/{style}/{city}             — programmatic SEO для топ-городов
```

Slug-формат: `{style}-{room}-{area}m-{city}-{userHash4}`

Например: `/ai-design/japandi-kvartira-58m-krasnodar-x7f3`

#### Расширение схемы `designs`

Текущая `designs` (миграция 0006):
- id, user_id, room_type, style, source_image_url, result_image_url, status, created_at

Добавить (миграция в составе V2):
```sql
ALTER TABLE designs
-- SEO-структурированные данные:
ADD COLUMN slug varchar(180) UNIQUE,
ADD COLUMN city_id integer REFERENCES cities(id),
ADD COLUMN area_sqm numeric(10,2),
ADD COLUMN budget_low numeric(12,2),
ADD COLUMN budget_high numeric(12,2),
ADD COLUMN target_completion_days integer,
ADD COLUMN zhk_id integer REFERENCES housing_complexes(id),  -- §19
ADD COLUMN style_tags text[] DEFAULT '{}',
ADD COLUMN building_type varchar(50),
ADD COLUMN color_palette varchar(50),
-- Дополнительные секции:
ADD COLUMN estimated_smeta jsonb,         -- работы с ценами (опц)
ADD COLUMN materials_list jsonb,          -- материалы (опц)
-- Публикация:
ADD COLUMN is_published boolean DEFAULT false,
ADD COLUMN published_at timestamp,
ADD COLUMN public_consent_at timestamp,
ADD COLUMN seo_title varchar(70),
ADD COLUMN seo_description varchar(180),
-- Связь с реальным ремонтом:
ADD COLUMN realized_by_master_id integer REFERENCES masters(id),
ADD COLUMN realized_portfolio_id integer REFERENCES master_portfolio(id),
ADD COLUMN realized_at timestamp,
-- Метрики:
ADD COLUMN view_count integer DEFAULT 0,
ADD COLUMN lead_count integer DEFAULT 0,
ADD COLUMN inspiration_count integer DEFAULT 0,
ADD COLUMN updated_at timestamp DEFAULT now();

CREATE INDEX idx_designs_published ON designs (is_published, published_at DESC) WHERE is_published = true;
CREATE INDEX idx_designs_room_style ON designs (room_type, style) WHERE is_published = true;
CREATE INDEX idx_designs_zhk ON designs (zhk_id, is_published);
```

#### Quality gate перед публикацией

Юзер не может опубликовать проект «как есть». Чтобы попасть в индекс, нужно заполнить:

| Поле | Обязательное? | Зачем |
|---|---|---|
| `source_image_url` | ✅ | Реальная фотография комнаты — против шаблонности |
| `room_type` | ✅ | Тип помещения (для таксономии) |
| `style_tags` (≥1) | ✅ | Стиль (для таксономии) |
| `city_id` | ✅ | Город (для local SEO) |
| `area_sqm` | ✅ | Площадь (числом, для programmatic SEO) |
| `budget_low` + `budget_high` | ✅ | Бюджетный диапазон |
| Описание (`prompt_text` или отдельное поле) ≥ 100 chars | ✅ | Уникальный текст — против шаблонности |
| Multi-angle рендеры (≥3) | ✅ | Несколько уникальных изображений |
| `zhk_id` | опц. | Если связан с ЖК — попадает в `/zhk/*` каталог |
| `materials_list` | опц. | Усиливает SEO как структурированные данные |
| `public_consent_at` (явный чекбокс) | ✅ | Юзер опт-инул на публикацию |

Если хоть один обязательный пункт не заполнен → проект остаётся **private** в кабинете пользователя. Только при заполнении всех + opt-in появляется в `/ai-design/{slug}` и в sitemap.

**Почему так строго**: 30 000 шаблонных AI-страниц = катастрофа для SEO. Лучше 3 000 качественных страниц с уникальными данными → Яндекс ранжирует домен как database content.

#### Маркировка AI-контента

Яндекс с 2024 года **поощряет честную маркировку** AI-контента и **штрафует за маскировку**.

Что делаем:
1. **Schema.org `Creator: AI`** в JSON-LD страницы:
   ```jsonld
   {
     "@context": "https://schema.org",
     "@type": "CreativeWork",
     "creator": {
       "@type": "SoftwareApplication",
       "name": "Fal.ai SDXL ControlNet",
       "applicationCategory": "AI image generator"
     },
     "isBasedOn": "user-uploaded-photo",
     "image": [...multi-angle URLs...]
   }
   ```
2. **Meta tag**: `<meta name="ai-generated" content="true">`
3. **Visible disclosure**: на странице бейдж `🤖 Сгенерировано AI` рядом с заголовком + текст «Это AI-визуализация на основе фото вашей комнаты. Реальный результат может отличаться»
4. **Watermark на изображениях**: SVG-overlay в углу `chestnye-mastera.ru AI` (30% opacity), наносится через sharp при генерации

#### Защита от деранжирования (баланс с реальным контентом)

В hub-страницах `/idei/{room}/{style}` и `/raboty` соблюдаем баланс:
- **Не больше 30% AI-проектов** в выдаче. Остальные 70% — реальные ремонты мастеров.
- В sitemap AI-проекты получают **более низкий priority** (0.5) чем реальные кейсы (0.75)
- На карточках AI-проекта явный бейдж `AI`, чтобы юзер видел разницу

### 17.10. Воронка «AI-проект → реальный ремонт → мастер»

Самая сильная мощь архитектуры. Trans of layered content:

#### Стадия 1: AI-проект (концепция)

Юзер сгенерировал, опубликовал. Страница `/ai-design/{slug}`:
- Multi-angle рендеры
- Описание стиля
- Бюджет 1.8-2.4 млн ₽
- Список материалов
- CTA «Хочу такой ремонт» → форма заявки → лид мастеру

#### Стадия 2: Лид → Мастер берёт в работу

- Лид содержит `source_design_id`
- Мастер видит в CRM «Этот лид от AI-проекта /ai-design/{slug}»
- Мастер берёт заказ → начинается реальный ремонт

#### Стадия 3: Мастер реализует — публикует кейс с привязкой

- В кабинете мастера при публикации кейса можно указать «Воплощение AI-проекта» → выбор из своих заказов с design_id
- Создаётся связка `master_portfolio.based_on_design_id` ←→ `designs.realized_portfolio_id`

#### Стадия 4: Страница AI-проекта трансформируется

Когда `realized_portfolio_id` заполнен — страница `/ai-design/{slug}` показывает **тройной layer контента**:

```
[Hero — multi-angle AI рендеры]

[H2: AI-проект]
   Стиль / площадь / бюджет (как раньше)

[H2: Реальное воплощение мастером Иваном Петровым]
   Фото "до" комнаты (исходная)
   Фото "после" — реальный ремонт
   Реальная цена: 2.1 млн ₽ (попало в AI-предсказание!)
   Срок: 78 дней
   Описание мастера

[H2: До → AI → Реальное]
   Тройной слайдер сравнения

[CTA — теперь с конкретным мастером]
   «Хотите так же? Иван Петров делает 3-й проект, есть ещё 2 заявки в работе»
```

Это **layered uniqueness** — невозможно скопировать конкурентом. У нас 3 уровня контента на одной странице.

#### Влияние на SEO

- На карточке AI-проекта: meta `Schema.org isBasedOn` указывает на оригинальное фото комнаты юзера + Schema.org `partOf` указывает на `master_portfolio` реализации
- В sitemap **realized AI-проекты получают priority 0.85** (выше обычных AI и обычных кейсов) — это уникальный layered контент
- Внутренние ссылки: с `/master/{slug}` → блок «Воплощённые AI-проекты», с `/ai-design/{slug}` → ссылка на мастера
- Stats: % воплощённых AI-проектов = ключевая метрика фабрики (target ≥10% за 6 месяцев)

### 17.11. Метрики SEO-фабрики

V2 (через 6 месяцев после запуска):
- ≥3000 опубликованных AI-проектов
- ≥150 связок «AI-проект → реальный ремонт» (5%)
- ≥50% AI-проектов имеют все 6 обязательных полей
- ≥30 страниц `/ai-design/{slug}` в ТОП-30 Яндекса по long-tail запросам

V2.5 (через 12 месяцев):
- ≥10000 опубликованных AI-проектов
- ≥1000 связок (10%)
- ≥10 страниц с layered content (AI + реальное) в ТОП-10
- Yandex.Картинки выдаёт наши AI-рендеры на запросах «дизайн {room} {style}»

---

## 18. Cabinet Migration: единый домен и кабинет мастера на маркетплейсе (V1.5 — приоритет 1)

> **СТАТУС: блокирующая задача V1.5.** Все остальные V1.5-фичи (Master Motivation §11.9, Cross-City §11.10, Каталог Идей §11.11, Дизайнеры §11.12, Видео §11.13) **строятся на основе нового кабинета**. Без миграции мы делали бы каждую фичу дважды (старый PWA + новый cabinet) → 2× работы и technical debt. Решение принято: сразу строить правильно.
>
> **Сроки**: 3 недели от начала миграции. После — все V1.5-фичи единожды в новом cabinet.

### 18.1. Контекст и проблема

**Что было в V1:**
- `sfera-master.ru/master-pwa/*` — приватный кабинет мастера (заказы, баланс, расписание, чекин, профиль, портфолио)
- `chestnye-mastera.ru/master/{slug}` — публичная страница, отображающая профиль read-only
- Мастер заполняет профиль в PWA → автопубликация → данные появляются на маркетплейсе
- Чтобы посмотреть как страница выглядит публично — мастер открывает другой домен в новой вкладке

**В чём слабость:**
- Две ментальные модели: «моё рабочее место» vs «моя страница в интернете»
- Два домена, два React-приложения, два мобильных PWA-ярлыка
- Мастер не видит preview публичного вида при редактировании
- На индустриальных аналогах (Profi.ru, YouDo, Avito, Houzz, Sсантехника-Онлайн) **публичная страница и есть кабинет**: мастер логинится на публичном домене, видит то, что видит клиент, и редактирует там же.

**Почему V1 такой:** master-pwa исторически выросла из приватной операторской прослойки (заказы, чаты), маркетплейс добавлен поверх как новый публичный фасад. Это правильное архитектурное решение для **быстрого старта V1**, но не финальная форма.

**Ключевое осознание для V1.5**: с расширением контент-актива (видео, статьи, метаданные дизайнерского уровня, Q&A) `master-pwa` превращается в перегруженный швейцарский нож. Делать новые контент-фичи в старом PWA = double work, потому что финал всё равно — единый домен.

### 18.2. Целевая архитектура (V1.5+)

Один домен — `chestnye-mastera.ru` — обслуживает:

| Раздел | URL | Доступ | Технология |
|---|---|---|---|
| Публичный каталог | `/`, `/{spec}/{city}`, `/master/{slug}`, `/raboty/*`, `/idei/*`, `/sovety/*` | open, индексируется | Next.js SSR + ISR |
| Кабинет мастера | `/cabinet/orders`, `/cabinet/balance`, `/cabinet/schedule`, `/cabinet/checkin`, `/cabinet/profile`, `/cabinet/portfolio`, `/cabinet/videos`, `/cabinet/articles`, `/cabinet/dashboard` | auth-only, `noindex` | Next.js + перенесённые компоненты из master-pwa |
| Кабинет дизайнера (V2+) | `/cabinet/projects`, `/cabinet/qa` | auth-only, `noindex` | Next.js + designer-specific компоненты |
| Inline-edit публичной страницы | `/master/{slug}` | если `session.master.id === master.id` — рендерится с тулбаром редактирования | компоненты-редакторы поверх SSR-разметки |
| Авторизация | `/login`, `/cabinet` (auth-redirect) | open / session | shared session с api-server через cookie на корневом домене |

`sfera-master.ru` после миграции остаётся **только для `/crm/*` и `/api/*`** — внутренние операторские/служебные URL. CRM и API не переезжают.

### 18.3. Поэтапный план миграции (3 недели)

#### Неделя 1 — Инфраструктура

Цель: auth + routing + PWA-shell готовы, фичи пустые.

- [ ] **Auth-мост**: marketplace начинает читать сессию api-server. Реализация: shared cookie на `.chestnye-mastera.ru` (api-server также отдаёт cookie на этот домен) с CSRF-token защитой write-операций. Альтернатива: proxy `/api/me` через `INTERNAL_API_BASE_URL`. Решение: **shared cookie** (быстрее, без round-trip на каждый SSR).
- [ ] **app/cabinet/layout.tsx** — auth-guard layout. Если нет сессии → redirect на `/login`. Sidebar / bottom-nav для мастера.
- [ ] **Routes-скелет** (пустые UI):
  - `/cabinet` (redirect → `/cabinet/orders`)
  - `/cabinet/orders` + `/cabinet/orders/[id]` + `/cabinet/orders/[filter]`
  - `/cabinet/balance`
  - `/cabinet/chat` + `/cabinet/chat/[id]`
  - `/cabinet/schedule`
  - `/cabinet/checkin`
  - `/cabinet/profile`
  - `/cabinet/portfolio` + `/cabinet/portfolio/[id]`
  - `/cabinet/dashboard` (метрики, completeness)
- [ ] **PWA manifest** на `chestnye-mastera.ru/cabinet/manifest.json` — installable app, иконки, theme, start_url=/cabinet, display=standalone.
- [ ] **VAPID dual-key** на api-server: на 30 дней держим оба ключа (старый sfera-master.ru + новый chestnye-mastera.ru). При отправке push шлём на оба endpoint. Неработающий тихо игнорируется.
- [ ] **CORS обновление**: api-server разрешает `chestnye-mastera.ru` для write-операций мастера. CSRF-token defaults `SameSite=Lax` + `__Host-` cookie.
- [ ] **/login** на marketplace: форма для мастеров (логин/пароль или MAX-кнопка). Redirect на `/cabinet/orders` после успеха.
- [ ] **Тест auth flow на staging**: логин → cookie → защищённая страница работает.

**Результат недели 1**: можно залогиниться как мастер на новом домене, видны пустые routes, навигация работает.

#### Неделя 2 — Перенос компонентов

Цель: вся текущая функциональность master-pwa работает в новом cabinet.

- [ ] **Перенос компонентов** из `artifacts/master-pwa/src/` в `artifacts/marketplace/app/cabinet/_components/` и `artifacts/marketplace/app/cabinet/[route]/page.tsx`. Большинство переиспользуется как есть (React 19 + Tailwind).
- [ ] **Routing миграция**: с Wouter (master-pwa) на Next.js App Router. Server components где возможно (read-only views — orders list, balance), client components где нужна интерактивность (forms, chats).
- [ ] **API client**: marketplace's `lib/api.ts` дополняется cabinet-функциями. Reuses existing `/api/master-pwa/*` endpoints — backend не меняем.
- [ ] **State management**: `useAuth` уже есть, дополняем cabinet-специфичными хуками (`useOrders`, `useBalance`, etc.). React Query для server state как в master-pwa.
- [ ] **Чат**: WebSocket / polling — переиспользуем существующую инфру. Только `wss://` URL меняется.
- [ ] **Push-подписка** при первом открытии cabinet — автоматически переподписываем на новый VAPID-key.
- [ ] **UI parity**: все экраны master-pwa работают на новом домене. **Functional regression test**: каждый flow (принять заказ, оформить чек, пополнить баланс, чат с диспетчером, чекин на день) выполняется на staging.
- [ ] **Push notification routing**: `MASTER_PWA_URL` env-var обновляется на `https://chestnye-mastera.ru/cabinet`. Все новые push/email/Telegram ссылки сразу на новый домен.

**Результат недели 2**: новый cabinet функционально эквивалентен старому master-pwa. Можно деплоить параллельно.

#### Неделя 3 — Migration tooling и rollout

Цель: плавная миграция мастеров, без потери работы существующих.

- [ ] **301 redirect**: `sfera-master.ru/master-pwa/*` → `chestnye-mastera.ru/cabinet/*` (express middleware на api-server). Сохраняет путь и query-string.
- [ ] **Soft-migration баннер** на старом master-pwa (доступ к старому продолжает работать read-only): «Установите новое приложение для удобной работы» → ссылка на `chestnye-mastera.ru/cabinet`.
- [ ] **Migration token flow**: старый PWA при загрузке делает auth check → если уже залогинен на `sfera-master.ru` → backend генерит one-time migration token → клиент перенаправляется на `chestnye-mastera.ru/cabinet/?mt={token}` → новый cabinet валидирует token и устанавливает свою сессию. Без re-login.
- [ ] **Telegram-bot ссылки**: все новые сообщения ведут на новый домен. Старые ссылки рабочие через 301.
- [ ] **Email/SMS templates**: обновлены на новые URLs.
- [ ] **Production deploy** в порядке:
  1. api-server: dual VAPID + 301-middleware
  2. marketplace: deploy с cabinet routes
  3. Env-vars обновлены на обоих сервисах
  4. Smoke-test E2E
- [ ] **Rollout**:
  - День 1-7: оба сайта работают, **soft-baner** на старом, мастера могут выбирать
  - День 7-14: на старом disable write-операции (read-only — можно посмотреть, но новые заказы оформлять только на новом)
  - День 14-21: 90%+ мастеров мигрировали → отключаем старый PWA полностью (404 + 301 на новый)
- [ ] **Мониторинг**:
  - Логи логинов на двух доменах
  - Конверсия push на двух VAPID
  - Ошибки auth → alert
  - Метрика «активных сессий старый vs новый» в Yandex.Metrika

**Результат недели 3**: мастера на новом домене, старый PWA disable. Можно начинать строить V1.5 контент-фичи в cabinet.

### 18.4. Решённые архитектурные вопросы

- ✅ **Shared session vs proxy**: shared cookie на `.chestnye-mastera.ru`. api-server отдаёт `Set-Cookie` с `Domain=.chestnye-mastera.ru` для master-сессий. CSRF через `SameSite=Lax` + double-submit token.
- ✅ **CSRF на write-роутах**: marketplace делает write-операции от лица мастера через CSRF-токен в headers + `SameSite=Lax` cookie. Backend проверяет.
- ✅ **Bundle size**: cabinet routes — отдельный chunk, не влияет на публичный bundle. Public `/master/{slug}` остаётся минимальным; редактирование — отдельный dynamic-imported chunk, грузится только когда `session.master.id === master.id` (server detected).
- ✅ **Аналитика**: marketplace использует **разные счётчики Метрики** для public-routes и cabinet-routes (или одну с тегированием). Не смешиваем.

### 18.5. Что НЕ меняется при миграции

- API-endpoints мастера (`/api/master-pwa/*`, `/api/masters/me/*` и т.д.) — все остаются как есть на `sfera-master.ru/api`. Backend не меняется.
- БД и доменная модель — без изменений.
- CRM — продолжает жить на `sfera-master.ru/crm`. Операторский override (§11.5), audit log, dispatching — без изменений.
- Existing `master_publication_log` — работает как есть.
- Существующие push-подписки — мигрируют через dual VAPID на 30 дней.

### 18.6. Связь с другими секциями плана

- **Все V1.5 контент-фичи** (§11.9 Master Motivation, §11.11 Каталог Идей в смысле тегирования, §11.13 Видео, §11.6 Журнал/статьи) — реализуются **в новом cabinet**, не в старом master-pwa.
- **§11.12 Дизайнеры** — V2 фича, использует ту же cabinet-инфраструктуру, добавляет `/cabinet/projects` и `/cabinet/qa` для роли «designer».
- **§3 (Доменная стратегия)** — правило «cookie-домены изолированы, marketplace stateless» убирается. Marketplace теперь auth-aware для cabinet routes.
- **§14 (Деплой)** — никаких новых доменов или DNS-операций. Marketplace получает auth-middleware и cabinet routes.
- **§17 (AI-дизайнер)** — UI AI-дизайна и для клиентов, и для интеграции в cabinet (мастер видит «AI-дизайны от моих клиентов»).

### 18.7. Связь с master-pwa-кодом — перенос детально

Текущая структура `artifacts/master-pwa/src/`:
```
src/
├── lib/
│   ├── api.ts          ← переедет в marketplace/lib/api-master.ts
│   ├── auth.ts         ← переедет в marketplace/lib/auth-master.ts
│   ├── useInstallPrompt.ts
│   └── ...
├── pages/
│   ├── Login.tsx       → /login (на marketplace, для мастеров отдельный flow)
│   ├── Home.tsx        → /cabinet/dashboard (с расширенными метриками V1.5)
│   ├── Orders.tsx      → /cabinet/orders
│   ├── Profile.tsx     → /cabinet/profile + интеграция с inline-edit на /master/{slug}
│   ├── Balance.tsx     → /cabinet/balance
│   ├── Chat.tsx        → /cabinet/chat
│   ├── Schedule.tsx    → /cabinet/schedule
│   ├── Checkin.tsx     → /cabinet/checkin
│   └── Portfolio.tsx   → расширяется в /cabinet/portfolio + /cabinet/videos + /cabinet/articles
└── components/
    ├── BottomNav.tsx   → переписывается под Next.js navigation
    └── ...
```

**Принцип переноса**: 1-в-1 функциональный паритет, с минимальной адаптацией под Next.js (Wouter → Next.js Router, no router state libs нужны). UI остаётся как был.

### 18.8. Метрики успеха миграции

День 7 после rollout (старый ещё работает):
- ≥40% мастеров залогинились на новом домене
- ≥70% push-нотификаций успешно доставлены через новый VAPID
- 0 критических ошибок auth/session

День 21 (cleanup полный):
- 100% мастеров мигрированы (новые сессии только на новом)
- Старый master-pwa дисейблен, 301 redirect стабилен
- Push, заказы, чаты, баланс — всё работает на новом домене
- Установлено баг-репортов <5 от мастеров

### 18.9. Что после миграции (V1.5 features pipeline)

После 3-недельной миграции — V1.5 контент-фичи строим **в cabinet, единожды**:

1. **Master Motivation Engine** (§11.9): `/cabinet/dashboard` с view/lead-метриками, completeness UX, лидерборд, ачивки.
2. **Каталог Идей**: `/cabinet/portfolio/{id}/edit` с тегированием room+style+building+color+materials. Backfill UX для existing кейсов.
3. **Видео**: `/cabinet/portfolio/{id}/video` для рум-туров. Auto-generation before/after в фоне.
4. **Журнал/статьи**: `/cabinet/articles` с TipTap редактором.
5. **Дизайнерская карточка** (V2): расширенные метаданные мастера (`/cabinet/profile/services` — бейджи, ценовые диапазоны).
6. **Cross-City Routing** (§11.10): больше backend, чем UX — но дашборд показывает inspiration credits в `/cabinet/dashboard`.

---


## 19. Top-funnel SEO стратегия: ЖК, калькулятор сметы, программное SEO

> **Главное стратегическое прозрение**: мы строим **не маркетплейс мастеров**, а **планировщик ремонта**. Авито/Профи закрывают bottom-of-funnel («найти мастера»), а top-of-funnel («сколько стоит», «дизайн в стиле X», «ремонт в ЖК Y») в РФ практически пустой. Top-funnel в 5-10× дешевле по CPC и в 5× больше по объёму запросов, при этом конвертится в более дорогие лиды (юзер не определился — мы его прогрели контентом и перехватили).

### 19.1. Воронка ремонта в России — 5 стадий

| Стадия | Где сейчас юзер ищет | Что мы предложим |
|---|---|---|
| **1. Inspiration** (увидел красивое) | Pinterest, INMYROOM, Лови Инсайт, YouTube | `/idei/*` (§11.11), `/ai-design/*` (§17), `/raboty/*` (§11.7) |
| **2. Planning** (сколько стоит) | ⚪ ПУСТОТА | `/kalkulyator`, `/ceny/{room}/{city}/{areaBand}` |
| **3. Decision tools** (как делать) | Yandex.Дзен, статьи, форумы | `/sovety/*` (§11.6), `/raboty/*` |
| **4. ЖК / новостройки** (планировки, бюджет под комплекс) | Циан, Самолёт, застройщик | `/zhk/{city}/{slug}` |
| **5. Find master** (выбрал и нанимаю) | Авито, Профи, Я.Услуги | `/master/{slug}`, «Хочу так же» |

Стадии 2-4 — наш main blue ocean. Все остальные крупные игроки воюют на стадии 5.

### 19.2. Каталог ЖК (Жилых Комплексов) — золотая жила

#### Концепция

Каждый ЖК (Жилой Комплекс / новостройка) = микро-портал ремонта вокруг конкретного дома:
- **Жилой Комплекс «Самолёт»** в Краснодаре — уникальная сущность с 1500 квартирами одинаковых планировок
- Юзеры покупают квартиру → ищут «дизайн квартиры в ЖК Самолёт», «ремонт в ЖК Самолёт», «планировка ЖК Самолёт» → **30-50 тыс запросов/мес по топ-100 ЖК России**
- Конкуренция низкая: Циан и застройщики не закрывают воронку до мастера, мы — закрываем

#### URL-схема

```
/zhk                                          — каталог ЖК (фид)
/zhk/{citySlug}                               — все ЖК города (топ-N городов)
/zhk/{citySlug}/{zhkSlug}                     — конкретный ЖК
/zhk/{citySlug}/{zhkSlug}/planirovka/{type}   — планировки этого ЖК
/zhk/{citySlug}/{zhkSlug}/{room}/{style}      — programmatic (когда ≥3 проекта)
/zhk/{citySlug}/{zhkSlug}/ceny                — расчёт стоимости ремонта в этом ЖК
```

Например: `/zhk/krasnodar/zhk-samolyot/evrodvushka-58m`

#### Анатомия страницы `/zhk/{citySlug}/{zhkSlug}`

```
[Hero block]
H1: ЖК «Самолёт» в Краснодаре — дизайн квартир и ремонт под ключ

  Фото комплекса (с сайта застройщика или user-submitted)
  Метаданные: район, год сдачи, кол-во квартир, тип (бизнес/комфорт/эконом)
  Координаты на карте

[Планировки этого ЖК]
  Студия 25 м² | 1-комн 38 м² | Евродвушка 58 м² | 3-комн 72 м²
  Каждая → /zhk/{city}/{zhk}/planirovka/evrodvushka-58m

[Стоимость ремонта в ЖК «Самолёт» (auto-расчёт)]
  Бюджетный: 1.5-2 млн ₽
  Стандарт: 2-3 млн ₽
  Премиум: 3-5 млн ₽
  Источник: средняя по {N} реальным ремонтам в этом ЖК + региональный коэф

[Реальные ремонты в этом ЖК]
  Карточки master_portfolio где zhk_id = current
  «Делаем ремонт здесь чаще остальных мастеров: топ-3 эксперта»

[AI-дизайны для типичных планировок ЖК]
  Карточки /ai-design/* с ar+style match

[Мастера-эксперты по этому ЖК]
  Топ-5 мастеров с ≥2 кейсов в этом ЖК

[Особенности ремонта в этом ЖК]
  - Тип несущих стен (монолит/панель/кирпич)
  - Высота потолков
  - Известные нюансы (тонкие перегородки, etc.)

[FAQ для этого ЖК]
  Сколько стоит ремонт в ЖК «Самолёт»?
  Какие планировки бывают?
  Где взять смету под мою квартиру?
  Какие материалы лучше для этого ЖК?

[CTA «Хочу ремонт в ЖК Самолёт»]
  Pre-filled форма: city=Краснодар, zhk_id=current
```

#### Расширение БД

Новая таблица `housing_complexes`:

```sql
CREATE TABLE housing_complexes (
  id              serial PRIMARY KEY,
  slug            varchar(150) UNIQUE NOT NULL,
  name            varchar(200) NOT NULL,
  developer       varchar(150),                    -- «Самолёт», «ПИК», «Эталон»
  city_id         integer NOT NULL REFERENCES cities(id),
  district        varchar(100),                    -- район
  address         text,                            -- юр. адрес
  lat             numeric(10,7),
  lng             numeric(10,7),
  built_year      integer,                         -- год сдачи
  segment         varchar(40),                     -- 'economy' | 'comfort' | 'business' | 'premium'
  building_type   varchar(40),                     -- 'monolith' | 'panel' | 'brick'
  ceiling_height  numeric(4,2),                    -- метров
  layouts         jsonb,                           -- [{type, area_min, area_max, count}]
  features        text[],                          -- ['открытые планировки', 'панорамные окна']
  developer_url   text,                            -- ссылка на сайт застройщика
  cover_photo_url text,
  photos          text[] DEFAULT '{}',
  description     text,                            -- для SEO body content
  
  -- Метаданные SEO:
  seo_title       varchar(70),
  seo_description varchar(180),
  
  -- Активность:
  is_published    boolean DEFAULT false,           -- оператор курирует
  
  created_at      timestamp DEFAULT now(),
  updated_at      timestamp DEFAULT now()
);

CREATE INDEX idx_zhk_city ON housing_complexes(city_id, is_published) WHERE is_published = true;
CREATE INDEX idx_zhk_slug ON housing_complexes(slug);

-- Связь с master_portfolio (мастер при публикации кейса указывает ЖК):
ALTER TABLE master_portfolio
ADD COLUMN zhk_id integer REFERENCES housing_complexes(id) ON DELETE SET NULL;

CREATE INDEX idx_portfolio_zhk ON master_portfolio(zhk_id, is_published) WHERE is_published = true;
```

#### Источники данных ЖК (bootstrap)

**V1 (топ-100 ЖК Краснодар + Москва, ручная курация)**:
- Оператор в CRM создаёт записи руками для топ-100 ЖК
- Источники для копи: открытые сайты застройщиков (Самолёт, ПИК, Эталон), Циан описания (с переписыванием), Яндекс.Недвижимость
- ~15-30 минут на ЖК → 200 ЖК = 50-100 часов работы оператора
- Это разовая инвестиция, потом master submitting-ом

**V1.5 (master-submitted)**:
- В кабинете мастера при публикации кейса есть поле «ЖК (если в новостройке)»
- Если ЖК уже есть в БД → выбор из списка
- Если нет → форма «Создать новый ЖК» → черновик → оператор подтверждает

**V2 (партнёрство с порталами недвижимости)**:
- API Циан / Яндекс.Недвижимость / DomClick — массовый импорт
- Парсинг открытых данных (если правовые риски минимальны)
- Автогенерация ЖК-страниц с Schema.org `Place` markup

### 19.3. Калькулятор сметы и ценовые landing-страницы

#### Концепция

Юзер вводит данные → получает диапазон стоимости + список мастеров → лид. Главный top-funnel вход.

#### URL-схема

```
/kalkulyator                                — главный калькулятор (фронт-form)
/ceny                                       — landing-страница «цены на ремонт»
/ceny/{room}                                — например /ceny/kuhnya
/ceny/{room}/{city}                         — /ceny/kuhnya/krasnodar
/ceny/{room}/{city}/{areaBand}              — /ceny/kuhnya/krasnodar/15m2-30m2 (programmatic)
```

#### UI калькулятора

```
[Калькулятор стоимости ремонта]

Город: [▾ Краснодар]
Тип помещения: [○ Квартира  ● Студия  ○ Дом]
Площадь: [____] м²
Категория: [○ Косметический  ● Евро  ○ Премиум]
ЖК (опц): [▾ выбрать или указать самому]

[Рассчитать →]

──────────────────────

Стоимость: 1 800 000 — 2 400 000 ₽

  Что входит:
  • Демонтаж: 80-120 тыс ₽
  • Электрика: 150-200 тыс ₽
  • Сантехника: 120-180 тыс ₽
  • Отделка: 800-1200 тыс ₽
  • Материалы: 500-800 тыс ₽
  
Срок: 60-90 дней

[Получить точную смету за 5 мин →]
   (12 мастеров готовы прислать индивидуальный расчёт)

[Похожие реальные ремонты]
  Кейсы из master_portfolio с похожими параметрами

[Мастера в Краснодаре, делающие такие ремонты]
  Топ-N
```

#### Источник данных для калькулятора

```sql
-- Псевдо-SQL для расчёта стоимости:
SELECT
  PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY price_total / area_sqm) AS p10,  -- бюджетный
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY price_total / area_sqm) AS p50,  -- медиана
  PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY price_total / area_sqm) AS p90   -- премиум
FROM master_portfolio
WHERE 
  city_id = $city_id
  AND room_type = $room_type
  AND area_sqm BETWEEN $area * 0.8 AND $area * 1.2  -- ±20%
  AND is_published = true
  AND completed_at >= NOW() - INTERVAL '12 months'   -- свежие данные
HAVING COUNT(*) >= 5;  -- минимум 5 кейсов для надёжности
```

Если кейсов < 5 — fallback на региональные коэффициенты × средние по типу помещения. Прямо обозначаем: «Расчёт по медиане 5 реальных ремонтов в Краснодаре» vs «Расчёт по средним региональным ценам (мало данных)».

#### Programmatic SEO landing-страниц

Страницы `/ceny/{room}/{city}/{areaBand}` генерятся **только если есть ≥5 кейсов** в комбинации. Иначе → 404 (не попадает в sitemap).

Анатомия landing-страницы:

```
H1: Сколько стоит ремонт {room} в {city} (площадь {areaBand})

[Калькулятор pre-filled]
  Город: Краснодар
  Тип: Кухня
  Площадь: 15-30 м²
  
[Стоимость по реальным данным]
  Медиана: X тыс ₽/м²
  Диапазон 80%: X-Y тыс ₽/м²
  Источник: {N} реальных ремонтов

[Распределение цен (chart)]
  Бюджетный (≤Y₽/м²): 30%
  Стандарт: 50%
  Премиум: 20%

[Реальные ремонты в этой категории]
  Карточки master_portfolio

[H2: Что входит в стоимость ремонта {room} {city}]
  Шаблонный текст для room_type (200-400 chars)

[H2: Сколько стоят отдельные виды работ в {city}]
  Демонтаж: X-Y ₽/м²
  Электрика: X-Y ₽/точка
  Сантехника: X-Y ₽/точка
  Отделка: X-Y ₽/м²

[FAQ]
  Шаблонные вопросы для типа помещения
```

**Защита от шаблонности**: каждая landing-страница должна иметь ≥4 уникальных сигнала:
1. ✅ Реальные числа из БД (не средние)
2. ✅ Список реальных кейсов (карточки)
3. ✅ Реальные мастера в этом городе/услуге
4. ✅ Распределение цен (chart на основе данных)
5. опц. H2-описание (шаблонное по типу помещения, но с подстановкой данных)
6. опц. FAQ (шаблонные вопросы, но с подстановкой city/room)

Если для комбинации хоть один из 4 первых сигналов отсутствует — страница не публикуется.

### 19.4. Программное SEO правила и защита

#### Когда генерим страницу, когда 404

| Критерий | Минимум для публикации |
|---|---|
| Уникальные данные на странице (не шаблон) | ≥4 из 6 сигналов |
| Связанные кейсы / AI-проекты | ≥3 |
| Реальные мастера в категории | ≥1 |
| `noindex` если нет данных | автоматически |

#### Структура sitemap

Расширение существующих sub-sitemaps (см. §11.8.8):

```
/sitemap-zhk-{N}.xml         — все опубликованные ЖК (~5000 ЖК России × N pages = 50000 URLs)
/sitemap-ceny.xml            — все ценовые landing
/sitemap-ai-design-{N}.xml   — AI-проекты (доступны после публикации)
```

#### Защита от шаблонной AI-генерации

**Никакой AI-генерации title/description** для этих страниц — только шаблоны с подстановкой реальных данных:

```ts
// lib/seoMeta.ts — расширение
export function buildZhkMeta(zhk: HousingComplex, stats: ZhkStats): BuiltMeta {
  // Шаблон с подстановкой:
  return {
    title: `ЖК «${zhk.name}» в ${zhk.city.nameIn} — дизайн и стоимость ремонта`,
    description: `${stats.realCases} реальных ремонтов в ЖК «${zhk.name}». Стоимость от ${formatPrice(stats.minPrice)} ₽. Топ-${stats.topMasters} мастеров. Планировки и AI-дизайны.`,
  };
}

export function buildCenyMeta(opts: { room, city, areaBand, stats }): BuiltMeta {
  return {
    title: `Сколько стоит ремонт ${opts.room.nameGenitive} ${opts.areaBand} в ${opts.city.nameIn} 2026`,
    description: `Реальная стоимость ремонта ${opts.room.nameGenitive} ${opts.areaBand} в ${opts.city.nameIn}: от ${formatPrice(opts.stats.p10)} до ${formatPrice(opts.stats.p90)} ₽/м². По данным ${opts.stats.casesCount} реальных проектов.`,
  };
}
```

### 19.5. Внутренние ссылки между типами top-funnel страниц

```
/idei/{room}/{style}
   ├──→ /raboty (кейсы в этом стиле)
   ├──→ /ai-design (AI-проекты в этом стиле)
   ├──→ /ceny/{room}/{city} («сколько стоит»)
   └──→ /zhk (ЖК где делают такой стиль)

/zhk/{city}/{zhk}
   ├──→ /raboty (кейсы в этом ЖК)
   ├──→ /ai-design (AI-проекты для типичных планировок)
   ├──→ /ceny (стоимость в этом ЖК)
   ├──→ /master (мастера-эксперты)
   └──→ /idei (идеи для квартир этого ЖК)

/ceny/{room}/{city}
   ├──→ /raboty (кейсы в этой категории)
   ├──→ /idei (идеи в этой категории)
   ├──→ /zhk (ЖК где делают такие)
   └──→ /master (мастера в этой категории и городе)

/ai-design/{slug}
   ├──→ /master (мастер, который воплощает похожее)
   ├──→ /raboty (похожие реальные)
   ├──→ /ceny (стоимость такого ремонта)
   └──→ /zhk (если связан с ЖК)
```

Это создаёт **плотный internal-linking-граф**, который Яндекс ранжирует выше, чем плоские страницы.

### 19.6. Метрики успеха top-funnel

V2 (через 6 месяцев):
- ≥200 ЖК страниц в индексе (топ-50 городов × топ-4 ЖК)
- ≥1000 ценовых landing-страниц с реальными данными
- ≥2000 AI-проектов опубликованы
- Top-funnel ≥30% всего органического трафика
- Конверсия `/kalkulyator` → лид ≥3%

V2.5 (через 12 месяцев):
- ≥1000 ЖК страниц в индексе (топ-300 городов)
- ≥10000 AI-проектов
- ≥50 layered страниц (AI + реальный ремонт)
- Top-funnel ≥50% всего органического трафика
- Конверсия `/kalkulyator` → лид ≥5%

V3 (через 18-24 месяцев):
- Доминирование в нише top-funnel «планирование ремонта»
- 60% всех новых клиентов приходят через top-funnel
- ЖК-вертикаль работает как источник для девелоперов (партнёрства)

### 19.7. Что НЕ делаем

1. **AI-генерация title/description** — только шаблоны с подстановкой реальных данных. Защита от деранжирования.
2. **Страницы без данных** — лучше 404, чем тонкая страница (Яндекс ранжирует домен по средней качеству страниц).
3. **Парсинг конкурентов** для bootstrap данных — копирайтные риски + дубликат-контент. Только открытые источники + ручная курация + user-submitted.
4. **Программная генерация для всех 100k комбинаций** — только для тех, где есть данные. Динамическая генерация sitemap по фильтру `WHERE casesCount >= 5`.

### 19.8. Связь с другими секциями плана

- **§11.7 (кейсы)** — каждый кейс получает поле `zhk_id` (опционально), попадает в каталог ЖК
- **§11.8 (SEO meta)** — шаблоны для ЖК и ценовых страниц через `lib/seoMeta.ts`
- **§11.10 (cross-city)** — для ЖК matching работает: юзер из Москвы видит проект в ЖК «Москва-Сити» и может оставить заявку (мастера автоматически из московских)
- **§11.11 (Идеи)** — ЖК добавляет ещё одну ось таксономии (room × style × zhk)
- **§17 (AI-дизайнер)** — AI-проекты могут быть привязаны к ЖК (`zhk_id` поле в `designs`)
- **§16 (Фазовый план)** — top-funnel секции — это **V2-V2.5 фаза**, после Cabinet Migration и базовых V1.5 контент-фич

---

> Конец плана. Готов обсудить детали или начинать **Cabinet Migration**.


---

## 20. Публичный редизайн под top-funnel-first (V1.5)

> **СТАТУС**: блокирующая задача V1.5 параллельно с **Cabinet Migration (§18)**. Текущий дизайн главной (`/`) построен под позиционирование «найти проверенного мастера» — это bottom-funnel модель Авито/Профи. Новая стратегия (§1, §11, §17, §19) — **планировщик ремонта**, а не маркетплейс мастеров. Публичный UX должен это отражать.
>
> **Сроки**: 2-3 недели итеративно, параллельно с Cabinet Migration. Начинаем с Hero и каскадом достраиваем остальные блоки.

### 20.1. Контекст и проблема

**Текущая главная (Production V1, файл `artifacts/marketplace/app/page.tsx`):**

- Hero: «Найдите проверенного мастера для ремонта» — bottom-funnel позиционирование, конкурирует с Авито/Профи
- Один CTA «Выбрать услугу» → требует от юзера знать что искать
- Грид 9 услуг типа «Демонтажные работы», «Электромонтаж» — skilled trades, не визуальные категории комнат
- 3 чипа городов как теги (без визуального ранжирования)
- Абстрактные «Как это работает» 1-2-3 без отличия от Авито/Профи/Я.Услуги
- Нет фото, нет идей, нет AI-дизайнера в видимости, нет ЖК, нет калькулятора
- CTA «Оставить заявку» в шапке — для уже определившегося клиента, не для исследователя

**Что не работает для новой стратегии (top-funnel-first per §19.1):**

1. **Hero — bottom-funnel.** Конкурируем с Авито/Профи на их поле. Юзер на стадии Inspiration / Planning (наш main blue ocean) не находит вход.
2. **Нет визуального контента.** Главная фишка Houzz/Pinterest/Лови Инсайт — фото на первом экране. Без визуала непонятно за что платформа.
3. **AI-дизайнер только в навигации.** Killer feature (§17) должна быть отдельным блоком на главной с демо «фото комнаты → AI-рендер → реальное после».
4. **ЖК / новостройки отсутствуют.** Юзер из ЖК «Самолёт» (большой сегмент — §19.2) не видит привязки.
5. **Калькулятор отсутствует.** Один из самых частых запросов «сколько стоит ремонт» (§19.3) — нет точки входа.
6. **Однотипные категории.** Все услуги из одной плоскости. Нет верхнеуровневых «Кухня / Ванная / Спальня» — то что юзер реально ищет.
7. **Пустой trust block.** Нет цифр (рейтинг, кол-во ремонтов, договор) — для снятия страхов.

### 20.2. Целевая структура главной (12 блоков)

```
[1] HEADER (sticky)
    Logo · Идеи · Работы · AI-дизайн · ЖК · Цены · Войти
    Mobile: Logo · ☰ menu · 🌍 Город

[2] HERO (multi-CTA, не один путь)
    H1: Спланируйте ремонт от идеи до мастера
    Sub: Бесплатно. За 5 минут. Без агрегаторов.

    3 равноценных входа:
    [🎨 Идеи]  [✨ AI-дизайн]  [💰 Калькулятор]

    Background: реальные фото ремонтов когда есть, иначе градиент-плейсхолдер.

[3] ИДЕИ — Pinterest-style masonry  (СКРЫТ если кейсов < 6)
    H2: Найдите дизайн, который вам нравится
    Категории-чипы: 🍳 Кухня · 🛁 Ванная · 🛋 Гостиная · 🛏 Спальня · ...
    4-column masonry grid с реальными кейсами
    На карточке: цена · м² · город · бейдж стиля
    Hover: «Хочу так же»

[4] AI-ДИЗАЙН — showcase block  (СКРЫТ до запуска AI-фичи §17)
    H2: Ваша комната → Ваш дизайн → Ваш мастер
    Demo-карусель: «до фото / AI-рендер / реальное после»
    Bullets: 3 рендера бесплатно · 4-6 ракурсов · мастер для воплощения
    [Попробовать бесплатно →]

[5] ЖК / НОВОСТРОЙКИ — geo-aware  (СКРЫТ если в городе юзера 0 ЖК)
    H2: Готовые проекты под ваш ЖК
    Карусель ЖК-карточек: name · кол-во проектов · от ${minPrice} ₽

[6] КАЛЬКУЛЯТОР — мини-форма прямо на главной
    H2: Узнайте бюджет за 30 секунд
    Форма: Город ▾ · Тип ▾ · Площадь
    Результат in-place: Стоимость X-Y млн ₽ · Срок Z-W дней
    [Получить точную смету →] → /kalkulyator с pre-fill

[7] РАБОТЫ МАСТЕРОВ  (СКРЫТ если кейсов < 3)
    H2: Реальные ремонты с фото до и после
    Grid 3×N кейсов из master_portfolio
    [Все работы →]

[8] ТОП-МАСТЕРА в городе юзера
    H2: Топ мастера в вашем городе
    Grid 4×N с фото-аватарами и рейтингом
    [Все мастера →]

[9] КАК ЭТО РАБОТАЕТ — новая воронка
    1. Найдите идею         🎨 Просматривайте реальные ремонты
    2. Визуализируйте       ✨ AI-дизайн из фото вашей комнаты
    3. Узнайте бюджет       💰 Расчёт по реальным сделкам
    4. Найдите мастера      👷 Подберём 5 проверенных в городе

[10] TRUST BLOCK
    ★ {avg_rating} средний рейтинг
    📊 {completed_count} завершённых ремонта
    🛡 Договор с каждым мастером
    💸 Без авансов до старта работ

[11] ДЛЯ МАСТЕРОВ — кросс-промо
    Получайте заявки в своём городе бесплатно
    [Стать мастером →] → sfera-master.ru/masteram

[12] FOOTER
    Как сейчас + новые ссылки: /idei, /raboty, /zhk, /kalkulyator, /ai-design
```

### 20.3. Принципы дизайна

1. **Multi-CTA, не single CTA.** Юзеры на разных стадиях воронки. Hero даёт 3 равноценных входа: Идеи / AI / Калькулятор.
2. **Visual-first.** Каждый блок имеет реальные фото. Меньше текста, больше изображений.
3. **Top-funnel приоритет.** Идеи / AI / Цены / ЖК — на первых экранах. «Найти мастера» — внизу. Юзер дойдёт когда созреет.
4. **Mobile-first.** Большая часть юзеров — мобильные. Bottom-nav для удобства. Sticky filter chips на /idei.
5. **Геолокация.** При первом заходе детектим город (cookie + GeoIP per §11.10.3). Дальше всё локализовано: «Топ мастеров в Краснодаре», «ЖК Краснодара», «Стоимость в Краснодаре».
6. **Дружелюбие, не формальность.** Не «Найдите проверенного мастера», а «Спланируйте ремонт». Помогающий тон.
7. **Доверие через цифры.** Trust block с реальными метриками — снимает страхи.
8. **Брендовая консистентность.** Зелёный остаётся (`#0d9488`). Типографика — Plus Jakarta Sans (как master-pwa). Акцентный цвет — тёплый янтарный/коралловый для CTA против зелёного фона (выбор в процессе итераций).
9. **Производительность.** WebP/AVIF, lazy-load, blur-placeholder. LCP < 2.5s на mobile, CLS < 0.1.
10. **Антишаблонность с graceful demo fallback.** Пустых заголовков с «скоро будет» не показываем. Если опубликованных кейсов недостаточно для блока — заполняем CC0 stock-фото с явной маркировкой «Пример» / «Стилевой референс». Цены и имена мастеров на демо-картах не показываем (без фейков). По мере накопления реальных работ они автоматически вытесняют демо.

### 20.4. Зафиксированные решения

- ✅ **Позиционирование**: «Спланируйте ремонт» (planner), не «Найдите мастера» (marketplace)
- ✅ **Брендинг**: зелёный `#0d9488` остаётся, логотип не меняем (placeholder-кружок ещё в V1.5), шрифт Plus Jakarta Sans (как master-pwa). Акцентный цвет агент подбирает по эстетике итеративно.
- ✅ **Фото-стратегия**: **до 50+ собственных опубликованных кейсов используем Unsplash/Pexels CC0** для placeholder. Это даёт визуальную плотность с первого дня (без фото сайт ощущается как «пустой»). Каждый stock-снимок маркируем «Пример» / «Стилевой референс» — без фейковых цен и имён мастеров. По мере публикации реальных работ автоматически вытесняют демо. К моменту 50+ реальных кейсов — полностью отключаем демо-фид. Атрибуции CC0 не требует, но в Footer добавляем дискретный кредит «Изображения‑референсы — Unsplash».
- ✅ **Антишаблонность переформулирована**: блок скрывается только если ни реальных кейсов, ни демо-плейсхолдеров нет (например, при ошибке загрузки). Пустых заголовков «скоро будет» — не показываем.
- ✅ **PWA, не native**. Cabinet уже PWA (§18). Native app — V3+ когда есть аудитория.
- ✅ **Процесс**: Вариант A с inline-iteration (= Вариант E). Дизайн прямо в Tailwind, по одному блоку, deploy на prod (Railway autodeploy в main). Без Figma. Без покупки Tailwind UI template (fallback если первый Hero провалится).

### 20.5. Этапы реализации (итеративно по блокам)

| Итерация | Блок | Прибл. срок | Зависимости |
|---|---|---|---|
| 1 | **Hero** — multi-CTA, новый H1, градиент-фон | 2-4ч | — |
| 2 | **Header** sticky + новая навигация (Идеи/Работы/AI-дизайн/ЖК/Цены/Войти) | 1-2ч | Cabinet auth для «Войти» (§18 W1 готов) |
| 3 | **Trust block** + реальные цифры из БД | 2-3ч | API endpoint: `/api/marketplace/stats` (count + avg rating) |
| 4 | **Как это работает** (новая воронка 4 шага) | 1-2ч | — |
| 5 | **Топ-мастера в городе** (geo-aware) | 2-3ч | Geo-detection middleware (§11.10.3) |
| 6 | **Работы grid** (real cases, скрыт если < 3) | 2-3ч | Reuse `/api/marketplace/raboty` |
| 7 | **Калькулятор** мини-форма на главной | 4-6ч | API: расчёт по PERCENTILE из master_portfolio (§19.3) |
| 8 | **Footer** обновление + новые ссылки | 1ч | После итераций 1-7 |
| 9 | **ЖК carousel** | 4-6ч | §19.2 БД-миграция housing_complexes |
| 10 | **Идеи Pinterest masonry** | 6-8ч | §11.11 БД-миграция (room_type, style_tags) |
| 11 | **AI-дизайн showcase** | 2-3ч | После запуска AI-фичи §17 |

**Итерации 1-8** — V1.5 без новых БД-миграций (можно сразу). **9-11** — после соответствующих миграций.

### 20.6. Внутренние страницы (минимум для согласованности)

После главной — переверстать те же принципы для:

- **`/idei`** + **`/idei/{room}/{style}`** — Pinterest masonry, реализуется в §11.11 (V1.5 после миграции тегов)
- **`/raboty`** — фид кейсов уже есть, нужен Pinterest-style refresh
- **`/raboty/{slug}`** — страница кейса уже есть, нужен polish (улучшение галереи, доп. CTA «Хочу такую же»)
- **`/master/{slug}`** — карточка мастера, нужен redesign под Houzz-стиль (бо́льший приоритет работам)
- **`/ai-design/{slug}`** — V2-V2.5 после запуска AI-фичи §17
- **`/zhk/{city}/{slug}`** — V1.5 после миграции ЖК §19.2

### 20.7. Что НЕ делаем в этой итерации

1. **Не покупаем Tailwind UI template.** Сначала делаем сами по итерациям — если Hero и Идеи получаются красиво, не нужен. Если первые 2-3 блока выглядят утилитарно — fallback на Tailwind UI Marketing ($349) или Vercel Templates.
2. **Не нанимаем дизайнера.** Внешний дизайнер — V2 если масштаб вырастет.
3. **Не делаем dark mode toggle.** Опция, но не V1.5. Добавим если будут реквесты.
4. **Не делаем Figma-мокапы.** Если итерации в коде не дают результата — тогда Figma. Не упреждающе.
5. **Не делаем native app.** PWA достаточно. Cabinet (§18) и публичная часть имеют bottom-nav и manifest для установки на homescreen — это даёт нативное ощущение.

### 20.8. Связь с другими секциями плана

- **§1 (Позиционирование)** — этот редизайн **операционализирует** «российский Houzz с проверенными ценами и прямой связью с мастером». Hero и весь UX переведены под planner-first логику.
- **§11.7 (Кейсы)** — блок «Работы» на главной показывает превью `/raboty` фида.
- **§11.11 (Идеи)** — блок «Идеи» на главной = превью `/idei/*` каталога.
- **§17 (AI-дизайнер)** — блок AI-дизайн в Hero и на главной. Плотная интеграция «фото комнаты → дизайн → мастер».
- **§18 (Cabinet Migration)** — cabinet строится параллельно. Кнопка «Войти» в Header ведёт на `/login` (готов после W1). Из cabinet есть кнопка «На сайт» обратно (готова в `CabinetTopbar`).
- **§19 (Top-funnel SEO)** — блок «ЖК» и «Калькулятор» на главной — это входы в `/zhk/*` и `/kalkulyator`/`/ceny/*` страницы из этой секции.

### 20.9. Метрики успеха редизайна

| Метрика | До (текущая) | Цель V1.5 (3 мес после редизайна) |
|---|---|---|
| Bounce rate главной | ~70% | ≤55% |
| Среднее время на сайте | ~30s | ≥1:30 |
| % юзеров, посетивших ≥2 страницы | ~25% | ≥45% |
| Lighthouse Performance (mobile) | ~80 | ≥90 |
| Lighthouse SEO (mobile) | ~90 | ≥95 |
| Конверсия в лид (от посещений главной) | ~1% | ≥2.5% |
| Клик в Hero CTA «Идеи» | n/a | ≥30% (top entry) |
| Клик в Hero CTA «AI-дизайн» | n/a | ≥20% |
| Клик в Hero CTA «Калькулятор» | n/a | ≥15% |
| % сессий с просмотром ≥1 кейса (`/raboty/{slug}`) | n/a | ≥35% |

### 20.10. Mobile адаптация

```
[Header sticky]              Logo · ☰ · 🌍 Город
[Hero compact]               Заголовок + sub + 3 кнопки в строку
                             горизонтальный скролл если не помещаются
[Идеи]                       2-column masonry, sticky filter chips
[AI-дизайн]                  full-width стек
[ЖК]                         horizontal scroll-rail
[Калькулятор]                форма full-width
[Работы]                     1-2 column
[Мастера]                    2-column
[Trust block]                2×2 grid цифр
[Bottom nav sticky]          🏠 · 🎨 Идеи · ✨ AI · 💰 Цены · 👤 Кабинет
```

Bottom-nav на мобиле — единый паттерн с Cabinet shell (§18.2). Это даёт ощущение «приложения» без native.


---

## 21. Tone of Voice и AI Content Style Guide (V1.5+)

Любой текст, генерируемый ИИ за мастера или клиента (описания кейсов, bio, публичные карточки, статьи в каталоге Идей, заголовки), должен звучать как написанный конкретным человеком-практиком, а не как продукт LLM. Это **обязательный** уровень качества. Тексты, не прошедшие чек-лист, не публикуются.

### 21.1. Зачем это критично

1. **SEO**. Google Helpful Content Update (март 2024) и Yandex прицельно режут массово-генерируемый контент. Текст, который AI-детекторы (GPTZero, Originality.ai, Тест на ИИ) идентифицируют как машинный, рискует не попасть в выдачу или быть пессимизирован.
2. **Доверие**. Интерьерный сервис со роботизированными описаниями автоматически воспринимается клиентом как агрегатор, а не как премиум-планировщик. Bookmark-rate падает, конверсия в заявку падает.
3. **Узнаваемость голоса**. Все статьи в каталоге Идей, все bio мастеров, все описания кейсов — единый голос «эксперта-практика», а не безликая корпоративная подача. Brand voice, а не SEO-помойка.

### 21.2. Чек-лист «звучит как человек»

#### НЕ использовать

**Клишированные вступления / переходы:**
- «В этой статье разберём…», «Перед тем как…», «Стоит отметить…»
- «При этом», «В то же время», «Более того», «К тому же», «Таким образом»
- «Кроме того», «Также важно», «Следует учитывать»

**Канцеляризмы:**
- «Является», «представляет собой», «относится к…», «осуществляется»
- «Способствует», «обеспечивает», «выполняет функцию»

**AI-эпитеты-пустышки:**
- «Эффективный», «оптимальный», «комплексный», «качественный», «современный», «инновационный» — как самостоятельные характеристики без предметного содержания

**Конструкции LLM-ритма:**
- «Не только X, но и Y» чаще одного раза на тысячу знаков
- Em-dash (—) как универсальный соединитель: AI злоупотребляет, ставит вместо запятой / двоеточия / точки. Использовать сдержанно, в одной из четырёх позиций
- Симметричные параллельные списки (4–5 пунктов одинаковой длины подряд)
- Идеально-структурированные параграфы с равной длиной (5–7 строк каждый)
- Стандартные итоговые формулы «Итак», «Подводя итог»

#### Использовать

**Личный голос практика:**
- «По моему опыту», «видел десятки случаев», «проверено», «из практики», «встречал»
- Иногда «я как-то делал…», «у меня была клиентка…», «помню, был объект…»
- Авторская оценка: «это плохой знак», «однозначно да», «не делайте так»

**Конкретику:**
- Реальные марки материалов: Cersanit, Knauf, Litokol, Grohe, Hansgrohe
- Конкретные локации: «Кунцево», «Юго-Запад», «панельный дом», «5-этажка в центре»
- Точные числа, не округлённые: 180 000 ₽, не 200 000. 4,2 м², не «около пяти». 14 дней, не «две недели»
- Имена-обстоятельства в анекдотах: «клиентка собиралась в 230, вышло 275»

**Разговорные обороты (умеренно):**
- «Грубо говоря», «тут такой момент», «имейте в виду», «забейте», «упирается в кошелёк»
- «Запарываются», «косячат», «проседает», «лажают», «уезжает вправо» (про сроки)
- «Сюрприз был», «сама собой», «вроде ничего», «нормальная бригада»

**Сомнения и оговорки:**
- «Обычно», «плюс-минус», «по-разному бывает», «в среднем»
- «Процентов сорок» вместо «40%» в прозе (% работают в сметах и таблицах)
- «Раза в полтора-два», «тысяч сорок может выйти»

**Микро-отступления и легкий humor:**
- 1–2 предложения сбоку от темы, иногда self-deprecating
- Пример: «Полы мокрые, стены мокрые, иногда соседи сверху мокрые тоже»
- Не натужно, не смешно ради смешного — просто живая интонация

**Неравномерный ритм:**
- Длинные предложения чередуются с короткими (3–5 слов)
- Парцелляция: «Реальный кейс. Не выдумка.»
- Где-то абзац на 4 строки, где-то на 12

**Структурные неровности:**
- Нумерованный список прерывается прозой между пунктами
- Где-то 3 пункта, где-то 7
- Где-то списком, где-то тем же содержанием прозой

### 21.3. Системный промпт для AI-генерации контента

Базовый системный промпт, который **обязательно** используется во всех точках генерации (описания кейсов, bio мастеров, статьи каталога Идей):

```
Ты пишешь на русском как опытный мастер-практик / прораб с 10+ лет работы 
в ремонте, не как корпоративный копирайтер и не как LLM. Твой голос — 
тёплый, конкретный, с лёгкой самоиронией, но без панибратства. Ты делишься 
опытом, а не «генерируешь полезный контент».

ОБЯЗАТЕЛЬНЫЕ требования к тексту:

1. Личный голос. Используй обороты «по моему опыту», «видел много раз», 
   «из практики», «как-то была клиентка», «у меня был объект». 
   Авторская оценка приветствуется: «не делайте так», «однозначно да».

2. Конкретные детали вместо общих фраз. Если упоминаешь материалы — 
   реальные марки (Cersanit, Knauf, Litokol, Grohe). Если говоришь 
   о цифрах — точные, не округлённые до десятков тысяч. Если ссылаешься 
   на случай — детали локации, площади, сроков.

3. Неравномерный ритм. Чередуй длинные предложения с короткими 
   (3–5 слов). Парцелляция допустима. Один абзац может быть на 3 строки, 
   следующий — на 10. Симметрия абзацев — признак LLM, избегай.

4. Списки и нумерация — не везде. Где органично прозой, оставляй прозу. 
   В нумерованном списке: 3 пункта могут перейти в абзац рассуждений, 
   потом снова появиться 5 пунктов. Не делай 4 равных пункта подряд.

5. Сомнения и оговорки в нужных местах: «обычно», «плюс-минус», 
   «по-разному бывает», «в среднем». Это сигналы живого опыта.

6. Микро-отступления допустимы: лёгкая шутка в скобках, замечание 
   сбоку темы. Не смешно ради смешного — но интонация живая.

ЗАПРЕЩЕНО:

- Клише: «В этой статье разберём», «Стоит отметить», «При этом», 
  «Таким образом», «Подводя итог», «Не только X, но и Y» (чаще 1 раза 
  на 1000 знаков), «Кроме того», «Также важно».
- Канцеляризм: «является», «представляет собой», «осуществляется», 
  «обеспечивает».
- Пустые эпитеты: «эффективный», «оптимальный», «качественный», 
  «комплексный», «современный», «инновационный» — без предметного 
  содержания.
- Em-dash (—) как универсальный связной знак. Используй сдержанно, 
  одна позиция из четырёх.
- Идеально-симметричные структуры: одинаковые по длине абзацы, 
  одинаковые по длине пункты списков.
- Корпоративная подача и продажная интонация. Никакого 
  «доверьте профессионалам», «свяжитесь с нами», «мы поможем».

ФОРМАТ ОТВЕТА:

Только готовый текст без преамбулы, без объяснений, без 
«вот ваш текст». Никакого markdown, кроме случаев, где запрос 
явно требует структуру (заголовки H2, списки в инструкции).
```

### 21.4. Точки применения

Системный промпт прописать в:

| Файл / endpoint | Что генерится | Раздел плана |
|---|---|---|
| `prompts/master-description.txt` + `aiContent.ts` `assembleDescription` / `smoothDescription` | Описания кейсов мастера в портфолио | §11.5 |
| `prompts/master-bio.txt` (новый) | Bio для публичной карточки мастера | §11.5 (расширение), §22 (предлагаемый bio-генератор) |
| `prompts/case-from-photos.txt` (новый) | Vision-flow: 3 варианта заголовка + 3 варианта описания из фото | §17 (предлагаемый Vision-flow) |
| `prompts/article-writer.txt` (новый) | Длинные SEO-статьи в каталог Идей | §11.11, §19 |
| `prompts/service-description.txt` (новый) | Описания типов услуг (отделочные, сантехника) | §19 |
| `prompts/city-page-content.txt` (новый) | Текстовые блоки для programmatic SEO city-страниц | §19.4 |

### 21.5. Тестирование AI-детекторами

**Перед публикацией каждого нового prompt template** — прогон через минимум 2 детектора:

- GPTZero (web)
- Originality.ai (web, платно)
- Тест на ИИ (ru-сервис, бесплатный) — для русского работает лучше всего

Целевой показатель: **≥ 80% «вероятность написания человеком»** на каждом из детекторов. Если ниже — итерируем промпт, добавляем shot-examples с уже прошедшими текстами в few-shot.

### 21.6. Хранилище эталонов

В `prompts/few-shot/` лежат 5–10 эталонных текстов, которые прошли все детекторы. AI-генерация может их использовать как примеры стиля (few-shot prompting). Первый эталон — статья «Ремонт ванной под ключ в 2026: цифры, этапы и где обычно лажают» — написана 18.06.2026, прошла детекторы как «100% человек».

При расширении prompt-библиотеки — каждая новая категория (case description, bio, city page) набирает по 2–3 своих эталона.

### 21.7. Связь с другими разделами

- §11.5 «Помощник описания кейса» — расширяется: текущий smoothDescription дополняется системным промптом из §21.3
- §17 «AI-дизайнер» — расширяется vision-flow с тем же тоном
- §19 «Top-funnel SEO» — все статьи каталога Идей проходят через §21
- §11.7 «Standalone /raboty/[slug]» — описания кейсов на этих страницах = главный SEO-актив, для них стиль-гайд критичен

### 21.8. Что НЕ делаем (анти-паттерны)

- Не пишем «брендбук-документ» с 30 страницами правил. Один промпт + чек-лист + эталоны — достаточно.
- Не блокируем мастера, если AI на его кейсе сгенерил так-сяк. Мастер всегда может править / писать сам / откатить к шаблону без AI.
- Не используем стиль-гайд как маркетинговый stunt («наши тексты пишут люди!»). Это внутренняя гигиена, не reklama.


---

## 21.9. Финальное решение по визуальному тону (V1.5)

После четырёх итераций (editorial → cozy → scandi → portal) утверждён **portal-grade** направление. Реализован в commit `f5ffa627` от 18.06.2026.

### Базовые принципы

1. **Категория продукта**: национальный портал, а не бутик. Референсы: Госуслуги, Сбер, Profi.ru, Yandex.Services, ЦИАН. Не Houzz, не The Spruce, не Apartment Therapy.

2. **Палитра**:
   - **Primary** — глубокий бренд-зелёный `#0E7C5E` (Sber-класс, не teal-marketplace, не Avito-lime, не Yandex-yellow). Используется на CTA, ссылках, focus-rings, активной навигации.
   - **Background** — чистый светло-серый `#F8FAFC`. Surfaces — белые `#FFFFFF`.
   - **Text** — графит `#0F172A`. Muted `#475569`. Faint `#94A3B8`.
   - **Border** — стандартный slate `#E2E8F0` / `#CBD5E1`.
   - **Cream-deep alt** — холодный серый `#F1F5F9` для альтернативных секций.
   - **Status**: warning warm-amber `#B45309`, danger oxblood `#B91C1C`.

3. **Типографика — sans-only**:
   - **Manrope** — единственный шрифт. Body, headings, кнопки, цифры, всё.
   - Класс `.font-editorial` остался для back-compat, но рендерит sans heavy heading.
   - Никаких serif, никакого handwritten. Эти шрифты автоматически читаются как «бутик / журнал / блог», что противоречит позиционированию портала.

4. **Геометрия**:
   - `--radius-card: 8px` (rounded-md) для карточек.
   - `rounded-lg` для primary CTA, `rounded-md` для secondary.
   - `rounded-full` только для chips.
   - Photo radius `rounded-lg`, не больше.

5. **Тени**: нейтральные cool, не warm. Утилитарный lift через `.shadow-cozy` / `.shadow-cozy-md`. Класс остался для back-compat, цвет тени cool grey.

### Принципы построения страниц

- **Hero — функциональный**. Поисковая форма как primary action, не декоративный коллаж. Заголовок умеренный (text-3xl/4xl, не text-7xl). Стат-цифры платформы inline под заголовком.
- **Quick-pick chips** под формой — 12+ популярных категорий и направлений.
- **Высокая плотность** — карточек на экран столько, сколько помещается. Не magazine spread с большим воздухом.
- **Главное в первом экране** — поиск, цифры, основные категории. Кейсы / how-it-works / master cards — ниже.
- **Никаких** gradient backgrounds, blob shapes, decorative blobs, pulsing dots, handwritten badges, pull-quote borders, magazine eyebrows стиля «Идеи · Реальные ремонты · ИДЕИ ПО КОМНАТАМ».
- **Eyebrow labels** — структурные uppercase tracked sans, не handwritten.

### Применение

Все публичные страницы должны соответствовать этим принципам:

| Страница | Состояние |
|---|---|
| `/` (главная) | ✅ Реализовано в `f5ffa627` |
| `/raboty` (listing) | Использует те же tokens — переезжает автоматически. Может потребовать point-fix (`font-editorial` → визуальная проверка) |
| `/raboty/[slug]` | Тот же путь — токены подхватятся. Magazine layout с pull-quote отзыва оставляем, но микро-полировка `font-eyebrow` → может пожелать «КАТЕГОРИЯ · ГОРОД» вместо handwritten |
| `/master/[slug]` | Полировка под portal: убрать magazine-разворот, добавить плотный hero-info, грид кейсов |
| `/uslugi`, `/mastera` | Те же tokens; добавить плотности и фильтрацию |
| `/[serviceSlug]/[citySlug]` SEO | Те же tokens; усилить SEO-блоки (FAQ, breadcrumbs, текст) |
| `/kalkulyator` | Те же tokens; доработать формы как portal-grade |
| Cabinet (`/cabinet/*`) | Минор: цвета через токены, layout не трогаем (master работает быстро, не нужен editorial) |

### Что НЕ возвращать никогда

- Spectral / Lora / Fraunces / Caveat / handwritten шрифты
- Tерракоту, eucalyptus, cream/warm-bone оттенки в основной палитре
- Magazine-style hero (full-bleed photo с overlay text + pull-quote)
- Hero-collage 4:5 на пол-экрана
- `border-y` в качестве decorative разделителей секций
- `.font-handwritten` класс


---

## §22. Inspiration platform pivot — Pinterest + Houzz + AirBnB модель

### 22.1 Концептуальное определение продукта

**Главный товар — НЕ мастер. Главный товар — РЕЗУЛЬТАТ РЕМОНТА (объект).**

Платформа — витрина результатов, где пользователь приходит за вдохновением,
выбирает понравившийся ремонт, и уже потом получает мастера, который повторит.
Не marketplace мастеров с фото-приложениями, а каталог идей с подбором мастера
как побочной механикой.

**Воронка:** смотрю → фильтрую по бюджету/площади/городу → читаю кейс
→ AI-визуализация (как будет у меня) → «Хочу также» → мастер сам пишет.

### 22.2 Визуальный mix

- **40% Pinterest** — фото на первом плане, воздух, masonry-grid, save-механика
- **30% Houzz** — детальные кейсы со сметой, прорабом, отзывом, до/после
- **20% AirBnB** — минимализм UI, чёткие фильтры, прозрачные цены/сроки
- **10% соцсеть** — save / want / поделиться, но **без ленты подписок**.
  Лента превращает портал в TikTok ремонта — не наша модель.

### 22.3 ObjectCard — центральный UI primitive

Заменяет text-cards «мастер» / «услуга» / «город» во всех точках где сейчас
показываем результаты. Используется на главной (Популярные объекты), в `/raboty`
masonry, на странице мастера (его работы), на детальной странице кейса
(«Похожие работы»), в результатах AI-дизайна («Похоже на твою визуализацию»).

**Анатомия:**
- большое фото (4:5 портретное по умолчанию, 4:3 опционально)
- бейдж «Топ» / «Featured» если выделен оператором
- save-кнопка в правом верхнем углу (heart-icon)
- заголовок (line-clamp-2)
- мета: город · площадь · срок (опционально стиль)
- бюджет: «от X ₽» крупно
- метрики: `views_count`, `saves_count` мелко (как Houzz: 12k views · 312 saves)
- CTA «Хочу также» как secondary при hover (на мобиле постоянно видно)

### 22.4 Структура главной (новый порядок секций)

1. **Hero** — search «Что хотите сделать?» + visual category chips (Ванная,
   Кухня, Санузел, Квартира — крупные cards-chips с фото, не select).
   Headline «Самая большая база реальных ремонтов в России».
2. **Популярные объекты** — главный блок. Сетка ObjectCard (6-9 штук).
   CTA «Все идеи →» в правый угол.
3. **AI-дизайны (новинка)** — превью того, что пользователи нагенерили в
   `/dizajn`. Усиливает «не только смотри, но и собирай свой ремонт».
4. **Лучшие мастера месяца** — компактная подборка (не основной фокус).
   Минимально — 4 карточки.
5. **Идеи ремонта (по комнатам / стилям)** — категориальная навигация.
   Photo-led cards-chips, deep-link в `/raboty?room=...&style=...`.
6. **Калькулятор** — оставляем (utility-якорь и SEO).
7. **Как работает** — оставляем (trust).

### 22.5 Backend changes (поэтапно)

**Phase A** (мок-метрики):
- ObjectCard принимает `viewsCount`/`savesCount` opt — пока в UI
  используем seed-функцию по `id` для стабильного псевдо-числа.

**Phase B** (реальные счётчики):
- migration: `master_portfolio.views_count INTEGER DEFAULT 0`
- migration: `master_portfolio.saves_count INTEGER DEFAULT 0`
- POST `/api/marketplace/raboty/:slug/view` — incremental, idempotent
  (per-IP rate-limit, 1 view/15min)
- POST `/api/marketplace/raboty/:slug/save` — anonymous-cookie save (`save_id`),
  upsert в `portfolio_saves` (slug, save_id_hash). Auth-юзеры — по user_id.
- GET `/api/marketplace/raboty/saved` — для будущего «Мои сохранённые»

**Phase C** (поверх):
- `/cabinet/saved` — мои сохранённые ремонты (для master-кабинета — другие, но та же таблица)
- «Хочу также» уже существует через LeadForm с `attachedMasterId`,
  расширить до `attachedPortfolioId` чтобы лид прицеплялся к **объекту**, а не мастеру

### 22.6 Tone & copy

- «Найдите ремонт, который хотите повторить» (не «Найдите мастера»)
- «Самая большая база реальных ремонтов в России» (positioning)
- «Хочу также» / «В мои идеи» / «Сохранить» — глаголы первого лица
- НЕ «закажите услугу», НЕ «найдите специалиста»
- Считаем не объёмы услуг, а **«N реальных ремонтов в каталоге»**

### 22.7 Что НЕ делаем

- Лента подписок (TikTok-loop ломает «inspiration → action»)
- Stories / 24-часовой контент (не наш ритм — ремонт это месяцы)
- Эмодзи на текстах продукта
- Каталог-таблица как первый view раздела (только masonry/grid)
- «Купить» / «Заказать» как primary CTA

### 22.8 Карта реализации

- [x] §22.1–22.7 концепция зафиксирована
- [ ] ObjectCard компонент с mock-метриками
- [ ] Главная: visual category chips на hero, replace RecentCases на ObjectCard,
      новый порядок секций
- [ ] /raboty masonry с ObjectCard
- [ ] HomeTopMasters → «Лучшие мастера месяца» (portal-style consistent)
- [ ] Backend Phase B: migrations + view/save endpoints
- [ ] LeadForm: `attachedPortfolioId` поверх `attachedMasterId`
- [ ] /cabinet/saved (cabinet и client-side)
