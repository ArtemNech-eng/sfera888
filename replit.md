# Workspace

## Overview

CRM система для управления ремонтными заказами. pnpm workspace monorepo using TypeScript.

## Working context

- Рабочий корень репозитория: `d:/Сфера мастер/sfera888`
- Я работаю через Replit Agent, а код правится локально в VS Code и синкается через GitHub
- Все git-команды нужно запускать только из корня репозитория
- Если в терминале появляется `fatal: not a git repository`, значит команда была запущена не из `d:/Сфера мастер/sfera888`

## Git sync

```bash
cd "d:/Сфера мастер/sfera888"
git status
git add .
git commit -m "<message>"
git push origin main
```


## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + TailwindCSS + Shadcn/UI
- **Auth**: Session-based (express-session + bcryptjs)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   ├── crm/               # React CRM frontend (at /)
│   └── master-pwa/        # React PWA for masters (at /master-pwa/)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
│   └── src/seed.ts         # Database seeding script
```

## User Roles

1. **admin** (login: `admin`, pass: `admin123`) — Full access
2. **lead_operator** (login: `operator1`, pass: `operator123`) — Leads management
3. **master_operator** (login: `master_op`, pass: `master123`) — Masters & orders

## DB Tables

- `users` — CRM users
- `leads` — Incoming leads/requests from clients
- `orders` — Orders sent to buffer from leads
- `masters` — Masters with voronka_column_id, is_test_master, telegram_id
- `transactions` — Commission transactions
- `chat_cases` — Master Control Center cases (bypass/conflict/delay detection)
- `fomo_events` — FOMO block events log (blocked/unblocked/button_press)
- `cities`, `service_types` — Settings
- `telegram_chats`, `telegram_messages` — Telegram operator chat history
- `voronka_columns` — Configurable Kanban columns for masters board
- `receipts` — Electronic estimates (сметы) with client payment confirmation flow
- `client_support_messages` — Client→operator support chat (tied to receipt token)

## Notifications

> **Важно**: Telegram-бот **полностью удалён** из системы (24.04.2026). Уведомления мастеров идут только через **PWA push** и запись в CRM-чат (`masterMessagesTable`); параллельно дублируются в Max-бот, если у мастера есть `maxChatId`. Не добавлять `sendTg()` / `notifyMasterActivated()` / обращения к `api.telegram.org` в новые endpoint'ы. Колонка `masters.telegram_id` оставлена в БД как legacy-данные, но никакие исходящие сообщения через неё не идут.

### Order Limits

- **Test master** (`is_test_master=true`): max 1 active order; unlocked when commission paid
- **Regular master** (`is_test_master=false`): max 2 active orders simultaneously
- Masters in columns with `receivesOrders=false` cannot take orders (blocked in API and bot)

## Voronka (Masters Kanban Board)

- Fully configurable columns (add, rename, reorder, delete, color, receivesOrders flag)
- Default columns: Новые (pos 1), Свободен (pos 2, receivesOrders=true), На объекте (pos 3), Отстранён (pos 4)
- Auto-refreshes every 7 seconds
- Shows active orders on each master card with client phone/name
- Masters can be moved between columns via dropdown on card

## Key API Routes

- `POST /api/auth/login` — Login
- `GET /api/voronka/columns` — List Kanban columns
- `POST /api/voronka/columns` — Create column
- `PATCH /api/voronka/columns/:id` — Update column
- `POST /api/voronka/columns/reorder` — Reorder columns
- `DELETE /api/voronka/columns/:id` — Delete column
- `GET /api/voronka/masters` — Masters with active orders info
- `PATCH /api/voronka/masters/:id/column` — Move master to column
- `POST /api/orders/:id/assign-master` — Assign master (enforces column + limit rules)
- `POST /api/okidoki/webhook` — Receives contract signing status from doki.online; activates master on status "Подписан" (internal_id=2)
- `GET /api/dispatch/:orderId` — Dispatch status and respondents list
- `POST /api/dispatch/:orderId/broadcast` — Send order card to all active masters (without client phone)
- `POST /api/dispatch/:orderId/assign/:masterId` — Assign order to responding master; notifies with phone; updates others' messages
- `GET /api/work-board` — 8-column Kanban-конвейер для `/leads → "В работе"` (новые/ждут мастера/без сметы/смета+ждём оплату/смета оплачена/с остатком комиссии/закрыто 24ч/проблема). Возвращает `{funnel, columns, generatedAt}`.
- `GET /api/work-board/stream` — SSE-канал (heartbeat каждые 5с + push на `workBoardBus.notifyWorkBoardChanged()`).
- `POST /api/work-board/escalate/:orderId` — Помечает заявку как «нужен оператор» через `operatorNote`. Требует роль admin/lead_operator/master_operator.
- `POST /api/work-board/clear-problem/:orderId` — Снимает пометку. Та же авторизация.
- `POST /api/work-board/return-to-pool/:orderId` — Снимает мастера и возвращает заявку в `waiting_master`. **Требует `{confirmed: true}` в теле — авто-возврата нет, только по подтверждению оператора.** Та же авторизация.

## Work Board Kanban (CRM)

UI: `artifacts/crm/src/components/work-board-kanban.tsx`. Десктоп — 8 колонок с funnel-шапкой, мобильный — chip-фильтр (по умолчанию «🚨 Проблема»). **Визуальный язык — voronka.tsx**: glassmorphism (`rgba(255,255,255,0.60)` + `backdrop-filter: blur(20px) saturate(180%)`), цветной `border-top` по колонке, мягкие пастельные `headerBg`, count-pill в тон, `rounded-2xl` колонки + `rounded-xl` карточки. **Колонки скроллятся внутри** (`maxHeight: calc(100vh - 280px)`), все карточки видны без forced-collapse. Кнопка «↩︎ В пул» показывается только в `RETURNABLE_COLUMNS = {problem, waiting_master}` (десктоп и мобильный) — нельзя случайно вернуть в пул оплаченную/закрытую заявку. Карточки кликабельные `<button>` с keyboard-доступностью (Enter/Space) и `aria-label`. Подписка на `EventSource("/api/work-board/stream")` инвалидирует TanStack Query при `tick`/`changed`. Тариф комиссии: до 50к — фикс 5к, выше — 15%. Старая страница `/work-monitor` удалена; route редиректит на `/leads?tab=work` через wouter `Redirect`.

## Master PWA (`/master-pwa/`)

React PWA for masters to manage their orders independently.

### Auth
- Masters log in with `pwa_login` / `pwa_password_hash` (separate from Telegram)
- Session stored in same express-session as CRM (key: `masterId`)
- CRM operators set PWA credentials via master drawer → "МастерApp (PWA доступ)" section

### Pages
- **Главная** — Dashboard with new/active orders; new order cards open accept/reject sheet
- **Заказы** — Full order list with status stepper (accepted→on_way→on_site→work_done), photo upload (до/после/акт), complete modal
- **Баланс** — Debt info + transaction history
- **Профиль** — Master stats, tags, rating, logout

### API Routes (`/api/master-pwa/...`)
- `POST /auth/login` — Login with pwaLogin/pwaPassword
- `GET /auth/me` — Check session
- `POST /auth/logout` — Logout
- `GET /home` — Home page data (available + active orders)
- `GET /orders/available` — Dispatched orders awaiting response
- `GET /orders/my?filter=active|completed` — My orders
- `POST /orders/:id/accept` — Accept order (enforces limits, creates placeholder tx)
- `POST /orders/:id/reject` — Reject dispatched order
- `PATCH /orders/:id/status` — Update masterWorkStatus
- `PATCH /orders/:id/photos` — Save photo URL (type: before|after|act)
- `POST /orders/:id/complete` — Complete order with proposedAmount
- `GET /balance` — Balance + transactions
- `GET /profile` — Profile + stats
- `POST /admin/set-credentials/:masterId` — Set PWA login/password (requires CRM session)

### DB Fields Added
- `masters.pwa_login` — Unique login for PWA auth
- `masters.pwa_password_hash` — bcrypt hash
- `orders.master_work_status` — enum: accepted|on_way|on_site|work_done|completed
- `orders.photos_before[]` — Before-work photo URLs
- `orders.photos_after[]` — After-work photo URLs
- `orders.photo_act` — Act/document photo URL

## CRM/PWA Integration Features

### Push Notifications
- **Chat → PWA**: When admin/operator replies in CRM chat, master gets push notification (no Telegram required — works for PWA-only masters too)
- **Payment → PWA**: When admin marks transaction as "paid", master gets push notification with paid amount and remaining debt
- **Admin browser notifications**: CRM layout polls unread chat count every 10s; when count rises, browser notification fires (requests permission automatically)

### Work Photos in CRM
- `GET /api/orders` now returns `photosBefore[]`, `photosAfter[]`, `photoAct` from DB
- CRM dispatch panel shows photo thumbnails (До / После / Акт) when order has photos (clickable, open in new tab)

### Editable Master Rating
- `PATCH /api/masters/:id` accepts `rating` field
- CRM master drawer shows interactive star rating — hover to preview, click to save

## Commission Logic

- ≤50,000₽ → fixed 5,000₽
- 50,001–100,000₽ → 15%
- >100,000₽ → manual (defaults to 15%)
- When commission marked as "paid" → `is_test_master` set to false

### Electronic Receipts
- **Table**: `receipts` (id, token UUID hex, orderId FK, masterId FK, clientName, clientPhone, serviceType, city, district, amount, notes, createdAt)
- **Master PWA**: "Создать расписку клиенту" button in active order detail → bottom-sheet modal → enter amount (default 5000₽) + optional note → creates receipt and shows shareable link + copy/share buttons
- **Public page**: `GET /receipt/:token` — served as pure HTML (no auth required), shows branded receipt card with amount, client info, service details, requisites (Альфа Банк · Игорь К. · 89892860863)
- **CRM**: Collapsible "Расписки" section in order detail panel — lists all receipts with amount, timestamp, note, and clickable "Открыть расписку" link
- **Startup migration**: `receipts` table created via `runMigrations()` on server startup (idempotent CREATE TABLE IF NOT EXISTS)
- **API**: `POST /api/receipts` (master auth), `GET /api/receipts/order/:orderId` (admin/operator), `GET /api/receipts/public/:token` (public JSON)



## Payment_State Engine (estimate-optional-flow)

Спека `.kiro/specs/estimate-optional-flow/`. В проде с 12.06.2026 (commit `fb068ff9` Phase 2, `83cc43bc` Phase 3).

### Зачем

Раньше всё было завязано на смете мастера: пока мастер не создал receipt, система слала ему напоминания и блокировала через FOMO. Реальность: часть мастеров просто звонит и говорит "договорились на 8000". Оператор фиксирует сумму, считается комиссия — но цикл уведомлений о смете продолжает работать. Это создавало шум и путаницу.

Решение: derived поле `paymentState` (`no_amount | agreed | paid | cancelled`), pure-функция от `(order, receipts)`. Все 5 каналов уведомлений теперь фильтруются через `paymentState`.

### Что изменилось

| Было | Стало |
|---|---|
| `master_assigned + нет receipt` → задача "нет сметы", FOMO_BLOCK 48ч | `paymentState = no_amount` → задача, FOMO. Сумма зафиксирована (Agreement_Path) → ничего не шлётся. |
| Оператор вводил сумму через PATCH `/api/orders/:id` (без audit) | `POST /api/orders/:id/agreement` с audit-row, source, optional note. PATCH тоже теперь в `db.transaction` + audit. |
| Кнопка "Принять" в OrderPanel меняла только локально | Одна кнопка "Принять предложение мастера" → POST /agreement с `source=master_proposal`, push мастеру. |
| Конфликт сумм (мастер сделал смету ≠ Agreement) — игнорировался | Появляется задача `reconcile_amount` (SLA 30 мин) + `<ReconcileBanner>` в OrderPanel; Manager выбирает "Использовать сумму из сметы" / "Оставить согласованную". |
| Истории изменений суммы не было | `order_amount_audit` таблица + `GET /api/orders/:id/audit` + `<AmountAuditHistory>` collapsible в ClosingDrawer (Manager only). |

### Ключевые поля и таблицы

- `orders.agreement_amount_source` — `'agreement' | 'master_proposal' | 'manager_correction' | 'manager_force_paid' | 'reconcile_use_receipt' | 'reconcile_keep_agreement' | 'system_recalc' | 'operator_edit' | 'unknown'` или NULL (Receipt_Path).
- `orders.payment_state_changed_at` — timestamp последней смены paymentState. Для KPI.
- `orders.agreement_note` — текст с пометкой источника ("со слов мастера: 80м²").
- `order_amount_audit` (id, orderId, field, prevValue, newValue, source, reason, actorUserId, actorRole, actorAlias, createdAt). Запись в одной транзакции с изменением поля.

### Feature flags

`GET /api/system/feature-flags` возвращает 3 флага из `system_settings` (whitelisted):

| Ключ | Default | Управляет |
|---|---|---|
| `payment_state_engine_enabled` | `false` | Фильтрация 5 каналов уведомлений (cron, dashboard, work-board×2, fomoBlock). Сейчас `true` в проде. |
| `payment_state_audit_ui_enabled` | `false` | `<AmountAuditHistory>` в ClosingDrawer + блок "Источник суммы заказа" в /analytics. Сейчас `true` в проде. |
| `payment_state_master_proposal_oneclick` | `true` | Кнопка "Принять предложение мастера" в OrderPanel. |

Кеш TTL 60с в каждом инстансе (`paymentStateGuard.ts`). Toggle через SQL — изменение применяется без редеплоя:

```sql
INSERT INTO system_settings (key, value, updated_at)
VALUES ('<flag>', 'true', NOW())
ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = NOW();
```

Rollback — тот же SQL с `'false'`.

### Новые API endpoints

- `POST /api/orders/:id/agreement` — Operator фиксирует Agreement_Amount. Body: `{ amount, source?, noteSource?, note? }`. Источник `agreement` (default) или `master_proposal`. Создаёт audit, шлёт push/MAX мастеру, закрывает estimate-tasks.
- `GET /api/orders/:id/audit` — admin only. Лента изменений суммы.
- `GET /api/orders/stats/payment-state?state=no_amount&staleHours=48` — Для баннера "Сумма не зафиксирована >48ч".
- `GET /api/analytics/payment-state-mix?from=&to=&groupBy=day|week|month` — Распределение по источникам суммы.
- `PATCH /api/orders/:id { acceptReceiptAmount: true }` — Reconcile: принять сумму из сметы.
- `PATCH /api/orders/:id { keepAgreementAmount: true, reason: "..." }` — Reconcile: оставить согласованную (reason обязателен).

### Что делать оператору если заказ висит в `no_amount`

1. Открыть OrderPanel заказа в CRM.
2. Если есть `proposedAmount` от мастера — нажать "Принять предложение мастера" (кнопка под суммой).
3. Иначе — открыть Closing Drawer (зелёная кнопка "Закрыть заказ" → "Финальные данные сделки"). В заказах с `no_amount` форма "Зафиксировать согласованную сумму" будет первой. Ввести сумму, выбрать источник ("Со слов мастера" / "По чату с клиентом"), submit.
4. Заказ переходит в `agreed`, мастеру летит push/MAX, no_estimate-уведомления молчат.

### Phase 3.5 (опционально)

`scripts/src/recompute-master-debt.ts` — пересчёт `masters.debt` через сумму pending/overdue transactions. Не блокирует основную фичу, делается отдельным релизом при необходимости.

### Тестирование

- 14 unit-тестов `__tests__/paymentState.test.ts` (pure compute).
- 26 unit-тестов `__tests__/agreementValidation.test.ts` (request body validation).
- Запуск: `pnpm --filter @workspace/api-server test` → 40/40 pass.
