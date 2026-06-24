# Аудит проекта sfera-master.ru для построения SEO-маркетплейса мастеров

> **Дата**: 13.06.2026  
> **Цель**: подготовить отчёт для тех. директора, чтобы он мог раздать пошаговые задачи разработчикам.  
> **Объём**: только анализ. Код не менялся.

---

# 1. Общая информация о проекте

## Стек

- **Монорепо**: pnpm workspace (`pnpm@10.33.2`, Node ≥ 22.12).
- **Frontend**: React 19 + TypeScript + **Vite 7**.
  - Routing — **Wouter** (lightweight client-side router, **без SSR**).
  - State — `@tanstack/react-query` v5.
  - UI — **Radix UI primitives + Tailwind CSS 4** + `class-variance-authority` + `lucide-react`.
  - Анимация — `framer-motion`. Графики — `recharts`. Таблицы — `@tanstack/react-table` + `react-virtual`.
  - Toasts — `sonner`. Forms — `react-hook-form` + `zod`.
- **Backend**: один Express 5 сервер (`@workspace/api-server`), TypeScript + **tsx**.
  - Сборка — esbuild через `build.ts` → `dist/index.cjs ~3.6 MB` (single-file bundle).
  - Auth — `express-session` + `connect-pg-simple` (сессии в Postgres).
  - Загрузка файлов — `multer` (memory) + `@aws-sdk/client-s3` или `@google-cloud/storage`.
  - Push — `web-push`. AI — `openai` SDK. Cron — `node-cron`. Image proc — `sharp`.
- **БД**: **PostgreSQL** (Railway/Neon). ORM — **Drizzle ORM** (`drizzle-orm` ^0.45) + drizzle-zod, миграции — `drizzle-kit`.
- **PWA**: ручной `manifest.json` + `sw.js` в `public/` (без Workbox/vite-plugin-pwa).
- **Деплой**: **Railway** (см. `railway.json` в каждом артефакте). Один publicURL `sfera-master.ru` отдаёт всё через api-server (SPA + API).
- **Платформа разработки**: ранее Replit (`.replit`, `replit.md`, плагины `@replit/vite-plugin-*`), сейчас Railway.

## Где конфигурация

| Файл | Что задаёт |
|---|---|
| `package.json` (корень) | workspace-скрипты `build`, `typecheck`, `db:migrate` |
| `pnpm-workspace.yaml` | пакеты `artifacts/*`, `lib/*`, `lib/integrations/*`, `scripts`, `partner-landing` + `catalog:` (общие версии) |
| `tsconfig.base.json` + `tsconfig.json` | TS project references по всем артефактам |
| `vite.config.ts` (корень) и в каждом артефакте | bundler, base-paths, плагины |
| `lib/db/drizzle.config.ts` | схема + миграции |
| `artifacts/api-server/build.ts` | собственный esbuild-скрипт сборки сервера |
| `RAILWAY_ENV_VARS.md` | список переменных окружения (handcrafted) |
| `replit.md` | старая документация по запуску в Replit |

Секреты (env-переменные):  
`DATABASE_URL`, `SESSION_SECRET` (≥32 символов), `MAX_BOT_TOKEN`, `MANAGER_BOT_TOKEN`, `OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL/KEY/MODEL`, `AVITO_*`, `CRM_ORIGIN`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` и т.п.

## Запуск локально

```bash
# install
pnpm install

# dev (каждый артефакт — свой Vite, api-server отдельно)
pnpm --filter @workspace/api-server run dev      # http://localhost:3000
pnpm --filter @workspace/crm run dev             # http://localhost:5173
pnpm --filter @workspace/master-pwa run dev
pnpm --filter @workspace/client run dev
pnpm --filter @workspace/master-landing run dev

# typecheck (root)
pnpm typecheck

# build (всё, как в проде)
pnpm build

# db migrations
pnpm db:migrate

# tests (api-server)
pnpm --filter @workspace/api-server test
```

В **production** все фронты собраны в `dist/public/`, и api-server отдаёт их статикой по префиксам `/crm`, `/master-pwa`, `/partner`, `/master-landing/*` и т.д. То есть **в проде один сервер** обслуживает и API, и SPA-фронты.

## Линтер

Полноценного eslint-конфига **нет** — есть только `prettier@3.8` и `tsc --noEmit` (typecheck). Это пробел, который стоит закрыть, но это не блокер.

---

# 2. Структура папок

```
sfera888/
├── artifacts/                  ← все приложения (frontend + backend)
│   ├── api-server/             Express 5 + Drizzle, ЕДИНСТВЕННЫЙ backend
│   ├── crm/                    CRM/админка для оператора и владельца
│   ├── master-pwa/             PWA для мастера ("Честный мастер")
│   ├── partner-pwa/            PWA для партнёра-трафика (Avito-аккаунты)
│   ├── client/                 Клиентская PWA (страницы сметы, чат с мастером, AI-смета)
│   ├── master-landing/         Лендинг мастера v3 (legacy + honest)
│   ├── master-landing-v1/      Старые лендинги мастера (deprecated)
│   ├── master-landing-v2/
│   ├── master-landing-v5/
│   ├── referral-landing/       Реферальный лендинг
│   └── mockup-sandbox/         Песочница для прототипов UI
├── lib/                        ← shared-пакеты
│   ├── db/                     Drizzle schema + миграции (@workspace/db)
│   ├── api-spec/               OpenAPI/Zod-спека API
│   ├── api-zod/                Zod-схемы для валидации (@workspace/api-zod)
│   ├── api-client-react/       react-query хуки для CRM/PWA (@workspace/api-client-react)
│   └── object-storage-web/     S3/GCS клиент
├── partner-landing/            Старый партнёрский лендинг (отдельный пакет вне artifacts/)
├── ai/                         Standalone AI-агент (Railway-сервис) для анализа логов и БД-ошибок
├── scripts/                    миграции, импорт-скрипты
├── attached_assets/            прикреплённые материалы клиента (PDF, шрифты, картинки)
├── neondb_dump.sql             дамп прод-БД
└── *.cjs / *.js / *.py         ad-hoc скрипты импорта/проверки/генерации флайеров
```

### Что внутри каждого артефакта (типично)

```
artifacts/<app>/
├── src/
│   ├── main.tsx              entry (React 19 createRoot)
│   ├── App.tsx               <Router> + <Switch> (Wouter)
│   ├── pages/                страницы (по одной на route)
│   ├── components/           reusable + UI primitives (`components/ui/...`)
│   ├── hooks/                use-auth, useFeatureFlags, usePushNotifications
│   ├── lib/                  API-клиент, утилиты
│   └── index.css             Tailwind + custom
├── public/                   статика, manifest.json, sw.js (для PWA), icons
├── index.html                Vite entry HTML
├── vite.config.ts
├── tsconfig.json
├── package.json
└── railway.json              деплой-конфиг
```

### Особенно важные файлы

| Файл | Что делает |
|---|---|
| `artifacts/api-server/src/app.ts` | главный Express-app: CORS, session, CSP, статика всех SPA, redirect www→non-www, public receipt routes |
| `artifacts/api-server/src/index.ts` | bootstrap (runRuntimeFixes, startup hooks) |
| `artifacts/api-server/src/routes/index.ts` | mount всех роутеров под `/api/*` |
| `artifacts/api-server/src/lib/dispatcherAI.ts` | ИИ-диспетчер мастера (OpenAI/OpenRouter) |
| `artifacts/api-server/src/lib/broadcastOrder.ts` | рассылка нового заказа волнами по мастерам |
| `lib/db/src/schema/*.ts` | ~50 файлов, по одному на таблицу |
| `lib/db/migrations/*.sql` | 5 миграций (baseline, payment_state_engine, token-migration-grants, phase_c × 2) |
| `artifacts/crm/src/App.tsx` | роутинг CRM (Wouter, lazy-loaded pages) |
| `artifacts/master-pwa/src/App.tsx` | роутинг PWA + AuthGuard + SuspendedScreen |
| `artifacts/client/src/App.tsx` | роутинг клиентской PWA (`/`, `/estimate`, `/smeta/:token`, `/my-orders`) |

---

# 3. Все текущие страницы и роуты

> **Внимание**: маршруты ниже — это URL-пути относительно домена `sfera-master.ru`.  
> Префиксы `/crm`, `/master-pwa`, `/partner`, `/master-landing/v3` приклеиваются перед роутом из соответствующего SPA.

## CRM (mounted at `/crm`)

| Route | Файл | Назначение | Для кого |
|---|---|---|---|
| `/crm/login` | `crm/src/pages/login.tsx` | вход оператора | публичный |
| `/crm/` → `/crm/dashboard` | `crm/src/pages/dashboard.tsx` | главный дашборд (KPI, лента, action items, "что делать сейчас") | admin/operator |
| `/crm/leads` | `crm/src/pages/leads.tsx` | заявки (3 вкладки: Новые / В работе / Архив) | admin/lead_operator |
| `/crm/orders` | `crm/src/pages/orders.tsx` | список заказов (унифицирован с leads/work) | admin/master_operator |
| `/crm/masters` | `crm/src/pages/masters.tsx` | список мастеров (table + kanban view) | admin/master_operator |
| `/crm/voronka` → `/crm/masters?view=kanban` | redirect | старый URL воронки мастеров | — |
| `/crm/finance` | `crm/src/pages/finance.tsx` | финансы (комиссии, transactions, receipts) | admin |
| `/crm/analytics` | `crm/src/pages/analytics.tsx` | аналитика (ML pricing, кампании) | admin |
| `/crm/analytics/score-distribution` | `crm/src/pages/score-distribution.tsx` | распределение скоринга мастеров | admin |
| `/crm/settings` | `crm/src/pages/settings.tsx` | настройки (города, услуги, комиссии, флаги) | admin |
| `/crm/users` | `crm/src/pages/users.tsx` | управление операторами | admin |
| `/crm/master-chat` | `crm/src/pages/master-chat.tsx` | переписка с конкретным мастером | operator |
| `/crm/trash` | `crm/src/pages/trash.tsx` | корзина удалённых сущностей | admin |
| `/crm/tasks` | `crm/src/pages/tasks.tsx` | задачи операторов | operator |
| `/crm/dialogs` | `crm/src/pages/dialogs.tsx` | переписки с клиентами (chat tokens) | operator |
| `/crm/checkins` | `crm/src/pages/checkins.tsx` | геолокационные чек-ины мастеров | admin |
| `/crm/avito` | `crm/src/pages/avito.tsx` | подключение Avito-аккаунтов (OAuth) | admin |
| `/crm/avito-messages` | `crm/src/pages/avito-messages.tsx` | сообщения из Avito | operator |
| `/crm/ai-office` | `crm/src/pages/ai-office.tsx` | панель ИИ-агента (memory, scenarios, runs) | admin |
| `/crm/partners` | `crm/src/pages/partners.tsx` | партнёры-источники трафика (`traffic_partners`) | admin |
| `/crm/partner-leads-review` | `crm/src/pages/partner-leads-review.tsx` | модерация лидов от партнёров | admin |
| `/crm/partner-analytics` | `crm/src/pages/partner-analytics.tsx` | KPI партнёров | admin |

> Папка `crm/src/pages/admin/` сейчас пуста — отдельных admin-only страниц нет, всё через `permissions[]` в `users.permissions`.

## PWA для мастеров (mounted at `/master-pwa`)

| Route | Файл | Назначение |
|---|---|---|
| `/master-pwa/login` | `master-pwa/src/pages/login.tsx` | логин (PWA-логин/пароль или Telegram) |
| `/master-pwa/pending-contract` | `master-pwa/src/pages/pending-contract.tsx` | стадия "ждёт подписания договора" |
| `/master-pwa/` | `master-pwa/src/pages/home.tsx` | **главная**: лента новых заказов + активные + missed + FOMO-блок |
| `/master-pwa/orders` | `master-pwa/src/pages/orders.tsx` | "Мои заказы" (in_progress, pending_payment, completed) |
| `/master-pwa/chat` | `master-pwa/src/pages/chat.tsx` | переписка с оператором |
| `/master-pwa/balance` | `master-pwa/src/pages/balance.tsx` | баланс ₽ + transactions |
| `/master-pwa/wallet` | `master-pwa/src/pages/wallet.tsx` | кошелёк (legacy token-страница, после Phase D будет переделана под ₽) |
| `/master-pwa/profile` | `master-pwa/src/pages/profile.tsx` | профиль мастера (city, phone, specializations, avatar) |
| `/master-pwa/work-rules` | `master-pwa/src/pages/work-rules.tsx` | правила работы / договор |

## Клиентская PWA (mounted at `/`, корень)

| Route | Файл | Назначение |
|---|---|---|
| `/` | `client/src/App.tsx → Home` | главная клиентская PWA: AI-смета, "мои заказы", доверенные блоки |
| `/estimate` | `client/src/pages/Estimate.tsx` | AI-генерация сметы по фото (бесплатно, через OpenAI) |
| `/support` | `client/src/pages/SupportChat.tsx` | чат поддержки клиента |
| `/my-orders` | `client/src/pages/MyOrders.tsx` | список заказов клиента (по телефону) |
| `/smeta/:token` | `client/src/pages/Smeta.tsx` | публичная страница сметы — клиент видит, оплачивает |
| `/smeta/:token/chat` | `client/src/pages/Chat.tsx` | чат клиента с мастером по конкретной смете |
| `/smeta/:token/history` | `client/src/pages/History.tsx` | история по смете |

## Лендинги (статика на api-server)

| Route | Артефакт | Назначение |
|---|---|---|
| `/master-landing/v3/honest` (он же короткий `/masters` → 301) | `master-landing/src` (компонент `HonestLanding`) | **актуальный** лендинг для набора мастеров |
| `/master-landing/v3/legacy` | `master-landing/src` (`LegacyLanding`) | старый лендинг |
| `/master-landing/v2/*` | `master-landing-v2/` | старая версия лендинга |
| `/master-landing/v1/*` | `master-landing-v1/` | ещё одна старая версия |
| `/master-landing-v5/*` | `master-landing-v5/` | очередная итерация |
| `/partner` | `partner-pwa/` | PWA партнёра (`/partner/*`) и лендинг для регистрации партнёра |
| `/partner-landing/index.html` | `partner-landing/` (отдельный пакет) | старый партнёрский лендинг (просто HTML) |
| `/referral` | `referral-landing/` | реферальный лендинг |

## API routes (mounted at `/api/*` — все на одном api-server)

Полный список из `routes/index.ts`:

| Префикс | Файл | Что делает |
|---|---|---|
| `/api/health`, `/api/system-status` | `routes/health.ts` + `app.ts` | health-check |
| `/api/auth` | `routes/auth.ts` | login/logout/me для оператора (session) |
| `/api/users` | `routes/users.ts` | CRUD операторов |
| `/api/leads` | `routes/leads.ts` | заявки + `/leads/:id/send-to-buffer` (создать заказ) |
| `/api/orders` | `routes/orders.ts` | заказы (CRUD, accept-proposal, manual-assign, unassign) |
| `/api/masters` | `routes/masters.ts` | мастера (список, аватары, профили, history) |
| `/api/finance` | `routes/finance.ts` | transactions, payments, отчёты |
| `/api/analytics` | `routes/analytics.ts` | dashboard-v2, ML pricing |
| `/api/settings` | `routes/settings.ts` | cities, services, commission settings |
| `/api/voronka` | `routes/voronka-columns.ts` | колонки kanban-воронки мастеров |
| `/api/master-chat` | `routes/master-chat.ts` | переписка оператор ↔ мастер |
| `/api/dispatch` | `routes/dispatch.ts` | рассылка заявки мастерам, отклики, назначения |
| `/api/yandex-pay` | `routes/yandex-pay.ts` | интеграция с Yandex Pay |
| `/api/uploads` | `routes/storage.ts` | upload файлов в S3/GCS |
| `/api/trash` | `routes/trash.ts` | корзина / cleanup |
| `/api/receipts` | `routes/receipts.ts` | сметы (CRUD, screenshot, public token) |
| `/api/tasks` | `routes/tasks.ts` | задачи операторов |
| `/api/master-reviews` | `routes/master-reviews.ts` | отзывы об операторах от мастеров |
| `/api/partner-pwa` | `routes/partner-pwa.ts` | API для PWA партнёра трафика |
| `/api/crm` | `routes/crm-partners.ts` | CRM-управление партнёрами |
| `/api/landing` | `routes/landing.ts` | **POST /api/landing/leads** — публичная форма лендинга |
| `/api/client` | `routes/client.ts` | клиентский API (my-orders, support-chat, push-subscribe) |
| `/api/avito` | `routes/avito.ts` | OAuth Avito + получение объявлений |
| `/api/ai-office` | `routes/ai-office.ts` | ИИ-агент (memory, runs) |
| `/api/autonomous` | `routes/autonomous.ts` | автономные сценарии |
| `/api/agent-memory` | `routes/memory.ts` | память ИИ-диспетчера |
| `/api/work-monitor` | `routes/work-monitor.ts` | мониторинг работы |
| `/api/work-board` | `routes/work-board.ts` | колонки work-board (return-to-pool, partial-payment) |
| `/api/work-board/table` | `routes/work-board-table.ts` | табличный вид + SSE-stream |
| `/api/dashboard` | `routes/dashboard-action-items.ts` | action items + AI-hint + snooze |
| `/api/account-balance` | `routes/account-balance.ts` | баланс мастера + topup |
| `/api/contract` | `routes/contract.ts` | подписание договора (паспорт + IP) |
| `/api/system` | `routes/system.ts` | system settings (feature flags) |
| `/api/master-pwa` | `routes/master-pwa.ts` | API для PWA мастера (login, заявки, отклики) |
| `/api/receipt/:token`, `/api/receipt/:token/data`, `/print`, `/confirm` | `app.ts` | публичная страница сметы (без auth) |

---

# 4. PWA для мастеров

## Где код

`artifacts/master-pwa/`. В проде монтируется на `https://sfera-master.ru/master-pwa/`.

- `index.html` — содержит `<link rel="manifest" href="/master-pwa/manifest.json">`, мета-теги для PWA (apple-touch-icon, theme-color #7C3AED, content-language=ru, notranslate-патч на `Node.prototype.removeChild`).
- `public/manifest.json` + `public/sw.js` — service worker (своя реализация, не Workbox).
- `public/icon-192.png`, `apple-touch-icon.png` — иконки.

## Авторизация

`artifacts/master-pwa/src/lib/auth.ts` (`AuthProvider`) хранит сессию.  
Endpoint: `POST /api/master-pwa/login` принимает либо `{ login, password }` (PWA-логин/пароль из поля `masters.pwaLogin/pwaPasswordHash`), либо `{ telegramId }` (для входа из Max-бота). Сессия — в куки `connect.sid` (тот же `sessions` table в Postgres, что и для CRM).

`AuthGuard` в `App.tsx`:
- если `master == null` и `path !== /login` → `Redirect /login`;
- если `master.status === "suspended"` → `<SuspendedScreen>` (заблокирован, кнопка "выйти");
- если `master.status === "pending_contract"` → отдельная страница договора;
- иначе показывает основной flow.

## Готовые экраны

| Экран | Что показывает |
|---|---|
| **Home** (`/`) | 4 секции: новые заявки (lazy-loaded из `GET /api/master-pwa/feed`), активные заказы, "пропущенные" (missed orders за последние сутки), FOMO-блок (если мастер заблокирован — почему). Лента подгружается каждые 5 сек. |
| **Orders** | "Мои заказы": активные (in_progress, pending_payment), завершённые. Сметы, чаты, фото "до/после", кнопки "завершить". |
| **Chat** | Переписка с оператором (через `master_messages`). |
| **Balance** | Баланс ₽ + история (legacy-страница после Phase D, использует `master_wallet.balance`). |
| **Wallet** | Старая страница для токенов — после Phase D переделать под ₽-операции. |
| **Profile** | Имя/город/специализации/аватар/телефон/passport-данные/contract status. Можно редактировать. |
| **Work-rules** | Правила работы (статичный текст). |
| **Pending-contract** | Если status=`pending_contract` — экран подписания договора (загрузка паспорта, ФИО, ИП-данные). |

## Профиль мастера (что есть в БД)

`mastersTable`:
- `alias`, `phone`, `city`, `specialization` (одна основная) + `specializations[]` (массив).
- `rating` (0..5), `totalOrders`, `acceptedOrders`, `totalLeadsReceived`.
- `customAvatarUrl`, `tags[]`, `workingHours` (jsonb), `preferredDistricts[]`, `minArea`.
- `servicePrices[]` — массив `{ service, priceFrom }` (есть, но без UI редактирования в PWA).
- `passportPhotoUrl`, `passportRegPhotoUrl`, `passportVerified`, `contractFullName/Address/PassportNumber` — для договора.
- Репутация: `consecutiveCancellations`, `blockedFromOrders`, `manualUnblocksCount`, `lastCompletedAt`, `lastCancelAt`.
- Telegram: `telegramId`, `maxChatId` (для Max-бота).

## Заявки и статусы

Заявки = лиды (`leadsTable`), при отправке "в работу" из CRM создаётся `ordersTable` со статусами:  
`waiting_master` → `master_assigned` → `in_progress` → `completed` / `cancelled` / `cancellation_requested`.

Параллельно работает Payment_State engine (`agreement_amount_source`, `payment_state_changed_at`):  
`no_amount` → `agreed` → `paid`.

Рассылка мастерам — через `order_dispatches` (статусы `sent` / `responded` / `rejected` / `assigned`).  
Волны рассылки — `order_broadcast_waves`.

## Push-уведомления

Полностью реализованы:
- `push_subscriptions` — подписки мастеров (PWA web-push).
- `client_push_subscriptions` — подписки клиентов.
- `operator_push_subscriptions` — подписки операторов CRM.
- `partner_push_subscriptions` — партнёры.
- VAPID ключи в env. Отправка через `web-push` SDK.
- Отдельный канал — Max-бот (`maxBot.ts`) и Telegram-bot.

## Service Worker / Manifest

- `manifest.json` есть, иконки 192/180/SVG, `display: standalone`.
- `sw.js` — кастомный (предположительно — простой кеш + `SW_UPDATED` сообщение). При обновлении SW главное окно делает `window.location.reload()`.
- Установка PWA — через стандартный `beforeinstallprompt` (`InstallBanner` компонент).

## Что готово для будущей модели "заявки / лиды / подписка"

- ✅ Лента заявок мастеру есть (Home).
- ✅ Назначение мастера на заказ есть.
- ✅ Кошелёк мастера + transactions есть (`master_wallet.balance`, `master_deposits`, `service_fee_transactions`).
- ✅ Push-уведомления есть.
- ✅ Чат мастер ↔ оператор и мастер ↔ клиент есть.
- ❌ **Нет модели "лид как товар"** (мастер не может купить лид — после Phase D токены убраны, новой схемы покупки лидов нет).
- ❌ **Нет тарифов / подписок** (`Tariff`, `Subscription` — отсутствуют).
- ❌ **Нет публичного профиля мастера** (для SEO-маркетплейса).
- ❌ **Нет slug у мастера** — нужно добавить колонку `slug` для URL `/masters/[slug]`.
- ❌ **Нет портфолио** (фото работ мастера) — только photos конкретного заказа.
- ❌ **Нет публичных отзывов клиентов** (есть только внутренние `master_reviews` от операторов).

---

# 5. CRM / админка

## Где код

`artifacts/crm/`. В проде на `https://sfera-master.ru/crm/`.

## Какие сущности видит админ

| Сущность | Где |
|---|---|
| Мастера | `/crm/masters` (table + kanban + drawer) |
| Заявки (leads) | `/crm/leads` (3 вкладки) |
| Заказы (orders) | `/crm/orders` или `/crm/leads?tab=work` |
| Транзакции / комиссии | `/crm/finance` |
| Партнёры трафика | `/crm/partners`, `/crm/partner-leads-review`, `/crm/partner-analytics` |
| Avito | `/crm/avito`, `/crm/avito-messages`, `/crm/avito-analytics` |
| Города + услуги + комиссии | `/crm/settings` (вкладки) |
| Операторы | `/crm/users` |
| Action items | дашборд `/crm/dashboard` |
| Tasks (задачи операторам) | `/crm/tasks` |
| Чек-ины мастеров | `/crm/checkins` |
| ИИ-офис | `/crm/ai-office` |
| Корзина | `/crm/trash` |

## Действия админа

- Создавать/редактировать заявки и заказы вручную.
- Назначать мастера на заказ (manual-assign), снимать (unassign), переназначать.
- Подтверждать оплату (commission paid, partial payment).
- Закрывать заказы (completed/cancelled).
- Возвращать заказ "в пул" (return-to-pool).
- Создавать сметы за мастера.
- Подтверждать скриншоты оплаты от клиента.
- Снимать блокировку мастера, выдавать тестовые заказы.
- Управлять рейтингом, тегами, рабочими часами мастера.
- Подключать Avito-аккаунты, видеть объявления.
- Запускать массовую рассылку в Max/Telegram.
- Просматривать аналитику (dashboard-v2 — KPI, конверсия, топ-мастеров, города).

## Платежи

Есть модели `transactions`, `transaction_payments` (частичные оплаты), `service_fee_transactions`, `master_deposits`, `master_deposit_transactions`, `balance_topup_requests`, `receipts` (сметы с предоплатой).  
**НЕТ интеграции с реальным эквайрингом** (ЮKassa/CloudPayments/Stripe). Оплаты вводятся **руками оператором** или подтверждаются по скриншоту от клиента. Yandex Pay есть, но используется для приёма предоплаты от клиента, не для подписок мастеров.

## Чего не хватает для маркетплейса

| Функция | Что добавить |
|---|---|
| **Управление SEO-страницами** | таблица `seo_pages` с `slug`, `title`, `meta_description`, `h1`, `body_md`, `og_image`, `canonical`, `noindex` — отдельная вкладка `/crm/seo` |
| **Управление публичными лидами** | различать `leads.source = 'marketplace'` от `'crm'`/`'avito'`/`'landing'`, добавить вкладку "Маркетплейс" в `/crm/leads` |
| **Распределение заявок** | сейчас рассылка работает (broadcastOrder.ts), но нужна отдельная политика для marketplace-лидов: free vs paid, эксклюзив vs бродкаст |
| **Тарифы мастеров** | таблица `tariffs` (Free / Pro / Enterprise) + `master_subscriptions` + UI на `/crm/settings?tab=tariffs` |
| **Платежи мастеров** | интеграция с эквайрингом (ЮKassa/CloudPayments) для подписок, отдельная вкладка "Поступления" |
| **Источники трафика для маркетплейса** | расширить `traffic_partners` или ввести `marketing_channels` (UTM-метки → источник лида) |
| **Управление публичными карточками мастеров** | кнопка "опубликовать в маркетплейсе" с предпросмотром, slug, портфолио, верификация |
| **AI-дизайны** | таблица `designs` + вкладка `/crm/designs` (модерация) |
| **SEO-поля у города/услуги** | в `cities`/`services` добавить `slug`, `seo_title`, `seo_description`, `h1`, `body_md` |

---

# 6. Лендинг для мастеров

## Где находится

`artifacts/master-landing/` — основной (есть `LegacyLanding` и `HonestLanding`).  
Дублирующие старые: `master-landing-v1/`, `v2/`, `v5/`. Можно постепенно удалять.

URL: `https://sfera-master.ru/master-landing/v3/honest` (короткий alias `https://sfera-master.ru/masters` → 301).

## Какие блоки есть (HonestLanding)

Стандартные лендинговые блоки: Hero (текст + кнопка), Benefits, Как работает, Кейсы/отзывы, Калькулятор/тарифы, FAQ, форма "Стать мастером".

> Точные блоки можно увидеть в `artifacts/master-landing/src/components/honest/HonestLanding.tsx` (не загружал в этот отчёт, но структура стандартная).

## Форма регистрации

Куда уходит:
- **Не в БД** напрямую как `leads`. Лендинг мастеров **не использует `/api/landing/leads`** (это для клиентских заявок).
- Через `routes/master-pwa.ts` или `routes/contract.ts` — мастер сам регистрируется → создаётся запись в `mastersTable` со статусом `pending_contract`.
- Дальше оператор в CRM проверяет, подписывает договор → status=`active`.

Если форма мастера сейчас просто отправляет заявку в Telegram/Max боту менеджеру — это надо проверить в коде HonestLanding.

## Можно ли использовать для подписки

Да, но потребуется:
1. Добавить выбор тарифа на лендинге (Free / Pro).
2. После регистрации мастера → вести его на оплату (Pro) или сразу в pending_contract (Free).
3. Создать модели `tariffs` + `master_subscriptions`.

---


# 7. Лендинг для клиентов

## Где находится

`artifacts/client/` — это **не классический лендинг, а полноценная клиентская PWA** с публичными страницами. Хостится на корне `https://sfera-master.ru/`.

## Какие блоки/страницы есть

| Страница | Что там |
|---|---|
| `/` (Home) | Логотип "Честный мастер", phone-gate (запрашивает телефон при первом заходе и сохраняет в localStorage), карточка "Мои заказы" (если телефон сохранён), CTA "Узнать стоимость работ через AI", trust-badges (гарантия 6 мес, ИП офиц., 24/7), `BottomNav` |
| `/estimate` | AI-смета: загрузка фото комнаты + описание задачи → OpenAI → текстовая смета (бесплатно). Это уже работает! |
| `/smeta/:token` | Публичная смета от мастера: hero с суммой брони, перечень работ, реквизиты для оплаты СБП, форма загрузки скриншота оплаты |
| `/smeta/:token/chat` | Чат клиента с мастером по этой смете |
| `/my-orders` | Список заказов клиента (по сохранённому телефону) |
| `/support` | Чат поддержки клиента |

## Форма заявки и куда уходит

В клиентской PWA **формы "оставь заявку, мастер позвонит"** в текущем виде нет. Заявки приходят через:

1. **Лендинг** (`POST /api/landing/leads` в `routes/landing.ts`) — публичный endpoint, принимает: `name`, `phone`, `city`, `district`, `area`, `services[]`, `comment`, `ref_slug` (партнёр трафика). Создаёт запись в `leads` со статусом `new`, проверяет дубликаты по телефону за 30 дней, нотифицирует менеджера в Max-боте.

2. **Avito** — через интеграцию (`routes/avito.ts`) объявления подгружаются, лиды приходят сообщениями.

3. **CRM-оператор** — оператор сам создаёт лид руками.

4. **AI-смета `/estimate`** — это **только смета**, лида не создаёт. Это тот канал, который надо использовать для AI-маркетплейса: после генерации сметы — кнопка "Хочу такого мастера" → создание лида.

## Что есть в лиде

Из таблицы `leads`:
- `client_name`, `client_phone`, `city`, `district` (адрес объекта)
- `service_type` (текст), `area` (м²), `services` (json — массив работ)
- `comment` (описание), `photos` (массив URL/base64)
- `scheduled_at` (когда мастер приедет)
- `source` (`landing` / `avito` / `crm` / `client_pwa` …)
- `traffic_partner_id` + `lead_channel` + `partner_lead_status`
- `is_possible_duplicate` (флаг)

## Можно ли из этого сделать публичный SEO-маркетплейс

**Не напрямую**. Текущий клиентский PWA — это утилитарное приложение для уже-клиента (у которого есть смета или которому нужна AI-оценка). SEO-маркетплейс — это совсем другой продукт:
- **Публичные страницы под индекс** (мастера, услуги-города, цены, кейсы).
- **Без login-обязательного входа** на основные страницы.
- **Server-side rendering** (или SSG) для индексации.

Но клиентскую PWA можно **переиспользовать** для:
- AI-смета (`/estimate`) → отличная конверсия в лид;
- Phone-gate механизм + "мои заказы" → когда клиент уже оставил заявку с маркетплейса;
- Чат с мастером;
- Готовый дизайн-система (бирюзовая палитра 0D9488, "Plus Jakarta Sans" шрифт, BottomNav).

Для SEO-маркетплейса нужен **отдельный артефакт** — либо новый `artifacts/marketplace/` на Next.js (SSR/SSG), либо **переписать `client/`** на SSR (что сложно с Vite, потребует серьёзной перестройки).

---

# 8. База данных

## Что используется

PostgreSQL + Drizzle ORM. Схемы — `lib/db/src/schema/*.ts`, ~50 таблиц.  
Миграции — `lib/db/migrations/`:
- `0000_baseline.sql` — стартовая схема
- `0001_payment_state_engine.sql` — добавлены `agreement_amount_source`, `payment_state_changed_at`, `agreement_note`
- `0002_token_migration_grants.sql` — миграция на токены (отменена)
- `0003_phase_c_drop_ml_tokens_charged.sql` — очистка ML
- `0004_phase_c_drop_token_tables.sql` — DROP всех 7 token-таблиц

## Все ключевые таблицы (по схеме)

| Таблица | Поля (главные) | Для чего |
|---|---|---|
| `users` | id, login, password_hash, name, role (admin/lead_operator/master_operator/partner), permissions[] | Операторы CRM. **НЕТ роли `client`!** |
| `sessions` | sid, sess (json), expire | Express-session store |
| `masters` | id, alias, phone, city, specialization, specializations[], status, rating, total_orders, debt, custom_avatar_url, contract_*, passport_*, working_hours, preferred_districts[], min_area, service_prices (json `{service, priceFrom}[]`), max_active_orders, consecutive_cancellations, blocked_from_orders, telegram_id, max_chat_id, pwa_login, pwa_password_hash | Профиль мастера. **Нет `slug`, `bio`, `email`** |
| `master_wallet` | master_id, balance (₽), credit_limit, total_topups, total_service_fees_spent, ALSO legacy: tokens_balance, credit_tokens_* | Текущий баланс мастера в ₽ + legacy-поля токенов (deprecated) |
| `master_deposits` | master_id, deposit_balance, recommended_amount | Депозит-стратегия удержания (recommended 10000 ₽ для уверенной работы) |
| `master_deposit_transactions` | master_id, type, amount, note, created_at | История депозитов |
| `service_fee_transactions` | master_id, order_id, fee, type | Списания комиссии за заказ |
| `master_test_orders` | master_id, count | Тестовые заказы для нового мастера |
| `master_messages` | master_id, from_master, text, photo_url | Чат оператор↔мастер |
| `master_reviews` | master_id, order_id, sentiment (positive/negative/neutral), text, created_by | **Внутренние** отзывы операторов о мастере. Не клиентские! |
| `master_tasks` | master_id, type, title, status | Задачи мастеру |
| `master_checkins` | master_id, order_id, lat, lng, photo_url | Гео-чек-ины на объекте |
| `leads` | id, client_name, client_phone, city, district, service_type, area, services (json), comment, photos, source, status (new/processing/sent_to_work/non_target/client_refusal), traffic_partner_id, lead_channel, partner_lead_status, is_possible_duplicate, payment_model | Заявки клиента |
| `orders` | id, lead_id, city, district, service_type, area, status (waiting_master/master_assigned/in_progress/completed/cancelled/cancellation_requested), master_id, order_amount, commission, commission_paid, prepayment_amount, photos_before/after, dispatch_status, dispatch_wave, payment_state(`agreement_amount_source` + `payment_state_changed_at`), client_rating, client_review, max_masters | Заказы (как лид прошёл фильтр и поехал в работу) |
| `order_dispatches` | order_id, master_id, status (sent/responded/rejected/assigned), responded_at, distance_km | Какому мастеру разослан заказ |
| `order_masters` | order_id, master_id, status | Множественное назначение (несколько мастеров на один заказ) |
| `order_master_history` | order_id, master_id, action, created_at | История переназначений |
| `order_status_logs` | order_id, from_status, to_status, by_user_id, reason | Аудит смены статусов |
| `order_amount_audit` | order_id, source, amount, note, created_at | Аудит фиксации суммы (Agreement_Path) |
| `order_broadcast_waves` | order_id, wave_num, started_at, masters_targeted | Волны рассылки |
| `order_stages` | order_id, stage, started_at, completed_at | Этапы по заказу |
| `dispatch_resend_logs` | order_id, master_id, sent_at | Повторные отправки |
| `transactions` | order_id, master_id, order_amount, commission, service_fee, prepayment_deducted, payment_status (pending/paid/overdue), source_type, paid_at | Финансовая транзакция по заказу |
| `transaction_payments` | transaction_id, amount, paid_at, note | Частичные оплаты комиссии |
| `receipts` | id, **token (UUID)**, order_id, master_id, client_name, client_phone, line_items (json), total_amount, prepayment_amount, prepayment_screenshot_url, prepayment_submitted_at, prepayment_seen_at | Сметы (публичный URL `/smeta/:token`) |
| `dispatcher_followups` | order_id, master_id, scheduled_at | Напоминания диспетчеру |
| `bot_memory` | session_key, messages (json) | Память ИИ-диспетчера (per-master, per-order) |
| `client_support_messages` | phone, text, from_client, created_at | Чат поддержки клиента |
| `general_support_messages` | … | Общая поддержка |
| `max_bot_logs` | event, payload, created_at | Логи Max-бота |
| `client_push_subscriptions` | phone, endpoint, p256dh, auth | Push клиента |
| `push_subscriptions` | master_id, endpoint, p256dh, auth | Push мастера |
| `operator_push_subscriptions` | operator_id, endpoint, p256dh, auth | Push оператора |
| `partner_push_subscriptions` | partner_id, … | Push партнёра |
| `task_snoozes` | item_id, snoozed_until, reason | Откладывание action items |
| `tasks` | id, type, title, assignee, status | Задачи операторов |
| `voronka_columns` | id, name, position, color | Колонки kanban-воронки мастеров |
| `traffic_partners` | id, user_id, name, phone, city, ref_slug, avito_account_link, status, registered_at, first_lead_at | Партнёры-источники трафика |
| `partner_billing_periods` | partner_id, period_start, period_end, leads_count, paid_amount | Биллинг партнёров |
| `balance_topup_requests` | master_id, amount, status | Заявки на пополнение |
| `avito_accounts`, `avito_messages`, `avito_items` (в `schema/avito.ts`) | … | Avito-интеграция |
| `settings` (system_settings) | key, value, updated_at | Глобальные настройки + feature flags |
| `service_types` | id, name | Список услуг (seed: "Укладка плитки", "Поклейка обоев", и т.п.) |
| `ai_error_logs` | error_text, context, created_at | Ошибки AI |
| `ml_pricing_decisions` | order_id, predicted_price, actual_price | Решения ML-модели по ценам |
| `scenario_runs`, `scenario_notifications`, `browser_agent_scenarios` | … | Автономные сценарии |
| `fomo_events` | master_id, type, reason | FOMO-блокировки |
| `legacy_tables` (`schema/legacy-tables.ts`) | разные | Старые таблицы для бэкапов |
| **DROPPED в Phase C**: `master_token_packages`, `master_token_purchases`, `wallet_transactions`, `master_token_orders`, `master_token_offers`, `token_pricing_rules`, `master_token_settings` | — | Все 7 token-таблиц удалены |
| **Сохранены 90 дней**: `token_audit_log`, `token_price_history` | — | Архив для аудита |

## Что нужно добавить для маркетплейса

| Сущность | Зачем |
|---|---|
| **`master_profiles`** (или колонки в `masters`) | `slug` (unique, для URL), `bio` (текст "о себе"), `years_experience`, `email`, `is_published` (boolean — опубликован ли в маркетплейсе), `verified_at`, `seo_title`, `seo_description` |
| **`master_portfolio`** | `id, master_id, title, description, photos[], service_type, city, completed_at, before_photos[], after_photos[], price_range` — кейсы для публичной карточки |
| **`master_reviews_public`** | отдельная таблица для **публичных отзывов клиентов** (текущая `master_reviews` — внутренние от операторов). Поля: `id, master_id, order_id, client_name, rating (1..5), text, photos[], moderated, created_at` |
| **`cities`** | сейчас города — это просто строки в `leads.city`/`orders.city`. Нужна нормализованная таблица: `id, name, slug, region, lat/lng, population, is_active, seo_*` |
| **`services`** | `service_types` есть, но без `slug`/`seo`. Расширить: `id, name, slug, parent_id, icon, description, price_from, seo_*` |
| **`service_categories`** | сантехника / электрика / отделка / комплекс — для группировки |
| **`service_city_pages`** (или генерируем на лету) | `service_id × city_id × seo_*` — таблица для precompute SEO-страниц `/santehnik/krasnodar` |
| **`tariffs`** | Free / Pro / Enterprise: `id, slug, name, price_per_month, lead_price (₽ или 0), features[], is_active` |
| **`master_subscriptions`** | `id, master_id, tariff_id, started_at, ends_at, auto_renew, payment_provider, payment_id` |
| **`lead_purchases`** | `id, master_id, lead_id, price, exclusive (bool), purchased_at, status` — мастер купил лид |
| **`payments`** | `id, type (subscription/lead_purchase/refund), amount, provider (yookassa/cloudpayments), provider_id, status, master_id, related_id` — единая платёжная книга |
| **`designs`** | `id, slug, master_id (nullable), client_phone, room_type (kitchen/bedroom/…), style, source_image_url, generated_image_url, prompt, fal_ai_request_id, is_public, seo_*, created_at` |
| **`design_generations`** | `id, design_id, attempt_num, status (pending/success/failed), cost (10₽), provider_response (json)` |
| **`user_design_limits`** | `client_phone, free_count_used, paid_count, last_reset_at` |
| **`design_image_variations`** | `id, design_id, image_url, style, ratings_count, avg_rating` |
| **`seo_pages`** (общая) | `id, slug, type (master/service-city/case/design/static), title, meta_description, h1, body_md, og_image, canonical, noindex, redirect_to, updated_at` |
| **`utm_sources`** или расширить `traffic_partners` | для трекинга маркетплейс-трафика |

---

# 9. API / backend

> Полные endpoints — см. секцию 3, "API routes". Здесь — критичные endpoints с деталями.

| Endpoint | Method | Принимает | Возвращает | Используется |
|---|---|---|---|---|
| `/api/auth/login` | POST | `{login, password}` | `{user: {id, role, permissions}}` + cookie | CRM login |
| `/api/auth/me` | GET | session cookie | `User` или 401 | CRM AuthProvider |
| `/api/auth/logout` | POST | cookie | `{success: true}` | — |
| `/api/master-pwa/login` | POST | `{login, password}` или `{telegramId}` | `{master, ...}` + cookie | PWA мастера |
| `/api/landing/leads` | POST | `{name, phone, city, district, area, services[], comment, ref_slug?}` | `{ok, lead: {id, source}}` | Публичный лендинг (rate-limit 5 сек/IP) |
| `/api/leads` | GET/POST/PATCH/DELETE | различные | список/создание/обновление лидов | CRM `/leads` |
| `/api/leads/:id/send-to-buffer` | POST | `{maxMasters?}` | `{order}` | Отправить лид в работу → создаёт `orders` |
| `/api/leads/check-phone?phone=...` | GET | phone | `{duplicate, existing[]}` | CreateLeadModal в CRM |
| `/api/leads/ai-parse` | POST | `{text}` | `{form, services[]}` | AI-парсинг переписки в форму |
| `/api/orders` | GET/POST/PATCH/DELETE | разное | список/CRUD | CRM, work-board |
| `/api/orders/:id` | PATCH | `{status?, orderAmount?, commission?, commissionPaid?, masterId?, ...}` | updated order | OrderPanel, work-board |
| `/api/orders/:id/agreement` | POST | `{amount, source, note?}` | audit-row | Phase 2 — фиксация суммы по словам мастера |
| `/api/orders/:id/manual-assign/:masterId` | POST | — | `{ok}` | Назначить мастера вручную |
| `/api/orders/:id/unassign-master` | POST | `{reason, rebroadcast, masterId?}` | `{ok, rebroadcasted}` | Снять мастера + опц. перерассылка |
| `/api/orders/:id/close-enrollment` | POST | — | `{ok}` | Завершить набор мастеров |
| `/api/dispatch/:orderId/assign/:masterId` | POST | — | `{ok}` | Принятие отклика мастера |
| `/api/dispatch/:orderId/broadcast` | POST | — | `{message, sent}` | Запустить волну рассылки |
| `/api/dispatch/:orderId/resend` | POST | — | `{ok}` | Повторная рассылка неответившим |
| `/api/dispatch/pending` | GET | — | `PendingDispatch[]` | Баннер на orders-странице |
| `/api/dispatch/:orderId` | GET | — | `{dispatches[]}` | OrderPanel |
| `/api/masters` | GET/POST/PATCH | — | `Master[]` | CRM masters page, master-picker |
| `/api/masters/avatar/:filename` | GET | — | image (или 200 + 1×1 transparent PNG если NoSuchKey) | UI |
| `/api/work-board/table?folder=...&...` | GET | query | `{rows, total, funnel, generatedAt}` | OrdersWorkspace |
| `/api/work-board/table/stream` | SSE | — | events `tick`, `changed` | live-updates |
| `/api/work-board/return-to-pool/:orderId` | POST | `{confirmed}` | `{ok}` | "Вернуть в пул" |
| `/api/work-board/orders/:orderId/partial-payment` | POST | `{amount, note}` | `{ok, payment, remaining}` | Частичная оплата комиссии |
| `/api/dashboard/action-items` | GET | `?period=&city=` | `{items[], summary}` | Action Items на дашборде |
| `/api/dashboard/action-items/:id` | GET | — | `Item` | Modal |
| `/api/dashboard/action-items/:id/action` | POST | `{action, payload}` | `{ok, orchestration?}` | Resolve, snooze, dismiss, message_master, и т.п. |
| `/api/dashboard/action-items/:id/ai-hint` | POST | — | `{hint}` | AI-подсказка на 30 мин |
| `/api/dashboard/action-items/snoozes` | GET/DELETE | — | `{count}` или `{cleared}` | Восстановить отложенные |
| `/api/dashboard/action-items/debug` | GET | — | `{summary, diagnosis[], activeOrderAgeBreakdown}` | Диагностика "почему нет задач" |
| `/api/receipts` | POST | `{orderId, lineItems, totalAmount, prepaymentAmount, notes}` | `Receipt` (с `token`) | Создание сметы |
| `/api/receipts/order/:orderId` | GET | — | `Receipt[]` | OrderPanel |
| `/api/receipts/:id` | DELETE | — | `{ok}` | Удалить смету |
| `/api/receipt/:token/data` | GET | — | `Receipt JSON` | Smeta SPA-страница |
| `/api/receipt/:token` | GET | — | HTML SSR-страница | Публичная смета (для шеринга/печати) |
| `/api/receipt/:token/print` | GET | — | HTML для `window.print()` | Печать |
| `/api/receipt/:token/confirm` | POST | FormData(`clientName`, `screenshot`) | `{ok}` | Клиент подтверждает оплату скриншотом |
| `/api/client/my-orders?phone=...` | GET | phone | `{items[]}` | Клиентская PWA |
| `/api/client/chat/:token/messages` | GET | — | `Message[]` | Чат клиент↔мастер |
| `/api/client/chat/:token/reply` | POST | `{text}` | `{ok}` | Отправка сообщения |
| `/api/uploads` | POST | multipart (file) | `{url}` | S3/GCS upload |
| `/api/storage/sign-upload` | POST | `{filename, contentType}` | `{uploadUrl, finalUrl}` | Pre-signed S3 URL |
| `/api/avito/connect` | GET | OAuth callback | redirect | Avito |
| `/api/avito/messages` | GET | — | `Message[]` | CRM avito-messages |
| `/api/finance/transactions` | GET/PATCH | — | `Transaction[]` | CRM finance |
| `/api/account-balance/:masterId` | GET | — | `{balance, recommended, transactions[]}` | Master detail |
| `/api/account-balance/:masterId/topup` | POST | `{amount, note}` | `{ok, balance}` | Пополнение баланса мастера (вручную оператором) |
| `/api/contract/sign` | POST | `{fullName, passport*, ip}` | `{ok}` | Подписание договора мастером |
| `/api/system/feature-flags` | GET | — | `{[key]: boolean}` | useFeatureFlags hook |
| `/api/health`, `/api/system-status` | GET | — | `{ok, database, ...}` | мониторинг |

> **Замечание по платежам**: создание/выдача лида или подписки — endpoints **отсутствуют**. Их нужно делать с нуля.

---

# 10. Авторизация и роли

## Архитектура

- **Express-session** + `connect-pg-simple`: сессии хранятся в таблице `sessions` (Postgres), cookie `connect.sid` (httpOnly, secure, sameSite=none, 1 день TTL).
- **CSRF**: явной защиты нет (полагается на same-site cookie + CORS allow-list).
- **Bcrypt** через `bcryptjs` для паролей оператора и pwa-логина мастера.
- **Trust proxy = 1** (Railway behind reverse proxy).
- **CORS allow-list**: `CRM_ORIGIN`/`CRM_URL`/`PUBLIC_CRM_URL` env + дефолты `https://sfera-master.ru`, `https://www.sfera-master.ru`. Все остальные origins блокируются.
- **CSP** (Content-Security-Policy) выставляется глобально в `app.ts`: `default-src 'self'`, разрешены fonts.gstatic, https-images, inline-стили, SSE.

## Где хранится пользователь

| Тип | Таблица | Хранилище auth |
|---|---|---|
| **Оператор / админ** | `users` (`id, login, password_hash, name, role, permissions[]`) | session.userId |
| **Мастер** | `masters` (`pwa_login`, `pwa_password_hash`) | session.masterId (отдельная сессия) |
| **Партнёр трафика** | `traffic_partners` + `users` (если есть `user_id`) | session |
| **Клиент** | **Без аккаунта**. Идентификация по телефону, который сохраняется в `localStorage` клиентской PWA + используется в `/api/client/my-orders?phone=...` |

## Роли

`pgEnum user_role`: **`admin`**, **`lead_operator`**, **`master_operator`**, **`partner`**.

Дополнительно — массив `permissions[]` в `users.permissions` (json) для гранулярных прав.

В CRM `App.tsx` маршруты обёрнуты в `<ProtectedRoute>` (с `allowedRoles[]` + `permissionKey`).  
На сервере — middleware `requireRole(...roles)` (`middlewares/requireAuth.ts`) или `requireMasterAuth()` для PWA.

## Можно ли добавить публичные страницы без авторизации

**Да.** Уже есть несколько публичных endpoints без auth:
- `/api/health`, `/api/system-status`
- `/api/landing/leads` (POST с rate-limit)
- `/api/receipt/:token/*` (по UUID-токену)
- `/api/client/my-orders` (по телефону)

Для маркетплейса нужно добавить:
- `/api/marketplace/masters?city=&service=&...` (GET, public, кеш)
- `/api/marketplace/masters/:slug` (GET, public)
- `/api/marketplace/services` (GET, public)
- `/api/marketplace/cities` (GET, public)
- `/api/marketplace/leads` (POST, public, rate-limit) — заявка из публичной формы маркетплейса
- `/api/marketplace/designs` (GET/POST, частично public)
- `/sitemap.xml`, `/robots.txt` (статика на api-server)

Всё это легко вписывается в существующую модель — нужен только новый router `routes/marketplace.ts` без middleware на auth.

---

# 11. Что уже готово для SEO-маркетплейса

## Общий вердикт

**Архитектура НЕ готова к SEO-маркетплейсу из коробки**. Главная проблема: **все фронты — Vite SPA**, рендеринг происходит **в браузере**. Поисковики (особенно Яндекс) индексируют такие страницы плохо/частично.

Для SEO нужен **SSR (server-side rendering) или SSG (static-site generation)**. У нас сейчас:
- ❌ Нет Next.js / Remix / Nuxt / Astro.
- ❌ Нет prerendering (нет prerender-plugin для Vite).
- ❌ Нет sitemap.xml, robots.txt.
- ❌ Title/meta задаются в `index.html` статически (`<title>Честный мастер</title>`), не меняются по странице.
- ❌ Нет breadcrumbs, schema.org, canonical, h1-семантики.

**Хорошие новости**:
- API на Express уже отдаёт HTML для `/api/receipt/:token` (это полноценный SSR-page). Этот же подход можно использовать для marketplace-страниц.
- Express может отдавать `sitemap.xml` и `robots.txt` как dynamic-routes.
- Структура БД позволяет сгенерировать тысячи SEO-страниц по комбинации `service × city × master`.

## По каждому пункту

### 1. Публичный список мастеров `/masters`

> ⚠️ Сейчас `/masters` — это **301 redirect** на `/master-landing/v3/honest` (лендинг для набора мастеров)! Это конфликт. Нужно переименовать лендинг, например, в `/become-master`, чтобы освободить `/masters`.

- **Куда добавить**: новый артефакт `artifacts/marketplace/` (Next.js или Astro для SSR/SSG) **или** SSR-роут в `api-server` `/marketplace/masters` с шаблоном HTML.
- **Какие компоненты переиспользовать**: дизайн-система из `client/` (бирюзовая палитра, шрифт Plus Jakarta Sans, BottomNav, SectionCard, trust-badges).
- **Какие данные нужны**: `masters` + `master_wallet` (для скрытия неактивных) + `master_reviews_public` + city/service-фильтры.
- **Чего не хватает в БД**: `master.slug`, `master.bio`, `master.is_published`, `master.years_experience`, `master.email`. Также `master_portfolio`, `master_reviews_public`.

### 2. Публичная карточка мастера `/masters/[slug]`

- **Куда**: тот же артефакт. Шаблон страницы:
  - Hero: имя, аватар, рейтинг, город, специализация, кнопка "Заказать"
  - Tabs: "О себе" (bio) / "Портфолио" / "Отзывы" / "Услуги и цены"
  - JSON-LD: schema.org `LocalBusiness` или `ProfessionalService`
- **Компоненты**: можно переиспользовать `master-drawer` из CRM (refactor для public view).
- **Данные**: master + portfolio + public reviews + service_prices.
- **Чего не хватает**: всё перечисленное в пункте 1 + `master_portfolio` (с фото "до/после", описанием, услугой).

### 3. Страницы услуга × город `/[serviceSlug]/[citySlug]`

Пример: `/santehnik/krasnodar`, `/elektrik/moskva`, `/uborka/sochi`.

- **Куда**: SSR-роут или статический генератор.
- **Шаблон**:
  - H1: "Сантехник в Краснодаре"
  - Список топ-N мастеров (карточки с рейтингом и кнопкой "Заказать")
  - Цены (от X ₽ за работу — берём из `master.servicePrices`)
  - Описание услуги (5-10 параграфов SEO-текста)
  - FAQ (типовые вопросы)
  - CTA-форма "Получить смету бесплатно" → `/api/marketplace/leads`
  - Schema.org: `Service` + `Place` + `AggregateOffer`
- **Данные**: services + cities + masters (фильтр по city + specialization) + reviews.
- **Чего не хватает**: `cities` и `services` как нормализованные таблицы со slug, seo_title, seo_description, body_md.

### 4. Страницы цен `/prices/[serviceSlug]-[citySlug]`

Пример: `/prices/santehnik-krasnodar`.

- **Куда**: SSR.
- **Шаблон**:
  - H1: "Цены на сантехнику в Краснодаре 2026"
  - Таблица: Услуга / Цена от / Цена до / Средняя
  - Формула расчёта (если есть)
  - "Заказать смету" CTA
  - Schema.org: `PriceSpecification` или `OfferCatalog`
- **Данные**: агрегаты по `transactions` + `master.servicePrices` + ML-pricing decisions.
- **Чего не хватает**: таблицы прайсов с историей (можно добавить `service_pricing_history` или генерить из transactions).

### 5. Страницы кейсов `/cases/[slug]`

- **Куда**: SSR. Подходит модель "лучшие выполненные заказы" + фото "до/после".
- **Шаблон**:
  - H1, фото "до", фото "после", описание работ, время, стоимость, мастер, отзыв клиента, JSON-LD `Article`.
- **Данные**: `orders` (status=completed, photos_before/after, client_review) + master.
- **Чего не хватает**: модерация какие кейсы публикуются (`orders.is_published`?) или отдельная таблица `published_cases (id, order_id, slug, custom_title, custom_description)`.

### 6. Страницы AI-дизайнов `/design/[slug]`

- **Куда**: SSR. Каждый сгенерированный дизайн → публичная страница.
- **Шаблон**:
  - Hero: фото "было / стало" (slider или две колонки)
  - Стиль, тип помещения, дата
  - "Хочу такой ремонт" CTA → создаёт `lead.source='design'` с привязкой к `design_id`
  - "Сделай свой" CTA → `/estimate` или `/design/new`
  - Schema.org: `CreativeWork` или `ImageObject`
- **Данные**: `designs` table.
- **Чего не хватает**: всех таблиц про дизайны (см. секцию 14).

---


# 12. Заявки и лиды

## Текущий поток

```
Источник лида (Avito / лендинг / клиентская PWA / оператор-вручную)
   ↓
POST /api/landing/leads (или /api/leads из CRM)
   ↓
запись в `leads` (status=new)
   ↓
оператор смотрит в CRM /crm/leads (вкладка "Новые")
   ↓
нажимает "Отправить мастерам" (POST /leads/:id/send-to-buffer)
   ↓
создаётся `orders` (status=waiting_master) + первая волна dispatch
   ↓
рассылка в Max-бот / push мастерам по фильтрам (город, специализация, рейтинг, debt)
   ↓
мастер откликается через PWA (POST /api/dispatch/:orderId/respond)
   ↓
оператор назначает (POST /api/dispatch/:orderId/assign/:masterId)
   ↓
мастер берёт в работу → составляет смету → клиент платит → in_progress → completed
   ↓
после completed: `service_fee_transactions` списывается с master_wallet
```

## Похожий механизм для marketplace-лидов?

**Да, есть.** Сейчас лиды с лендинга (`source='landing'`) идут той же логикой. Маркетплейс-лиды можно отправлять с `source='marketplace'` и они автоматически появятся в CRM.

**Но**: для модели "лид как товар" нужна **новая логика**:
- Лид создаётся с `source='marketplace'` и `status='available'` (новый статус).
- Мастер видит лид в PWA в **анонимном** виде (без телефона, без точного адреса — только город, район, услуга, площадь, ориентировочная цена).
- Мастер может **купить лид** → списание из `master_wallet.balance` или с `master_subscriptions` (если Pro-тариф включает N бесплатных лидов в месяц).
- После покупки: телефон + полный адрес становятся видны **только этому мастеру**.
- Лид может быть **эксклюзивным** (один покупатель) или **бродкастным** (до 3-5 мастеров).

## Где лучше создать модель Lead

Лучше **расширить существующую `leads`**, а не создавать новую таблицу. Добавить колонки:
- `source = 'marketplace'` (уже строка, ничего не нужно)
- `is_exclusive: boolean` (для эксклюзивных лидов)
- `price: numeric(10,2)` (стоимость покупки этого лида в ₽)
- `max_purchases: int` (default 3 для бродкастных)
- `purchases_count: int` (counter)
- `is_available: boolean` (вычисляемо: status='new' AND purchases_count < max_purchases)

И отдельная таблица **`lead_purchases`**:
```
id, lead_id, master_id, price_paid, purchased_at, exclusive (bool),
contact_revealed_at (когда мастер посмотрел телефон),
status (active/refunded/expired)
```

## Как связать Lead с Master

Через `lead_purchases.lead_id ↔ lead_purchases.master_id`.  
Один lead → 0..N master (для бродкаста).  
Один master → 0..N lead (его покупки).

## Как скрыть телефон до покупки

В API endpoints возвращать **разные DTO**:

```ts
// До покупки (PWA "лента"):
GET /api/master-pwa/marketplace-leads → {
  id, city, district_partial: "Центр", service_type, area, price,
  // НЕТ: client_name, client_phone, full_address, photos
}

// После покупки:
GET /api/master-pwa/leads/:id (только если master_id есть в lead_purchases) → {
  id, client_name, client_phone, city, district, full_address,
  service_type, area, photos, comment, scheduled_at
}

POST /api/master-pwa/leads/:id/buy → списание из wallet, создание lead_purchases
```

На уровне БД ничего не меняется, защита на уровне route.

## Где в PWA лента заявок

Уже есть `home.tsx` с разделом **"Новые заявки"** (это активные `order_dispatches` со статусом `sent`). Нужно добавить ещё одну секцию: **"Маркетплейс заявок"** — отдельная лента free/paid лидов с CTA "Купить лид за X ₽" или "Открыть бесплатно (Pro)". Можно либо сделать новую страницу `/master-pwa/marketplace`, либо добавить вкладку на существующую Home.

## Что нужно добавить в CRM

- Новая вкладка `/crm/leads?tab=marketplace` (или новый раздел `/crm/marketplace-leads`).
- Возможность **публиковать/снимать** лид с маркетплейса.
- Установка `is_exclusive` и `price` (можно автоматически считать через ML-pricing).
- Лог покупок (`lead_purchases`) с фильтром по мастеру.
- Возвраты (refund) — если мастер купил, но клиент не отвечает.
- Аналитика: % купленных лидов, средняя цена, выручка.

---

# 13. Монетизация мастеров

## Текущее состояние

После Phase D (закрытие token-модели) у мастера осталось:
- `master_wallet.balance` (₽) — депозит на оплату комиссии.
- `master_wallet.credit_limit` (₽) — кредит для тех, кто заслужил доверие.
- `master_deposits.recommended_amount` (10 000 ₽ default) — рекомендованная "подушка".
- `service_fee_transactions` — списания комиссии за каждый завершённый заказ (15% или фикс 5к, по тиру).
- `transactions` + `transaction_payments` — комиссии по конкретным заказам.

**Это commission-модель**: мастер платит комиссию **после** выполнения заказа. Подписок и lead-purchases нет.

## Цель — 4 уровня монетизации

| Уровень | Описание | Что нужно |
|---|---|---|
| **Free** | Мастер видит лиды без телефона. Покупает по 1 шт. за ₽. После N заказов открывается возможность Pro. | расширения `leads` + `lead_purchases` |
| **Подписка Pro** | За X ₽/мес мастер получает Y лидов "бесплатно" + приоритет в выдаче, + публикация в маркетплейсе. | `tariffs` + `master_subscriptions` + интеграция с эквайрингом |
| **Покупка лида** | Out-of-quota лид → списание из `master_wallet.balance` или подписочного баланса. | `lead_purchases` + расширение `master_wallet` (поле `subscription_leads_remaining`) |
| **Эксклюзивный лид** | Только один мастер получает контакт, цена выше. | `leads.is_exclusive` |

## Есть ли платежи

**Реальной интеграции с эквайрингом нет.** Yandex Pay интегрирован для приёма предоплаты от **клиента** (не мастера). Для подписок мастеров нужна одна из:
- **ЮKassa** (рекомендую: РФ, рекуррентные платежи, привязка карты)
- **CloudPayments** (тоже подходит)
- **Tinkoff Acquiring** / **Сбербанк Acquiring**

Нужны endpoints:
- `POST /api/master-pwa/subscriptions/checkout` → создаёт инвойс, возвращает payment_url
- `POST /api/payments/webhook/yookassa` → webhook от ЮKassa, обновляет `payments.status`, активирует подписку
- `POST /api/master-pwa/wallet/topup` → пополнить ₽-баланс

## Куда лучше добавить тарифы

В **CRM `/crm/settings?tab=tariffs`** — таблица CRUD тарифов.

В **PWA мастера** — новая страница `/master-pwa/subscription` (или вкладка в Profile/Wallet):
- Текущий тариф + дата окончания.
- Сравнение тарифов.
- Кнопки "Оформить Pro" / "Купить лид".
- История платежей.

## Какие модели нужны

```ts
// lib/db/src/schema/tariffs.ts
tariffs:
  id, slug, name, price_per_month, price_per_year,
  free_leads_per_month, lead_price (для out-of-quota),
  exclusive_lead_price, marketplace_publication (bool),
  priority_in_dispatch (bool), features (json), is_active

// master_subscriptions
master_subscriptions:
  id, master_id, tariff_id, status (active/cancelled/expired),
  started_at, ends_at, auto_renew, leads_remaining_this_period,
  payment_provider, payment_provider_subscription_id,
  next_charge_at, cancelled_at

// lead_purchases
lead_purchases:
  id, lead_id, master_id, price_paid (₽), source (subscription/wallet/free),
  exclusive (bool), purchased_at, contact_revealed_at,
  status (active/refunded), refunded_at, refund_reason

// payments (единая платёжная книга)
payments:
  id, type (subscription/lead_purchase/topup/refund),
  amount (₽), currency (default RUB),
  master_id, related_id (subscription_id или lead_purchase_id),
  provider (yookassa/cloudpayments/manual),
  provider_id (внешний id), provider_payment_url,
  status (pending/succeeded/failed/refunded),
  metadata (json), created_at, paid_at

// master_balance (можно расширить master_wallet)
master_wallet добавить:
  current_subscription_id (FK),
  subscription_leads_remaining (int),
  last_subscription_renewed_at
```

## Какие экраны нужны в PWA мастера

- `/master-pwa/subscription` — управление подпиской, история платежей.
- `/master-pwa/marketplace` — лента лидов (с фильтром "только бесплатные/только paid").
- Модалка "Купить лид" (с подтверждением списания).
- Сообщение "У вас закончились бесплатные лиды по подписке, осталось N руб на балансе".
- Banner на Home при истечении подписки (за 3 дня до).

## Какие экраны нужны в CRM

- `/crm/settings?tab=tariffs` — CRUD тарифов.
- `/crm/finance?tab=subscriptions` — список активных подписок, MRR, churn.
- `/crm/finance?tab=lead-purchases` — лог покупок лидов.
- `/crm/masters/:id` (drawer) — вкладка "Подписка": тариф, статус, история платежей, кнопка "Сменить тариф вручную".
- Кнопки "Вернуть деньги" / "Отменить подписку" / "Продлить вручную" — для саппорта.

---

# 14. AI-дизайнер интерьера

## Архитектура (предложение, без кода)

### Поток для пользователя

```
1. Пользователь заходит на /design/new (или /estimate с tab=design)
2. Загружает фото комнаты → S3/GCS
3. Выбирает room_type (kitchen/living_room/bedroom/bathroom/...)
4. Выбирает style (minimalism/scandinavian/loft/classic/...)
5. Backend → POST на Fal.ai API (image-to-image) с prompt
6. Получаем generated_image_url → сохраняем в БД и storage
7. Пользователь видит результат в реальном времени (либо polling, либо webhook → SSE)
8. Если "хочу ещё" — повторная генерация (бесплатно до 3 раз / phone)
9. После 3 раз → форма "Доплатить 10 ₽ за рендер" (через ЮKassa или Yandex Pay)
10. После генерации:
    - сохраняется в `designs` table с unique slug
    - создаётся публичная страница /design/:slug (SSR)
    - кнопка "Хочу такой ремонт" → /design/:slug/order → создаёт lead с design_id
```

### Какие модели БД нужны

```ts
designs:
  id, slug (unique, для URL),
  user_phone (FK to client identification),
  master_id (nullable, если ремонт делает конкретный мастер),
  room_type (enum: kitchen/bedroom/bathroom/living_room/hallway/office/childroom),
  style (enum: minimalism/scandinavian/loft/classic/modern/eco/industrial),
  source_image_url, generated_image_url,
  prompt (текст), prompt_extras (json — color palette, materials, etc.),
  fal_ai_request_id,
  is_public (bool, default true), is_featured (bool),
  cost_in_kopeks (10₽ = 1000 копеек),
  view_count, share_count,
  seo_title, seo_description, og_image,
  created_at, updated_at

design_images:
  id, design_id, image_url, type (source/generated/inspiration/before/after),
  width, height, mime_type, file_size, storage_key

design_generations:
  id, design_id, attempt_num,
  status (pending/processing/success/failed),
  fal_ai_request_id, started_at, completed_at,
  error_text, cost_kopeks (0 для бесплатных, 1000 для платных)

user_design_limits:
  client_phone, free_count_used (default 0),
  paid_count, last_reset_at,
  daily_limit (default 5)

// Если связываем дизайн с конкретным заказом:
ordersTable добавить:
  design_id (nullable FK to designs)
```

### Какие API routes нужны

```
POST /api/design/upload-source     → загрузка исходного фото, ratelimit
POST /api/design/generate          → запуск Fal.ai генерации, проверка лимитов
GET  /api/design/:slug              → публичная инфа (без auth)
GET  /api/design/:slug/data         → JSON для SPA-страницы
GET  /api/design/list?room=&style=  → каталог дизайнов (SEO)
POST /api/design/:slug/like         → лайк (по фингерпринту)
POST /api/design/:slug/order        → создать lead с привязкой к дизайну
GET  /api/design/limits?phone=...   → текущие лимиты пользователя
POST /api/design/payment            → ЮKassa-инвойс на 10₽
POST /api/design/payment/webhook    → ЮKassa webhook
```

### Где хранить изображения

Уже есть инфраструктура — `lib/object-storage-web/` + S3 (через `@aws-sdk/client-s3`) или GCS (`@google-cloud/storage`). Bucket для дизайнов:
- `s3://sfera-master-assets/designs/{designId}/source.jpg`
- `s3://sfera-master-assets/designs/{designId}/generated.jpg`
- (опционально) `s3://sfera-master-assets/designs/{designId}/thumbnails/...`

Pre-signed URL'ы на 1 час для прямой загрузки с фронта.  
CDN: можно поставить Cloudflare или Yandex Cloud CDN перед bucket'ом.

### Где создавать SEO-страницы

Маркетплейс-артефакт (новый Next.js / Astro / SSR-Express):
- `/design/[slug]` — публичная страница дизайна (SSR с meta-тегами, og:image, schema.org).
- `/design/[room]` — каталог по типу комнаты (`/design/kitchen`).
- `/design/[room]/[style]` — `/design/kitchen/scandinavian`.
- `/design` — главная "галерея".
- Все страницы попадают в `/sitemap.xml` автоматически.

Slug-генерация:
```
{room}-v-{style}-{shortHash}
пример: kuhnja-v-skandinavskom-stile-x7f3
```

### Как связать Design с Lead

В таблице `leads` добавить колонку `design_id (nullable FK)`.  
Когда пользователь нажимает "Хочу такой ремонт":
1. Открывается форма (имя, телефон, город, район, площадь).
2. POST `/api/design/:slug/order` → создаёт lead с `design_id`, `source='design'`, `services=[design.room_type]`.
3. В CRM этот лид открывается с превью исходного фото и сгенерированного → оператору проще оценить и переслать профильному мастеру.
4. В PWA мастера в карточке заявки тоже виден дизайн (это сильно повышает мотивацию мастера откликнуться).

### Какие места проекта подходят для интеграции

| Место | Зачем |
|---|---|
| `routes/design.ts` (новый) | API endpoints |
| `lib/db/src/schema/designs.ts` (новый) | таблицы |
| `artifacts/client/src/pages/Estimate.tsx` | добавить tab "AI-дизайн" — повторно использовать UI загрузки фото |
| Новый артефакт `artifacts/marketplace/` | публичные SSR-страницы `/design/*` |
| `artifacts/master-pwa/src/pages/orders.tsx` | показывать дизайн в карточке заказа, если есть `order.design_id` |
| `artifacts/crm/src/components/leads/LeadDetailPanel.tsx` | показывать прикреплённый design |
| `lib/integrations/fal-ai/` (новый shared package) | абстракция над Fal.ai SDK |
| `routes/storage.ts` | расширить для дизайн-buckets |
| `system_settings` | feature flag `design_ai_enabled` |

### Защита от злоупотреблений

- Rate-limit per phone (3 бесплатных в день, 10 платных в день).
- Cloudflare Turnstile / hCaptcha на форме генерации.
- Nudity/violence фильтры (Fal.ai обычно отдаёт `nsfw_detected` flag).
- Логирование Fal.ai-затрат — `design_generations.cost_kopeks` для контроля.

---

# 15. SEO-требования

## Текущее состояние

| Что нужно | Что есть |
|---|---|
| **SSR / SSG** | ❌ нет. Все фронты — Vite SPA. |
| **Title/meta** | ⚠️ статически в `index.html`. Не меняются по странице. |
| **H1** | ⚠️ задаются в JSX, но проблема в том, что для индексации нужен HTML, а не JS-rendered. |
| **Breadcrumbs** | ❌ нет компонента. |
| **schema.org / JSON-LD** | ❌ не используется. |
| **sitemap.xml** | ❌ нет. |
| **robots.txt** | ❌ нет (надо проверить, может быть в `client/public/`). |
| **canonical** | ❌ нет. |
| **Человекочитаемые URL** | ✅ для лендингов и static pages есть. ❌ для мастеров (`/masters/123` числовой), услуг, городов нет slug-полей в БД. |
| **Индексируемые страницы** | ❌ для SPA Яндекс/Google индексируют плохо. Нужен SSR или prerendering. |

## Что нужно добавить

### 1. Выбрать SSR-стратегию

Три варианта:

**Вариант A — Next.js (рекомендую)**

- Создать новый артефакт `artifacts/marketplace/` (Next.js 15 App Router).
- На нём — все публичные страницы маркетплейса (`/masters`, `/[service]/[city]`, `/cases/*`, `/design/*`).
- API client — переиспользовать `lib/api-client-react/`.
- БД — общий `@workspace/db` package.
- Деплой — отдельный Railway-сервис или тот же node-process через Express, отдающий Next.js-сервер.

**Плюсы**: индустриальный стандарт SEO, ISR (incremental static regeneration) — идеально для master-карточек, image optimization из коробки, app router с layouts.

**Минусы**: миграция UI-системы (Wouter → Next.js Router), 200-500MB дополнительной зависимости.

**Вариант B — Astro**

- Astro — оптимальный для SEO (Static-by-default, SSR опционально).
- Меньше JS-bundle для пользователя.
- Можно использовать React-компоненты (`client:load`).

**Плюсы**: лучшие Core Web Vitals, минимум JS, идеально для SEO-страниц.

**Минусы**: меньше экосистема, сложнее динамические части (если есть).

**Вариант C — Express SSR (минимум изменений)**

- На существующем `api-server` сделать роуты `/marketplace/*` которые возвращают полный HTML (как `/api/receipt/:token`).
- Использовать `react-dom/server` для SSR React-компонентов.

**Плюсы**: минимум новых зависимостей, всё в одном процессе.

**Минусы**: нет ISR, нет image optimization, hydration делать вручную, поддерживать сложно.

### 2. Sitemap.xml

Реализовать через Express:
```
GET /sitemap.xml         → index с подсайтами
GET /sitemaps/masters.xml → все опубликованные мастера
GET /sitemaps/services.xml → все service × city комбинации
GET /sitemaps/designs.xml → все публичные дизайны
GET /sitemaps/cases.xml   → все опубликованные кейсы
```

Кеш в Postgres (таблица `sitemap_cache (path, content, updated_at)`) с TTL 1 час.

### 3. Robots.txt

```
User-agent: *
Allow: /
Disallow: /crm/
Disallow: /master-pwa/
Disallow: /partner/
Disallow: /api/
Disallow: /smeta/
Disallow: /my-orders

Sitemap: https://sfera-master.ru/sitemap.xml
```

### 4. Schema.org (JSON-LD)

Минимум:
- `Organization` (на главной + во всех footer'ах)
- `LocalBusiness` (на каждой странице мастера)
- `Service` (на странице услуги)
- `BreadcrumbList` (на всех вложенных страницах)
- `Review`, `AggregateRating` (если есть отзывы)
- `Product` или `Service` + `Offer` + `PriceSpecification` (для страниц цен)
- `CreativeWork` (для дизайнов)
- `Article` (для кейсов)
- `WebSite` + `SearchAction` (для встроенного поиска в Google)

### 5. Meta-теги

На каждой публичной странице:
- `<title>{seo_title} — Честный мастер</title>` (≤60 chars)
- `<meta name="description" content="...">` (≤160 chars)
- `<meta property="og:title">`, `og:description`, `og:image`, `og:url`, `og:type`
- `<meta name="twitter:card" content="summary_large_image">`
- `<link rel="canonical" href="...">`
- `<link rel="alternate" hreflang="ru" href="...">`
- (если страница не для индекса) `<meta name="robots" content="noindex, nofollow">`

### 6. URL-структура

| Тип страницы | URL |
|---|---|
| Главная | `/` |
| Список услуг | `/uslugi` |
| Услуга | `/uslugi/[serviceSlug]` (`/uslugi/santehnika`) |
| Услуга × Город | `/[serviceSlug]/[citySlug]` (`/santehnik/krasnodar`) — короткий, основной для SEO |
| Цены | `/ceny/[serviceSlug]-[citySlug]` или `/[serviceSlug]/[citySlug]/ceny` |
| Список мастеров | `/mastera` (или `/masters` после переименования лендинга) |
| Карточка мастера | `/master/[slug]` |
| Кейсы общие | `/kejsy` |
| Кейс | `/kejsy/[slug]` |
| Дизайны | `/dizajn` |
| Дизайн | `/dizajn/[slug]` |
| Дизайны по комнате | `/dizajn/[room]` |
| Дизайны комната × стиль | `/dizajn/[room]/[style]` |

> Транслитерация русских слов в slug (через библиотеку `transliterate` или собственный helper) — обязательно.

### 7. Что нужно добавить в БД

- `cities.slug, seo_title, seo_description, h1, body_md`
- `services.slug, parent_id, seo_*, body_md`
- `masters.slug, bio, is_published, seo_*`
- `seo_pages` table — общая для статических SEO-страниц (для тех, что не привязаны к сущностям).

---

# 16. Риски

## Хрупкие части проекта

### 1. ИИ-диспетчер (`dispatcherAI.ts`)

- Управляется через `AI_INTEGRATIONS_OPENAI_BASE_URL` env. Недавно был баг: указан был `vibecode-claude.online` (coding-bias proxy), пришлось перевести на OpenRouter.
- Память per-master, per-order в `bot_memory` table.
- При смене модели/провайдера легко сломать диалоги (формат system prompt, function calling support).
- **Не трогать** без явного теста на staging.

### 2. Рассылка заказов мастерам (`broadcastOrder.ts`, `priorityAssign.ts`)

- Сложная логика приоритетов: рейтинг + специализация + город + долг + количество активных заказов + cooldown между рассылками.
- Любое изменение в фильтрах может сломать продакшен-метрику "% откликнувшихся за 5 минут".
- Связано с волнами `order_broadcast_waves` и cooldown'ами.

### 3. Payment_State engine

- Двухпутевая модель: Agreement_Path (со слов мастера) + Receipt_Path (через смету) + конфликты между ними.
- Свежая логика, может ещё содержать угловые case-ы.
- При добавлении новых статусов (например, `subscription_lead`) — обновить state machine.

### 4. PWA service worker

- Своя реализация (без Workbox). При обновлении SW главное окно делает reload по сообщению `SW_UPDATED`.
- Если сломать его — мастера не увидят новые версии PWA, будут ловить "Failed to fetch dynamically imported module" (это уже починено через Cache-Control + auto-reload в `main.tsx`).
- **Не менять** `sw.js` без тестирования на нескольких браузерах.

### 5. Phase D (только что закрыта)

- Удалена token-модель, осталось 4 deprecated-колонки в `master_wallet`.
- Если случайно использовать в новом коде `tokens_balance` или `credit_tokens_*` — будут нули и неправильная логика.
- В `home.tsx` PWA ещё есть `tokensCost` поле в OrderCard — использовать как **commission**, а не token.

### 6. Сессии и CORS

- В проде сессия cookie httpOnly + secure + sameSite=none + 1 день TTL.
- CORS allow-list жёсткий: только `sfera-master.ru` и переменные `CRM_*`. Если деплоить новый домен (например, `marketplace.sfera-master.ru`) — добавить в allow-list, иначе все API вызовы заблокируются.
- Ключ `SESSION_SECRET` короче 32 символов = startup-error.

### 7. Drizzle миграции

- 5 миграций (последние 4 по token-теме).
- При добавлении новых таблиц — `pnpm --filter @workspace/db exec drizzle-kit generate --name=<name>` затем приложить вручную или через `pnpm db:migrate`.
- На Railway prod миграции **не запускаются автоматически** — только вручную через прямой psql или Railway shell.
- **Перед DROP** любой таблицы — backup БД в Railway dashboard.

## Что нельзя трогать без необходимости

| Файл / часть | Почему |
|---|---|
| `lib/db/migrations/0000_baseline.sql` | стартовая схема, любые изменения — только новой миграцией |
| `artifacts/api-server/src/index.ts` (runRuntimeFixes) | startup hooks, могут уронить деплой |
| `artifacts/master-pwa/public/sw.js` | service worker — сломается обновление PWA |
| `artifacts/master-pwa/src/lib/auth.ts` | сессии мастера, любая ошибка = массовый logout |
| `routes/dispatch.ts` + `lib/broadcastOrder.ts` + `lib/priorityAssign.ts` | механика рассылки заказов |
| `routes/orders.ts` PATCH `/orders/:id` | central order mutation, много веток (cancellation, force-paid, partial payment) |
| Платёжный flow (`routes/yandex-pay.ts`, `routes/receipts.ts`) | подтверждения скриншотов от клиентов, реальные деньги |
| CSP headers в `app.ts` | если ужесточить — сломаются Google Fonts, inline-стили, SSE |
| `dogovor.md` / `dogovor-v2.md` | договор оферты, юридический документ |

## Где можно сломать PWA мастера

1. Изменение **bottom-navigation** — меняется UX для всех мастеров, ломается muscle-memory.
2. Изменение **AuthGuard** в `App.tsx` — может вызвать infinite redirect loop или массовый login.
3. Изменение **endpoint'ов `/api/master-pwa/*`** — должна быть обратная совместимость, потому что у мастеров может быть установлена старая версия PWA в кеше.
4. Изменение **формата push-уведомлений** — старые PWA-инсталляции могут перестать получать.
5. **manifest.json** изменения — потребуют переустановки PWA.
6. **Service worker** изменения — см. выше.

## Прочие риски

- **Кириллица в путях**: проект разрабатывается в `D:\Пушок\sfera888\` — это создаёт проблемы с PowerShell-обёртками (не критично для прода, но для локальной разработки на Windows — да).
- **Один сервер для всего**: api-server отдаёт API + статику всех 6 фронтов. Если он падает, падает абсолютно всё. Желательно вынести фронты на отдельный CDN или хотя бы на Nginx.
- **Нет CI/CD pipeline** в репо: нет `.github/workflows/`, нет автоматических тестов перед деплоем. Только ручной push в main → Railway автоматически деплоит. Для маркетплейса (с миграциями БД и платежами) — это **серьёзный риск**, нужно завести GitHub Actions с typecheck + tests + build перед merge.
- **Нет staging-окружения**: всё деплоится сразу в prod. Перед AI-дизайнером и платежами **обязательно** поднять staging Railway environment.
- **Дамп БД в репо** (`neondb_dump.sql`): большой файл с возможными PII (телефоны клиентов). **Удалить из git history** перед публичным релизом.
- **Нет rate limit на большинстве API**: только `auth/login` и `landing/leads` имеют. Маркетплейс-API нужно покрыть rate-limit'ом (особенно `/api/marketplace/leads`, `/api/design/generate`).

---

## Резюме для тех. директора

### Что готово (можно строить дальше):
- ✅ Backend Express + Drizzle, ~50 таблиц, ~35 routers.
- ✅ CRM с управлением заявками/заказами/мастерами/финансами.
- ✅ PWA мастера с лентой заказов, профилем, push, чатом.
- ✅ Клиентская PWA с AI-сметой, smeta-страницами, поддержкой.
- ✅ Лендинг мастера для набора (HonestLanding).
- ✅ Авторизация (operator + master) + сессии в Postgres.
- ✅ Push-уведомления (3 канала: PWA, Telegram, Max).
- ✅ Avito-интеграция, Yandex Pay для приёма предоплаты.
- ✅ Object storage (S3/GCS) для фото.
- ✅ ИИ-диспетчер для общения мастера с системой.
- ✅ Action items на дашборде с AI-подсказками.

### Что нужно построить для SEO-маркетплейса:
1. **Новый артефакт `artifacts/marketplace/`** (Next.js или Astro) с SSR/SSG публичных страниц.
2. **Новые модели БД**: master_profiles (slug, bio, is_published, seo_*), master_portfolio, master_reviews_public, cities (нормализация), services (нормализация), tariffs, master_subscriptions, lead_purchases, payments, designs, design_generations, user_design_limits, seo_pages, sitemap_cache.
3. **Новые API routes**: `/api/marketplace/*`, `/api/design/*`, `/api/payments/*`, `/api/master-pwa/marketplace-leads/*`.
4. **Расширения существующих таблиц**: `leads.is_exclusive/price/max_purchases/purchases_count`, `orders.design_id`, `master_wallet.subscription_*`.
5. **Интеграция с эквайрингом** (ЮKassa) для подписок.
6. **Интеграция с Fal.ai** для AI-дизайнера.
7. **Sitemap.xml + robots.txt + canonical + JSON-LD + breadcrumbs**.
8. **Новые экраны в CRM**: tariffs, marketplace-leads, designs, seo-pages, payments-log.
9. **Новые экраны в PWA**: subscription, marketplace-feed, design-attached-orders.

### Приоритезация (моя рекомендация):

**Фаза 1 (1-2 месяца) — фундамент маркетплейса**:
- Нормализация cities/services со slug-ами и SEO-полями.
- Расширение masters (slug, bio, is_published, portfolio).
- Новый артефакт marketplace на Next.js, базовые публичные страницы (`/master/:slug`, `/[service]/[city]`).
- Sitemap, robots, schema.org, canonical.

**Фаза 2 (1 месяц) — заявки из маркетплейса**:
- Форма заявки на `/[service]/[city]` → `/api/marketplace/leads`.
- Модерация маркетплейс-лидов в CRM.
- Лента маркетплейс-лидов в PWA мастера (анонимная).

**Фаза 3 (1.5 месяца) — монетизация**:
- Тарифы + подписки + ЮKassa.
- Покупка лидов (out-of-quota).
- Эксклюзивные лиды.

**Фаза 4 (1-1.5 месяца) — AI-дизайнер**:
- Интеграция Fal.ai.
- Страницы /design/*.
- Связка с лидами.

**Фаза 5 (continuous) — оптимизация**:
- Кейсы (`/cases/*`), страницы цен.
- A/B тесты конверсии.
- Расширение тарифов и аналитики.

---

> Конец отчёта.
