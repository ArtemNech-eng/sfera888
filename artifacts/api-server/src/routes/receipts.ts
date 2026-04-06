import { Router, type Request } from "express";
import { db, receiptsTable, ordersTable, mastersTable, leadsTable, transactionsTable } from "@workspace/db";
import { sendMaxMessage } from "../maxBot.js";
import { eq, and, isNull, isNotNull, desc } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth.js";
import crypto from "crypto";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPublicBase(req: Request): string {
  const host = process.env.PUBLIC_HOST;
  if (host) return `https://${host}`;
  // Dev: use the actual request origin so the link works in dev environment
  return `${req.protocol}://${req.get("host")}`;
}

async function buildReceiptResponse(receipt: typeof receiptsTable.$inferSelect, master: typeof mastersTable.$inferSelect | undefined, req: Request) {
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
    publicUrl: `${getPublicBase(req)}/api/receipt/${receipt.token}`,
    // Client confirmation
    clientSubmittedName: receipt.clientSubmittedName ?? null,
    prepaymentSubmittedAt: receipt.prepaymentSubmittedAt ?? null,
    prepaymentScreenshotUrl: receipt.prepaymentScreenshotUrl ?? null,
    prepaymentSeenAt: receipt.prepaymentSeenAt ?? null,
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

function parseLineItems(items: any[]): Array<{ description: string; unit?: string; quantity?: number; price: number }> {
  return items
    .map((it: any) => ({
      description: String(it.description ?? "").trim(),
      unit: it.unit || undefined,
      quantity: it.quantity ? Number(it.quantity) : undefined,
      price: Number(it.price ?? 0),
    }))
    .filter(i => i.description && i.price > 0);
}

function lineTotal(item: { price: number; quantity?: number }) {
  return (item.quantity ?? 1) * item.price;
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
  res.json(await Promise.all(rows.map(r => buildReceiptResponse(r, masterMap.get(r.masterId), req))));
});

// ─── Master PWA: GET /api/receipts/my/:orderId ────────────────────────────────

router.get("/my/:orderId", async (req: any, res) => {
  const masterId = req.session?.masterId;
  if (!masterId) return res.status(401).json({ error: "Не авторизован" });
  const orderId = parseInt(req.params.orderId);
  const rows = await db.select().from(receiptsTable)
    .where(and(eq(receiptsTable.orderId, orderId), eq(receiptsTable.masterId, masterId)));
  const [master] = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId));
  res.json(await Promise.all(rows.map(r => buildReceiptResponse(r, master, req))));
});

// ─── CRM: GET /api/receipts/dialogs — all client confirmations ───────────────

router.get("/dialogs", requireRole("admin", "master_operator"), async (req, res) => {
  const rows = await db.select().from(receiptsTable)
    .where(isNotNull(receiptsTable.prepaymentSubmittedAt))
    .orderBy(desc(receiptsTable.prepaymentSubmittedAt));

  const masterIds = [...new Set(rows.map(r => r.masterId))];
  const masters = masterIds.length
    ? await db.select().from(mastersTable)
    : [];
  const masterMap = new Map(masters.map(m => [m.id, m]));
  const unreadCount = rows.filter(r => !r.prepaymentSeenAt).length;

  res.json({
    dialogs: await Promise.all(rows.map(r => buildReceiptResponse(r, masterMap.get(r.masterId), req))),
    unreadCount,
  });
});

// ─── CRM: GET /api/receipts/dialogs/unread-count ─────────────────────────────

router.get("/dialogs/unread-count", requireRole("admin", "master_operator"), async (_req, res) => {
  const rows = await db.select({ id: receiptsTable.id })
    .from(receiptsTable)
    .where(and(isNotNull(receiptsTable.prepaymentSubmittedAt), isNull(receiptsTable.prepaymentSeenAt)));
  res.json({ count: rows.length });
});

// ─── CRM: PATCH /api/receipts/:id/confirm — manually confirm prepayment ───────

router.patch("/:id/confirm", requireRole("admin", "master_operator"), async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Неверный ID" });
  const { operatorNote } = req.body;
  const [existing] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Расписка не найдена" });
  const [updated] = await db.update(receiptsTable)
    .set({
      prepaymentSubmittedAt: existing.prepaymentSubmittedAt ?? new Date(),
      clientSubmittedName: existing.clientSubmittedName ?? (operatorNote?.trim() || "Подтверждено оператором"),
      prepaymentSeenAt: new Date(),
    })
    .where(eq(receiptsTable.id, id))
    .returning();
  const [master] = await db.select().from(mastersTable).where(eq(mastersTable.id, updated.masterId));
  if (master?.maxChatId) {
    const amount = updated.prepaymentAmount
      ? `${Number(updated.prepaymentAmount).toLocaleString("ru-RU")} ₽`
      : "—";
    sendMaxMessage(
      master.maxChatId,
      `✅ Оплата подтверждена оператором!\n\nСмета #${updated.id}\nКлиент: ${updated.clientSubmittedName || "—"}\nСумма: ${amount}\n\n👉 Перейти в приложение:\nhttps://sfera-master.ru/master-pwa/`
    ).catch(() => {});
  }
  res.json(await buildReceiptResponse(updated, master, req));
});

// ─── CRM: PATCH /api/receipts/:id/seen — mark dialog as seen ─────────────────

router.patch("/:id/seen", requireRole("admin", "master_operator"), async (req, res) => {
  const id = parseInt(req.params.id);
  const [updated] = await db.update(receiptsTable)
    .set({ prepaymentSeenAt: new Date() })
    .where(eq(receiptsTable.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Не найдено" });
  const [master] = await db.select().from(mastersTable).where(eq(mastersTable.id, updated.masterId));
  res.json(await buildReceiptResponse(updated, master, req));
});

// ─── DELETE /api/receipts/:id ─────────────────────────────────────────────────

router.delete("/:id", requireRole("admin", "master_operator", "master"), async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Неверный ID" });

  // Masters can only delete their own receipts
  const [existing] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Расписка не найдена" });

  const user = (req as any).session?.user;
  if (user?.role === "master" && existing.masterId !== user.masterId) {
    return res.status(403).json({ error: "Нет доступа" });
  }

  await db.delete(receiptsTable).where(eq(receiptsTable.id, id));
  res.json({ ok: true });
});

// ─── Public JSON: GET /api/receipts/public/:token ─────────────────────────────

router.get("/public/:token", async (req, res) => {
  const [receipt] = await db.select().from(receiptsTable).where(eq(receiptsTable.token, req.params.token));
  if (!receipt) return res.status(404).json({ error: "Расписка не найдена" });
  const [master] = await db.select().from(mastersTable).where(eq(mastersTable.id, receipt.masterId));
  res.json(await buildReceiptResponse(receipt, master, req));
});

// ─── PATCH /api/receipts/:id — Edit receipt (master who owns it or admin) ────

router.patch("/:id", async (req: any, res) => {
  const id = parseInt(req.params.id);
  const masterId = req.session?.masterId;
  const isAdmin = req.session?.userId && !masterId; // CRM user

  const [receipt] = await db.select().from(receiptsTable).where(eq(receiptsTable.id, id));
  if (!receipt) return res.status(404).json({ error: "Расписка не найдена" });

  // Auth: master must own it, or must be a CRM user
  if (!isAdmin && receipt.masterId !== masterId) {
    return res.status(403).json({ error: "Нет доступа" });
  }

  const { lineItems, prepaymentAmount, notes } = req.body;
  if (!Array.isArray(lineItems) || lineItems.length === 0) return res.status(400).json({ error: "Добавьте хотя бы одну позицию" });
  if (!prepaymentAmount || Number(prepaymentAmount) <= 0) return res.status(400).json({ error: "Укажите сумму предоплаты" });

  const validItems = parseLineItems(lineItems);
  if (validItems.length === 0) return res.status(400).json({ error: "Все позиции должны иметь описание и цену" });

  const totalAmount = validItems.reduce((sum, i) => sum + lineTotal(i), 0);

  const [updated] = await db.update(receiptsTable).set({
    lineItems: validItems,
    totalAmount: String(totalAmount),
    prepaymentAmount: String(Number(prepaymentAmount)),
    notes: notes?.trim() || null,
  }).where(eq(receiptsTable.id, id)).returning();

  const [master] = await db.select().from(mastersTable).where(eq(mastersTable.id, updated.masterId));
  res.json(await buildReceiptResponse(updated, master, req));
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

  const validItems = parseLineItems(lineItems);
  if (validItems.length === 0) return res.status(400).json({ error: "Все позиции должны иметь описание и цену" });

  const totalAmount = validItems.reduce((sum, i) => sum + lineTotal(i), 0);
  const token = crypto.randomBytes(20).toString("hex");

  const [receipt] = await db.insert(receiptsTable).values({
    token,
    orderId,
    masterId: order.masterId,
    clientName: clientName?.trim() || lead?.clientName || "Клиент",
    clientPhone: clientPhone?.trim() || lead?.clientPhone || "",
    serviceType: order.serviceType,
    city: order.city,
    district: order.district ?? null,
    lineItems: validItems,
    totalAmount: String(totalAmount),
    prepaymentAmount: String(Number(prepaymentAmount)),
    notes: notes?.trim() || null,
  }).returning();

  const [master] = await db.select().from(mastersTable).where(eq(mastersTable.id, order.masterId));

  if (master?.maxChatId) {
    const publicUrl = `${getPublicBase(req)}/api/receipt/${receipt.token}`;
    const clientLabel = receipt.clientName || "Клиент";
    const amountStr = Number(receipt.totalAmount).toLocaleString("ru-RU");
    const prepayStr = Number(receipt.prepaymentAmount).toLocaleString("ru-RU");
    sendMaxMessage(
      master.maxChatId,
      `📋 Новая смета #${receipt.id}\n\nКлиент: ${clientLabel}\nСумма: ${amountStr} ₽ (бронь ${prepayStr} ₽)\n\nСсылка: ${publicUrl}`
    ).catch(() => {});
  }

  res.json(await buildReceiptResponse(receipt, master, req));
});

// ─── Master PWA: POST /api/receipts — Master creates receipt ─────────────────

router.post("/", async (req: any, res) => {
  const masterId = req.session?.masterId;
  if (!masterId) return res.status(401).json({ error: "Не авторизован" });

  const { orderId, lineItems, prepaymentAmount, notes } = req.body;
  if (!orderId) return res.status(400).json({ error: "Не указан orderId" });
  if (!Array.isArray(lineItems) || lineItems.length === 0) return res.status(400).json({ error: "Добавьте хотя бы одну позицию" });
  if (!prepaymentAmount || Number(prepaymentAmount) <= 0) return res.status(400).json({ error: "Укажите сумму предоплаты" });

  const [order] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.masterId, masterId), isNull(ordersTable.deletedAt)));
  if (!order) return res.status(404).json({ error: "Заказ не найден" });

  const [lead] = order.leadId
    ? await db.select().from(leadsTable).where(eq(leadsTable.id, order.leadId))
    : [];

  const validItems = parseLineItems(lineItems);
  if (validItems.length === 0) return res.status(400).json({ error: "Все позиции должны иметь описание и цену" });

  const totalAmount = validItems.reduce((sum, i) => sum + lineTotal(i), 0);
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

  if (master?.maxChatId) {
    const publicUrl = `${getPublicBase(req)}/api/receipt/${receipt.token}`;
    const clientLabel = receipt.clientName || "Клиент";
    const amountStr = Number(receipt.totalAmount).toLocaleString("ru-RU");
    const prepayStr = Number(receipt.prepaymentAmount).toLocaleString("ru-RU");
    sendMaxMessage(
      master.maxChatId,
      `📋 Смета #${receipt.id} создана\n\nКлиент: ${clientLabel}\nСумма: ${amountStr} ₽ (бронь ${prepayStr} ₽)\n\nСсылка для клиента: ${publicUrl}`
    ).catch(() => {});
  }

  res.json(await buildReceiptResponse(receipt, master, req));
});

export default router;
