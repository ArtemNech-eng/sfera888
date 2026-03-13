import { Router } from "express";
import { db, leadsTable, ordersTable, mastersTable, transactionsTable } from "@workspace/db";
import { requireRole } from "../middlewares/requireAuth.js";
import { gte } from "drizzle-orm";

const router = Router();
const adminOnly = requireRole("admin");

router.get("/dashboard", adminOnly, async (req, res) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const leads = await db.select().from(leadsTable);
  const orders = await db.select().from(ordersTable);
  const masters = await db.select().from(mastersTable);
  const transactions = await db.select().from(transactionsTable);

  const leadsToday = leads.filter(l => l.createdAt >= todayStart).length;
  const leadsWeek = leads.filter(l => l.createdAt >= weekStart).length;
  const leadsMonth = leads.filter(l => l.createdAt >= monthStart).length;

  const ordersTotal = orders.length;
  const ordersActive = orders.filter(o => ["waiting_master", "master_assigned", "in_progress"].includes(o.status)).length;

  const monthTransactions = transactions.filter(t => t.createdAt >= monthStart && t.paymentStatus === "paid");
  const incomeMonth = monthTransactions.reduce((s, t) => s + Number(t.commission), 0);
  const totalDebt = transactions.filter(t => t.paymentStatus !== "paid").reduce((s, t) => s + Number(t.commission), 0);

  const sentToWork = leads.filter(l => l.status === "sent_to_work").length;
  const conversionRate = leads.length > 0 ? (sentToWork / leads.length) * 100 : 0;

  const completedOrders = orders.filter(o => o.status === "completed" && o.orderAmount);
  const avgCheck = completedOrders.length > 0
    ? completedOrders.reduce((s, o) => s + Number(o.orderAmount), 0) / completedOrders.length
    : 0;

  const topMasters = masters
    .sort((a, b) => Number(b.rating) - Number(a.rating))
    .slice(0, 10)
    .map(m => ({
      id: m.id,
      alias: m.alias,
      rating: Number(m.rating),
      totalOrders: m.totalOrders,
      city: m.city,
    }));

  res.json({
    leadsToday,
    leadsWeek,
    leadsMonth,
    ordersTotal,
    ordersActive,
    incomeMonth,
    totalDebt,
    conversionRate: Math.round(conversionRate * 10) / 10,
    avgCheck: Math.round(avgCheck),
    topMasters,
  });
});

router.get("/funnel", adminOnly, async (req, res) => {
  const leads = await db.select().from(leadsTable);
  res.json({
    total: leads.length,
    processing: leads.filter(l => l.status === "processing").length,
    sentToWork: leads.filter(l => l.status === "sent_to_work").length,
    completed: leads.filter(l => l.status === "sent_to_work").length,
    nonTarget: leads.filter(l => l.status === "non_target").length,
    refusal: leads.filter(l => l.status === "client_refusal").length,
  });
});

export default router;
