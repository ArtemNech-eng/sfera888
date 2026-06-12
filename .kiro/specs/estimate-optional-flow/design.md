# Design Document

## Overview

Эта фича вводит единое derived-поле `Payment_State` на сущности Order и второй путь фиксации суммы (Agreement_Path) в дополнение к существующему Receipt_Path. Все правила, описанные в `requirements.md`, ложатся на одну архитектурную идею: **Order.orderAmount остаётся единственным источником правды для финальной суммы**, а `Payment_State` — pure-функция от `(order, receipts, transactions)`. Никакой новой "теневой" модели данных не создаётся; меняется интерпретация существующих полей и добавляется учёт того, через какой путь сумма попала на заказ.

Реализация разбита на три фазы (см. `requirements.md` → `Implementation Phases`); каждая фаза самодостаточна и управляется feature-flag'ами в `system_settings`. Цель Phase 1 — наблюдаемость без изменения поведения. Цель Phase 2 — переключить все 5 каналов уведомлений на новый сигнал и запустить Agreement_Path. Цель Phase 3 — конфликты, audit-UI, KPI.

Документ описывает архитектурные решения (HLD), схему данных, API-контракты, точечные изменения в существующих модулях (LLD), стратегию feature-flag'ов, тесты, план раскатки и риски.

## Architecture

### State diagram: Payment_State

`Payment_State` — derived-значение, не хранится в БД. Вычисляется чистой функцией `computePaymentState(order, receipts)` из `lib/paymentState.ts` (новый файл).

```
                  ┌──────────────────────────────────────┐
                  │                                      │
                  ▼                                      │
            ┌──────────┐                                 │
   create   │no_amount │                                 │
   order ──▶│          │                                 │
            └────┬─────┘                                 │
                 │                                       │
   set orderAmount > 0                                   │
   OR receipt with prepaymentAmount > 0                  │
                 │                                       │
                 ▼                                       │
            ┌──────────┐         cancelled               │
            │ agreed   │──────────────────────┐          │
            └────┬─────┘                      │          │
                 │                            │          │
   commissionPaid=true OR                     ▼          │
   all receipts.prepaymentPaidAt              ┌──────────┐
                 │                            │cancelled │
                 ▼                            └──────────┘
            ┌──────────┐                            ▲
            │  paid    │──────cancel after paid─────┘
            └──────────┘
```

**Правила перехода (формальная спецификация — Requirement 1.1):**

```ts
function computePaymentState(order, receipts) {
  if (order.status === "cancelled") return "cancelled";

  const allReceiptsPaid =
    receipts.length > 0 &&
    receipts.every(r => r.prepaymentSeenAt != null);
  if (order.commissionPaid === true || allReceiptsPaid) return "paid";

  const hasAmount =
    Number(order.orderAmount ?? 0) > 0 ||
    receipts.some(r => Number(r.prepaymentAmount ?? 0) > 0);
  if (hasAmount) return "agreed";

  return "no_amount";
}
```

> Примечание: `prepaymentPaidAt` упоминается в requirements как идеальный сигнал "оплачено", но в текущей схеме `receipts` его нет — есть только `prepaymentSeenAt` (оператор увидел) и `prepaymentSubmittedAt` (клиент подал скрин). Используем `prepaymentSeenAt` как прокси — это наиболее консистентно с тем, как сейчас в `routes/orders.ts` рассчитывается `fullyPaidByPrepayment`.

### Feature flags

Хранятся в `system_settings` (text key/value). Включение через CRM Settings или `INSERT INTO system_settings`. Чтение — через мини-helper `getFlag(key, default)` с TTL-кешем 60с.

| Key | Default | Введено в фазе | Управляет |
|---|---|---|---|
| `payment_state_engine_enabled` | `false` | 2 | Подавление Legacy_No_Estimate_Signal во всех 5 каналах + endpoints `POST /agreement` и related. Phase 1 поля и API всегда включены — без флага. |
| `payment_state_audit_ui_enabled` | `false` | 3 | Показ audit-истории в Closing_Drawer; задача `reconcile_amount`; кнопки разрешения конфликтов. |
| `payment_state_master_proposal_oneclick` | `true` | 2 | Кнопка "Принять предложение мастера" в OrderPanel. По умолчанию on; можно выключить, если бизнес решит вернуть ручной ввод. |

**Важное правило**: вся guard-логика, которая раньше проверяла `!receipt`, в Phase 2 переключается через единый helper `shouldNagAboutEstimate(order, paymentState)`. Этот helper читает feature-flag — если `payment_state_engine_enabled = false`, helper возвращает старое поведение (только проверка `!receipt`). Это даёт безопасный rollback: выключили флаг → система ведёт себя как до фичи.

### Integration points (модули, которые трогает фича)

| Категория | Модули | Phase | Что делаем |
|---|---|---|---|
| **Schema** | `lib/db/src/schema/orders.ts`, новый `order-amount-audit.ts` | 1 | Миграция: 3 новые колонки на orders + новая таблица аудита |
| **Core compute** | новый `lib/paymentState.ts`, новый `lib/paymentStateGuard.ts` | 1 | Pure function + feature-flag guard |
| **Read paths** | `routes/orders.ts GET /:id, GET /`, `routes/work-board.ts`, `routes/work-board-table.ts`, `routes/work-monitor.ts`, `routes/leads.ts` | 1 | Возвращать `paymentState` в JSON; в Phase 2 — менять условия фильтрации |
| **Write paths** | `routes/orders.ts PATCH /:id`, новый `POST /api/orders/:id/agreement` | 2 | Audit-запись на каждое изменение `orderAmount`/`commission`/`commissionPaid`; новый endpoint для Agreement_Path |
| **Notification engine — channels 1-5** | `routes/ai-office.ts` (orders-without-receipts, payment-reminders), `routes/dashboard-action-items.ts`, `lib/operatorTasks.ts`, `lib/fomoBlock.ts`, `lib/dispatcherAI.ts` | 2 | Все 5 каналов читают `paymentState` через guard. При `paymentState ∈ {agreed, paid, cancelled}` сигнал не генерируется. |
| **Operator tasks** | `lib/operatorTasks.ts` | 2 (basic), 3 (reconcile) | Новый тип task `reconcile_amount` с SLA 30мин, critical |
| **CRM UI** | `components/orders/ClosingDrawer.tsx`, `components/orders/OrderPanel.tsx`, `components/orders/OrdersBanners.tsx`, `components/orders/OrdersWorkspace.tsx`, `components/work-board/*.tsx` | 1 (badge), 2 (button), 3 (audit UI) | Бейдж + новые кнопки + история |
| **Master PWA** | `master-pwa/src/pages/orders.tsx` | 2 | Подсказка "Оператор зафиксировал сумму" когда agreed без receipt |
| **Notifications** | `maxBot.ts`, `managerBot.ts` | 2 | MAX мастеру при Agreement_Amount; Manager_Bot при `reconcile_amount` |

## Data Models

### Migration `0001_payment_state_engine.sql`

Создаётся через `pnpm --filter @workspace/db exec drizzle-kit generate --name=payment_state_engine` после правки схемы.

**Изменения в `orders`:**

```sql
ALTER TABLE "orders" ADD COLUMN "agreement_amount_source" varchar(32);
ALTER TABLE "orders" ADD COLUMN "payment_state_changed_at" timestamp;
ALTER TABLE "orders" ADD COLUMN "agreement_note" text;

-- Backfill: исторические заказы с зафиксированной суммой получают source = 'unknown'
UPDATE "orders"
SET "agreement_amount_source" = 'unknown'
WHERE "order_amount" IS NOT NULL AND "agreement_amount_source" IS NULL;
```

**Поле `agreement_amount_source`:**
- `'agreement'` — Operator зафиксировал со слов мастера через новый endpoint
- `'master_proposal'` — Operator принял `proposedAmount` мастера одним кликом (см. Q13)
- `'receipt'` — сумма пришла из Receipt (Master создал смету)
- `'manager_correction'` — Manager изменил сумму после `paid` (см. Req 5.3)
- `'unknown'` — исторический заказ или сумма попала через старый PATCH без явного source

**Новая таблица `order_amount_audit`:**

```sql
CREATE TABLE "order_amount_audit" (
  "id" serial PRIMARY KEY NOT NULL,
  "order_id" integer NOT NULL REFERENCES "orders"("id"),
  "actor_user_id" integer REFERENCES "users"("id"),
  "actor_role" varchar(32),                  -- "operator" | "manager" | "master" | "system"
  "actor_alias" text,                        -- denormalized snapshot (как в order_status_logs)
  "field" varchar(32) NOT NULL,              -- "orderAmount" | "commission" | "commissionPaid" | "agreementAmount"
  "previous_value" text,                     -- сериализованное предыдущее значение
  "new_value" text NOT NULL,
  "source" varchar(32) NOT NULL,             -- = agreement_amount_source values + "operator_edit" | "system_recalc"
  "reason" text,                             -- свободный комментарий, обязателен для manager_correction и manager_force_paid
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "order_amount_audit_order_idx" ON "order_amount_audit" ("order_id", "created_at" DESC);
```

Drizzle schema (`lib/db/src/schema/order-amount-audit.ts`):

```ts
import { pgTable, serial, integer, text, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";
import { usersTable } from "./users";

export const orderAmountAuditTable = pgTable("order_amount_audit", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  actorUserId: integer("actor_user_id").references(() => usersTable.id),
  actorRole: varchar("actor_role", { length: 32 }),
  actorAlias: text("actor_alias"),
  field: varchar("field", { length: 32 }).notNull(),
  previousValue: text("previous_value"),
  newValue: text("new_value").notNull(),
  source: varchar("source", { length: 32 }).notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  orderIdx: index("order_amount_audit_order_idx").on(t.orderId, t.createdAt),
}));

export type OrderAmountAudit = typeof orderAmountAuditTable.$inferSelect;
```

Экспортируется из `lib/db/src/schema/index.ts`.

**Зачем отдельная таблица, а не расширение `order_status_logs`:**
- `order_status_logs` хранит status-переходы — другая семантика, разная структура (нет `field`).
- Audit-журнал по деньгам читается отдельно (Manager UI, KPI отчёты), быстрее с собственным индексом.
- На существующую таблицу есть FK от других мест; смешивать нагрузки нежелательно.

### Изменения в существующих таблицах

`orders` — три новые nullable-колонки (см. выше). Существующие индексы не трогаем.

`receipts`, `transactions`, `transaction_payments` — без изменений. Все правила `paymentState` выводятся из существующих полей.

`system_settings` — без изменения схемы. Просто добавляются три новые строки при первом включении феа-флага.

### Что НЕ меняем (явно)

- Поле `Order.commissionPaid` остаётся как есть (boolean, ручной флаг).
- Поле `Order.commission` остаётся, продолжает рассчитываться через `calculateCommission()`.
- `Order.paymentModel`, `tokensCharged`, `manualTokenCost` — без изменений.
- `master.debt` — без изменений в Phase 2. Опциональная миграция в Phase 3.5 (см. requirements.md).
- `transactions.paymentStatus` — авторитет по части "комиссия закрыта" остаётся за этим полем; `commissionPaid` flag — это UI-удобство, синхронизируется с transactions при переходах (см. ниже).

## Components and Interfaces

В этой секции — карта новых и изменяемых модулей. Детальные сигнатуры и псевдокод — в разделе "Low-Level Design (LLD) by phase" ниже.

### Новые модули

| Файл | Тип | Экспорты | Phase |
|---|---|---|---|
| `lib/db/src/schema/order-amount-audit.ts` | Drizzle schema | `orderAmountAuditTable`, `OrderAmountAudit` | 1 |
| `artifacts/api-server/src/lib/paymentState.ts` | Pure compute | `computePaymentState`, `computePaymentStateBatch`, `PaymentState` | 1 |
| `artifacts/api-server/src/lib/paymentStateGuard.ts` | Feature-flag guard | `isPaymentStateEngineEnabled`, `shouldNagAboutEstimate`, `clearFlagCache` | 1 |
| `artifacts/api-server/src/lib/orderTokens.ts` | Refactor target | `chargeTokensForOrder`, `refundTokensForOrder` (вынос существующей логики из orders.ts) | 2 |
| `artifacts/api-server/src/lib/orderAudit.ts` | Audit-helper | `recordAmountAudit`, `getAmountAudit`, `closeOpenEstimateTasksForOrder` | 2 |
| `artifacts/crm/src/components/orders/PaymentStateBadge.tsx` | UI | `<PaymentStateBadge state={...} />` | 1 |
| `artifacts/crm/src/components/orders/AgreementForm.tsx` | UI | `<AgreementForm orderId={...} onSubmit={...} />` | 2 |
| `artifacts/crm/src/components/orders/AmountAuditHistory.tsx` | UI | `<AmountAuditHistory orderId={...} />` | 3 |
| `artifacts/crm/src/components/orders/ReconcileBanner.tsx` | UI | `<ReconcileBanner order={...} />` | 3 |

### Изменяемые модули (read-only добавления в Phase 1, основные правки в Phase 2)

| Файл | Phase 1 изменения | Phase 2 изменения | Phase 3 изменения |
|---|---|---|---|
| `lib/db/src/schema/orders.ts` | +3 колонки | — | — |
| `routes/orders.ts` | `paymentState` в JSON ответов | `POST /:id/agreement`; audit-обёртка вокруг PATCH; `acceptReceiptAmount`/`keepAgreementAmount` actions | `GET /:id/audit` |
| `routes/work-board.ts` | `paymentState` в card | заменить `!receipt` на `paymentState === "no_amount"` через guard | — |
| `routes/work-board-table.ts` | `paymentState` в card | то же | — |
| `routes/work-monitor.ts` | `paymentState` в JSON | то же | — |
| `routes/dashboard-action-items.ts` | `paymentState` в SQL префетч | `no_estimate` фильтрация через guard | — |
| `routes/ai-office.ts` | — | SQL фильтры в `runOrdersWithoutReceipts`, `runPaymentReminders` через флаг | — |
| `routes/leads.ts` | `paymentState` в order JSON списка | — | — |
| `lib/operatorTasks.ts` | — | auto-close estimate tasks | новый тип `reconcile_amount` + SLA 30мин |
| `lib/fomoBlock.ts` | — | условия priorities 1+3 через `paymentState` | — |
| `lib/dispatcherAI.ts` | — | (не трогаем в 2) | в 3.5: `commission_debt` reminder через transactions |
| `routes/system.ts` (новый или existing settings) | — | `GET /api/system/feature-flags` | — |
| `components/orders/OrderPanel.tsx` | использует `<PaymentStateBadge>` | "Принять предложение мастера" + "Зафиксировать со слов мастера" buttons | reconcile baner integration |
| `components/orders/ClosingDrawer.tsx` | бейдж в шапке | selector "Источник" + поле "Комментарий"; submit через `POST /agreement` | audit history collapsible |
| `components/orders/OrdersBanners.tsx` | — | новый баннер "Сумма не зафиксирована" | reconcile_amount баннер |
| `components/orders/OrdersWorkspace.tsx` | колонка `paymentState` в таблице | — | — |
| `master-pwa/src/pages/orders.tsx` | — | подсказка "оператор зафиксировал сумму" | — |

### Внешние интерфейсы (что видит фронт/бот/мастер)

| Интерфейс | Тип | Phase |
|---|---|---|
| HTTP `POST /api/orders/:id/agreement` | API | 2 |
| HTTP `GET /api/orders/:id/audit` | API | 3 |
| HTTP `GET /api/system/feature-flags` | API | 1 |
| MAX message: "Оператор зафиксировал сумму N ₽ по заказу #ID" | Bot | 2 |
| MAX message: "Заказ закрыт. Сумма N ₽, комиссия M ₽" (Req 14.3) | Bot | 2 |
| Manager_Bot: эскалация `reconcile_amount` через существующий `tasksEscalation` | Bot | 3 |
| Master_PWA подсказка "Сумма зафиксирована оператором" | UI | 2 |




## API Contracts

### Read endpoints — добавление `paymentState`

Все endpoints, отдающие order или список ордеров, дополнительно возвращают:

```ts
{
  // ... existing fields ...
  paymentState: "no_amount" | "agreed" | "paid" | "cancelled",
  agreementAmountSource: "agreement" | "master_proposal" | "receipt" | "manager_correction" | "unknown" | null,
}
```

Затрагивается:
- `GET /api/orders` — отдаёт массив с этими полями
- `GET /api/orders/:id` — отдаёт объект с этими полями
- `GET /api/work-board` — для каждой card в каждой column добавляется `paymentState`
- `GET /api/work-board/table` — то же
- `GET /api/work-monitor` — то же
- `GET /api/leads/:id/events` — без изменений (это лента событий, не сам order)

`paymentState` вычисляется в одном месте — `lib/paymentState.ts:computePaymentState(order, receipts)`. Все endpoints вызывают эту функцию (или делают batch-расчёт через `computePaymentStateBatch` для списков).

### Write endpoint: `POST /api/orders/:id/agreement` (Phase 2, новый)

Атомарно фиксирует Agreement_Amount. Источник правды для всех полей в одной транзакции.

**Request:**
```ts
{
  amount: number,                      // > 0, обязательно
  source: "agreement" | "master_proposal",  // default "agreement"
  note?: string,                       // опциональный свободный текст ("со слов мастера")
  noteSource?: "from_master" | "from_chat" | "other",  // selector в UI; идёт в note prefix
}
```

**Auth:** `requireRole("admin", "lead_operator", "master_operator")`. Любая из этих ролей считается Operator+ для целей requirement.

**Response:**
```ts
{
  ok: true,
  order: { /* full order with paymentState */ },
  audit: OrderAmountAudit[],   // запись(и) аудита, созданные этим вызовом
}
```

**Логика (псевдокод):**

```ts
async function setAgreement(orderId, amount, source, note, actor) {
  return db.transaction(async tx => {
    const order = await tx.select(...).where(...).forUpdate();   // pessimistic lock
    if (!order) throw 404;
    if (order.status === "cancelled" || order.status === "completed") throw 400;
    if (amount <= 0) throw 400;

    const previousAmount = order.orderAmount;
    const isFirstAgreement = (previousAmount == null);

    // 1. Update order
    const updates = {
      orderAmount: String(amount),
      agreementAmountSource: source,
      agreementNote: note,
      paymentStateChangedAt: new Date(),
      updatedAt: new Date(),
    };

    // 2. Recalculate commission for non-token model
    if (order.paymentModel !== "token") {
      updates.commission = String(calculateCommission(amount));
    }

    await tx.update(orders).set(updates).where(eq(orders.id, orderId));

    // 3. Audit
    await tx.insert(orderAmountAudit).values({
      orderId, actorUserId: actor.id, actorRole: actor.role, actorAlias: actor.alias,
      field: "orderAmount",
      previousValue: previousAmount,
      newValue: String(amount),
      source,
      reason: note,
    });
    if (order.paymentModel !== "token") {
      await tx.insert(orderAmountAudit).values({
        orderId, actorUserId: actor.id, actorRole: actor.role, actorAlias: actor.alias,
        field: "commission",
        previousValue: order.commission,
        newValue: updates.commission,
        source: "system_recalc",
      });
    }

    // 4. Token charging — только при первом переходе в agreed (Req 8.1)
    if (isFirstAgreement && order.paymentModel === "token" && Number(order.tokensCharged ?? 0) === 0) {
      // Использует тот же existing codepath что в acceptProposed.
      await chargeTokensForOrder(tx, orderId, amount);
    }

    // 5. Transaction sync (commission orders)
    if (order.paymentModel !== "token" && isFirstAgreement) {
      // Создаём/обновляем placeholder transaction (как в существующем acceptProposed flow)
      await ensureOrderTransaction(tx, order, amount);
    }

    // 6. Auto-close pending no_estimate operator tasks (Req 6.2)
    await closeOpenTasks(tx, orderId, "no_estimate", "решено: сумма зафиксирована");

    // 7. Notify
    notifyWorkBoardChanged("agreement_set");
    if (order.masterId) {
      sendMaxAgreementNotice(order.masterId, orderId, amount).catch(()=>{});
      sendPushToMaster(order.masterId, {
        title: "✅ Сумма по заказу подтверждена оператором",
        body: `Сумма ${amount.toLocaleString("ru-RU")} ₽`,
        url: "/orders",
      }).catch(()=>{});
    }

    return { ok: true, order: <reload>, audit: <created rows> };
  });
}
```

### Write endpoint: `PATCH /api/orders/:id` (расширение)

Существующий endpoint остаётся точкой входа для всех остальных изменений (статус, отмена, ручной `orderAmount` через CRM, `commissionPaid`). Добавляется:

1. **Audit-обёртка**: каждое изменение `orderAmount`, `commission`, `commissionPaid` пишет запись в `order_amount_audit` (в той же транзакции).
2. **`agreement_amount_source` синхронизация**: если `orderAmount` устанавливается этим PATCH-ом и `agreement_amount_source` ещё `unknown`/`null`, источник проставляется автоматически по контексту:
   - `acceptProposed: true` → `master_proposal`
   - явный `orderAmount` без `acceptProposed` → `manager_correction` (если PATCH делает Manager роли) или `agreement` (если CRM operator)
3. **`payment_state_changed_at`**: обновляется при изменении `orderAmount`, `commissionPaid` или `status`.
4. **Force-paid path**: если PATCH содержит `{ commissionPaid: true, force: true, reason: string }` и actor.role = manager, разрешается без проверки фактической оплаты; audit с `source = "manager_force_paid"`.

Все остальное поведение PATCH сохраняется без изменений (это критично — на этот endpoint завязано много мест).

### Read endpoint: `GET /api/orders/:id/audit` (Phase 3, новый)

Возвращает ленту аудита по заказу.

**Auth:** `requireRole("admin")` (Manager+).

**Response:**
```ts
{
  rows: OrderAmountAudit[]   // отсортированы DESC по createdAt
}
```

**Ограничение**: лимит 100 записей; если будет больше, добавим pagination в Phase 3.5.

### Operator tasks API — расширение

Существующий `getOperatorTasks()` в `lib/operatorTasks.ts` (см. carta) возвращает массив `OperatorTask`. Добавляются:

**Новый тип:**
```ts
type TaskType =
  | "send_to_work"
  | "no_master_response"
  | "cancel_request"
  | "price_proposal"
  | "confirm_prepayment"
  | "reconcile_amount";    // <-- новый, Phase 3
```

**SLA для `reconcile_amount`:** 30 мин (по аналогии с `confirm_prepayment`). Поле `TASK_SLA.reconcile = 30`.

**Логика создания:**
- Запрос к таблице (новой? нет — выводим из данных): найти Order, у которого есть последняя Receipt с `prepaymentAmount ≠ orderAmount` AND `agreement_amount_source IN ('agreement', 'master_proposal', 'manager_correction')` AND нет ещё разрешённого reconcile (см. ниже).
- "Разрешённый reconcile" определяется по `order_amount_audit`: если последняя запись после создания Receipt-конфликта имеет `source = 'reconcile_*'`, конфликт закрыт.

**Endpoints для разрешения:**
- `PATCH /api/orders/:id { acceptReceiptAmount: true }` — оператор выбирает "Использовать сумму из сметы". Source = `reconcile_use_receipt`.
- `PATCH /api/orders/:id { keepAgreementAmount: true }` — оператор выбирает "Оставить согласованную сумму". Source = `reconcile_keep_agreement`. Сумма не меняется, но в audit фиксируется решение → задача закрывается.

### Feature-flag endpoint: `GET /api/system/feature-flags` (Phase 1, новый)

Возвращает только флаги, относящиеся к этой фиче. Используется CRM фронтом для условного рендеринга.

**Response:**
```ts
{
  payment_state_engine_enabled: boolean,
  payment_state_audit_ui_enabled: boolean,
  payment_state_master_proposal_oneclick: boolean,
}
```

**Auth:** authenticated (любая роль). Кешируется на стороне фронта на 60с.

## Low-Level Design (LLD) by phase

### Phase 1 — Read-only Payment_State

**Цель**: добавить поле и наблюдаемость, ничего не ломая.

#### 1.1 Schema migration

Файл: `lib/db/migrations/0001_payment_state_engine.sql` (генерируется автоматически + ручной backfill в hand-edited section если нужно).

Drizzle schema изменения:
- `lib/db/src/schema/orders.ts` — три новые колонки
- `lib/db/src/schema/order-amount-audit.ts` — новый файл (см. выше)
- `lib/db/src/schema/index.ts` — экспорт новой таблицы

После генерации миграции — `pnpm typecheck`, потом тест на dev DB.

#### 1.2 `lib/paymentState.ts` (новый, в `artifacts/api-server/src/lib/`)

```ts
import type { Order, Receipt } from "@workspace/db";

export type PaymentState = "no_amount" | "agreed" | "paid" | "cancelled";

export function computePaymentState(
  order: Pick<Order, "status" | "commissionPaid" | "orderAmount">,
  receipts: Pick<Receipt, "prepaymentAmount" | "prepaymentSeenAt" | "prepaymentSubmittedAt">[],
): PaymentState {
  if (order.status === "cancelled") return "cancelled";

  const hasReceipts = receipts.length > 0;
  const allReceiptsSeenAsPaid =
    hasReceipts && receipts.every(r => r.prepaymentSeenAt != null);
  if (order.commissionPaid === true || allReceiptsSeenAsPaid) return "paid";

  const orderHasAmount = Number(order.orderAmount ?? 0) > 0;
  const receiptsHaveAmount = receipts.some(r => Number(r.prepaymentAmount ?? 0) > 0);
  if (orderHasAmount || receiptsHaveAmount) return "agreed";

  return "no_amount";
}

/** Batch-вариант для списочных endpoints. Обращается к receiptsByOrder map. */
export function computePaymentStateBatch(
  orders: Order[],
  receiptsByOrder: Map<number, Receipt[]>,
): Map<number, PaymentState> {
  const out = new Map<number, PaymentState>();
  for (const o of orders) {
    out.set(o.id, computePaymentState(o, receiptsByOrder.get(o.id) ?? []));
  }
  return out;
}
```

#### 1.3 `lib/paymentStateGuard.ts` (новый)

```ts
import { db, systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { PaymentState } from "./paymentState.js";

const FLAG_KEY = "payment_state_engine_enabled";
let cachedFlag: { value: boolean; ts: number } | null = null;
const TTL_MS = 60_000;

export async function isPaymentStateEngineEnabled(): Promise<boolean> {
  if (cachedFlag && Date.now() - cachedFlag.ts < TTL_MS) return cachedFlag.value;
  try {
    const [row] = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, FLAG_KEY));
    const value = row?.value === "true";
    cachedFlag = { value, ts: Date.now() };
    return value;
  } catch {
    return false; // fail closed — старое поведение
  }
}

/**
 * Главный helper, который заменяет все разнобойные проверки `!receipt`.
 * Возвращает true, если по этому заказу можно генерировать сигнал
 * "нет сметы / напомни мастеру про смету / эскалируй админу".
 *
 * Когда флаг выключен — старое поведение (только проверка !receipt).
 * Когда флаг включён — учитывается paymentState.
 */
export async function shouldNagAboutEstimate(
  paymentState: PaymentState,
  hasReceipt: boolean,
): Promise<boolean> {
  const flag = await isPaymentStateEngineEnabled();
  if (!flag) return !hasReceipt;
  return paymentState === "no_amount";
}

/** Сбросить кеш (нужно для тестов и после явного toggle). */
export function clearFlagCache() { cachedFlag = null; }
```

#### 1.4 Read-side: добавление `paymentState` в JSON

Затрагивает `routes/orders.ts`, `routes/work-board.ts`, `routes/work-board-table.ts`, `routes/work-monitor.ts`, `routes/leads.ts`. В каждом — после загрузки `orders` и `receipts` (которые уже грузятся), добавляется `computePaymentStateBatch()` и поле `paymentState` в выходной map.

Пример для `routes/orders.ts GET /:id`:

```ts
// существующий код:
const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
const receipts = await db.select().from(receiptsTable).where(eq(receiptsTable.orderId, id));
// ... existing transformation ...

// НОВОЕ:
const paymentState = computePaymentState(order, receipts);
res.json({ ...orderResponse, paymentState, agreementAmountSource: order.agreementAmountSource });
```

Объём правок небольшой — каждый endpoint меняется на 5-10 строк.

#### 1.5 CRM badge (только отображение)

`components/orders/PaymentStateBadge.tsx` — новый компонент. Принимает `paymentState` и рендерит цветной badge с текстом из табл. лейблов.

```ts
const LABELS: Record<PaymentState, { text: string; tone: "neutral" | "warn" | "ok" | "danger" }> = {
  no_amount: { text: "Сумма не зафиксирована", tone: "warn" },
  agreed:    { text: "Сумма согласована",       tone: "neutral" },
  paid:      { text: "Оплачено",                tone: "ok" },
  cancelled: { text: "Отменён",                 tone: "danger" },
};
```

Используется в:
- `OrderPanel.tsx` — рядом с заголовком
- `OrdersWorkspace.tsx` — в строке таблицы
- `work-board-table.tsx` — в colored cells
- `MasterPickerPanel.tsx` — в карточке заказа

В Phase 1 badge — единственное визуальное изменение в CRM.

### Phase 2 — Agreement_Path + подавление Legacy_No_Estimate_Signal

**Цель**: запустить новый путь и заглушить шум.

**Управление**: `payment_state_engine_enabled = true`.

#### 2.1 New endpoint `POST /api/orders/:id/agreement`

Реализуется в `routes/orders.ts` (отдельная route в том же файле для локальности с PATCH-логикой).

Псевдокод см. в API Contracts. Особенности:
- Используется `db.transaction` (Drizzle поддерживает на pg).
- `forUpdate()` lock на orders row — предотвращает race с одновременным PATCH-ом.
- Все side-effects (push, max-bot, audit close) — после успешного commit транзакции, через `Promise.all().catch(...)` чтобы не валить запрос если push не доехал.

#### 2.2 Token charging integration

`chargeTokensForOrder(tx, orderId, amount)` — новая функция, рефакторинг существующей логики из `routes/orders.ts` `acceptProposed` ветки. Извлекается в `lib/orderTokens.ts`. Та же логика, тот же codepath, просто вынесена в reusable function.

Никакой новой формулы — все правила (Q4: `manualTokenCost` если задан, иначе авто-расчёт) уже есть в существующем коде. Цель — просто переиспользовать.

#### 2.3 PATCH /:id wrapping для audit

В существующем `PATCH /api/orders/:id` (`routes/orders.ts`) добавляется:

```ts
// БЫЛО (упрощённо):
const result = await db.update(ordersTable).set(updates).where(eq(ordersTable.id, id)).returning();

// СТАЛО:
const result = await db.transaction(async tx => {
  const [updated] = await tx.update(ordersTable).set(updates).where(eq(ordersTable.id, id)).returning();

  // Audit any monetary changes
  for (const field of ["orderAmount", "commission", "commissionPaid"] as const) {
    if (updates[field] !== undefined) {
      const previousValue = current[field];
      const newValue = updated[field];
      if (String(previousValue) !== String(newValue)) {
        await tx.insert(orderAmountAuditTable).values({
          orderId: id,
          actorUserId: sessionUser,
          actorRole: actor.role,
          actorAlias: userAlias,
          field,
          previousValue: String(previousValue ?? ""),
          newValue: String(newValue ?? ""),
          source: pickSource(field, updates),
          reason: updates.reason ?? null,
        });
      }
    }
  }
  return [updated];
});
```

`pickSource` — helper:
```ts
function pickSource(field, updates): string {
  if (updates.acceptProposed) return "master_proposal";
  if (updates.acceptReceiptAmount) return "reconcile_use_receipt";
  if (updates.keepAgreementAmount) return "reconcile_keep_agreement";
  if (updates.force && actor.role === "admin") return "manager_force_paid";
  if (field === "commission" && updates.orderAmount !== undefined) return "system_recalc";
  return "operator_edit";
}
```

#### 2.4 Notification channels — точечные правки

##### Channel 1: `routes/ai-office.ts:runOrdersWithoutReceipts`

SQL запрос меняется. Было:
```sql
WHERE o.status IN ('master_assigned', 'in_progress')
  AND o.deleted_at IS NULL
  AND COALESCE(o.assigned_at, o.created_at) < ${h24ago}
  AND r.id IS NULL
```

Стало (когда `payment_state_engine_enabled = true`):
```sql
WHERE o.status IN ('master_assigned', 'in_progress')
  AND o.deleted_at IS NULL
  AND COALESCE(o.assigned_at, o.created_at) < ${h24ago}
  AND r.id IS NULL
  -- НОВОЕ: подавить если уже есть зафиксированная сумма
  AND COALESCE(o.order_amount, '0')::numeric = 0
  AND o.commission_paid = false
```

Когда флаг выключен — старая логика. Управление через `if (await isPaymentStateEngineEnabled())` ветвление в самом TS-коде функции.

Аналогично для `routes/ai-office.ts:runPaymentReminders` — добавляется фильтр `paymentState != 'paid'` (которое в SQL = `r.prepayment_seen_at IS NULL` остаётся прежним, но + `o.commission_paid = false`).

##### Channel 2: `routes/dashboard-action-items.ts`

Текущая логика (`buildItems()`):
```ts
const hasEstimate = (o.proposedAmount != null && Number(o.proposedAmount) > 0)
  || receiptOrderIds.has(Number(o.id))
  || txOrderIds.has(Number(o.id))
  || txOrderIdsWithPayments.has(Number(o.id));
if (!hasEstimate && estimateAgeH >= 24) {
  items.push({ id: `no_estimate-${o.id}`, ... });
}
```

Изменяется на:
```ts
const paymentState = paymentStateMap.get(o.id);  // pre-computed batch
const flag = await isPaymentStateEngineEnabled();
const shouldShow = flag
  ? paymentState === "no_amount"
  : !hasEstimate;  // legacy fallback
if (shouldShow && estimateAgeH >= 24) {
  items.push({ id: `no_estimate-${o.id}`, ... });
}
```

Кеш TTL 30с не меняется.

##### Channel 3: `routes/work-board.ts` и `work-board-table.ts`

Колонка `no_estimate` и проблема "Без сметы более 48 часов" — обе используют единый guard. Псевдокод в `buildBoard()`:

```ts
// Было:
else if (!receipt && o.assignedAt && now - new Date(o.assignedAt).getTime() > 48 * H) problem = "Без сметы более 48 часов";

// Стало:
else if (paymentState === "no_amount" && o.assignedAt && now - new Date(o.assignedAt).getTime() > 48 * H) {
  problem = "Сумма не зафиксирована более 48 часов";   // обновлённый текст
}
```

Колонка `no_estimate` тоже фильтруется через `paymentState === "no_amount"`. При выключенном флаге — старая логика.

##### Channel 4: `lib/operatorTasks.ts`

Существующий `getOperatorTasks()` уже работает правильно для `price_proposal` (требует `proposedAmount && !orderAmount`) — это и есть `no_amount`. Изменений на этой части нет.

Новое: тип `reconcile_amount` (Phase 3, см. ниже).

##### Channel 5: `lib/fomoBlock.ts`

Существующий `getFomoBlock()` уже частично корректен:
- Priority 1 (`no_estimate` block): срабатывает если `master_assigned + !proposedAmount + assignedAt > 48ч`
- Priority 3 (`no_payment` block): срабатывает если `proposedAmount + !orderAmount + !receipt.prepaymentSubmittedAt + updatedAt > 72ч`

Изменения:
- Priority 1: меняем условие на `paymentState === "no_amount" && assignedAt > 48ч`. Это закрывает кейс когда оператор уже зафиксировал сумму через Agreement_Path (`paymentState === "agreed"`) — мастер не блокируется.
- Priority 3: меняем на `paymentState === "agreed" && нет prepayment-receipt && updatedAt > 72ч`. Логика та же, просто через `paymentState`.

##### Channel "0" (бонусом): `lib/dispatcherAI.ts` `commission_debt`

В Phase 2 не трогаем. В Phase 3.5 переключим с `master.debt > 0` на `EXISTS transaction WHERE paymentStatus IN ('pending', 'overdue')`. Это устранит ложные срабатывания при рассинхрон debt.

#### 2.5 Auto-close открытых tasks при переходе в `agreed`/`paid`/`cancelled`

Helper в `lib/operatorTasks.ts`:

```ts
async function autoCloseEstimateTasksForOrder(orderId: number, reason: string) {
  // Текущая система не хранит tasks в БД — они вычисляются on-the-fly из orders/leads/receipts.
  // "Закрытие" означает что следующий вызов getOperatorTasks() уже не вернёт эту задачу,
  // потому что условие SQL стало false.
  //
  // НО: dashboard-action-items имеет cache TTL 30с — нужно его инвалидировать после изменений.
  invalidateBuildItemsCache();

  // Также: tasksEscalation хранит in-memory map lastNotifiedAt по taskId. Вызываем pruneNotified
  // на следующем cycle (стандартное поведение).
}
```

Этот helper вызывается из `POST /api/orders/:id/agreement` и из `PATCH /:id` после сохранения изменений.

#### 2.6 CRM UI changes

##### `OrderPanel.tsx` (Phase 2 changes)

- В баннере "Смета не создана" заменить текст на "Сумма не зафиксирована" + кнопка "Зафиксировать со слов мастера" (открывает sub-form в Closing_Drawer).
- Если `proposedAmount > 0 && paymentState === "no_amount"` — показать кнопку "Принять предложение мастера (X ₽)". Клик → `POST /api/orders/:id/agreement { amount: proposedAmount, source: "master_proposal" }`. Управляется флагом `payment_state_master_proposal_oneclick`.
- Существующая инлайн-редактура суммы остаётся, но теперь делает POST на `/agreement` вместо PATCH.

##### `ClosingDrawer.tsx`

- Добавить selector "Источник суммы": `from_master | from_chat | other`.
- Поле "Комментарий" (опционально).
- Существующая логика расчёта commission и toggle `commissionPaid` — без изменений.
- Submit делает либо `POST /agreement` (если сумма меняется) либо `PATCH /:id` (если меняется только commissionPaid/status).

##### `OrdersBanners.tsx`

Добавить новый баннер "N заказов с незафиксированной суммой более 48 часов". Запрос: `GET /api/orders?paymentState=no_amount&staleHours=48`. (Новый query-param на existing endpoint — проще чем отдельный endpoint.)

Существующие 3 баннера (cancellation_requests, token_pending, commission_pending) — без изменений в Phase 2.

#### 2.7 Master_PWA changes

В `master-pwa/src/pages/orders.tsx` карточка заказа — если в API-ответе `paymentState === "agreed"` AND нет своего receipt по этому заказу:

```jsx
<div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-800">
  ✅ Оператор зафиксировал согласованную сумму {amount} ₽. Создавать смету не обязательно.
</div>
```

Минимальное изменение, не ломает существующий receipt-flow.

#### 2.8 Notifications

##### MAX мастеру при Agreement_Amount

Файл: добавить в `routes/orders.ts` (рядом с `POST /agreement`) или в `maxBot.ts` helper:

```ts
async function sendMaxAgreementNotice(masterId: number, orderId: number, amount: number) {
  const [master] = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId));
  if (!master?.maxChatId) return;
  await sendMaxMessage(
    master.maxChatId,
    `✅ Оператор зафиксировал согласованную сумму ${amount.toLocaleString("ru-RU")} ₽ по заказу #${orderId}.\n\nДополнительно создавать смету не нужно.`
  );
}
```

##### Manager_Bot при `reconcile_amount` (Phase 3)

См. Phase 3 ниже.

### Phase 3 — Reconcile, audit-UI, KPI

**Цель**: довести feature до полноты. Управление: `payment_state_audit_ui_enabled = true`.

#### 3.1 `reconcile_amount` task

Логика обнаружения в `lib/operatorTasks.ts`:

```ts
// ШЕСТАЯ задача в getOperatorTasks() — наряду с send_to_work, no_master_response, etc.
const reconcileOrders = await db.execute(sql`
  SELECT o.id, o.order_amount, o.lead_id, o.city, o.service_type, o.updated_at,
         r.prepayment_amount AS receipt_amount,
         r.created_at AS receipt_created_at
  FROM orders o
  JOIN receipts r ON r.order_id = o.id
  WHERE o.deleted_at IS NULL
    AND o.status NOT IN ('cancelled', 'completed')
    AND o.agreement_amount_source IN ('agreement', 'master_proposal', 'manager_correction')
    AND o.order_amount IS NOT NULL
    AND CAST(o.order_amount AS NUMERIC) <> CAST(r.prepayment_amount AS NUMERIC)
    AND r.created_at > o.updated_at - INTERVAL '7 days'   -- актуальное расхождение
    AND NOT EXISTS (
      -- последняя audit-запись для этого заказа должна быть НЕ reconcile decision
      SELECT 1 FROM order_amount_audit a
      WHERE a.order_id = o.id
        AND a.created_at > r.created_at
        AND a.source IN ('reconcile_use_receipt', 'reconcile_keep_agreement')
    )
`);

for (const r of reconcileOrders.rows) {
  const ageMin = ...;
  tasks.push({
    id: `reconcile-${r.id}`,
    type: "reconcile_amount",
    priority: priorityFor(ageMin - 30, 30),
    title: `Заказ #${r.lead_id ?? r.id} — расхождение сумм: согласованная ${fmt(r.order_amount)} ₽, в смете ${fmt(r.receipt_amount)} ₽`,
    subtitle: `${r.city} · ${r.service_type}`,
    leadId: r.lead_id, orderId: r.id,
    ageMinutes: ageMin, slaMinutes: 30, overdueMinutes: ageMin - 30,
  });
}
```

#### 3.2 Reconcile UI in `OrdersBanners.tsx`

Когда обнаружен `reconcile_amount` для какого-то заказа — на карточке этого заказа в OrderPanel/OrdersWorkspace показывается жёлтый баннер:

```
⚠ Сумма из сметы (12 000 ₽) не совпадает с согласованной (10 000 ₽).
   [Использовать сумму из сметы]   [Оставить согласованную сумму]
```

Кнопки делают:
- `[Использовать]` → `PATCH /api/orders/:id { acceptReceiptAmount: true }` → `orderAmount = receipt.prepaymentAmount`, audit с `source = reconcile_use_receipt`.
- `[Оставить]` → `PATCH /api/orders/:id { keepAgreementAmount: true }` → audit-only, `orderAmount` без изменений.

#### 3.3 Audit history в Closing_Drawer

`GET /api/orders/:id/audit` → лента изменений. UI: collapsible секция в `ClosingDrawer.tsx` (видна только Manager).

```jsx
{auditEnabled && actor.role === "admin" && (
  <details>
    <summary>История изменений суммы и комиссии ({auditRows.length})</summary>
    <ul className="space-y-1 text-xs">
      {auditRows.map(row => (
        <li key={row.id}>
          {fmtDate(row.createdAt)} · {row.actorAlias} · {row.field}: {row.previousValue || "—"} → {row.newValue} ({row.source})
          {row.reason && <div className="text-gray-500 ml-3">«{row.reason}»</div>}
        </li>
      ))}
    </ul>
  </details>
)}
```

#### 3.4 Manager-bot уведомление при `reconcile_amount`

В `lib/tasksEscalation.ts` существующий escalation уже умеет посылать админу аггрегат критичных задач. `reconcile_amount` подхватывается автоматически как `priority = "critical"` после 30мин просрочки. Доп. кода не требуется.

#### 3.5 KPI / Analytics endpoint

Новый: `GET /api/analytics/payment-state-mix?from=YYYY-MM-DD&to=YYYY-MM-DD&groupBy=day|week|month`

Возвращает:
```ts
{
  rows: [
    { period: "2026-06-01", agreement: 45, masterProposal: 12, receipt: 38, unknown: 5, total: 100 },
    ...
  ],
  totals: { agreement: 850, masterProposal: 200, receipt: 700, unknown: 130, total: 1880 },
}
```

Фронт — простая таблица + bar chart в существующем CRM Analytics page.

#### 3.6 (Phase 3.5, отдельный релиз) Master.debt cleanup

Опционально. Скрипт `scripts/src/recompute-master-debt.ts`:

```ts
// Для каждого master:
// debt = SUM(commission - prepaymentDeducted - SUM(transaction_payments.amount))
//        FROM transactions
//        WHERE paymentStatus IN ('pending', 'overdue')
```

Сначала dry-run + отчёт расхождений; после ручной проверки Manager — apply.

После пересчёта — переключить `dispatcherAI.ts:commission_debt` reminder с `master.debt > 0` на агрегат transactions.

Этот шаг изолирован и может быть запущен в любой момент после Phase 2.


## Audit Trail — детально

Все изменения денежных полей пишутся в `order_amount_audit`. Принципы:

- **Атомарность**: запись audit и изменение поля — в одной БД-транзакции (`db.transaction`). Если транзакция фейлится — нет ни изменения, ни audit'а.
- **Снимок actor'а**: в audit пишется не только `actorUserId`, но и `actorAlias` (denormalized snapshot имени) — чтобы при удалении пользователя история не теряла подпись. Аналогично делает существующий `order_status_logs.userAlias`.
- **`source` обязательно**: каждая запись имеет одно из значений: `agreement | master_proposal | receipt | manager_correction | reconcile_use_receipt | reconcile_keep_agreement | manager_force_paid | system_recalc | operator_edit | unknown`.
- **`reason` обязательно для определённых source**: `manager_correction`, `manager_force_paid`, `reconcile_keep_agreement` (потому что оператор сознательно отклонил смету) — без reason API возвращает 400.
- **Read access**: Manager (admin) видит всю историю. Operator (lead_operator/master_operator) — только последние 5 записей по своим заказам, без `actorAlias` других операторов.

### Что писать как entry в audit

| Действие | Entries |
|---|---|
| Operator zafiks Agreement_Amount | 1: `field=orderAmount, source=agreement` (+ если paymentModel=commission ещё 1: `field=commission, source=system_recalc`) |
| Operator принимает proposedAmount одним кликом | 1: `field=orderAmount, source=master_proposal` (+ commission system_recalc) |
| Master создаёт Receipt → orderAmount автозаполняется | 1: `field=orderAmount, source=receipt` (+ commission system_recalc) |
| Operator меняет orderAmount через PATCH | 1: `field=orderAmount, source=operator_edit` |
| Manager меняет orderAmount после `paid` | 1: `field=orderAmount, source=manager_correction, reason=...` |
| Operator ставит commissionPaid=true (с подтверждённой транзакцией) | 1: `field=commissionPaid, source=operator_edit` |
| Manager force-paid | 1: `field=commissionPaid, source=manager_force_paid, reason=...` |
| Reconcile: использовать сумму из сметы | 1: `field=orderAmount, source=reconcile_use_receipt` (+ commission recalc) |
| Reconcile: оставить согласованную | 1: `field=orderAmount, source=reconcile_keep_agreement` (newValue=previousValue, reason обязательно) |

## Correctness Properties

Этот раздел формализует инварианты, которые код **должен** соблюдать. Они проверяются property-based-тестами (см. Testing Strategy) — не отдельными примерами, а на сгенерированных входах.

### Property 1: Determinism of `computePaymentState`

**Validates: Requirements 1.1, 1.5**

THE `computePaymentState(order, receipts)` SHALL быть pure-функцией: для одного и того же входа SHALL возвращать одно и то же значение, без побочных эффектов.

- **Property test**: для любого случайного `order` и любого набора `receipts`, два последовательных вызова возвращают одинаковое значение.

### Property 2: Cancellation precedence

**Validates: Requirements 1.1, 12.1**

THE `cancelled` status SHALL побеждать любые другие сигналы.

- **Property test**: для любого `order` с `status = "cancelled"` и любых `receipts` и любого `commissionPaid`, `computePaymentState(...) = "cancelled"`.

### Property 3: Monotonicity of state under information growth

**Validates: Requirements 1.1, 1.3**

WHILE `Order.status ≠ "cancelled"`, THE Payment_State SHALL не "регрессировать" при добавлении информации:
- из `no_amount` можно перейти только в `agreed`, `paid`, `cancelled`
- из `agreed` можно перейти только в `paid`, `cancelled`
- из `paid` можно перейти только в `cancelled`

- **Property test**: для любого order, добавление поля (orderAmount, commissionPaid, receipt) не уменьшает Payment_State в порядке `no_amount < agreed < paid`. Удаление поля (отмена) допускает регрессию только в случае `cancelled`.

### Property 4: Audit completeness

**Validates: Requirements 5.1, 5.4, 2.2**

WHEN `Order.orderAmount`, `Order.commission`, или `Order.commissionPaid` меняется через любой write-endpoint, THE system SHALL создать соответствующую запись в `order_amount_audit` в той же транзакции.

- **Verification**: integration-тест на каждый write-path (`POST /agreement`, `PATCH /:id` со всеми acceptable updates), проверяет что audit появился.
- **Property test**: для любой последовательности random-операций над order, count(audit_records WHERE order_id = X) ≥ count(distinct_state_changes_in_orderAmount/commission/commissionPaid).

### Property 5: Token charging idempotency

**Validates: Requirements 8.1, 8.3, 8.4**

WHERE `Order.paymentModel = "token"`, THE Token_Wallet SHALL списать токены ровно один раз на жизненный цикл Order (Req 8.1).

- **Property test**: для любой последовательности `POST /agreement` (или `acceptProposed`) операций на одном order, итоговое `Order.tokensCharged` равно результату первого вызова, не суммы.
- **Negative test**: повторный вызов `POST /agreement` с другой суммой не списывает дополнительные токены.

### Property 6: Notification suppression invariant

**Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8**

WHILE `payment_state_engine_enabled = true` AND `Order.paymentState ∈ {agreed, paid, cancelled}`, THE Notification_Engine SHALL не сгенерировать ни одного нового сигнала типа `no_estimate` для этого Order — ни через каналы 1-5, ни через любые другие пути в коде.

- **Verification**: после каждого изменения в одном из 5 каналов запускается integration-тест с фикстурой "1000 заказов всех Payment_States" и проверяется что MAX-сообщений / push / tasks не отправлено для тех, что в `agreed/paid/cancelled`.
- **Property test**: для любого random order с `paymentState ≠ no_amount`, helper `shouldNagAboutEstimate(...) → false`.

### Property 7: Reconcile detection completeness

**Validates: Requirements 4.1, 4.3, 4.5**

WHEN order имеет `agreement_amount_source ∈ {agreement, master_proposal, manager_correction}` AND существует Receipt с `prepaymentAmount ≠ Order.orderAmount`, AND нет последующего audit-event с `source ∈ {reconcile_use_receipt, reconcile_keep_agreement}`, THEN `getOperatorTasks()` SHALL вернуть task `reconcile_amount` для этого order.

- **Property test**: random sequence of agreement-set / receipt-create / reconcile-decision events, в любой момент check что `getOperatorTasks` отражает актуальное состояние конфликта.

## Error Handling

### Validation errors

| Endpoint | Условие | HTTP | Тело |
|---|---|---|---|
| `POST /api/orders/:id/agreement` | `amount ≤ 0` | 400 | `{ error: "Сумма должна быть больше 0" }` |
| `POST /api/orders/:id/agreement` | order не найден | 404 | `{ error: "Заказ не найден" }` |
| `POST /api/orders/:id/agreement` | order в `cancelled` или `completed` | 400 | `{ error: "Нельзя зафиксировать сумму на закрытом заказе" }` |
| `POST /api/orders/:id/agreement` | нет auth | 401 | `{ error: "Требуется авторизация" }` |
| `POST /api/orders/:id/agreement` | роль ниже Operator | 403 | `{ error: "Недостаточно прав" }` |
| `PATCH /api/orders/:id` с `force: true` без `reason` (Manager force-paid) | reason отсутствует | 400 | `{ error: "Укажите причину для force-paid" }` |
| `GET /api/orders/:id/audit` | роль ниже Manager | 403 | `{ error: "Доступ только для Manager" }` |

### Transaction failures

THE API_Server SHALL не оставлять частичные изменения при сбое транзакции. Все write-операции (`POST /agreement`, `PATCH /:id`) обёрнуты в `db.transaction(async tx => ...)`. Если внутри транзакции возникает любая ошибка (PostgresError, race на `forUpdate`, validation внутри transaction body) — транзакция откатывается, и API возвращает 500 с body `{ error: "Не удалось сохранить изменения, попробуйте снова" }` и логирует stack trace через `errorLoggerMiddleware`.

### External service failures

| Side-effect | Что делаем при ошибке |
|---|---|
| `sendMaxMessage(...)` мастеру после Agreement_Amount | Логируем `[orders/agreement] max-bot error: ...`, продолжаем — endpoint возвращает 200. |
| `sendPushToMaster(...)` | То же. PWA push не критичен. |
| `notifyWorkBoardChanged()` | Невероятная ошибка (in-process EventEmitter). Если возникает — логируем и игнорируем. |
| `closeOpenEstimateTasksForOrder(...)` (cache invalidate) | Cache работает на TTL 30с, ручной invalidate — лишь оптимизация. Если падает — TTL спасёт через ≤30с. |

### Feature flag failures

WHEN `getFlag(key)` падает (например, БД недоступна на момент проверки), THE guard SHALL вернуть `false` (старое поведение). Это **fail-closed** стратегия — если сомневаемся, возвращаемся к старому поведению, чтобы не сломать критичный путь оператора.

### Race conditions

| Сценарий | Поведение |
|---|---|
| Два оператора одновременно `POST /agreement` на один order | `forUpdate()` lock — второй ждёт первого. После commit первого, второй читает обновлённое значение и применяет своё (last-write-wins). Audit сохраняет обе записи. |
| `POST /agreement` параллельно с `PATCH /:id { status: "cancelled" }` | Тот же lock. Если первой прошла отмена, `POST /agreement` падает с 400 ("нельзя на закрытом заказе"). |
| Включение/выключение feature flag во время выполнения `runOrdersWithoutReceipts` | Каждый вызов `isPaymentStateEngineEnabled()` идёт в кеш TTL 60с. Может быть момент несогласованности до 60с — приемлемо. |



## Testing Strategy

### Unit tests

Файл: `artifacts/api-server/__tests__/paymentState.test.ts` (новый; используем встроенный test runner Node.js или vitest если уже есть).

Минимум 12 тест-кейсов для `computePaymentState`:

1. `cancelled` order → `cancelled` (вне зависимости от других полей)
2. `commissionPaid=true` → `paid`
3. Все receipts с `prepaymentSeenAt` → `paid`
4. `orderAmount > 0` без receipts → `agreed`
5. Любой receipt с `prepaymentAmount > 0` без `orderAmount` → `agreed`
6. Нет ничего → `no_amount`
7. Order created → no_amount → orderAmount set → agreed (state transitions)
8. Multiple receipts, only one with prepaymentSeenAt → НЕ paid (нужно "все")
9. orderAmount=0 без receipts → `no_amount`
10. orderAmount=null без receipts → `no_amount`
11. cancelled с commissionPaid=true → `cancelled` (cancelled побеждает)
12. Mixed: orderAmount + receipt without seenAt → `agreed`

### Integration tests

Файл: `artifacts/api-server/__tests__/paymentState.endpoint.test.ts`. Использует pg test database (если есть pattern) или мокает на drizzle level.

Минимум 6 кейсов:

1. `POST /agreement` устанавливает `orderAmount`, audit-запись создана, `paymentState` в response = `agreed`.
2. `POST /agreement` на заказ со статусом `cancelled` → 400.
3. `POST /agreement` с `amount = 0` → 400.
4. `POST /agreement` без auth → 401.
5. `POST /agreement` затем создаём Receipt с другой суммой → автоматически появляется `reconcile_amount` task в `getOperatorTasks()`.
6. `PATCH /:id { acceptReceiptAmount: true }` → orderAmount меняется на receipt.prepaymentAmount, audit с source=reconcile_use_receipt, task закрыта.

### Manual verification после раскатки Phase 2

Чек-лист (заполняется Manager на проде после toggle флага):

1. ☐ Открыть CRM → Заявки → "В работе" → найти заказ без receipt и без orderAmount → бейдж "Сумма не зафиксирована"
2. ☐ Тот же заказ → нажать "Зафиксировать со слов мастера" → ввести 8000 → бейдж стал "Сумма согласована" → в master-pwa мастер видит подсказку "оператор зафиксировал сумму"
3. ☐ Подождать 24-48 минут → проверить что в логах нет новых `[scenarios] auto: orders-without-receipts` строк по этому заказу
4. ☐ Открыть Главную CRM → раздел "Задачи" → задача `no_estimate` для этого заказа отсутствует
5. ☐ Открыть Master_PWA от лица мастера, у которого есть этот заказ → проверить что мастер не заблокирован FOMO no_estimate
6. ☐ Создать на этот же заказ Receipt с суммой ≠ 8000 → появляется баннер `reconcile_amount` (Phase 3 only)
7. ☐ Включение/выключение `payment_state_engine_enabled` через настройки CRM → проверить что переключение работает без рестарта (TTL 60с)

### Регрессионные тесты (что не должно сломаться)

1. ☐ Receipt-flow без изменений: мастер создаёт смету → клиент платит → оператор подтверждает → komisссия начисляется. Каждый шаг проверяем вручную.
2. ☐ Token-orders: paymentModel=token → списание токенов происходит ровно один раз при первом переходе в agreed (и через `acceptProposed`, и через `POST /agreement`).
3. ☐ Auto-completed orders: если предоплата ≥ комиссии → заказ авто-completed (существующая логика в orders.ts).
4. ☐ Cancellation flow: отмена работает во всех Payment_State'ах. Token refund (Req 12.4) работает.
5. ☐ Existing operator tasks: send_to_work, no_master_response, cancel_request, price_proposal, confirm_prepayment — продолжают работать как раньше.

## Migration & Rollout Plan

### Pre-deploy (готовим, ничего не релизим)

1. Сгенерить миграцию: `pnpm --filter @workspace/db exec drizzle-kit generate --name=payment_state_engine` → один SQL файл в `lib/db/migrations/`.
2. Добавить exports в `lib/db/src/schema/index.ts`.
3. Запустить локально на dev DB: `pnpm dev` стартует api-server → `runDrizzleMigrations()` применит автоматически.
4. Прогнать unit + integration тесты локально.

### Deploy Phase 1

1. Коммит → push → Railway пересобирает.
2. На проде `runDrizzleMigrations()` применит миграцию автоматически (см. `lib/migrate.ts`).
3. После рестарта — проверить логи: `[migrate] drizzle migrations up to date`. Если есть ошибки — rollback миграции вручную (alter table drop column / drop table).
4. Проверить смоук: `GET /api/orders/123` — в JSON должны появиться `paymentState` и `agreementAmountSource`.
5. CRM badge → виден без флага.

**Phase 1 не требует флагов — всё включено по умолчанию (только дополнения).**

### Deploy Phase 2

1. Коммит изменений в feature-flag guard, endpoint, channels 1-5, CRM UI.
2. Push → Railway redeploy.
3. Флаг `payment_state_engine_enabled` остаётся `false` (default). Старое поведение продолжает работать.
4. Включить флаг через CRM Settings UI или прямой SQL: `INSERT INTO system_settings (key, value, updated_at) VALUES ('payment_state_engine_enabled', 'true', NOW()) ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = NOW();`
5. **TTL 60с**: через минуту все процессы api-server подхватывают новое значение.
6. Мониторить 30 минут:
   - Логи `[scenarios] auto: orders-without-receipts` — количество эскалированных заказов должно резко упасть (это ожидаемо).
   - Логи `[scenarios] auto: payment-reminders` — то же.
   - Counter MAX-сообщений мастерам — должно быть меньше.
   - Никаких новых ошибок (search "TypeError", "Cannot read", "PostgresError" в логах).
7. Если что-то идёт не так — сразу выключаем: `UPDATE system_settings SET value = 'false' WHERE key = 'payment_state_engine_enabled';`. Через 60с старое поведение возвращается.

### Deploy Phase 3

Аналогично Phase 2 — отдельный коммит, отдельный флаг. Audit UI и reconcile появляются только при включении.

### Rollback strategy

| Что включено | Как выключить |
|---|---|
| Только Phase 1 (миграция) | Нельзя выключить (DDL применена). Но это безопасно — новые поля nullable, не используются никем кроме новых endpoints. |
| Phase 2 без проблем | `UPDATE system_settings SET value='false' WHERE key='payment_state_engine_enabled'` — TTL 60с, поведение возвращается к старому. Кнопка "Зафиксировать" в CRM остаётся видимой, но при клике endpoint работает как раньше. |
| Phase 2 с серьёзной проблемой | Тот же toggle + откат коммита через Railway Rollback to previous deployment. |
| Phase 3 | `UPDATE system_settings SET value='false' WHERE key='payment_state_audit_ui_enabled'` — UI скрывается, reconcile_amount tasks перестают создаваться. |

### DDL rollback (если миграция оказалась битой)

```sql
-- emergency rollback — только в крайнем случае
DROP TABLE IF EXISTS "order_amount_audit";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "agreement_amount_source";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "payment_state_changed_at";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "agreement_note";
DELETE FROM "drizzle"."__drizzle_migrations" WHERE hash = '<hash 0001>';
```

## Risks & Mitigations

| # | Риск | Вероятность | Влияние | Митигация |
|---|---|---|---|---|
| 1 | Миграция не применяется на проде (timeout, deadlock) | Низкая | Высокое — API не стартует | Миграция мелкая (3 ALTER + 1 CREATE TABLE), все в одной транзакции drizzle-kit. Тестируем на dev. На проде есть `bootstrapBaselineIfNeeded` который не должен мешать. |
| 2 | После включения флага `paymentState` массово вычисляется неправильно для исторических заказов | Средняя | Среднее — UI показывает неправильные бейджи, шум подавляется не там | Чистая функция `computePaymentState` покрыта 12+ тестами. Backfill `agreement_amount_source = 'unknown'` гарантирует что исторические заказы продолжают читаться без сбоев. |
| 3 | Race между `POST /agreement` и параллельным `PATCH /:id` от другого оператора | Средняя | Низкое — потеряется одно из изменений | `db.transaction` + `forUpdate()` lock. В худшем случае — последний writer wins, audit покажет обе записи. |
| 4 | Кеш feature flag не инвалидируется в multi-instance setup | Низкая | Низкое — задержка раскатки до 60с per instance | TTL 60с — приемлемо. Если станет проблемой — pub/sub через PG NOTIFY (overkill для текущей нагрузки). |
| 5 | `runOrdersWithoutReceipts` фильтр SQL ломается при флаге = true (синтаксис, нагрузка) | Средняя | Среднее — спам-канал не работает в нужном виде | Прокатываем сначала локально, потом на одном инстансе с включённым флагом для одного-двух заказов. |
| 6 | `commissionPaid` начинает синхронизироваться с `transactions.paymentStatus` неправильно | Средняя | Высокое — деньги в учёте | В Phase 2 НЕ синхронизируем эти поля автоматически. Они остаются независимыми. Только в Phase 3.5 (отдельный релиз) пересчитываем `master.debt`. |
| 7 | Audit-таблица растёт быстро (нагрузка) | Низкая | Низкое — диск и indexes | Размер строки ~150 байт. 1000 заказов × 5 audit-events ≈ 750 KB. За год это ~10 MB при текущем объёме — пренебрежимо. Если станет проблемой — добавим partition по месяцу. |
| 8 | Reconcile_amount task создаёт false-positive при редактировании смет мастером | Средняя | Среднее — спам в operator UI | SQL фильтр требует `o.agreement_amount_source IN ('agreement', 'master_proposal', 'manager_correction')` — это исключает receipt-only flow. Также проверяем что receipt создан после последнего agreement-set, не наоборот. |
| 9 | Master_PWA подсказка "оператор зафиксировал сумму" появляется на старых заказах с unknown source | Низкая | Низкое — UI noise | Фильтр в Master_PWA: показывать только если `agreementAmountSource IN ('agreement', 'master_proposal')` — исключает `unknown` и `receipt`. |
| 10 | Изменение текста баннера "Без сметы" → "Сумма не зафиксирована" путает оператора | Низкая | Низкое — UX | Сделать текст в баннере явным: "Сумма не зафиксирована — создайте смету или зафиксируйте со слов мастера". UX testing после релиза. |

## Notes for Reviewer

- Все decisions из requirements (Q1-Q15) учтены и реализуются конкретными изменениями кода.
- Phase 1 безопасна по умолчанию (без флагов). Phase 2 управляется одним флагом и полностью откатываема. Phase 3 управляется вторым флагом независимо.
- `master.debt` cleanup в Phase 3.5 — отдельный, опциональный, изолированный релиз. Не блокирует основную фичу.
- В Phase 2 возможно много ложных срабатываний при первом включении флага — это **ожидаемо**. Все 5 каналов начнут резко молчать по тысячам заказов одновременно. Мониторим 24 часа после toggle.
- `reconcile_amount` (Phase 3) — единственная новая automation, которая может создавать новые задачи оператора. Все остальные изменения — только подавление существующего шума.
- Тесты предложены минимальные. По мере реализации добавим property-based tests для `computePaymentState` (с использованием `fast-check` если есть в проекте).
