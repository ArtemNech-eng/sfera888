import { Router } from "express";
import { db, mastersTable, masterTasksTable, ordersTable, leadsTable, telegramChatsTable, voronkaColumnsTable } from "@workspace/db";
import { eq, desc, inArray, isNull } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth.js";
import { notifyMasterActivated } from "../telegram-notify.js";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, "../../../public/uploads/avatars");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, _file, cb) => cb(null, `master-${req.params.id}-${Date.now()}.jpg`),
});
const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only images allowed"));
  },
});

const router = Router();
const allMasterRoles = requireRole("admin", "master_operator");

function formatMaster(m: any) {
  return {
    id: m.id,
    alias: m.alias,
    city: m.city,
    specialization: m.specialization,
    specializations: m.specializations ?? [],
    tags: m.tags ?? [],
    telegramId: m.telegramId ?? null,
    phone: m.phone ?? null,
    status: m.status,
    rating: Number(m.rating),
    totalOrders: m.totalOrders,
    acceptedOrders: m.acceptedOrders,
    avgResponseTime: m.avgResponseTime ? Number(m.avgResponseTime) : null,
    debt: Number(m.debt),
    voronkaColumnId: m.voronkaColumnId ?? null,
    isTestMaster: m.isTestMaster,
    customAvatarUrl: m.customAvatarUrl ?? null,
    createdAt: m.createdAt,
  };
}

// GET /api/masters
router.get("/", allMasterRoles, async (_req, res) => {
  const masters = await db.select().from(mastersTable).where(isNull(mastersTable.deletedAt)).orderBy(mastersTable.createdAt);
  res.json(masters.map(formatMaster));
});

// POST /api/masters
router.post("/", requireRole("admin"), async (req, res) => {
  const { alias, city, specialization, telegramId, phone } = req.body;
  if (!alias || !city || !specialization) {
    return res.status(400).json({ error: "alias, city, specialization required" });
  }
  const result = await db.insert(mastersTable).values({
    alias, city, specialization,
    telegramId: telegramId ?? null,
    phone: phone ?? null,
  }).returning();
  return res.status(201).json(formatMaster(result[0]));
});

// GET /api/masters/:id
router.get("/:id", allMasterRoles, async (req, res) => {
  const id = parseInt(req.params.id);
  const rows = await db.select().from(mastersTable).where(eq(mastersTable.id, id));
  if (!rows[0]) return res.status(404).json({ error: "Master not found" });
  res.json(formatMaster(rows[0]));
});

// PATCH /api/masters/:id
router.patch("/:id", requireRole("admin", "master_operator"), async (req, res) => {
  const id = parseInt(req.params.id);
  const { alias, city, specialization, specializations, telegramId, phone, status, isTestMaster, tags } = req.body;

  // Get old status before update for notifications
  const oldRows = await db.select().from(mastersTable).where(eq(mastersTable.id, id));
  const oldStatus = oldRows[0]?.status;

  const updates: any = {};
  if (alias !== undefined) updates.alias = alias;
  if (city !== undefined) updates.city = city;
  if (specialization !== undefined) updates.specialization = specialization;
  if (specializations !== undefined) updates.specializations = specializations;
  if (telegramId !== undefined) updates.telegramId = telegramId;
  if (phone !== undefined) updates.phone = phone;
  if (status !== undefined) updates.status = status;
  if (isTestMaster !== undefined) updates.isTestMaster = isTestMaster;
  if (tags !== undefined) updates.tags = tags;

  const result = await db.update(mastersTable).set(updates).where(eq(mastersTable.id, id)).returning();
  if (!result[0]) return res.status(404).json({ error: "Master not found" });

  // On manual activation: clear contract link and move to "Свободен"
  if (status === "active" && oldStatus === "pending_contract") {
    const cols = await db.select().from(voronkaColumnsTable);
    const freeCol = cols.find(c => c.name === "Свободен");
    await db.update(mastersTable)
      .set({ contractLink: null, voronkaColumnId: freeCol?.id ?? null })
      .where(eq(mastersTable.id, id));
  }

  // Notify master in Telegram when admin activates from pending_contract
  const updated = result[0];
  if (status === "active" && oldStatus === "pending_contract" && updated.telegramId) {
    const tgRows = await db.select().from(telegramChatsTable).where(eq(telegramChatsTable.telegramChatId, updated.telegramId));
    const chatId = tgRows[0]?.telegramChatId ?? updated.telegramId;
    notifyMasterActivated(chatId, updated.alias).catch(() => {});
  }

  res.json(formatMaster(result[0]));
});

// DELETE /api/masters/:id — soft delete (move to trash)
router.delete("/:id", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  await db.update(mastersTable).set({ deletedAt: new Date() }).where(eq(mastersTable.id, id));
  res.json({ success: true });
});

// ─── Tags ─────────────────────────────────────────────────────────────────────

// PATCH /api/masters/:id/tags — update full tags array
router.patch("/:id/tags", allMasterRoles, async (req, res) => {
  const id = parseInt(req.params.id);
  const { tags } = req.body;
  if (!Array.isArray(tags)) return res.status(400).json({ error: "tags must be array" });
  const result = await db.update(mastersTable).set({ tags }).where(eq(mastersTable.id, id)).returning();
  if (!result[0]) return res.status(404).json({ error: "Master not found" });
  res.json({ tags: result[0].tags });
});

// ─── Orders history ───────────────────────────────────────────────────────────

// GET /api/masters/:id/orders
router.get("/:id/orders", allMasterRoles, async (req, res) => {
  const masterId = parseInt(req.params.id);
  const orders = await db.select().from(ordersTable)
    .where(eq(ordersTable.masterId, masterId))
    .orderBy(desc(ordersTable.createdAt));

  const leadIds = [...new Set(orders.map(o => o.leadId).filter(Boolean))];
  const leads = leadIds.length
    ? await db.select().from(leadsTable).where(inArray(leadsTable.id, leadIds))
    : [];
  const leadMap = new Map(leads.map(l => [l.id, l]));

  res.json(orders.map(o => {
    const lead = leadMap.get(o.leadId ?? 0);
    return {
      id: o.id,
      status: o.status,
      serviceType: o.serviceType,
      district: o.district,
      city: o.city,
      clientName: lead?.clientName ?? null,
      clientPhone: lead?.clientPhone ?? null,
      scheduledAt: o.scheduledAt,
      completedAt: o.completedAt,
      createdAt: o.createdAt,
    };
  }));
});

// ─── Tasks ────────────────────────────────────────────────────────────────────

// GET /api/masters/:id/tasks
router.get("/:id/tasks", allMasterRoles, async (req, res) => {
  const masterId = parseInt(req.params.id);
  const tasks = await db.select().from(masterTasksTable)
    .where(eq(masterTasksTable.masterId, masterId))
    .orderBy(masterTasksTable.createdAt);
  res.json(tasks);
});

// POST /api/masters/:id/tasks
router.post("/:id/tasks", allMasterRoles, async (req: any, res) => {
  const masterId = parseInt(req.params.id);
  const { text, dueAt } = req.body;
  if (!text) return res.status(400).json({ error: "text required" });

  const createdBy = (req.session as any)?.user?.name ?? "Оператор";

  const [task] = await db.insert(masterTasksTable).values({
    masterId,
    text,
    dueAt: dueAt ? new Date(dueAt) : null,
    createdBy,
  }).returning();
  res.status(201).json(task);
});

// PATCH /api/masters/:id/tasks/:taskId
router.patch("/:id/tasks/:taskId", allMasterRoles, async (req, res) => {
  const taskId = parseInt(req.params.taskId);
  const { isCompleted, text, dueAt } = req.body;
  const updates: any = {};
  if (isCompleted !== undefined) updates.isCompleted = isCompleted;
  if (text !== undefined) updates.text = text;
  if (dueAt !== undefined) updates.dueAt = dueAt ? new Date(dueAt) : null;

  const [task] = await db.update(masterTasksTable).set(updates)
    .where(eq(masterTasksTable.id, taskId)).returning();
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json(task);
});

// DELETE /api/masters/:id/tasks/:taskId
router.delete("/:id/tasks/:taskId", allMasterRoles, async (req, res) => {
  const taskId = parseInt(req.params.taskId);
  await db.delete(masterTasksTable).where(eq(masterTasksTable.id, taskId));
  res.json({ success: true });
});

// POST /api/masters/:id/avatar — upload custom avatar photo
router.post("/:id/avatar", allMasterRoles, avatarUpload.single("avatar"), async (req, res) => {
  const masterId = parseInt(req.params.id);
  if (isNaN(masterId)) return res.status(400).json({ error: "Invalid id" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  // Build public URL — served at /api/uploads/avatars/<filename> (Replit routes /api/* to this server)
  const avatarUrl = `/api/uploads/avatars/${req.file.filename}`;

  const [updated] = await db.update(mastersTable)
    .set({ customAvatarUrl: avatarUrl })
    .where(eq(mastersTable.id, masterId))
    .returning();

  if (!updated) return res.status(404).json({ error: "Master not found" });
  res.json({ customAvatarUrl: avatarUrl });
});

// DELETE /api/masters/:id/avatar — remove custom avatar
router.delete("/:id/avatar", allMasterRoles, async (req, res) => {
  const masterId = parseInt(req.params.id);
  if (isNaN(masterId)) return res.status(400).json({ error: "Invalid id" });

  const [master] = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId));
  if (!master) return res.status(404).json({ error: "Master not found" });

  // Delete file from disk if it's a local upload
  if (master.customAvatarUrl?.includes("/uploads/avatars/")) {
    const filename = master.customAvatarUrl.split("/uploads/avatars/")[1];
    const filePath = path.join(UPLOAD_DIR, filename);
    try { fs.unlinkSync(filePath); } catch {}
  }

  await db.update(mastersTable).set({ customAvatarUrl: null }).where(eq(mastersTable.id, masterId));
  res.json({ success: true });
});

export default router;
