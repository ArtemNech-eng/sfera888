# Design Document

## Remove Token Payment Model

> Дизайн-документ для удаления legacy token-модели. Опирается на закрытые Decisions D1–D10 в `requirements.md`.
> Зависимость: должно стартовать ПОСЛЕ Phase 3 estimate-optional-flow в проде.

## Overview

Этот документ описывает архитектуру и пошаговый план удаления токеновой модели оплаты. Подход — **трёхфазный rollout с feature-flag isolation**:

- **Phase A** убирает все code paths за флагом `token_model_enabled`. Один файл — `lib/tokenModelGuard.ts` — защищает 8 узлов (5 routes, 1 dashboard tasks, 2 wallet endpoints). UI скрывается через `useFeatureFlags()`. БД не трогаем.
- **Phase B** — миграционный скрипт. Закрывает pending refunds, ставит `creditLimit = 1500₽` всем кто имел `creditTokensIssued > 0`, применяет manual `master_balance_grants` от админа.
- **Phase C** — DROP таблиц/колонок и удаление кода. После 7+ дней стабильности Phase B. Audit/history оставляем 90 дней read-only.

Архитектурный принцип: **никакой stuб-эмуляции**. После Phase A токеновый код вырубается полностью; после Phase C исчезает физически. Никаких `if (legacy) { /* fake */ }` заглушек.

## Context: что уже работает рублёво

| Слой | Статус |
|---|---|
| `master_wallet.balance`, `creditLimit` | Активная схема |
| `service_fee_transactions` (deduct/refund/test_waived) | Работает |
| `lib/accountBalance.ts` (`deductServiceFee`, `getBalance`, `topupBalance`, etc.) | Полностью на рублях |
| `master_test_orders` + `FREE_TEST_ORDERS_LIMIT = 2` | Работает |
| `lib/tokenWallet.ts` | Helmet с `// DEPRECATED: token system removed` — никем не импортируется |

**Это значит:** ядро рублёвой модели уже в проде и стабильно. Фича — про **выпил параллельной legacy-инфры**.

## Architecture

### Текущее состояние (до Phase A)

```
┌─ create lead ────────────────────────────────────┐
│  routes/leads.ts        → leads.paymentModel = ? │
│  routes/partner-pwa.ts  → "token" (force)        │
│  routes/client.ts       → "token" (force)        │
└──┬───────────────────────────────────────────────┘
   │
┌──▼──── send to buffer ───────────────────────────┐
│  routes/orders.ts createOrderFromLead            │
│  if (avito_partner) paymentModel = "token"       │
└──┬───────────────────────────────────────────────┘
   │
┌──▼──── master responds (master-pwa) ─────────────┐
│  routes/master-pwa.ts:respond                    │
│  isCommissionOrder = paymentModel !== "token"    │
│  if commission → checkServiceFeeRequirement      │
│  (token charge happens in legacy path… или нет — │
│   `tokenWallet.ts` deprecated, никем не вызыв.)  │
└──┬───────────────────────────────────────────────┘
   │
┌──▼──── operator dashboard ───────────────────────┐
│  dashboard-action-items.ts                       │
│  4 token-related tasks: token_refund_pending,    │
│    master_zero_balance, master_churn_risk,      │
│    order_stalled_token                           │
└──────────────────────────────────────────────────┘
```

### Целевое состояние (после Phase C)

```
┌─ create lead ────────────────────────────────────┐
│  routes/leads.ts → (нет paymentModel колонки)    │
│  routes/partner-pwa.ts → no force                │
│  routes/client.ts → no force                     │
└──┬───────────────────────────────────────────────┘
   │
┌──▼──── send to buffer ───────────────────────────┐
│  routes/orders.ts createOrderFromLead            │
│  (нет paymentModel колонки → всё commission)     │
└──┬───────────────────────────────────────────────┘
   │
┌──▼──── master responds ──────────────────────────┐
│  routes/master-pwa.ts:respond                    │
│  всегда checkServiceFeeRequirement → 500₽       │
└──┬───────────────────────────────────────────────┘
   │
┌──▼──── operator dashboard ───────────────────────┐
│  dashboard-action-items.ts                       │
│  4 token-tasks УДАЛЕНЫ                          │
└──────────────────────────────────────────────────┘
```

### Phase A — гибрид через флаг

```
isTokenModelEnabled() → true (старое поведение):
  все ветки as-is

isTokenModelEnabled() → false (целевое поведение):
  • create lead/order → всегда commission
  • respond → всегда service fee
  • wallet/* token endpoints → 404
  • token_* dashboard tasks → не генерируются
  • CRM/PWA UI с tokens → скрыт через feature-flag
```

## Data Models

### Новая таблица: `master_balance_grants`

Одноразовая, нужна только для миграции. Удалится в Phase C.

```ts
// lib/db/src/schema/master-balance-grants.ts
export const masterBalanceGrantsTable = pgTable("master_balance_grants", {
  id: serial("id").primaryKey(),
  masterId: integer("master_id").notNull().references(() => mastersTable.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  reason: text("reason"),
  appliedAt: timestamp("applied_at"), // null until migration script runs
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  masterIdx: index("master_balance_grants_master_idx").on(t.masterId),
  appliedIdx: index("master_balance_grants_applied_idx").on(t.appliedAt),
}));
```

### Удаляются в Phase C (DROP TABLE)

| Таблица | Почему |
|---|---|
| `wallet_transactions` | Все pending refunds закрыты в Phase B; история не нужна (есть `service_fee_transactions`) |
| `service_token_prices` | Тарифы токенов — больше не используются |
| `service_token_rules` | Правила тарификации — обнуляются |
| `city_token_multipliers` | Городские множители — не нужны |
| `token_packages` | Пакеты для покупки токенов — нет покупок больше |
| `master_active_packages` | Пуста по D7 |
| `master_balance_grants` | Одноразовая |

### Сохраняются на 90 дней read-only (Phase C-1)

| Таблица | Срок |
|---|---|
| `token_audit_log` | До 12.09.2026 (90 дней). Потом DROP. |
| `token_price_history` | До 12.09.2026. Потом DROP. |

После 90 дней — отдельной миграцией DROP.

### Удаляются в Phase C (DROP COLUMN)

| Таблица.колонка | Замена |
|---|---|
| `master_wallet.tokensBalance` | — (удалена) |
| `master_wallet.totalTokensPurchased` | — |
| `master_wallet.totalTokensSpent` | — |
| `master_wallet.totalTokensRefunded` | — |
| `master_wallet.totalRubSpent` | — (новый рублёвый счётчик — `totalServiceFeesSpent` + `totalTopups`) |
| `master_wallet.creditTokensIssued` | — |
| `master_wallet.creditTokensSpent` | — |
| `master_wallet.creditLimitTokens` | — (новый — `creditLimit` в рублях) |
| `orders.tokensCharged` | — |
| `orders.manualTokenCost` | — |
| `orders.paymentModel` | — (всегда commission) |
| `leads.paymentModel` | — |

## Code Changes

### Новый файл: `lib/tokenModelGuard.ts`

Точная копия паттерна `paymentStateGuard.ts` (Phase 1 estimate-optional-flow).

```ts
// artifacts/api-server/src/lib/tokenModelGuard.ts
import { db, systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const FLAG_KEY = "token_model_enabled";
const TTL_MS = 60_000;
let cached: { value: boolean; ts: number } | null = null;

/**
 * Default = true (token-model still on). Чтобы выключить — поставить
 * 'false' через SQL в system_settings.
 *
 * Через 60с все инстансы переходят на новое поведение.
 */
export async function isTokenModelEnabled(): Promise<boolean> {
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.value;
  try {
    const [row] = await db
      .select()
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, FLAG_KEY))
      .limit(1);
    // Default = true для backwards-compat (если ключа нет в БД, считаем
    // что token-model работает). Ставим 'false' явно через SQL чтобы выключить.
    const value = row?.value !== "false";
    cached = { value, ts: Date.now() };
    return value;
  } catch (err) {
    console.error("[tokenModelGuard] Failed to read flag, defaulting to true:", err);
    return true;
  }
}

export function clearTokenModelFlagCache(): void {
  cached = null;
}
```

### Изменения по слою

| Файл | Phase A (за флагом) | Phase C (cleanup) |
|---|---|---|
| `routes/leads.ts:POST /` | `paymentModel = "commission"` хардкод (игнор body) | удалить колонку из ответа |
| `routes/leads.ts:POST /:id/send-to-buffer` | `order.paymentModel = "commission"` | удалить упоминания |
| `routes/orders.ts createOrderFromLead` | убрать `if (avito_partner) → "token"` | удалить колонку из всех select/insert |
| `routes/client.ts` | `paymentModel = "commission"` (3 места) | удалить колонку |
| `routes/partner-pwa.ts` | `paymentModel = "commission"` | — |
| `routes/master-pwa.ts:respond` | при флаге=false: всегда `deductServiceFee()` | упростить: убрать `isCommissionOrder` ветку, всегда service fee |
| `routes/master-pwa.ts:request-token-refund` | при флаге=false: 404 | удалить endpoint |
| `routes/master-pwa.ts:resend client_site` | при флаге=false: убрать ветку `paymentModel === "token"` | упростить логику |
| `routes/wallet.ts` | при флаге=false: все routes возвращают 404 (middleware-gate) | удалить файл целиком |
| `routes/dashboard-action-items.ts` | при флаге=false: skip 4 token-tasks | удалить блоки |
| `routes/index.ts` | — | удалить `app.use("/api/wallet", walletRouter)` |
| `routes/system.ts:GET /feature-flags` | добавить `token_model_enabled` в response | оставить или удалить (флаг больше не управляет) |
| `lib/tokenWallet.ts` | — (уже deprecated, не импортируется) | DELETE FILE |
| `lib/accountBalance.ts` | — (уже не трогает токены) | — |
| `lib/fomoBlock.ts` | проверить — есть ли token branches | очистить если есть |
| `lib/dispatcherAI.ts` | проверить — есть ли token branches | очистить |
| `lib/broadcastOrder.ts` | проверить — есть ли token branches | очистить |
| `routes/work-board.ts` | при флаге=false: убрать token бейдж в card response | удалить полностью |
| `routes/work-board-table.ts` | при флаге=false: убрать paymentModel filter | удалить полностью |
| `routes/leads.ts:GET /:id` (response) | при флаге=false: не возвращать paymentModel | удалить |

### CRM frontend (artifacts/crm/)

| Файл | Phase A | Phase C |
|---|---|---|
| `App.tsx` (routes) | условный mount `/token-*` routes только если флаг = true | удалить routes |
| `pages/token-analytics.tsx` | — | DELETE |
| `pages/token-masters.tsx` | — | DELETE |
| `pages/token-purchases.tsx` | — | DELETE |
| `pages/token-refunds.tsx` | — | DELETE |
| `pages/token-settings.tsx` | — | DELETE |
| `components/leads/CreateLeadModal.tsx` | при флаге=false: убрать toggle paymentModel | удалить toggle |
| `components/leads/EditLeadModal.tsx` | при флаге=false: убрать paymentModel field | удалить |
| `components/leads/OrderPanel.tsx` | при флаге=false: скрыть `tokensCharged`, `manualTokenCost`, бейдж "💎" | удалить блок |
| `components/work-board-table.tsx` | при флаге=false: убрать колонку `paymentModel`, фильтр по token | удалить |
| `components/orders/OrdersWorkspace.tsx` | при флаге=false: убрать paymentModel filter | удалить |
| `components/sidebar.tsx` (или layout) | при флаге=false: скрыть пункты меню "Токены" | удалить пункты |
| `pages/masters.tsx` | при флаге=false: в карточке мастера убрать tokensBalance | удалить колонку |
| `pages/finance.tsx` | при флаге=false: убрать token-related виджеты | удалить |
| **Новый**: `pages/admin/token-migration.tsx` | Создаётся в Phase A. Manual grant management. | DELETE после Phase B (грантoв нет) |

### Master PWA (artifacts/master-pwa/)

| Файл | Phase A | Phase C |
|---|---|---|
| `pages/wallet.tsx` | при флаге=false: показывать только `balance` (рубли), скрыть tokens | упростить — single balance |
| `pages/balance.tsx` | при флаге=false: убрать tokens transactions | упростить |
| `pages/orders.tsx` | при флаге=false: убрать "Стоимость заявки X токенов" | удалить блок |
| `components/OrderCard.tsx` (если есть) | при флаге=false: убрать tokensCharged | — |

### `useFeatureFlags` hook расширение

```ts
// artifacts/crm/src/hooks/useFeatureFlags.ts (уже существует)
export interface FeatureFlags {
  payment_state_engine_enabled: boolean;
  payment_state_audit_ui_enabled: boolean;
  payment_state_master_proposal_oneclick: boolean;
  token_model_enabled: boolean;  // ← NEW
}

const FALLBACK: FeatureFlags = {
  // ...existing
  token_model_enabled: true,  // backward-compat: считаем что включён
};
```

Также расширяем `routes/system.ts:PAYMENT_STATE_FLAGS` или (лучше) переименовываем в `WHITELISTED_FLAGS` и добавляем `token_model_enabled`.

## API Contracts

### Новые admin endpoints (Phase A)

#### `GET /api/admin/token-migration/masters-with-balance`

Auth: `admin only`. Возвращает мастеров для которых нужно создать grants.

```ts
Response: {
  masters: Array<{
    id: number;
    alias: string;
    tokensBalance: number;
    creditTokensIssued: number;
    totalRubSpent: number;
    suggestedGrant: number | null;  // null если нет данных для guess
    activeOrdersCount: number;       // info только
    existingGrant: { id: number; amount: number } | null;
  }>;
}
```

`suggestedGrant` — ничего не предлагаем (D1: admin сам решает). Поле = `null`.

#### `POST /api/admin/token-migration/grants`

Auth: `admin only`.

```ts
Request: { masterId: number; amount: number; reason: string }
Response: { id: number; ...createdRow }
```

Создаёт или обновляет grant (один на мастера). `appliedAt = null`.

#### `DELETE /api/admin/token-migration/grants/:id`

Auth: `admin only`. Удаляет grant если ещё не применён (`appliedAt IS NULL`).

#### `POST /api/admin/token-migration/dry-run`

Auth: `admin only`. Запускает migration script в dry-run режиме (через child_process), возвращает лог.

```ts
Response: {
  ok: boolean;
  log: string[];
  preflight: {
    flagDisabledForDays: number;        // должно быть >= 7
    pendingRefundsCount: number;
    mastersWithBalanceCount: number;
    mastersWithoutGrantCount: number;   // должно быть 0 для apply
    openTokenOrdersCount: number;
  };
  willApply: {
    refundsToApprove: number;
    creditLimitsToSet: number;
    grantsToApply: number;
    ordersToCancel: number;
  };
}
```

#### `POST /api/admin/token-migration/apply`

Auth: `admin only`. Запускает миграцию реально. Возвращает результат.

Можно НЕ создавать этот endpoint и оставить только CLI-скрипт `pnpm tsx scripts/src/migrate-remove-tokens.ts apply` — это безопаснее (требует SSH на Railway). Решение: **только CLI скрипт**, в admin UI кнопка только показывает SQL для запуска.

### Удаляются в Phase C (или 404 в Phase A через guard)

Все `routes/wallet.ts` endpoints:
- `GET /api/wallet/master-revenue`
- `GET /api/wallet/my`
- `GET /api/wallet/my/transactions`
- `POST /api/wallet/my/purchase-request`
- `GET /api/wallet/purchases`
- `GET /api/wallet/:masterId`
- `GET /api/wallet/:masterId/transactions`
- `POST /api/wallet/:masterId/purchase`
- `POST /api/wallet/:masterId/bonus`
- `POST /api/wallet/:masterId/adjustment`
- `POST /api/wallet/:masterId/set-credit-limit`
- `POST /api/wallet/:masterId/credit`
- `POST /api/wallet/:masterId/confirm-purchase`
- `POST /api/wallet/:masterId/cancel-purchase`
- `POST /api/wallet/refund-request`
- `POST /api/wallet/refund/:transactionId/approve`
- `POST /api/wallet/refund/:transactionId/reject`
- `GET /api/wallet/refunds`
- `GET /api/wallet/analytics`
- `POST /api/wallet/migrate-active-packages`
- `GET /api/wallet/credit-analytics`
- `POST /api/wallet/repair-credit-limits`
- `POST /api/wallet/repair-missing-wallets`
- `GET /api/wallet/:masterId/debug`
- `GET /api/wallet/payment-screenshot/:masterId/:filename`

### Phase A: middleware gate для wallet router

```ts
// routes/wallet.ts (добавляется в начало, после imports)
import { isTokenModelEnabled } from "../lib/tokenModelGuard.js";

const router = Router();

// Phase A guard: when token model is disabled, all wallet endpoints 404.
router.use(async (_req, res, next) => {
  if (!(await isTokenModelEnabled())) {
    return res.status(404).json({ error: "Wallet API removed (token model disabled)" });
  }
  next();
});

// ...existing handlers below...
```

В Phase C — этот guard убирается и весь `routes/wallet.ts` файл удаляется.

## Migration Script (Phase B)

`scripts/src/migrate-remove-tokens.ts`

### Структура

```ts
import { db, masterWalletTable, walletTransactionsTable, masterBalanceGrantsTable, systemSettingsTable, ordersTable } from "@workspace/db";
import { eq, gt, and, isNull, lt, ne, inArray } from "drizzle-orm";

interface MigrationContext {
  dryRun: boolean;
  log: string[];
  errors: string[];
  applied: { refunds: number; creditLimits: number; grants: number; cancelledOrders: number };
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

async function preflight(ctx: MigrationContext) { /* ... */ }
async function approveRefunds(ctx: MigrationContext) { /* D4 */ }
async function setCreditLimits(ctx: MigrationContext) { /* D6 */ }
async function applyBalanceGrants(ctx: MigrationContext) { /* D1 */ }
async function cancelOpenTokenOrders(ctx: MigrationContext) { /* edge case */ }
async function markCompleted(ctx: MigrationContext) { /* set token_migration_completed_at */ }

const argv = process.argv.slice(2);
const cmd = argv[0];
const force = argv.includes("--force");

async function main() {
  const ctx: MigrationContext = {
    dryRun: cmd === "dry-run",
    log: [],
    errors: [],
    applied: { refunds: 0, creditLimits: 0, grants: 0, cancelledOrders: 0 },
  };

  console.log(`[token-migration] starting ${ctx.dryRun ? "DRY-RUN" : "APPLY"} mode`);
  await preflight(ctx);
  if (ctx.errors.length > 0 && !force) {
    console.error("[token-migration] preflight failed:", ctx.errors);
    process.exit(1);
  }

  await approveRefunds(ctx);
  await setCreditLimits(ctx);
  await applyBalanceGrants(ctx);
  await cancelOpenTokenOrders(ctx);
  if (!ctx.dryRun) await markCompleted(ctx);

  // Write log to file
  const logPath = `scripts/logs/migrate-remove-tokens-${Date.now()}.json`;
  await fs.writeFile(logPath, JSON.stringify({ context: ctx, finishedAt: new Date() }, null, 2));
  console.log(`[token-migration] log written to ${logPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
```

### Step-by-step

#### `preflight(ctx)` — проверки

1. Проверить флаг `token_model_enabled` в БД. Если значение != `'false'` → error "флаг ещё не выключен".
2. Проверить `updated_at` строки флага. Если меньше 7 дней назад → error "флаг недавно изменён, подожди 7 дней (override через --force)".
3. Подсчитать pending `wallet_transactions { type: 'refund', status: 'pending' }` → log.
4. Подсчитать мастеров с `tokensBalance > 0` → log.
5. Подсчитать мастеров с `tokensBalance > 0` И БЕЗ записи в `master_balance_grants WHERE appliedAt IS NULL` → если > 0 и не `--force` → error.
6. Подсчитать `orders WHERE paymentModel = 'token' AND status NOT IN ('completed', 'cancelled', 'cancellation_requested') AND deletedAt IS NULL` → log.

#### `approveRefunds(ctx)` — D4

Для каждого pending refund:
- В транзакции:
  - Получить `wallet.tokensBalance`
  - Установить `wallet.tokensBalance = tokensBalance + |tokensAmount|`
  - Установить `tx.status = 'completed'`, `reason = "auto-approved by migration"`
  - Если `tx.orderId IS NOT NULL` → `orders.masterId = NULL`, `orders.status = 'waiting_master'` (как в существующем code path approve_refund в dashboard-action-items)

#### `setCreditLimits(ctx)` — D6

```sql
UPDATE master_wallet
SET credit_limit = 1500, updated_at = NOW()
WHERE credit_tokens_issued > 0
  AND credit_limit < 1500;
```

Считаем затронутые строки → ctx.applied.creditLimits.

#### `applyBalanceGrants(ctx)` — D1

```sql
SELECT * FROM master_balance_grants WHERE applied_at IS NULL;
```

Для каждой grant:
- В транзакции:
  - `master_wallet.balance = balance + grant.amount`
  - `master_wallet.totalTopups = totalTopups + grant.amount`
  - `grant.appliedAt = NOW()`
- Также для безопасности: занулить `tokensBalance` (после grant больше не нужен)

#### `cancelOpenTokenOrders(ctx)` — edge case

Если после Phase A флаг был выключен 7+ дней но остались open token-orders (мастер не откликался, заказ висит) — закрываем как cancelled. Refund'ы уже обработаны в `approveRefunds`. Вряд ли что-то останется, но защитимся.

#### `markCompleted(ctx)`

```sql
INSERT INTO system_settings (key, value, updated_at)
VALUES ('token_migration_completed_at', NOW()::text, NOW())
ON CONFLICT (key) DO UPDATE SET value = NOW()::text, updated_at = NOW();
```

## Phase C — Schema Cleanup

### Drizzle migration: `0002_remove_token_model.sql`

Создаётся через `pnpm --filter @workspace/db exec drizzle-kit generate --name=remove_token_model`. Hand-edit перед merge:

```sql
-- 1. Drop deprecated tables
DROP TABLE IF EXISTS wallet_transactions;
DROP TABLE IF EXISTS service_token_prices;
DROP TABLE IF EXISTS service_token_rules;
DROP TABLE IF EXISTS city_token_multipliers;
DROP TABLE IF EXISTS token_packages;
DROP TABLE IF EXISTS master_active_packages;
DROP TABLE IF EXISTS master_balance_grants;

-- 2. Drop columns
ALTER TABLE master_wallet
  DROP COLUMN IF EXISTS tokens_balance,
  DROP COLUMN IF EXISTS total_tokens_purchased,
  DROP COLUMN IF EXISTS total_tokens_spent,
  DROP COLUMN IF EXISTS total_tokens_refunded,
  DROP COLUMN IF EXISTS total_rub_spent,
  DROP COLUMN IF EXISTS credit_tokens_issued,
  DROP COLUMN IF EXISTS credit_tokens_spent,
  DROP COLUMN IF EXISTS credit_limit_tokens;

ALTER TABLE orders
  DROP COLUMN IF EXISTS tokens_charged,
  DROP COLUMN IF EXISTS manual_token_cost,
  DROP COLUMN IF EXISTS payment_model;

ALTER TABLE leads
  DROP COLUMN IF EXISTS payment_model;

-- 3. Drop indexes that referenced dropped columns
-- (drizzle-kit auto-generates DROP INDEX statements)

-- NOTE: token_audit_log and token_price_history kept until 12.09.2026.
-- See migration 0003_drop_token_audit.sql (to be created later).
```

### Drizzle migration: `0003_drop_token_audit.sql` (12.09.2026)

```sql
DROP TABLE IF EXISTS token_audit_log;
DROP TABLE IF EXISTS token_price_history;
```

### Schema-файлы — DELETE

```
lib/db/src/schema/wallet-transactions.ts          DELETE
lib/db/src/schema/service-token-prices.ts         DELETE
lib/db/src/schema/service-token-rules.ts          DELETE
lib/db/src/schema/city-token-multipliers.ts       DELETE
lib/db/src/schema/token-packages.ts               DELETE
lib/db/src/schema/master-active-packages.ts       DELETE
lib/db/src/schema/master-balance-grants.ts        DELETE
lib/db/src/schema/token-audit-log.ts              KEEP (для read-only access 90 дней)
lib/db/src/schema/token-price-history.ts          KEEP
```

И обновить `lib/db/src/schema/index.ts` — убрать exports.

`master-wallet.ts`, `orders.ts`, `leads.ts` — удалить колонки (drizzle файлы).

### Code-файлы — DELETE

```
artifacts/api-server/src/lib/tokenWallet.ts                    DELETE
artifacts/api-server/src/routes/wallet.ts                      DELETE
artifacts/crm/src/pages/token-analytics.tsx                    DELETE
artifacts/crm/src/pages/token-masters.tsx                      DELETE
artifacts/crm/src/pages/token-purchases.tsx                    DELETE
artifacts/crm/src/pages/token-refunds.tsx                      DELETE
artifacts/crm/src/pages/token-settings.tsx                     DELETE
artifacts/crm/src/pages/admin/token-migration.tsx              DELETE (отслужила)
```

После DELETE — `tsc` сразу покажет все references, нужно их подчистить.

## Testing Strategy

### Unit тесты (Phase A)

- `__tests__/tokenModelGuard.test.ts` — TTL кэш, default `true`, чтение флага. По шаблону `paymentStateGuard` тестов.
- `__tests__/migrateRemoveTokens.test.ts` (Phase B) — pure-функции preflight checks, validation grant rows. Без БД.

### Integration тесты вручную (Phase A)

| Сценарий | Ожидаемое поведение при флаге = false |
|---|---|
| Создать lead через CRM | `lead.paymentModel = "commission"` независимо от UI toggle (если ещё виден) |
| Создать lead через partner-pwa | `lead.paymentModel = "commission"` |
| Создать lead через client_site | `lead.paymentModel = "commission"` |
| Создать order из avito_partner lead | `order.paymentModel = "commission"` (раньше форсило token) |
| Master отклик на любой order | `deductServiceFee()` → `balance -= 500` |
| `GET /api/wallet/my` | 404 |
| Открыть `/token-analytics` в CRM | redirect на 404 |
| Bottom-sheet "Запросить возврат токена" в master-pwa | кнопки нет |
| Open dashboard | tasks `token_refund_pending`, etc. отсутствуют |

### Phase B verification

После dry-run проверить:
- `preflight.errors` пуст
- `willApply.refundsToApprove` = ожидаемое
- `willApply.creditLimitsToSet` = ожидаемое
- `willApply.grantsToApply` = количество созданных admin'ом grants

После apply:
- `wallet_transactions WHERE status = 'pending'` → 0 строк
- `master_wallet WHERE tokensBalance > 0` → 0 строк (после grants)
- `master_wallet WHERE creditTokensIssued > 0 AND creditLimit < 1500` → 0 строк
- `master_balance_grants WHERE appliedAt IS NULL` → 0 строк
- `system_settings WHERE key = 'token_migration_completed_at'` → строка с timestamp

### Phase C verification

- `pnpm typecheck` зелёный
- `grep -r "tokensBalance\|tokensCharged\|paymentModel.*token\|wallet_transactions" artifacts/` → 0 матчей в активном коде (могут быть только в legacy migrations, audit/history schemas, и нашем replit.md)
- `pnpm test` 40/40 (унаследовано от estimate-optional-flow)
- `pnpm build` зелёный
- В проде: создать тестовый avito_partner lead → ровно тот же flow что обычный lead

## Risks

| # | Риск | Вероятность | Мегейт |
|---|---|---|---|
| 1 | `tokenWallet.ts` импортируется из неожиданного места | Низкая | `tsc` сразу скажет; уже проверено grep'ом — никто не импортирует |
| 2 | UI ломается при флаге=false из-за необработанных undefined полей | Средняя | Все usage `paymentModel` в CRM с fallback на `"commission"`; добавить проверку в Phase A QA |
| 3 | Один из 2 мастеров получит неверную сумму grant'а | Высокая | Manual review через admin UI; `master_balance_grants.reason` записывает обоснование; dry-run обязателен перед apply |
| 4 | Какой-то partner интегратор присылает leads с `paymentModel: "token"` в body | Низкая | Backend ignore body → всегда commission. Никаких error responses. |
| 5 | В Phase C удалили колонку, которую читает старый прод | Низкая (если 7d пройдено) | Phased rollout — Phase B стабилен 7 дней означает что прод-код не падает на отсутствии колонок (потому что Phase A guard скрыл все обращения). |
| 6 | Pending refund старше Phase A флипа | Низкая | `approveRefunds()` обрабатывает все pending, не зависит от возраста |
| 7 | Master с tokensBalance > 0 не получил grant до Phase B | Высокая | preflight error "masters without grants" блокирует apply; admin должен закрыть |
| 8 | Migration script падает на половине | Низкая | Каждый шаг — отдельная транзакция; идемпотентность через `appliedAt IS NULL` фильтр; повторный запуск безопасен |

## Migration & Rollout

### Pre-deploy

1. Создать ветку `feature/remove-token-model`.
2. Сгенерить миграцию для `master_balance_grants`: `pnpm --filter @workspace/db exec drizzle-kit generate --name=token_migration_grants`.
3. Запустить локально на dev DB → миграция применится автоматом.
4. Прогнать `pnpm test` (включает все из estimate-optional-flow).

### Phase A deploy

1. Все code-changes → commit → push → Railway redeploy.
2. На проде флаг `token_model_enabled` остаётся = true (default). Поведение системы не меняется.
3. Проверить smoke: `GET /api/system/feature-flags` отдаёт `token_model_enabled: true`.

### Phase A flip

1. **SQL** в Railway Postgres dashboard:
   ```sql
   INSERT INTO system_settings (key, value, updated_at)
   VALUES ('token_model_enabled', 'false', NOW())
   ON CONFLICT (key) DO UPDATE SET value = 'false', updated_at = NOW();
   ```
2. Подождать 60с (TTL).
3. Проверить smoke: `GET /api/wallet/my` → 404. Создание lead работает, force=commission.
4. Мониторить 7 дней: логи `[scenarios]`, ошибки в Railway, реакция операторов.

### Phase A rollback (если нужно)

```sql
UPDATE system_settings SET value = 'true', updated_at = NOW()
WHERE key = 'token_model_enabled';
```

Через 60с возврат к token-model.

### Phase B prep

1. Admin открывает `/admin/token-migration` в CRM.
2. Видит 2 мастера с `tokensBalance > 0`.
3. Создаёт grant для каждого с конкретной суммой и reason.
4. Запускает dry-run, проверяет `willApply` и `preflight.errors`.

### Phase B apply

1. Backup БД через Railway Postgres → "Резервные копии" → создать manual backup.
2. SSH в Railway / local запуск:
   ```bash
   pnpm --filter @workspace/scripts exec tsx scripts/src/migrate-remove-tokens.ts dry-run
   # проверить лог
   pnpm --filter @workspace/scripts exec tsx scripts/src/migrate-remove-tokens.ts apply
   ```
3. Проверить `system_settings.token_migration_completed_at` установлен.
4. Мониторить 7 дней.

### Phase C prep

1. Создать миграцию: `pnpm --filter @workspace/db exec drizzle-kit generate --name=remove_token_model`.
2. Hand-edit SQL: добавить `DROP TABLE IF EXISTS` для всех легаси-таблиц (см. § Phase C Schema Cleanup выше).
3. Удалить schema-файлы и обновить `lib/db/src/schema/index.ts`.
4. Удалить code-файлы (см. список выше).
5. Запустить `pnpm typecheck` — починить все references.
6. `pnpm test` зелёный.
7. `pnpm build` зелёный.

### Phase C deploy

1. Backup БД.
2. Push → Railway redeploy → миграция применяется автоматом через `runDrizzleMigrations()`.
3. Smoke test: создать lead, отклик, закрыть заказ — всё работает.

### 90 дней спустя

1. Создать миграцию `0003_drop_token_audit.sql`: `DROP TABLE token_audit_log; DROP TABLE token_price_history;`.
2. Удалить schema-файлы.
3. Push → deploy.

## Notes

- **`tokenWallet.ts` уже deprecated** — никем не импортируется, физически файл удаляется в Phase C.
- **`paymentModel` колонка в `orders`/`leads`** — оставляем до Phase C. В Phase A просто хардкодим `"commission"` на write paths.
- **Avito партнёрская интеграция (D2)**: API не меняется. Backend перестаёт форсить `paymentModel = "token"` при `source = "avito_partner"`.
- **Dispatcher AI и FOMO Block**: проверим в Phase A — есть ли там token branches. Если есть — упростим за флагом, в Phase C удалим.
- **`master_active_packages`** (D7): таблица должна быть пуста. preflight migration проверит это; если найдёт строки — error и просьба разобраться.
- **Балансы 2 мастеров (D1)**: admin создаёт `master_balance_grants` через CRM admin UI ДО Phase B apply.
- **Сохранение audit/history 90 дней (D8)**: `token_audit_log` и `token_price_history` остаются для legal/audit запросов; через 90 дней (12.09.2026) — финальный DROP отдельной миграцией.


## Components and Interfaces

Сводный перечень компонентов и их публичных интерфейсов (по фазам).

### Phase A — новые компоненты

| Component | Файл | Public interface |
|---|---|---|
| `TokenModelGuard` | `artifacts/api-server/src/lib/tokenModelGuard.ts` | `isTokenModelEnabled(): Promise<boolean>` · `clearTokenModelFlagCache(): void` |
| `MasterBalanceGrants` schema | `lib/db/src/schema/master-balance-grants.ts` | Drizzle table `masterBalanceGrantsTable` (Phase A only, dropped in Phase C) |
| Admin migration UI | `artifacts/crm/src/pages/admin/token-migration.tsx` | React component, admin-only route |
| Admin migration API | `routes/orders.ts` или новый `routes/admin-token-migration.ts` | 4 endpoints: `GET /masters-with-balance`, `POST /grants`, `DELETE /grants/:id`, `POST /dry-run` |

### Phase A — изменяемые компоненты

| Component | Файл | Изменение |
|---|---|---|
| `WalletRouter` | `routes/wallet.ts` | Добавляется `router.use(...)` middleware-gate. Все 25+ endpoints возвращают 404 при флаге=false. |
| `MasterPwa.respond` | `routes/master-pwa.ts` | Убирается ветка `paymentModel !== "token"` — всегда `deductServiceFee` при флаге=false |
| `Orders.createFromLead` | `routes/orders.ts` | Убирается `if (avito_partner) paymentModel = "token"` при флаге=false |
| `Leads.send-to-buffer` | `routes/leads.ts` | `order.paymentModel = "commission"` хардкод при флаге=false |
| `Client.createLead` | `routes/client.ts` | `paymentModel = "commission"` хардкод |
| `PartnerPwa.createLead` | `routes/partner-pwa.ts` | `paymentModel = "commission"` хардкод |
| `DashboardActionItems` | `routes/dashboard-action-items.ts` | Skip генерации 4 token-tasks при флаге=false |
| `SystemRoutes.feature-flags` | `routes/system.ts` | Добавить `token_model_enabled` в whitelist response |
| `useFeatureFlags` (CRM) | `artifacts/crm/src/hooks/useFeatureFlags.ts` | Расширить interface FeatureFlags + FALLBACK |

### Phase B — новые компоненты

| Component | Файл | Interface |
|---|---|---|
| Migration script | `scripts/src/migrate-remove-tokens.ts` | CLI: `dry-run` \| `apply [--force]` |

### Phase C — удаляемые компоненты

См. § Schema-файлы — DELETE и § Code-файлы — DELETE выше. Все экспорты Drizzle, React-компоненты страниц `/token-*`, `lib/tokenWallet.ts`, `routes/wallet.ts` удаляются физически.

### Внешние стабильные интерфейсы (не меняются)

| Component | Why |
|---|---|
| `accountBalance.ts` (`deductServiceFee`, `getBalance`, `topupBalance`, `setCreditLimit`) | Уже на рублях; ядро Service_Fee_Flow |
| `service_fee_transactions` | Активная таблица |
| Avito API (входящие partner leads) | D2: контракт сохраняется |
| `system_settings.payment_state_*` флаги | Не зависят от token-модели |

## Correctness Properties

Свойства, которые должны выполняться **во всех фазах** (включая переходные периоды между Phase A flip → Phase B apply).

### Property 1: никаких новых token-orders после Phase A flip

После `token_model_enabled = false`, для любого заказа созданного из любого источника (CRM `POST /api/leads`, partner-pwa, client_site, send-to-buffer):

```
new Order.paymentModel === "commission"
```

Validation: integration тест на каждый из 4 entry points (Phase A QA).

**Validates: Requirements 1.2, 1.3, 1.4, 1.5**

### Property 2: service_fee_transactions единственная точка learning

После Phase A flip, для каждого `master responds` события создаётся ровно одна строка в `service_fee_transactions` (тип `deduct` или `test_waived`). Никаких параллельных записей в `wallet_transactions`.

```sql
-- After Phase A flip:
SELECT COUNT(*) FROM wallet_transactions
WHERE created_at > '<phase_a_flip_timestamp>'
  AND type IN ('purchase', 'spend', 'bonus');  -- non-refund
-- Должно быть = 0
```

**Validates: Requirements 2.3**

### Property 3: pending refunds = 0 после Phase B

```sql
-- After Phase B apply:
SELECT COUNT(*) FROM wallet_transactions
WHERE type = 'refund' AND status = 'pending';
-- Должно быть = 0
```

**Validates: Requirements 3.3**

### Property 4: все мастера с creditTokens получили creditLimit ≥ 1500

```sql
-- After Phase B apply:
SELECT COUNT(*) FROM master_wallet
WHERE credit_tokens_issued > 0 AND credit_limit < 1500;
-- Должно быть = 0
```

**Validates: Requirements 3.3**

### Property 5: все grants применены

```sql
-- After Phase B apply:
SELECT COUNT(*) FROM master_balance_grants WHERE applied_at IS NULL;
-- Должно быть = 0
```

**Validates: Requirements 3.3, 4.1**

### Property 6: нет open token-orders после Phase B

```sql
-- After Phase B apply:
SELECT COUNT(*) FROM orders
WHERE payment_model = 'token'
  AND status NOT IN ('completed', 'cancelled', 'cancellation_requested')
  AND deleted_at IS NULL;
-- Должно быть = 0
```

**Validates: Requirements 3.3, 6.3**

**Validates: Requirements 3.3 (Step 6), 6.3**

### Property 7: Phase A rollback идемпотентен

После Phase A flip → rollback (флаг → true) → re-flip (флаг → false), система ведёт себя ровно как при первом flip. Никаких накопленных side-effects от переходов.

Validation: ручной тест на staging с двумя toggle'ами в течение 5 минут. Создание lead, отклик мастера на каждой итерации.

**Validates: Requirements 7.2**

## Error Handling

### Phase A — runtime errors

| Источник | Поведение |
|---|---|
| `isTokenModelEnabled()` БД-ошибка | Возвращает `true` (default — token-model on). Логируем `[tokenModelGuard] error`. Это **fail-safe**: при ошибке БД не делаем массовых поведенческих изменений. |
| Wallet endpoint при флаге=false | 404 с `{ error: "Wallet API removed (token model disabled)" }`. **Не 410 Gone**, потому что после Phase C endpoint исчезнет физически — клиент должен разучиться его дёргать. |
| Master-pwa respond с insufficient balance | Существующее поведение (тег "Баланс" в responseNote). Никаких новых error paths. |
| CRM открытие `/token-*` страницы при флаге=false | Route не зарегистрирован → 404. Через `useFeatureFlags()` — sidebar/menu пункты скрыты, прямой URL = 404. |

### Phase B — migration errors

| Источник | Поведение |
|---|---|
| Preflight check fail | `process.exit(1)` с описанием в логах. `--force` обходит `flagDisabledForDays` check, **НЕ обходит** `mastersWithoutGrant` (риск потерять баланс). |
| Refund approve fail (одна из множества) | Лог error, но продолжаем с остальными. Финальный лог содержит список failed refunds — admin вручную чинит после migration. |
| Grant apply fail (одна из множества) | То же — лог error, продолжаем. |
| `cancelOpenTokenOrders` fail | Лог error, продолжаем. После migration — admin вручную закрывает оставшиеся orders. |
| Файл логов не записался | Не блокирует migration (он уже отработал). Просто warning. |

### Phase C — schema errors

| Источник | Поведение |
|---|---|
| `DROP TABLE` на не-пустой ON DELETE RESTRICT | Migration падает. Прод не задеплоится. Нужно вручную проверить FK constraints и добавить CASCADE если нужно. **Защита**: `pnpm typecheck` поймает code references на удаляемые таблицы заранее. |
| `DROP COLUMN` если есть default value referenced | Drizzle выдаст ошибку при generate; проверим SQL вручную перед apply. |
| Деплой прошёл, но в коде осталась ссылка на дроп-нутую колонку | Runtime error при первом обращении. **Защита**: `pnpm test` + `pnpm build` зелёные перед deploy. |

### Контейнерные сценарии

| Сценарий | Защита |
|---|---|
| Phase A flip пока активен dispatch цикл (cron работает) | TTL 60с — следующий цикл подхватит новое значение. Текущий — доделает по старой логике. Идемпотентно. |
| Migration скрипт падает в середине | Каждый шаг — отдельная транзакция. Перезапуск повторно отработает только незавершённое (через `appliedAt IS NULL` фильтры). |
| 2 admin'а одновременно пытаются flip-flop флаг | Last-write-wins в БД. TTL 60с в каждом инстансе. Не страшно для read-paths. Для consistency — admin UI блокирует кнопку на 2 минуты после flip. |
| Master отклик в момент Phase B apply | preflight отлавливает open token-orders >0 → migration не стартует. Если admin прошёл `--force` — отклик идёт по старой logic, refund включается в pending list следующего запуска. |
| Прод-инстанс перезапускается во время migration script | Скрипт — отдельный CLI-процесс, не зависит от Express. БД-транзакции атомарны. Если процесс убит — partial state, но safe to re-run (идемпотентность). |

