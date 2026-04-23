import { db, leadsTable, ordersTable, receiptsTable } from "@workspace/db";
import { and, eq, isNull, isNotNull, sql } from "drizzle-orm";

export type TaskType =
  | "send_to_work"
  | "no_master_response"
  | "cancel_request"
  | "price_proposal"
  | "confirm_prepayment";

export type TaskPriority = "critical" | "high" | "normal";

export interface OperatorTask {
  id: string;
  type: TaskType;
  priority: TaskPriority;
  title: string;
  subtitle: string;
  leadId: number | null;
  orderId: number | null;
  ageMinutes: number;
  slaMinutes: number;
  overdueMinutes: number;
}

export const TASK_SLA = {
  sendToWork: 15,
  masterResponse: 30,
  cancelDecision: 60,
  priceDecision: 60,
  prepaymentConfirm: 30,
} as const;

function priorityFor(overdueMin: number, slaMin: number): TaskPriority {
  if (overdueMin > slaMin) return "critical";
  if (overdueMin > 0) return "high";
  return "normal";
}

export async function getOperatorTasks(): Promise<OperatorTask[]> {
  const now = Date.now();
  const tasks: OperatorTask[] = [];

  const [newLeads, waitingOrders, cancelOrders, priceOrders, pendingReceipts] = await Promise.all([
    db.select({
      id: leadsTable.id,
      clientName: leadsTable.clientName,
      city: leadsTable.city,
      serviceType: leadsTable.serviceType,
      createdAt: leadsTable.createdAt,
    })
      .from(leadsTable)
      .where(and(eq(leadsTable.status, "new"), isNull(leadsTable.deletedAt))),

    db.select({
      orderId: ordersTable.id,
      leadId: ordersTable.leadId,
      city: ordersTable.city,
      serviceType: ordersTable.serviceType,
      createdAt: ordersTable.createdAt,
      lastBroadcastAt: ordersTable.lastBroadcastAt,
      clientName: leadsTable.clientName,
    })
      .from(ordersTable)
      .leftJoin(leadsTable, eq(ordersTable.leadId, leadsTable.id))
      .where(and(eq(ordersTable.status, "waiting_master"), isNull(ordersTable.deletedAt))),

    db.select({
      orderId: ordersTable.id,
      leadId: ordersTable.leadId,
      city: ordersTable.city,
      serviceType: ordersTable.serviceType,
      cancelReason: ordersTable.cancelReason,
      updatedAt: ordersTable.updatedAt,
      clientName: leadsTable.clientName,
    })
      .from(ordersTable)
      .leftJoin(leadsTable, eq(ordersTable.leadId, leadsTable.id))
      .where(and(eq(ordersTable.status, "cancellation_requested"), isNull(ordersTable.deletedAt))),

    db.select({
      orderId: ordersTable.id,
      leadId: ordersTable.leadId,
      city: ordersTable.city,
      serviceType: ordersTable.serviceType,
      proposedAmount: ordersTable.proposedAmount,
      updatedAt: ordersTable.updatedAt,
      clientName: leadsTable.clientName,
    })
      .from(ordersTable)
      .leftJoin(leadsTable, eq(ordersTable.leadId, leadsTable.id))
      .where(and(
        eq(ordersTable.status, "completed"),
        isNull(ordersTable.deletedAt),
        isNull(ordersTable.orderAmount),
        sql`${ordersTable.proposedAmount} IS NOT NULL`,
      )),

    // 5. Сметы: клиент прислал скрин/подтверждение, оператор ещё не подтвердил
    db.select({
      receiptId: receiptsTable.id,
      orderId: receiptsTable.orderId,
      city: receiptsTable.city,
      serviceType: receiptsTable.serviceType,
      clientName: receiptsTable.clientName,
      prepaymentAmount: receiptsTable.prepaymentAmount,
      prepaymentSubmittedAt: receiptsTable.prepaymentSubmittedAt,
      leadId: ordersTable.leadId,
    })
      .from(receiptsTable)
      .leftJoin(ordersTable, eq(receiptsTable.orderId, ordersTable.id))
      .where(and(
        isNotNull(receiptsTable.prepaymentSubmittedAt),
        isNull(receiptsTable.prepaymentSeenAt),
        // Не показываем сметы по удалённым/отменённым заказам
        isNull(ordersTable.deletedAt),
        sql`${ordersTable.status} NOT IN ('cancelled')`,
      )),
  ]);

  // 1. Новые заявки
  for (const lead of newLeads) {
    const ageMin = Math.floor((now - new Date(lead.createdAt).getTime()) / 60000);
    const overdue = ageMin - TASK_SLA.sendToWork;
    tasks.push({
      id: `lead-${lead.id}-send`,
      type: "send_to_work",
      priority: priorityFor(overdue, TASK_SLA.sendToWork),
      title: `Заявка #${lead.id} — отправить мастерам`,
      subtitle: `${lead.clientName} · ${lead.city} · ${lead.serviceType}`,
      leadId: lead.id,
      orderId: null,
      ageMinutes: ageMin,
      slaMinutes: TASK_SLA.sendToWork,
      overdueMinutes: overdue,
    });
  }

  // 2. Заказы без отклика мастера
  for (const order of waitingOrders) {
    const refTime = order.lastBroadcastAt ?? order.createdAt;
    const ageMin = Math.floor((now - new Date(refTime).getTime()) / 60000);
    if (ageMin < TASK_SLA.masterResponse * 0.5) continue;
    const overdue = ageMin - TASK_SLA.masterResponse;
    tasks.push({
      id: `order-${order.orderId}-noresp`,
      type: "no_master_response",
      priority: priorityFor(overdue, TASK_SLA.masterResponse),
      title: `Заказ #${order.leadId ?? order.orderId} — никто не откликнулся`,
      subtitle: `${order.clientName ?? "?"} · ${order.city} · ${order.serviceType}`,
      leadId: order.leadId ?? null,
      orderId: order.orderId,
      ageMinutes: ageMin,
      slaMinutes: TASK_SLA.masterResponse,
      overdueMinutes: overdue,
    });
  }

  // 3. Запросы отмены
  for (const order of cancelOrders) {
    const ageMin = Math.floor((now - new Date(order.updatedAt).getTime()) / 60000);
    const overdue = ageMin - TASK_SLA.cancelDecision;
    tasks.push({
      id: `order-${order.orderId}-cancel`,
      type: "cancel_request",
      priority: priorityFor(overdue, TASK_SLA.cancelDecision),
      title: `Заказ #${order.leadId ?? order.orderId} — запрос отмены`,
      subtitle: `${order.clientName ?? "?"} · ${order.city} · причина: ${order.cancelReason ?? "не указана"}`,
      leadId: order.leadId ?? null,
      orderId: order.orderId,
      ageMinutes: ageMin,
      slaMinutes: TASK_SLA.cancelDecision,
      overdueMinutes: overdue,
    });
  }

  // 4. Предложения цены
  for (const order of priceOrders) {
    const ageMin = Math.floor((now - new Date(order.updatedAt).getTime()) / 60000);
    const overdue = ageMin - TASK_SLA.priceDecision;
    tasks.push({
      id: `order-${order.orderId}-price`,
      type: "price_proposal",
      priority: priorityFor(overdue, TASK_SLA.priceDecision),
      title: `Заказ #${order.leadId ?? order.orderId} — утвердить сумму ${Number(order.proposedAmount).toLocaleString("ru-RU")} ₽`,
      subtitle: `${order.clientName ?? "?"} · ${order.city} · ${order.serviceType}`,
      leadId: order.leadId ?? null,
      orderId: order.orderId,
      ageMinutes: ageMin,
      slaMinutes: TASK_SLA.priceDecision,
      overdueMinutes: overdue,
    });
  }

  // 5. Сметы: подтвердить получение предоплаты
  for (const r of pendingReceipts) {
    if (!r.prepaymentSubmittedAt) continue;
    const ageMin = Math.floor((now - new Date(r.prepaymentSubmittedAt).getTime()) / 60000);
    const overdue = ageMin - TASK_SLA.prepaymentConfirm;
    tasks.push({
      id: `receipt-${r.receiptId}-confirm`,
      type: "confirm_prepayment",
      priority: priorityFor(overdue, TASK_SLA.prepaymentConfirm),
      title: `Заказ #${r.leadId ?? r.orderId} — подтвердить оплату сметы ${Number(r.prepaymentAmount).toLocaleString("ru-RU")} ₽`,
      subtitle: `${r.clientName} · ${r.city} · ${r.serviceType}`,
      leadId: r.leadId ?? null,
      orderId: r.orderId,
      ageMinutes: ageMin,
      slaMinutes: TASK_SLA.prepaymentConfirm,
      overdueMinutes: overdue,
    });
  }

  // Сортировка: critical → high → normal, внутри — по просрочке/возрасту
  const order: Record<TaskPriority, number> = { critical: 0, high: 1, normal: 2 };
  tasks.sort((a, b) => {
    if (order[a.priority] !== order[b.priority]) return order[a.priority] - order[b.priority];
    return b.overdueMinutes - a.overdueMinutes;
  });

  return tasks;
}
