import { Router } from "express";
import { db, leadsTable, ordersTable, mastersTable, transactionsTable, transactionPaymentsTable, receiptsTable, avitoSettingsTable, walletTransactionsTable, masterWalletTable, tokenPackagesTable } from "@workspace/db";
import { requirePermission } from "../middlewares/requireAuth.js";
import { isNull, isNotNull, inArray, eq } from "drizzle-orm";

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

// ─── Token revenue helper with fallback ────────────────────────────────────────
function calcTokenRevenue(
  walletTxs: typeof walletTransactionsTable.$inferSelect[],
  tokenPackages: typeof tokenPackagesTable.$inferSelect[],
  start: Date,
  end: Date
) {
  return walletTxs
    .filter(w => w.type === "purchase" && w.createdAt >= start && w.createdAt < end)
    .reduce((s, w) => {
      if (w.rubAmount && Number(w.rubAmount) > 0) return s + Number(w.rubAmount);
      if (w.packageId) {
        const pkg = tokenPackages.find(p => p.id === w.packageId);
        if (pkg && pkg.priceRub) return s + Number(pkg.priceRub);
      }
      const avgPricePerToken = tokenPackages.length > 0
        ? tokenPackages.reduce((sum, p) => sum + Number(p.pricePerToken), 0) / tokenPackages.length
        : 10;
      return s + Number(w.tokensAmount) * avgPricePerToken;
    }, 0);
}

// ─── DASHBOARD V2 (new UI) ────────────────────────────────────────────────────
router.get("/dashboard-v2", adminOnly, async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysPassed = now.getDate();

    // ── Load all data in parallel ──────────────────────────────────────────────
    const [leads, orders, masters, txRows, walletTxs, wallets, tokenPackages] = await Promise.all([
      db.select().from(leadsTable).where(isNull(leadsTable.deletedAt)),
      db.select().from(ordersTable).where(isNull(ordersTable.deletedAt)),
      db.select().from(mastersTable).where(isNull(mastersTable.deletedAt)),
      db.select().from(transactionsTable),
      db.select().from(walletTransactionsTable),
      db.select().from(masterWalletTable),
      db.select().from(tokenPackagesTable).where(eq(tokenPackagesTable.isActive, true)),
    ]);

    // ── Summary (KPI) ──────────────────────────────────────────────────────────
    const leadsToday = leads.filter(l => l.createdAt >= todayStart).length;
    const leadsYesterday = leads.filter(l => l.createdAt >= yesterdayStart && l.createdAt < todayStart).length;
    const leadsMonth = leads.filter(l => l.createdAt >= monthStart).length;
    const leadsPrevMonth = leads.filter(l => l.createdAt >= prevMonthStart && l.createdAt < monthStart).length;

    const monthLeadsAll = leads.filter(l => l.createdAt >= monthStart);
    const monthLeadsSentToWork = monthLeadsAll.filter(l => l.status === "sent_to_work").length;
    const leadConversionRate = monthLeadsAll.length > 0
      ? Math.round((monthLeadsSentToWork / monthLeadsAll.length) * 1000) / 10
      : 0;

    const activeMasters = masters.filter(m => m.status === "active").length;
    const totalMasters = masters.length;
    const newMastersToday = masters.filter(m => m.createdAt >= todayStart).length;
    const newMastersYesterday = masters.filter(m => m.createdAt >= yesterdayStart && m.createdAt < todayStart).length;

    const tokenRevenueToday = calcTokenRevenue(walletTxs, tokenPackages, todayStart, new Date(todayStart.getTime() + 86400000));
    const tokenRevenueYesterday = calcTokenRevenue(walletTxs, tokenPackages, yesterdayStart, todayStart);
    const tokenRevenueMonth = calcTokenRevenue(walletTxs, tokenPackages, monthStart, new Date(todayStart.getTime() + 86400000));

    const avgTokenBalance = wallets.length > 0
      ? Math.round(wallets.reduce((s, w) => s + Number(w.tokensBalance), 0) / wallets.length * 10) / 10
      : 0;

    const summary = {
      // Leads
      leads_today: leadsToday,
      leads_today_prev: leadsYesterday,
      leads_month: leadsMonth,
      leads_month_prev: leadsPrevMonth,
      lead_conversion_rate: leadConversionRate,
      // Masters
      masters_active: activeMasters,
      masters_total: totalMasters,
      masters_new_today: newMastersToday,
      masters_new_today_prev: newMastersYesterday,
      // Token economy
      token_revenue_today: Math.round(tokenRevenueToday),
      token_revenue_yesterday: Math.round(tokenRevenueYesterday),
      token_revenue_month: Math.round(tokenRevenueMonth),
      tokens_sold_today: walletTxs
        .filter(w => w.type === "purchase" && w.createdAt >= todayStart && w.createdAt < new Date(todayStart.getTime() + 86400000))
        .reduce((s, w) => s + Number(w.tokensAmount), 0),
      tokens_sold_yesterday: walletTxs
        .filter(w => w.type === "purchase" && w.createdAt >= yesterdayStart && w.createdAt < todayStart)
        .reduce((s, w) => s + Number(w.tokensAmount), 0),
      new_buyers_today: new Set(walletTxs
        .filter(w => w.type === "purchase" && w.createdAt >= todayStart && w.createdAt < new Date(todayStart.getTime() + 86400000))
        .map(w => w.masterId)).size,
      new_buyers_yesterday: new Set(walletTxs
        .filter(w => w.type === "purchase" && w.createdAt >= yesterdayStart && w.createdAt < todayStart)
        .map(w => w.masterId)).size,
      orders_pending: orders.filter(o => o.status === "waiting_master").length,
      masters_at_zero: wallets.filter(w => Number(w.tokensBalance) === 0).length,
      masters_low_balance: wallets.filter(w => Number(w.tokensBalance) > 0 && Number(w.tokensBalance) < 10).length,
      debtors_count: wallets.filter(w => Number(w.tokensBalance) < 0).length,
      avg_token_balance: avgTokenBalance,
      token_refunds_today: walletTxs
        .filter(w => w.type === "refund" && w.createdAt >= todayStart && w.createdAt < new Date(todayStart.getTime() + 86400000))
        .length,
      // Avito
      avito_balance: await fetchAvitoBalance(),
    };

    // ── Lead Funnel (monthly) ─────────────────────────────────────────────────
    const monthLeads = leads.filter(l => l.createdAt >= monthStart);
    const leadFunnel = {
      total: monthLeads.length,
      processing: monthLeads.filter(l => l.status === "processing").length,
      sent_to_work: monthLeads.filter(l => l.status === "sent_to_work").length,
      rejected: monthLeads.filter(l => ["non_target", "client_refusal"].includes(l.status)).length,
      conversion_rate: monthLeads.length > 0
        ? Math.round((monthLeads.filter(l => l.status === "sent_to_work").length / monthLeads.length) * 1000) / 10
        : 0,
    };

    // ── Lead Sources ──────────────────────────────────────────────────────────
    const channelMap = new Map<string, { count: number; sentToWork: number }>();
    for (const l of leads.filter(l => l.createdAt >= monthStart)) {
      const ch = l.leadChannel ?? l.source ?? "other";
      const existing = channelMap.get(ch) ?? { count: 0, sentToWork: 0 };
      existing.count++;
      if (l.status === "sent_to_work") existing.sentToWork++;
      channelMap.set(ch, existing);
    }
    const leadSources = Array.from(channelMap.entries()).map(([channel, stats]) => ({
      channel,
      count: stats.count,
      sent_to_work: stats.sentToWork,
      conversion: stats.count > 0 ? Math.round((stats.sentToWork / stats.count) * 1000) / 10 : 0,
    })).sort((a, b) => b.count - a.count);

    // ── Token Charts (new) ─────────────────────────────────────────────────────
    function buildDailyTokenSales(days: number) {
      const result = [];
      for (let i = days - 1; i >= 0; i--) {
        const dayStart = new Date(todayStart.getTime() - i * 86400000);
        const dayEnd = new Date(dayStart.getTime() + 86400000);
        const dayPurchases = walletTxs.filter(w => w.type === "purchase" && w.createdAt >= dayStart && w.createdAt < dayEnd);
        let small = 0, medium = 0, large = 0, revenue = 0;
        for (const w of dayPurchases) {
          const pkg = w.packageId ? tokenPackages.find(p => p.id === w.packageId) : null;
          const tokens = Number(w.tokensAmount);
          revenue += w.rubAmount ?? 0;
          if (pkg) {
            const count = Number(pkg.tokensCount);
            if (count <= 60) small += tokens;
            else if (count <= 150) medium += tokens;
            else large += tokens;
          } else {
            // fallback: categorize by token amount
            if (tokens <= 60) small += tokens;
            else if (tokens <= 150) medium += tokens;
            else large += tokens;
          }
        }
        result.push({ date: dayStart.toISOString().split("T")[0], small, medium, large, revenue });
      }
      return result;
    }
    const dailyTokenSales = buildDailyTokenSales(14);

    function buildTokenFlow(days: number) {
      const result = [];
      for (let i = days - 1; i >= 0; i--) {
        const dayStart = new Date(todayStart.getTime() - i * 86400000);
        const dayEnd = new Date(dayStart.getTime() + 86400000);
        const inflow = walletTxs
          .filter(w => w.type === "purchase" && w.createdAt >= dayStart && w.createdAt < dayEnd)
          .reduce((s, w) => s + Number(w.tokensAmount), 0);
        const outflow = walletTxs
          .filter(w => w.type === "deduct" && w.createdAt >= dayStart && w.createdAt < dayEnd)
          .reduce((s, w) => s + Number(w.tokensAmount), 0);
        // Float is current total balance (snapshot — approximate, using current balance for simplicity)
        const float = wallets.reduce((s, w) => s + Number(w.tokensBalance), 0);
        result.push({ date: dayStart.toISOString().split("T")[0], inflow, outflow, float });
      }
      return result;
    }
    const tokenFlow = buildTokenFlow(14);


    // ── Live Feed (last 20 events) ────────────────────────────────────────────
    type FeedType = "token_purchase" | "new_lead" | "assigned" | "completed" | "new_master";
    const feedEvents: { id: number; type: FeedType; timestamp: Date; text: string; city: string; amount: number | null }[] = [];
    const cutoff24h = new Date(now.getTime() - 24 * 3600000);

    const recentTokenPurchases = walletTxs
      .filter(w => w.type === "purchase" && w.createdAt >= cutoff24h)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 8);
    recentTokenPurchases.forEach((w, i) => {
      const master = masters.find(m => m.id === w.masterId);
      feedEvents.push({ id: i + 1000, type: "token_purchase", timestamp: w.createdAt, text: `Мастер ${master?.alias ?? `#${w.masterId}`} купил ${Number(w.tokensAmount)} токенов`, city: master?.city ?? "", amount: Number(w.tokensAmount) });
    });

    const recentAssigned = orders
      .filter(o => o.masterId && o.assignedAt && o.assignedAt >= cutoff24h)
      .sort((a, b) => (b.assignedAt?.getTime() ?? 0) - (a.assignedAt?.getTime() ?? 0))
      .slice(0, 5);
    recentAssigned.forEach((o, i) => {
      const master = o.masterId ? masters.find(m => m.id === o.masterId) : null;
      feedEvents.push({ id: i + 1500, type: "assigned", timestamp: o.assignedAt!, text: `Заказ #${o.id} назначен мастеру ${master?.alias ?? `#${o.masterId}`}`, city: o.city, amount: null });
    });

    const recentLeads = leads.filter(l => l.createdAt >= cutoff24h)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 5);
    recentLeads.forEach((l, i) => {
      feedEvents.push({ id: i + 2000, type: "new_lead", timestamp: l.createdAt, text: `Новая заявка: ${(l as any).serviceType ?? "ремонт"}, ${l.city}`, city: l.city, amount: null });
    });

    const recentCompleted = orders.filter(o => o.status === "completed" && o.completedAt && o.completedAt >= cutoff24h)
      .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0))
      .slice(0, 5);
    recentCompleted.forEach((o, i) => {
      feedEvents.push({ id: i + 3000, type: "completed", timestamp: o.completedAt!, text: `Заказ #${o.id} завершён`, city: o.city, amount: o.orderAmount ? Number(o.orderAmount) : null });
    });

    const recentMasters = masters.filter(m => m.createdAt >= cutoff24h)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 3);
    recentMasters.forEach((m, i) => {
      feedEvents.push({ id: i + 4000, type: "new_master", timestamp: m.createdAt, text: `Зарегистрирован мастер ${m.alias}, ${m.city}`, city: m.city, amount: null });
    });

    feedEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const liveFeed = feedEvents.slice(0, 20);

    // ── Cities ────────────────────────────────────────────────────────────────
    const allCities = [...new Set([...leads.map(l => l.city), ...orders.map(o => o.city)])].filter(Boolean);
    const citiesData = allCities.map(city => {
      const cityLeads = leads.filter(l => l.city === city);
      const cityOrders = orders.filter(o => o.city === city);
      const cityCompletedOrders = cityOrders.filter(o => o.status === "completed");
      const cityMastersTotal = masters.filter(m => m.city === city).length;
      const cityMastersActive = masters.filter(m => m.city === city && m.status === "active").length;

      // Token metrics per city with fallback
      const cityMasterIds = new Set(masters.filter(m => m.city === city).map(m => m.id));
      const cityTokenRevenue = walletTxs
        .filter(w => w.type === "purchase" && cityMasterIds.has(w.masterId))
        .reduce((s, w) => {
          if (w.rubAmount && Number(w.rubAmount) > 0) return s + Number(w.rubAmount);
          if (w.packageId) {
            const pkg = tokenPackages.find(p => p.id === w.packageId);
            if (pkg && pkg.priceRub) return s + Number(pkg.priceRub);
          }
          const avgPricePerToken = tokenPackages.length > 0
            ? tokenPackages.reduce((sum, p) => sum + Number(p.pricePerToken), 0) / tokenPackages.length
            : 10;
          return s + Number(w.tokensAmount) * avgPricePerToken;
        }, 0);
      const cityWallets = wallets.filter(w => {
        const master = masters.find(m => m.id === w.masterId);
        return master && master.city === city;
      });
      const freeMasters = cityWallets.filter(w => {
        const hasActiveOrder = orders.some(o => o.masterId === w.masterId && ["master_assigned", "in_progress"].includes(o.status));
        return Number(w.tokensBalance) > 0 && !hasActiveOrder;
      }).length;
      const waitingOrders = cityOrders.filter(o => o.status === "waiting_master").length;
      const ratio = freeMasters > 0 ? waitingOrders / freeMasters : 0;

      return {
        city,
        leads: cityLeads.length,
        masters_total: cityMastersTotal,
        masters_active: cityMastersActive,
        conversion: cityLeads.length > 0 ? Math.round((cityCompletedOrders.length / cityLeads.length) * 1000) / 10 : 0,
        token_revenue: Math.round(cityTokenRevenue),
        free_masters: freeMasters,
        waiting_orders: waitingOrders,
        ratio: Math.round(ratio * 10) / 10,
      };
    }).sort((a, b) => b.token_revenue - a.token_revenue).slice(0, 6);

    // ── Top Masters ───────────────────────────────────────────────────────────
    const topMasters = masters
      .filter(m => m.status === "active")
      .map(m => {
        const mCompleted = orders.filter(o => o.masterId === m.id && o.status === "completed");
        const mTotal = orders.filter(o => o.masterId === m.id);
        const revenue = mCompleted.reduce((s, o) => {
          return s + txRows.filter(t => t.orderId === o.id && t.paymentStatus === "paid").reduce((ss, t) => ss + Number(t.commission), 0);
        }, 0);
        // Token metrics
        const wallet = wallets.find(w => w.masterId === m.id);
        const tokenPurchases = walletTxs.filter(w => w.masterId === m.id && w.type === "purchase");
        const totalTokensSpent = walletTxs
          .filter(w => w.masterId === m.id && w.type === "deduct")
          .reduce((s, w) => s + Number(w.tokensAmount), 0);
        const lastPurchase = tokenPurchases.length > 0
          ? tokenPurchases.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
          : null;
        const lastPurchaseAt = lastPurchase?.createdAt ?? null;
        const daysSincePurchase = lastPurchaseAt
          ? Math.floor((now.getTime() - lastPurchaseAt.getTime()) / 86400000)
          : null;
        const dailyBurn = totalTokensSpent / 30; // approximate daily burn (last 30 days)
        const balance = Number(wallet?.tokensBalance ?? 0);
        const daysUntilZero = dailyBurn > 0 ? Math.floor(balance / dailyBurn) : (balance > 0 ? 999 : 0);

        return {
          id: m.id,
          name: m.alias,
          city: m.city,
          orders_completed: mCompleted.length,
          conversion: mTotal.length > 0 ? Math.round((mCompleted.length / mTotal.length) * 1000) / 10 : 0,
          rating: Number(m.rating),
          revenue_brought: Math.round(revenue),
          // Token metrics
          tokens_balance: balance,
          tokens_spent: totalTokensSpent,
          total_purchases: tokenPurchases.length,
          last_purchase_at: lastPurchaseAt,
          days_since_purchase: daysSincePurchase,
          days_until_zero: daysUntilZero,
        };
      })
      .filter(m => m.orders_completed > 0 || m.total_purchases > 0)
      .sort((a, b) => b.tokens_spent - a.tokens_spent || b.orders_completed - a.orders_completed)
      .slice(0, 5);

    // ── Recent Orders ─────────────────────────────────────────────────────────
    const STATUS_MAP: Record<string, string> = {
      waiting_master: "searching", master_assigned: "assigned", in_progress: "in_progress",
      completed: "completed", cancelled: "cancelled", on_site: "on_site",
      awaiting_estimate: "awaiting_estimate", awaiting_payment: "awaiting_payment",
    };
    const leadMap = new Map(leads.map(l => [l.id, l]));
    const masterMap = new Map(masters.map(m => [m.id, m]));

    const recentOrders = orders
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10)
      .map(o => {
        const lead = o.leadId ? leadMap.get(o.leadId) : null;
        const master = o.masterId ? masterMap.get(o.masterId) : null;
        const masterWallet = master ? wallets.find(w => w.masterId === master.id) : null;
        return {
          id: o.id,
          created_at: o.createdAt,
          city: o.city,
          client: lead ? ((lead as any).clientName ?? (lead as any).clientPhone ?? "—") : "—",
          master: master ? master.alias : null,
          service: (o as any).serviceType ?? "—",
          amount: o.orderAmount ? Number(o.orderAmount) : null,
          status: STATUS_MAP[o.status] ?? o.status,
          tokens_charged: Number(o.tokensCharged ?? 0),
          payment_model: o.paymentModel,
          master_balance_after: masterWallet ? Number(masterWallet.tokensBalance) : null,
        };
      });

    res.json({
      summary,
      leadFunnel,
      leadSources,
      liveFeed,
      cities: citiesData,
      topMasters,
      recentOrders,
      dailyTokenSales,
      tokenFlow,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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

export default router;
