import { Router } from "express";
import { db, leadsTable, ordersTable, mastersTable, transactionsTable, receiptsTable } from "@workspace/db";
import { requirePermission } from "../middlewares/requireAuth.js";
import { isNull, isNotNull } from "drizzle-orm";

const router = Router();
const adminOnly = requirePermission("analytics");

function parsePeriod(from?: string, to?: string) {
  const now = new Date();
  const start = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = to ? new Date(new Date(to).getTime() + 86400000) : new Date(now.getTime() + 86400000);
  return { start, end };
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
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

  const leadsToday = leads.filter(l => l.createdAt >= todayStart).length;
  const leadsWeek = leads.filter(l => l.createdAt >= weekStart).length;
  const leadsMonth = leads.filter(l => l.createdAt >= monthStart).length;
  const newLeads = leads.filter(l => l.status === "new").length;

  const ordersTotal = orders.length;
  const ordersActive = orders.filter(o => ["waiting_master", "master_assigned", "in_progress"].includes(o.status)).length;
  const ordersWaitingMaster = orders.filter(o => o.status === "waiting_master").length;
  const noMasterFoundTotal = orders.filter(o => o.status === "cancelled" && (o as any).cancelType === "no_master_found").length;
  const noMasterFoundMonth = orders.filter(o => o.status === "cancelled" && (o as any).cancelType === "no_master_found" && o.updatedAt >= monthStart).length;
  const cancellationRequests = orders.filter(o => o.status === "cancellation_requested").length;
  const pendingAmounts = orders.filter(o => o.proposedAmount && !o.orderAmount).length;
  const completedToday = orders.filter(o => o.status === "completed" && o.updatedAt >= todayStart).length;
  const completedMonth = orders.filter(o => o.status === "completed" && o.updatedAt >= monthStart).length;

  const paidTx = transactions.filter(t => t.paymentStatus === "paid");
  const monthTx = paidTx.filter(t => t.createdAt >= monthStart);
  const prevMonthTx = paidTx.filter(t => t.createdAt >= prevMonthStart && t.createdAt < monthStart);

  const commissionMonth = monthTx.reduce((s, t) => s + Number(t.commission), 0);
  const commissionPrevMonth = prevMonthTx.reduce((s, t) => s + Number(t.commission), 0);

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

  const totalDebt = transactions.filter(t => t.paymentStatus !== "paid").reduce((s, t) => {
    const netPayable = Math.max(0, Number(t.commission) - Number(t.prepaymentDeducted ?? 0));
    return s + netPayable;
  }, 0);

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

  const activeMasters = masters.filter(m => m.status === "active").length;
  const pendingContracts = masters.filter(m => m.status === "pending_contract" && m.contractSignedAt).length;

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
    leadsToday, leadsWeek, leadsMonth, newLeads,
    ordersTotal, ordersActive, ordersWaitingMaster,
    noMasterFoundTotal, noMasterFoundMonth, cancellationRequests,
    pendingAmounts, completedToday, completedMonth,
    incomeMonth, incomeTrend, totalDebt,
    conversionRate: Math.round(conversionRate * 10) / 10,
    conversionTrend, avgCheck: Math.round(avgCheck),
    activeMasters, pendingContracts, topMasters,
  });
});

// ─── FUNNEL (legacy) ─────────────────────────────────────────────────────────
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
    noMasterFound: orders.filter(o => o.status === "cancelled" && (o as any).cancelType === "no_master_found").length,
  });
});

// ─── MONTHLY REVENUE (legacy) ─────────────────────────────────────────────────
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
      t.paymentStatus === "paid" && t.createdAt >= start && t.createdAt < end
    );
    const commissionIncome = filteredTx.reduce((s, t) => s + Number(t.commission), 0);
    const prepayIncome = receiptRows
      .filter(r => r.prepaymentSubmittedAt! >= start && r.prepaymentSubmittedAt! < end)
      .reduce((s, r) => s + Number(r.prepaymentAmount), 0);

    months.push({ label, income: commissionIncome + prepayIncome, count: filteredTx.length });
  }

  res.json(months);
});

// ─── LEADS BY SOURCE (legacy) ─────────────────────────────────────────────────
router.get("/leads-by-source", adminOnly, async (req, res) => {
  const leads = await db.select().from(leadsTable).where(isNull(leadsTable.deletedAt));
  const orders = await db.select({ leadId: ordersTable.leadId, status: ordersTable.status }).from(ordersTable).where(isNull(ordersTable.deletedAt));

  const workOrderLeadIds = new Set(orders.map(o => o.leadId).filter(Boolean));

  const bySource: Record<string, { total: number; sentToWork: number; nonTarget: number; clientRefusal: number }> = {};

  for (const lead of leads) {
    const src = lead.source ?? "other";
    if (!bySource[src]) bySource[src] = { total: 0, sentToWork: 0, nonTarget: 0, clientRefusal: 0 };
    bySource[src].total++;
    if (lead.status === "sent_to_work" || workOrderLeadIds.has(lead.id)) bySource[src].sentToWork++;
    if (lead.status === "non_target") bySource[src].nonTarget++;
    if (lead.status === "client_refusal") bySource[src].clientRefusal++;
  }

  const result = Object.entries(bySource).map(([source, stats]) => ({
    source,
    total: stats.total,
    sentToWork: stats.sentToWork,
    nonTarget: stats.nonTarget,
    clientRefusal: stats.clientRefusal,
    conversion: stats.total > 0 ? Math.round((stats.sentToWork / stats.total) * 1000) / 10 : 0,
  })).sort((a, b) => b.total - a.total);

  res.json(result);
});

// ─── REVENUE CARDS + DAILY CHART ─────────────────────────────────────────────
router.get("/revenue", adminOnly, async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);
    const weekStart = new Date(todayStart.getTime() - 7 * 86400000);
    const prevWeekStart = new Date(weekStart.getTime() - 7 * 86400000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = monthStart;

    const txRows = await db.select().from(transactionsTable);
    const receiptRows = await db.select({
      prepaymentAmount: receiptsTable.prepaymentAmount,
      prepaymentSubmittedAt: receiptsTable.prepaymentSubmittedAt,
    }).from(receiptsTable).where(isNotNull(receiptsTable.prepaymentSubmittedAt));

    function calcIncome(start: Date, end: Date) {
      const tx = txRows.filter(t => t.paymentStatus === "paid" && t.createdAt >= start && t.createdAt < end)
        .reduce((s, t) => s + Number(t.commission), 0);
      const pr = receiptRows.filter(r => r.prepaymentSubmittedAt! >= start && r.prepaymentSubmittedAt! < end)
        .reduce((s, r) => s + Number(r.prepaymentAmount), 0);
      return tx + pr;
    }

    function pct(cur: number, prev: number) {
      if (prev === 0) return null;
      return Math.round(((cur - prev) / prev) * 1000) / 10;
    }

    const today = calcIncome(todayStart, new Date(todayStart.getTime() + 86400000));
    const yesterday = calcIncome(yesterdayStart, todayStart);
    const week = calcIncome(weekStart, new Date(todayStart.getTime() + 86400000));
    const prevWeek = calcIncome(prevWeekStart, weekStart);
    const month = calcIncome(monthStart, new Date(todayStart.getTime() + 86400000));
    const prevMonth = calcIncome(prevMonthStart, prevMonthEnd);

    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const avgDay = month / Math.max(now.getDate(), 1);

    // Daily chart: last 30 days
    const daily: { date: string; income: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const dayStart = new Date(todayStart.getTime() - i * 86400000);
      const dayEnd = new Date(dayStart.getTime() + 86400000);
      const income = calcIncome(dayStart, dayEnd);
      const label = dayStart.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
      daily.push({ date: label, income });
    }

    res.json({
      today, todayVsYesterday: pct(today, yesterday),
      week, weekVsPrev: pct(week, prevWeek),
      month, monthVsPrev: pct(month, prevMonth),
      avgDay: Math.round(avgDay),
      daily,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── DETAILED FUNNEL ─────────────────────────────────────────────────────────
router.get("/funnel-detail", adminOnly, async (req, res) => {
  try {
    const { from, to, city } = req.query as Record<string, string>;
    const { start, end } = parsePeriod(from, to);

    let leads = (await db.select().from(leadsTable).where(isNull(leadsTable.deletedAt)))
      .filter(l => l.createdAt >= start && l.createdAt < end);
    if (city && city !== "all") leads = leads.filter(l => l.city === city);

    const leadIds = new Set(leads.map(l => l.id));
    let orders = (await db.select().from(ordersTable).where(isNull(ordersTable.deletedAt)))
      .filter(o => o.leadId && leadIds.has(o.leadId));
    if (city && city !== "all") orders = orders.filter(o => o.city === city);

    const orderIds = new Set(orders.map(o => o.id));
    const receipts = (await db.select().from(receiptsTable).where(isNotNull(receiptsTable.prepaymentSubmittedAt)))
      .filter(r => orderIds.has(r.orderId));

    const appeals = leads.length;
    const applications = leads.filter(l => !["non_target", "client_refusal"].includes(l.status)).length;
    const sentToMaster = orders.length;
    const estimateSent = orders.filter(o => o.proposedAmount).length;
    const prepaidCount = receipts.length;
    const completed = orders.filter(o => o.status === "completed").length;

    const finalConversion = appeals > 0 ? Math.round((completed / appeals) * 1000) / 10 : 0;

    res.json({
      stages: [
        { name: "Обращения", count: appeals, pctFromPrev: 100, pctFromFirst: 100 },
        { name: "Заявки", count: applications, pctFromPrev: appeals > 0 ? Math.round((applications / appeals) * 1000) / 10 : 0, pctFromFirst: appeals > 0 ? Math.round((applications / appeals) * 1000) / 10 : 0 },
        { name: "Передано мастерам", count: sentToMaster, pctFromPrev: applications > 0 ? Math.round((sentToMaster / applications) * 1000) / 10 : 0, pctFromFirst: appeals > 0 ? Math.round((sentToMaster / appeals) * 1000) / 10 : 0 },
        { name: "Смета отправлена", count: estimateSent, pctFromPrev: sentToMaster > 0 ? Math.round((estimateSent / sentToMaster) * 1000) / 10 : 0, pctFromFirst: appeals > 0 ? Math.round((estimateSent / appeals) * 1000) / 10 : 0 },
        { name: "Предоплата", count: prepaidCount, pctFromPrev: estimateSent > 0 ? Math.round((prepaidCount / estimateSent) * 1000) / 10 : 0, pctFromFirst: appeals > 0 ? Math.round((prepaidCount / appeals) * 1000) / 10 : 0 },
        { name: "Заказ завершён", count: completed, pctFromPrev: prepaidCount > 0 ? Math.round((completed / prepaidCount) * 1000) / 10 : 0, pctFromFirst: appeals > 0 ? Math.round((completed / appeals) * 1000) / 10 : 0 },
      ],
      finalConversion,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── SOURCES ROI ─────────────────────────────────────────────────────────────
router.get("/sources-roi", adminOnly, async (req, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const { start, end } = parsePeriod(from, to);

    const leads = (await db.select().from(leadsTable).where(isNull(leadsTable.deletedAt)))
      .filter(l => l.createdAt >= start && l.createdAt < end);

    const leadIds = new Set(leads.map(l => l.id));
    const orders = (await db.select().from(ordersTable).where(isNull(ordersTable.deletedAt)))
      .filter(o => o.leadId && leadIds.has(o.leadId));

    const receipts = await db.select({
      prepaymentAmount: receiptsTable.prepaymentAmount,
      prepaymentSubmittedAt: receiptsTable.prepaymentSubmittedAt,
      orderId: receiptsTable.orderId,
    }).from(receiptsTable).where(isNotNull(receiptsTable.prepaymentSubmittedAt));

    const txRows = await db.select().from(transactionsTable);

    const SOURCES = ["avito", "website", "ads", "call", "referral", "repeat", "other"];
    const SOURCE_LABELS: Record<string, string> = {
      avito: "Авито", website: "Сайт", ads: "Директ",
      call: "Звонки", referral: "Сарафан", repeat: "Повторный", other: "Другое",
    };

    function calcIncome(orderIds: number[]) {
      const orderSet = new Set(orderIds);
      const tx = txRows.filter(t => orderSet.has(t.orderId) && t.paymentStatus === "paid")
        .reduce((s, t) => s + Number(t.commission), 0);
      const pr = receipts.filter(r => r.prepaymentSubmittedAt && orderSet.has(r.orderId))
        .reduce((s, r) => s + Number(r.prepaymentAmount), 0);
      return tx + pr;
    }

    const result = SOURCES.map(src => {
      const srcLeads = leads.filter(l => (l.source ?? "other") === src);
      const srcOrders = orders.filter(o => {
        const lead = srcLeads.find(l => l.id === o.leadId);
        return !!lead;
      });
      const completedOrders = srcOrders.filter(o => o.status === "completed");
      const income = calcIncome(completedOrders.map(o => o.id));
      const spent = 0; // placeholder — manual input not implemented yet
      const roi = spent > 0 ? income / spent : null;
      return {
        source: src,
        label: SOURCE_LABELS[src],
        spent,
        appeals: srcLeads.length,
        applications: srcLeads.filter(l => !["non_target", "client_refusal"].includes(l.status)).length,
        orders: completedOrders.length,
        costPerAppeal: spent > 0 && srcLeads.length > 0 ? Math.round(spent / srcLeads.length) : null,
        costPerApplication: spent > 0 && srcLeads.filter(l => !["non_target", "client_refusal"].includes(l.status)).length > 0 ? Math.round(spent / srcLeads.filter(l => !["non_target", "client_refusal"].includes(l.status)).length) : null,
        costPerOrder: spent > 0 && completedOrders.length > 0 ? Math.round(spent / completedOrders.length) : null,
        income: Math.round(income),
        roi,
      };
    });

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── CITIES ──────────────────────────────────────────────────────────────────
router.get("/cities", adminOnly, async (req, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const { start, end } = parsePeriod(from, to);

    const masters = await db.select().from(mastersTable).where(isNull(mastersTable.deletedAt));
    const leads = (await db.select().from(leadsTable).where(isNull(leadsTable.deletedAt)))
      .filter(l => l.createdAt >= start && l.createdAt < end);
    const orders = (await db.select().from(ordersTable).where(isNull(ordersTable.deletedAt)))
      .filter(o => o.createdAt >= start && o.createdAt < end);
    const receipts = await db.select({
      prepaymentAmount: receiptsTable.prepaymentAmount,
      prepaymentSubmittedAt: receiptsTable.prepaymentSubmittedAt,
      orderId: receiptsTable.orderId,
    }).from(receiptsTable).where(isNotNull(receiptsTable.prepaymentSubmittedAt));
    const txRows = await db.select().from(transactionsTable);

    const cities = [...new Set([
      ...leads.map(l => l.city),
      ...orders.map(o => o.city),
    ])].filter(Boolean);

    function calcCityIncome(cityOrders: typeof orders) {
      const orderSet = new Set(cityOrders.map(o => o.id));
      const tx = txRows.filter(t => orderSet.has(t.orderId) && t.paymentStatus === "paid")
        .reduce((s, t) => s + Number(t.commission), 0);
      const pr = receipts.filter(r => r.prepaymentSubmittedAt && orderSet.has(r.orderId))
        .reduce((s, r) => s + Number(r.prepaymentAmount), 0);
      return tx + pr;
    }

    const result = cities.map(city => {
      const cityMasters = masters.filter(m => m.city === city && m.status === "active").length;
      const cityLeads = leads.filter(l => l.city === city);
      const cityOrders = orders.filter(o => o.city === city);
      const completed = cityOrders.filter(o => o.status === "completed");
      const income = calcCityIncome(completed);
      const completedAmounts = completed.filter(o => o.orderAmount);
      const avgCheck = completedAmounts.length > 0
        ? completedAmounts.reduce((s, o) => s + Number(o.orderAmount), 0) / completedAmounts.length
        : 0;
      const conversion = cityLeads.length > 0
        ? Math.round((completed.length / cityLeads.length) * 1000) / 10
        : 0;
      return {
        city,
        masters: cityMasters,
        leads: cityLeads.length,
        orders: cityOrders.length,
        completed: completed.length,
        conversion,
        avgCheck: Math.round(avgCheck),
        income: Math.round(income),
        adSpend: 0,
        profit: Math.round(income),
      };
    }).sort((a, b) => b.income - a.income);

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── MASTERS RATING ──────────────────────────────────────────────────────────
router.get("/masters-rating", adminOnly, async (req, res) => {
  try {
    const { from, to, city } = req.query as Record<string, string>;
    const { start, end } = parsePeriod(from, to);

    let masters = await db.select().from(mastersTable).where(isNull(mastersTable.deletedAt));
    if (city && city !== "all") masters = masters.filter(m => m.city === city);

    const orders = (await db.select().from(ordersTable).where(isNull(ordersTable.deletedAt)))
      .filter(o => o.updatedAt >= start && o.updatedAt < end);

    const txRows = await db.select().from(transactionsTable);
    const receipts = await db.select({
      prepaymentAmount: receiptsTable.prepaymentAmount,
      prepaymentSubmittedAt: receiptsTable.prepaymentSubmittedAt,
      orderId: receiptsTable.orderId,
    }).from(receiptsTable).where(isNotNull(receiptsTable.prepaymentSubmittedAt));

    const result = masters.map(m => {
      const mOrders = orders.filter(o => o.masterId === m.id);
      const completed = mOrders.filter(o => o.status === "completed");
      const conversion = mOrders.length > 0
        ? Math.round((completed.length / mOrders.length) * 1000) / 10
        : 0;

      const orderSet = new Set(completed.map(o => o.id));
      const tx = txRows.filter(t => orderSet.has(t.orderId) && t.paymentStatus === "paid")
        .reduce((s, t) => s + Number(t.commission), 0);
      const pr = receipts.filter(r => r.prepaymentSubmittedAt && orderSet.has(r.orderId))
        .reduce((s, r) => s + Number(r.prepaymentAmount), 0);
      const income = Math.round(tx + pr);

      const masterCommission = txRows.filter(t => orderSet.has(t.orderId))
        .reduce((s, t) => s + (Number(t.orderAmount ?? 0) - Number(t.commission ?? 0)), 0);

      return {
        id: m.id,
        alias: m.alias,
        city: m.city,
        rating: Number(m.rating),
        status: m.status,
        totalOrders: m.totalOrders,
        periodLeads: mOrders.length,
        periodCompleted: completed.length,
        conversion,
        earnings: Math.round(masterCommission),
        broughtToCompany: income,
      };
    })
      .filter(m => m.periodLeads > 0 || m.totalOrders > 0)
      .sort((a, b) => b.conversion - a.conversion || b.periodCompleted - a.periodCompleted);

    const problematic = masters
      .filter(m => Number(m.rating) < 3.0 || m.status === "suspended")
      .map(m => ({ id: m.id, alias: m.alias, city: m.city, rating: Number(m.rating), status: m.status }));

    res.json({ masters: result, problematic });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── DYNAMICS ────────────────────────────────────────────────────────────────
router.get("/dynamics", adminOnly, async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const leads = (await db.select().from(leadsTable).where(isNull(leadsTable.deletedAt)));
    const orders = (await db.select().from(ordersTable).where(isNull(ordersTable.deletedAt)));
    const masters = (await db.select().from(mastersTable).where(isNull(mastersTable.deletedAt)));
    const txRows = await db.select().from(transactionsTable);
    const receipts = await db.select({
      prepaymentAmount: receiptsTable.prepaymentAmount,
      prepaymentSubmittedAt: receiptsTable.prepaymentSubmittedAt,
      orderId: receiptsTable.orderId,
    }).from(receiptsTable).where(isNotNull(receiptsTable.prepaymentSubmittedAt));

    const daily: { date: string; leads: number; income: number; activeMasters: number; newMasters: number }[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const dayStart = new Date(todayStart.getTime() - i * 86400000);
      const dayEnd = new Date(dayStart.getTime() + 86400000);
      const label = dayStart.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });

      const dayLeads = leads.filter(l => l.createdAt >= dayStart && l.createdAt < dayEnd).length;

      const dayOrderIds = new Set(orders.filter(o => o.status === "completed" && o.updatedAt >= dayStart && o.updatedAt < dayEnd).map(o => o.id));
      const tx = txRows.filter(t => dayOrderIds.has(t.orderId) && t.paymentStatus === "paid")
        .reduce((s, t) => s + Number(t.commission), 0);
      const pr = receipts.filter(r => r.prepaymentSubmittedAt && r.prepaymentSubmittedAt >= dayStart && r.prepaymentSubmittedAt < dayEnd)
        .reduce((s, r) => s + Number(r.prepaymentAmount), 0);

      const activeMasters = masters.filter(m => m.status === "active" && m.createdAt <= dayEnd).length;
      const newMasters = masters.filter(m => m.createdAt >= dayStart && m.createdAt < dayEnd).length;

      daily.push({ date: label, leads: dayLeads, income: Math.round(tx + pr), activeMasters, newMasters });
    }

    // Weekly conversion
    const weeks: { week: string; conversion: number }[] = [];
    const numWeeks = Math.floor(days / 7);
    for (let i = numWeeks - 1; i >= 0; i--) {
      const wStart = new Date(todayStart.getTime() - (i + 1) * 7 * 86400000);
      const wEnd = new Date(todayStart.getTime() - i * 7 * 86400000);
      const wLeads = leads.filter(l => l.createdAt >= wStart && l.createdAt < wEnd);
      const wOrders = orders.filter(o => o.leadId && wLeads.find(l => l.id === o.leadId) && o.status === "completed");
      const conv = wLeads.length > 0 ? Math.round((wOrders.length / wLeads.length) * 1000) / 10 : 0;
      const label = wStart.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
      weeks.push({ week: label, conversion: conv });
    }

    res.json({ daily, weeks });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── CITIES LIST ─────────────────────────────────────────────────────────────
router.get("/city-list", adminOnly, async (req, res) => {
  try {
    const leads = await db.select({ city: leadsTable.city }).from(leadsTable).where(isNull(leadsTable.deletedAt));
    const orders = await db.select({ city: ordersTable.city }).from(ordersTable).where(isNull(ordersTable.deletedAt));
    const cities = [...new Set([...leads.map(l => l.city), ...orders.map(o => o.city)])].filter(Boolean).sort();
    res.json(cities);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
