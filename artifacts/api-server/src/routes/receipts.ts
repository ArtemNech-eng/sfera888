import { Router, type Request } from "express";
import { db, receiptsTable, ordersTable, mastersTable, leadsTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth.js";
import crypto from "crypto";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function buildReceiptResponse(receipt: typeof receiptsTable.$inferSelect, master: typeof mastersTable.$inferSelect | undefined) {
  const host = process.env.PUBLIC_HOST ?? "sfera-project.digital";
  return {
    id: receipt.id,
    token: receipt.token,
    orderId: receipt.orderId,
    masterId: receipt.masterId,
    clientName: receipt.clientName,
    clientPhone: receipt.clientPhone,
    serviceType: receipt.serviceType,
    city: receipt.city,
    district: receipt.district,
    lineItems: receipt.lineItems ?? [],
    totalAmount: Number(receipt.totalAmount),
    prepaymentAmount: Number(receipt.prepaymentAmount),
    notes: receipt.notes,
    createdAt: receipt.createdAt,
    masterAlias: master?.alias ?? null,
    masterPhone: master?.phone ?? null,
    masterFullName: master?.contractFullName ?? null,
    masterAddress: (master as any)?.contractAddress ?? null,
    publicUrl: `https://${host}/receipt/${receipt.token}`,
  };
}

async function getOrderAndLead(orderId: number) {
  const [order] = await db.select().from(ordersTable).where(and(eq(ordersTable.id, orderId), isNull(ordersTable.deletedAt)));
  if (!order) return { order: null, lead: null };
  const [lead] = order.leadId
    ? await db.select().from(leadsTable).where(eq(leadsTable.id, order.leadId))
    : [];
  return { order, lead: lead ?? null };
}

// ─── CRM: GET /api/receipts/order/:orderId ────────────────────────────────────

router.get("/order/:orderId", requireRole("admin", "master_operator"), async (req, res) => {
  const orderId = parseInt(req.params.orderId);
  const rows = await db.select().from(receiptsTable).where(eq(receiptsTable.orderId, orderId));
  const masterIds = [...new Set(rows.map(r => r.masterId))];
  const masters = masterIds.length
    ? await db.select().from(mastersTable).where(eq(mastersTable.id, masterIds[0]))
    : [];
  const masterMap = new Map(masters.map(m => [m.id, m]));
  res.json(await Promise.all(rows.map(r => buildReceiptResponse(r, masterMap.get(r.masterId)))));
});

// ─── Public JSON: GET /api/receipts/public/:token ─────────────────────────────

router.get("/public/:token", async (req, res) => {
  const [receipt] = await db.select().from(receiptsTable).where(eq(receiptsTable.token, req.params.token));
  if (!receipt) return res.status(404).json({ error: "Расписка не найдена" });
  const [master] = await db.select().from(mastersTable).where(eq(mastersTable.id, receipt.masterId));
  res.json(await buildReceiptResponse(receipt, master));
});

// ─── CRM: POST /api/receipts/crm — Admin/operator creates receipt ─────────────

router.post("/crm", requireRole("admin", "master_operator"), async (req, res) => {
  const { orderId, lineItems, prepaymentAmount, notes, clientName, clientPhone } = req.body;
  if (!orderId) return res.status(400).json({ error: "Не указан orderId" });
  if (!Array.isArray(lineItems) || lineItems.length === 0) return res.status(400).json({ error: "Добавьте хотя бы одну позицию" });
  if (!prepaymentAmount || Number(prepaymentAmount) <= 0) return res.status(400).json({ error: "Укажите сумму предоплаты" });

  const { order, lead } = await getOrderAndLead(orderId);
  if (!order) return res.status(404).json({ error: "Заказ не найден" });
  if (!order.masterId) return res.status(400).json({ error: "К заказу не назначен мастер" });

  const validItems = lineItems.map((item: any) => ({
    description: String(item.description ?? "").trim(),
    price: Number(item.price ?? 0),
  })).filter(i => i.description && i.price > 0);

  if (validItems.length === 0) return res.status(400).json({ error: "Все позиции должны иметь описание и цену" });

  const totalAmount = validItems.reduce((sum, i) => sum + i.price, 0);
  const token = crypto.randomBytes(20).toString("hex");

  const finalClientName = clientName?.trim() || lead?.clientName || "Клиент";
  const finalClientPhone = clientPhone?.trim() || lead?.clientPhone || "";

  const [receipt] = await db.insert(receiptsTable).values({
    token,
    orderId,
    masterId: order.masterId,
    clientName: finalClientName,
    clientPhone: finalClientPhone,
    serviceType: order.serviceType,
    city: order.city,
    district: order.district ?? null,
    lineItems: validItems,
    totalAmount: String(totalAmount),
    prepaymentAmount: String(Number(prepaymentAmount)),
    notes: notes?.trim() || null,
  }).returning();

  const [master] = await db.select().from(mastersTable).where(eq(mastersTable.id, order.masterId));
  res.json(await buildReceiptResponse(receipt, master));
});

// ─── Master PWA: POST /api/receipts — Master creates receipt ─────────────────

router.post("/", async (req: any, res) => {
  const masterId = req.session?.masterId;
  if (!masterId) return res.status(401).json({ error: "Не авторизован" });

  const { orderId, lineItems, prepaymentAmount, notes } = req.body;
  if (!orderId) return res.status(400).json({ error: "Не указан orderId" });
  if (!Array.isArray(lineItems) || lineItems.length === 0) return res.status(400).json({ error: "Добавьте хотя бы одну позицию" });
  if (!prepaymentAmount || Number(prepaymentAmount) <= 0) return res.status(400).json({ error: "Укажите сумму предоплаты" });

  // Validate order belongs to this master
  const [order] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.masterId, masterId), isNull(ordersTable.deletedAt)));
  if (!order) return res.status(404).json({ error: "Заказ не найден" });

  const [lead] = order.leadId
    ? await db.select().from(leadsTable).where(eq(leadsTable.id, order.leadId))
    : [];

  const validItems = lineItems.map((item: any) => ({
    description: String(item.description ?? "").trim(),
    price: Number(item.price ?? 0),
  })).filter(i => i.description && i.price > 0);

  if (validItems.length === 0) return res.status(400).json({ error: "Все позиции должны иметь описание и цену" });

  const totalAmount = validItems.reduce((sum, i) => sum + i.price, 0);
  const token = crypto.randomBytes(20).toString("hex");

  const [receipt] = await db.insert(receiptsTable).values({
    token,
    orderId,
    masterId,
    clientName: lead?.clientName ?? "Клиент",
    clientPhone: lead?.clientPhone ?? "",
    serviceType: order.serviceType,
    city: order.city,
    district: order.district ?? null,
    lineItems: validItems,
    totalAmount: String(totalAmount),
    prepaymentAmount: String(Number(prepaymentAmount)),
    notes: notes?.trim() || null,
  }).returning();

  const [master] = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId));
  res.json(await buildReceiptResponse(receipt, master));
});

export default router;
