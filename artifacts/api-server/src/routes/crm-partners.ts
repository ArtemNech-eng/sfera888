// CRM Partner Management Routes
// For admin/operators to manage partners and review partner leads

import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import {
  db,
  trafficPartnersTable,
  partnerBillingPeriodsTable,
  leadsTable,
  usersTable,
  ordersTable,
  systemSettingsTable,
} from "@workspace/db";
import { eq, and, desc, asc, like, gte, lte, isNull, isNotNull, inArray, sql, count, or } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { z } from "zod";

const router = Router();

// Transliteration map for Russian → Latin
const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh",
  щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  А: "A", Б: "B", В: "V", Г: "G", Д: "D", Е: "E", Ё: "E", Ж: "Zh", З: "Z",
  И: "I", Й: "Y", К: "K", Л: "L", М: "M", Н: "N", О: "O", П: "P", Р: "R",
  С: "S", Т: "T", У: "U", Ф: "F", Х: "H", Ц: "Ts", Ч: "Ch", Ш: "Sh",
  Щ: "Sch", Ъ: "", Ы: "Y", Ь: "", Э: "E", Ю: "Yu", Я: "Ya",
};

function transliterate(str: string): string {
  return str.split("").map((c) => TRANSLIT[c] || c).join("");
}

function slugify(name: string): string {
  return transliterate(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

async function generateUniqueSlug(name: string): Promise<string> {
  let base = slugify(name);
  if (!base) base = "partner";
  let slug = base;
  let counter = 2;
  while (true) {
    const [existing] = await db
      .select({ id: trafficPartnersTable.id })
      .from(trafficPartnersTable)
      .where(eq(trafficPartnersTable.refSlug, slug))
      .limit(1);
    if (!existing) return slug;
    slug = `${base}-${counter}`;
    counter++;
  }
}

// All routes require authentication
router.use(requireAuth);

// Only admin/lead_operator can access partner management
function requirePartnerAdmin(req: Request, res: Response, next: Function) {
  const user = (req as any).user;
  if (!user) return res.status(401).json({ error: "not_authenticated" });
  if (!["admin", "lead_operator"].includes(user.role)) {
    return res.status(403).json({ error: "access_denied" });
  }
  next();
}

router.use(requirePartnerAdmin);

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function getSetting(key: string, fallback: string): Promise<string> {
  const [row] = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, key));
  return row?.value ?? fallback;
}

async function getPartnerSettings() {
  const [max, target, bonus, plan, manualReview, payoutStart, payoutEnd, payoutModel, holdAmount, adBudgetDaily] = await Promise.all([
    getSetting("partner_fixed_salary_max", "15000"),
    getSetting("partner_fixed_target_leads", "30"),
    getSetting("partner_bonus_per_accepted_lead", "250"),
    getSetting("partner_monthly_leads_plan", "50"),
    getSetting("manual_partner_lead_review", "true"),
    getSetting("partner_payout_day_start", "1"),
    getSetting("partner_payout_day_end", "5"),
    getSetting("partner_payout_model", "classic"),
    getSetting("partner_hold_amount", "500"),
    getSetting("partner_ad_budget_daily", "500"),
  ]);
  return {
    partner_fixed_salary_max: parseInt(max),
    partner_fixed_target_leads: parseInt(target),
    partner_bonus_per_accepted_lead: parseInt(bonus),
    partner_monthly_leads_plan: parseInt(plan),
    manual_partner_lead_review: manualReview === "true",
    partner_payout_day_start: parseInt(payoutStart),
    partner_payout_day_end: parseInt(payoutEnd),
    partner_payout_model: payoutModel,
    partner_hold_amount: parseInt(holdAmount),
    partner_ad_budget_daily: parseInt(adBudgetDaily),
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTNERS CRUD
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/crm/partners — список партнёров
router.get("/partners", async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const city = req.query.city as string | undefined;
    const search = req.query.search as string | undefined;

    let conditions = [isNull(trafficPartnersTable.userId)]; // Only show partners with user accounts
    // Actually, we want all partners. Fix: remove this condition
    conditions = [];

    if (status) conditions.push(eq(trafficPartnersTable.status, status));
    if (city) conditions.push(eq(trafficPartnersTable.city, city));
    if (search) {
      conditions.push(
        or(
          like(trafficPartnersTable.name, `%${search}%`),
          like(trafficPartnersTable.phone, `%${search}%`),
          like(trafficPartnersTable.avitoAccountName, `%${search}%`)
        )!
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const partners = await db.select().from(trafficPartnersTable).where(where).orderBy(desc(trafficPartnersTable.createdAt));

    // Get current month stats for each partner
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const enriched = await Promise.all(
      partners.map(async (p) => {
        // Leads this month
        const [{ leadsCount }] = await db
          .select({ leadsCount: count() })
          .from(leadsTable)
          .where(
            and(
              eq(leadsTable.trafficPartnerId, p.id),
              isNull(leadsTable.deletedAt),
              gte(leadsTable.createdAt, monthStart),
              lte(leadsTable.createdAt, monthEnd)
            )
          );

        // Token spent count (orders taken by master)
        const periodLeads = await db
          .select({ id: leadsTable.id })
          .from(leadsTable)
          .where(
            and(
              eq(leadsTable.trafficPartnerId, p.id),
              isNull(leadsTable.deletedAt),
              gte(leadsTable.createdAt, monthStart),
              lte(leadsTable.createdAt, monthEnd)
            )
          );

        const leadIds = periodLeads.map((l) => l.id);
        let acceptedCount = 0;
        if (leadIds.length > 0) {
          const [{ acceptedCount: cnt }] = await db
            .select({ acceptedCount: count() })
            .from(ordersTable)
            .where(
              and(
                inArray(ordersTable.leadId, leadIds),
                inArray(ordersTable.status, ["master_assigned", "in_progress", "completed"])
              )
            );
          acceptedCount = Number(cnt);
        }

        return {
          ...p,
          leads_this_month: Number(leadsCount),
          accepted_this_month: acceptedCount,
        };
      })
    );

    return res.json(enriched);
  } catch (err) {
    console.error("[crm/partners GET]", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// POST /api/crm/partners — создать партнёра
const createPartnerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(5),
  city: z.string().min(1),
  login: z.string().min(3),
  password: z.string().min(6),
  avito_account_name: z.string().optional(),
  avito_account_link: z.string().optional(),
  notes: z.string().optional(),
  ref_slug: z.string().optional(),
});

router.post("/partners", async (req: Request, res: Response) => {
  try {
    const parsed = createPartnerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
    }
    const data = parsed.data;

    // Check if login exists
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.login, data.login));
    if (existing) {
      return res.status(400).json({ error: "login_exists", message: "Логин уже занят" });
    }

    // Auto-generate ref_slug if not provided
    let refSlug = data.ref_slug || null;
    if (!refSlug) {
      refSlug = await generateUniqueSlug(data.name);
    }

    // Create user
    const passwordHash = await bcrypt.hash(data.password, 10);
    const [user] = await db
      .insert(usersTable)
      .values({
        login: data.login,
        passwordHash,
        name: data.name,
        role: "partner",
      })
      .returning();

    // Create partner profile
    const [partner] = await db
      .insert(trafficPartnersTable)
      .values({
        userId: user.id,
        name: data.name,
        phone: data.phone,
        city: data.city,
        status: "active",
        avitoAccountName: data.avito_account_name || null,
        avitoAccountLink: data.avito_account_link || null,
        notes: data.notes || null,
        refSlug: refSlug,
      })
      .returning();

    return res.status(201).json({
      ...partner,
      login: data.login,
    });
  } catch (err) {
    console.error("[crm/partners POST]", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// PATCH /api/crm/partners/:id/status — изменить статус
const updateStatusSchema = z.object({
  status: z.enum(["active", "paused", "blocked", "archived"]),
});

router.patch("/partners/:id/status", async (req: Request, res: Response) => {
  try {
    const partnerId = parseInt(req.params.id);
    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "validation_error" });
    }

    const [updated] = await db
      .update(trafficPartnersTable)
      .set({ status: parsed.data.status, updatedAt: new Date() })
      .where(eq(trafficPartnersTable.id, partnerId))
      .returning();

    if (!updated) return res.status(404).json({ error: "partner_not_found" });

    return res.json(updated);
  } catch (err) {
    console.error("[crm/partners/:id/status]", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// GET /api/crm/partners/:id — детали партнёра
router.get("/partners/:id", async (req: Request, res: Response) => {
  try {
    const partnerId = parseInt(req.params.id);
    const [partner] = await db.select().from(trafficPartnersTable).where(eq(trafficPartnersTable.id, partnerId));
    if (!partner) return res.status(404).json({ error: "partner_not_found" });

    // Get user login
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, partner.userId));

    // Get billing periods
    const periods = await db
      .select()
      .from(partnerBillingPeriodsTable)
      .where(eq(partnerBillingPeriodsTable.partnerId, partnerId))
      .orderBy(desc(partnerBillingPeriodsTable.periodStart));

    return res.json({
      ...partner,
      login: user?.login || null,
      billing_periods: periods,
    });
  } catch (err) {
    console.error("[crm/partners/:id]", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PARTNER LEADS REVIEW
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/crm/partner-leads — лиды на проверке
router.get("/partner-leads", async (req: Request, res: Response) => {
  try {
    const partnerId = req.query.partner_id ? parseInt(req.query.partner_id as string) : undefined;
    const city = req.query.city as string | undefined;
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || "20")));
    const offset = (page - 1) * limit;

    const conditions = [
      eq(leadsTable.partnerLeadStatus, "partner_review"),
      isNull(leadsTable.deletedAt),
    ];

    if (partnerId) conditions.push(eq(leadsTable.trafficPartnerId, partnerId));
    if (city) conditions.push(eq(leadsTable.city, city));

    const where = and(...conditions);

    const [{ total }] = await db.select({ total: count() }).from(leadsTable).where(where);

    const leads = await db
      .select()
      .from(leadsTable)
      .where(where)
      .orderBy(desc(leadsTable.createdAt))
      .limit(limit)
      .offset(offset);

    // Enrich with partner names
    const enriched = await Promise.all(
      leads.map(async (lead) => {
        let partnerName = null;
        if (lead.trafficPartnerId) {
          const [p] = await db
            .select({ name: trafficPartnersTable.name })
            .from(trafficPartnersTable)
            .where(eq(trafficPartnersTable.id, lead.trafficPartnerId));
          partnerName = p?.name || null;
        }
        return { ...lead, partner_name: partnerName };
      })
    );

    return res.json({
      rows: enriched,
      total: Number(total),
      page,
      limit,
    });
  } catch (err) {
    console.error("[crm/partner-leads GET]", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// POST /api/crm/partner-leads/:id/approve — подтвердить лид
router.post("/partner-leads/:id/approve", async (req: Request, res: Response) => {
  try {
    const leadId = parseInt(req.params.id);

    const [updated] = await db
      .update(leadsTable)
      .set({
        partnerLeadStatus: "waiting_master",
        updatedAt: new Date(),
      })
      .where(and(eq(leadsTable.id, leadId), eq(leadsTable.partnerLeadStatus, "partner_review")))
      .returning();

    if (!updated) return res.status(404).json({ error: "lead_not_found_or_already_reviewed" });

    return res.json({ ok: true, lead: updated });
  } catch (err) {
    console.error("[crm/partner-leads/:id/approve]", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// POST /api/crm/partner-leads/:id/reject — отклонить лид
const rejectSchema = z.object({
  reason: z.enum(["duplicate", "spam", "non_target", "other"]),
  comment: z.string().optional(),
});

const reasonLabels: Record<string, string> = {
  duplicate: "Дубль",
  spam: "Мусор",
  non_target: "Нецелевой",
  other: "Другое",
};

router.post("/partner-leads/:id/reject", async (req: Request, res: Response) => {
  try {
    const leadId = parseInt(req.params.id);
    const parsed = rejectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "validation_error" });
    }

    const { reason, comment } = parsed.data;
    const fullReason = `${reasonLabels[reason]}${comment ? ": " + comment : ""}`;

    const [updated] = await db
      .update(leadsTable)
      .set({
        partnerLeadStatus: "invalid",
        partnerRejectionReason: fullReason,
        updatedAt: new Date(),
      })
      .where(and(eq(leadsTable.id, leadId), eq(leadsTable.partnerLeadStatus, "partner_review")))
      .returning();

    if (!updated) return res.status(404).json({ error: "lead_not_found_or_already_reviewed" });

    return res.json({ ok: true, lead: updated });
  } catch (err) {
    console.error("[crm/partner-leads/:id/reject]", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/crm/partner-analytics
router.get("/partner-analytics", async (req: Request, res: Response) => {
  try {
    const year = parseInt((req.query.year as string) || new Date().getFullYear().toString());
    const month = parseInt((req.query.month as string) || (new Date().getMonth() + 1).toString());

    const settings = await getPartnerSettings();
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59);

    // All partners
    const partners = await db.select().from(trafficPartnersTable);
    const activePartners = partners.filter((p) => p.status === "active");

    // Leads this month (only partner leads)
    const [{ leadsCount }] = await db
      .select({ leadsCount: count() })
      .from(leadsTable)
      .where(
        and(
          isNull(leadsTable.deletedAt),
          isNotNull(leadsTable.trafficPartnerId),
          gte(leadsTable.createdAt, monthStart),
          lte(leadsTable.createdAt, monthEnd)
        )
      );

    // Partner lead IDs this month (for accepted orders)
    const monthPartnerLeadIds = (
      await db
        .select({ id: leadsTable.id })
        .from(leadsTable)
        .where(
          and(
            isNull(leadsTable.deletedAt),
            isNotNull(leadsTable.trafficPartnerId),
            gte(leadsTable.createdAt, monthStart),
            lte(leadsTable.createdAt, monthEnd)
          )
        )
    ).map((l) => l.id);

    // Accepted orders from partner leads this month
    let acceptedCount = 0;
    if (monthPartnerLeadIds.length > 0) {
      const [{ acceptedCount: ac }] = await db
        .select({ acceptedCount: count() })
        .from(ordersTable)
        .where(
          and(
            inArray(ordersTable.leadId, monthPartnerLeadIds),
            inArray(ordersTable.status, ["master_assigned", "in_progress", "completed"])
          )
        );
      acceptedCount = Number(ac);
    }

    // Per-partner analytics
    const partnerStats = await Promise.all(
      partners.map(async (p) => {
        // Leads this month
        const [{ count: pLeads }] = await db
          .select({ count: count() })
          .from(leadsTable)
          .where(
            and(
              eq(leadsTable.trafficPartnerId, p.id),
              isNull(leadsTable.deletedAt),
              gte(leadsTable.createdAt, monthStart),
              lte(leadsTable.createdAt, monthEnd)
            )
          );

        // Accepted orders
        const pLeadIds = (
          await db
            .select({ id: leadsTable.id })
            .from(leadsTable)
            .where(
              and(
                eq(leadsTable.trafficPartnerId, p.id),
                isNull(leadsTable.deletedAt),
                gte(leadsTable.createdAt, monthStart),
                lte(leadsTable.createdAt, monthEnd)
              )
            )
        ).map((l) => l.id);

        let pAccepted = 0;
        if (pLeadIds.length > 0) {
          const [{ count: pAcceptedCount }] = await db
            .select({ count: count() })
            .from(ordersTable)
            .where(
              and(inArray(ordersTable.leadId, pLeadIds), inArray(ordersTable.status, ["master_assigned", "in_progress", "completed"]))
            );
          pAccepted = Number(pAcceptedCount);
        }

        const leadsNum = Number(pLeads);
        const conversion = leadsNum > 0 ? Math.round((pAccepted / leadsNum) * 100) : 0;
        const planPct = Math.min(100, Math.round((leadsNum / settings.partner_monthly_leads_plan) * 100));

        // Calculate earnings
        const fixedPct = Math.min(leadsNum / settings.partner_fixed_target_leads, 1);
        const fixedEarned = Math.round(settings.partner_fixed_salary_max * fixedPct);
        const bonusEarned = pAccepted * settings.partner_bonus_per_accepted_lead;
        const totalEarned = fixedEarned + bonusEarned;

        return {
          id: p.id,
          name: p.name,
          city: p.city,
          status: p.status,
          leads_count: leadsNum,
          accepted_count: pAccepted,
          conversion_pct: conversion,
          plan_pct: planPct,
          fixed_earned: fixedEarned,
          fixed_pct: Math.round(fixedPct * 100),
          bonus_earned: bonusEarned,
          total_earned: totalEarned,
        };
      })
    );

    // Plan completion stats
    const completedPlan = partnerStats.filter((p) => p.plan_pct >= 100).length;
    const almostPlan = partnerStats.filter((p) => p.plan_pct >= 70 && p.plan_pct < 100).length;
    const notCompletedPlan = partnerStats.filter((p) => p.plan_pct < 70).length;
    const avgPlanPct = partnerStats.length > 0 ? Math.round(partnerStats.reduce((s, p) => s + p.plan_pct, 0) / partnerStats.length) : 0;

    // Top 5 by accepted count
    const top5 = [...partnerStats].sort((a, b) => b.accepted_count - a.accepted_count).slice(0, 5);

    // ROI channel = total leads / (total fixed + bonus paid)
    const totalFixed = partnerStats.reduce((s, p) => s + p.fixed_earned, 0);
    const totalBonus = partnerStats.reduce((s, p) => s + p.bonus_earned, 0);
    const totalPaid = totalFixed + totalBonus;
    const roi = totalPaid > 0 ? Math.round((Number(leadsCount) / totalPaid) * 10000) / 100 : 0;

    return res.json({
      summary: {
        total_partners: partners.length,
        active_partners: activePartners.length,
        leads_this_month: Number(leadsCount),
        accepted_this_month: Number(acceptedCount),
        conversion_pct: Number(leadsCount) > 0 ? Math.round((Number(acceptedCount) / Number(leadsCount)) * 100) : 0,
        fixed_earned_total: totalFixed,
        bonus_earned_total: totalBonus,
        roi_channel: roi,
      },
      plan_completion: {
        completed: completedPlan,
        almost: almostPlan,
        not_completed: notCompletedPlan,
        avg_pct: avgPlanPct,
      },
      partners: partnerStats.sort((a, b) => b.conversion_pct - a.conversion_pct),
      top5,
      settings,
    });
  } catch (err) {
    console.error("[crm/partner-analytics]", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// GET /api/crm/partner-analytics/:id/daily — лиды и принятые по дням
router.get("/partner-analytics/:id/daily", async (req: Request, res: Response) => {
  try {
    const partnerId = parseInt(req.params.id);
    const year = parseInt((req.query.year as string) || new Date().getFullYear().toString());
    const month = parseInt((req.query.month as string) || (new Date().getMonth() + 1).toString());

    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59);
    const daysInMonth = monthEnd.getDate();

    // Get all leads for this partner in month
    const leads = await db
      .select({ id: leadsTable.id, createdAt: leadsTable.createdAt })
      .from(leadsTable)
      .where(
        and(
          eq(leadsTable.trafficPartnerId, partnerId),
          isNull(leadsTable.deletedAt),
          gte(leadsTable.createdAt, monthStart),
          lte(leadsTable.createdAt, monthEnd)
        )
      );

    // Get accepted orders for these leads
    const leadIds = leads.map((l) => l.id);
    let acceptedOrders: { createdAt: Date }[] = [];
    if (leadIds.length > 0) {
      acceptedOrders = await db
        .select({ createdAt: ordersTable.createdAt })
        .from(ordersTable)
        .where(
          and(
            inArray(ordersTable.leadId, leadIds),
            inArray(ordersTable.status, ["master_assigned", "in_progress", "completed"]),
            gte(ordersTable.createdAt, monthStart),
            lte(ordersTable.createdAt, monthEnd)
          )
        );
    }

    // Aggregate by day
    const daily = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const dayDate = new Date(year, month - 1, day);
      const nextDay = new Date(year, month - 1, day + 1);

      const leadsCount = leads.filter((l) => {
        const d = new Date(l.createdAt);
        return d >= dayDate && d < nextDay;
      }).length;

      const acceptedCount = acceptedOrders.filter((o) => {
        const d = new Date(o.createdAt);
        return d >= dayDate && d < nextDay;
      }).length;

      return {
        day,
        date: dayDate.toISOString().slice(0, 10),
        leads: leadsCount,
        accepted: acceptedCount,
      };
    });

    return res.json(daily);
  } catch (err) {
    console.error("[crm/partner-analytics/:id/daily]", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/crm/settings/domain
router.get("/settings/domain", async (req: Request, res: Response) => {
  try {
    const landingDomain = process.env.LANDING_DOMAIN || "https://честные-мастера.рф";
    return res.json({ landing_domain: landingDomain });
  } catch (err) {
    console.error("[settings/domain GET]", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// GET /api/settings/partner
router.get("/settings/partner", async (req: Request, res: Response) => {
  try {
    const settings = await getPartnerSettings();
    return res.json(settings);
  } catch (err) {
    console.error("[settings/partner GET]", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// PATCH /api/settings/partner
const settingsSchema = z.object({
  partner_fixed_salary_max: z.number().int().min(0).optional(),
  partner_fixed_target_leads: z.number().int().min(1).optional(),
  partner_bonus_per_accepted_lead: z.number().int().min(0).optional(),
  partner_monthly_leads_plan: z.number().int().min(1).optional(),
  manual_partner_lead_review: z.boolean().optional(),
  partner_payout_day_start: z.number().int().min(1).max(31).optional(),
  partner_payout_day_end: z.number().int().min(1).max(31).optional(),
  partner_payout_model: z.enum(["classic", "hold"]).optional(),
  partner_hold_amount: z.number().int().min(0).optional(),
  partner_ad_budget_daily: z.number().int().min(0).optional(),
});

router.patch("/settings/partner", async (req: Request, res: Response) => {
  try {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
    }

    const data = parsed.data;
    const updates: Promise<any>[] = [];

    if (data.partner_fixed_salary_max !== undefined) {
      updates.push(
        db
          .insert(systemSettingsTable)
          .values({ key: "partner_fixed_salary_max", value: String(data.partner_fixed_salary_max), updatedAt: new Date() })
          .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: String(data.partner_fixed_salary_max), updatedAt: new Date() } })
      );
    }
    if (data.partner_fixed_target_leads !== undefined) {
      updates.push(
        db
          .insert(systemSettingsTable)
          .values({ key: "partner_fixed_target_leads", value: String(data.partner_fixed_target_leads), updatedAt: new Date() })
          .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: String(data.partner_fixed_target_leads), updatedAt: new Date() } })
      );
    }
    if (data.partner_bonus_per_accepted_lead !== undefined) {
      updates.push(
        db
          .insert(systemSettingsTable)
          .values({ key: "partner_bonus_per_accepted_lead", value: String(data.partner_bonus_per_accepted_lead), updatedAt: new Date() })
          .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: String(data.partner_bonus_per_accepted_lead), updatedAt: new Date() } })
      );
    }
    if (data.partner_monthly_leads_plan !== undefined) {
      updates.push(
        db
          .insert(systemSettingsTable)
          .values({ key: "partner_monthly_leads_plan", value: String(data.partner_monthly_leads_plan), updatedAt: new Date() })
          .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: String(data.partner_monthly_leads_plan), updatedAt: new Date() } })
      );
    }
    if (data.manual_partner_lead_review !== undefined) {
      updates.push(
        db
          .insert(systemSettingsTable)
          .values({ key: "manual_partner_lead_review", value: String(data.manual_partner_lead_review), updatedAt: new Date() })
          .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: String(data.manual_partner_lead_review), updatedAt: new Date() } })
      );
    }
    if (data.partner_payout_day_start !== undefined) {
      updates.push(
        db
          .insert(systemSettingsTable)
          .values({ key: "partner_payout_day_start", value: String(data.partner_payout_day_start), updatedAt: new Date() })
          .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: String(data.partner_payout_day_start), updatedAt: new Date() } })
      );
    }
    if (data.partner_payout_day_end !== undefined) {
      updates.push(
        db
          .insert(systemSettingsTable)
          .values({ key: "partner_payout_day_end", value: String(data.partner_payout_day_end), updatedAt: new Date() })
          .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: String(data.partner_payout_day_end), updatedAt: new Date() } })
      );
    }
    if (data.partner_payout_model !== undefined) {
      updates.push(
        db
          .insert(systemSettingsTable)
          .values({ key: "partner_payout_model", value: data.partner_payout_model, updatedAt: new Date() })
          .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: data.partner_payout_model, updatedAt: new Date() } })
      );
    }
    if (data.partner_hold_amount !== undefined) {
      updates.push(
        db
          .insert(systemSettingsTable)
          .values({ key: "partner_hold_amount", value: String(data.partner_hold_amount), updatedAt: new Date() })
          .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: String(data.partner_hold_amount), updatedAt: new Date() } })
      );
    }
    if (data.partner_ad_budget_daily !== undefined) {
      updates.push(
        db
          .insert(systemSettingsTable)
          .values({ key: "partner_ad_budget_daily", value: String(data.partner_ad_budget_daily), updatedAt: new Date() })
          .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: String(data.partner_ad_budget_daily), updatedAt: new Date() } })
      );
    }

    await Promise.all(updates);

    const settings = await getPartnerSettings();
    return res.json(settings);
  } catch (err) {
    console.error("[settings/partner PATCH]", err);
    return res.status(500).json({ error: "server_error" });
  }
});

export default router;
