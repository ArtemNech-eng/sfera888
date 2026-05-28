// /api/partner — Partner PWA backend
//
// Все защищённые endpoints используют requirePartner middleware.
// partner_id НИКОГДА не берётся из тела запроса — только из сессии.

import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, trafficPartnersTable, partnerBillingPeriodsTable, leadsTable, systemSettingsTable, ordersTable } from "@workspace/db";
import { eq, and, gte, lt, lte, desc, ilike, or, isNull, inArray, count, sql } from "drizzle-orm";
import { requirePartner } from "../middlewares/requirePartner.js";
import { z } from "zod";

const router = Router();

// Disable caching for all partner API responses
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Получить значение настройки из system_settings */
async function getSetting(key: string, fallback: string): Promise<string> {
  const [row] = await db
    .select()
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, key));
  return row?.value ?? fallback;
}

/** Первый и последний день месяца по дате */
function monthBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

/** Дней в месяце */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Дней с даты до конца месяца (включительно) */
function daysUntilEndOfMonth(date: Date): number {
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return end.getDate() - date.getDate() + 1;
}

interface BillingCalc {
  periodStart: Date;
  periodEnd: Date;
  isFirstPeriod: boolean;
  daysInPeriod: number;
  leadsCount: number;
  validLeadsCount: number;
  tokenSpentCount: number;
  fixedPct: number;
  fixedSalaryBase: number;
  fixedSalaryEarned: number;
  bonusPerLead: number;
  bonusEarned: number;
  totalEarned: number;
  payoutDate: string;
  holdLeadsCount: number;
  holdEarned: number;
  adBudget: number;
}

/** Рассчитать текущий расчётный период для партнёра */
async function calcCurrentBillingPeriod(
  partnerId: number,
  firstLeadAt: Date | null
): Promise<BillingCalc | null> {
  if (!firstLeadAt) return null;

  const now = new Date();
  const targetLeads = 30;
  const salaryMax = 15000;
  const bonusPerLead = 250;

  // Настройки hold-модели
  const payoutModel = await getSetting("partner_payout_model", "classic");
  const holdAmount = parseInt(await getSetting("partner_hold_amount", "500"));
  const adBudgetDaily = parseInt(await getSetting("partner_ad_budget_daily", "500"));

  // Определяем период
  const isFirstPeriod =
    firstLeadAt.getFullYear() === now.getFullYear() &&
    firstLeadAt.getMonth() === now.getMonth();

  let periodStart: Date;
  let periodEnd: Date;
  let daysInPeriod: number;

  if (isFirstPeriod) {
    // Первый неполный период: с даты первого лида до конца месяца
    periodStart = new Date(firstLeadAt.getFullYear(), firstLeadAt.getMonth(), firstLeadAt.getDate());
    const { end } = monthBounds(firstLeadAt);
    periodEnd = end;
    daysInPeriod = daysUntilEndOfMonth(periodStart);
  } else {
    // Полный месяц
    const { start, end } = monthBounds(now);
    periodStart = start;
    periodEnd = end;
    daysInPeriod = daysInMonth(now.getFullYear(), now.getMonth());
  }

  // Лиды за период
  const periodLeads = await db
    .select()
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.trafficPartnerId, partnerId),
        isNull(leadsTable.deletedAt),
        gte(leadsTable.createdAt, periodStart),
        lte(leadsTable.createdAt, periodEnd)
      )
    );

  const leadsCount = periodLeads.length;
  const validLeadsCount = periodLeads.filter(
    (l) => l.partnerLeadStatus === "partner_validated" ||
           l.partnerLeadStatus === "waiting_master" ||
           l.partnerLeadStatus === "token_spent" ||
           l.partnerLeadStatus === "in_progress"
  ).length;

  // token_spent = заказы, взятые мастером по лидам партнёра за период
  const leadIds = periodLeads.map((l) => l.id);
  let tokenSpentCount = 0;
  if (leadIds.length > 0) {
    const acceptedOrders = await db
      .select({ id: ordersTable.id })
      .from(ordersTable)
      .where(
        and(
          inArray(ordersTable.leadId, leadIds),
          inArray(ordersTable.status, ["master_assigned", "in_progress", "completed"])
        )
      );
    tokenSpentCount = acceptedOrders.length;
    // + подтверждённые (96ч прошло) директные отклики мастеров на лендинговые лиды (холд 96ч)
    const confirmedResponses = await db.execute(
      sql`SELECT COUNT(*)::int AS cnt FROM lead_responses
          WHERE lead_id = ANY(${leadIds}) AND status = 'confirmed'`
    );
    const confirmedCount = Number((confirmedResponses as any).rows?.[0]?.cnt ?? 0);
    tokenSpentCount += confirmedCount;
  }

  // Расчёт фикса — только по одобренным лидам (защита от фейков)
  const fixedSalaryBase = isFirstPeriod
    ? Math.round((salaryMax * daysInPeriod) / 30)
    : salaryMax;
  const fixedPct = Math.min(validLeadsCount / targetLeads, 1.0);
  const fixedSalaryEarned = Math.round(fixedSalaryBase * fixedPct);

  // Бонус
  const bonusEarned = tokenSpentCount * bonusPerLead;

  // Итого
  const totalEarned = fixedSalaryEarned + bonusEarned;

  // Hold-модель: холд-лиды = принятые мастером (токен потрачен) и не отменены
  // Для простоты используем текущий tokenSpentCount как holdLeadsCount
  // В проде можно добавить проверку 48ч через assigned_at
  const holdLeadsCount = tokenSpentCount;
  const holdEarned = holdLeadsCount * holdAmount;

  // Рекламный бюджет — только в первый период
  const adBudget = isFirstPeriod ? daysInPeriod * adBudgetDaily : 0;

  // Дата выплаты — 1-5 число следующего месяца
  const nextMonth = new Date(periodEnd.getFullYear(), periodEnd.getMonth() + 1, 1);
  const payoutDate = nextMonth.toISOString().slice(0, 10);

  return {
    periodStart,
    periodEnd,
    isFirstPeriod,
    daysInPeriod,
    leadsCount,
    validLeadsCount,
    tokenSpentCount,
    fixedPct,
    fixedSalaryBase,
    fixedSalaryEarned,
    bonusPerLead,
    bonusEarned,
    totalEarned,
    payoutDate,
    holdLeadsCount,
    holdEarned,
    adBudget,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH — отдельные endpoints, не требуют requirePartner
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/partner/auth/login
router.post("/auth/login", async (req: Request, res: Response) => {
  try {
    const { login, password } = req.body;
    if (!login || !password) {
      return res.status(400).json({ error: "login и password обязательны" });
    }

    // 1) Try by login
    let [user] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.login, login), eq(usersTable.role, "partner")));

    // 2) Fallback: try by phone in trafficPartnersTable (normalize +7 / 8 / spaces / dashes)
    if (!user) {
      const digits = login.replace(/\D/g, "");
      const phoneVariants = new Set<string>([login, digits, "+" + digits]);
      if (digits.startsWith("7") && digits.length === 11) {
        phoneVariants.add("8" + digits.slice(1));
        phoneVariants.add(digits.slice(1));
      }
      if (digits.startsWith("8") && digits.length === 11) {
        phoneVariants.add("7" + digits.slice(1));
        phoneVariants.add("+7" + digits.slice(1));
        phoneVariants.add(digits.slice(1));
      }

      const partnersByPhone = await db
        .select()
        .from(trafficPartnersTable)
        .where(or(...Array.from(phoneVariants).map((v) => eq(trafficPartnersTable.phone, v))));

      if (partnersByPhone.length > 0) {
        const [foundUser] = await db
          .select()
          .from(usersTable)
          .where(and(eq(usersTable.id, partnersByPhone[0].userId), eq(usersTable.role, "partner")));
        user = foundUser;
      }
    }

    if (!user) {
      return res.status(401).json({ error: "Неверный логин или пароль" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Неверный логин или пароль" });
    }

    const [partner] = await db
      .select()
      .from(trafficPartnersTable)
      .where(eq(trafficPartnersTable.userId, user.id));

    if (!partner) {
      return res.status(403).json({ error: "Профиль партнёра не найден" });
    }
    if (partner.status === "blocked") {
      return res.status(403).json({ error: "Аккаунт заблокирован" });
    }
    if (partner.status === "archived") {
      return res.status(403).json({ error: "Аккаунт архивирован" });
    }

    (req.session as any).userId = user.id;
    (req.session as any).role = "partner";

    return res.json({
      ok: true,
      partner: {
        id: partner.id,
        name: partner.name,
        city: partner.city,
        status: partner.status,
      },
    });
  } catch (err) {
    console.error("[partner auth/login]", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// POST /api/partner/auth/register
const registerSchema = z.object({
  name: z.string().min(1, "Введите имя"),
  phone: z.string().min(5, "Введите номер телефона"),
  city: z.string().min(1, "Введите город"),
  password: z.string().min(6, "Пароль минимум 6 символов"),
});

router.post("/auth/register", async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
    }
    const data = parsed.data;

    // Check if phone/login exists
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.login, data.phone));
    if (existing) {
      return res.status(400).json({ error: "phone_exists", message: "Номер телефона уже зарегистрирован" });
    }

    // Create user
    const passwordHash = await bcrypt.hash(data.password, 10);
    const [user] = await db
      .insert(usersTable)
      .values({
        login: data.phone,
        passwordHash,
        name: data.name,
        role: "partner",
      })
      .returning();

    // Create partner profile with pending status
    const [partner] = await db
      .insert(trafficPartnersTable)
      .values({
        userId: user.id,
        name: data.name,
        phone: data.phone,
        city: data.city,
        status: "pending",
      })
      .returning();

    // Auto-login after registration
    (req.session as any).userId = user.id;
    (req.session as any).role = "partner";

    return res.status(201).json({
      ok: true,
      partner: {
        id: partner.id,
        name: partner.name,
        city: partner.city,
        status: partner.status,
      },
    });
  } catch (err) {
    console.error("[partner auth/register]", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// POST /api/partner/auth/reset-password — сброс пароля по телефону (MVP, без SMS)
router.post("/auth/reset-password", async (req: Request, res: Response) => {
  try {
    const { phone, newPassword } = req.body;
    if (!phone || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Номер телефона и пароль (мин. 6 символов) обязательны" });
    }

    // Normalize phone same way as login
    const digits = phone.replace(/\D/g, "");
    const phoneVariants = new Set<string>([phone, digits, "+" + digits]);
    if (digits.startsWith("7") && digits.length === 11) {
      phoneVariants.add("8" + digits.slice(1));
      phoneVariants.add(digits.slice(1));
    }
    if (digits.startsWith("8") && digits.length === 11) {
      phoneVariants.add("7" + digits.slice(1));
      phoneVariants.add("+7" + digits.slice(1));
      phoneVariants.add(digits.slice(1));
    }

    const partnersByPhone = await db
      .select()
      .from(trafficPartnersTable)
      .where(or(...Array.from(phoneVariants).map((v) => eq(trafficPartnersTable.phone, v))));

    if (partnersByPhone.length === 0) {
      return res.status(404).json({ error: "Партнёр с таким номером не найден" });
    }

    const partner = partnersByPhone[0];

    // Check partner status
    if (partner.status === "blocked") {
      return res.status(403).json({ error: "Аккаунт заблокирован" });
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.id, partner.userId), eq(usersTable.role, "partner")));

    if (!user) {
      return res.status(404).json({ error: "Пользователь не найден" });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await db.update(usersTable).set({ passwordHash: newHash }).where(eq(usersTable.id, user.id));

    return res.json({ ok: true, message: "Пароль успешно изменён" });
  } catch (err) {
    console.error("[partner auth/reset-password]", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// POST /api/partner/auth/logout
router.post("/auth/logout", (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    return res.json({ ok: true });
  });
});

// GET /api/partner/auth/me — проверка сессии (не требует requirePartner)
router.get("/auth/check", async (req: Request, res: Response) => {
  const userId = (req.session as any).userId;
  if (!userId) return res.status(401).json({ authenticated: false });

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || user.role !== "partner") return res.status(401).json({ authenticated: false });

  const [partner] = await db
    .select()
    .from(trafficPartnersTable)
    .where(eq(trafficPartnersTable.userId, userId));

  if (!partner) return res.status(401).json({ authenticated: false });

  return res.json({
    authenticated: true,
    partner: {
      id: partner.id,
      name: partner.name,
      city: partner.city,
      status: partner.status,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PROTECTED ROUTES — все требуют requirePartner
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/partner/me
router.get("/me", requirePartner, async (req: Request, res: Response) => {
  try {
    const partner = (req as any).partner;
    const landingDomain = process.env.LANDING_DOMAIN || "https://xn--90a0af.xn--p1ai";
    return res.json({
      id: partner.id,
      name: partner.name,
      phone: partner.phone,
      city: partner.city,
      status: partner.status,
      avito_account_name: partner.avitoAccountName,
      avito_account_link: partner.avitoAccountLink,
      registered_at: partner.registeredAt,
      first_lead_at: partner.firstLeadAt,
      ref_slug: partner.refSlug,
      referral_url: partner.refSlug ? `${landingDomain}/r/${partner.refSlug}` : null,
    });
  } catch (err) {
    console.error("[partner/me]", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// GET /api/partner/dashboard
router.get("/dashboard", requirePartner, async (req: Request, res: Response) => {
  try {
    const partner = (req as any).partner;
    const now = new Date();

    // Настройки
    const [targetStr, salaryMaxStr, bonusStr, monthPlanStr] = await Promise.all([
      getSetting("partner_fixed_target_leads", "30"),
      getSetting("partner_fixed_salary_max", "15000"),
      getSetting("partner_bonus_per_accepted_lead", "250"),
      getSetting("partner_monthly_leads_plan", "50"),
    ]);
    const targetLeads = parseInt(targetStr);
    const salaryMax = parseInt(salaryMaxStr);
    const bonusPerLead = parseInt(bonusStr);
    const monthPlan = parseInt(monthPlanStr);

    // Лиды за сегодня
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [{ leadsToday }] = await db
      .select({ leadsToday: count() })
      .from(leadsTable)
      .where(
        and(
          eq(leadsTable.trafficPartnerId, partner.id),
          isNull(leadsTable.deletedAt),
          gte(leadsTable.createdAt, todayStart)
        )
      );

    // Текущий период
    const billing = await calcCurrentBillingPeriod(partner.id, partner.firstLeadAt);

    const leadsTotal = billing?.leadsCount ?? 0;
    const leadsValidated = billing?.validLeadsCount ?? 0;
    const tokenSpentCount = billing?.tokenSpentCount ?? 0;

    const fixedPct = billing?.fixedPct ?? 0;
    const fixedEarned = billing?.fixedSalaryEarned ?? 0;
    const bonusEarned = billing?.bonusEarned ?? 0;
    const totalEarned = billing?.totalEarned ?? 0;

    // Hold model data
    const payoutModel = await getSetting("partner_payout_model", "classic");
    const holdLeadsCount = billing?.holdLeadsCount ?? 0;
    const holdEarned = billing?.holdEarned ?? 0;
    const adBudget = billing?.adBudget ?? 0;

    const progressPct = Math.min(Math.round((leadsTotal / monthPlan) * 100), 100);

    // Последние 5 лидов
    const recentLeads = await db
      .select()
      .from(leadsTable)
      .where(and(eq(leadsTable.trafficPartnerId, partner.id), isNull(leadsTable.deletedAt)))
      .orderBy(desc(leadsTable.createdAt))
      .limit(5);

    return res.json({
      stats_today: {
        leads_created: Number(leadsToday),
      },
      stats_period: {
        leads_total: leadsTotal,
        leads_validated: leadsValidated,
        leads_accepted_by_master: tokenSpentCount,
      },
      plan: {
        target: monthPlan,
        current: leadsTotal,
        remaining: Math.max(0, monthPlan - leadsTotal),
        progress_pct: progressPct,
        is_completed: leadsTotal >= monthPlan,
      },
      fixed_salary: {
        max: salaryMax,
        target_leads: targetLeads,
        current_leads: leadsTotal,
        pct: Math.round(fixedPct * 100),
        earned: fixedEarned,
        is_full: fixedPct >= 1.0,
      },
      earnings: {
        fixed: fixedEarned,
        fixed_pct: Math.round(fixedPct * 100),
        bonus_per_lead: bonusPerLead,
        accepted_count: tokenSpentCount,
        bonus_total: bonusEarned,
        total: totalEarned,
      },
      billing_period: billing
        ? {
            period_start: billing.periodStart.toISOString().slice(0, 10),
            period_end: billing.periodEnd.toISOString().slice(0, 10),
            is_first_period: billing.isFirstPeriod,
            days_in_period: billing.daysInPeriod,
            payout_date: billing.payoutDate,
          }
        : null,
      payout_model: payoutModel,
      hold: {
        leads_count: holdLeadsCount,
        earnings: holdEarned,
        ad_budget: adBudget,
      },
      recent_leads: recentLeads.map((l) => ({
        id: l.id,
        client_name: l.clientName,
        city: l.city,
        service_type: l.serviceType,
        partner_lead_status: l.partnerLeadStatus,
        is_possible_duplicate: l.isPossibleDuplicate,
        created_at: l.createdAt,
      })),
    });
  } catch (err) {
    console.error("[partner/dashboard]", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// GET /api/partner/leads/check-duplicate?phone=...
router.get("/leads/check-duplicate", requirePartner, async (req: Request, res: Response) => {
  try {
    const phone = String(req.query.phone ?? "").trim();
    if (!phone) return res.json({ is_duplicate: false });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [dup] = await db
      .select({ id: leadsTable.id })
      .from(leadsTable)
      .where(and(eq(leadsTable.clientPhone, phone), isNull(leadsTable.deletedAt), gte(leadsTable.createdAt, thirtyDaysAgo)))
      .limit(1);

    return res.json({ is_duplicate: !!dup });
  } catch (err) {
    console.error("[partner/leads/check-duplicate]", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// GET /api/partner/leads
router.get("/leads", requirePartner, async (req: Request, res: Response) => {
  try {
    const partner = (req as any).partner;
    const page = Math.max(1, parseInt(String(req.query.page ?? "1")));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"))));
    const offset = (page - 1) * limit;
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;

    const conditions = [
      eq(leadsTable.trafficPartnerId, partner.id),
      isNull(leadsTable.deletedAt),
    ];

    if (status) {
      conditions.push(eq(leadsTable.partnerLeadStatus, status));
    }
    if (search) {
      const term = `%${search}%`;
      conditions.push(
        or(
          ilike(leadsTable.clientName, term),
          ilike(leadsTable.city, term),
          ilike(leadsTable.serviceType, term)
        )!
      );
    }

    const where = and(...conditions);

    const [totalRow] = await db
      .select({ total: count() })
      .from(leadsTable)
      .where(where);

    const rows = await db
      .select()
      .from(leadsTable)
      .where(where)
      .orderBy(desc(leadsTable.createdAt))
      .limit(limit)
      .offset(offset);

    return res.json({
      rows: rows.map((l) => ({
        id: l.id,
        client_name: l.clientName,
        city: l.city,
        district: l.district,
        service_type: l.serviceType,
        partner_lead_status: l.partnerLeadStatus,
        is_possible_duplicate: l.isPossibleDuplicate,
        partner_rejection_reason: l.partnerRejectionReason,
        lead_channel: l.leadChannel,
        source: l.source,
        created_at: l.createdAt,
      })),
      total: Number(totalRow.total),
      page,
      limit,
    });
  } catch (err) {
    console.error("[partner/leads GET]", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// GET /api/partner/leads/:id — детальная карточка лида с timeline
router.get("/leads/:id", requirePartner, async (req: Request, res: Response) => {
  try {
    const partner = (req as any).partner;
    const leadId = parseInt(req.params.id);
    if (isNaN(leadId)) return res.status(400).json({ error: "invalid_id" });

    const [lead] = await db
      .select()
      .from(leadsTable)
      .where(
        and(
          eq(leadsTable.id, leadId),
          eq(leadsTable.trafficPartnerId, partner.id),
          isNull(leadsTable.deletedAt)
        )
      )
      .limit(1);

    if (!lead) return res.status(404).json({ error: "not_found" });

    // Связанный order
    const [order] = await db
      .select({ id: ordersTable.id, status: ordersTable.status, createdAt: ordersTable.createdAt, assignedAt: ordersTable.assignedAt, completedAt: ordersTable.completedAt })
      .from(ordersTable)
      .where(and(eq(ordersTable.leadId, leadId), isNull(ordersTable.deletedAt)))
      .limit(1);

    // Build timeline
    const timeline: { status: string; label: string; date: string; active: boolean }[] = [];

    // 1. Подан
    timeline.push({ status: "submitted", label: "Подан", date: lead.createdAt.toISOString(), active: true });

    // 2. На проверке / Одобрен / Отклонён
    const s = lead.partnerLeadStatus;
    const statusDate = (lead.statusUpdatedAt ?? lead.createdAt).toISOString();

    if (s === "partner_review") {
      timeline.push({ status: "review", label: "На проверке", date: statusDate, active: true });
    } else if (s === "rejected") {
      timeline.push({ status: "review", label: "На проверке", date: statusDate, active: true });
      timeline.push({ status: "rejected", label: "Отклонён", date: statusDate, active: true });
    } else if (["partner_validated", "waiting_master", "token_spent", "in_progress"].includes(s ?? "")) {
      timeline.push({ status: "review", label: "Проверен", date: statusDate, active: true });
      timeline.push({ status: "approved", label: "Одобрен", date: statusDate, active: true });
    }

    // 3. Order statuses
    if (order) {
      if (["master_assigned", "in_progress", "completed"].includes(order.status)) {
        timeline.push({ status: "master_assigned", label: "Мастер назначен", date: (order.assignedAt ?? order.createdAt).toISOString(), active: true });
      }
      if (["in_progress", "completed"].includes(order.status)) {
        timeline.push({ status: "in_progress", label: "В работе", date: (order.assignedAt ?? order.createdAt).toISOString(), active: true });
      }
      if (order.status === "completed") {
        timeline.push({ status: "completed", label: "Выполнен", date: (order.completedAt ?? order.createdAt).toISOString(), active: true });
      }
      if (order.status === "cancelled") {
        timeline.push({ status: "cancelled", label: "Отменён", date: (order.assignedAt ?? order.createdAt).toISOString(), active: true });
      }
    }

    return res.json({
      id: lead.id,
      client_name: lead.clientName,
      client_phone: lead.clientPhone,
      city: lead.city,
      district: lead.district,
      service_type: lead.serviceType,
      area: lead.area,
      comment: lead.comment,
      status: lead.partnerLeadStatus,
      is_possible_duplicate: lead.isPossibleDuplicate,
      partner_rejection_reason: lead.partnerRejectionReason,
      created_at: lead.createdAt,
      updated_at: lead.updatedAt,
      order_status: order?.status ?? null,
      timeline,
    });
  } catch (err) {
    console.error("[partner/leads/:id GET]", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// PATCH /api/partner/leads/:id — редактирование лида пока статус partner_review
router.patch("/leads/:id", requirePartner, async (req: Request, res: Response) => {
  try {
    const partner = (req as any).partner;
    const leadId = parseInt(req.params.id);
    if (isNaN(leadId)) return res.status(400).json({ error: "invalid_id" });

    const [lead] = await db
      .select()
      .from(leadsTable)
      .where(and(eq(leadsTable.id, leadId), eq(leadsTable.trafficPartnerId, partner.id), isNull(leadsTable.deletedAt)))
      .limit(1);

    if (!lead) return res.status(404).json({ error: "not_found" });
    if (lead.partnerLeadStatus !== "partner_review") {
      return res.status(403).json({ error: "Редактирование доступно только для лидов на проверке" });
    }

    const patchSchema = z.object({
      client_name: z.string().min(1).optional(),
      client_phone: z.string().min(5).optional(),
      city: z.string().min(1).optional(),
      district: z.string().optional(),
      service_type: z.string().min(1).optional(),
      area: z.string().optional(),
      comment: z.string().optional(),
    });

    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });

    const updates: Record<string, any> = { updatedAt: new Date() };
    const b = parsed.data;
    if (b.client_name !== undefined) updates.clientName = b.client_name;
    if (b.client_phone !== undefined) updates.clientPhone = b.client_phone;
    if (b.city !== undefined) updates.city = b.city;
    if (b.district !== undefined) updates.district = b.district;
    if (b.service_type !== undefined) updates.serviceType = b.service_type;
    if (b.area !== undefined) updates.area = b.area;
    if (b.comment !== undefined) updates.comment = b.comment;

    await db.update(leadsTable).set(updates).where(eq(leadsTable.id, leadId));

    return res.json({ ok: true });
  } catch (err) {
    console.error("[partner/leads PATCH]", err);
    return res.status(500).json({ error: "server_error" });
  }
});

const createLeadSchema = z.object({
  client_name: z.string().min(1),
  client_phone: z.string().min(5),
  city: z.string().min(1),
  district: z.string().default(""),
  service_type: z.string().min(1),
  area: z.string().default("0"),
  urgency: z.string().optional(),
  comment: z.string().optional(),
});

// POST /api/partner/leads
router.post("/leads", requirePartner, async (req: Request, res: Response) => {
  try {
    const partner = (req as any).partner;

    const parsed = createLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
    }
    const body = parsed.data;

    // Проверка дубля по телефону за 30 дней
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [duplicate] = await db
      .select({ id: leadsTable.id })
      .from(leadsTable)
      .where(
        and(
          eq(leadsTable.clientPhone, body.client_phone),
          isNull(leadsTable.deletedAt),
          gte(leadsTable.createdAt, thirtyDaysAgo)
        )
      )
      .limit(1);

    const isPossibleDuplicate = !!duplicate;

    // Определяем статус лида из настройки
    const manualReview = await getSetting("manual_partner_lead_review", "true");
    const partnerLeadStatus = manualReview === "false" ? "waiting_master" : "partner_review";

    const [newLead] = await db
      .insert(leadsTable)
      .values({
        clientName: body.client_name,
        clientPhone: body.client_phone,
        city: body.city,
        district: body.district,
        serviceType: body.service_type,
        area: body.area,
        comment: body.comment ?? null,
        source: "avito_partner",
        trafficPartnerId: partner.id,
        leadChannel: "avito_partner",
        isPossibleDuplicate,
        partnerLeadStatus,
      })
      .returning();

    // Обновить first_lead_at если это первый лид партнёра
    if (!partner.firstLeadAt) {
      await db
        .update(trafficPartnersTable)
        .set({ firstLeadAt: new Date(), updatedAt: new Date() })
        .where(eq(trafficPartnersTable.id, partner.id));
    }

    return res.status(201).json({
      ok: true,
      lead: {
        id: newLead.id,
        partner_lead_status: newLead.partnerLeadStatus,
        is_possible_duplicate: newLead.isPossibleDuplicate,
        created_at: newLead.createdAt,
      },
    });
  } catch (err) {
    console.error("[partner/leads POST]", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// GET /api/partner/payouts — история расчётных периодов
router.get("/payouts", requirePartner, async (req: Request, res: Response) => {
  try {
    const partner = (req as any).partner;
    const payoutModel = await getSetting("partner_payout_model", "classic");

    const periods = await db
      .select()
      .from(partnerBillingPeriodsTable)
      .where(eq(partnerBillingPeriodsTable.partnerId, partner.id))
      .orderBy(desc(partnerBillingPeriodsTable.periodStart));

    return res.json(
      periods.map((p) => ({
        id: p.id,
        period_start: p.periodStart,
        period_end: p.periodEnd,
        is_first_period: p.isFirstPeriod,
        days_in_period: p.daysInPeriod,
        leads_count: p.leadsCount,
        valid_leads_count: p.validLeadsCount,
        token_spent_count: p.tokenSpentCount,
        fixed_pct: Number(p.fixedPct),
        fixed_salary_base: Number(p.fixedSalaryBase),
        fixed_salary_earned: Number(p.fixedSalaryEarned),
        bonus_per_lead: p.bonusPerLead,
        bonus_earned: Number(p.bonusEarned),
        total_earned: Number(p.totalEarned),
        hold_leads_count: p.holdLeadsCount,
        hold_earned: Number(p.holdEarned),
        ad_budget: Number(p.adBudget),
        payout_model: payoutModel,
        status: p.status,
        created_at: p.createdAt,
        paid_at: p.paidAt,
      }))
    );
  } catch (err) {
    console.error("[partner/payouts]", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// GET /api/partner/billing-period/current
router.get("/billing-period/current", requirePartner, async (req: Request, res: Response) => {
  try {
    const partner = (req as any).partner;

    if (!partner.firstLeadAt) {
      return res.json({ started: false, message: "Расчётный период ещё не начат" });
    }

    const billing = await calcCurrentBillingPeriod(partner.id, new Date(partner.firstLeadAt));
    if (!billing) {
      return res.json({ started: false });
    }

    return res.json({
      started: true,
      period_start: billing.periodStart.toISOString().slice(0, 10),
      period_end: billing.periodEnd.toISOString().slice(0, 10),
      is_first_period: billing.isFirstPeriod,
      days_in_period: billing.daysInPeriod,
      leads_count: billing.leadsCount,
      valid_leads_count: billing.validLeadsCount,
      token_spent_count: billing.tokenSpentCount,
      fixed_pct: billing.fixedPct,
      fixed_salary_base: billing.fixedSalaryBase,
      fixed_salary_earned: billing.fixedSalaryEarned,
      bonus_per_lead: billing.bonusPerLead,
      bonus_earned: billing.bonusEarned,
      total_earned: billing.totalEarned,
      hold_leads_count: billing.holdLeadsCount,
      hold_earned: billing.holdEarned,
      ad_budget: billing.adBudget,
      status: "calculating",
      payout_date: billing.payoutDate,
    });
  } catch (err) {
    console.error("[partner/billing-period/current]", err);
    return res.status(500).json({ error: "server_error" });
  }
});

export default router;
