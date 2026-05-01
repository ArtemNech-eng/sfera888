import { Router } from "express";
import { db, ordersTable, mastersTable, leadsTable, receiptsTable, avitoSettingsTable, chatCasesTable, systemTasksTable } from "@workspace/db";
import { desc, isNull, eq, and } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth.js";

const NEXT_ACTION_RU: Record<string, string> = {
  call_master: "Позвонить мастеру",
  message_master: "Написать мастеру",
  call_client: "Позвонить клиенту",
  reassign: "Переназначить мастера",
  cancel_order: "Отменить заказ",
  return_to_pool: "Вернуть в пул",
  resend: "Повторно разослать",
  resolve: "Пометить выполненной",
  block_master: "Заблокировать мастера",
  manual_control: "Перевести в ручной контроль",
  review: "Проверить",
  wait: "Ожидать",
};

const router = Router();
const ops = requireRole("admin", "master_operator", "lead_operator");

type Priority = "critical" | "high" | "medium" | "low";
type Status = "open" | "in_progress" | "done" | "dismissed";
type TaskType = "no_estimate" | "no_payment" | "no_master_response" | "no_progress" | "low_avito_balance" | "blocked_master" | "possible_bypass" | "conflict" | "no_manager_id" | "custom_manual";

type Item = {
  id: string;
  type: string;
  priority: Priority;
  title: string;
  shortDescription: string;
  fullDescription: string;
  createdAt: string;
  updatedAt: string;
  lastActionBy: string | null;
  deadline: string | null;
  status: Status;
  entityType: string;
  entityId: string | number | null;
  orderId: string | number | null;
  masterId: string | number | null;
  clientId: string | number | null;
  city: string | null;
  amountAtRisk: number | null;
  assigneeId?: string | number | null;
  assigneeName?: string | null;
  actions: { key: string; label: string; style: "primary" | "secondary" | "danger" | "ghost" }[];
};

const actionToRoute = {
  message_master: "/master-chat",
  call_client: "/leads",
  reassign: "/orders",
  cancel_order: "/orders",
  return_to_pool: "/orders",
  resolve: "/tasks",
  dismiss: "/tasks",
  update_balance: "/finance",
  manual_unblock: "/masters",
  block_master: "/masters",
  manual_control: "/orders",
  open_issue_order: "/orders",
  resend: "/dispatch",
  call_master: "/master-chat",
} as const;

function pFromHours(hours: number): Priority {
  if (hours >= 48) return "critical";
  if (hours >= 24) return "high";
  if (hours >= 8) return "medium";
  return "low";
}

function withinPeriod(createdAt: string, period?: string) {
  if (!period || period === "all") return true;
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  const days = { today: 1, week: 7, month: 30, quarter: 90 } as const;
  const limit = days[period as keyof typeof days];
  if (!limit) return true;
  return now - created <= limit * 24 * 60 * 60 * 1000;
}

function matchesFilters(item: Item, filters: { period?: string; city?: string; priority?: string; status?: string }) {
  if (filters.period && !withinPeriod(item.createdAt, filters.period)) return false;
  if (filters.city && filters.city !== "all" && item.city !== filters.city) return false;
  if (filters.priority && filters.priority !== "all" && item.priority !== filters.priority) return false;
  if (filters.status && filters.status !== "all" && item.status !== filters.status) return false;
  return true;
}

function actionSet(type: TaskType) {
  if (type === "no_estimate") return [{ key: "message_master", label: "Написать мастеру", style: "primary" as const }, { key: "call_master", label: "Позвонить мастеру", style: "secondary" as const }, { key: "reassign", label: "Переназначить", style: "secondary" as const }, { key: "cancel_order", label: "Отменить заказ", style: "danger" as const }, { key: "resolve", label: "Пометить задачу выполненной", style: "secondary" as const }];
  if (type === "no_payment") return [{ key: "message_master", label: "Напомнить мастеру", style: "primary" as const }, { key: "call_client", label: "Позвонить клиенту", style: "secondary" as const }, { key: "return_to_pool", label: "Вернуть в пул", style: "secondary" as const }, { key: "cancel_order", label: "Отменить заказ", style: "danger" as const }, { key: "resolve", label: "Пометить выполненной", style: "secondary" as const }];
  if (type === "no_master_response") return [{ key: "message_master", label: "Написать мастеру", style: "primary" as const }, { key: "resend", label: "Повторно разослать", style: "secondary" as const }, { key: "reassign", label: "Назначить вручную", style: "secondary" as const }, { key: "cancel_order", label: "Отменить заказ", style: "danger" as const }];
  if (type === "blocked_master") return [{ key: "message_master", label: "Написать мастеру", style: "primary" as const }, { key: "manual_unblock", label: "Разблокировать вручную", style: "danger" as const }, { key: "open_issue_order", label: "Открыть проблемный заказ", style: "secondary" as const }, { key: "resolve", label: "Пометить как проверено", style: "secondary" as const }];
  if (type === "low_avito_balance") return [{ key: "update_balance", label: "Обновить баланс вручную", style: "primary" as const }, { key: "resolve", label: "Пометить как решено", style: "secondary" as const }];
  if (type === "possible_bypass" || type === "conflict") return [{ key: "message_master", label: "Написать мастеру", style: "primary" as const }, { key: "block_master", label: "Заблокировать мастера", style: "danger" as const }, { key: "manual_control", label: "Перевести заказ в ручной контроль", style: "secondary" as const }, { key: "resolve", label: "Пометить как проверено", style: "secondary" as const }];
  if (type === "no_manager_id") return [{ key: "reassign", label: "Назначить менеджера", style: "primary" as const }, { key: "resolve", label: "Пометить выполненной", style: "secondary" as const }];
  return [{ key: "resolve", label: "Пометить выполненной", style: "secondary" as const }, { key: "dismiss", label: "Отложить", style: "ghost" as const }];
}

async function buildItems(): Promise<Item[]> {
  const items: Item[] = [];
  const now = new Date();
  const [orders, masters, leads, receipts, cases, avitoRows, manualTasks] = await Promise.all([
    db.select({ id: ordersTable.id, leadId: ordersTable.leadId, masterId: ordersTable.masterId, city: ordersTable.city, status: ordersTable.status, proposedAmount: ordersTable.proposedAmount, orderAmount: ordersTable.orderAmount, createdAt: ordersTable.createdAt, updatedAt: ordersTable.updatedAt, cancelReason: ordersTable.cancelReason }).from(ordersTable).where(isNull(ordersTable.deletedAt)),
    db.select({ id: mastersTable.id, alias: mastersTable.alias, city: mastersTable.city, status: mastersTable.status, createdAt: mastersTable.createdAt }).from(mastersTable).where(isNull(mastersTable.deletedAt)),
    db.select({ id: leadsTable.id, clientName: leadsTable.clientName, city: leadsTable.city, createdAt: leadsTable.createdAt }).from(leadsTable).where(isNull(leadsTable.deletedAt)),
    db.select({ id: receiptsTable.id, orderId: receiptsTable.orderId, masterId: receiptsTable.masterId, city: receiptsTable.city, prepaymentSubmittedAt: receiptsTable.prepaymentSubmittedAt, prepaymentSeenAt: receiptsTable.prepaymentSeenAt, prepaymentAmount: receiptsTable.prepaymentAmount }).from(receiptsTable),
    db.select().from(chatCasesTable).orderBy(desc(chatCasesTable.updatedAt)).limit(50),
    db.select().from(avitoSettingsTable).limit(1),
    db.select().from(systemTasksTable).orderBy(desc(systemTasksTable.createdAt)).limit(50),
  ]);
  const leadMap = new Map(leads.map((l: any) => [l.id, l]));
  for (const o of orders) {
    const ageH = (now.getTime() - new Date(o.createdAt).getTime()) / 3600000;
    const lead = leadMap.get(o.leadId!) as any;
    if (!(o.proposedAmount != null && Number(o.proposedAmount) > 0) && ageH >= 24) items.push({ id: `no_estimate-${o.id}`, type: "no_estimate", priority: pFromHours(ageH), title: `Заказ #${o.id} — нет сметы`, shortDescription: `${lead?.clientName ?? "Клиент"} · ${o.city ?? ""}`.trim(), fullDescription: `У заказа нет сметы уже ${Math.round(ageH)} ч.`, createdAt: new Date(o.createdAt).toISOString(), updatedAt: new Date(o.updatedAt ?? o.createdAt).toISOString(), lastActionBy: null, deadline: null, status: "open", entityType: "order", entityId: o.id, orderId: o.id, masterId: o.masterId ?? null, clientId: o.leadId ?? null, city: o.city ?? null, amountAtRisk: o.orderAmount ? Number(o.orderAmount) : null, actions: actionSet("no_estimate") });
    if (o.status === "waiting_master") items.push({ id: `no_master_response-${o.id}`, type: "no_master_response", priority: pFromHours(ageH), title: `Заказ #${o.id} — нет отклика мастера`, shortDescription: `${lead?.clientName ?? "Клиент"} · ${o.city ?? ""}`.trim(), fullDescription: `Заказ завис без отклика мастера ${Math.round(ageH)} ч.`, createdAt: new Date(o.createdAt).toISOString(), updatedAt: new Date(o.updatedAt ?? o.createdAt).toISOString(), lastActionBy: null, deadline: null, status: "open", entityType: "order", entityId: o.id, orderId: o.id, masterId: o.masterId ?? null, clientId: o.leadId ?? null, city: o.city ?? null, amountAtRisk: o.orderAmount ? Number(o.orderAmount) : null, actions: actionSet("no_master_response") });
    if (o.proposedAmount && !o.orderAmount && ageH >= 24) items.push({ id: `no_payment-${o.id}`, type: "no_payment", priority: pFromHours(ageH), title: `Заказ #${o.id} — не оплачена предоплата`, shortDescription: `${o.city ?? ""}`.trim(), fullDescription: `Есть сумма ${o.proposedAmount}, но заказ ещё без оплаты.`, createdAt: new Date(o.createdAt).toISOString(), updatedAt: new Date(o.updatedAt ?? o.createdAt).toISOString(), lastActionBy: null, deadline: null, status: "open", entityType: "finance", entityId: o.id, orderId: o.id, masterId: o.masterId ?? null, clientId: o.leadId ?? null, city: o.city ?? null, amountAtRisk: Number(o.proposedAmount), actions: actionSet("no_payment") });
    if (ageH >= 168) items.push({ id: `no_progress-${o.id}`, type: "no_progress", priority: "medium", title: `Заказ #${o.id} — нет движения`, shortDescription: `${Math.round(ageH)} ч без обновлений`, fullDescription: `Заказ без движения более 7 дней.`, createdAt: new Date(o.createdAt).toISOString(), updatedAt: new Date(o.updatedAt ?? o.createdAt).toISOString(), lastActionBy: null, deadline: null, status: "open", entityType: "order", entityId: o.id, orderId: o.id, masterId: o.masterId ?? null, clientId: o.leadId ?? null, city: o.city ?? null, amountAtRisk: o.orderAmount ? Number(o.orderAmount) : null, actions: actionSet("no_progress") });
    if (String(o.cancelReason ?? "").toLowerCase().includes("bypass")) items.push({ id: `possible_bypass-${o.id}`, type: "possible_bypass", priority: "high", title: `Заказ #${o.id} — подозрение на обход`, shortDescription: `${o.city ?? ""}`.trim(), fullDescription: `В заказе есть признаки обхода сценария или ручного ухода в сторонний канал.`, createdAt: new Date(o.updatedAt ?? o.createdAt).toISOString(), updatedAt: new Date(o.updatedAt ?? o.createdAt).toISOString(), lastActionBy: null, deadline: null, status: "open", entityType: "order", entityId: o.id, orderId: o.id, masterId: o.masterId ?? null, clientId: o.leadId ?? null, city: o.city ?? null, amountAtRisk: o.orderAmount ? Number(o.orderAmount) : null, actions: actionSet("possible_bypass") });
  }
  for (const r of receipts) if (r.prepaymentSubmittedAt && !r.prepaymentSeenAt) { const ageH = (now.getTime() - new Date(r.prepaymentSubmittedAt).getTime()) / 3600000; items.push({ id: `no_payment-${r.id}`, type: "no_payment", priority: pFromHours(ageH), title: `Смета #${r.id} — подтверждение оплаты`, shortDescription: `${r.city ?? ""}`.trim(), fullDescription: `Клиент подтвердил оплату ${Math.round(ageH)} ч назад.`, createdAt: new Date(r.prepaymentSubmittedAt).toISOString(), updatedAt: new Date(r.prepaymentSubmittedAt).toISOString(), lastActionBy: null, deadline: null, status: "open", entityType: "finance", entityId: r.id, orderId: r.orderId, masterId: r.masterId, clientId: null, city: r.city ?? null, amountAtRisk: Number(r.prepaymentAmount ?? 0), actions: actionSet("no_payment") }); }
  for (const m of masters) { const status = String(m.status ?? "").toLowerCase(); if (status.includes("blocked") || status.includes("fomo_blocked")) items.push({ id: `blocked_master-${m.id}`, type: "blocked_master", priority: "critical", title: `Мастер ${m.alias} заблокирован`, shortDescription: `${m.city ?? ""}`.trim(), fullDescription: `Мастер в блокировке / FOMO_BLOCKED и требует проверки.`, createdAt: new Date(m.createdAt).toISOString(), updatedAt: new Date(m.createdAt).toISOString(), lastActionBy: null, deadline: null, status: "open", entityType: "master", entityId: m.id, orderId: null, masterId: m.id, clientId: null, city: m.city ?? null, amountAtRisk: null, actions: actionSet("blocked_master") }); }
  const balance = avitoRows[0] as any;
  if (balance && Number(balance.manualBalance ?? 0) < 1000) items.push({ id: "low_avito_balance-1", type: "low_avito_balance", priority: "high", title: "Баланс Avito ниже нормы", shortDescription: `Текущий баланс: ${Number(balance.manualBalance ?? 0).toLocaleString("ru-RU")} ₽`, fullDescription: "Баланс Avito ниже рекомендуемого порога.", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastActionBy: null, deadline: null, status: "open", entityType: "finance", entityId: balance.id ?? null, orderId: null, masterId: null, clientId: null, city: null, amountAtRisk: null, actions: actionSet("low_avito_balance") });
  for (const c of cases) { const risk = String((c as any).riskLevel ?? (c as any).risk ?? ""); if (risk === "red" || risk === "yellow") { const rawNext = String((c as any).nextAction ?? ""); const nextRu = NEXT_ACTION_RU[rawNext] ?? (rawNext || "Требует внимания"); items.push({ id: `case-${(c as any).id}`, type: risk === "red" ? "possible_bypass" : "conflict", priority: risk === "red" ? "critical" : "high", title: String((c as any).summary ?? (c as any).title ?? "Кейс"), shortDescription: nextRu, fullDescription: String((c as any).summary ?? ""), createdAt: new Date((c as any).updatedAt ?? now).toISOString(), updatedAt: new Date((c as any).updatedAt ?? now).toISOString(), lastActionBy: (c as any).lastActionBy ?? null, deadline: null, status: "open", entityType: "system", entityId: (c as any).id, orderId: (c as any).orderId ?? null, masterId: (c as any).masterId ?? null, clientId: null, city: null, amountAtRisk: null, actions: actionSet(risk === "red" ? "possible_bypass" : "conflict") }); } }
  for (const t of manualTasks) if ((t as any).status !== "done" && (t as any).status !== "dismissed") items.push({ id: `manual-${(t as any).id}`, type: "custom_manual", priority: "low", title: String((t as any).title ?? "Ручная задача"), shortDescription: String((t as any).description ?? ""), fullDescription: String((t as any).description ?? ""), createdAt: new Date((t as any).createdAt ?? now).toISOString(), updatedAt: new Date((t as any).updatedAt ?? t.createdAt ?? now).toISOString(), lastActionBy: (t as any).lastActionBy ?? null, deadline: (t as any).dueAt ? new Date((t as any).dueAt).toISOString() : null, status: (t as any).status ?? "open", entityType: "system", entityId: (t as any).id, orderId: (t as any).relatedOrderId ?? null, masterId: (t as any).relatedMasterId ?? null, clientId: null, city: null, amountAtRisk: null, actions: actionSet("custom_manual") });
  items.sort((a,b)=>({critical:0,high:1,medium:2,low:3}[a.priority]-({critical:0,high:1,medium:2,low:3}[b.priority])) || ((a.deadline?new Date(a.deadline).getTime():Number.MAX_SAFE_INTEGER)-(b.deadline?new Date(b.deadline).getTime():Number.MAX_SAFE_INTEGER)) || (new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()));
  return items;
}

async function orchestrateDashboardAction(action: string, item: Item, payload: any) {
  const route = actionToRoute[action as keyof typeof actionToRoute] ?? "/tasks";

  if (action === "update_balance" && payload.balance != null) {
    const rows = await db.select().from(avitoSettingsTable).limit(1);
    if (rows[0]) {
      await db.update(avitoSettingsTable)
        .set({ advanceBalance: Number(payload.balance) } as any)
        .where(eq(avitoSettingsTable.id, (rows[0] as any).id));
    }
  }

  if (action === "cancel_order" && item.orderId != null) {
    await db.update(ordersTable)
      .set({ status: "cancelled", cancelReason: "crm_manual", updatedAt: new Date() } as any)
      .where(eq(ordersTable.id, Number(item.orderId)));
  }

  if (action === "return_to_pool" && item.orderId != null) {
    await db.update(ordersTable)
      .set({ masterId: null, status: "waiting_master", updatedAt: new Date() } as any)
      .where(eq(ordersTable.id, Number(item.orderId)));
  }

  if (action === "manual_unblock" && item.masterId != null) {
    await db.update(mastersTable)
      .set({ status: "active", blockedAt: null, blockedReason: null } as any)
      .where(eq(mastersTable.id, Number(item.masterId)));
  }

  if (action === "block_master" && item.masterId != null) {
    await db.update(mastersTable)
      .set({ status: "blocked", blockedAt: new Date(), blockedReason: "crm_manual" } as any)
      .where(eq(mastersTable.id, Number(item.masterId)));
  }

  return { routedTo: route, applied: true, action, payload, itemId: item.id };
}

router.get("/action-items", ops, async (req: any, res: any) => {
  const { period = "all", city = "all", priority = "all", status = "all" } = req.query ?? {};
  const items = (await buildItems()).filter((item) => matchesFilters(item, { period: String(period), city: String(city), priority: String(priority), status: String(status) }));
  const summary = { critical: items.filter((i) => i.priority === "critical").length, high: items.filter((i) => i.priority === "high").length, medium: items.filter((i) => i.priority === "medium").length, low: items.filter((i) => i.priority === "low").length, doneToday: items.filter((i) => i.status === "done" && withinPeriod(i.createdAt, "today")).length };
  res.json({ summary, items });
});

router.get("/action-items/:id", ops, async (req: any, res: any) => {
  const items = await buildItems();
  const item = items.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Не найдено" });

  const ctx: Record<string, any> = {};

  if (item.masterId != null) {
    const [m] = await db.select({ id: mastersTable.id, alias: mastersTable.alias, phone: mastersTable.phone, city: mastersTable.city, status: mastersTable.status, blockedAt: (mastersTable as any).blockedAt, blockedReason: (mastersTable as any).blockedReason }).from(mastersTable).where(eq(mastersTable.id, Number(item.masterId))).limit(1);
    if (m) ctx.master = { id: m.id, name: m.alias, phone: (m as any).phone ?? null, city: m.city, status: m.status, blockedAt: (m as any).blockedAt ?? null, blockedReason: (m as any).blockedReason ?? null };
  }

  if (item.orderId != null) {
    const [o] = await db.select({ id: ordersTable.id, proposedAmount: ordersTable.proposedAmount, orderAmount: ordersTable.orderAmount, prepaymentAmount: ordersTable.prepaymentAmount, status: ordersTable.status, clientName: ordersTable.clientName, clientPhone: ordersTable.clientPhone, city: ordersTable.city, createdAt: ordersTable.createdAt }).from(ordersTable).where(eq(ordersTable.id, Number(item.orderId))).limit(1);
    if (o) {
      const ageH = Math.round((Date.now() - new Date(o.createdAt).getTime()) / 3600000);
      ctx.order = { id: o.id, proposedAmount: o.proposedAmount ? Number(o.proposedAmount) : null, orderAmount: o.orderAmount ? Number(o.orderAmount) : null, prepaymentAmount: o.prepaymentAmount ? Number(o.prepaymentAmount) : null, status: o.status, clientName: (o as any).clientName ?? null, clientPhone: (o as any).clientPhone ?? null, city: o.city, hoursOld: ageH };
    }
  }

  if (item.clientId != null) {
    const [l] = await db.select({ id: leadsTable.id, clientName: leadsTable.clientName, clientPhone: leadsTable.clientPhone, city: leadsTable.city }).from(leadsTable).where(eq(leadsTable.id, Number(item.clientId))).limit(1);
    if (l) ctx.client = l;
  }

  if (item.type === "no_master_response" || item.type === "no_estimate") {
    const avail = await db.select({ id: mastersTable.id, alias: mastersTable.alias, city: mastersTable.city, status: mastersTable.status }).from(mastersTable).where(and(eq(mastersTable.status, "active"), isNull(mastersTable.deletedAt))).limit(30);
    ctx.availableMasters = avail.map((m) => ({ id: m.id, name: m.alias ?? `Мастер #${m.id}`, city: m.city }));
  }

  if (item.type === "no_payment" && item.orderId != null) {
    const [r] = await db.select({ id: receiptsTable.id, prepaymentAmount: receiptsTable.prepaymentAmount, prepaymentSubmittedAt: receiptsTable.prepaymentSubmittedAt, prepaymentSeenAt: receiptsTable.prepaymentSeenAt, prepaymentScreenshotUrl: receiptsTable.prepaymentScreenshotUrl, clientName: receiptsTable.clientName, clientPhone: receiptsTable.clientPhone }).from(receiptsTable).where(eq(receiptsTable.orderId, Number(item.orderId))).limit(1);
    if (r) ctx.receipt = r;
  }

  if (item.type === "low_avito_balance") {
    const [av] = await db.select().from(avitoSettingsTable).limit(1);
    if (av) ctx.avitoBalance = (av as any).advanceBalance ?? 0;
  }

  res.json({ ...item, timeline: [], context: ctx, related: {}, notes: [] });
});

router.post("/action-items/:id/action", ops, async (req: any, res: any) => {
  const { action, payload = {} } = req.body ?? {};
  const items = await buildItems();
  const item = items.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Не найдено" });
  if (!["message_master", "call_client", "reassign", "cancel_order", "return_to_pool", "resolve", "dismiss", "update_balance", "manual_unblock", "call_master", "resend", "block_master", "manual_control", "open_issue_order"].includes(action)) return res.status(400).json({ error: "Недопустимое действие" });
  const result = await orchestrateDashboardAction(action, item, payload);
  res.json({ ...item, status: action === "dismiss" ? "dismissed" : action === "resolve" ? "done" : "in_progress", orchestration: result, timeline: [], context: {}, related: {}, notes: [] });
});

export default router;
export { buildItems };
