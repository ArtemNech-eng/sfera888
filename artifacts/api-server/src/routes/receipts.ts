import { Router } from "express";
import { db, receiptsTable, ordersTable, mastersTable, leadsTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth.js";
import crypto from "crypto";

const router = Router();

// ─── CRM: GET /api/receipts/order/:orderId ────────────────────────────────────

router.get("/order/:orderId", requireRole("admin", "master_operator"), async (req, res) => {
  const orderId = parseInt(req.params.orderId);
  const rows = await db.select().from(receiptsTable).where(eq(receiptsTable.orderId, orderId));
  const host = process.env.PUBLIC_HOST ?? "sfera-project.digital";
  res.json(rows.map(r => ({
    ...r,
    amount: Number(r.amount),
    publicUrl: `https://${host}/receipt/${r.token}`,
  })));
});

// ─── Public: GET /api/receipts/public/:token ─────────────────────────────────
// Returns JSON used by the HTML page renderer

router.get("/public/:token", async (req, res) => {
  const { token } = req.params;
  const [receipt] = await db.select().from(receiptsTable).where(eq(receiptsTable.token, token));
  if (!receipt) return res.status(404).json({ error: "Расписка не найдена" });
  res.json({ ...receipt, amount: Number(receipt.amount) });
});

// ─── Master PWA: POST /api/receipts ──────────────────────────────────────────
// Creates a receipt from the master's PWA (session-based auth)

router.post("/", async (req: any, res) => {
  const masterId = req.session?.masterId;
  if (!masterId) return res.status(401).json({ error: "Не авторизован" });

  const { orderId, amount, notes } = req.body;
  if (!orderId || !amount) return res.status(400).json({ error: "Не указан orderId или сумма" });

  const amountNum = Number(amount);
  if (isNaN(amountNum) || amountNum <= 0) return res.status(400).json({ error: "Некорректная сумма" });

  // Validate order belongs to this master and is active
  const [order] = await db.select().from(ordersTable)
    .where(and(
      eq(ordersTable.id, orderId),
      eq(ordersTable.masterId, masterId),
      isNull(ordersTable.deletedAt),
    ));
  if (!order) return res.status(404).json({ error: "Заказ не найден" });

  // Get client info from lead
  const [lead] = order.leadId
    ? await db.select().from(leadsTable).where(eq(leadsTable.id, order.leadId))
    : [];

  const clientName = lead?.clientName ?? "Клиент";
  const clientPhone = lead?.clientPhone ?? "";

  // Generate unique token
  const token = crypto.randomBytes(20).toString("hex");

  const [receipt] = await db.insert(receiptsTable).values({
    token,
    orderId,
    masterId,
    clientName,
    clientPhone,
    serviceType: order.serviceType,
    city: order.city,
    district: order.district ?? null,
    amount: String(amountNum),
    notes: notes?.trim() || null,
  }).returning();

  const host = process.env.PUBLIC_HOST ?? "sfera-project.digital";
  res.json({
    ...receipt,
    amount: Number(receipt.amount),
    publicUrl: `https://${host}/receipt/${receipt.token}`,
  });
});

export default router;
