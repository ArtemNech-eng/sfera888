import { Router } from "express";
import { db, ordersTable, mastersTable, leadsTable, receiptsTable, avitoSettingsTable, chatCasesTable, systemTasksTable } from "@workspace/db";
import { and, desc, eq, gte, isNull, isNotNull, or, sql } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth.js";

const router = Router();
const ops = requireRole("admin", "master_operator", "lead_operator");

type Priority = "critical" | "high" | "medium" | "low";
type Status = "open" | "in_progress" | "done" | "dismissed";

type Item = {
  id: string;
  type: string;
  priority: Priority;
  title: string;
  shortDescription: string;
  fullDescription: string;
  createdAt: string;
  deadline: string | null;
  status: Status;
  entityType: string;
  entityId: string | number | null;
  orderId: string | number | null;
  masterId: string | number | null;
  clientId: string | number | null;
  city: string | null;
  amountAtRisk: number | null;
  actions: { key: string; label: string; style: "primary" | "secondary" | "danger" | "ghost" }[];
};

function pFromHours(hours: number): Priority {
  if (hours >= 48) return "critical";
  if (hours >= 24) return "high";
  if (hours >= 8) return "medium";
  return "low";
}

function actionSet(type: string) {
  if (type === "no_estimate") return [{ key: "message_master", label: "Написать мастеру", style: "primary" as const }, { key: "cancel_order", label: "Отменить заказ", style: "danger" as const }, { key: "resolve", label: "Пометить выполненной", style: "secondary" as const }];
  if (type === "no_payment") return [{ key: "message_master", label: "Напомнить мастеру", style: "primary" as const }, { key: "cancel_order", label: "Отменить заказ", style: "danger" as const }, { key: "resolve", label: "Пометить выполненной", style: "secondary" as const }];
  if (type === "no_master_response") return [{ key: "message_master", label: "Написать мастеру", style: "primary" as const }, { key: "reassign", label: "Назначить вручную", style: "secondary" as const }, { key: "cancel_order", label: "Отменить заказ", style: "danger" as const }];
  if (type === "blocked_master") return [{ key: "manual_unblock", label: "Разблокировать вручную", style: "danger" as const }, { key: "resolve", label: "Пометить как проверено", style: "secondary" as const }];
  if (type === "low_avito_balance") return [{ key: "update_balance", label: "Обновить баланс", style: "primary" as const }, { key: "resolve", label: "Пометить как решено", style: "secondary" as const }];
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

  const leadMap = new Map(leads.map(l => [l.id, l]));
  const masterMap = new Map(masters.map(m => [m.id, m]));

  for (const o of orders) {
    const ageH = (now.getTime() - new Date(o.createdAt).getTime()) / 3600000;
    if (o.status === "waiting_master") {
      const lead = leadMap.get(o.leadId!);
      items.push({ id: `no_master_response-${o.id}`, type: "no_master_response", priority: pFromHours(ageH), title: `Заказ #${o.id} — нет отклика мастера`, shortDescription: `${lead?.clientName ?? "Клиент"} · ${o.city ?? ""}`.trim(), fullDescription: `Заказ завис без отклика мастера ${Math.round(ageH)} ч.`, createdAt: new Date(o.createdAt).toISOString(), deadline: null, status: "open", entityType: "order", entityId: o.id, orderId: o.id, masterId: o.masterId ?? null, clientId: o.leadId ?? null, city: o.city ?? null, amountAtRisk: o.orderAmount ? Number(o.orderAmount) : null, actions: actionSet("no_master_response") });
    }
    if (o.proposedAmount && !o.orderAmount && ageH >= 24) {
      items.push({ id: `no_payment-${o.id}`, type: "no_payment", priority: pFromHours(ageH), title: `Заказ #${o.id} — не оплачена предоплата`, shortDescription: `${o.city ?? ""}`.trim(), fullDescription: `Есть сумма ${o.proposedAmount}, но заказ ещё без оплаты.`, createdAt: new Date(o.createdAt).toISOString(), deadline: null, status: "open", entityType: "finance", entityId: o.id, orderId: o.id, masterId: o.masterId ?? null, clientId: o.leadId ?? null, city: o.city ?? null, amountAtRisk: Number(o.proposedAmount), actions: actionSet("no_payment") });
    }
    if (ageH >= 168) items.push({ id: `no_progress-${o.id}`, type: "no_progress", priority: "medium", title: `Заказ #${o.id} — нет движения`, shortDescription: `${Math.round(ageH)} ч без обновлений`, fullDescription: `Заказ без движения более 7 дней.`, createdAt: new Date(o.createdAt).toISOString(), deadline: null, status: "open", entityType: "order", entityId: o.id, orderId: o.id, masterId: o.masterId ?? null, clientId: o.leadId ?? null, city: o.city ?? null, amountAtRisk: o.orderAmount ? Number(o.orderAmount) : null, actions: actionSet("no_progress") });
  }

  for (const r of receipts) {
    if (r.prepaymentSubmittedAt && !r.prepaymentSeenAt) {
      const ageH = (now.getTime() - new Date(r.prepaymentSubmittedAt).getTime()) / 3600000;
      items.push({ id: `no_payment-${r.id}`, type: "no_payment", priority: pFromHours(ageH), title: `Смета #${r.id} — подтверждение оплаты`, shortDescription: `${r.city ?? ""}`.trim(), fullDescription: `Клиент подтвердил оплату ${Math.round(ageH)} ч назад.`, createdAt: new Date(r.prepaymentSubmittedAt).toISOString(), deadline: null, status: "open", entityType: "finance", entityId: r.id, orderId: r.orderId, masterId: r.masterId, clientId: null, city: r.city ?? null, amountAtRisk: Number(r.prepaymentAmount ?? 0), actions: actionSet("no_payment") });
    }
  }

  for (const m of masters) {
    if ((m.status ?? "").includes("blocked")) items.push({ id: `blocked_master-${m.id}`, type: "blocked_master", priority: "critical", title: `Мастер ${m.alias} заблокирован`, shortDescription: `${m.city ?? ""}`.trim(), fullDescription: `Мастер в блокировке и требует проверки.`, createdAt: new Date(m.createdAt).toISOString(), deadline: null, status: "open", entityType: "master", entityId: m.id, orderId: null, masterId: m.id, clientId: null, city: m.city ?? null, amountAtRisk: null, actions: actionSet("blocked_master") });
  }

  const balance = avitoRows[0] as any;
  if (balance) {
    const current = Number(balance.manualBalance ?? 0);
    if (current < 1000) items.push({ id: "low_avito_balance-1", type: "low_avito_balance", priority: "high", title: "Баланс Avito ниже нормы", shortDescription: `Текущий баланс: ${current.toLocaleString("ru-RU")} ₽`, fullDescription: "Баланс Avito ниже рекомендуемого порога.", createdAt: new Date().toISOString(), deadline: null, status: "open", entityType: "finance", entityId: balance.id ?? null, orderId: null, masterId: null, clientId: null, city: null, amountAtRisk: null, actions: actionSet("low_avito_balance") });
  }

  for (const c of cases) {
    const risk = String((c as any).riskLevel ?? (c as any).risk ?? "");
    if (risk === "red" || risk === "yellow") items.push({ id: `case-${(c as any).id}`, type: risk === "red" ? "possible_bypass" : "conflict", priority: risk === "red" ? "critical" : "high", title: String((c as any).summary ?? (c as any).title ?? "Кейс"), shortDescription: String((c as any).nextAction ?? "Требует внимания"), fullDescription: String((c as any).summary ?? ""), createdAt: new Date((c as any).updatedAt ?? now).toISOString(), deadline: null, status: "open", entityType: "system", entityId: (c as any).id, orderId: (c as any).orderId ?? null, masterId: (c as any).masterId ?? null, clientId: null, city: null, amountAtRisk: null, actions: actionSet(risk === "red" ? "possible_bypass" : "conflict") });
  }

  for (const t of manualTasks) {
    if ((t as any).status === "done" || (t as any).status === "dismissed") continue;
    items.push({ id: `manual-${(t as any).id}`, type: "custom_manual", priority: "low", title: String((t as any).title ?? "Ручная задача"), shortDescription: String((t as any).description ?? ""), fullDescription: String((t as any).description ?? ""), createdAt: new Date((t as any).createdAt ?? now).toISOString(), deadline: (t as any).dueAt ? new Date((t as any).dueAt).toISOString() : null, status: (t as any).status ?? "open", entityType: "system", entityId: (t as any).id, orderId: (t as any).relatedOrderId ?? null, masterId: (t as any).relatedMasterId ?? null, clientId: null, city: null, amountAtRisk: null, actions: actionSet("custom_manual") });
  }

  items.sort((a, b) => {
    const o = { critical: 0, high: 1, medium: 2, low: 3 } as const;
    const pa = o[a.priority]; const pb = o[b.priority];
    if (pa !== pb) return pa - pb;
    const da = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER;
    const dbb = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER;
    if (da !== dbb) return da - dbb;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  return items;
}

router.get("/action-items", ops, async (req, res) => {
  const items = await buildItems();
  const summary = { critical: items.filter(i => i.priority === "critical").length, high: items.filter(i => i.priority === "high").length, medium: items.filter(i => i.priority === "medium").length, low: items.filter(i => i.priority === "low").length, doneToday: 0 };
  res.json({ summary, items });
});

router.get("/action-items/:id", ops, async (req, res) => {
  const items = await buildItems();
  const item = items.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Не найдено" });
  res.json({ ...item, timeline: [], context: {}, related: {}, notes: [] });
});

router.post("/action-items/:id/action", ops, async (req, res) => {
  const { action } = req.body ?? {};
  const items = await buildItems();
  const item = items.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Не найдено" });
  if (!["resolve", "dismiss", "cancel_order", "return_to_pool", "update_balance", "manual_unblock", "reassign", "message_master", "call_client"].includes(action)) {
    return res.status(400).json({ error: "Недопустимое действие" });
  }
  res.json({ ...item, status: action === "dismiss" ? "dismissed" : action === "resolve" ? "done" : "in_progress" });
});

export default router;
export { buildItems };
