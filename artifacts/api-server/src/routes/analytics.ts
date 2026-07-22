import { Router } from "express";
import { db, leadsTable, ordersTable, mastersTable, transactionsTable, transactionPaymentsTable, receiptsTable, avitoSettingsTable } from "@workspace/db";
import { requirePermission } from "../middlewares/requireAuth.js";
import { isNull, isNotNull, inArray, eq, sql } from "drizzle-orm";

const router = Router();
const adminOnly = requirePermission("analytics");

function parsePeriod(from?: string, to?: string) {
  const now = new Date();
  const start = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
  const end = to ? new Date(new Date(to).getTime() + 86400000) : new Date(now.getTime() + 86400000);
  return { start, end };
}

// ─── Avito balance cache (TTL 5 min) ─────────────────────────────────────────
let _avitoCacheValue = 0;
let _avitoCacheAt = 0;
const AVITO_CACHE_TTL = 5 * 60 * 1000;

async function fetchAvitoBalance(): Promise<number> {
  if (Date.now() - _avitoCacheAt < AVITO_CACHE_TTL) return _avitoCacheValue;
  try {
    const [avSettings] = await db.select().from(avitoSettingsTable).limit(1);
    if (!avSettings) { _avitoCacheValue = 0; _avitoCacheAt = Date.now(); return 0; }
    const manualBalance = Number((avSettings as any).advanceBalance ?? 0);
    const clientId = (avSettings as any).clientId;
    const clientSecret = (avSettings as any).clientSecret;
    if (clientId && clientSecret) {
      try {
        const abortCtrl = new AbortController();
        const avitoTimeout = setTimeout(() => abortCtrl.abort(), 4000);
        try {
          const tokenResp = await fetch("https://api.avito.ru/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
            signal: abortCtrl.signal,
          });
          if (tokenResp.ok) {
            const tokenData = await tokenResp.json() as any;
            const balanceResp = await fetch("https://api.avito.ru/cpa/v2/balanceInfo", {
              method: "POST",
              headers: { Authorization: `Bearer ${tokenData.access_token}`, "Content-Type": "application/json", "X-Source": "sfera-master" },
              body: "{}",
              signal: abortCtrl.signal,
            });
            if (balanceResp.ok) {
              const balanceData = await balanceResp.json() as any;
              const balanceKop = balanceData?.result?.balance ?? balanceData?.balance;
              if (typeof balanceKop === "number") {
                clearTimeout(avitoTimeout);
                _avitoCacheValue = Math.round(balanceKop / 100);
                _avitoCacheAt = Date.now();
                return _avitoCacheValue;
              }
            }
          }
        } finally {
          clearTimeout(avitoTimeout);
        }
      } catch { /* fallback to manual */ }
    }
    _avitoCacheValue = manualBalance;
    _avitoCacheAt = Date.now();
    return manualBalance;
  } catch {
    return _avitoCacheValue; // return stale on error
  }
}

// Отдельный эндпоинт для баланса Авито (не блокирует дашборд)
router.get("/avito-balance", adminOnly, async (_req, res) => {
  try {
    const balance = await fetchAvitoBalance();
    res.json({ balance });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── DASHBOARD V2 ─────────────────────────────────────────────────────────────
// Consolidated dashboard endpoint that returns all the data the CRM dashboard
// page needs in a single request: KPI summary, lead funnel/sources, live feed,
// cities, top masters, recent orders. Shapes match the dashboard components in
// artifacts/crm/src/components/dashboard/* exactly.
//
// Performance notes:
//   • Project only required columns (avoids loading huge `leads.photos`,
//     `marketplaceContext`, etc.)
//   • Pre-build Map indexes for O(1) lookups during aggregation
//   • Single-pass over each entity collection where possible
router.get("/dashboard-v2", adminOnly, async (req, res) => {
  // Defensive: this URL was previously serving 410 Gone, which CDNs aggressively
  // cache. Force fresh response on every request.
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const cutoff24h = new Date(now.getTime() - 24 * 3600000);

    // ── Selected period window + previous comparable window ────────────────
    // Drives the KPI cards. `periodStart..now` is the current window; the KPI
    // "vs" delta compares it against `prevStart..periodStart` (same length).
    const rawPeriod = String(req.query.period ?? "month").toLowerCase();
    const period = (["today", "week", "month", "quarter"].includes(rawPeriod)
      ? rawPeriod
      : "month") as "today" | "week" | "month" | "quarter";
    let periodStart: Date;
    let prevStart: Date;
    if (period === "today") {
      periodStart = todayStart;
      prevStart = yesterdayStart;
    } else if (period === "week") {
      periodStart = new Date(todayStart.getTime() - 6 * 86400000); // last 7 days incl. today
      prevStart = new Date(periodStart.getTime() - 7 * 86400000);
    } else if (period === "quarter") {
      const q = Math.floor(now.getMonth() / 3);
      periodStart = new Date(now.getFullYear(), q * 3, 1);
      prevStart = new Date(now.getFullYear(), q * 3 - 3, 1);
    } else {
      periodStart = monthStart;
      prevStart = prevMonthStart;
    }

    // ── Load only the columns we actually use, in parallel ─────────────────
    const [leads, orders, masters, txRows, txPayments, avitoBalance] = await Promise.all([
      db.select({
        id: leadsTable.id,
        clientName: leadsTable.clientName,
        clientPhone: leadsTable.clientPhone,
        city: leadsTable.city,
        serviceType: leadsTable.serviceType,
        status: leadsTable.status,
        source: leadsTable.source,
        createdAt: leadsTable.createdAt,
      }).from(leadsTable).where(isNull(leadsTable.deletedAt)),
      db.select({
        id: ordersTable.id,
        leadId: ordersTable.leadId,
        masterId: ordersTable.masterId,
        city: ordersTable.city,
        serviceType: ordersTable.serviceType,
        status: ordersTable.status,
        orderAmount: ordersTable.orderAmount,
        assignedAt: ordersTable.assignedAt,
        createdAt: ordersTable.createdAt,
        updatedAt: ordersTable.updatedAt,
      }).from(ordersTable).where(isNull(ordersTable.deletedAt)),
      db.select({
        id: mastersTable.id,
        alias: mastersTable.alias,
        city: mastersTable.city,
        status: mastersTable.status,
        rating: mastersTable.rating,
        createdAt: mastersTable.createdAt,
      }).from(mastersTable).where(isNull(mastersTable.deletedAt)),
      db.select({
        id: transactionsTable.id,
        orderId: transactionsTable.orderId,
        commission: transactionsTable.commission,
        prepaymentDeducted: transactionsTable.prepaymentDeducted,
        paymentStatus: transactionsTable.paymentStatus,
        createdAt: transactionsTable.createdAt,
        paidAt: transactionsTable.paidAt,
      }).from(transactionsTable),
      db.select({
        transactionId: transactionPaymentsTable.transactionId,
        amount: transactionPaymentsTable.amount,
        paidAt: transactionPaymentsTable.paidAt,
      }).from(transactionPaymentsTable),
      fetchAvitoBalance().catch(() => 0),
    ]);

    // ── Pre-build Map indexes (O(n) one-time pass) ─────────────────────────
    // paidCommissionByOrder: orderId → sum of commission from PAID transactions
    const paidCommissionByOrder = new Map<number, number>();
    for (const t of txRows) {
      if (t.paymentStatus === "paid") {
        paidCommissionByOrder.set(t.orderId, (paidCommissionByOrder.get(t.orderId) ?? 0) + Number(t.commission));
      }
    }
    // ordersByCity / leadsByCity (used in cities block)
    const ordersByCity = new Map<string, typeof orders>();
    for (const o of orders) {
      const cityKey = o.city ?? "";
      if (!cityKey) continue;
      const a = ordersByCity.get(cityKey);
      if (a) a.push(o); else ordersByCity.set(cityKey, [o]);
    }
    const leadsByCity = new Map<string, number>();
    for (const l of leads) {
      const cityKey = l.city ?? "";
      if (!cityKey) continue;
      leadsByCity.set(cityKey, (leadsByCity.get(cityKey) ?? 0) + 1);
    }
    // mastersByCity: city → masters[] (for free/total/active counts)
    const mastersByCity = new Map<string, typeof masters>();
    for (const m of masters) {
      const cityKey = m.city ?? "";
      if (!cityKey) continue;
      const a = mastersByCity.get(cityKey);
      if (a) a.push(m); else mastersByCity.set(cityKey, [m]);
    }
    // busyMasterIds: masters currently on an active order (for free_masters count)
    const busyMasterIds = new Set<number>();
    for (const o of orders) {
      if (o.masterId && (o.status === "master_assigned" || o.status === "in_progress")) {
        busyMasterIds.add(o.masterId);
      }
    }

    // ── Summary (KPIData — matches KPICards.tsx) ───────────────────────────
    let leadsToday = 0, leadsYesterday = 0, leadsMonth = 0, leadsPrevMonth = 0, sentToWorkMonth = 0;
    let leadsPeriod = 0, leadsPrevPeriod = 0, sentToWorkPeriod = 0;
    for (const l of leads) {
      if (l.createdAt >= todayStart) leadsToday++;
      else if (l.createdAt >= yesterdayStart) leadsYesterday++;
      if (l.createdAt >= monthStart) {
        leadsMonth++;
        if (l.status === "sent_to_work") sentToWorkMonth++;
      } else if (l.createdAt >= prevMonthStart) leadsPrevMonth++;
      // Selected-period counters (independent of the fixed windows above).
      if (l.createdAt >= periodStart) {
        leadsPeriod++;
        if (l.status === "sent_to_work") sentToWorkPeriod++;
      } else if (l.createdAt >= prevStart) leadsPrevPeriod++;
    }
    const leadConversionRate = leadsMonth > 0
      ? Math.round((sentToWorkMonth / leadsMonth) * 1000) / 10
      : 0;
    const leadConversionRatePeriod = leadsPeriod > 0
      ? Math.round((sentToWorkPeriod / leadsPeriod) * 1000) / 10
      : 0;
    let activeMasters = 0, newMastersToday = 0, newMastersYesterday = 0;
    let newMastersPeriod = 0, newMastersPrevPeriod = 0;
    for (const m of masters) {
      if (m.status === "active") activeMasters++;
      if (m.createdAt >= todayStart) newMastersToday++;
      else if (m.createdAt >= yesterdayStart) newMastersYesterday++;
      if (m.createdAt >= periodStart) newMastersPeriod++;
      else if (m.createdAt >= prevStart) newMastersPrevPeriod++;
    }
    let ordersPending = 0;
    let completedPeriod = 0, completedPrevPeriod = 0, revenuePeriod = 0;
    for (const o of orders) {
      if (o.status === "waiting_master" || o.status === "master_assigned" || o.status === "in_progress") {
        ordersPending++;
      }
      if (o.status === "completed") {
        if (o.updatedAt >= periodStart) {
          completedPeriod++;
          revenuePeriod += o.orderAmount ? Number(o.orderAmount) : 0;
        } else if (o.updatedAt >= prevStart) {
          completedPrevPeriod++;
        }
      }
    }
    // Commission received within the period — mirrors Finance "totalIncome":
    //  • paid transactions → full commission (attributed by payment date);
    //  • not-yet-paid transactions → booking/prepayment (бронь, attributed by
    //    order/tx creation) + manual partial payments (attributed by their date).
    const paidTxIds = new Set<number>();
    for (const t of txRows) if (t.paymentStatus === "paid") paidTxIds.add(t.id);
    let commissionPeriod = 0, commissionPrevPeriod = 0;
    for (const t of txRows) {
      if (t.paymentStatus === "paid") {
        if (t.paidAt && t.paidAt >= periodStart) commissionPeriod += Number(t.commission);
        else if (t.paidAt && t.paidAt >= prevStart) commissionPrevPeriod += Number(t.commission);
      } else {
        const prepay = Number(t.prepaymentDeducted ?? 0);
        if (prepay > 0) {
          if (t.createdAt >= periodStart) commissionPeriod += prepay;
          else if (t.createdAt >= prevStart) commissionPrevPeriod += prepay;
        }
      }
    }
    for (const p of txPayments) {
      if (paidTxIds.has(p.transactionId) || !p.paidAt) continue; // partials on closed tx already in full commission
      if (p.paidAt >= periodStart) commissionPeriod += Number(p.amount);
      else if (p.paidAt >= prevStart) commissionPrevPeriod += Number(p.amount);
    }
    const avgCheckPeriod = completedPeriod > 0 ? Math.round(revenuePeriod / completedPeriod) : 0;
    const summary = {
      period,
      leads_today: leadsToday,
      leads_today_prev: leadsYesterday,
      leads_month: leadsMonth,
      leads_month_prev: leadsPrevMonth,
      lead_conversion_rate: leadConversionRate,
      // Selected-period KPI values consumed by KPICards.
      leads_period: leadsPeriod,
      leads_period_prev: leadsPrevPeriod,
      lead_conversion_rate_period: leadConversionRatePeriod,
      masters_new_period: newMastersPeriod,
      masters_new_period_prev: newMastersPrevPeriod,
      masters_active: activeMasters,
      masters_total: masters.length,
      masters_new_today: newMastersToday,
      masters_new_today_prev: newMastersYesterday,
      orders_pending: ordersPending,
      avito_balance: avitoBalance,
      // Money KPIs for the selected period.
      commission_period: Math.round(commissionPeriod),
      commission_period_prev: Math.round(commissionPrevPeriod),
      revenue_period: Math.round(revenuePeriod),
      completed_period: completedPeriod,
      completed_period_prev: completedPrevPeriod,
      avg_check_period: avgCheckPeriod,
    };

    // ── Lead funnel (selected period) ────────────────────────────────────────
    let processingLeads = 0, sentToWorkLeads = 0, rejectedLeads = 0, funnelTotal = 0;
    for (const l of leads) {
      if (l.createdAt < periodStart) continue;
      funnelTotal++;
      if (l.status === "new" || l.status === "processing") processingLeads++;
      else if (l.status === "sent_to_work") sentToWorkLeads++;
      else if (l.status === "non_target" || l.status === "client_refusal") rejectedLeads++;
    }
    const leadFunnel = {
      total: funnelTotal,
      processing: processingLeads,
      sent_to_work: sentToWorkLeads,
      rejected: rejectedLeads,
      conversion_rate: funnelTotal > 0
        ? Math.round((sentToWorkLeads / funnelTotal) * 1000) / 10
        : 0,
    };

    // ── Lead sources ────────────────────────────────────────────────────────
    const SOURCE_LABELS: Record<string, string> = {
      avito: "Авито", website: "Сайт", ads: "Директ", call: "Звонки",
      referral: "Сарафан", repeat: "Повторный", other: "Другое",
    };
    const sourceCounts = new Map<string, { count: number; sentToWork: number }>();
    for (const l of leads) {
      if (l.createdAt < periodStart) continue;
      const key = l.source ?? "other";
      const stats = sourceCounts.get(key) ?? { count: 0, sentToWork: 0 };
      stats.count++;
      if (l.status === "sent_to_work") stats.sentToWork++;
      sourceCounts.set(key, stats);
    }
    const leadSources = Object.entries(SOURCE_LABELS)
      .map(([key, label]) => {
        const stats = sourceCounts.get(key) ?? { count: 0, sentToWork: 0 };
        return {
          channel: label,
          count: stats.count,
          sent_to_work: stats.sentToWork,
          conversion: stats.count > 0
            ? Math.round((stats.sentToWork / stats.count) * 1000) / 10
            : 0,
        };
      })
      .filter(s => s.count > 0)
      .sort((a, b) => b.count - a.count);

    // ── Live feed (last ~20 events from last 24h) ──────────────────────────
    type FeedType = "new_lead" | "assigned" | "completed" | "new_master";
    const feedEvents: { id: number; type: FeedType; timestamp: Date; text: string; city: string; amount: number | null }[] = [];
    const masterMapById = new Map(masters.map(m => [m.id, m]));

    let leadsAdded = 0;
    for (const l of leads) {
      if (leadsAdded >= 8) break;
      if (l.createdAt >= cutoff24h) {
        feedEvents.push({
          id: 1000 + leadsAdded,
          type: "new_lead",
          timestamp: l.createdAt,
          text: `Новая заявка: ${l.serviceType ?? "ремонт"}, ${l.city}`,
          city: l.city,
          amount: null,
        });
        leadsAdded++;
      }
    }
    let completedAdded = 0, assignedAdded = 0;
    for (const o of orders) {
      if (completedAdded < 8 && o.status === "completed" && o.updatedAt >= cutoff24h) {
        const amt = o.orderAmount ? Number(o.orderAmount) : null;
        feedEvents.push({
          id: 2000 + completedAdded,
          type: "completed",
          timestamp: o.updatedAt,
          text: `Заказ #${o.id} завершён${amt ? ` (${amt.toLocaleString("ru-RU")}₽)` : ""}`,
          city: o.city,
          amount: amt,
        });
        completedAdded++;
      }
      if (assignedAdded < 5 && o.assignedAt && o.assignedAt >= cutoff24h) {
        const master = o.masterId ? masterMapById.get(o.masterId) : null;
        feedEvents.push({
          id: 3000 + assignedAdded,
          type: "assigned",
          timestamp: o.assignedAt,
          text: `Мастер ${master?.alias ?? "?"} взял заказ #${o.id}`,
          city: o.city,
          amount: null,
        });
        assignedAdded++;
      }
    }
    let newMasterAdded = 0;
    for (const m of masters) {
      if (newMasterAdded >= 3) break;
      if (m.createdAt >= cutoff24h) {
        feedEvents.push({
          id: 4000 + newMasterAdded,
          type: "new_master",
          timestamp: m.createdAt,
          text: `Зарегистрирован мастер ${m.alias}, ${m.city}`,
          city: m.city,
          amount: null,
        });
        newMasterAdded++;
      }
    }
    feedEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const liveFeed = feedEvents.slice(0, 20);

    // ── Cities (selected period for leads/revenue; masters = live snapshot) ──
    const leadsByCityPeriod = new Map<string, number>();
    for (const l of leads) {
      if (l.createdAt < periodStart || !l.city) continue;
      leadsByCityPeriod.set(l.city, (leadsByCityPeriod.get(l.city) ?? 0) + 1);
    }
    const completedByCityPeriod = new Map<string, number>();
    const revenueByCityPeriod = new Map<string, number>();
    for (const o of orders) {
      if (o.status !== "completed" || o.updatedAt < periodStart || !o.city) continue;
      completedByCityPeriod.set(o.city, (completedByCityPeriod.get(o.city) ?? 0) + 1);
      revenueByCityPeriod.set(o.city, (revenueByCityPeriod.get(o.city) ?? 0) + (paidCommissionByOrder.get(o.id) ?? 0));
    }
    const allCities = new Set<string>([...ordersByCity.keys(), ...leadsByCity.keys()]);
    const cities = [...allCities]
      .map(city => {
        const cityMasters = mastersByCity.get(city) ?? [];
        const cityMastersTotal = cityMasters.length;
        const cityMastersActive = cityMasters.filter(m => m.status === "active").length;
        const freeMasters = cityMasters.filter(m => m.status === "active" && !busyMasterIds.has(m.id)).length;
        const cityOrders = ordersByCity.get(city) ?? [];
        const waitingOrders = cityOrders.filter(o =>
          !o.masterId && o.status !== "completed" && o.status !== "cancelled"
        ).length;
        const ratio = freeMasters > 0
          ? Math.round((waitingOrders / freeMasters) * 100) / 100
          : (waitingOrders > 0 ? 99 : 0);
        const cityLeadsCount = leadsByCityPeriod.get(city) ?? 0;
        const cityCompletedCount = completedByCityPeriod.get(city) ?? 0;
        const cityRevenue = revenueByCityPeriod.get(city) ?? 0;
        return {
          city,
          leads: cityLeadsCount,
          masters_total: cityMastersTotal,
          masters_active: cityMastersActive,
          conversion: cityLeadsCount > 0
            ? Math.round((cityCompletedCount / cityLeadsCount) * 1000) / 10
            : 0,
          revenue: Math.round(cityRevenue),
          free_masters: freeMasters,
          waiting_orders: waitingOrders,
          ratio,
        };
      })
      .filter(c => c.leads > 0 || c.masters_total > 0)
      .sort((a, b) => b.revenue - a.revenue || b.leads - a.leads)
      .slice(0, 8);

    // ── Top Masters (selected period) ────────────────────────────────────────
    const completedByMasterPeriod = new Map<number, number>();
    const revenueByMasterPeriod = new Map<number, number>();
    const totalByMasterPeriod = new Map<number, number>();
    for (const o of orders) {
      if (!o.masterId) continue;
      if (o.createdAt >= periodStart) {
        totalByMasterPeriod.set(o.masterId, (totalByMasterPeriod.get(o.masterId) ?? 0) + 1);
      }
      if (o.status === "completed" && o.updatedAt >= periodStart) {
        completedByMasterPeriod.set(o.masterId, (completedByMasterPeriod.get(o.masterId) ?? 0) + 1);
        revenueByMasterPeriod.set(o.masterId, (revenueByMasterPeriod.get(o.masterId) ?? 0) + (paidCommissionByOrder.get(o.id) ?? 0));
      }
    }
    const topMasters = masters
      .filter(m => m.status === "active")
      .map(m => {
        const mCompleted = completedByMasterPeriod.get(m.id) ?? 0;
        const mTotal = totalByMasterPeriod.get(m.id) ?? 0;
        const revenue = revenueByMasterPeriod.get(m.id) ?? 0;
        return {
          id: m.id,
          name: m.alias,
          city: m.city,
          orders_completed: mCompleted,
          conversion: mTotal > 0
            ? Math.round((mCompleted / mTotal) * 1000) / 10
            : 0,
          rating: Number(m.rating),
          revenue_brought: Math.round(revenue),
        };
      })
      .filter(m => m.orders_completed > 0)
      .sort((a, b) => b.revenue_brought - a.revenue_brought || b.orders_completed - a.orders_completed)
      .slice(0, 8);

    // ── Recent Orders ───────────────────────────────────────────────────────
    const STATUS_MAP: Record<string, string> = {
      waiting_master: "searching",
      master_assigned: "assigned",
      in_progress: "in_progress",
      completed: "completed",
      cancelled: "cancelled",
      cancellation_requested: "cancellation_requested",
    };
    const leadMapById = new Map(leads.map(l => [l.id, l]));
    const recentOrders = [...orders]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10)
      .map(o => {
        const lead = o.leadId ? leadMapById.get(o.leadId) : null;
        const master = o.masterId ? masterMapById.get(o.masterId) : null;
        return {
          id: o.id,
          created_at: o.createdAt,
          city: o.city,
          client: lead ? (lead.clientName ?? lead.clientPhone ?? "—") : "—",
          master: master ? master.alias : null,
          service: o.serviceType ?? "—",
          amount: o.orderAmount ? Number(o.orderAmount) : null,
          status: STATUS_MAP[o.status] ?? o.status,
        };
      });

    // ── Trend sparklines: last 14 days, daily buckets ───────────────────────
    const TREND_DAYS = 14;
    const trendStart = new Date(todayStart.getTime() - (TREND_DAYS - 1) * 86400000);
    const leadsTrend = new Array(TREND_DAYS).fill(0);
    const commissionTrend = new Array(TREND_DAYS).fill(0);
    for (const l of leads) {
      if (l.createdAt < trendStart) continue;
      const idx = Math.floor((l.createdAt.getTime() - trendStart.getTime()) / 86400000);
      if (idx >= 0 && idx < TREND_DAYS) leadsTrend[idx]++;
    }
    for (const t of txRows) {
      if (t.paymentStatus === "paid") {
        if (t.paidAt && t.paidAt >= trendStart) {
          const idx = Math.floor((t.paidAt.getTime() - trendStart.getTime()) / 86400000);
          if (idx >= 0 && idx < TREND_DAYS) commissionTrend[idx] += Number(t.commission);
        }
      } else {
        const prepay = Number(t.prepaymentDeducted ?? 0);
        if (prepay > 0 && t.createdAt >= trendStart) {
          const idx = Math.floor((t.createdAt.getTime() - trendStart.getTime()) / 86400000);
          if (idx >= 0 && idx < TREND_DAYS) commissionTrend[idx] += prepay;
        }
      }
    }
    for (const p of txPayments) {
      if (paidTxIds.has(p.transactionId) || !p.paidAt || p.paidAt < trendStart) continue;
      const idx = Math.floor((p.paidAt.getTime() - trendStart.getTime()) / 86400000);
      if (idx >= 0 && idx < TREND_DAYS) commissionTrend[idx] += Number(p.amount);
    }

    res.json({
      summary,
      leadFunnel,
      leadSources,
      liveFeed,
      cities,
      topMasters,
      recentOrders,
      trends: { leads: leadsTrend, commission: commissionTrend },
    });
  } catch (e: any) {
    console.error("[dashboard-v2] error:", e);
    res.status(500).json({ error: e?.message ?? "Internal error" });
  }
});

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

  // Partial payments — needed for accurate debt calculation
  const txIds = transactions.map(t => t.id);
  const dashboardPartials = txIds.length > 0
    ? await db.select().from(transactionPaymentsTable).where(inArray(transactionPaymentsTable.transactionId, txIds))
    : [];
  const dashboardPartialsMap = new Map<number, number>();
  for (const p of dashboardPartials) {
    dashboardPartialsMap.set(p.transactionId, (dashboardPartialsMap.get(p.transactionId) ?? 0) + Number(p.amount));
  }

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
    const totalPartialPaid = dashboardPartialsMap.get(t.id) ?? 0;
    const netPayable = Math.max(0, Number(t.commission) - Number(t.prepaymentDeducted ?? 0) - totalPartialPaid);
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

    // Partial payments — needed for accurate remainingDebt
    const revTxIds = txRows.map(t => t.id);
    const revPartials = revTxIds.length > 0
      ? await db.select().from(transactionPaymentsTable).where(inArray(transactionPaymentsTable.transactionId, revTxIds))
      : [];
    const revPartialsMap = new Map<number, number>();
    for (const p of revPartials) {
      revPartialsMap.set(p.transactionId, (revPartialsMap.get(p.transactionId) ?? 0) + Number(p.amount));
    }

    // Income = only fully paid commissions, filtered by paidAt (when money was actually received).
    // Using paidAt (not createdAt) ensures transactions paid this week/month are counted
    // in the correct period, even if the order was created earlier.
    function calcIncome(start: Date, end: Date) {
      return txRows
        .filter(t => {
          if (t.paymentStatus !== "paid" || !t.paidAt) return false;
          return t.paidAt >= start && t.paidAt < end;
        })
        .reduce((s, t) => s + Number(t.commission), 0);
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

    const avgDay = month / Math.max(now.getDate(), 1);

    // remainingDebt = sum of netPayable across all unclosed transactions.
    // Accounts for prepayment AND partial payments already received.
    const remainingDebt = txRows
      .filter(t => t.paymentStatus !== "paid")
      .reduce((s, t) => {
        const totalPartialPaid = revPartialsMap.get(t.id) ?? 0;
        const net = Math.max(0, Number(t.commission) - Number(t.prepaymentDeducted ?? 0) - totalPartialPaid);
        return s + net;
      }, 0);

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
      remainingDebt,
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

// ─── SCORE DISTRIBUTION ─────────────────────────────────────────────────────
// Гистограмма мастеров по score, сегментам, городам. Read-only — для калибровки
// порогов скоринга. Считает score по всем активным мастерам (не удалённым).
router.get("/score-distribution", adminOnly, async (_req, res) => {
  try {
    const { scoreMasters } = await import("../lib/masterScoring.js");
    const masters = await db.select().from(mastersTable)
      .where(isNull(mastersTable.deletedAt));
    const masterIds = masters.map(m => m.id);
    const scoreMap = await scoreMasters(masterIds);

    // Гистограмма: 10 корзин по 10 баллов (0-9, 10-19, ..., 90-100)
    const histogram = Array.from({ length: 10 }, (_, i) => ({
      bucket: `${i * 10}–${i === 9 ? 100 : i * 10 + 9}`,
      from: i * 10,
      to: i === 9 ? 100 : i * 10 + 9,
      count: 0,
    }));

    // Счётчики по сегментам
    const segmentCounts = { platinum: 0, gold: 0, silver: 0, starter: 0, blocked: 0 };

    // Аггрегаты по городам
    const cityAgg = new Map<string, { sum: number; count: number; segments: Record<string, number> }>();

    // Все мастера со score (для топ/бот)
    interface MasterScore {
      masterId: number;
      alias: string;
      city: string;
      total: number;
      segment: string;
      isCold: boolean;
      payRate: number;
      avgCommission: number;
      selfCancelRate: number;
      totalCompletedAllTime: number;
      blockedFromOrders: boolean;
    }
    const allScored: MasterScore[] = [];

    for (const m of masters) {
      const s = scoreMap.get(m.id);
      if (!s) continue;
      // Гистограмма
      const bucketIdx = Math.min(9, Math.floor(s.total / 10));
      histogram[bucketIdx].count++;
      // Сегменты
      segmentCounts[s.segment as keyof typeof segmentCounts]++;
      // Города (только не-blocked, чтобы не искажать средний)
      if (s.segment !== "blocked") {
        const city = m.city || "—";
        const agg = cityAgg.get(city) ?? { sum: 0, count: 0, segments: { platinum: 0, gold: 0, silver: 0, starter: 0 } };
        agg.sum += s.total;
        agg.count++;
        if (agg.segments[s.segment] != null) agg.segments[s.segment]++;
        cityAgg.set(city, agg);
      }
      allScored.push({
        masterId: m.id,
        alias: m.alias,
        city: m.city || "—",
        total: s.total,
        segment: s.segment,
        isCold: s.isCold,
        payRate: s.components.payRate,
        avgCommission: s.components.avgCommission,
        selfCancelRate: s.components.selfCancelRate,
        totalCompletedAllTime: s.components.totalCompletedAllTime,
        blockedFromOrders: m.blockedFromOrders ?? false,
      });
    }

    // Среднее по платформе (без blocked)
    const nonBlocked = allScored.filter(s => s.segment !== "blocked");
    const avgScore = nonBlocked.length > 0
      ? nonBlocked.reduce((sum, s) => sum + s.total, 0) / nonBlocked.length
      : 0;

    const cities = [...cityAgg.entries()]
      .map(([city, agg]) => ({
        city,
        count: agg.count,
        avgScore: Math.round(agg.sum / agg.count),
        ...agg.segments,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // ТОП-10 / БОТ-10 (без cold-start, чтобы не путать)
    const ranked = allScored
      .filter(s => !s.isCold && s.segment !== "blocked")
      .sort((a, b) => b.total - a.total);
    const top10 = ranked.slice(0, 10);
    const bottom10 = ranked.slice(-10).reverse();

    res.json({
      totalMasters: masters.length,
      avgScore: Math.round(avgScore),
      histogram,
      segments: segmentCounts,
      cities,
      top10,
      bottom10,
      generatedAt: new Date().toISOString(),
    });
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

// ─── PAYMENT-STATE MIX ────────────────────────────────────────────────────────
//
// Phase 3 of estimate-optional-flow. Распределение заказов по `agreementAmountSource`
// за период. Используется в CRM Analytics для оценки доли Agreement_Path vs
// Receipt_Path и доли исторических unknown.
//
// Query params:
//   • from — YYYY-MM-DD (default: начало текущего месяца)
//   • to   — YYYY-MM-DD (default: сегодня + 1 день)
//   • groupBy — day | week | month (default: day)
//
// Bucket mapping:
//   • agreement_amount_source = 'agreement'        → agreement
//   • agreement_amount_source = 'master_proposal'  → masterProposal
//   • agreement_amount_source = 'unknown'          → unknown (historical backfill)
//   • NULL OR everything else                      → receipt (Receipt_Path)
//
// Учитываются только заказы с зафиксированной суммой (orderAmount IS NOT NULL).
router.get("/payment-state-mix", adminOnly, async (req, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const groupByParam = (req.query.groupBy as string) ?? "day";
    const groupBy = ["day", "week", "month"].includes(groupByParam) ? groupByParam : "day";
    const { start, end } = parsePeriod(from, to);

    // date_trunc с динамическим параметром через sql.raw — значение
    // whitelist'ed выше, инъекция невозможна.
    const periodExpr = sql.raw(`DATE_TRUNC('${groupBy}', o.created_at)`);

    const rows = await db.execute(sql`
      SELECT
        ${periodExpr} AS period,
        COUNT(*) FILTER (WHERE o.agreement_amount_source = 'agreement')::int AS agreement,
        COUNT(*) FILTER (WHERE o.agreement_amount_source = 'master_proposal')::int AS master_proposal,
        COUNT(*) FILTER (WHERE o.agreement_amount_source = 'unknown')::int AS unknown,
        COUNT(*) FILTER (
          WHERE o.agreement_amount_source IS NULL
             OR o.agreement_amount_source NOT IN ('agreement','master_proposal','unknown')
        )::int AS receipt,
        COUNT(*)::int AS total
      FROM orders o
      WHERE o.deleted_at IS NULL
        AND o.order_amount IS NOT NULL
        AND CAST(o.order_amount AS NUMERIC) > 0
        AND o.created_at >= ${start}
        AND o.created_at < ${end}
      GROUP BY ${periodExpr}
      ORDER BY ${periodExpr} ASC
    `);

    // Period stored as timestamp by Postgres — converting to YYYY-MM-DD.
    const formattedRows = (rows.rows as any[]).map((r) => ({
      period: new Date(r.period).toISOString().slice(0, 10),
      agreement: Number(r.agreement),
      masterProposal: Number(r.master_proposal),
      receipt: Number(r.receipt),
      unknown: Number(r.unknown),
      total: Number(r.total),
    }));

    const totals = formattedRows.reduce(
      (acc, r) => ({
        agreement: acc.agreement + r.agreement,
        masterProposal: acc.masterProposal + r.masterProposal,
        receipt: acc.receipt + r.receipt,
        unknown: acc.unknown + r.unknown,
        total: acc.total + r.total,
      }),
      { agreement: 0, masterProposal: 0, receipt: 0, unknown: 0, total: 0 },
    );

    res.json({ rows: formattedRows, totals, groupBy });
  } catch (e: any) {
    console.error("[analytics/payment-state-mix] error:", e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
