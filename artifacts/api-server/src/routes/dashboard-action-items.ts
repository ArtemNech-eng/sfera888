import { Router } from "express";
import { db, ordersTable, mastersTable, leadsTable, receiptsTable, avitoSettingsTable, chatCasesTable, systemTasksTable, masterMessagesTable, transactionsTable, transactionPaymentsTable, taskSnoozesTable } from "@workspace/db";
import { desc, isNull, eq, and, sql, not, inArray, lte, gt } from "drizzle-orm";
import { sendMaxMessage } from "../maxBot.js";
import { sendPushToMaster } from "../lib/push.js";
import { requireRole } from "../middlewares/requireAuth.js";
import { recordOrderCancelled } from "../lib/masterReputation.js";
import { recordOrderCompleted } from "../lib/masterReputation.js";
import { calculateCommission, getCommissionSettings } from "../lib/commission.js";

declare const console: any;

const NEXT_ACTION_RU: Record<string, string> = {
  call_master: "Позвонить мастеру",
  message_master: "Написать мастеру",
  call_client: "Позвонить клиенту",
  reassign: "Переназначить мастера",
  cancel_order: "Отменить заказ",
  cancel_as_master: "Отменить как мастер (влияет на рейтинг)",
  complete_as_master: "Завершить заказ как выполненный (оплата комиссии засчитана)",
  return_to_pool: "Вернуть в пул",
  resend: "Повторно разослать",
  resolve: "Пометить выполненной",
  block_master: "Заблокировать мастера",
  manual_control: "Перевести в ручной контроль",
  review: "Проверить",
  wait: "Ожидать",
  ask_master_status: "Уточнить статус у мастера",
  remind_master_estimate: "Напомнить мастеру о смете",
  remind_master_payment: "Напомнить мастеру об оплате",
  review_for_cancel: "Проверить — возможна отмена",
  review_for_reassign: "Проверить — возможно переназначение",
  no_action: "Ожидать",
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
  masterName?: string | null;
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
  cancel_as_master: "/orders",
  complete_as_master: "/orders",
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

function fmtAge(hours: number): string {
  if (hours >= 48) {
    const days = Math.round(hours / 24);
    return `${days} д`;
  }
  return `${Math.round(hours)} ч`;
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
  if (type === "possible_bypass" || type === "conflict") return [{ key: "message_master", label: "Написать мастеру", style: "primary" as const }, { key: "complete_as_master", label: "Завершить как выполненный (только admin)", style: "secondary" as const }, { key: "cancel_as_master", label: "Отменить заказ (вина мастера)", style: "danger" as const }, { key: "block_master", label: "Заблокировать мастера", style: "danger" as const }, { key: "manual_control", label: "Перевести заказ в ручной контроль", style: "secondary" as const }, { key: "resolve", label: "Пометить как проверено", style: "secondary" as const }];
  if (type === "no_manager_id") return [{ key: "reassign", label: "Назначить менеджера", style: "primary" as const }, { key: "resolve", label: "Пометить выполненной", style: "secondary" as const }];
  return [{ key: "resolve", label: "Пометить выполненной", style: "secondary" as const }, { key: "dismiss", label: "Отложить", style: "ghost" as const }];
}

async function buildItems(): Promise<Item[]> {
  const items: Item[] = [];
  const now = new Date();
  const [orders, masters, leads, receipts, cases, avitoRows, manualTasks, txRows] = await Promise.all([
    db.select({ id: ordersTable.id, leadId: ordersTable.leadId, masterId: ordersTable.masterId, city: ordersTable.city, status: ordersTable.status, proposedAmount: ordersTable.proposedAmount, orderAmount: ordersTable.orderAmount, createdAt: ordersTable.createdAt, updatedAt: ordersTable.updatedAt, assignedAt: ordersTable.assignedAt, cancelReason: ordersTable.cancelReason }).from(ordersTable).where(and(isNull(ordersTable.deletedAt), not(inArray(ordersTable.status, ["completed", "cancelled"])))),
    db.select({ id: mastersTable.id, alias: mastersTable.alias, city: mastersTable.city, status: mastersTable.status, createdAt: mastersTable.createdAt }).from(mastersTable).where(isNull(mastersTable.deletedAt)),
    db.select({ id: leadsTable.id, clientName: leadsTable.clientName, clientPhone: leadsTable.clientPhone, city: leadsTable.city, createdAt: leadsTable.createdAt }).from(leadsTable).where(isNull(leadsTable.deletedAt)),
    db.select({ id: receiptsTable.id, orderId: receiptsTable.orderId, masterId: receiptsTable.masterId, city: receiptsTable.city, prepaymentSubmittedAt: receiptsTable.prepaymentSubmittedAt, prepaymentSeenAt: receiptsTable.prepaymentSeenAt, prepaymentAmount: receiptsTable.prepaymentAmount }).from(receiptsTable),
    db.select().from(chatCasesTable).where(eq(chatCasesTable.isArchived, false)).orderBy(desc(chatCasesTable.updatedAt)).limit(50),
    db.select().from(avitoSettingsTable).limit(1),
    db.select().from(systemTasksTable).orderBy(desc(systemTasksTable.createdAt)).limit(50),
    db.select({ orderId: transactionsTable.orderId, orderAmount: transactionsTable.orderAmount }).from(transactionsTable),
  ]);
  const leadMap = new Map(leads.map((l: any) => [l.id, l]));
  const orderMap = new Map(orders.map((o: any) => [o.id, o]));
  const masterMap = new Map(masters.map((m: any) => [m.id, m]));
  // Orders that already have a receipt with prepaymentAmount > 0 — estimate was effectively sent
  const receiptOrderIds = new Set(receipts.filter((r: any) => Number(r.prepaymentAmount ?? 0) > 0).map((r: any) => Number(r.orderId)).filter(Boolean));
  // Orders that already have a receipt with prepaymentSubmittedAt — client already paid, receipt task will handle it
  const receiptSubmittedOrderIds = new Set(receipts.filter((r: any) => r.prepaymentSubmittedAt != null).map((r: any) => Number(r.orderId)).filter(Boolean));
  // Orders that already have a transaction with orderAmount > 0 — estimate definitely exists
  const txOrderIds = new Set(txRows.filter((t: any) => Number(t.orderAmount ?? 0) > 0).map((t: any) => Number(t.orderId)).filter(Boolean));
  for (const o of orders) {
    const ageH = (now.getTime() - new Date(o.createdAt).getTime()) / 3600000;
    // For no_estimate: count from assignedAt (when current master was assigned), not from order creation.
    // This prevents stale "2 days without estimate" when order was returned to pool and reassigned.
    const estimateAgeH = o.assignedAt
      ? (now.getTime() - new Date(o.assignedAt).getTime()) / 3600000
      : (now.getTime() - new Date(o.updatedAt ?? o.createdAt).getTime()) / 3600000;
    const lead = leadMap.get(o.leadId!) as any;
    const clientLabel = lead?.clientName ? `${lead.clientName} · ${o.city ?? ""}` : (o.city ?? "");
    // no_estimate: proposedAmount missing AND no receipt AND no transaction with amount
    const hasEstimate = (o.proposedAmount != null && Number(o.proposedAmount) > 0)
      || receiptOrderIds.has(Number(o.id))
      || txOrderIds.has(Number(o.id));
    if (!hasEstimate && estimateAgeH >= 24) items.push({ id: `no_estimate-${o.id}`, type: "no_estimate", priority: pFromHours(estimateAgeH), title: `Заказ #${o.id} — нет сметы`, shortDescription: clientLabel.trim(), fullDescription: `У заказа нет сметы уже ${fmtAge(estimateAgeH)}.`, createdAt: new Date(o.assignedAt ?? o.updatedAt ?? o.createdAt).toISOString(), updatedAt: new Date(o.updatedAt ?? o.createdAt).toISOString(), lastActionBy: null, deadline: null, status: "open", entityType: "order", entityId: o.id, orderId: o.id, masterId: o.masterId ?? null, clientId: o.leadId ?? null, city: o.city ?? null, masterName: o.masterId != null ? (masterMap.get(Number(o.masterId))?.alias ?? null) : null, amountAtRisk: o.orderAmount ? Number(o.orderAmount) : null, actions: actionSet("no_estimate") });
    if (o.status === "waiting_master") items.push({ id: `no_master_response-${o.id}`, type: "no_master_response", priority: pFromHours(ageH), title: `Заказ #${o.id} — нет отклика мастера`, shortDescription: clientLabel.trim(), fullDescription: `Заказ завис без отклика мастера ${fmtAge(ageH)}.`, createdAt: new Date(o.createdAt).toISOString(), updatedAt: new Date(o.updatedAt ?? o.createdAt).toISOString(), lastActionBy: null, deadline: null, status: "open", entityType: "order", entityId: o.id, orderId: o.id, masterId: o.masterId ?? null, clientId: o.leadId ?? null, city: o.city ?? null, masterName: o.masterId != null ? (masterMap.get(Number(o.masterId))?.alias ?? null) : null, amountAtRisk: o.orderAmount ? Number(o.orderAmount) : null, actions: actionSet("no_master_response") });
    // no_payment: смета есть, заказ не оплачен (orderAmount = null), ждём >= 24ч
    // Дедупликация: если для этого orderId есть receipt с prepaymentSubmittedAt — не добавляем из orders,
    // потому что receipt-задача (подтверждение оплаты) точнее и приоритетнее
    if (o.proposedAmount && !o.orderAmount && ageH >= 24 && !receiptSubmittedOrderIds.has(Number(o.id))) items.push({ id: `no_payment-${o.id}`, type: "no_payment", priority: pFromHours(ageH), title: `Заказ #${o.id} — не оплачена предоплата`, shortDescription: clientLabel.trim(), fullDescription: `Смета ${Number(o.proposedAmount).toLocaleString("ru-RU")} ₽ отправлена, ожидаем оплату ${fmtAge(ageH)}.`, createdAt: new Date(o.createdAt).toISOString(), updatedAt: new Date(o.updatedAt ?? o.createdAt).toISOString(), lastActionBy: null, deadline: null, status: "open", entityType: "finance", entityId: o.id, orderId: o.id, masterId: o.masterId ?? null, clientId: o.leadId ?? null, city: o.city ?? null, masterName: o.masterId != null ? (masterMap.get(Number(o.masterId))?.alias ?? null) : null, amountAtRisk: Number(o.proposedAmount), actions: actionSet("no_payment") });
    if (ageH >= 168) items.push({ id: `no_progress-${o.id}`, type: "no_progress", priority: "medium", title: `Заказ #${o.id} — нет движения`, shortDescription: `${fmtAge(ageH)} без обновлений`, fullDescription: `Заказ без движения уже ${fmtAge(ageH)}.`, createdAt: new Date(o.createdAt).toISOString(), updatedAt: new Date(o.updatedAt ?? o.createdAt).toISOString(), lastActionBy: null, deadline: null, status: "open", entityType: "order", entityId: o.id, orderId: o.id, masterId: o.masterId ?? null, clientId: o.leadId ?? null, city: o.city ?? null, masterName: o.masterId != null ? (masterMap.get(Number(o.masterId))?.alias ?? null) : null, amountAtRisk: o.orderAmount ? Number(o.orderAmount) : null, actions: actionSet("no_progress") });
    // possible_bypass из cancelReason убран — заказы с cancelReason уже cancelled и не попадают в выборку
  }
  // Receipts: клиент подтвердил оплату, но оператор ещё не видел (prepaymentSeenAt = null)
  // Дедупликация: если для этого orderId уже есть задача no_payment из orders — заменяем её (receipt-задача точнее)
  const noPaymentOrderIds = new Set(items.filter(i => i.type === "no_payment").map(i => i.orderId != null ? Number(i.orderId) : null).filter(Boolean));
  for (const r of receipts) {
    if (r.prepaymentSubmittedAt && !r.prepaymentSeenAt) {
      const ageH = (now.getTime() - new Date(r.prepaymentSubmittedAt).getTime()) / 3600000;
      // Если уже есть задача no_payment для этого заказа из orders — удаляем её (receipt-задача приоритетнее)
      if (r.orderId != null && noPaymentOrderIds.has(Number(r.orderId))) {
        const idx = items.findIndex(i => i.type === "no_payment" && i.orderId != null && Number(i.orderId) === Number(r.orderId));
        if (idx !== -1) items.splice(idx, 1);
      }
      items.push({ id: `receipt-${r.id}`, type: "no_payment", priority: pFromHours(ageH), title: `Заказ #${r.orderId} — подтверждение оплаты`, shortDescription: `${r.city ?? ""}`.trim(), fullDescription: `Клиент подтвердил оплату ${Math.round(ageH)} ч назад. Необходимо подтвердить получение.`, createdAt: new Date(r.prepaymentSubmittedAt).toISOString(), updatedAt: new Date(r.prepaymentSubmittedAt).toISOString(), lastActionBy: null, deadline: null, status: "open", entityType: "finance", entityId: r.id, orderId: r.orderId, masterId: r.masterId, clientId: null, city: r.city ?? null, amountAtRisk: Number(r.prepaymentAmount ?? 0), actions: actionSet("no_payment") });
    }
  }
  for (const m of masters) { const status = String(m.status ?? "").toLowerCase(); if (status.includes("blocked") || status.includes("fomo_blocked")) items.push({ id: `blocked_master-${m.id}`, type: "blocked_master", priority: "critical", title: `Мастер ${m.alias} заблокирован`, shortDescription: `${m.city ?? ""}`.trim(), fullDescription: `Мастер в блокировке / FOMO_BLOCKED и требует проверки.`, createdAt: new Date(m.createdAt).toISOString(), updatedAt: new Date(m.createdAt).toISOString(), lastActionBy: null, deadline: null, status: "open", entityType: "master", entityId: m.id, orderId: null, masterId: m.id, clientId: null, city: m.city ?? null, amountAtRisk: null, actions: actionSet("blocked_master") }); }
  const balance = avitoRows[0] as any;
  if (balance && Number(balance.manualBalance ?? 0) < 1000) items.push({ id: "low_avito_balance-1", type: "low_avito_balance", priority: "high", title: "Баланс Avito ниже нормы", shortDescription: `Текущий баланс: ${Number(balance.manualBalance ?? 0).toLocaleString("ru-RU")} ₽`, fullDescription: "Баланс Avito ниже рекомендуемого порога.", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastActionBy: null, deadline: null, status: "open", entityType: "finance", entityId: balance.id ?? null, orderId: null, masterId: null, clientId: null, city: null, amountAtRisk: null, actions: actionSet("low_avito_balance") });
  for (const c of cases) {
    let risk = String((c as any).riskLevel ?? (c as any).risk ?? "");
    if (risk !== "red" && risk !== "yellow") continue;

    const cOrderId = (c as any).orderId ?? null;
    const linkedOrder = cOrderId ? orderMap.get(Number(cOrderId)) : null;

    // If the linked order is no longer in the active pool (completed / cancelled / deleted) — skip
    if (cOrderId && !linkedOrder) continue;

    const hasEstimate = (linkedOrder && Number(linkedOrder.proposedAmount ?? 0) > 0) || (cOrderId && receiptOrderIds.has(Number(cOrderId))) || (cOrderId && txOrderIds.has(Number(cOrderId)));
    const hasPaid = linkedOrder && Number(linkedOrder.orderAmount ?? 0) > 0;
    const orderCancelled = linkedOrder && ["cancelled", "completed", "done"].includes(String(linkedOrder.status ?? ""));

    // If the order is already paid or cancelled — the bypass flag is stale, skip entirely
    if (hasPaid || orderCancelled) continue;

    // If estimate was already sent — downgrade "red" (possible_bypass) to "yellow" (conflict)
    if (risk === "red" && hasEstimate) risk = "yellow";

    const rawNext = String((c as any).nextAction ?? "");
    const nextRu = NEXT_ACTION_RU[rawNext] ?? (rawNext || "Требует внимания");
    const baseType = risk === "red" ? "possible_bypass" : "conflict";

    // Build fresh human-readable title + description (never use stale summary from DB)
    // Prefer DB fields, but fall back to computing from order data if null/zero
    const linkedOrderAny = linkedOrder as any;
    const orderAgeH = linkedOrderAny
      ? (now.getTime() - new Date(linkedOrderAny.createdAt).getTime()) / 3600000
      : 0;
    const hasEstimateInOrder = (linkedOrderAny && Number(linkedOrderAny.proposedAmount ?? 0) > 0) || (cOrderId && receiptOrderIds.has(Number(cOrderId))) || (cOrderId && txOrderIds.has(Number(cOrderId)));
    const hasPaidInOrder = linkedOrderAny && Number(linkedOrderAny.orderAmount ?? 0) > 0;

    const hEstRaw = Number((c as any).hoursWithoutEstimate ?? 0);
    // Real-time ordersTable always wins: if estimate already exists in orders — hEst = 0
    const hEst = hasEstimateInOrder ? 0 : (hEstRaw > 0 ? hEstRaw : orderAgeH);

    const hPayRaw = Number((c as any).hoursWithoutPayment ?? 0);
    // Real-time ordersTable always wins: if order is already paid — hPay = 0
    const hPay = hasPaidInOrder ? 0 : (hPayRaw > 0 ? hPayRaw : (hasEstimateInOrder ? orderAgeH : 0));

    const hCont = Number((c as any).hoursWithoutContact ?? 0);
    const stage = String((c as any).currentStage ?? "");
    const cMaster = masterMap.get(Number((c as any).masterId)) as any;
    const masterLabel = cMaster?.alias ?? `Мастер #${(c as any).masterId}`;
    const cLead = linkedOrder ? leadMap.get((linkedOrder as any).leadId) as any : null;
    const clientName = (cLead?.clientName ?? null) as string | null;
    const cCity = String((c as any).city || (linkedOrder as any)?.city || "");

    // Derive the most specific type based on what's actually missing
    let type: TaskType;
    let freshTitle: string;
    let freshDesc: string;
    if (hEst > 24) {
      type = "no_estimate";
      freshTitle = `${masterLabel} — смета не отправлена ${fmtAge(hEst)}`;
      freshDesc = `Заказ #${cOrderId}: мастер ${masterLabel} не отправил смету уже ${fmtAge(hEst)}.`;
    } else if (hPay > 24) {
      type = "no_payment";
      freshTitle = `${masterLabel} — клиент не оплатил ${fmtAge(hPay)}`;
      freshDesc = `Заказ #${cOrderId}: смета отправлена, клиент не платит уже ${fmtAge(hPay)}.`;
    } else if (hCont > 12 || stage === "waiting_update") {
      type = "no_master_response";
      freshTitle = `${masterLabel} — нет связи ${fmtAge(hCont)}`;
      freshDesc = `Заказ #${cOrderId}: мастер ${masterLabel} не выходит на связь ${fmtAge(hCont)}.`;
    } else if (baseType === "possible_bypass") {
      type = "possible_bypass";
      freshTitle = `${masterLabel} — подозрение на обход платформы`;
      freshDesc = `Заказ #${cOrderId}: зафиксированы признаки работы в обход платформы.`;
    } else {
      type = "conflict";
      freshTitle = `${masterLabel} — конфликт по заказу #${cOrderId}`;
      freshDesc = `Заказ #${cOrderId}: требует внимания оператора.`;
    }
    const shortDesc = clientName ? `${clientName}${cCity ? ` · ${cCity}` : ""}` : (cCity || nextRu);

    const cLeadId = (linkedOrder as any)?.leadId ?? null;
    items.push({ id: `case-${(c as any).id}`, type, priority: risk === "red" ? "critical" : "high", title: freshTitle, shortDescription: shortDesc, fullDescription: freshDesc, createdAt: new Date((c as any).updatedAt ?? now).toISOString(), updatedAt: new Date((c as any).updatedAt ?? now).toISOString(), lastActionBy: (c as any).lastActionBy ?? null, deadline: (c as any).nextActionDeadline ? new Date((c as any).nextActionDeadline).toISOString() : null, status: "open", entityType: "system", entityId: (c as any).id, orderId: cOrderId, masterId: (c as any).masterId ?? null, clientId: cLeadId, city: cCity || null, amountAtRisk: null, actions: actionSet(type) });
  }
  for (const t of manualTasks) if ((t as any).status !== "done" && (t as any).status !== "dismissed") items.push({ id: `manual-${(t as any).id}`, type: "custom_manual", priority: "low", title: String((t as any).title ?? "Ручная задача"), shortDescription: String((t as any).description ?? ""), fullDescription: String((t as any).description ?? ""), createdAt: new Date((t as any).createdAt ?? now).toISOString(), updatedAt: new Date((t as any).updatedAt ?? t.createdAt ?? now).toISOString(), lastActionBy: (t as any).lastActionBy ?? null, deadline: (t as any).dueAt ? new Date((t as any).dueAt).toISOString() : null, status: (t as any).status ?? "open", entityType: "system", entityId: (t as any).id, orderId: (t as any).relatedOrderId ?? null, masterId: (t as any).relatedMasterId ?? null, clientId: null, city: null, amountAtRisk: null, actions: actionSet("custom_manual") });
  items.sort((a,b)=>({critical:0,high:1,medium:2,low:3}[a.priority]-({critical:0,high:1,medium:2,low:3}[b.priority])) || ((a.deadline?new Date(a.deadline).getTime():Number.MAX_SAFE_INTEGER)-(b.deadline?new Date(b.deadline).getTime():Number.MAX_SAFE_INTEGER)) || (new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime()));
  return items;
}

async function orchestrateDashboardAction(action: string, item: Item, payload: any, operatorName = "Оператор", operatorRole = "operator") {
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

  if (action === "complete_as_master") {
    console.log(`[complete_as_master] role=${operatorRole} orderId=${item.orderId} masterId=${item.masterId}`);
    if (operatorRole !== "admin") throw Object.assign(new Error("Только администратор может выполнить это действие"), { status: 403 });
    if (item.orderId != null && item.masterId != null) {
      const orderId = Number(item.orderId);
      const masterId = Number(item.masterId);

      const [orderRow] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
      const payloadAmount = Number(payload?.orderAmount ?? 0);
      const amount = payloadAmount > 0
        ? payloadAmount
        : Number(orderRow?.proposedAmount ?? orderRow?.orderAmount ?? 0);
      const commSettings = await getCommissionSettings();
      const commission = amount > 0 ? calculateCommission(amount, commSettings) : 0;
      // commissionMode: "no_debt" | "as_debt" | "as_paid" (default "as_paid" for backwards compat)
      const rawMode = String(payload?.commissionMode ?? "as_paid").trim();
      const commissionMode: "no_debt" | "as_debt" | "as_paid" =
        rawMode === "no_debt" || rawMode === "as_debt" || rawMode === "as_paid" ? rawMode : "as_paid";
      console.log(`[complete_as_master] amount=${amount} (payload=${payloadAmount}, db proposed=${orderRow?.proposedAmount}, db order=${orderRow?.orderAmount}), commission=${commission}, mode=${commissionMode}`);
      const now = new Date();

      await db.update(ordersTable).set({
        status: "completed",
        masterWorkStatus: "completed",
        orderAmount: amount > 0 ? String(amount) : (orderRow?.orderAmount ?? null),
        updatedAt: now,
      } as any).where(eq(ordersTable.id, orderId));
      console.log(`[complete_as_master] order #${orderId} marked completed, amount=${amount}, commission=${commission}`);

      // Determine commission accounting based on mode
      // - no_debt: commission forced to 0, no transaction money flow, master debt unchanged
      // - as_debt: commission = pending, master debt += commission (master must pay later)
      // - as_paid: commission = paid (master already paid in cash/transfer), debt reduced
      const effectiveCommission = commissionMode === "no_debt" ? 0 : commission;
      const txStatus: "paid" | "pending" = commissionMode === "as_debt" ? "pending" : "paid";

      const [existingTx] = await db.select({ id: transactionsTable.id, paidAt: transactionsTable.paidAt }).from(transactionsTable).where(eq(transactionsTable.orderId, orderId)).limit(1);
      if (existingTx) {
        await db.update(transactionsTable).set({
          orderAmount: String(amount),
          commission: String(effectiveCommission),
          paymentStatus: txStatus,
          paidAt: txStatus === "paid" ? (existingTx.paidAt ?? now) : null,
        }).where(eq(transactionsTable.id, existingTx.id));
      } else {
        await db.insert(transactionsTable).values({
          orderId,
          masterId,
          orderAmount: String(amount),
          commission: String(effectiveCommission),
          paymentStatus: txStatus,
          paidAt: txStatus === "paid" ? now : null,
        });
      }

      if (effectiveCommission > 0) {
        if (commissionMode === "as_debt") {
          // Master owes us this commission — increase debt
          await db.update(mastersTable).set({
            debt: sql`COALESCE(${mastersTable.debt}::numeric, 0) + ${effectiveCommission}`,
          }).where(eq(mastersTable.id, masterId));
          console.log(`[complete_as_master] master #${masterId} debt increased by ${effectiveCommission}`);
        } else if (commissionMode === "as_paid") {
          // Master already paid — reduce debt by net amount (after prepayment offset)
          const prepaymentDeducted = Number(existingTx ? (await db.select({ pd: transactionsTable.prepaymentDeducted }).from(transactionsTable).where(eq(transactionsTable.orderId, orderId)).limit(1))[0]?.pd ?? 0 : 0);
          const netPayable = Math.max(0, effectiveCommission - prepaymentDeducted);
          if (netPayable > 0) {
            await db.update(mastersTable).set({
              debt: sql`GREATEST(${mastersTable.debt}::numeric - ${netPayable}, 0)`,
            }).where(eq(mastersTable.id, masterId));
            console.log(`[complete_as_master] master #${masterId} debt decreased by ${netPayable}`);
          }
        }
      }

      await recordOrderCompleted(masterId).catch(() => {});

      const commFmt = effectiveCommission > 0 ? `${Math.round(effectiveCommission).toLocaleString("ru-RU")} ₽` : "0 ₽";
      const notifyText = commissionMode === "as_debt"
        ? `✅ Заказ #${orderId} отмечен как выполненный оператором. К оплате комиссия ${commFmt} — она добавлена к вашему долгу. Пожалуйста, погасите задолженность.`
        : commissionMode === "no_debt"
        ? `✅ Заказ #${orderId} отмечен как выполненный оператором. Комиссия по этому заказу не начисляется. Спасибо за работу!`
        : `✅ Заказ #${orderId} отмечен как выполненный оператором. Комиссия ${commFmt} засчитана как оплаченная. Спасибо за работу!`;
      const [master] = await db.select({ id: mastersTable.id, maxChatId: mastersTable.maxChatId }).from(mastersTable).where(eq(mastersTable.id, masterId)).limit(1);
      // Send to BOTH channels: Max (if connected) AND PWA push
      if (master?.maxChatId) {
      await sendMaxMessage(master.maxChatId, notifyText).catch((e: any) => console.error("[complete_as_master] max send failed:", e));
      }
      const pushBody = commissionMode === "as_debt"
        ? `Заказ #${orderId} завершён. К оплате ${commFmt} (добавлено к долгу).`
        : commissionMode === "no_debt"
        ? `Заказ #${orderId} завершён. Комиссия не начисляется.`
        : `Заказ #${orderId} завершён. Комиссия ${commFmt} засчитана.`;
      sendPushToMaster(masterId, { type: "new_message", title: "Заказ выполнен", body: pushBody }).catch((e: any) => console.error("[complete_as_master] push failed:", e));
      const chatId = master?.maxChatId ? `max_${master.maxChatId}` : `pwa_${masterId}`;
      await db.insert(masterMessagesTable).values({ masterId, telegramChatId: chatId, text: notifyText, fromMaster: false, senderName: operatorName, isRead: true });
      // Archive linked chat case so it doesn't reappear in dashboards
      await db.update(chatCasesTable).set({ isResolved: true, isArchived: true, updatedAt: now } as any).where(eq(chatCasesTable.orderId, orderId)).catch((e) => console.error("[complete_as_master] case archive failed:", e));
      console.log(`[complete_as_master] order #${orderId} fully processed (notifications sent, case archived)`);
    }
  }

  if (action === "cancel_as_master" && item.orderId != null && item.masterId != null) {
    console.log(`[cancel_as_master] role=${operatorRole} orderId=${item.orderId} masterId=${item.masterId}`);
    if (operatorRole !== "admin") throw Object.assign(new Error("Только администратор может выполнить это действие"), { status: 403 });
    const orderId = Number(item.orderId);
    const masterId = Number(item.masterId);
    const now = new Date();
    const rawReason = String((payload as { cancelReason?: string })?.cancelReason ?? "bypass").trim();
    const cancelReason = rawReason === "bypass" || rawReason === "no_contact" || rawReason === "no_estimate" || rawReason === "other" ? rawReason : "bypass";

    await db.update(ordersTable)
      .set({ status: "cancelled", cancelReason: cancelReason === "bypass" ? "master_cancel_bypass" : `master_cancel_${cancelReason}`, updatedAt: now } as any)
      .where(eq(ordersTable.id, orderId));
    console.log(`[cancel_as_master] order #${orderId} marked cancelled (reason=${cancelReason})`);

    await recordOrderCancelled(masterId, orderId).catch((e) => console.error("[cancel_as_master] reputation update failed:", e));

    const reasonText = cancelReason === "no_contact"
      ? "мастер не выходит на связь"
      : cancelReason === "no_estimate"
      ? "мастер не отправил смету"
      : cancelReason === "other"
      ? "другая причина"
      : "обход платформы";
    const notifyText = `⚠️ Заказ #${orderId} отменён оператором (причина: ${reasonText}). Отмена засчитана вам. Свяжитесь с нами для уточнения деталей.`;
    const [master] = await db
      .select({ id: mastersTable.id, maxChatId: mastersTable.maxChatId })
      .from(mastersTable)
      .where(eq(mastersTable.id, masterId))
      .limit(1);

    // Send to BOTH channels: Max (if connected) AND PWA push
    if (master?.maxChatId) {
      await sendMaxMessage(master.maxChatId, notifyText).catch((e: any) => console.error("[cancel_as_master] max send failed:", e));
    }
    sendPushToMaster(masterId, {
      type: "new_message",
      title: "Заказ отменён",
      body: `Заказ #${orderId} отменён: ${reasonText}.`,
    }).catch((e: any) => console.error("[cancel_as_master] push failed:", e));

    const chatId = master?.maxChatId ? `max_${master.maxChatId}` : `pwa_${masterId}`;
    await db.insert(masterMessagesTable).values({
      masterId,
      telegramChatId: chatId,
      text: notifyText,
      fromMaster: false,
      senderName: operatorName,
      isRead: true,
    });
    // Archive linked chat case so it doesn't reappear in dashboards
    await db.update(chatCasesTable).set({ isResolved: true, isArchived: true, updatedAt: now } as any).where(eq(chatCasesTable.orderId, orderId)).catch((e) => console.error("[cancel_as_master] case archive failed:", e));
    console.log(`[cancel_as_master] order #${orderId} fully processed (notifications sent, case archived)`);
  }

  if (action === "return_to_pool" && item.orderId != null) {
    await db.update(ordersTable)
      .set({ masterId: null, status: "waiting_master", assignedAt: null, updatedAt: new Date() } as any)
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

  if (action === "message_master" && item.masterId != null && payload.message) {
    const text = String(payload.message).trim();
    if (text) {
      const [master] = await db
        .select({ id: mastersTable.id, maxChatId: mastersTable.maxChatId })
        .from(mastersTable)
        .where(eq(mastersTable.id, Number(item.masterId)))
        .limit(1);

      if (master?.maxChatId) {
        await sendMaxMessage(master.maxChatId, text);
      } else {
        sendPushToMaster(Number(item.masterId), {
          type: "new_message",
          title: "Сообщение от оператора",
          body: text.length > 100 ? text.slice(0, 97) + "…" : text,
        }).catch(() => {});
      }

      const chatId = master?.maxChatId ? `max_${master.maxChatId}` : `pwa_${item.masterId}`;
      await db.insert(masterMessagesTable).values({
        masterId: Number(item.masterId),
        telegramChatId: chatId,
        text,
        fromMaster: false,
        senderName: operatorName,
        isRead: true,
      });
    }
  }

  if (action === "partial_payment") {
    // masterId может быть null для некоторых задач — пробуем взять из payload или из заказа
    const orderId = item.orderId != null ? Number(item.orderId) : (payload?.orderId != null ? Number(payload.orderId) : null);
    let masterId = item.masterId != null ? Number(item.masterId) : null;
    if (masterId == null && orderId != null) {
      const [orderRow] = await db.select({ masterId: ordersTable.masterId }).from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
      if (orderRow?.masterId) masterId = Number(orderRow.masterId);
    }
    if (masterId == null) throw Object.assign(new Error("Не удалось определить мастера для частичной оплаты"), { status: 400 });
    const orderAmount = Number(payload?.orderAmount ?? 0);
    const paidAmount = Number(payload?.paidAmount ?? 0);
    if (!Number.isFinite(orderAmount) || orderAmount <= 0) throw Object.assign(new Error("Укажите полную сумму сметы"), { status: 400 });
    if (!Number.isFinite(paidAmount) || paidAmount <= 0) throw Object.assign(new Error("Укажите оплаченную сумму"), { status: 400 });
    const commSettings = await getCommissionSettings();
    const totalCommission = calculateCommission(orderAmount, commSettings);
    // paidAmount — это сумма оплаченной комиссии (не доля от заказа)
    const paidCommission = Math.min(Math.round(paidAmount), totalCommission);
    const remainingCommission = Math.max(0, totalCommission - paidCommission);
    const now = new Date();

    // Reduce master debt by the paid commission portion
    if (paidCommission > 0) {
      await db.update(mastersTable).set({
        debt: sql`GREATEST(${mastersTable.debt}::numeric - ${paidCommission}, 0)`,
      }).where(eq(mastersTable.id, masterId));
    }

    // Record partial payment in transactions if order exists
    let txId: number | null = null;
    if (orderId != null) {
      const [existingTx] = await db.select({ id: transactionsTable.id }).from(transactionsTable).where(eq(transactionsTable.orderId, orderId)).limit(1);
      if (existingTx) {
        txId = existingTx.id;
        await db.update(transactionsTable).set({
          orderAmount: String(orderAmount),
          commission: String(totalCommission),
          paymentStatus: remainingCommission <= 0 ? "paid" : "pending",
          paidAt: remainingCommission <= 0 ? now : null,
        }).where(eq(transactionsTable.id, existingTx.id));
      } else {
        const [inserted] = await db.insert(transactionsTable).values({
          orderId,
          masterId,
          orderAmount: String(orderAmount),
          commission: String(totalCommission),
          paymentStatus: remainingCommission <= 0 ? "paid" : "pending",
          paidAt: remainingCommission <= 0 ? now : null,
        }).returning({ id: transactionsTable.id });
        txId = inserted?.id ?? null;
      }
    }

    // Always record the individual partial payment in transaction_payments
    if (txId != null && paidCommission > 0) {
      await db.insert(transactionPaymentsTable).values({
        transactionId: txId,
        amount: String(paidCommission),
        note: `Частичная оплата комиссии оператором. Сумма заказа: ${orderAmount} ₽, оплачено: ${paidAmount} ₽`,
        paidAt: now,
      });
    }

    // Remaining order amount (not commission) — what the master still needs to collect from client
    const remainingOrderAmount = Math.max(0, orderAmount - paidAmount);

    const [master] = await db.select({ id: mastersTable.id, maxChatId: mastersTable.maxChatId }).from(mastersTable).where(eq(mastersTable.id, masterId)).limit(1);
    const notifyText = remainingOrderAmount > 0
      ? `💰 Оплата по заказу${orderId ? ` #${orderId}` : ""} зафиксирована: ${paidAmount.toLocaleString("ru-RU")} ₽ из ${orderAmount.toLocaleString("ru-RU")} ₽. Остаток: ${remainingOrderAmount.toLocaleString("ru-RU")} ₽.`
      : `✅ Оплата по заказу${orderId ? ` #${orderId}` : ""} полностью получена: ${paidAmount.toLocaleString("ru-RU")} ₽. Спасибо!`;
    if (master?.maxChatId) {
      await sendMaxMessage(master.maxChatId, notifyText).catch((e: any) => console.error("[partial_payment] max send failed:", e));
    }
    sendPushToMaster(masterId, {
      type: "new_message",
      title: "Оплата зафиксирована",
      body: remainingOrderAmount > 0
        ? `Принято ${paidAmount.toLocaleString("ru-RU")} ₽, остаток ${remainingOrderAmount.toLocaleString("ru-RU")} ₽`
        : `Оплата ${paidAmount.toLocaleString("ru-RU")} ₽ получена полностью`,
    }).catch((e: any) => console.error("[partial_payment] push failed:", e));
    const chatId = master?.maxChatId ? `max_${master.maxChatId}` : `pwa_${masterId}`;
    await db.insert(masterMessagesTable).values({ masterId, telegramChatId: chatId, text: notifyText, fromMaster: false, senderName: operatorName, isRead: true });
    console.log(`[partial_payment] master #${masterId} paid ${paidCommission} of ${totalCommission}, remaining=${remainingCommission}`);
  }

  if (action === "snooze") {
    const days = Math.max(1, Math.min(30, Number(payload?.days ?? 1)));
    const snoozedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await db.insert(taskSnoozesTable)
      .values({ itemId: item.id, snoozedUntil, snoozedBy: operatorName })
      .onConflictDoUpdate({ target: taskSnoozesTable.itemId, set: { snoozedUntil, snoozedBy: operatorName } });
    return { routedTo: "/tasks", applied: true, action, payload, itemId: item.id, snoozedUntil: snoozedUntil.toISOString() };
  }

  if (action === "reassign" && item.orderId != null && payload.masterId != null) {
    const [targetMaster] = await db.select({ id: mastersTable.id, alias: mastersTable.alias, maxChatId: mastersTable.maxChatId, status: mastersTable.status }).from(mastersTable).where(and(eq(mastersTable.id, Number(payload.masterId)), isNull(mastersTable.deletedAt))).limit(1);
    if (targetMaster) {
      await db.update(ordersTable)
        .set({ masterId: Number(payload.masterId), status: "in_progress", assignedAt: new Date(), updatedAt: new Date() })
        .where(eq(ordersTable.id, Number(item.orderId)));
      // Уведомить нового мастера о назначении
      const notifyText = `📋 Вам назначен заказ #${item.orderId}. Пожалуйста, свяжитесь с клиентом и подтвердите выезд.`;
      if (targetMaster.maxChatId) {
        await sendMaxMessage(targetMaster.maxChatId, notifyText).catch((e: any) => console.error("[reassign] max send failed:", e));
      }
      sendPushToMaster(Number(payload.masterId), {
        type: "new_message",
        title: "Новый заказ",
        body: `Вам назначен заказ #${item.orderId}`,
      }).catch((e: any) => console.error("[reassign] push failed:", e));
      const chatId = targetMaster.maxChatId ? `max_${targetMaster.maxChatId}` : `pwa_${payload.masterId}`;
      await db.insert(masterMessagesTable).values({
        masterId: Number(payload.masterId),
        telegramChatId: chatId,
        text: notifyText,
        fromMaster: false,
        senderName: operatorName,
        isRead: true,
      });
    }
  }

  if (action === "confirm_receipt" && item.entityId != null) {
    // entityId для receipt-задач — это id записи в receipts
    const receiptId = Number(item.entityId);
    const now = new Date();
    await db.update(receiptsTable)
      .set({ prepaymentSeenAt: now } as any)
      .where(eq(receiptsTable.id, receiptId));
    console.log(`[confirm_receipt] receipt #${receiptId} marked seen by ${operatorName}`);
    // Уведомить мастера о подтверждении оплаты
    if (item.masterId != null) {
      const masterId = Number(item.masterId);
      const [master] = await db.select({ id: mastersTable.id, maxChatId: mastersTable.maxChatId }).from(mastersTable).where(eq(mastersTable.id, masterId)).limit(1);
      const notifyText = `✅ Оплата по заказу${item.orderId ? ` #${item.orderId}` : ""} подтверждена оператором. Можете приступать к работе!`;
      if (master?.maxChatId) {
        await sendMaxMessage(master.maxChatId, notifyText).catch((e: any) => console.error("[confirm_receipt] max send failed:", e));
      }
      sendPushToMaster(masterId, {
        type: "new_message",
        title: "Оплата подтверждена",
        body: `Оплата по заказу${item.orderId ? ` #${item.orderId}` : ""} подтверждена.`,
      }).catch((e: any) => console.error("[confirm_receipt] push failed:", e));
      const chatId = master?.maxChatId ? `max_${master.maxChatId}` : `pwa_${masterId}`;
      await db.insert(masterMessagesTable).values({
        masterId,
        telegramChatId: chatId,
        text: notifyText,
        fromMaster: false,
        senderName: operatorName,
        isRead: true,
      });
    }
    return { routedTo: "/finance", applied: true, action, payload, itemId: item.id, confirmedAt: now.toISOString() };
  }

  return { routedTo: route, applied: true, action, payload, itemId: item.id };
}

router.get("/action-items", ops, async (req: any, res: any) => {
  const { period = "all", city = "all", priority = "all", status = "all" } = req.query ?? {};
  const now = new Date();
  // Load active snoozes — wrapped in try/catch in case the table doesn't exist yet (migration pending)
  let snoozedIds = new Set<string>();
  try {
    const activeSnoozes = await db.select({ itemId: taskSnoozesTable.itemId })
      .from(taskSnoozesTable)
      .where(gt(taskSnoozesTable.snoozedUntil, now));
    snoozedIds = new Set(activeSnoozes.map((s: any) => s.itemId));
  } catch (e: any) {
    console.warn("[action-items] task_snoozes table not available yet, skipping snooze filter:", e?.message);
  }

  const items = (await buildItems())
    .filter((item) => !snoozedIds.has(item.id))
    .filter((item) => matchesFilters(item, { period: String(period), city: String(city), priority: String(priority), status: String(status) }));
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
    const [o] = await db.select({ id: ordersTable.id, proposedAmount: ordersTable.proposedAmount, orderAmount: ordersTable.orderAmount, prepaymentAmount: ordersTable.prepaymentAmount, status: ordersTable.status, clientName: ordersTable.clientName, clientPhone: ordersTable.clientPhone, city: ordersTable.city, district: ordersTable.district, createdAt: ordersTable.createdAt }).from(ordersTable).where(eq(ordersTable.id, Number(item.orderId))).limit(1);
    if (o) {
      const ageH = Math.round((Date.now() - new Date(o.createdAt).getTime()) / 3600000);
      ctx.order = { id: o.id, proposedAmount: o.proposedAmount ? Number(o.proposedAmount) : null, orderAmount: o.orderAmount ? Number(o.orderAmount) : null, prepaymentAmount: o.prepaymentAmount ? Number(o.prepaymentAmount) : null, status: o.status, clientName: (o as any).clientName ?? null, clientPhone: (o as any).clientPhone ?? null, city: o.city, district: o.district ?? null, hoursOld: ageH };
    }
  }

  if (item.clientId != null) {
    const [l] = await db.select({ id: leadsTable.id, clientName: leadsTable.clientName, clientPhone: leadsTable.clientPhone, city: leadsTable.city }).from(leadsTable).where(eq(leadsTable.id, Number(item.clientId))).limit(1);
    if (l) ctx.client = l;
  }

  if (item.type === "no_master_response" || item.type === "no_estimate") {
    const avail = await db.select({ id: mastersTable.id, alias: mastersTable.alias, city: mastersTable.city, status: mastersTable.status }).from(mastersTable).where(and(eq(mastersTable.status, "active"), isNull(mastersTable.deletedAt))).limit(30);
    ctx.availableMasters = avail.map((m: any) => ({ id: m.id, name: m.alias ?? `Мастер #${m.id}`, city: m.city }));
  }

  // Load receipt (with token for estimate link) for no_estimate and no_payment
  if ((item.type === "no_estimate" || item.type === "no_payment") && item.orderId != null) {
    const [r] = await db.select({ id: receiptsTable.id, token: receiptsTable.token, prepaymentAmount: receiptsTable.prepaymentAmount, prepaymentSubmittedAt: receiptsTable.prepaymentSubmittedAt, prepaymentSeenAt: receiptsTable.prepaymentSeenAt, prepaymentScreenshotUrl: receiptsTable.prepaymentScreenshotUrl, clientName: receiptsTable.clientName, clientPhone: receiptsTable.clientPhone }).from(receiptsTable).where(eq(receiptsTable.orderId, Number(item.orderId))).limit(1);
    if (r) ctx.receipt = r;
  }

  if (item.type === "low_avito_balance") {
    const [av] = await db.select().from(avitoSettingsTable).limit(1);
    if (av) ctx.avitoBalance = (av as any).advanceBalance ?? 0;
  }

  // Always load transaction + partial payments for any item with an orderId
  if (item.orderId != null) {
    const [tx] = await db.select({ id: transactionsTable.id, commission: transactionsTable.commission, orderAmount: transactionsTable.orderAmount, paymentStatus: transactionsTable.paymentStatus, paidAt: transactionsTable.paidAt, prepaymentDeducted: transactionsTable.prepaymentDeducted }).from(transactionsTable).where(eq(transactionsTable.orderId, Number(item.orderId))).limit(1);
    if (tx) {
      const paymentsRows = await db.select({ amount: transactionPaymentsTable.amount, paidAt: transactionPaymentsTable.paidAt, note: transactionPaymentsTable.note }).from(transactionPaymentsTable).where(eq(transactionPaymentsTable.transactionId, tx.id));
      const paidCommission = paymentsRows.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
      ctx.transaction = { id: tx.id, commission: Number(tx.commission), orderAmount: Number(tx.orderAmount), paymentStatus: tx.paymentStatus, paidAt: tx.paidAt, paidCommission, prepaymentDeducted: Number(tx.prepaymentDeducted ?? 0), payments: paymentsRows };
    }
  }

  res.json({ ...item, timeline: [], context: ctx, related: {}, notes: [] });
});

router.post("/action-items/:id/action", ops, async (req: any, res: any) => {
  const { action, payload = {} } = req.body ?? {};
  const items = await buildItems();
  let item = items.find((i) => i.id === req.params.id);
  if (!item && (action === "complete_as_master" || action === "cancel_as_master")) {
    const orderId = Number((payload as any)?.orderId);
    const masterId = Number((payload as any)?.masterId);
    item = items.find((i) => (Number.isFinite(orderId) && i.orderId != null && Number(i.orderId) === orderId) || (Number.isFinite(masterId) && i.masterId != null && Number(i.masterId) === masterId));
  }
  if (!item) return res.status(404).json({ error: "Не найдено" });
  if (!["message_master", "call_client", "reassign", "cancel_order", "cancel_as_master", "complete_as_master", "partial_payment", "return_to_pool", "resolve", "dismiss", "snooze", "update_balance", "manual_unblock", "call_master", "resend", "block_master", "manual_control", "open_issue_order", "confirm_receipt"].includes(action)) return res.status(400).json({ error: "Недопустимое действие" });
  const operatorName = (req as any).user?.name ?? "Оператор";
  const operatorRole = (req as any).user?.role ?? "operator";
  let result: any;
  try {
    result = await orchestrateDashboardAction(action, item, payload, operatorName, operatorRole);
  } catch (e: any) {
    console.error(`[dashboard-action] action=${action} itemId=${item.id} error:`, e);
    if (e?.status === 403) return res.status(403).json({ error: e.message });
    return res.status(500).json({ error: e?.message ?? "Внутренняя ошибка сервера" });
  }

  const actionCtx: Record<string, any> = {};
  if (action === "reassign" && payload.masterId != null && item.orderId != null) {
    const [updatedOrder] = await db.select({ id: ordersTable.id, masterId: ordersTable.masterId, status: ordersTable.status, city: ordersTable.city }).from(ordersTable).where(eq(ordersTable.id, Number(item.orderId))).limit(1);
    if (!updatedOrder || updatedOrder.masterId !== Number(payload.masterId)) {
      return res.status(500).json({ error: "Назначение не прошло — заказ не найден или мастер не был обновлён" });
    }
    actionCtx.order = { id: updatedOrder.id, status: updatedOrder.status, masterId: updatedOrder.masterId, city: updatedOrder.city };
    const [newMaster] = await db.select({ id: mastersTable.id, alias: mastersTable.alias, phone: mastersTable.phone, city: mastersTable.city, status: mastersTable.status }).from(mastersTable).where(eq(mastersTable.id, updatedOrder.masterId!)).limit(1);
    if (newMaster) {
      actionCtx.assignedMaster = { id: newMaster.id, name: newMaster.alias ?? `Мастер #${newMaster.id}`, phone: newMaster.phone ?? null, city: newMaster.city, status: newMaster.status };
    }
  }

  res.json({ ...item, status: action === "dismiss" ? "dismissed" : action === "resolve" ? "done" : "in_progress", orchestration: result, timeline: [], context: actionCtx, related: {}, notes: [] });
});

export default router;
export { buildItems };
