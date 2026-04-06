import { Router } from "express";
import { db, mastersTable, masterTasksTable, ordersTable, leadsTable, telegramChatsTable, voronkaColumnsTable, transactionsTable, maxBotLogsTable, masterCheckinsTable, systemSettingsTable } from "@workspace/db";
import { eq, desc, inArray, isNull, isNotNull, ne, count, gte, avg, sql, and } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth.js";
import { notifyMasterActivated } from "../telegram-notify.js";
import { logMaxEvent } from "../maxBot.js";
import { hashPassword } from "../lib/auth.js";
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
    maxChatId: m.maxChatId ?? null,
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
    servicePrices: m.servicePrices ?? null,
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

// GET /api/masters/checkins?date=YYYY-MM-DD — daily readiness report
// NOTE: Must be before /:id to avoid Express catching "checkins" as an id param
router.get("/checkins", allMasterRoles, async (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const targetDate = typeof req.query.date === "string" ? req.query.date : today;

  const masters = await db
    .select()
    .from(mastersTable)
    .where(and(eq(mastersTable.status, "active"), isNotNull(mastersTable.maxChatId)));

  // Fetch today's checkins AND last 30 days history in one batch query
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  const historyFrom = thirtyDaysAgo.toISOString().split("T")[0];
  const masterIds = masters.map((m) => m.id);

  const [todayCheckins, allHistory] = await Promise.all([
    db.select().from(masterCheckinsTable).where(eq(masterCheckinsTable.date, targetDate)),
    masterIds.length > 0
      ? db.select().from(masterCheckinsTable)
          .where(and(inArray(masterCheckinsTable.masterId, masterIds), gte(masterCheckinsTable.date, historyFrom)))
      : Promise.resolve([]),
  ]);

  const checkinMap = new Map(todayCheckins.map((c) => [c.masterId, c]));

  // Group history by master
  const historyByMaster = new Map<number, { date: string; isAvailable: boolean | null; reason: string | null; respondedAt: Date | null }[]>();
  for (const h of allHistory) {
    if (!historyByMaster.has(h.masterId)) historyByMaster.set(h.masterId, []);
    historyByMaster.get(h.masterId)!.push({ date: h.date, isAvailable: h.isAvailable, reason: h.reason ?? null, respondedAt: h.respondedAt });
  }

  // Calculate streak: consecutive days ending today where isAvailable = true
  function calcStreak(history: { date: string; isAvailable: boolean | null }[]): number {
    const byDate = new Map(history.map((h) => [h.date, h.isAvailable]));
    let streak = 0;
    const cur = new Date();
    for (let i = 0; i < 30; i++) {
      const d = cur.toISOString().split("T")[0];
      if (byDate.get(d) === true) { streak++; cur.setDate(cur.getDate() - 1); }
      else { break; }
    }
    return streak;
  }

  // Calculate response rate: % of days with a response in last 30 days
  function calcResponseRate(history: { respondedAt: Date | null }[]): number {
    if (history.length === 0) return 0;
    const responded = history.filter((h) => h.respondedAt !== null).length;
    return Math.round((responded / history.length) * 100);
  }

  // Calculate average response time: avg clock time (HH:MM) of responses
  function calcAvgResponseTime(history: { respondedAt: Date | null }[]): string | null {
    const times = history
      .filter((h) => h.respondedAt !== null)
      .map((h) => {
        const d = new Date(h.respondedAt!);
        return d.getHours() * 60 + d.getMinutes();
      });
    if (times.length === 0) return null;
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    return `${String(Math.floor(avg / 60)).padStart(2, "0")}:${String(avg % 60).padStart(2, "0")}`;
  }

  const result = masters.map((m) => {
    const history = (historyByMaster.get(m.id) ?? []).sort((a, b) => b.date.localeCompare(a.date));
    const todayCheckin = checkinMap.get(m.id) ?? null;
    return {
      id: m.id,
      alias: m.alias,
      city: m.city,
      specialization: m.specialization,
      maxChatId: m.maxChatId,
      checkin: todayCheckin ? { ...todayCheckin, reason: todayCheckin.reason ?? null } : null,
      streak: calcStreak(history),
      responseRate: calcResponseRate(history),
      avgResponseTime: calcAvgResponseTime(history),
      history,
    };
  });

  const ready = result.filter((r) => r.checkin?.isAvailable === true).length;
  const notReady = result.filter((r) => r.checkin?.isAvailable === false).length;
  const noResponse = result.filter((r) => r.checkin === null || r.checkin.respondedAt === null).length;

  res.json({ date: targetDate, masters: result, summary: { ready, notReady, noResponse, total: result.length } });
});

// POST /api/masters/checkins/nudge/:masterId — send reminder to specific non-responding master
router.post("/checkins/nudge/:masterId", requireRole("admin", "master_operator"), async (req, res) => {
  const masterId = parseInt(req.params.masterId);
  if (isNaN(masterId)) return res.status(400).json({ error: "Invalid id" });
  const [master] = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId));
  if (!master) return res.status(404).json({ error: "Мастер не найден" });
  if (!master.maxChatId) return res.status(400).json({ error: "Нет Max аккаунта" });
  const { sendMaxMessageToChat } = await import("../maxBot.js");
  await sendMaxMessageToChat(master.maxChatId, "⏰ Напоминаем — пожалуйста, отметьте вашу готовность к заказам на сегодня в боте Честный Мастер.");
  res.json({ ok: true });
});

// PATCH /api/masters/:id/checkin — manually override checkin status from CRM
router.patch("/:id/checkin", requireRole("admin", "master_operator"), async (req, res) => {
  const masterId = parseInt(req.params.id);
  if (isNaN(masterId)) return res.status(400).json({ error: "Invalid id" });
  const { date, isAvailable } = req.body as { date: string; isAvailable: boolean };
  if (typeof isAvailable !== "boolean" || !date) return res.status(400).json({ error: "date and isAvailable required" });
  await db
    .insert(masterCheckinsTable)
    .values({ masterId, date, isAvailable, respondedAt: new Date() })
    .onConflictDoUpdate({
      target: [masterCheckinsTable.masterId, masterCheckinsTable.date],
      set: { isAvailable, respondedAt: new Date() },
    });
  res.json({ ok: true });
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

  // On manual activation: clear contract link and move to "Занят" (master goes online themselves)
  if (status === "active" && oldStatus === "pending_contract") {
    const cols = await db.select().from(voronkaColumnsTable);
    const busyCol = cols.find(c => c.name === "Занят") ?? cols.find(c => !c.receivesOrders && c.position > 1);
    await db.update(mastersTable)
      .set({ contractLink: null, voronkaColumnId: busyCol?.id ?? null })
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

  // Re-fetch to get the final state (voronkaColumnId may have been updated above)
  const [finalMaster] = await db.select().from(mastersTable).where(eq(mastersTable.id, id));
  res.json(formatMaster(finalMaster ?? result[0]));
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
  const busyCol = cols.find(c => c.name === "Занят") ?? cols.find(c => !c.receivesOrders && c.position > 1);

  await db.update(mastersTable)
    .set({
      contractSignedAt: new Date(),
      passportVerified: true,
      passportVerifyNote: note,
      contractLink: null,
      status: "active",
      voronkaColumnId: busyCol?.id ?? master.voronkaColumnId,
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

// PATCH /api/masters/:id/verify-passport — manually approve or reject passport verification
router.patch("/:id/verify-passport", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  const { verified, note } = req.body as { verified: boolean; note?: string };
  if (typeof verified !== "boolean") return res.status(400).json({ error: "verified (boolean) required" });

  const [master] = await db.select().from(mastersTable).where(eq(mastersTable.id, id));
  if (!master) return res.status(404).json({ error: "Мастер не найден" });

  const updates: Partial<typeof mastersTable.$inferInsert> = {
    passportVerified: verified,
    passportVerifyNote: note?.trim() || (verified ? "Подтверждён вручную администратором" : "Отклонён администратором"),
  };

  // If manually verified and master is still in pending_contract — activate them
  if (verified && master.status === "pending_contract" && master.contractSignedAt) {
    const cols = await db.select().from(voronkaColumnsTable);
    const busyCol = cols.find(c => c.name === "Занят") ?? cols.find(c => !c.receivesOrders && c.position > 1);
    updates.status = "active";
    if (busyCol) updates.voronkaColumnId = busyCol.id;

    if (master.telegramId) {
      const tgRows = await db.select().from(telegramChatsTable).where(eq(telegramChatsTable.telegramChatId, master.telegramId));
      const chatId = tgRows[0]?.telegramChatId ?? master.telegramId;
      notifyMasterActivated(chatId, master.alias).catch(() => {});
    }
  }

  await db.update(mastersTable).set(updates).where(eq(mastersTable.id, id));
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

  // Fetch transactions to get financial data
  const orderIds = orders.map(o => o.id);
  const txRows = orderIds.length
    ? await db.select().from(transactionsTable).where(inArray(transactionsTable.orderId, orderIds))
    : [];
  const txMap = new Map(txRows.map(t => [t.orderId, t]));

  res.json(orders.map(o => {
    const lead = leadMap.get(o.leadId ?? 0);
    const tx = txMap.get(o.id);
    return {
      id: o.id,
      status: o.status,
      serviceType: o.serviceType,
      district: o.district,
      city: o.city,
      leadId: o.leadId ?? null,
      clientName: lead?.clientName ?? null,
      clientPhone: lead?.clientPhone ?? null,
      scheduledAt: o.scheduledAt,
      completedAt: o.completedAt,
      createdAt: o.createdAt,
      orderAmount: tx ? Number(tx.orderAmount) : null,
      commission: tx ? Number(tx.commission) : null,
      paymentStatus: tx?.paymentStatus ?? null,
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

// POST /api/masters/reset-all-passwords — admin only: reset every master's password to their phone (pwaLogin)
router.post("/reset-all-passwords", requireRole("admin"), async (req, res) => {
  const masters = await db.select({ id: mastersTable.id, alias: mastersTable.alias, pwaLogin: mastersTable.pwaLogin })
    .from(mastersTable)
    .where(and(isNotNull(mastersTable.pwaLogin), isNull(mastersTable.deletedAt)));

  const results: { id: number; alias: string; login: string }[] = [];

  for (const m of masters) {
    if (!m.pwaLogin) continue;
    const hash = await hashPassword(m.pwaLogin);
    await db.update(mastersTable)
      .set({ pwaPasswordHash: hash })
      .where(eq(mastersTable.id, m.id));
    results.push({ id: m.id, alias: m.alias ?? "—", login: m.pwaLogin });
  }

  console.log(`[admin] reset-all-passwords: ${results.length} мастеров`);
  res.json({ success: true, count: results.length, masters: results });
});

// DELETE /api/masters/:id/max-link — CRM operator unlinks Max account
router.delete("/:id/max-link", requireRole("admin", "master_operator"), async (req, res) => {
  const masterId = parseInt(req.params.id);
  if (isNaN(masterId)) return res.status(400).json({ error: "Invalid id" });

  const [master] = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId));
  if (!master) return res.status(404).json({ error: "Master not found" });
  if (!master.maxChatId) return res.status(400).json({ error: "Аккаунт Max не привязан" });

  await db.update(mastersTable).set({ maxChatId: null }).where(eq(mastersTable.id, masterId));
  logMaxEvent(masterId, master.maxChatId, "unlinked_crm", `Оператор отвязал Max-аккаунт мастера ${master.alias}`).catch(() => {});

  res.json({ ok: true });
});

// GET /api/masters/:id/max-logs — CRM: get Max bot activity log
router.get("/:id/max-logs", requireRole("admin", "master_operator"), async (req, res) => {
  const masterId = parseInt(req.params.id);
  if (isNaN(masterId)) return res.status(400).json({ error: "Invalid id" });

  const logs = await db.select().from(maxBotLogsTable)
    .where(eq(maxBotLogsTable.masterId, masterId))
    .orderBy(desc(maxBotLogsTable.createdAt))
    .limit(30);

  res.json(logs);
});

// GET /api/masters/checkins/config — get broadcast + reminder time settings
router.get("/checkins/config", allMasterRoles, async (_req, res) => {
  const settings = await db.select().from(systemSettingsTable)
    .where(inArray(systemSettingsTable.key, ["checkin_broadcast_time", "checkin_reminder_time", "checkin_reminder_enabled"]));
  const get = (key: string, def: string) => settings.find(s => s.key === key)?.value ?? def;
  res.json({
    broadcastTime:    get("checkin_broadcast_time",   "07:00"),
    reminderTime:     get("checkin_reminder_time",    "12:00"),
    reminderEnabled:  get("checkin_reminder_enabled", "false") === "true",
  });
});

// PUT /api/masters/checkins/config — update broadcast + reminder settings
router.put("/checkins/config", requireRole("admin", "master_operator"), async (req, res) => {
  const body = req.body as { broadcastTime?: string; reminderTime?: string; reminderEnabled?: boolean };
  const updates: { key: string; value: string }[] = [];

  if (body.broadcastTime !== undefined) {
    if (!/^\d{2}:\d{2}$/.test(body.broadcastTime))
      return res.status(400).json({ error: "Неверный формат времени рассылки" });
    updates.push({ key: "checkin_broadcast_time", value: body.broadcastTime });
  }
  if (body.reminderTime !== undefined) {
    if (!/^\d{2}:\d{2}$/.test(body.reminderTime))
      return res.status(400).json({ error: "Неверный формат времени напоминания" });
    updates.push({ key: "checkin_reminder_time", value: body.reminderTime });
  }
  if (body.reminderEnabled !== undefined) {
    updates.push({ key: "checkin_reminder_enabled", value: body.reminderEnabled ? "true" : "false" });
  }

  for (const u of updates) {
    await db.insert(systemSettingsTable).values(u)
      .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: u.value, updatedAt: new Date() } });
  }

  res.json({ ok: true });
});

// GET /api/masters/checkins/stats — Max bot connection & response stats
router.get("/checkins/stats", allMasterRoles, async (_req, res) => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

  const lastWeek = new Date();
  lastWeek.setDate(lastWeek.getDate() - 7);
  const lastWeekStr = lastWeek.toISOString().split("T")[0];

  const today = new Date().toISOString().split("T")[0];

  const [
    totalActiveRow,
    connectedRow,
    total7dRow,
    responded7dRow,
    ready7dRow,
    todayReadyRow,
    lastWeekReadyRow,
  ] = await Promise.all([
    db.select({ c: count() }).from(mastersTable).where(eq(mastersTable.status, "active")).then((r) => r[0]),
    db.select({ c: count() }).from(mastersTable).where(and(eq(mastersTable.status, "active"), isNotNull(mastersTable.maxChatId))).then((r) => r[0]),
    db.select({ c: count() }).from(masterCheckinsTable).where(gte(masterCheckinsTable.date, sevenDaysAgoStr)).then((r) => r[0]),
    db.select({ c: count() }).from(masterCheckinsTable).where(and(gte(masterCheckinsTable.date, sevenDaysAgoStr), isNotNull(masterCheckinsTable.respondedAt))).then((r) => r[0]),
    db.select({ c: count() }).from(masterCheckinsTable).where(and(gte(masterCheckinsTable.date, sevenDaysAgoStr), eq(masterCheckinsTable.isAvailable, true))).then((r) => r[0]),
    db.select({ c: count() }).from(masterCheckinsTable).where(and(eq(masterCheckinsTable.date, today), eq(masterCheckinsTable.isAvailable, true))).then((r) => r[0]),
    db.select({ c: count() }).from(masterCheckinsTable).where(and(eq(masterCheckinsTable.date, lastWeekStr), eq(masterCheckinsTable.isAvailable, true))).then((r) => r[0]),
  ]);

  res.json({
    totalActive: Number(totalActiveRow.c),
    connectedToMax: Number(connectedRow.c),
    last7dTotal: Number(total7dRow.c),
    last7dResponded: Number(responded7dRow.c),
    last7dReady: Number(ready7dRow.c),
    todayReady: Number(todayReadyRow.c),
    lastWeekReady: Number(lastWeekReadyRow.c),
  });
});

// GET /api/masters/checkins/monthly — per-day readiness data for last 30 days
router.get("/checkins/monthly", allMasterRoles, async (_req, res) => {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  const fromStr = thirtyDaysAgo.toISOString().split("T")[0];

  const checkins = await db
    .select()
    .from(masterCheckinsTable)
    .where(gte(masterCheckinsTable.date, fromStr));

  // Build a map of date → counts
  const byDate = new Map<string, { ready: number; notReady: number; noResponse: number; total: number }>();
  const cur = new Date(thirtyDaysAgo);
  while (cur.toISOString().split("T")[0] <= todayStr) {
    byDate.set(cur.toISOString().split("T")[0], { ready: 0, notReady: 0, noResponse: 0, total: 0 });
    cur.setDate(cur.getDate() + 1);
  }

  for (const c of checkins) {
    const d = byDate.get(c.date);
    if (!d) continue;
    d.total++;
    if (c.isAvailable === true) d.ready++;
    else if (c.isAvailable === false) d.notReady++;
    else d.noResponse++;
  }

  const result = Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, counts]) => ({ date, ...counts }));

  res.json(result);
});

// POST /api/masters/checkins/broadcast — manually trigger checkin broadcast
router.post("/checkins/broadcast", requireRole("admin", "master_operator"), async (_req, res) => {
  try {
    const { broadcastCheckin } = await import("../lib/checkinBroadcast.js");
    broadcastCheckin().catch(console.error);
    res.json({ ok: true, message: "Рассылка запущена" });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/masters/:id/checkins — checkin history for last 30 days
router.get("/:id/checkins", allMasterRoles, async (req, res) => {
  const masterId = parseInt(req.params.id);
  if (isNaN(masterId)) return res.status(400).json({ error: "Invalid id" });

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  const fromDate = thirtyDaysAgo.toISOString().split("T")[0];

  const checkins = await db
    .select()
    .from(masterCheckinsTable)
    .where(and(eq(masterCheckinsTable.masterId, masterId), gte(masterCheckinsTable.date, fromDate)));

  res.json(checkins);
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
