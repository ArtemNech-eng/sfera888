const BASE = "/api/master-pwa";

export interface PendingAction {
  orderId: number;
  type: "call_report" | "photos_and_amount" | "commission_payment";
  title: string;
  ctaText: string;
  daysStuck: number;
  city: string;
  serviceType: string;
  snoozedUntil: string | null;
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const e: any = new Error(err.message ?? err.error ?? "Ошибка запроса");
    e.data = err;
    e.status = res.status;
    throw e;
  }
  return res.json();
}

export const api = {
  auth: {
    login: (login: string, password: string, maxChatId?: string | null) =>
      req<any>("POST", "/auth/login", { login, password, ...(maxChatId ? { maxChatId } : {}) }),
    register: (data: { alias: string; phone?: string; city: string; specialization: string; specializations?: string[]; login: string; password: string; servicePrices?: { service: string; priceFrom: number }[]; maxChatId?: string | null }) =>
      req<any>("POST", "/auth/register", data),
    me: () => req<any>("GET", "/auth/me"),
    logout: () => req<any>("POST", "/auth/logout"),
  },
  home: () => req<any>("GET", "/home"),
  orders: {
    available: () => req<any>("GET", "/orders/available"),
    my: (filter?: string) => req<any>("GET", `/orders/my${filter ? `?filter=${filter}` : ""}`),
    respond: (id: number, responseNote?: string) => req<any>("POST", `/orders/${id}/respond`, { responseNote }),
    accept: (id: number) => req<any>("POST", `/orders/${id}/accept`),
    reject: (id: number, reason?: string) => req<any>("POST", `/orders/${id}/reject`, { reason }),
    cancel: (id: number, cancelType: string, reason?: string) => req<any>("POST", `/orders/${id}/cancel`, { cancelType, reason }),
    updateStatus: (id: number, masterWorkStatus: string) =>
      req<any>("PATCH", `/orders/${id}/status`, { masterWorkStatus }),
    addPhoto: (id: number, type: string, url: string) =>
      req<any>("PATCH", `/orders/${id}/photos`, { type, url }),
    complete: (id: number, proposedAmount: number) =>
      req<any>("POST", `/orders/${id}/complete`, { proposedAmount }),
  },
  leads: {
    respond: (id: number) => req<any>("POST", `/leads/${id}/respond`),
  },
  setAvailability: (available: boolean) => req<any>("PATCH", "/availability", { available }),
  fomoBlockPress: (orderId: number | null, reason?: string | null) =>
    req<any>("POST", "/fomo-block-press", { orderId, reason }),
  dispatchHistory: () => req<any>("GET", "/dispatches/history"),
  analytics: () => req<any>("GET", "/analytics"),
  balance: () => req<any>("GET", "/balance"),
  paymentProof: (photoUrl: string) =>
    req<any>("POST", "/balance/payment-proof", { photoUrl }),
  deposit: () => req<any>("GET", "/deposit"),
  depositRequest: (amount: number, note?: string) =>
    req<any>("POST", "/deposit-request", { amount, note }),
  profile: () => req<any>("GET", "/profile"),
  updateProfile: (data: any) => req<any>("PATCH", "/profile", data),
  portfolio: {
    list: () => req<any>("GET", "/portfolio"),
    create: (data: {
      title?: string;
      description?: string;
      serviceTypeId?: number | null;
      cityId?: number | null;
      priceFrom?: number | string | null;
      priceTo?: number | string | null;
      area?: number | string | null;
      completedAt?: string | null;
    }) => req<any>("POST", "/portfolio", data),
    update: (id: number, data: any) =>
      req<any>("PATCH", `/portfolio/${id}`, data),
    remove: (id: number) =>
      req<any>("DELETE", `/portfolio/${id}`),
    removePhoto: (id: number, type: "before" | "after", url: string) =>
      req<any>("DELETE", `/portfolio/${id}/photos`, { type, url }),
    uploadPhoto: async (id: number, type: "before" | "after", file: File) => {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch(`${BASE}/portfolio/${id}/photos?type=${type}`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        const e: any = new Error(err.message ?? err.error ?? "Ошибка загрузки фото");
        e.data = err;
        e.status = res.status;
        throw e;
      }
      return res.json();
    },
    /**
     * Pure template-based assembly of a portfolio description from 5 short
     * fields. No AI, deterministic. Returns the assembled paragraph text.
     */
    assembleDescription: (input: {
      before?: string;
      steps?: string;
      materials?: string;
      challenges?: string;
      otherDetails?: string;
    }) => req<{ ok: boolean; description: string }>(
      "POST",
      "/portfolio/assemble-description",
      input,
    ),
    /**
     * AI light copy-edit. Returns smoothed text. Never adds facts.
     * 503 when AI is not configured (caller should silently hide the button).
     */
    smoothDescription: (text: string) => req<{
      ok: boolean;
      description: string | null;
      note?: string;
      meta?: { tokensUsed: number; model: string };
    }>("POST", "/portfolio/smooth-description", { text }),
  },
  chat: {
    messages: () => req<any>("GET", "/chat"),
    send: (text: string, photoUrl?: string) => req<any>("POST", "/chat", { text, photoUrl }),
    sendPhoto: (photoUrl: string, caption?: string) => req<any>("POST", "/chat", { text: caption ?? "", photoUrl }),
    unread: () => req<any>("GET", "/chat/unread"),
  },
  // Stuck-orders flow — banner & call-report (.kiro/specs/stuck-orders-and-master-banner)
  pendingActions: () => req<PendingAction[]>("GET", "/pending-actions"),
  snoozeBanner: (orderId: number) =>
    req<{ snoozedUntil: string }>("POST", `/orders/${orderId}/snooze-banner`),
  callReport: (orderId: number, body: { scheduledAt?: string | null; note?: string | null }) =>
    req<{ success: boolean; scheduledAt: string | null }>("POST", `/orders/${orderId}/call-report`, body),
  admin: {
    setCredentials: (masterId: number, login: string, password: string) =>
      fetch(`${BASE}/admin/set-credentials/${masterId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ login, password }),
      }).then(r => r.json()),
  },
};

export async function uploadPhoto(file: File): Promise<string> {
  const urlRes = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!urlRes.ok) throw new Error("Ошибка получения URL загрузки");
  const { uploadURL, objectPath } = await urlRes.json();
  await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  return `/api/storage${objectPath}`;
}

export function resolvePhotoUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("/objects/")) return `/api/storage${url}`;
  return url;
}
