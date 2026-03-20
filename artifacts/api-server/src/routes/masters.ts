import { Router } from "express";
import { db, mastersTable, masterTasksTable, ordersTable, leadsTable, telegramChatsTable, voronkaColumnsTable } from "@workspace/db";
import { eq, desc, inArray, isNull } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth.js";
import { notifyMasterActivated } from "../telegram-notify.js";
import multer from "multer";
import { objectStorageClient, ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage.js";

const objectStorage = new ObjectStorageService();

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only images allowed"));
  },
});

const GCS_AVATAR_PREFIX = "avatars/";

async function uploadAvatarToGCS(masterId: number, buffer: Buffer, mimetype: string): Promise<string> {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) throw new Error("Object storage not configured");
  const ts = Date.now();
  const filename = `master-${masterId}-${ts}.jpg`;
  const gcsName = `${GCS_AVATAR_PREFIX}${filename}`;
  const bucket = objectStorageClient.bucket(bucketId);
  await bucket.file(gcsName).save(buffer, { contentType: mimetype, resumable: false });
  return `/api/masters/avatar/${filename}`;
}

async function deleteAvatarFromGCS(avatarUrl: string) {
  try {
    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    if (!bucketId) return;
    if (!avatarUrl.includes("/api/masters/avatar/")) return;
    const filename = avatarUrl.split("/api/masters/avatar/")[1];
    const bucket = objectStorageClient.bucket(bucketId);
    await bucket.file(`${GCS_AVATAR_PREFIX}${filename}`).delete({ ignoreNotFound: true });
  } catch {}
}

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
    contractLink: m.contractLink ?? null,
    pwaLogin: m.pwaLogin ?? null,
    workingHours: m.workingHours ?? null,
    preferredDistricts: m.preferredDistricts ?? [],
    minArea: m.minArea ?? 0,
    createdAt: m.createdAt,
    contractSignedAt: m.contractSignedAt ?? null,
    contractSignIp: m.contractSignIp ?? null,
    passportPhotoUrl: m.passportPhotoUrl ?? null,
    passportRegPhotoUrl: m.passportRegPhotoUrl ?? null,
    passportVerified: m.passportVerified ?? false,
    passportVerifyNote: m.passportVerifyNote ?? null,
    contractFullName: m.contractFullName ?? null,
    contractPassportNumber: m.contractPassportNumber ?? null,
    contractPassportDate: m.contractPassportDate ?? null,
    contractPassportIssuer: m.contractPassportIssuer ?? null,
    contractAddress: m.contractAddress ?? null,
    lastSeenAt: m.lastSeenAt ?? null,
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
  const { alias, city, specialization, specializations, telegramId, phone, status, isTestMaster, tags, rating } = req.body;

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
  if (rating !== undefined) updates.rating = String(rating);

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

  // On suspend: move master to "Отстраненные" column
  if (status === "suspended" && oldStatus !== "suspended") {
    const cols = await db.select().from(voronkaColumnsTable);
    const suspendedCol = cols.find(c => c.name === "Отстраненные");
    if (suspendedCol) {
      await db.update(mastersTable)
        .set({ voronkaColumnId: suspendedCol.id })
        .where(eq(mastersTable.id, id));
    }
  }

  // On unsuspend (active from suspended): move to "Свободен"
  if (status === "active" && oldStatus === "suspended") {
    const cols = await db.select().from(voronkaColumnsTable);
    const freeCol = cols.find(c => c.name === "Свободен");
    if (freeCol) {
      await db.update(mastersTable)
        .set({ voronkaColumnId: freeCol.id })
        .where(eq(mastersTable.id, id));
    }
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

// POST /api/masters/:id/mark-contract-external
// Marks the master's contract as signed outside the system (e.g. via OkiDoki).
// Sets contractSignedAt, passportVerified=true, note, activates master, moves to "Свободен".
router.post("/:id/mark-contract-external", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  const { source } = req.body; // e.g. "okidoki" or "paper"
  const noteMap: Record<string, string> = {
    okidoki: "Подписан через сервис ОкиДоки",
    paper: "Подписан на бумаге",
  };
  const note = noteMap[source] ?? "Подписан вне системы";

  const [master] = await db.select().from(mastersTable).where(eq(mastersTable.id, id));
  if (!master) return res.status(404).json({ error: "Мастер не найден" });

  const cols = await db.select().from(voronkaColumnsTable);
  const freeCol = cols.find(c => c.name === "Свободен");

  await db.update(mastersTable)
    .set({
      contractSignedAt: new Date(),
      passportVerified: true,
      passportVerifyNote: note,
      contractLink: null,
      status: "active",
      voronkaColumnId: freeCol?.id ?? master.voronkaColumnId,
    })
    .where(eq(mastersTable.id, id));

  // Notify master in Telegram if applicable
  if (master.status === "pending_contract" && master.telegramId) {
    const tgRows = await db.select().from(telegramChatsTable).where(eq(telegramChatsTable.telegramChatId, master.telegramId));
    const chatId = tgRows[0]?.telegramChatId ?? master.telegramId;
    notifyMasterActivated(chatId, master.alias).catch(() => {});
  }

  const [updated] = await db.select().from(mastersTable).where(eq(mastersTable.id, id));
  res.json(formatMaster(updated));
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

// GET /api/masters/avatar/:filename — serve avatar from GCS
router.get("/avatar/:filename", async (req, res) => {
  try {
    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    if (!bucketId) return res.status(500).json({ error: "Storage not configured" });
    const bucket = objectStorageClient.bucket(bucketId);
    const file = bucket.file(`${GCS_AVATAR_PREFIX}${req.params.filename}`);
    const [exists] = await file.exists();
    if (!exists) return res.status(404).json({ error: "Not found" });
    const [metadata] = await file.getMetadata();
    res.setHeader("Content-Type", (metadata.contentType as string) || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    file.createReadStream().pipe(res);
  } catch (err) {
    res.status(500).json({ error: "Storage error" });
  }
});

// POST /api/masters/:id/avatar — upload custom avatar photo to GCS
router.post("/:id/avatar", allMasterRoles, avatarUpload.single("avatar"), async (req, res) => {
  const masterId = parseInt(req.params.id);
  if (isNaN(masterId)) return res.status(400).json({ error: "Invalid id" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const avatarUrl = await uploadAvatarToGCS(masterId, req.file.buffer, req.file.mimetype);
    const [updated] = await db.update(mastersTable)
      .set({ customAvatarUrl: avatarUrl })
      .where(eq(mastersTable.id, masterId))
      .returning();
    if (!updated) return res.status(404).json({ error: "Master not found" });
    res.json({ customAvatarUrl: avatarUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Upload failed" });
  }
});

// POST /api/masters/:id/reset-pwa — clear pwaLogin + pwaPasswordHash
router.post("/:id/reset-pwa", allMasterRoles, async (req, res) => {
  const masterId = parseInt(req.params.id);
  if (isNaN(masterId)) return res.status(400).json({ error: "Invalid id" });

  const [master] = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId));
  if (!master) return res.status(404).json({ error: "Master not found" });

  await db.update(mastersTable)
    .set({ pwaLogin: null, pwaPasswordHash: null })
    .where(eq(mastersTable.id, masterId));

  res.json({ success: true });
});

// DELETE /api/masters/:id/avatar — remove custom avatar from GCS
router.delete("/:id/avatar", allMasterRoles, async (req, res) => {
  const masterId = parseInt(req.params.id);
  if (isNaN(masterId)) return res.status(400).json({ error: "Invalid id" });

  const [master] = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId));
  if (!master) return res.status(404).json({ error: "Master not found" });

  if (master.customAvatarUrl) {
    await deleteAvatarFromGCS(master.customAvatarUrl);
  }

  await db.update(mastersTable).set({ customAvatarUrl: null }).where(eq(mastersTable.id, masterId));
  res.json({ success: true });
});

export default router;
