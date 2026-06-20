# Design — Зависшие заказы и баннер «нужен результат»

## Архитектура (high-level)

```
┌─────────────────────────────────────────────────────────────────────┐
│  CRON (api-server)                                                  │
│  - dailyMasterReminderCron — 10:00 МСК — push по pending-actions    │
└──────────────┬──────────────────────────────────────────────────────┘
               │ shared logic
┌──────────────▼──────────────────────────────────────────────────────┐
│  lib/stuckOrders.ts (NEW)                                           │
│  - classifyOrder(order, ctx) → category | null                      │
│  - getStuckOrdersForMaster(masterId)                                │
│  - getAllStuckOrders()  (operator-side)                             │
│  Единый источник правил R0–R4.                                      │
└──────────────┬──────────────────────────────────────────────────────┘
               │
   ┌───────────┴───────────┐
   ▼                       ▼
GET /api/orders/stuck      GET /api/master-pwa/pending-actions
GET /api/orders/stuck/:cat POST /api/master-pwa/orders/:id/call-report
POST /api/orders/:id/      POST /api/master-pwa/orders/:id/snooze-banner
     remind-master
   │                       │
   ▼                       ▼
CRM (React)                PWA (React)
- StuckOrdersBlock         - PendingActionsBanner
- /orders/stuck page       - CallReportModal
- (уберём ActionItemsBlock)
```

Идея: вся логика классификации застревания живёт в одном `lib/stuckOrders.ts` — фронт никогда не дублирует правила, бэк единая точка истины.

## Миграция БД

### Файл: `lib/db/migrations/0012_stuck_orders.sql`

```sql
-- Add columns for stuck-orders flow
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS client_call_reported_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS banner_snoozed_until    TIMESTAMP NULL;

-- Index to quickly find orders missing call-report past 24h
CREATE INDEX IF NOT EXISTS idx_orders_call_report_pending
  ON orders (assigned_at)
  WHERE client_call_reported_at IS NULL
    AND status IN ('master_assigned', 'in_progress', 'on_site')
    AND deleted_at IS NULL;

-- Index for fast banner-snooze filter (mostly NULL, partial index keeps it small)
CREATE INDEX IF NOT EXISTS idx_orders_banner_snoozed
  ON orders (banner_snoozed_until)
  WHERE banner_snoozed_until IS NOT NULL;
```

### Schema update: `lib/db/src/schema/orders.ts`

```ts
// добавить в pgTable("orders", {...})
clientCallReportedAt: timestamp("client_call_reported_at"),
bannerSnoozedUntil:   timestamp("banner_snoozed_until"),
```

### Journal entry: `lib/db/migrations/meta/_journal.json`

Добавить запись с idx = next available, tag = `0012_stuck_orders`, when = текущий timestamp.

## Backend

### `artifacts/api-server/src/lib/stuckOrders.ts` (новый файл)

```ts
export type StuckCategory =
  | "needs_call_report"
  | "needs_result"
  | "needs_amount_confirmation"
  | "needs_commission_payment"
  | "zombie";

export interface StuckOrderItem {
  id: number;
  category: StuckCategory;
  masterId: number | null;
  masterAlias: string | null;
  clientName: string | null;
  clientPhone: string | null;
  city: string;
  serviceType: string;
  status: string;
  daysStuck: number;
  assignedAt: Date | null;
  callReportedAt: Date | null;
  scheduledAt: Date | null;
  proposedAmount: number | null;
  orderAmount: number | null;
  commission: number | null;
  netPayable: number | null;
  bannerSnoozedUntil: Date | null;
}

interface ClassifyContext {
  now: Date;
  txByOrderId: Map<number, Transaction>;
  partialsByTx: Map<number, number>;
  recentMessagesByOrder: Map<number, Date>; // last master-message createdAt per order
}

/**
 * Returns the highest-priority category for an order, or null if not stuck.
 * Priority: zombie > needs_commission_payment > needs_result > needs_amount_confirmation > needs_call_report
 */
export function classifyOrder(order: Order, ctx: ClassifyContext): StuckCategory | null {
  const ACTIVE = ["master_assigned", "in_progress", "on_site"];
  const isActive = ACTIVE.includes(order.status);
  const assignedAt = order.assignedAt ?? order.createdAt;
  const daysSinceAssign = (ctx.now.getTime() - assignedAt.getTime()) / 86_400_000;

  // R4: zombie
  if (isActive && daysSinceAssign >= 14) {
    const lastMsg = ctx.recentMessagesByOrder.get(order.id);
    const noActivity = !order.proposedAmount
      && (!order.photosAfter || order.photosAfter.length === 0)
      && (!lastMsg || (ctx.now.getTime() - lastMsg.getTime()) / 86_400_000 >= 14);
    if (noActivity) return "zombie";
  }

  // R3: commission unpaid
  const tx = ctx.txByOrderId.get(order.id);
  if (tx && (tx.paymentStatus === "pending" || tx.paymentStatus === "overdue")) {
    const txAge = (ctx.now.getTime() - tx.createdAt.getTime()) / 86_400_000;
    const partials = ctx.partialsByTx.get(tx.id) ?? 0;
    const netPayable = Math.max(0, Number(tx.commission) - Number(tx.prepaymentDeducted ?? 0) - partials);
    if (txAge >= 7 && netPayable > 0) return "needs_commission_payment";
  }

  // R2: amount not confirmed
  if (order.status === "completed" && order.proposedAmount && (!order.orderAmount || Number(order.orderAmount) === 0)) {
    return "needs_amount_confirmation";
  }

  // R1: needs result (photos + amount)
  if (isActive && daysSinceAssign >= 7) {
    const noResult = (!order.photosAfter || order.photosAfter.length === 0) || !order.proposedAmount;
    if (noResult) return "needs_result";
  }

  // R0: needs call report (1 day, lowest priority)
  if (isActive && daysSinceAssign >= 1 && !order.clientCallReportedAt) {
    return "needs_call_report";
  }

  return null;
}

/** Variant that filters to a specific master (for PWA pending-actions). */
export async function getPendingActionsForMaster(masterId: number): Promise<StuckOrderItem[]> { ... }

/** Operator-side: all stuck orders, grouped by category. */
export async function getAllStuckOrders(): Promise<Record<StuckCategory, StuckOrderItem[]>> { ... }
```

Логика `recentMessagesByOrder` — берём из `master_messages` через JOIN с orders по `master_id` + дальше фильтр по дате. Можно дешевле: одним запросом `SELECT order_id, MAX(created_at) FROM master_messages WHERE created_at > NOW() - INTERVAL '14 days' GROUP BY ...` — но в `master_messages` нет `order_id`. Нужно либо матчить по `master_id` (грубо), либо добавлять `order_id` в схему (out of scope). MVP: считаем активность мастера в чате как «активность» по всем его активным заказам (грубо, но OK — если мастер вообще молчит, все его заказы зомби-кандидаты).

### Endpoints

#### `GET /api/orders/stuck` (новый)

`artifacts/api-server/src/routes/orders.ts` — добавить:

```ts
router.get("/stuck", allOrderRoles, async (req, res) => {
  const grouped = await getAllStuckOrders();
  res.json({
    counts: {
      needs_call_report:           grouped.needs_call_report.length,
      needs_result:                grouped.needs_result.length,
      needs_amount_confirmation:   grouped.needs_amount_confirmation.length,
      needs_commission_payment:    grouped.needs_commission_payment.length,
      zombie:                      grouped.zombie.length,
    },
    items: grouped, // already grouped by category
  });
});
```

Параметр `?category=needs_result&masterId=...&city=...&limit=50` — для страницы списка с фильтрами.

#### `GET /api/master-pwa/pending-actions` (новый)

`artifacts/api-server/src/routes/master-pwa.ts`:

```ts
router.get("/pending-actions", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const stuck = await getPendingActionsForMaster(masterId);
  // Filter to only categories that REQUIRE master action: R0, R1, R3
  const masterFacing = stuck.filter(s =>
    ["needs_call_report", "needs_result", "needs_commission_payment"].includes(s.category)
  );
  // Filter out snoozed
  const now = new Date();
  const visible = masterFacing.filter(s =>
    !s.bannerSnoozedUntil || s.bannerSnoozedUntil < now
  );
  res.json(visible.map(toMasterActionDTO));
});
```

DTO:

```ts
{
  orderId: number,
  type: "call_report" | "photos_and_amount" | "commission_payment",
  title: string,        // "По заказу #123 (поклейка обоев) — отчитайтесь о созвоне"
  ctaText: string,      // "Отчитаться о созвоне"
  daysStuck: number,
  city: string,
  serviceType: string,
  snoozedUntil: string | null,
}
```

#### `POST /api/master-pwa/orders/:id/snooze-banner` (новый)

```ts
router.post("/orders/:id/snooze-banner", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const orderId = parseInt(req.params.id);
  const order = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.masterId, masterId)));
  if (!order[0]) return res.status(404).json({ error: "Заказ не найден" });

  const snoozeUntil = new Date(Date.now() + 24 * 3600 * 1000);
  await db.update(ordersTable)
    .set({ bannerSnoozedUntil: snoozeUntil, updatedAt: new Date() })
    .where(eq(ordersTable.id, orderId));
  res.json({ snoozedUntil: snoozeUntil.toISOString() });
});
```

#### `POST /api/master-pwa/orders/:id/call-report` (новый)

```ts
router.post("/orders/:id/call-report", requireMasterPwa, async (req, res) => {
  const masterId = (req.session as any).masterId;
  const orderId = parseInt(req.params.id);
  const { scheduledAt, note } = req.body;

  const orderRows = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.masterId, masterId)));
  if (!orderRows[0]) return res.status(404).json({ error: "Заказ не найден" });

  const updates: any = {
    clientCallReportedAt: new Date(),
    updatedAt: new Date(),
  };
  if (scheduledAt) updates.scheduledAt = new Date(scheduledAt);

  await db.update(ordersTable).set(updates).where(eq(ordersTable.id, orderId));

  // Log into master_messages so operator sees it in chat
  const noteText = scheduledAt
    ? `📅 Замер согласован: ${formatDate(new Date(scheduledAt))}${note ? `. ${note}` : ""}`
    : `📞 Отчёт о созвоне: ${note ?? "без комментария"}`;
  await db.insert(masterMessagesTable).values({
    masterId,
    telegramChatId: `pwa_${masterId}`,
    text: noteText,
    fromMaster: true,
    senderName: "Мастер (отчёт о созвоне)",
    isRead: false,
    photoUrl: null,
    telegramMessageId: null,
  });

  res.json({ success: true });
});
```

#### `POST /api/orders/:id/remind-master` (новый)

`artifacts/api-server/src/routes/orders.ts`:

```ts
router.post("/:id/remind-master", allOrderRoles, async (req, res) => {
  const orderId = parseInt(req.params.id);
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order || !order.masterId) return res.status(400).json({ error: "Нет мастера у заказа" });

  // Classify, build appropriate text
  const category = await classifySingleOrder(orderId);
  if (!category) return res.status(400).json({ error: "Заказ не застрял" });

  const text = buildReminderText(order, category);
  await sendPushToMaster(order.masterId, {
    title: `🔔 Напоминание оператора`,
    body: text,
    url: `/orders/${orderId}`,
  });
  res.json({ success: true });
});
```

### Cron — `dailyMasterReminderCron`

Файл: `artifacts/api-server/src/lib/dailyMasterReminderCron.ts` (новый, по аналогии с уже существующими cron'ами в проекте — посмотрю как они зарегистрированы при имплементации).

```ts
export async function dailyMasterReminder() {
  const masters = await db.select().from(mastersTable)
    .where(and(eq(mastersTable.status, "active"), isNull(mastersTable.deletedAt)));
  for (const m of masters) {
    const actions = await getPendingActionsForMaster(m.id);
    const visible = actions.filter(a => !a.bannerSnoozedUntil || a.bannerSnoozedUntil < new Date());
    if (visible.length === 0) continue;
    const text = visible.length === 1
      ? buildSingleReminderText(visible[0])
      : `У вас ${visible.length} заказов требуют действия`;
    await sendPushToMaster(m.id, {
      title: "🔔 Напоминание",
      body: text,
      url: "/home",
    });
  }
}
```

Запуск: cron `0 7 * * *` UTC = 10:00 МСК. Регистрация в существующем планировщике (проверить `artifacts/api-server/src/index.ts` или где живут cron'ы — обычно через `node-cron` или ручной `setInterval`).

## Frontend — CRM

### Замена `ActionItemsBlock` на `StuckOrdersBlock`

Файл: `artifacts/crm/src/components/dashboard/StuckOrdersBlock.tsx` (новый).

```tsx
const CATEGORY_CONFIG = [
  { key: "needs_call_report",         label: "Нет отчёта о созвоне",  emoji: "🟡", color: "amber" },
  { key: "needs_result",              label: "Ждут результата",       emoji: "🟠", color: "orange" },
  { key: "needs_amount_confirmation", label: "Подтвердите сумму",     emoji: "🟣", color: "violet" },
  { key: "needs_commission_payment",  label: "Не оплачена комиссия",  emoji: "🔴", color: "red" },
  { key: "zombie",                    label: "Зомби (14+ дней)",      emoji: "⚫", color: "gray" },
];

export function StuckOrdersBlock() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/orders/stuck"],
    queryFn: () => fetch("/api/orders/stuck").then(r => r.json()),
    refetchInterval: 60_000,
  });
  // 5 cards in a horizontal grid, click → navigate to /orders/stuck?category=<key>
}
```

В `dashboard.tsx`:

```tsx
- import { ActionItemsBlock } from "../components/dashboard/ActionItemsBlock";
+ import { StuckOrdersBlock } from "../components/dashboard/StuckOrdersBlock";
...
- <ActionItemsBlock />
+ <StuckOrdersBlock />
```

### Страница `/orders/stuck`

Файл: `artifacts/crm/src/pages/orders-stuck.tsx` (новый).

- Параметр `?category=<key>` — какую группу показать (если не указано, по умолчанию `needs_call_report`)
- Tabs/pills вверху для переключения
- Таблица с колонками `#`, `Мастер`, `Клиент`, `Город`, `Услуга`, `Висит N дн.`, `Действия`
- В строке для R0 (call_report) — если уже отчитался, рядом с «Висит» показываем «✓ Отчёт: 12 июня + замер 15 июня в 14:00» (но pending action остаётся пока другие условия не выполнены)
- Действия: «Напомнить» (POST `/orders/:id/remind-master`), «Карточка мастера» (открывает `MasterDrawer` через ту же логику что в `checkins.tsx`), «Открыть заказ» (Link), «Отменить» (только в zombie, с prompt причины → `PATCH /orders/:id`)

Регистрация в роутинге CRM (wouter): добавить `<Route path="/orders/stuck" component={OrdersStuckPage} />` в основном `App.tsx`.

## Frontend — PWA

### Компонент `PendingActionsBanner`

Файл: `artifacts/master-pwa/src/components/PendingActionsBanner.tsx` (или по аналогии с существующей структурой PWA — проверю при имплементации).

```tsx
export function PendingActionsBanner() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/master-pwa/pending-actions"],
    queryFn: () => fetch("/api/master-pwa/pending-actions").then(r => r.json()),
  });

  const [callReportFor, setCallReportFor] = useState<number | null>(null);
  const [, setLocation] = useLocation();

  if (isLoading || !data || data.length === 0) return null;

  const handleAction = (action: PendingAction) => {
    if (action.type === "call_report") {
      setCallReportFor(action.orderId);
      return;
    }
    setLocation(`/orders/${action.orderId}#${action.type === "commission_payment" ? "payment" : "result"}`);
  };

  const handleSnoozeAll = async () => {
    await Promise.all(data.map(a =>
      fetch(`/api/master-pwa/orders/${a.orderId}/snooze-banner`, { method: "POST" })
    ));
    queryClient.invalidateQueries({ queryKey: ["/api/master-pwa/pending-actions"] });
  };

  return (
    <Modal>
      <Header>Нужно ваше действие</Header>
      <List>
        {data.map(action => (
          <Card key={action.orderId}>
            <Title>{action.title}</Title>
            <Subtitle>Висит {action.daysStuck} дн.</Subtitle>
            <Button color="green" onClick={() => handleAction(action)}>{action.ctaText}</Button>
          </Card>
        ))}
      </List>
      <Footer>
        <Button variant="ghost" onClick={handleSnoozeAll}>Напомнить позже</Button>
      </Footer>

      {callReportFor && (
        <CallReportModal orderId={callReportFor} onClose={() => setCallReportFor(null)} />
      )}
    </Modal>
  );
}
```

Монтируется в главном экране PWA (`/home`) — проверить файл при имплементации (вероятно `artifacts/master-pwa/src/pages/home.tsx`).

### Компонент `CallReportModal`

```tsx
export function CallReportModal({ orderId, onClose }) {
  const [mode, setMode] = useState<"scheduled" | "no_contact">("scheduled");
  const [scheduledAt, setScheduledAt] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    const body = mode === "scheduled"
      ? { scheduledAt: new Date(scheduledAt).toISOString(), note: note || null }
      : { scheduledAt: null, note };
    const r = await fetch(`/api/master-pwa/orders/${orderId}/call-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      queryClient.invalidateQueries({ queryKey: ["/api/master-pwa/pending-actions"] });
      onClose();
    }
    setSaving(false);
  };

  return (
    <Modal>
      <RadioGroup value={mode} onChange={setMode}>
        <Radio value="scheduled">Замер согласован</Radio>
        <Radio value="no_contact">Не дозвонился / нужно ещё созвониться</Radio>
      </RadioGroup>
      {mode === "scheduled" ? (
        <DateTimePicker value={scheduledAt} onChange={setScheduledAt} />
      ) : null}
      <Textarea placeholder="Комментарий (необязательно)" value={note} onChange={e => setNote(e.target.value)} />
      <Button onClick={submit} disabled={saving}>Отправить</Button>
    </Modal>
  );
}
```

## Sequence: мастер отчитывается о созвоне

```
Master (PWA)                        api-server                     CRM (operator)
──────────────                      ───────────                    ──────────────
opens /home
                  GET /pending-actions ──────────►
                                    classify orders → R0 found
                  ◄────── [{orderId:42,type:"call_report"}]
shows banner

clicks "Отчитаться"
shows CallReportModal
fills date 15 июня 14:00, note "плитку выберем по фото"
                  POST /orders/42/call-report
                  body: {scheduledAt, note} ──────►
                                    UPDATE orders SET
                                      client_call_reported_at = NOW(),
                                      scheduled_at = '2026-06-15...'
                                    INSERT INTO master_messages
                                      (text: "📅 Замер согласован...")
                  ◄──────── {success:true}
modal closes, banner refreshes
                  GET /pending-actions ──────────►
                                    R0 no longer matches (call_reported_at set)
                  ◄────── []
banner hidden
                                                                   sees in master-chat:
                                                                   "📅 Замер согласован 15 июня 14:00"
                                                                   sees order moved out of
                                                                   "Нет отчёта" stuck-bucket
```

## План регрессии / что не должно сломаться

1. **`ActionItemsBlock`** удаляется из дашборда, но компонент и endpoint `/api/dashboard-action-items` остаются — на случай ссылок из других мест. Помечаются deprecated в комментарии.
2. **Существующие endpoints orders** не трогаем. `PATCH /api/orders/:id` уже умеет всё, что нужно для подтверждения суммы (R2).
3. **Push-инфраструктура** (`sendPushToMaster`) переиспользуется без изменений.
4. **MasterDrawer** в CRM — переиспользуется на странице `/orders/stuck` через ту же логику, что в `checkins.tsx` (fetch /api/masters/:id → setDrawerMaster).
5. **Frontend каталог `master-pwa`** — нужно проверить, существует ли отдельный пакет или PWA живёт в `marketplace` / `crm`. Если в новом пакете — добавить туда; если внутри marketplace — там же.

## Открытые вопросы / решения для уточнения при имплементации

1. **`master_messages.order_id`** — добавлять или нет для точного определения активности по заказу. Решение: пока не добавляем, активность считаем грубо (последнее сообщение мастера за 14 дней по любому заказу — значит живой). Если будет много false-positive zombie, добавим колонку отдельной миграцией.
2. **Где регистрируется cron**. Проверить `artifacts/api-server/src/index.ts` — обычно cron запускается через `setInterval` или `node-cron`. В imple-фазе.
3. **Куда монтируется баннер в PWA**. Проверить структуру master-pwa в имплементации — уверен в существовании компонента home, но точное место TBD.
4. **`orders-stuck.tsx` маршрут** — в `App.tsx` CRM уже есть pattern регистрации страниц. Подключим.

## Out-of-scope в этом дизайне

- Уведомления оператору, когда зомби достигает 30 дней (эскалация).
- Автоматическая отмена заказа после N дней зомби.
- Конфигурируемые пороги (1 / 7 / 14) — пока хардкод констант в `lib/stuckOrders.ts`. Вынос в `system_settings` — отдельной задачей.
