# Workspace

## Overview

CRM система для управления ремонтными заказами. pnpm workspace monorepo using TypeScript.

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
- `cities`, `service_types` — Settings
- `telegram_chats`, `telegram_messages` — Telegram operator chat history
- `voronka_columns` — Configurable Kanban columns for masters board

## Notifications

> **Важно**: Telegram отключён как основной канал уведомлений. Все новые функции должны использовать только PWA push-уведомления и запись в CRM-чат (`masterMessagesTable`). Не добавлять `sendTg()` в новые endpoint'ы.

## Telegram Bot (legacy, не используется для новых функций)

- **Token**: stored as `TELEGRAM_BOT_TOKEN` env var
- **Webhook**: set to `https://{domain}/api/telegram/webhook`
- **allowed_updates**: `["message", "callback_query"]`

### Bot Commands

- `/start` — Register new master → placed in column 1 ("Новые"); existing master → welcome back
- `/orders` — Show available orders (only if column has receivesOrders=true)
- `/myorders` — Show active orders with client name + phone
- `/profile` — Show master profile, rating, debt
- `/menu` — Show inline menu

### Order Flow via Bot

1. Master sends `/start` → created in DB → placed in "Новые" column → board updates
2. Operator moves master to "Свободен" (receivesOrders=true) column
3. Master presses "Доступные заказы" → sees list with take buttons
4. Master presses "Взять заказ" → order assigned, master auto-moved to "На объекте" column
5. Master presses "Завершить заказ" → order completed, master auto-moved back to "Свободен"

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
- `POST /api/telegram/webhook` — Telegram webhook (no auth)
- `POST /api/telegram/setup-webhook` — Re-register webhook
- `POST /api/telegram/notify-new-order` — Notify free masters of new order
- `POST /api/orders/:id/assign-master` — Assign master (enforces column + limit rules)
- `POST /api/okidoki/webhook` — Receives contract signing status from doki.online; activates master on status "Подписан" (internal_id=2)
- `GET /api/dispatch/:orderId` — Dispatch status and respondents list
- `POST /api/dispatch/:orderId/broadcast` — Send order card to all active masters (without client phone)
- `POST /api/dispatch/:orderId/assign/:masterId` — Assign order to responding master; notifies with phone; updates others' messages

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
