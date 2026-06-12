/**
 * Admin endpoints for the remove-token-payment-model migration (Phase A
 * preparation). Lets admin:
 *   1. List masters with positive `tokensBalance` (mostly 2 by D1).
 *   2. Create/update/delete `master_balance_grants` rows — one per master,
 *      with the rouble amount admin decides to credit.
 *   3. Run a dry-run preview of what the Phase B migration script will do.
 *
 * Endpoints all live under `/api/admin/token-migration/*`. Auth: admin only.
 *
 * The actual migration script (`scripts/src/migrate-remove-tokens.ts`)
 * runs from CLI — these endpoints prepare data and validate.
 */

import { Router } from "express";
import { db, masterWalletTable, mastersTable, ordersTable, walletTransactionsTable, masterBalanceGrantsTable } from "@workspace/db";
import { eq, and, gt, sql, isNull, ne, inArray } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth.js";

const router = Router();
const adminOnly = requireRole("admin");

/**
 * GET /api/admin/token-migration/masters-with-balance
 *
 * Returns list of masters that need a manual grant (positive tokensBalance,
 * positive creditTokensIssued, or both). Admin uses this to know who to
 * create grants for.
 */
router.get("/masters-with-balance", adminOnly, async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: mastersTable.id,
        alias: mastersTable.alias,
        city: mastersTable.city,
        tokensBalance: masterWalletTable.tokensBalance,
        creditTokensIssued: masterWalletTable.creditTokensIssued,
        totalRubSpent: masterWalletTable.totalRubSpent,
      })
      .from(mastersTable)
      .innerJoin(masterWalletTable, eq(masterWalletTable.masterId, mastersTable.id))
      .where(
        and(
          isNull(mastersTable.deletedAt),
          // Either positive tokens balance or had credit tokens issued.
          sql`(${masterWalletTable.tokensBalance}::numeric > 0 OR ${masterWalletTable.creditTokensIssued}::numeric > 0)`,
        ),
      );

    // Pick existing grants per master (one per master at most).
    const masterIds = rows.map((r) => r.id);
    const existingGrants = masterIds.length
      ? await db
          .select()
          .from(masterBalanceGrantsTable)
          .where(inArray(masterBalanceGrantsTable.masterId, masterIds))
      : [];
    const grantByMaster = new Map(existingGrants.map((g) => [g.masterId, g]));

    // Active orders count for context.
    const activeOrdersCounts = masterIds.length
      ? await db
          .select({
            masterId: ordersTable.masterId,
            count: sql<number>`COUNT(*)`.as("count"),
          })
          .from(ordersTable)
          .where(
            and(
              inArray(ordersTable.masterId, masterIds),
              inArray(ordersTable.status, ["master_assigned", "in_progress", "cancellation_requested"] as any),
              isNull(ordersTable.deletedAt),
            ),
          )
          .groupBy(ordersTable.masterId)
      : [];
    const activeMap = new Map(activeOrdersCounts.map((r) => [r.masterId, Number(r.count)]));

    const masters = rows.map((r) => ({
      id: r.id,
      alias: r.alias,
      city: r.city,
      tokensBalance: Number(r.tokensBalance ?? 0),
      creditTokensIssued: Number(r.creditTokensIssued ?? 0),
      totalRubSpent: Number(r.totalRubSpent ?? 0),
      // D1: ничего не предлагаем — admin сам решает.
      suggestedGrant: null,
      activeOrdersCount: activeMap.get(r.id) ?? 0,
      existingGrant: grantByMaster.has(r.id)
        ? {
            id: grantByMaster.get(r.id)!.id,
            amount: Number(grantByMaster.get(r.id)!.amount),
            reason: grantByMaster.get(r.id)!.reason,
            appliedAt: grantByMaster.get(r.id)!.appliedAt,
          }
        : null,
    }));

    res.json({ masters });
  } catch (err) {
    console.error("[admin/token-migration/masters-with-balance] error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/admin/token-migration/grants
 * Body: { masterId: number, amount: number, reason: string }
 *
 * Create or update grant for a master. If a grant already exists with
 * appliedAt=NULL, it is replaced. If appliedAt is set (already applied) —
 * 409 Conflict.
 */
router.post("/grants", adminOnly, async (req, res) => {
  try {
    const { masterId, amount, reason } = req.body ?? {};
    const masterIdNum = Number(masterId);
    const amountNum = Number(amount);

    if (!Number.isInteger(masterIdNum) || masterIdNum <= 0) {
      return res.status(400).json({ error: "masterId required (positive integer)" });
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return res.status(400).json({ error: "amount required (positive number)" });
    }
    if (typeof reason !== "string" || !reason.trim()) {
      return res.status(400).json({ error: "reason required (non-empty string)" });
    }

    const adminAlias = (req.session as any)?.user?.name ?? (req.session as any)?.user?.login ?? "admin";

    // Existing applied grant? Block with 409.
    const [existing] = await db
      .select()
      .from(masterBalanceGrantsTable)
      .where(eq(masterBalanceGrantsTable.masterId, masterIdNum))
      .limit(1);

    if (existing && existing.appliedAt) {
      return res.status(409).json({ error: "Grant already applied for this master" });
    }

    if (existing) {
      const [updated] = await db
        .update(masterBalanceGrantsTable)
        .set({
          amount: String(amountNum),
          reason: reason.trim(),
          createdBy: adminAlias,
        })
        .where(eq(masterBalanceGrantsTable.id, existing.id))
        .returning();
      return res.json(updated);
    }

    const [created] = await db
      .insert(masterBalanceGrantsTable)
      .values({
        masterId: masterIdNum,
        amount: String(amountNum),
        reason: reason.trim(),
        createdBy: adminAlias,
      })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    console.error("[admin/token-migration/grants POST] error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * DELETE /api/admin/token-migration/grants/:id
 *
 * Remove unapplied grant. If `appliedAt` is set — 409 Conflict.
 */
router.delete("/grants/:id", adminOnly, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: "Invalid grant ID" });

    const [existing] = await db
      .select()
      .from(masterBalanceGrantsTable)
      .where(eq(masterBalanceGrantsTable.id, id))
      .limit(1);
    if (!existing) return res.status(404).json({ error: "Grant not found" });
    if (existing.appliedAt) {
      return res.status(409).json({ error: "Cannot delete an applied grant" });
    }

    await db.delete(masterBalanceGrantsTable).where(eq(masterBalanceGrantsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin/token-migration/grants DELETE] error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/admin/token-migration/dry-run
 *
 * Returns preflight summary describing what Phase B migration script will do.
 * Doesn't modify DB.
 */
router.post("/dry-run", adminOnly, async (_req, res) => {
  try {
    const pendingRefundsCount = (
      await db
        .select({ count: sql<number>`COUNT(*)`.as("count") })
        .from(walletTransactionsTable)
        .where(
          and(
            eq(walletTransactionsTable.type, "refund"),
            eq(walletTransactionsTable.status, "pending"),
          ),
        )
    )[0]?.count ?? 0;

    const mastersWithBalanceCount = (
      await db
        .select({ count: sql<number>`COUNT(*)`.as("count") })
        .from(masterWalletTable)
        .where(sql`${masterWalletTable.tokensBalance}::numeric > 0`)
    )[0]?.count ?? 0;

    const grantsToApplyCount = (
      await db
        .select({ count: sql<number>`COUNT(*)`.as("count") })
        .from(masterBalanceGrantsTable)
        .where(isNull(masterBalanceGrantsTable.appliedAt))
    )[0]?.count ?? 0;

    const creditLimitsToSetCount = (
      await db
        .select({ count: sql<number>`COUNT(*)`.as("count") })
        .from(masterWalletTable)
        .where(
          and(
            sql`${masterWalletTable.creditTokensIssued}::numeric > 0`,
            sql`${masterWalletTable.creditLimit}::numeric < 1500`,
          ),
        )
    )[0]?.count ?? 0;

    const openTokenOrdersCount = (
      await db
        .select({ count: sql<number>`COUNT(*)`.as("count") })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.paymentModel, "token"),
            ne(ordersTable.status, "completed"),
            ne(ordersTable.status, "cancelled"),
            ne(ordersTable.status, "cancellation_requested"),
            isNull(ordersTable.deletedAt),
          ),
        )
    )[0]?.count ?? 0;

    // Master balance counts — used to validate that all positive balances
    // have grants. If mismatch — admin must add more grants before applying.
    const mastersWithBalanceWithoutGrant = (
      await db.execute(sql`
        SELECT COUNT(*) AS count
        FROM master_wallet w
        WHERE w.tokens_balance::numeric > 0
          AND NOT EXISTS (
            SELECT 1 FROM master_balance_grants g
            WHERE g.master_id = w.master_id AND g.applied_at IS NULL
          )
      `)
    ).rows[0] as any;

    const mastersWithoutGrantCount = Number(mastersWithBalanceWithoutGrant?.count ?? 0);

    const errors: string[] = [];
    if (mastersWithoutGrantCount > 0) {
      errors.push(
        `${mastersWithoutGrantCount} мастер(ов) с положительным tokensBalance не имеют grant — добавь grants перед apply`,
      );
    }

    res.json({
      preflight: {
        pendingRefundsCount,
        mastersWithBalanceCount,
        mastersWithoutGrantCount,
        openTokenOrdersCount,
      },
      willApply: {
        refundsToApprove: pendingRefundsCount,
        creditLimitsToSet: creditLimitsToSetCount,
        grantsToApply: grantsToApplyCount,
        ordersToCancel: openTokenOrdersCount,
      },
      errors,
      ok: errors.length === 0,
    });
  } catch (err) {
    console.error("[admin/token-migration/dry-run] error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
