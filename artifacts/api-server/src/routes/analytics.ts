import { Router } from "express";
import { db, leadsTable, ordersTable, mastersTable, transactionsTable, receiptsTable } from "@workspace/db";
import { requirePermission } from "../middlewares/requireAuth.js";
import { isNull, isNotNull } from "drizzle-orm";

const router = Router();
const adminOnly = requirePermission("analytics");

router.get("/dashboard", adminOnly, async (req, res) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const leads = await db.select().from(leadsTable).where(isNull(leadsTable.deletedAt));
  const orders = await db.select().from(ordersTable).where(isNull(ordersTable.deletedAt));
  const masters = await db.select().from(mastersTable).where(isNull(mastersTable.deletedAt));
  const transactions = await db.select().from(transactionsTable);
  const paidReceipts = await db.select({
    prepaymentAmount: receiptsTable.prepaymentAmount,
    prepaymentSubmittedAt: receiptsTable.prepaymentSubmittedAt,
  }).from(receiptsTable).where(isNotNull(receiptsTable.prepaymentSubmittedAt));

  // Leads
  const leadsToday = leads.filter(l => l.createdAt >= todayStart).length;
  const leadsWeek = leads.filter(l => l.createdAt >= weekStart).length;
  const leadsMonth = leads.filter(l => l.createdAt >= monthStart).length;
  const newLeads = leads.filter(l => l.status === "new").length;

  // Orders
  const ordersTotal = orders.length;
  const ordersActive = orders.filter(o => ["waiting_master", "master_assigned", "in_progress"].includes(o.status)).length;
  const ordersWaitingMaster = orders.filter(o => o.status === "waiting_master").length;
  const cancellationRequests = orders.filter(o => o.status === "cancellation_requested").length;
  const pendingAmounts = orders.filter(o => o.proposedAmount && !o.orderAmount).length;
  const completedToday = orders.filter(o => o.status === "completed" && o.updatedAt >= todayStart).length;
  const completedMonth = orders.filter(o => o.status === "completed" && o.updatedAt >= monthStart).length;

  // Finance — commissions from masters
  const paidTx = transactions.filter(t => t.paymentStatus === "paid");
  const monthTx = paidTx.filter(t => t.createdAt >= monthStart);
  const prevMonthTx = paidTx.filter(t => t.createdAt >= prevMonthStart && t.createdAt < monthStart);

  const commissionMonth = monthTx.reduce((s, t) => s + Number(t.commission), 0);
  const commissionPrevMonth = prevMonthTx.reduce((s, t) => s + Number(t.commission), 0);

  // Finance — prepayments (брони) paid by clients
  const prepayMonth = paidReceipts
    .filter(r => r.prepaymentSubmittedAt! >= monthStart)
    .reduce((s, r) => s + Number(r.prepaymentAmount), 0);
  const prepayPrevMonth = paidReceipts
    .filter(r => r.prepaymentSubmittedAt! >= prevMonthStart && r.prepaymentSubmittedAt! < monthStart)
    .reduce((s, r) => s + Number(r.prepaymentAmount), 0);

  const incomeMonth = commissionMonth + prepayMonth;
  const incomePrevMonth = commissionPrevMonth + prepayPrevMonth;
  const incomeTrend = incomePrevMonth > 0
    ? Math.round(((incomeMonth - incomePrevMonth) / incomePrevMonth) * 1000) / 10
    : null;

  const totalDebt = transactions.filter(t => t.paymentStatus !== "paid").reduce((s, t) => s + Number(t.commission), 0);

  // Conversion
  const sentToWorkMonth = leads.filter(l => l.status === "sent_to_work" && l.createdAt >= monthStart).length;
  const leadsMonthTotal = leads.filter(l => l.createdAt >= monthStart).length;
  const conversionRate = leadsMonthTotal > 0 ? (sentToWorkMonth / leadsMonthTotal) * 100 : 0;

  const sentToWorkPrevMonth = leads.filter(l => l.status === "sent_to_work" && l.createdAt >= prevMonthStart && l.createdAt < monthStart).length;
  const leadsPrevMonthTotal = leads.filter(l => l.createdAt >= prevMonthStart && l.createdAt < monthStart).length;
  const conversionPrev = leadsPrevMonthTotal > 0 ? (sentToWorkPrevMonth / leadsPrevMonthTotal) * 100 : 0;
  const conversionTrend = conversionPrev > 0
    ? Math.round((conversionRate - conversionPrev) * 10) / 10
    : null;

  const completedOrders = orders.filter(o => o.status === "completed" && o.orderAmount);
  const avgCheck = completedOrders.length > 0
    ? completedOrders.reduce((s, o) => s + Number(o.orderAmount), 0) / completedOrders.length
    : 0;

  // Masters
  const activeMasters = masters.filter(m => m.status === "active").length;

  // Top masters by completed orders this month
  const completedOrdersThisMonth = orders.filter(o => o.status === "completed" && o.updatedAt >= monthStart && o.masterId);
  const masterCompletedCount: Record<number, number> = {};
  const masterRevenueMonth: Record<number, number> = {};
  for (const o of completedOrdersThisMonth) {
    if (!o.masterId) continue;
    masterCompletedCount[o.masterId] = (masterCompletedCount[o.masterId] ?? 0) + 1;
    masterRevenueMonth[o.masterId] = (masterRevenueMonth[o.masterId] ?? 0) + Number(o.orderAmount ?? 0);
  }

  const topMasters = masters
    .filter(m => m.status === "active")
    .map(m => ({
      id: m.id,
      alias: m.alias,
      rating: Number(m.rating),
      totalOrders: m.totalOrders,
      city: m.city,
      completedMonth: masterCompletedCount[m.id] ?? 0,
      revenueMonth: masterRevenueMonth[m.id] ?? 0,
    }))
    .sort((a, b) => b.completedMonth - a.completedMonth || b.totalOrders - a.totalOrders)
    .slice(0, 8);

  res.json({
    leadsToday,
    leadsWeek,
    leadsMonth,
    newLeads,
    ordersTotal,
    ordersActive,
    ordersWaitingMaster,
    cancellationRequests,
    pendingAmounts,
    completedToday,
    completedMonth,
    incomeMonth,
    incomeTrend,
    totalDebt,
    conversionRate: Math.round(conversionRate * 10) / 10,
    conversionTrend,
    avgCheck: Math.round(avgCheck),
    activeMasters,
    topMasters,
  });
});

router.get("/funnel", adminOnly, async (req, res) => {
  const leads = await db.select().from(leadsTable).where(isNull(leadsTable.deletedAt));
  const orders = await db.select().from(ordersTable).where(isNull(ordersTable.deletedAt));
  res.json({
    total: leads.length,
    processing: leads.filter(l => l.status === "processing").length,
    sentToWork: leads.filter(l => l.status === "sent_to_work").length,
    completed: orders.filter(o => o.status === "completed").length,
    nonTarget: leads.filter(l => l.status === "non_target").length,
    refusal: leads.filter(l => l.status === "client_refusal").length,
    cancelled: orders.filter(o => o.status === "cancelled").length,
  });
});

router.get("/monthly-revenue", adminOnly, async (req, res) => {
  const now = new Date();
  const months: { label: string; income: number; count: number }[] = [];

  const txRows = await db.select().from(transactionsTable);
  const receiptRows = await db.select({
    prepaymentAmount: receiptsTable.prepaymentAmount,
    prepaymentSubmittedAt: receiptsTable.prepaymentSubmittedAt,
  }).from(receiptsTable).where(isNotNull(receiptsTable.prepaymentSubmittedAt));

  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const label = start.toLocaleString("ru-RU", { month: "short", year: "2-digit" });

    const filteredTx = txRows.filter(t =>
      t.paymentStatus === "paid" &&
      t.createdAt >= start &&
      t.createdAt < end
    );
    const commissionIncome = filteredTx.reduce((s, t) => s + Number(t.commission), 0);

    const prepayIncome = receiptRows
      .filter(r => r.prepaymentSubmittedAt! >= start && r.prepaymentSubmittedAt! < end)
      .reduce((s, r) => s + Number(r.prepaymentAmount), 0);

    const income = commissionIncome + prepayIncome;
    months.push({ label, income, count: filteredTx.length });
  }

  res.json(months);
});

export default router;
