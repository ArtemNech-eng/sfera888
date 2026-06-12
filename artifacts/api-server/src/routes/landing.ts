// POST /api/landing/leads — Public landing page lead submission
// No auth required. Creates a lead linked to a traffic partner via ref_slug.

import { Router, Request, Response } from "express";
import { db, leadsTable, trafficPartnersTable } from "@workspace/db";
import { eq, and, isNull, gte } from "drizzle-orm";
import { z } from "zod";
import { notifyManagerNewLead } from "../managerBot.js";
import { isTokenModelEnabled } from "../lib/tokenModelGuard.js";

const router = Router();

// Simple IP rate limiter (1 req / 5 sec per IP)
const rateLimitStore = new Map<string, number>();
const RATE_LIMIT_MS = 5_000;

function checkLandingRateLimit(ip: string): boolean {
  const now = Date.now();
  const last = rateLimitStore.get(ip);
  if (last && now - last < RATE_LIMIT_MS) return false;
  rateLimitStore.set(ip, now);
  return true;
}

const landingLeadSchema = z.object({
  name: z.string().min(1, "Введите имя"),
  phone: z.string().min(5, "Введите номер телефона"),
  city: z.string().min(1, "Введите город"),
  district: z.string().min(1, "Введите адрес объекта"),
  area: z.coerce.number().min(1, "Укажите площадь работ"),
  services: z.array(z.string()).min(1, "Выберите хотя бы один вид работ"),
  comment: z.string().min(1, "Опишите задачу").max(2000),
  ref_slug: z.string().optional(),
});

router.post("/leads", async (req: Request, res: Response) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (!checkLandingRateLimit(ip)) {
      return res.status(429).json({ error: "too_many_requests", message: "Слишком быстро. Подождите 5 секунд." });
    }

    const parsed = landingLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "validation_error",
        details: parsed.error.flatten(),
      });
    }

    const body = parsed.data;

    // 1. Find partner by ref_slug (if provided)
    let partnerId: number | null = null;
    if (body.ref_slug) {
      const [partner] = await db
        .select()
        .from(trafficPartnersTable)
        .where(eq(trafficPartnersTable.refSlug, body.ref_slug))
        .limit(1);
      if (partner) {
        partnerId = partner.id;
      }
    }

    // 2. Duplicate check by phone (30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [duplicate] = await db
      .select({ id: leadsTable.id })
      .from(leadsTable)
      .where(
        and(
          eq(leadsTable.clientPhone, body.phone),
          isNull(leadsTable.deletedAt),
          gte(leadsTable.createdAt, thirtyDaysAgo)
        )
      )
      .limit(1);

    const isPossibleDuplicate = !!duplicate;

    // 3. Build service summary
    const serviceType = body.services.join(", ");
    const servicesJson = JSON.stringify(body.services);

    // 5. Create lead
    const [newLead] = await db
      .insert(leadsTable)
      .values({
        clientName: body.name,
        clientPhone: body.phone,
        city: body.city,
        district: body.district,
        serviceType,
        area: String(body.area),
        services: servicesJson,
        comment: body.comment ?? null,
        source: "landing",
        status: "new",
        trafficPartnerId: partnerId,
        partnerLeadStatus: partnerId ? "waiting_master" : null,
        isPossibleDuplicate,
        // Phase A of remove-token-payment-model: при флаге=false → commission.
        paymentModel: (await isTokenModelEnabled()) ? "token" : "commission",
      })
      .returning();

    // 6. Update first_lead_at if this is partner's first lead
    if (partnerId) {
      const [partner] = await db
        .select()
        .from(trafficPartnersTable)
        .where(eq(trafficPartnersTable.id, partnerId))
        .limit(1);
      if (partner && !partner.firstLeadAt) {
        await db
          .update(trafficPartnersTable)
          .set({ firstLeadAt: new Date(), updatedAt: new Date() })
          .where(eq(trafficPartnersTable.id, partnerId));
      }
    }

    // 7. Notify manager (non-blocking)
    notifyManagerNewLead({
      id: newLead.id,
      clientName: newLead.clientName,
      clientPhone: newLead.clientPhone,
      city: newLead.city,
      serviceType: newLead.serviceType,
      source: newLead.source,
    }).catch((err) => console.error("[landing/leads] notifyManagerNewLead failed:", err));

    return res.status(201).json({
      ok: true,
      lead: {
        id: newLead.id,
        source: newLead.source,
        is_possible_duplicate: newLead.isPossibleDuplicate,
        created_at: newLead.createdAt,
      },
    });
  } catch (err) {
    console.error("[landing/leads] error:", err);
    return res.status(500).json({ error: "server_error" });
  }
});

export default router;
