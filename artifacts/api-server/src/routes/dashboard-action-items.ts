import { Router } from "express";
import { db, ordersTable, mastersTable, leadsTable, receiptsTable, avitoSettingsTable, systemTasksTable, masterMessagesTable, transactionsTable, transactionPaymentsTable, taskSnoozesTable, orderDispatchesTable } from "@workspace/db";
import { desc, isNull, eq, and, sql, not, inArray, lte, gt } from "drizzle-orm";
import { sendMaxMessage } from "../maxBot.js";
import { sendPushToMaster } from "../lib/push.js";
import { requireRole } from "../middlewares/requireAuth.js";
import { recordOrderCancelled } from "../lib/masterReputation.js";
import { recordOrderCompleted } from "../lib/masterReputation.js";
import { recordOrderMasterHistory } from "../lib/orderMasterHistory.js";
import { calculateCommission, getCommissionSettings, DEFAULT_COMMISSION } from "../lib/commission.js";
import { computePaymentStateBatch } from "../lib/paymentState.js";
import { isPaymentStateEngineEnabled } from "../lib/paymentStateGuard.js";
import OpenAI from "openai";

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
type TaskType = "no_estimate" | "no_payment" | "no_master_response" | "no_progress" | "low_avito_balance" | "blocked_master" | "possible_bypass" | "conflict" | "no_manager_id" | "custom_manual" | "token_refund_pending" | "master_zero_balance" | "master_churn_risk" | "order_stalled_token";

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
  approve_refund: "/wallet",
  reject_refund: "/wallet",
} as const;

function pFromHours(hours: number): Priority {
  if (hours >= 48) return "critical";
  if (hours >= 24) return "high";
  if (hours >= 8) return "medium";
  return "low";
}

function pluralRu(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  const last2 = abs % 100;
  const last1 = abs % 10;
  if (last2 >= 11 && last2 <= 14) return many;
  if (last1 === 1) return one;
  if (last1 >= 2 && last1 <= 4) return few;
  return many;
}

function fmtAge(hours: number): string {
  if (hours < 1) return "менее часа";
  if (hours >= 48) {
    const days = Math.round(hours / 24);
    return `${days} ${pluralRu(days, "день", "дня", "дней")}`;
  }
  const h = Math.round(hours);
  return `${h} ${pluralRu(h, "час", "часа", "часов")}`;
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
  if (type === "no_master_response") return [{ key: "message_master", label: "Написать мастеру", style: "primary" as const }, { key: "resend", label: "Повторно разослать", style: "secondary" as const }, { key: "reassign", label: "Назначить вручную", style: "secondary" as const }, { key: "cancel_order", label: "Отменить заказ", style: "danger" as const }];
  if (type === "no_progress") return [{ key: "message_master", label: "Написать мастеру", style: "primary" as const }, { key: "call_master", label: "Позвонить мастеру", style: "secondary" as const }, { key: "reassign", label: "Переназначить", style: "secondary" as const }, { key: "cancel_order", label: "Отменить заказ", style: "danger" as const }, { key: "resolve", label: "Пометить задачу выполненной", style: "secondary" as const }];
  if (type === "blocked_master") return [{ key: "message_master", label: "Написать мастеру", style: "primary" as const }, { key: "manual_unblock", label: "Разблокировать вручную", style: "danger" as const }, { key: "open_issue_order", label: "Открыть проблемный заказ", style: "secondary" as const }, { key: "resolve", label: "Пометить как проверено", style: "secondary" as const }];
  if (type === "possible_bypass" || type === "conflict") return [{ key: "message_master", label: "Написать мастеру", style: "primary" as const }, { key: "cancel_order", label: "Отменить заказ", style: "danger" as const }, { key: "cancel_as_master", label: "Отменить заказ (вина мастера)", style: "danger" as const }, { key: "block_master", label: "Заблокировать мастера", style: "danger" as const }, { key: "manual_control", label: "Перевести заказ в ручной контроль", style: "secondary" as const }, { key: "resolve", label: "Пометить как проверено", style: "secondary" as const }];
  if (type === "no_manager_id") return [{ key: "reassign", label: "Назначить менеджера", style: "primary" as const }, { key: "resolve", label: "Пометить выполненной", style: "secondary" as const }];
  if (type === "token_refund_pending") return [{ key: "approve_refund", label: "Одобрить возврат", style: "primary" as const }, { key: "reject_refund", label: "Отклонить возврат", style: "danger" as const }, { key: "resolve", label: "Пометить как проверено", style: "secondary" as const }];
  if (type === "master_zero_balance") return [{ key: "message_master", label: "Написать мастеру", style: "primary" as const }, { key: "resolve", label: "Пометить выполненной", style: "secondary" as const }];
  if (type === "master_churn_risk") return [{ key: "message_master", label: "Написать мастеру", style: "primary" as const }, { key: "resolve", label: "Пометить выполненной", style: "secondary" as const }];
  if (type === "order_stalled_token") return [{ key: "reassign", label: "Переназначить", style: "primary" as const }, { key: "message_master", label: "Написать мастеру", style: "secondary" as const }, { key: "cancel_order", label: "Отменить заказ", style: "danger" as const }];
  return [{ key: "resolve", label: "Пометить выполненной", style: "secondary" as const }, { key: "dismiss", label: "Отложить", style: "ghost" as const }];
}

// ─── In-memory TTL кэш для buildItems() ──────────────────────────
// buildItems() делает 8+ SQL-запросов — кэшируем на 30 сек чтобы не грузить БД
const BUILD_ITEMS_TTL_MS = 30_000;
let buildItemsCache: { data: Item[]; ts: number } | null = null;

export function invalidateBuildItemsCache() { buildItemsCache = null; }

async function buildItems(): Promise<Item[]> {
  if (buildItemsCache && Date.now() - buildItemsCache.ts < BUILD_ITEMS_TTL_MS) {
    return buildItemsCache.data;
  }
  const items: Item[] = [];
  const now = new Date();
  // Load commission settings once for amountAtRisk calculations
  const commSettings = await getCommissionSettings().catch(() => DEFAULT_COMMISSION);
  const [orders, masters, allMastersForNames, leads, receipts, manualTasks, txRows] = await Promise.all([
    db.select({ id: ordersTable.id, leadId: ordersTable.leadId, masterId: ordersTable.masterId, city: ordersTable.city, status: ordersTable.status, proposedAmount: ordersTable.proposedAmount, orderAmount: ordersTable.orderAmount, commissionPaid: ordersTable.commissionPaid, createdAt: ordersTable.createdAt, updatedAt: ordersTable.updatedAt, assignedAt: ordersTable.assignedAt, cancelReason: ordersTable.cancelReason }).from(ordersTable).where(and(isNull(ordersTable.deletedAt), not(inArray(ordersTable.status, ["completed", "cancelled"])))),
    db.select({ id: mastersTable.id, alias: mastersTable.alias, city: mastersTable.city, status: mastersTable.status, createdAt: mastersTable.createdAt, blockedAt: (mastersTable as any).blockedAt }).from(mastersTable).where(and(isNull(mastersTable.deletedAt), sql`${mastersTable.status}::text ilike '%blocked%' or ${mastersTable.status}::text ilike '%fomo%'`)),
    db.select({ id: mastersTable.id, alias: mastersTable.alias, city: mastersTable.city }).from(mastersTable).where(isNull(mastersTable.deletedAt)),
    db.select({ id: leadsTable.id, clientName: leadsTable.clientName, clientPhone: leadsTable.clientPhone, city: leadsTable.city, createdAt: leadsTable.createdAt }).from(leadsTable).where(isNull(leadsTable.deletedAt)),
    db.select({ id: receiptsTable.id, orderId: receiptsTable.orderId, masterId: receiptsTable.masterId, city: receiptsTable.city, prepaymentSubmittedAt: receiptsTable.prepaymentSubmittedAt, prepaymentSeenAt: receiptsTable.prepaymentSeenAt, prepaymentAmount: receiptsTable.prepaymentAmount }).from(receiptsTable),
    db.select().from(systemTasksTable).orderBy(desc(systemTasksTable.createdAt)).limit(50),
    db.select({ id: transactionsTable.id, orderId: transactionsTable.orderId, orderAmount: transactionsTable.orderAmount }).from(transactionsTable),
  ]);
  const leadMap = new Map(leads.map((l: any) => [l.id, l]));
  const orderMap = new Map(orders.map((o: any) => [o.id, o]));
  const masterMap = new Map(masters.map((m: any) => [m.id, m]));
  // Full name map for ALL masters (not just blocked) — used to show master names in task cards
  const masterNameMap = new Map(allMastersForNames.map((m: any) => [m.id, m.alias]));
  // Orders that already have a receipt — estimate was effectively sent (any receipt means estimate exists)
  const receiptOrderIds = new Set(receipts.filter((r: any) => r.orderId != null).map((r: any) => Number(r.orderId)).filter(Boolean));
  // Orders that already have a receipt with prepaymentSubmittedAt — client already paid, receipt task will handle it
  const receiptSubmittedOrderIds = new Set(receipts.filter((r: any) => r.prepaymentSubmittedAt != null).map((r: any) => Number(r.orderId)).filter(Boolean));
  // Orders that already have a transaction with orderAmount > 0 — estimate definitely exists
  const txOrderIds = new Set(txRows.filter((t: any) => Number(t.orderAmount ?? 0) > 0).map((t: any) => Number(t.orderId)).filter(Boolean));
  // Orders that have at least one partial payment in transaction_payments — work is in progress, don't flag as "no estimate"
  const txIdsWithPayments = new Set((await db.select({ transactionId: transactionPaymentsTable.transactionId }).from(transactionPaymentsTable).limit(5000)).map((p: any) => p.transactionId));
  const txOrderIdsWithPayments = new Set(txRows.filter((t: any) => txIdsWithPayments.has(t.id)).map((t: any) => Number(t.orderId)).filter(Boolean));

  // ── Payment_State engine guard (Phase 2) ───────────────────────────────
  // При включённом флаге задача no_estimate генерируется только для заказов
  // в paymentState=no_amount (нет orderAmount, нет receipt с amount, не paid).
  // Это подавляет дубли когда оператор зафиксировал сумму через Agreement_Path
  // без создания сметы. При выключенном флаге — старая проверка hasEstimate.
  const paymentStateEngineOn = await isPaymentStateEngineEnabled();
  const receiptsByOrderForState = new Map<number, typeof receipts>();
  for (const r of receipts) {
    const arr = receiptsByOrderForState.get(Number(r.orderId)) ?? [];
    arr.push(r);
    receiptsByOrderForState.set(Number(r.orderId), arr);
  }
  const paymentStateMap = computePaymentStateBatch(orders as any, receiptsByOrderForState as any);

  for (const o of orders) {
    const ageH = (now.getTime() - new Date(o.createdAt).getTime()) / 3600000;
    // For no_estimate: show the REAL age of the problem (from order creation),
    // but also track how long the CURRENT master has had the order (from assignedAt).
    // Previously counting only from assignedAt caused misleading "2 days" when assignedAt
    // was updated by a broadcast/re-publish while the order was actually without estimate for weeks.
    const estimateAgeH = (now.getTime() - new Date(o.createdAt).getTime()) / 3600000;
    const currentMasterAgeH = o.assignedAt
      ? (now.getTime() - new Date(o.assignedAt).getTime()) / 3600000
      : estimateAgeH;
    const lead = leadMap.get(o.leadId!) as any;
    const clientLabel = lead?.clientName ? `${lead.clientName} · ${o.city ?? ""}` : (o.city ?? "");
    // no_estimate: proposedAmount missing AND no receipt AND no transaction with amount AND no partial payments
    const hasEstimate = (o.proposedAmount != null && Number(o.proposedAmount) > 0)
      || receiptOrderIds.has(Number(o.id))
      || txOrderIds.has(Number(o.id))
      || txOrderIdsWithPayments.has(Number(o.id));
    // Payment_State guard (Phase 2): при включённом флаге решающее условие —
    // paymentState===no_amount; иначе — старая проверка hasEstimate.
    const shouldShowNoEstimate = paymentStateEngineOn
      ? paymentStateMap.get(Number(o.id)) === "no_amount"
      : !hasEstimate;
    if (shouldShowNoEstimate && estimateAgeH >= 24) {
      // Show real order age + context about current master assignment time
      const descParts = [`У заказа нет сметы уже ${fmtAge(estimateAgeH)}.`];
      if (o.masterId && currentMasterAgeH < estimateAgeH - 24) {
        // Master was assigned significantly later than order creation — show both
        descParts.push(` Текущий мастер назначен ${fmtAge(currentMasterAgeH)} назад.`);
      }
      // createdAt задачи = момент когда задача стала актуальной (через 24ч после создания заказа),
      // а не дата создания заказа — иначе фильтр "Месяц/Неделя" скрывает старые активные задачи
      const noEstimateTaskCreatedAt = new Date(new Date(o.createdAt).getTime() + 24 * 3600000).toISOString();
      items.push({ id: `no_estimate-${o.id}`, type: "no_estimate", priority: "medium", title: `Заказ #${o.id} — нет сметы`, shortDescription: clientLabel.trim(), fullDescription: descParts.join(""), createdAt: noEstimateTaskCreatedAt, updatedAt: new Date(o.updatedAt ?? o.createdAt).toISOString(), lastActionBy: null, deadline: null, status: "open", entityType: "order", entityId: o.id, orderId: o.id, masterId: o.masterId ?? null, clientId: o.leadId ?? null, city: o.city ?? null, masterName: o.masterId != null ? (masterNameMap.get(Number(o.masterId)) ?? null) : null, amountAtRisk: o.orderAmount ? calculateCommission(Number(o.orderAmount), commSettings) : null, actions: actionSet("no_estimate") });
    }
    if (o.status === "waiting_master") {
      // createdAt задачи = updatedAt заказа (последнее изменение статуса), чтобы задача не выпадала
      // из фильтра "Неделя/Месяц" только потому что заказ был создан давно
      const noMasterTaskCreatedAt = new Date(o.updatedAt ?? o.createdAt).toISOString();
      items.push({ id: `no_master_response-${o.id}`, type: "no_master_response", priority: pFromHours(ageH), title: `Заказ #${o.id} — нет отклика мастера`, shortDescription: clientLabel.trim(), fullDescription: `Заказ завис без отклика мастера ${fmtAge(ageH)}.`, createdAt: noMasterTaskCreatedAt, updatedAt: noMasterTaskCreatedAt, lastActionBy: null, deadline: null, status: "open", entityType: "order", entityId: o.id, orderId: o.id, masterId: o.masterId ?? null, clientId: o.leadId ?? null, city: o.city ?? null, masterName: o.masterId != null ? (masterNameMap.get(Number(o.masterId)) ?? null) : null, amountAtRisk: o.orderAmount ? calculateCommission(Number(o.orderAmount), commSettings) : null, actions: actionSet("no_master_response") });
    }
    // no_payment removed — token model doesn't track prepayment this way
    // no_progress: count from updatedAt (last activity), not from createdAt
    const progressAgeH = o.updatedAt
      ? (now.getTime() - new Date(o.updatedAt).getTime()) / 3600000
      : ageH;
    if (progressAgeH >= 168) {
      // Динамический приоритет: чем дольше нет движения, тем выше
      const progressPriority: Priority = progressAgeH >= 336 ? "critical" : progressAgeH >= 240 ? "high" : "medium";
      items.push({ id: `no_progress-${o.id}`, type: "no_progress", priority: progressPriority, title: `Заказ #${o.id} — нет движения`, shortDescription: `${fmtAge(progressAgeH)} без обновлений`, fullDescription: `Заказ без движения уже ${fmtAge(progressAgeH)}.`, createdAt: new Date(o.updatedAt ?? o.createdAt).toISOString(), updatedAt: new Date(o.updatedAt ?? o.createdAt).toISOString(), lastActionBy: null, deadline: null, status: "open", entityType: "order", entityId: o.id, orderId: o.id, masterId: o.masterId ?? null, clientId: o.leadId ?? null, city: o.city ?? null, masterName: o.masterId != null ? (masterNameMap.get(Number(o.masterId)) ?? null) : null, amountAtRisk: o.orderAmount ? calculateCommission(Number(o.orderAmount), commSettings) : null, actions: actionSet("no_progress") });
    }
    // order_stalled_token: token model removed, no longer generated.
    // possible_bypass из cancelReason убран — заказы с cancelReason уже cancelled и не попадают в выборку
  }
  for (const m of masters) {
    const status = String(m.status ?? "").toLowerCase();
    if (status.includes("blocked") || status.includes("fomo_blocked")) {
      // Динамический приоритет: свежая блокировка — high, старая (>48ч) — critical
      const blockedAt = (m as any).blockedAt ? new Date((m as any).blockedAt) : null;
      const blockedAgeH = blockedAt ? (now.getTime() - blockedAt.getTime()) / 3600000 : (now.getTime() - new Date(m.createdAt).getTime()) / 3600000;
      const blockedPriority: Priority = blockedAgeH >= 48 ? "critical" : blockedAgeH >= 24 ? "high" : "medium";
      const ageStr = blockedAt ? fmtAge(blockedAgeH) : "давно";
      items.push({ id: `blocked_master-${m.id}`, type: "blocked_master", priority: blockedPriority, title: `Мастер ${m.alias} заблокирован`, shortDescription: `${m.city ?? ""} · ${ageStr} в блокировке`.trim(), fullDescription: `Мастер в блокировке / FOMO_BLOCKED уже ${ageStr}. Требует проверки.`, createdAt: (blockedAt ?? new Date(m.createdAt)).toISOString(), updatedAt: (blockedAt ?? new Date(m.createdAt)).toISOString(), lastActionBy: null, deadline: null, status: "open", entityType: "master", entityId: m.id, orderId: null, masterId: m.id, clientId: null, city: m.city ?? null, amountAtRisk: null, actions: actionSet("blocked_master") });
    }
  }
  // Token refunds, master_zero_balance, master_churn_risk: token model removed,
  // these task types no longer generated.
  // (token-related task generators removed — see .kiro/specs/remove-token-payment-model/)
  for (const t of manualTasks) if ((t as any).status !== "done" && (t as any).status !== "dismissed") items.push({ id: `manual-${(t as any).id}`, type: "custom_manual", priority: "low", title: String((t as any).title ?? "Ручная задача"), shortDescription: String((t as any).description ?? ""), fullDescription: String((t as any).description ?? ""), createdAt: new Date((t as any).createdAt ?? now).toISOString(), updatedAt: new Date((t as any).updatedAt ?? t.createdAt ?? now).toISOString(), lastActionBy: (t as any).lastActionBy ?? null, deadline: (t as any).dueAt ? new Date((t as any).dueAt).toISOString() : null, status: (t as any).status ?? "open", entityType: "system", entityId: (t as any).id, orderId: (t as any).relatedOrderId ?? null, masterId: (t as any).relatedMasterId ?? null, clientId: null, city: null, amountAtRisk: null, actions: actionSet("custom_manual") });
  items.sort((a,b)=>({critical:0,high:1,medium:2,low:3}[a.priority]-({critical:0,high:1,medium:2,low:3}[b.priority])) || ((a.deadline?new Date(a.deadline).getTime():Number.MAX_SAFE_INTEGER)-(b.deadline?new Date(b.deadline).getTime():Number.MAX_SAFE_INTEGER)) || (new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime()));
  return items;
}

async function orchestrateDashboardAction(action: string, item: Item, payload: any, operatorName = "Оператор", operatorRole = "operator") {
  const route = actionToRoute[action as keyof typeof actionToRoute] ?? "/tasks";

  // approve_refund / reject_refund actions removed — token model dropped (Phase C)

  if (action === "update_balance" && payload.balance != null) {
    const rows = await db.select().from(avitoSettingsTable).limit(1);
    if (rows[0]) {
      await db.update(avitoSettingsTable)
        .set({ advanceBalance: Number(payload.balance) } as any)
        .where(eq(avitoSettingsTable.id, (rows[0] as any).id));
    }
  }

  if (action === "cancel_order" && item.orderId != null) {
    const orderId = Number(item.orderId);
    const reason = String(payload?.cancelReason ?? "crm_manual");
    // Map CRM cancel reasons to cancelType for scoring (selfCancelRate)
    const cancelTypeMap: Record<string, string> = {
      client_refused: "client_refused",
      master_no_response: "master_cant",
      wrong_order: "other",
      crm_manual: "other",
      other: "other",
    };
    const cancelType = cancelTypeMap[reason] ?? "other";

    // Load order details for notification context (client name, address, service type)
    const [orderRow] = await db.select({
      masterId: ordersTable.masterId,
      leadId: ordersTable.leadId,
      clientName: ordersTable.clientName,
      clientPhone: ordersTable.clientPhone,
      city: ordersTable.city,
      district: ordersTable.district,
      serviceType: ordersTable.serviceType,
    }).from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);

    // Resolve masterId: prefer item.masterId, fall back to order's masterId from DB
    const effectiveMasterId = item.masterId != null ? Number(item.masterId) : (orderRow?.masterId != null ? Number(orderRow.masterId) : null);

    await db.update(ordersTable)
      .set({ status: "cancelled", cancelType, cancelReason: reason, updatedAt: new Date() } as any)
      .where(eq(ordersTable.id, orderId));

    // Lower master reputation + record history — always if masterId is known
    if (effectiveMasterId != null) {
      await recordOrderCancelled(effectiveMasterId, orderId).catch((e: any) => console.error("[cancel_order] reputation update failed:", e));
      await recordOrderMasterHistory(effectiveMasterId, orderId, "cancelled", reason).catch((e: any) => console.error("[cancel_order] history record failed:", e));
    }

    // Notify master about cancellation with order details (client name, address)
    if (effectiveMasterId != null) {
      const [master] = await db.select({ id: mastersTable.id, maxChatId: mastersTable.maxChatId }).from(mastersTable).where(eq(mastersTable.id, effectiveMasterId)).limit(1);
      const reasonLabels: Record<string, string> = {
        client_refused: "клиент отказался",
        master_no_response: "мастер не выходит на связь",
        wrong_order: "ошибка создания заказа",
        crm_manual: "отменено оператором",
        other: "другая причина",
      };
      const reasonText = reasonLabels[reason] ?? reason;

      // Build order context for notification — include service type, client name, address
      const orderParts: string[] = [];
      const displayId = orderRow?.leadId ?? orderId;
      const clientName = orderRow?.clientName ?? null;
      const orderCity = orderRow?.city ?? null;
      const orderDistrict = orderRow?.district ?? null;
      const serviceType = (orderRow as any)?.serviceType ?? null;
      if (serviceType) orderParts.push(serviceType);
      if (clientName) orderParts.push(`клиент: ${clientName}`);
      if (orderCity) orderParts.push(orderCity);
      if (orderDistrict) orderParts.push(orderDistrict);
      const orderCtx = orderParts.length > 0 ? ` (${orderParts.join(", ")})` : "";

      const notifyText = `❌ Заказ #${displayId} отменён (${reasonText})${orderCtx}. Отмена влияет на ваш рейтинг. Свяжитесь с нами для уточнения деталей.`;
      if (master?.maxChatId) {
        await sendMaxMessage(master.maxChatId, notifyText).catch((e: any) => console.error("[cancel_order] max send failed:", e));
      }
      sendPushToMaster(effectiveMasterId, { type: "new_message", title: "Заказ отменён", body: `Заказ #${displayId} отменён: ${reasonText}${orderCtx}.` }).catch((e: any) => console.error("[cancel_order] push failed:", e));
      const chatId = master?.maxChatId ? `max_${master.maxChatId}` : `pwa_${effectiveMasterId}`;
      await db.insert(masterMessagesTable).values({ masterId: effectiveMasterId, telegramChatId: chatId, text: notifyText, fromMaster: false, senderName: operatorName, isRead: true });
    }
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

      // Token model removed — all completed orders go through commission flow.
      {
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
      }

      await recordOrderCompleted(masterId).catch(() => {});
      await recordOrderMasterHistory(masterId, orderId, "completed").catch((e: any) => console.error("[complete_as_master] history record failed:", e));

      const effectiveCommission = commissionMode === "no_debt" ? 0 : commission;
      const commFmt = effectiveCommission > 0 ? `${Math.round(effectiveCommission).toLocaleString("ru-RU")} ₽` : "0 ₽";
      const notifyText =
        commissionMode === "as_debt"
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
      console.log(`[complete_as_master] order #${orderId} fully processed (notifications sent)`);
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
    // Map to cancelType for scoring (selfCancelRate in masterScoring.ts)
    const cancelTypeMap: Record<string, string> = {
      bypass: "other",
      no_contact: "master_cant",
      no_estimate: "master_cant",
      other: "other",
    };
    const cancelType = cancelTypeMap[cancelReason] ?? "other";

    await db.update(ordersTable)
      .set({ status: "cancelled", cancelType, cancelReason: cancelReason === "bypass" ? "master_cancel_bypass" : `master_cancel_${cancelReason}`, updatedAt: now } as any)
      .where(eq(ordersTable.id, orderId));
    console.log(`[cancel_as_master] order #${orderId} marked cancelled (reason=${cancelReason})`);

    await recordOrderCancelled(masterId, orderId).catch((e) => console.error("[cancel_as_master] reputation update failed:", e));
    await recordOrderMasterHistory(masterId, orderId, "cancelled", cancelReason === "bypass" ? "Обход платформы" : cancelReason).catch((e: any) => console.error("[cancel_as_master] history record failed:", e));

    // Load order details for notification context
    const [orderRow] = await db.select({
      leadId: ordersTable.leadId,
      clientName: ordersTable.clientName,
      city: ordersTable.city,
      district: ordersTable.district,
      serviceType: ordersTable.serviceType,
    }).from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);

    const reasonText = cancelReason === "no_contact"
      ? "мастер не выходит на связь"
      : cancelReason === "no_estimate"
      ? "мастер не отправил смету"
      : cancelReason === "other"
      ? "другая причина"
      : "обход платформы";

    // Build order context for notification — include service type, client name, address
    const orderParts: string[] = [];
    const displayId = orderRow?.leadId ?? orderId;
    const clientName = orderRow?.clientName ?? null;
    const orderCity = orderRow?.city ?? null;
    const orderDistrict = orderRow?.district ?? null;
    const serviceType = (orderRow as any)?.serviceType ?? null;
    if (serviceType) orderParts.push(serviceType);
    if (clientName) orderParts.push(`клиент: ${clientName}`);
    if (orderCity) orderParts.push(orderCity);
    if (orderDistrict) orderParts.push(orderDistrict);
    const orderCtx = orderParts.length > 0 ? ` (${orderParts.join(", ")})` : "";

    const notifyText = `⚠️ Заказ #${displayId} отменён оператором (причина: ${reasonText})${orderCtx}. Отмена засчитана вам. Свяжитесь с нами для уточнения деталей.`;
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
      body: `Заказ #${displayId} отменён: ${reasonText}${orderCtx}.`,
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
    console.log(`[cancel_as_master] order #${orderId} fully processed (notifications sent)`);
    invalidateBuildItemsCache();
  }

  if (action === "return_to_pool" && item.orderId != null) {
    // Проверяем что у заказа есть мастер — иначе возвращать в пул бессмысленно
    if (item.masterId == null) {
      throw Object.assign(new Error("У заказа нет назначенного мастера — возвращать в пул не нужно"), { status: 400 });
    }
    // Record cancellation for reputation + notify master before resetting masterId
    {
      const masterId = Number(item.masterId);
      const orderId = Number(item.orderId);
      await recordOrderCancelled(masterId, orderId)
        .catch((e: any) => console.error("[return_to_pool] reputation update failed:", e));
      await recordOrderMasterHistory(masterId, orderId, "returned_to_pool", "Возвращён в пул оператором")
        .catch((e: any) => console.error("[return_to_pool] history record failed:", e));

      // Notify master that order was returned to pool
      const [master] = await db.select({ id: mastersTable.id, maxChatId: mastersTable.maxChatId })
        .from(mastersTable)
        .where(eq(mastersTable.id, masterId))
        .limit(1);
      if (master) {
        const notifyText = `🔄 Заказ #${orderId} возвращён в пул и переназначен другому мастеру. Частые возвраты снижают ваш рейтинг и могут привести к блокировке.`;
        if (master.maxChatId) {
          await sendMaxMessage(master.maxChatId, notifyText).catch((e: any) => console.error("[return_to_pool] max send failed:", e));
        }
        sendPushToMaster(masterId, { type: "new_message", title: "Заказ возвращён в пул", body: `Заказ #${orderId} переназначен другому мастеру.` }).catch((e: any) => console.error("[return_to_pool] push failed:", e));
        const chatId = master.maxChatId ? `max_${master.maxChatId}` : `pwa_${masterId}`;
        await db.insert(masterMessagesTable).values({
          masterId,
          telegramChatId: chatId,
          text: notifyText,
          fromMaster: false,
          senderName: operatorName,
          isRead: true,
        }).catch((e: any) => console.error("[return_to_pool] message save failed:", e));
      }
    }
    // Delete all dispatch records so the order can be re-broadcast from scratch
    await db.delete(orderDispatchesTable)
      .where(eq(orderDispatchesTable.orderId, Number(item.orderId)))
      .catch((e: any) => console.error("[return_to_pool] dispatches delete failed:", e));
    await db.update(ordersTable)
      .set({ masterId: null, status: "waiting_master", assignedAt: null, lastBroadcastAt: null, broadcastCount: 0, dispatchStatus: "none", dispatchWave: 1, updatedAt: new Date() } as any)
      .where(eq(ordersTable.id, Number(item.orderId)));
    invalidateBuildItemsCache();
  }

  if (action === "manual_unblock" && item.masterId != null) {
    await db.update(mastersTable)
      .set({ status: "active", blockedAt: null, blockedReason: null } as any)
      .where(eq(mastersTable.id, Number(item.masterId)));
    invalidateBuildItemsCache();
  }

  if (action === "block_master" && item.masterId != null) {
    await db.update(mastersTable)
      .set({ status: "blocked", blockedAt: new Date(), blockedReason: "crm_manual" } as any)
      .where(eq(mastersTable.id, Number(item.masterId)));
    invalidateBuildItemsCache();
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

    const [master] = await db.select({ id: mastersTable.id, maxChatId: mastersTable.maxChatId }).from(mastersTable).where(eq(mastersTable.id, masterId)).limit(1);
    // Уведомление мастеру — говорим об остатке КОМИССИИ, а не суммы заказа
    const notifyText = remainingCommission > 0
      ? `💰 Комиссия по заказу${orderId ? ` #${orderId}` : ""} частично оплачена: ${paidCommission.toLocaleString("ru-RU")} ₽ из ${totalCommission.toLocaleString("ru-RU")} ₽. Остаток: ${remainingCommission.toLocaleString("ru-RU")} ₽.`
      : `✅ Комиссия по заказу${orderId ? ` #${orderId}` : ""} полностью оплачена: ${paidCommission.toLocaleString("ru-RU")} ₽. Спасибо!`;
    if (master?.maxChatId) {
      await sendMaxMessage(master.maxChatId, notifyText).catch((e: any) => console.error("[partial_payment] max send failed:", e));
    }
    sendPushToMaster(masterId, {
      type: "new_message",
      title: "Оплата зафиксирована",
      body: remainingCommission > 0
        ? `Комиссия: принято ${paidCommission.toLocaleString("ru-RU")} ₽, остаток ${remainingCommission.toLocaleString("ru-RU")} ₽`
        : `Комиссия ${paidCommission.toLocaleString("ru-RU")} ₽ полностью оплачена`,
    }).catch((e: any) => console.error("[partial_payment] push failed:", e));
    const chatId = master?.maxChatId ? `max_${master.maxChatId}` : `pwa_${masterId}`;
    await db.insert(masterMessagesTable).values({ masterId, telegramChatId: chatId, text: notifyText, fromMaster: false, senderName: operatorName, isRead: true });
    console.log(`[partial_payment] master #${masterId} paid ${paidCommission} of ${totalCommission}, remaining=${remainingCommission}`);

    // Update proposedAmount on the order so hasEstimate logic works correctly
    if (orderId != null && orderAmount > 0) {
      await db.update(ordersTable)
        .set({ proposedAmount: String(orderAmount), updatedAt: now } as any)
        .where(eq(ordersTable.id, orderId));
      console.log(`[partial_payment] order #${orderId} proposedAmount set to ${orderAmount}`);
    }

    // Инвалидируем кэш — задача должна исчезнуть из списка сразу после оплаты
    invalidateBuildItemsCache();
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
    invalidateBuildItemsCache();
  }

  if (action === "confirm_receipt" && item.entityId != null) {
    // entityId для receipt-задач — это id записи в receipts
    const receiptId = Number(item.entityId);
    const now = new Date();
    // Проверяем, не был ли receipt уже подтверждён (защита от двойной оплаты)
    const [existingReceipt] = await db.select({ prepaymentSeenAt: receiptsTable.prepaymentSeenAt })
      .from(receiptsTable)
      .where(eq(receiptsTable.id, receiptId))
      .limit(1);
    if (existingReceipt?.prepaymentSeenAt) {
      throw Object.assign(new Error(`Оплата по квитанции #${receiptId} уже подтверждена ${new Date(existingReceipt.prepaymentSeenAt).toLocaleString("ru-RU")}`), { status: 409 });
    }
    // Обновляем prepaymentSeenAt на receipt
    await db.update(receiptsTable)
      .set({ prepaymentSeenAt: now } as any)
      .where(eq(receiptsTable.id, receiptId));
    // Обновляем orderAmount на заказе (сумма предоплаты из receipt) — только если ещё не установлен
    if (item.orderId != null) {
      const prepaymentAmount = Number(item.amountAtRisk ?? 0);
      if (prepaymentAmount > 0) {
        const [existingOrder] = await db.select({ orderAmount: ordersTable.orderAmount })
          .from(ordersTable)
          .where(eq(ordersTable.id, Number(item.orderId)))
          .limit(1);
        const currentAmount = Number(existingOrder?.orderAmount ?? 0);
        // Обновляем только если текущая сумма не совпадает (защита от перезаписи)
        if (currentAmount !== prepaymentAmount) {
          await db.update(ordersTable)
            .set({ orderAmount: String(prepaymentAmount), updatedAt: now } as any)
            .where(eq(ordersTable.id, Number(item.orderId)));
          console.log(`[confirm_receipt] order #${item.orderId} orderAmount set to ${prepaymentAmount}`);
        } else {
          console.log(`[confirm_receipt] order #${item.orderId} orderAmount already ${prepaymentAmount}, skipping update`);
        }
      }
    }
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
    // Инвалидируем кэш — задача подтверждения оплаты должна исчезнуть сразу
    invalidateBuildItemsCache();
    return { routedTo: "/finance", applied: true, action, payload, itemId: item.id, confirmedAt: now.toISOString() };
  }

  // ─── assign_self: назначить текущего оператора на заказ ──────────
  if (action === "assign_self" && item.orderId != null) {
    const operatorId = (payload as any)?.operatorId ?? null;
    if (operatorId) {
      await db.update(ordersTable)
        .set({ assigneeId: String(operatorId), updatedAt: new Date() } as any)
        .where(eq(ordersTable.id, Number(item.orderId)));
    }
    // Для systemTask / chatCase — snooze на 7 дней (оператор взял на себя)
    const snoozedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.insert(taskSnoozesTable)
      .values({ itemId: item.id, snoozedUntil, snoozedBy: operatorName })
      .onConflictDoUpdate({ target: taskSnoozesTable.itemId, set: { snoozedUntil, snoozedBy: operatorName } });
    return { routedTo: "/orders", applied: true, action, payload, itemId: item.id, snoozedUntil: snoozedUntil.toISOString() };
  }

  // ─── manual_control: перевести заказ в ручной контроль ──────────
  if (action === "manual_control" && item.orderId != null) {
    await db.update(ordersTable)
      .set({ dispatchStatus: "manual", updatedAt: new Date() } as any)
      .where(eq(ordersTable.id, Number(item.orderId)));
  }

  // ─── resend: повторная рассылка заказа мастерам ──────────────────
  if (action === "resend" && item.orderId != null) {
    // Delete old dispatch records so order can be re-broadcast
    await db.delete(orderDispatchesTable)
      .where(eq(orderDispatchesTable.orderId, Number(item.orderId)))
      .catch((e: any) => console.error("[resend] dispatches delete failed:", e));
    // Reset order to waiting_master for re-broadcast
    await db.update(ordersTable)
      .set({ status: "waiting_master", dispatchStatus: "none", dispatchWave: 1, lastBroadcastAt: null, broadcastCount: 0, updatedAt: new Date() } as any)
      .where(eq(ordersTable.id, Number(item.orderId)));
  }

  // ─── dismiss: отложить задачу (snooze на 30 дней) ──────────────
  if (action === "dismiss") {
    const snoozedUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(taskSnoozesTable)
      .values({ itemId: item.id, snoozedUntil, snoozedBy: operatorName })
      .onConflictDoUpdate({ target: taskSnoozesTable.itemId, set: { snoozedUntil, snoozedBy: operatorName } });
    invalidateBuildItemsCache();
    return { routedTo: "/tasks", applied: true, action, payload, itemId: item.id, snoozedUntil: snoozedUntil.toISOString() };
  }

  // ─── resolve: пометить задачу выполненной ───────────────────────
  // ВНИМАНИЕ: resolve не удаляет задачу — она snooze'ится на 14 дней.
  // Если проблема не решена по истечении 14 дней, задача появится снова.
  // Это защита от случайного "выполнено" — оператор должен убедиться, что проблема реально устранена.
  if (action === "resolve") {
    // Для systemTask — пометить как done в БД (безвозвратно)
    if (item.id.startsWith("manual-")) {
      const taskId = Number(item.entityId);
      if (Number.isFinite(taskId)) {
        await db.update(systemTasksTable)
          .set({ status: "done", updatedAt: new Date() } as any)
          .where(eq(systemTasksTable.id, taskId));
      }
    }
    // Для остальных — snooze на 14 дней (задача исчезнет, но вернётся если проблема не решена)
    const RESOLVE_SNOOZE_DAYS = 14;
    const snoozedUntil = new Date(Date.now() + RESOLVE_SNOOZE_DAYS * 24 * 60 * 60 * 1000);
    await db.insert(taskSnoozesTable)
      .values({ itemId: item.id, snoozedUntil, snoozedBy: operatorName })
      .onConflictDoUpdate({ target: taskSnoozesTable.itemId, set: { snoozedUntil, snoozedBy: operatorName } });
    invalidateBuildItemsCache();
    return { routedTo: "/tasks", applied: true, action, payload, itemId: item.id, snoozedUntil: snoozedUntil.toISOString() };
  }

  // ─── call_master: вернуть телефон мастера для tel: ссылки ───────
  if (action === "call_master" && item.masterId != null) {
    const [m] = await db.select({ phone: mastersTable.phone }).from(mastersTable).where(eq(mastersTable.id, Number(item.masterId))).limit(1);
    return { routedTo: "/master-chat", applied: true, action, payload, itemId: item.id, masterPhone: (m as any)?.phone ?? null };
  }

  // ─── open_issue_order: вернуть данные проблемного заказа ─────────
  if (action === "open_issue_order" && item.orderId != null) {
    return { routedTo: "/orders", applied: true, action, payload, itemId: item.id, orderId: Number(item.orderId) };
  }

  return { routedTo: route, applied: true, action, payload, itemId: item.id };
}

// ─── Диагностика и сброс snooze-записей ─────────────────────────────────────
router.get("/action-items/debug", ops, async (req: any, res: any) => {
  try {
    const now = new Date();
    const [allOrders, activeOrders, snoozes, blockedMasters, manualTasks, receipts, txRows, txPayments] = await Promise.all([
      db.select({ id: ordersTable.id, status: ordersTable.status, createdAt: ordersTable.createdAt, updatedAt: ordersTable.updatedAt, proposedAmount: ordersTable.proposedAmount, orderAmount: ordersTable.orderAmount, masterId: ordersTable.masterId, assignedAt: ordersTable.assignedAt })
        .from(ordersTable).where(isNull(ordersTable.deletedAt)),
      db.select({ id: ordersTable.id, status: ordersTable.status, createdAt: ordersTable.createdAt, updatedAt: ordersTable.updatedAt, proposedAmount: ordersTable.proposedAmount, orderAmount: ordersTable.orderAmount, masterId: ordersTable.masterId, assignedAt: ordersTable.assignedAt })
        .from(ordersTable).where(and(isNull(ordersTable.deletedAt), not(inArray(ordersTable.status, ["completed", "cancelled"])))),
      db.select().from(taskSnoozesTable).where(gt(taskSnoozesTable.snoozedUntil, now)),
      db.select({ id: mastersTable.id, alias: mastersTable.alias, status: mastersTable.status })
        .from(mastersTable).where(and(isNull(mastersTable.deletedAt), sql`${mastersTable.status}::text ilike '%blocked%'`)),
      db.select({ id: (systemTasksTable as any).id, status: (systemTasksTable as any).status })
        .from(systemTasksTable),
      db.select({ id: receiptsTable.id, orderId: receiptsTable.orderId, prepaymentSubmittedAt: receiptsTable.prepaymentSubmittedAt, prepaymentSeenAt: receiptsTable.prepaymentSeenAt })
        .from(receiptsTable),
      db.select({ id: transactionsTable.id, orderId: transactionsTable.orderId, orderAmount: transactionsTable.orderAmount }).from(transactionsTable),
      db.select({ transactionId: transactionPaymentsTable.transactionId }).from(transactionPaymentsTable).limit(5000),
    ]);

    // Статусы активных заказов
    const statusCounts: Record<string, number> = {};
    for (const o of activeOrders) {
      const s = String(o.status ?? "unknown");
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    }

    // Возраст активных заказов
    const ageGroups = { lt24h: 0, h24_48: 0, h48_168: 0, gt168h: 0 };
    for (const o of activeOrders) {
      const ageH = (now.getTime() - new Date(o.createdAt).getTime()) / 3600000;
      if (ageH < 24) ageGroups.lt24h++;
      else if (ageH < 48) ageGroups.h24_48++;
      else if (ageH < 168) ageGroups.h48_168++;
      else ageGroups.gt168h++;
    }

    // Receipts ожидающие подтверждения
    const pendingReceipts = receipts.filter((r: any) => r.prepaymentSubmittedAt && !r.prepaymentSeenAt).length;

    // Ручные задачи не закрытые
    const openManualTasks = manualTasks.filter((t: any) => t.status !== "done" && t.status !== "dismissed").length;

    // Активные snooze
    const activeSnoozedIds = snoozes.map((s: any) => s.itemId ?? s.taskId);

    // Полная проверка hasEstimate (идентична buildItems)
    const receiptOrderIds = new Set(receipts.filter((r: any) => r.orderId != null).map((r: any) => Number(r.orderId)));
    const txIdsWithPayments = new Set(txPayments.map((p: any) => p.transactionId));
    const txOrderIds = new Set(txRows.filter((t: any) => Number(t.orderAmount ?? 0) > 0).map((t: any) => Number(t.orderId)));
    const txOrderIdsWithPayments = new Set(txRows.filter((t: any) => txIdsWithPayments.has(t.id)).map((t: any) => Number(t.orderId)));

    // Детальный анализ каждого активного заказа
    const orderDetails = activeOrders.map(o => {
      const ageH = (now.getTime() - new Date(o.createdAt).getTime()) / 3600000;
      const progressAgeH = o.updatedAt
        ? (now.getTime() - new Date(o.updatedAt).getTime()) / 3600000
        : ageH;
      const hasEstimate = (o.proposedAmount != null && Number(o.proposedAmount) > 0)
        || receiptOrderIds.has(Number(o.id))
        || txOrderIds.has(Number(o.id))
        || txOrderIdsWithPayments.has(Number(o.id));
      const reasons: string[] = [];
      // no_estimate
      if (!hasEstimate && ageH >= 24) reasons.push("✅ ЗАДАЧА: no_estimate");
      else if (!hasEstimate && ageH < 24) reasons.push(`⏳ no_estimate: слишком молодой (${Math.round(ageH)}ч < 24ч)`);
      else reasons.push(`✅ no_estimate: не нужна (есть смета/оплата: proposedAmount=${o.proposedAmount}, receipt=${receiptOrderIds.has(Number(o.id))}, tx=${txOrderIds.has(Number(o.id))})`);
      // no_payment
      if (o.proposedAmount && !o.orderAmount && ageH >= 24) reasons.push("✅ ЗАДАЧА: no_payment");
      // no_progress
      if (progressAgeH >= 168) reasons.push(`✅ ЗАДАЧА: no_progress (${Math.round(progressAgeH)}ч без обновлений)`);
      else reasons.push(`⏳ no_progress: ${Math.round(progressAgeH)}ч < 168ч`);
      // snooze
      const snoozedKeys = [`no_estimate-${o.id}`, `no_payment-${o.id}`, `no_progress-${o.id}`, `no_master_response-${o.id}`];
      const snoozedSet = new Set(activeSnoozedIds);
      const snoozedHere = snoozedKeys.filter(k => snoozedSet.has(k));
      if (snoozedHere.length > 0) reasons.push(`😴 SNOOZE активен: ${snoozedHere.join(", ")}`);
      return {
        id: o.id,
        status: o.status,
        ageH: Math.round(ageH),
        progressAgeH: Math.round(progressAgeH),
        hasEstimate,
        proposedAmount: o.proposedAmount,
        orderAmount: o.orderAmount,
        hasMaster: o.masterId != null,
        reasons,
      };
    });

    const noEstimateCount = orderDetails.filter(o => o.reasons.some(r => r.includes("ЗАДАЧА: no_estimate"))).length;

    res.json({
      summary: {
        totalOrders: allOrders.length,
        activeOrders: activeOrders.length,
        completedOrCancelled: allOrders.length - activeOrders.length,
        activeSnoozesCount: snoozes.length,
        blockedMastersCount: blockedMasters.length,
        openManualTasks,
        pendingReceipts,
        noEstimateOrdersOlderThan24h: noEstimateCount,
      },
      activeOrderStatusBreakdown: statusCounts,
      activeOrderAgeBreakdown: ageGroups,
      activeSnoozedTaskIds: activeSnoozedIds,
      blockedMasters: blockedMasters.map(m => ({ id: m.id, alias: m.alias, status: m.status })),
      // Детальный анализ — первые 20 активных заказов
      orderDetails: orderDetails.slice(0, 20),
      diagnosis: (() => {
        const reasons: string[] = [];
        if (activeOrders.length === 0) reasons.push("❌ Нет активных заказов — все завершены или отменены");
        if (activeOrders.length > 0 && ageGroups.lt24h === activeOrders.length) reasons.push("⏳ Все активные заказы моложе 24 часов — задачи ещё не генерируются");
        if (snoozes.length > 0) reasons.push(`😴 ${snoozes.length} задач отложены (snooze активен): ${activeSnoozedIds.slice(0, 10).join(", ")}`);
        if (activeOrders.length > 0 && noEstimateCount === 0 && ageGroups.lt24h < activeOrders.length) reasons.push("✅ У всех заказов старше 24ч есть смета или оплата — задача no_estimate не нужна");
        if (pendingReceipts > 0) reasons.push(`⚠️ Есть ${pendingReceipts} неподтверждённых оплат — должны быть задачи receipt`);
        if (blockedMasters.length > 0) reasons.push(`⚠️ Есть ${blockedMasters.length} заблокированных мастеров — должны быть задачи blocked_master`);
        if (reasons.length === 0 && activeOrders.length > 0) reasons.push("⚠️ Активные заказы есть, но задачи не генерируются — все условия выполнены (нет проблем)");
        return reasons;
      })(),
    });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e) });
  }
});

router.get("/action-items/snoozes", ops, async (req: any, res: any) => {
  try {
    const now = new Date();
    const activeSnoozes = await db.select()
      .from(taskSnoozesTable)
      .where(gt(taskSnoozesTable.snoozedUntil, now));
    res.json({
      count: activeSnoozes.length,
      snoozes: activeSnoozes.map((s: any) => ({
        itemId: s.itemId,
        snoozedUntil: s.snoozedUntil,
        snoozedBy: s.snoozedBy,
        createdAt: s.createdAt,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Ошибка" });
  }
});

router.delete("/action-items/snoozes", ops, async (req: any, res: any) => {
  try {
    const now = new Date();
    // Удаляем только активные snooze (snoozedUntil > now)
    const active = await db.select({ id: taskSnoozesTable.id, itemId: taskSnoozesTable.itemId })
      .from(taskSnoozesTable)
      .where(gt(taskSnoozesTable.snoozedUntil, now));
    if (active.length > 0) {
      const ids = active.map((s: any) => s.id);
      await db.delete(taskSnoozesTable)
        .where(inArray(taskSnoozesTable.id, ids));
    }
    invalidateBuildItemsCache();
    console.log(`[snoozes/reset] cleared ${active.length} active snoozes by ${(req as any).user?.name ?? "operator"}`);
    res.json({ cleared: active.length, itemIds: active.map((s: any) => s.itemId) });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Ошибка" });
  }
});

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
  // doneToday: count tasks actually resolved today (resolve action = real completion, dismiss = just postponed)
  let doneToday = 0;
  try {
    const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
    // 1) systemTasks completed today
    const doneSystemTasks = await db.select().from(systemTasksTable).where(eq(systemTasksTable.status, "done")).limit(200);
    doneToday += doneSystemTasks.filter((t: any) => t.updatedAt && new Date(t.updatedAt) >= startOfToday).length;
    // 2) Snoozed tasks with resolve snooze (14 days) created today — these are "resolved" actions
    //    Dismiss uses 30-day snooze, so we only count 14-day snoozes as "done"
    const RESOLVE_SNOOZE_DAYS = 14;
    const resolvedSnoozes = await db.select().from(taskSnoozesTable)
      .where(and(
        gt(taskSnoozesTable.snoozedUntil, new Date(startOfToday.getTime() + (RESOLVE_SNOOZE_DAYS - 1) * 24 * 60 * 60 * 1000)),
        lte(taskSnoozesTable.snoozedUntil, new Date(startOfToday.getTime() + (RESOLVE_SNOOZE_DAYS + 1) * 24 * 60 * 60 * 1000)),
      )).limit(500);
    // Only count snoozes created today (check by reverse-calculating creation time from snoozedUntil)
    doneToday += resolvedSnoozes.filter((s: any) => {
      const created = s.snoozedUntil ? new Date(s.snoozedUntil).getTime() - RESOLVE_SNOOZE_DAYS * 24 * 60 * 60 * 1000 : 0;
      return created >= startOfToday.getTime();
    }).length;
  } catch (e: any) {
    console.warn("[action-items] doneToday count failed:", e?.message);
  }
  const summary = { critical: items.filter((i) => i.priority === "critical").length, high: items.filter((i) => i.priority === "high").length, medium: items.filter((i) => i.priority === "medium").length, low: items.filter((i) => i.priority === "low").length, doneToday };
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
    const [o] = await db.select({ id: ordersTable.id, proposedAmount: ordersTable.proposedAmount, orderAmount: ordersTable.orderAmount, prepaymentAmount: ordersTable.prepaymentAmount, status: ordersTable.status, clientName: ordersTable.clientName, clientPhone: ordersTable.clientPhone, city: ordersTable.city, district: ordersTable.district, createdAt: ordersTable.createdAt, assignedAt: ordersTable.assignedAt, updatedAt: ordersTable.updatedAt }).from(ordersTable).where(eq(ordersTable.id, Number(item.orderId))).limit(1);
    if (o) {
      const ageH = Math.round((Date.now() - new Date(o.createdAt).getTime()) / 3600000);
      const assignedAt = (o as any).assignedAt ?? null;
      const updatedAt = (o as any).updatedAt ?? null;
      // hoursWithoutEstimate: real age from order creation (not assignedAt which can be stale)
      const hoursWithoutEstimate = ageH;
      // hoursWithCurrentMaster: how long the current master has had the order
      const hoursWithCurrentMaster = assignedAt
        ? Math.round((Date.now() - new Date(assignedAt).getTime()) / 3600000)
        : ageH;
      // hoursWithoutProgress: count from updatedAt (last activity), not from order creation
      const hoursWithoutProgress = updatedAt
        ? Math.round((Date.now() - new Date(updatedAt).getTime()) / 3600000)
        : ageH;
      ctx.order = { id: o.id, proposedAmount: o.proposedAmount ? Number(o.proposedAmount) : null, orderAmount: o.orderAmount ? Number(o.orderAmount) : null, prepaymentAmount: o.prepaymentAmount ? Number(o.prepaymentAmount) : null, status: o.status, clientName: (o as any).clientName ?? null, clientPhone: (o as any).clientPhone ?? null, city: o.city, district: o.district ?? null, hoursOld: ageH, hoursWithoutEstimate, hoursWithCurrentMaster, hoursWithoutProgress };
    }
  }

  if (item.clientId != null) {
    const [l] = await db.select({ id: leadsTable.id, clientName: leadsTable.clientName, clientPhone: leadsTable.clientPhone, city: leadsTable.city }).from(leadsTable).where(eq(leadsTable.id, Number(item.clientId))).limit(1);
    if (l) ctx.client = l;
  }

  if (item.type === "no_master_response" || item.type === "no_estimate" || item.type === "no_progress") {
    const avail = await db.select({ id: mastersTable.id, alias: mastersTable.alias, city: mastersTable.city, status: mastersTable.status }).from(mastersTable).where(and(eq(mastersTable.status, "active"), isNull(mastersTable.deletedAt))).limit(30);
    ctx.availableMasters = avail.map((m: any) => ({ id: m.id, name: m.alias ?? `Мастер #${m.id}`, city: m.city }));
  }

  // Load receipt (with token for estimate link) for no_estimate, no_payment and no_progress
  if ((item.type === "no_estimate" || item.type === "no_payment" || item.type === "no_progress") && item.orderId != null) {
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
    // Fallback: ищем по orderId И masterId одновременно (оба должны совпадать)
    // Это предотвращает случайное нахождение чужой задачи
    const orderId = Number((payload as any)?.orderId);
    const masterId = Number((payload as any)?.masterId);
    if (Number.isFinite(orderId) && Number.isFinite(masterId)) {
      item = items.find((i) => i.orderId != null && Number(i.orderId) === orderId && i.masterId != null && Number(i.masterId) === masterId);
    }
    if (!item && Number.isFinite(orderId)) {
      // Последний fallback: только по orderId, но проверяем что задача подходящего типа
      item = items.find((i) => i.orderId != null && Number(i.orderId) === orderId && ["possible_bypass", "conflict", "no_estimate", "no_payment", "no_progress"].includes(i.type));
    }
  }
  if (!item) return res.status(404).json({ error: "Не найдено" });
  if (!["message_master", "call_client", "reassign", "cancel_order", "cancel_as_master", "complete_as_master", "partial_payment", "return_to_pool", "resolve", "dismiss", "snooze", "update_balance", "manual_unblock", "call_master", "resend", "block_master", "manual_control", "open_issue_order", "confirm_receipt", "assign_self", "approve_refund", "reject_refund"].includes(action)) return res.status(400).json({ error: "Недопустимое действие" });
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

// ─── AI-hint endpoint ────────────────────────────────────────────────────────
const openaiApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const openaiBaseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const openaiClient = openaiApiKey
  ? new OpenAI({ apiKey: openaiApiKey, baseURL: openaiBaseURL })
  : null;

const TYPE_HINT_CONTEXT: Record<string, string> = {
  no_estimate: "Мастер не отправил смету клиенту. Нужно срочно связаться с мастером и напомнить, либо переназначить заказ другому мастеру.",
  no_payment: "(deprecated) Комиссионная задача, больше не генерируется в token-модели.",
  no_master_response: "Заказ висит без отклика мастера. Нужно либо повторно разослать, либо назначить мастера вручную.",
  no_progress: "Заказ давно без обновлений. Нужно уточнить у мастера статус работ.",
  blocked_master: "Мастер заблокирован. Нужно проверить причину и решить — разблокировать или оставить.",
  possible_bypass: "Подозрение на обход платформы. Нужно связаться с мастером и проверить ситуацию.",
  conflict: "Конфликтная ситуация по заказу. Требует внимания оператора.",
  token_refund_pending: "Мастер запросил возврат токена. Нужно проверить заявку и решить — одобрить или отклонить.",
  master_zero_balance: "У мастера закончились токены. Нужно напомнить о покупке, иначе он не сможет принимать заказы.",
  master_churn_risk: "Мастер давно не покупал токены. Риск оттока — нужен proactive-контакт.",
  order_stalled_token: "Заказ завис, а у назначенного мастера нет токенов. Нужно переназначить или отменить.",
  no_manager_id: "Нет назначенного менеджера. Нужно назначить ответственного.",
  custom_manual: "Ручная задача. Требует внимания оператора.",
};

router.post("/action-items/:id/ai-hint", ops, async (req: any, res: any) => {
  const items = await buildItems();
  const item = items.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Не найдено" });

  if (!openaiClient) {
    // Fallback: return a rule-based hint without AI
    const typeHint = TYPE_HINT_CONTEXT[item.type] ?? "Требует внимания оператора.";
    const ageH = Math.round((Date.now() - new Date(item.createdAt).getTime()) / 3600000);
    const ageStr = ageH >= 48 ? `${Math.round(ageH / 24)} дн.` : `${ageH} ч`;
    const hint = `${typeHint} Задача висит уже ${ageStr}. Приоритет: ${item.priority}. ${item.masterName ? `Мастер: ${item.masterName}.` : ""} ${item.amountAtRisk ? `Под риском: ${Number(item.amountAtRisk).toLocaleString("ru-RU")} ₽.` : ""}`;
    return res.json({ hint });
  }

  try {
    const ageH = Math.round((Date.now() - new Date(item.createdAt).getTime()) / 3600000);
    const ageStr = ageH >= 48 ? `${Math.round(ageH / 24)} ${pluralRu(Math.round(ageH / 24), "день", "дня", "дней")}` : `${ageH} ${pluralRu(ageH, "час", "часа", "часов")}`;
    const deadlineStr = item.deadline ? `Дедлайн: ${new Date(item.deadline).toLocaleString("ru-RU")}.` : "Дедлайна нет.";
    const actionsStr = item.actions.map(a => a.label).join(", ");

    const prompt = `Ты — AI-ассистент диспетчера CRM-системы ремонта квартир. Дай короткий конкретный совет (1-2 предложения) по задаче:

Задача: ${item.title}
Описание: ${item.fullDescription}
Тип: ${item.type}
Приоритет: ${item.priority}
Возраст: ${ageStr}
${deadlineStr}
Мастер: ${item.masterName ?? "не назначен"}
Город: ${item.city ?? "не указан"}
Сумма под риском: ${item.amountAtRisk ? `${Number(item.amountAtRisk).toLocaleString("ru-RU")} ₽` : "нет"}
Доступные действия: ${actionsStr}

Дай конкретный совет: что лучше сделать прямо сейчас и почему. Ответь на русском, 1-2 предложения, без лишних слов.`;

    const completion = await openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 150,
      temperature: 0.7,
    });

    const hint = completion.choices?.[0]?.message?.content?.trim()
      ?? TYPE_HINT_CONTEXT[item.type]
      ?? "Свяжитесь с мастером и уточните статус.";

    return res.json({ hint });
  } catch (e: any) {
    console.error("[ai-hint] OpenAI call failed:", e?.message);
    // Fallback to rule-based hint
    const typeHint = TYPE_HINT_CONTEXT[item.type] ?? "Требует внимания оператора.";
    const ageH = Math.round((Date.now() - new Date(item.createdAt).getTime()) / 3600000);
    const ageStr = ageH >= 48 ? `${Math.round(ageH / 24)} дн.` : `${ageH} ч`;
    const hint = `${typeHint} Задача висит уже ${ageStr}. ${item.masterName ? `Мастер: ${item.masterName}.` : ""}`;
    return res.json({ hint });
  }
});

export default router;
export { buildItems };
