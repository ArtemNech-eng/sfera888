import { Router } from "express";
import { db, leadsTable, ordersTable } from "@workspace/db";
import { eq, and, isNull, desc } from "drizzle-orm";
import { requireRole } from "../middlewares/requireAuth.js";

const router = Router();

const allLeadRoles = requireRole("admin", "lead_operator");

// Parse services JSON safely
function parseServices(raw: string | null | undefined): Array<{type: string; area: number; pricePerM2: number}> | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// Build serviceType summary and total area from services array
function buildServiceSummary(services: Array<{type: string; area: number; pricePerM2: number}>) {
  const types = [...new Set(services.map(s => s.type))];
  const totalArea = services.reduce((sum, s) => sum + s.area, 0);
  return { serviceType: types.join(", "), area: totalArea };
}

router.get("/", allLeadRoles, async (req, res) => {
  const { status, source } = req.query;
  const conditions: any[] = [isNull(leadsTable.deletedAt)];
  if (status) conditions.push(eq(leadsTable.status, status as any));
  if (source) conditions.push(eq(leadsTable.source, source as string));
  const rows = await db.select().from(leadsTable)
    .where(and(...conditions))
    .orderBy(desc(leadsTable.createdAt));
  res.json(rows.map(l => ({
    ...l,
    area: Number(l.area),
    scheduledAt: l.scheduledAt ?? null,
    comment: l.comment ?? null,
    photos: l.photos ? JSON.parse(l.photos) : null,
    source: l.source ?? null,
    services: parseServices(l.services),
  })));
});

router.post("/", allLeadRoles, async (req, res) => {
  const { clientName, clientPhone, city, district, services, serviceType: rawServiceType, area: rawArea, scheduledAt, comment, source, photos } = req.body;
  if (!clientName || !clientPhone || !city || !district) {
    return res.status(400).json({ error: "Required fields missing" });
  }

  let serviceType: string;
  let area: number;
  let servicesJson: string | null = null;

  if (Array.isArray(services) && services.length > 0) {
    const summary = buildServiceSummary(services);
    serviceType = summary.serviceType;
    area = summary.area;
    servicesJson = JSON.stringify(services);
  } else {
    if (!rawServiceType || !rawArea) return res.status(400).json({ error: "Required fields missing" });
    serviceType = rawServiceType;
    area = Number(rawArea);
  }

  const result = await db.insert(leadsTable).values({
    clientName,
    clientPhone,
    city,
    district,
    serviceType,
    area: String(area),
    services: servicesJson,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    comment: comment ?? null,
    photos: Array.isArray(photos) && photos.length > 0 ? JSON.stringify(photos) : null,
    source: source ?? null,
    status: "new",
  }).returning();
  const lead = result[0];
  return res.status(201).json({
    ...lead,
    area: Number(lead.area),
    scheduledAt: lead.scheduledAt ?? null,
    comment: lead.comment ?? null,
    source: lead.source ?? null,
    services: parseServices(lead.services),
  });
});

router.get("/:id", allLeadRoles, async (req, res) => {
  const id = parseInt(req.params.id);
  const rows = await db.select().from(leadsTable).where(eq(leadsTable.id, id));
  if (!rows[0]) return res.status(404).json({ error: "Lead not found" });
  const l = rows[0];
  res.json({
    ...l,
    area: Number(l.area),
    scheduledAt: l.scheduledAt ?? null,
    comment: l.comment ?? null,
    source: l.source ?? null,
    services: parseServices(l.services),
  });
});

router.patch("/:id", allLeadRoles, async (req, res) => {
  const id = parseInt(req.params.id);
  const { clientName, clientPhone, city, district, serviceType, area, scheduledAt, comment, source, status, services, photos } = req.body;
  const updates: any = { updatedAt: new Date() };
  if (clientName !== undefined) updates.clientName = clientName;
  if (clientPhone !== undefined) updates.clientPhone = clientPhone;
  if (city !== undefined) updates.city = city;
  if (district !== undefined) updates.district = district;
  if (scheduledAt !== undefined) updates.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
  if (comment !== undefined) updates.comment = comment;
  if (source !== undefined) updates.source = source;
  if (status !== undefined) updates.status = status;
  if (photos !== undefined) {
    updates.photos = Array.isArray(photos) && photos.length > 0 ? JSON.stringify(photos) : null;
  }
  if (services !== undefined && Array.isArray(services) && services.length > 0) {
    const summary = buildServiceSummary(services);
    updates.services = JSON.stringify(services);
    updates.serviceType = summary.serviceType;
    updates.area = String(summary.area);
  } else {
    if (serviceType !== undefined) updates.serviceType = serviceType;
    if (area !== undefined) updates.area = String(area);
  }

  const result = await db.update(leadsTable).set(updates).where(eq(leadsTable.id, id)).returning();
  if (!result[0]) return res.status(404).json({ error: "Lead not found" });
  const l = result[0];

  // When marking a lead as non_target, auto-cancel any associated active order
  if (status === "non_target") {
    const ACTIVE_STATUSES = ["waiting_master", "master_assigned", "in_progress", "cancellation_requested", "proposed_amount"];
    const linkedOrders = await db.select().from(ordersTable).where(eq(ordersTable.leadId, id));
    for (const order of linkedOrders) {
      if (ACTIVE_STATUSES.includes(order.status)) {
        await db.update(ordersTable).set({
          status: "cancelled",
          cancelReason: "Лид помечен как не целевой",
          updatedAt: new Date(),
        }).where(eq(ordersTable.id, order.id));
      }
    }
  }

  res.json({
    ...l,
    area: Number(l.area),
    scheduledAt: l.scheduledAt ?? null,
    comment: l.comment ?? null,
    source: l.source ?? null,
    services: parseServices(l.services),
    photos: l.photos ? JSON.parse(l.photos) : null,
  });
});

router.post("/:id/send-to-buffer", allLeadRoles, async (req, res) => {
  const id = parseInt(req.params.id);
  const rows = await db.select().from(leadsTable).where(eq(leadsTable.id, id));
  const lead = rows[0];
  if (!lead) return res.status(404).json({ error: "Lead not found" });

  await db.update(leadsTable).set({ status: "sent_to_work", updatedAt: new Date() }).where(eq(leadsTable.id, id));

  const orderResult = await db.insert(ordersTable).values({
    leadId: lead.id,
    city: lead.city,
    district: lead.district,
    serviceType: lead.serviceType,
    area: lead.area,
    services: lead.services ?? null,
    scheduledAt: lead.scheduledAt,
    comment: lead.comment,
    status: "waiting_master",
  }).returning();
  const order = orderResult[0];

  res.json({
    id: order.id,
    leadId: order.leadId,
    city: order.city,
    district: order.district,
    serviceType: order.serviceType,
    area: Number(order.area),
    services: parseServices(order.services ?? null),
    scheduledAt: order.scheduledAt ?? null,
    comment: order.comment ?? null,
    status: order.status,
    masterId: order.masterId ?? null,
    masterName: null,
    orderAmount: order.orderAmount ? Number(order.orderAmount) : null,
    commission: order.commission ? Number(order.commission) : null,
    clientRating: order.clientRating ?? null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  });
});

// DELETE /api/leads/:id — soft delete (move to trash)
router.delete("/:id", allLeadRoles, async (req, res) => {
  const id = parseInt(req.params.id);
  await db.update(leadsTable).set({ deletedAt: new Date() }).where(eq(leadsTable.id, id));
  res.json({ success: true });
});

export default router;
