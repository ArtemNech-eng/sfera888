const BASE = "/api/partner";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let msg = "Ошибка запроса";
    try { msg = (await res.json()).error ?? msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

// ─── Response mappers ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPartner(p: any): Partner {
  return {
    id: p.id,
    name: p.name,
    phone: p.phone ?? "",
    city: p.city,
    status: p.status,
    createdAt: p.registered_at ?? p.createdAt ?? "",
    firstLeadAt: p.first_lead_at ?? p.firstLeadAt ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLead(l: any): Lead {
  return {
    id: l.id,
    clientName: l.client_name ?? l.clientName ?? "",
    clientPhone: l.client_phone ?? l.clientPhone ?? "",
    city: l.city ?? "",
    district: l.district ?? "",
    serviceType: l.service_type ?? l.serviceType ?? "",
    area: l.area ?? null,
    comment: l.comment ?? null,
    isPossibleDuplicate: l.is_possible_duplicate ?? l.isPossibleDuplicate ?? false,
    partnerLeadStatus: l.partner_lead_status ?? l.partnerLeadStatus ?? null,
    partnerRejectionReason: l.partner_rejection_reason ?? l.partnerRejectionReason ?? null,
    status: l.partner_lead_status ?? l.status ?? "",
    createdAt: l.created_at ?? l.createdAt ?? "",
    scheduledAt: l.scheduled_at ?? l.scheduledAt ?? null,
  };
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export const authApi = {
  login: async (phone: string, password: string): Promise<Partner> => {
    await request<{ ok: boolean }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ login: phone, password }),
    });
    const me = await request<unknown>("/me");
    return mapPartner(me);
  },
  register: async (data: { name: string; phone: string; city: string; password: string }): Promise<Partner> => {
    await request<{ ok: boolean }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
    const me = await request<unknown>("/me");
    return mapPartner(me);
  },
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  me: async (): Promise<Partner> => {
    const me = await request<unknown>("/me");
    return mapPartner(me);
  },
};

// ─── Dashboard ───────────────────────────────────────────────────────────────

export const dashboardApi = {
  get: async (): Promise<DashboardData> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = await request<any>("/dashboard");
    return {
      kpi: {
        leadsToday: d.stats_today?.leads_created ?? 0,
        leadsPeriod: d.stats_period?.leads_total ?? 0,
        acceptedPeriod: d.stats_period?.leads_accepted_by_master ?? 0,
        earningsPeriod: d.earnings?.total ?? 0,
      },
      plan: {
        target: d.plan?.target ?? 0,
        current: d.plan?.current ?? 0,
        remaining: d.plan?.remaining ?? 0,
        completed: d.plan?.is_completed ?? false,
      },
      fixed: {
        targetLeads: d.fixed_salary?.target_leads ?? 0,
        currentLeads: d.fixed_salary?.current_leads ?? 0,
        maxFixed: d.fixed_salary?.max ?? 0,
        currentFixed: d.fixed_salary?.earned ?? 0,
        fixedPct: d.fixed_salary?.pct ?? 0,
      },
      earnings: {
        fixedAmount: d.earnings?.fixed ?? 0,
        fixedPct: d.earnings?.fixed_pct ?? 0,
        bonusCount: d.earnings?.accepted_count ?? 0,
        bonusPerLead: d.earnings?.bonus_per_lead ?? 0,
        bonusAmount: d.earnings?.bonus_total ?? 0,
        total: d.earnings?.total ?? 0,
      },
      recentLeads: (d.recent_leads ?? []).map(mapLead),
    };
  },
};

// ─── Leads ───────────────────────────────────────────────────────────────────

export const leadsApi = {
  list: async (params?: { status?: string; search?: string; page?: number }): Promise<LeadsResponse> => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.search) qs.set("search", params.search);
    if (params?.page) qs.set("page", String(params.page));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = await request<any>(`/leads?${qs}`);
    return {
      rows: (d.rows ?? []).map(mapLead),
      total: d.total ?? 0,
      page: d.page ?? 1,
      limit: d.limit ?? 20,
    };
  },
  create: (data: CreateLeadData) =>
    request<{ ok: boolean; lead: { id: number } }>("/leads", {
      method: "POST",
      body: JSON.stringify({
        client_name: data.clientName,
        client_phone: data.clientPhone,
        city: data.city,
        district: data.district ?? "",
        service_type: data.serviceType,
        area: data.area ?? "0",
        comment: data.comment,
      }),
    }),
};

// ─── Billing ─────────────────────────────────────────────────────────────────

export const billingApi = {
  list: async (): Promise<BillingPeriod[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await request<any[]>("/payouts");
    return rows.map((p) => {
      const start = new Date(p.period_start);
      return {
        id: p.id,
        year: start.getFullYear(),
        month: start.getMonth() + 1,
        leadsCount: p.leads_count ?? 0,
        acceptedCount: p.token_spent_count ?? 0,
        planPct: Math.min(Math.round(((p.leads_count ?? 0) / 30) * 100), 100),
        fixedPct: Math.round((p.fixed_pct ?? 0) * 100),
        fixedAmount: p.fixed_salary_earned ?? 0,
        bonusAmount: p.bonus_earned ?? 0,
        totalAmount: p.total_earned ?? 0,
        status: p.status ?? "pending",
        periodStart: String(p.period_start ?? "").slice(0, 10),
        periodEnd: String(p.period_end ?? "").slice(0, 10),
      };
    });
  },
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Partner {
  id: number;
  name: string;
  phone: string;
  city: string;
  status: string;
  createdAt: string;
  firstLeadAt: string | null;
}

export interface DashboardData {
  kpi: {
    leadsToday: number;
    leadsPeriod: number;
    acceptedPeriod: number;
    earningsPeriod: number;
  };
  plan: {
    target: number;
    current: number;
    remaining: number;
    completed: boolean;
  };
  fixed: {
    targetLeads: number;
    currentLeads: number;
    maxFixed: number;
    currentFixed: number;
    fixedPct: number;
  };
  earnings: {
    fixedAmount: number;
    fixedPct: number;
    bonusCount: number;
    bonusPerLead: number;
    bonusAmount: number;
    total: number;
  };
  recentLeads: Lead[];
}

export interface Lead {
  id: number;
  clientName: string;
  clientPhone: string;
  city: string;
  district: string;
  serviceType: string;
  area: string | null;
  comment: string | null;
  isPossibleDuplicate: boolean | null;
  partnerLeadStatus: string | null;
  partnerRejectionReason: string | null;
  status: string;
  createdAt: string;
  scheduledAt: string | null;
}

export interface LeadsResponse {
  rows: Lead[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateLeadData {
  clientName: string;
  clientPhone: string;
  city: string;
  district?: string;
  serviceType: string;
  area?: string;
  scheduledAt?: string;
  comment?: string;
}

export interface BillingPeriod {
  id: number;
  year: number;
  month: number;
  leadsCount: number;
  acceptedCount: number;
  planPct: number;
  fixedPct: number;
  fixedAmount: number;
  bonusAmount: number;
  totalAmount: number;
  status: string;
  periodStart: string;
  periodEnd: string;
}
