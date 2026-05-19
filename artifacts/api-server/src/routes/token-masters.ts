import { Router } from "express";
import { db, mastersTable, masterWalletTable, walletTransactionsTable, ordersTable, tokenPackagesTable } from "@workspace/db";
import { eq, desc, asc, and, isNull, ilike, or, sql, gte, lte, count } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth.js";

const router = Router();
const ops = requireRole("admin", "master_operator", "lead_operator");

declare const console: any;

// ─── GET /api/token-masters/stats ────────────────────────────────────────────
router.get("/stats", ops, async (_req: any, res: any) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      activeTodayRows,
      onlineNowRows,
      mastersWithBalanceRows,
      totalTokensSoldRows,
      avgConversionRows,
      avgResponseTimeRows,
      churnRiskRows,
    ] = await Promise.all([
      // Active today
      db
        .select({ cnt: count() })
        .from(mastersTable)
        .where(and(
          isNull(mastersTable.deletedAt),
          gte(mastersTable.lastSeenAt, todayStart),
        )),
      // Online now (last seen < 5 min ago)
      db
        .select({ cnt: count() })
        .from(mastersTable)
        .where(and(
          isNull(mastersTable.deletedAt),
          gte(mastersTable.lastSeenAt, fiveMinAgo),
        )),
      // Masters with token balance > 0
      db
        .select({ cnt: count() })
        .from(masterWalletTable)
        .innerJoin(mastersTable, and(
          eq(masterWalletTable.masterId, mastersTable.id),
          isNull(mastersTable.deletedAt),
        ))
        .where(sql`${masterWalletTable.tokensBalance} > 0`),
      // Total tokens sold (sum of all purchased)
      db
        .select({ total: sql<number>`COALESCE(SUM(${masterWalletTable.totalTokensPurchased}), 0)` })
        .from(masterWalletTable)
        .innerJoin(mastersTable, and(
          eq(masterWalletTable.masterId, mastersTable.id),
          isNull(mastersTable.deletedAt),
        )),
      // Avg conversion — only token orders (tokensCharged > 0)
      db
        .select({
          totalToken: sql<number>`COUNT(*) FILTER (WHERE ${ordersTable.tokensCharged}::numeric > 0)`,
          completedToken: sql<number>`COUNT(*) FILTER (WHERE ${ordersTable.tokensCharged}::numeric > 0 AND ${ordersTable.status} = 'completed')`,
        })
        .from(ordersTable)
        .where(and(
          isNull(ordersTable.deletedAt),
          sql`${ordersTable.masterId} IS NOT NULL`,
        )),
      // Avg response time
      db
        .select({
          avgResponseTime: sql<number>`ROUND(COALESCE(AVG(${mastersTable.avgResponseTime}), 0)::numeric, 0)`,
        })
        .from(mastersTable)
        .where(and(
          isNull(mastersTable.deletedAt),
          sql`${mastersTable.avgResponseTime} IS NOT NULL`,
        )),
      // Churn risk: balance = 0 AND not seen in 7 days
      db
        .select({ cnt: count() })
        .from(masterWalletTable)
        .innerJoin(mastersTable, and(
          eq(masterWalletTable.masterId, mastersTable.id),
          isNull(mastersTable.deletedAt),
          eq(mastersTable.status, "active"),
        ))
        .where(and(
          sql`${masterWalletTable.tokensBalance} = 0`,
          lte(mastersTable.lastSeenAt, sevenDaysAgo),
        )),
    ]);

    return res.json({
      activeToday: Number(activeTodayRows[0]?.cnt ?? 0),
      onlineNow: Number(onlineNowRows[0]?.cnt ?? 0),
      mastersWithBalance: Number(mastersWithBalanceRows[0]?.cnt ?? 0),
      totalTokensSold: Number(totalTokensSoldRows[0]?.total ?? 0),
      avgConversion: avgConversionRows[0]?.totalToken > 0
        ? Math.round((Number(avgConversionRows[0].completedToken) / Number(avgConversionRows[0].totalToken)) * 1000) / 10
        : 0,
      avgResponseTime: Number(avgResponseTimeRows[0]?.avgResponseTime ?? 0),
      churnRisk: Number(churnRiskRows[0]?.cnt ?? 0),
    });
  } catch (err: any) {
    console.error("[token-masters/stats]", err);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
});

// ─── GET /api/token-masters ───────────────────────────────────────────────────
router.get("/", ops, async (req: any, res: any) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const offset = (page - 1) * limit;
    const search = (req.query.search as string) ?? "";
    const city = (req.query.city as string) ?? "";
    const specialization = (req.query.specialization as string) ?? "";
    const status = (req.query.status as string) ?? "";
    const sort = (req.query.sort as string) ?? "activity";

    const conditions: any[] = [isNull(mastersTable.deletedAt)];
    if (search) {
      conditions.push(or(
        ilike(mastersTable.alias, `%${search}%`),
        ilike(mastersTable.phone, `%${search}%`),
      ));
    }
    if (city) conditions.push(eq(mastersTable.city, city));
    if (specialization) conditions.push(eq(mastersTable.specialization, specialization));
    if (status) conditions.push(eq(mastersTable.status, status as any));

    const whereClause = and(...conditions);

    // Subquery: declared revenue — only from token orders
    const revenueSubquery = db
      .select({
        masterId: ordersTable.masterId,
        totalRevenue: sql<number>`COALESCE(SUM(${ordersTable.proposedAmount}), 0)`.as("total_revenue"),
      })
      .from(ordersTable)
      .where(and(
        eq(ordersTable.status, "completed"),
        isNull(ordersTable.deletedAt),
        sql`${ordersTable.tokensCharged}::numeric > 0`,
      ))
      .groupBy(ordersTable.masterId)
      .as("revenue_sub");

    // Subquery: token order counts per master
    const tokenOrdersSub = db
      .select({
        masterId: ordersTable.masterId,
        tokenOrdersTotal: sql<number>`COUNT(*)`.as("token_orders_total"),
        tokenOrdersCompleted: sql<number>`COUNT(*) FILTER (WHERE ${ordersTable.status} = 'completed')`.as("token_orders_completed"),
        tokenOrdersCancelled: sql<number>`COUNT(*) FILTER (WHERE ${ordersTable.status} = 'cancelled')`.as("token_orders_cancelled"),
      })
      .from(ordersTable)
      .where(and(
        isNull(ordersTable.deletedAt),
        sql`${ordersTable.tokensCharged}::numeric > 0`,
      ))
      .groupBy(ordersTable.masterId)
      .as("token_orders_sub");

    // Determine sort order
    const getSortExpr = () => {
      switch (sort) {
        case "balance": return desc(sql`COALESCE(${masterWalletTable.tokensBalance}, 0)`);
        case "orders": return desc(sql`COALESCE(${tokenOrdersSub.tokenOrdersTotal}, 0)`);
        case "conversion": return desc(sql`
          CASE WHEN COALESCE(${tokenOrdersSub.tokenOrdersTotal}, 0) > 0
          THEN CAST(COALESCE(${tokenOrdersSub.tokenOrdersCompleted}, 0) AS FLOAT) / ${tokenOrdersSub.tokenOrdersTotal}
          ELSE 0 END
        `);
        case "rating": return desc(mastersTable.rating);
        case "revenue": return desc(sql`COALESCE(${revenueSubquery.totalRevenue}, 0)`);
        case "roi": return desc(sql`
          CASE WHEN COALESCE(${masterWalletTable.totalRubSpent}, 0) > 0
          THEN COALESCE(${revenueSubquery.totalRevenue}, 0) / ${masterWalletTable.totalRubSpent}
          ELSE 0 END
        `);
        case "response": return asc(sql`${mastersTable.avgResponseTime} NULLS LAST`);
        default: return desc(mastersTable.lastSeenAt);
      }
    };

    const [rows, totalRows] = await Promise.all([
      db
        .select({
          id: mastersTable.id,
          alias: mastersTable.alias,
          city: mastersTable.city,
          specialization: mastersTable.specialization,
          specializations: mastersTable.specializations,
          phone: mastersTable.phone,
          status: mastersTable.status,
          rating: mastersTable.rating,
          avgResponseTime: mastersTable.avgResponseTime,
          lastSeenAt: mastersTable.lastSeenAt,
          avatarUrl: mastersTable.customAvatarUrl,
          createdAt: mastersTable.createdAt,
          tokensBalance: masterWalletTable.tokensBalance,
          totalTokensPurchased: masterWalletTable.totalTokensPurchased,
          totalTokensSpent: masterWalletTable.totalTokensSpent,
          totalRubSpent: masterWalletTable.totalRubSpent,
          totalRevenue: revenueSubquery.totalRevenue,
          tokenOrdersTotal: tokenOrdersSub.tokenOrdersTotal,
          tokenOrdersCompleted: tokenOrdersSub.tokenOrdersCompleted,
          tokenOrdersCancelled: tokenOrdersSub.tokenOrdersCancelled,
        })
        .from(mastersTable)
        .leftJoin(masterWalletTable, eq(masterWalletTable.masterId, mastersTable.id))
        .leftJoin(revenueSubquery, eq(revenueSubquery.masterId, mastersTable.id))
        .leftJoin(tokenOrdersSub, eq(tokenOrdersSub.masterId, mastersTable.id))
        .where(whereClause)
        .orderBy(getSortExpr())
        .limit(limit)
        .offset(offset),
      db
        .select({ cnt: count() })
        .from(mastersTable)
        .where(whereClause),
    ]);

    const data = rows.map(r => {
      const tokensBalance = Number(r.tokensBalance ?? 0);
      const totalRubSpent = Number(r.totalRubSpent ?? 0);
      const totalRevenue = Number(r.totalRevenue ?? 0);
      const tokenOrdersTotal = Number(r.tokenOrdersTotal ?? 0);
      const tokenOrdersCompleted = Number(r.tokenOrdersCompleted ?? 0);
      const tokenOrdersCancelled = Number(r.tokenOrdersCancelled ?? 0);
      const conversion = tokenOrdersTotal > 0
        ? Math.round((tokenOrdersCompleted / tokenOrdersTotal) * 100)
        : null;
      const roi = totalRubSpent > 0 ? Math.round((totalRevenue / totalRubSpent) * 10) / 10 : null;

      return {
        id: r.id,
        alias: r.alias,
        city: r.city,
        specialization: r.specialization,
        specializations: r.specializations,
        phone: r.phone,
        status: r.status,
        rating: Number(r.rating),
        avgResponseTime: r.avgResponseTime ? Number(r.avgResponseTime) : null,
        lastSeenAt: r.lastSeenAt,
        avatarUrl: r.avatarUrl,
        createdAt: r.createdAt,
        tokensBalance,
        totalTokensPurchased: Number(r.totalTokensPurchased ?? 0),
        totalTokensSpent: Number(r.totalTokensSpent ?? 0),
        totalRubSpent,
        totalRevenue,
        tokenOrdersTotal,
        tokenOrdersCompleted,
        tokenOrdersCancelled,
        conversion,
        roi,
      };
    });

    return res.json({
      data,
      total: Number(totalRows[0]?.cnt ?? 0),
      page,
      limit,
    });
  } catch (err: any) {
    console.error("[token-masters]", err);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
});

// ─── GET /api/token-masters/:id ───────────────────────────────────────────────
router.get("/:id", ops, async (req: any, res: any) => {
  try {
    const masterId = parseInt(req.params.id);
    if (isNaN(masterId)) return res.status(400).json({ error: "Неверный id" });

    const [masterRows, walletRows, txRows, completedOrderStats] = await Promise.all([
      db.select().from(mastersTable).where(and(
        eq(mastersTable.id, masterId),
        isNull(mastersTable.deletedAt),
      )).limit(1),
      db.select().from(masterWalletTable).where(eq(masterWalletTable.masterId, masterId)).limit(1),
      db
        .select({
          id: walletTransactionsTable.id,
          type: walletTransactionsTable.type,
          tokensAmount: walletTransactionsTable.tokensAmount,
          rubAmount: walletTransactionsTable.rubAmount,
          packageName: tokenPackagesTable.name,
          orderId: walletTransactionsTable.orderId,
          reason: walletTransactionsTable.reason,
          createdBy: walletTransactionsTable.createdBy,
          status: walletTransactionsTable.status,
          createdAt: walletTransactionsTable.createdAt,
        })
        .from(walletTransactionsTable)
        .leftJoin(tokenPackagesTable, eq(walletTransactionsTable.packageId, tokenPackagesTable.id))
        .where(eq(walletTransactionsTable.masterId, masterId))
        .orderBy(desc(walletTransactionsTable.createdAt))
        .limit(50),
      db
        .select({
          tokenOrdersTotal: sql<number>`COUNT(*)`,
          tokenOrdersCompleted: sql<number>`COUNT(*) FILTER (WHERE ${ordersTable.status} = 'completed')`,
          tokenOrdersCancelled: sql<number>`COUNT(*) FILTER (WHERE ${ordersTable.status} = 'cancelled')`,
          totalRevenue: sql<number>`COALESCE(SUM(${ordersTable.proposedAmount}) FILTER (WHERE ${ordersTable.status} = 'completed'), 0)`,
          avgRevenue: sql<number>`COALESCE(AVG(${ordersTable.proposedAmount}) FILTER (WHERE ${ordersTable.status} = 'completed'), 0)`,
        })
        .from(ordersTable)
        .where(and(
          eq(ordersTable.masterId, masterId),
          isNull(ordersTable.deletedAt),
          sql`${ordersTable.tokensCharged}::numeric > 0`,
        )),
    ]);

    if (!masterRows.length) return res.status(404).json({ error: "Мастер не найден" });
    const master = masterRows[0];
    const wallet = walletRows[0] ?? null;
    const stats = completedOrderStats[0];

    const tokensBalance = wallet ? Number(wallet.tokensBalance) : 0;
    const totalRubSpent = wallet ? Number(wallet.totalRubSpent) : 0;
    const totalRevenue = Number(stats?.totalRevenue ?? 0);
    const tokenOrdersTotal = Number(stats?.tokenOrdersTotal ?? 0);
    const tokenOrdersCompleted = Number(stats?.tokenOrdersCompleted ?? 0);
    const tokenOrdersCancelled = Number(stats?.tokenOrdersCancelled ?? 0);
    const conversion = tokenOrdersTotal > 0
      ? Math.round((tokenOrdersCompleted / tokenOrdersTotal) * 100)
      : null;
    const roi = totalRubSpent > 0 ? Math.round((totalRevenue / totalRubSpent) * 10) / 10 : null;

    return res.json({
      id: master.id,
      alias: master.alias,
      city: master.city,
      specialization: master.specialization,
      specializations: master.specializations,
      phone: master.phone,
      status: master.status,
      rating: Number(master.rating),
      avgResponseTime: master.avgResponseTime ? Number(master.avgResponseTime) : null,
      lastSeenAt: master.lastSeenAt,
      avatarUrl: master.customAvatarUrl,
      createdAt: master.createdAt,
      contractSignedAt: master.contractSignedAt,
      passportVerified: master.passportVerified,
      telegramId: master.telegramId,
      pwaLogin: master.pwaLogin,
      tags: master.tags,
      wallet: wallet ? {
        tokensBalance,
        totalTokensPurchased: Number(wallet.totalTokensPurchased),
        totalTokensSpent: Number(wallet.totalTokensSpent),
        totalTokensRefunded: Number(wallet.totalTokensRefunded),
        totalRubSpent,
      } : null,
      stats: {
        totalRevenue,
        avgRevenue: Math.round(Number(stats?.avgRevenue ?? 0)),
        tokenOrdersTotal,
        tokenOrdersCompleted,
        tokenOrdersCancelled,
        conversion,
        roi,
      },
      transactions: txRows.map(t => ({
        id: t.id,
        type: t.type,
        tokensAmount: Number(t.tokensAmount),
        rubAmount: t.rubAmount,
        packageName: t.packageName ?? null,
        orderId: t.orderId,
        reason: t.reason,
        createdBy: t.createdBy,
        status: t.status,
        createdAt: t.createdAt,
      })),
    });
  } catch (err: any) {
    console.error("[token-masters/:id]", err);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
});

export default router;
