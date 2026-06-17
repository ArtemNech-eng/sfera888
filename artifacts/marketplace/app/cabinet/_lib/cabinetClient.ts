"use client";

/**
 * Client-side cabinet API helpers (plan §18).
 *
 * Cabinet pages talk to the api-server master-pwa endpoints through the
 * marketplace's `/api/cabinet/*` proxy (see app/api/cabinet/[...path]/route.ts).
 * The proxy attaches the browser cookie and forwards the request, so cabinet
 * UI stays a thin REST consumer.
 *
 * Naming mirrors the original master-pwa `lib/api.ts` so the port preserves
 * call sites verbatim where possible. The `req` wrapper is identical, only
 * the BASE prefix changes.
 */

const BASE = "/api/cabinet";

class CabinetApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    credentials: "same-origin",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    const message = (data as { message?: string; error?: string }).message
      ?? (data as { error?: string }).error
      ?? "Ошибка запроса";
    throw new CabinetApiError(message, res.status, data);
  }
  return res.json() as Promise<T>;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export const cabinetAuth = {
  me: () => req<unknown>("GET", "/auth/me"),
  logout: () => req<unknown>("POST", "/auth/logout"),
};

// ── Balance ──────────────────────────────────────────────────────────────────

export interface PartialPayment {
  id: number;
  amount: number;
  note: string | null;
  paidAt: string;
}

export interface BalanceTransaction {
  id: number;
  orderId: number;
  orderServiceType: string | null;
  orderCity: string | null;
  orderAmount: number;
  commission: number;
  netPayable: number;
  prepaymentDeducted: number;
  totalPartialPaid: number;
  partialPayments: PartialPayment[];
  paymentStatus: "paid" | "pending" | "debt" | "cancelled" | string;
  createdAt: string;
  paidAt: string | null;
}

export interface BalanceData {
  debt: number;
  totalEarned: number;
  totalPaidCommission: number;
  pendingCommission: number;
  pendingEarnings: number;
  transactions: BalanceTransaction[];
}

export const cabinetBalance = {
  fetch: () => req<BalanceData>("GET", "/balance"),
  paymentProof: (photoUrl: string) =>
    req<{ ok: true }>("POST", "/balance/payment-proof", { photoUrl }),
};

// ── Photo upload helper ──────────────────────────────────────────────────────

interface UploadInit {
  uploadURL: string;
  objectPath: string;
}

/**
 * Two-step image upload mirroring master-pwa's helper:
 *   1. POST /api/storage/uploads/request-url → signed PUT URL
 *   2. PUT the file directly to that URL (skips the proxy)
 *
 * Returns the api-server-relative path that the backend stores in DB.
 */
export async function uploadPhoto(file: File): Promise<string> {
  const initRes = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      contentType: file.type,
    }),
  });
  if (!initRes.ok) {
    const data = await initRes.json().catch(() => ({ error: initRes.statusText }));
    throw new CabinetApiError(
      (data as { message?: string }).message ?? "Не удалось получить URL загрузки",
      initRes.status,
      data,
    );
  }
  const init = (await initRes.json()) as UploadInit;

  const putRes = await fetch(init.uploadURL, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!putRes.ok) {
    throw new CabinetApiError(
      "Не удалось загрузить файл в хранилище",
      putRes.status,
      null,
    );
  }
  // The UI displays / sends back the api-server-relative path.
  return `/api/storage${init.objectPath}`;
}

export { CabinetApiError };


// ── Home / Dashboard ────────────────────────────────────────────────────────

export interface FomoBlock {
  isBlocked: boolean;
  type: string | null;
  reason: string | null;
  orderId: number | null;
  hoursElapsed: number | null;
}

export interface OrderHomeCard {
  id: number;
  leadId: number | null;
  city: string;
  district: string | null;
  serviceType: string;
  services: string | null;
  area: number;
  scheduledAt: string | null;
  comment: string | null;
  photos: string[];
  dispatchedAt: string | null;
  competitorCount: number;
  isRepeatClient: boolean;
  paymentModel?: string;
}

export interface ActiveOrderHomeCard {
  id: number;
  leadId: number | null;
  city: string;
  district: string | null;
  serviceType: string;
  area: number;
  scheduledAt: string | null;
  status: string;
  masterWorkStatus: string | null;
  proposedAmount?: number | null;
  paymentModel?: string;
  tokensCharged?: number | null;
  assignedAt?: string | null;
}

export interface MissedOrderCard {
  id: number;
  serviceType: string;
  district: string | null;
  area: number;
  takenAt: string;
  wasDispatched: boolean;
}

export interface CabinetHome {
  master: {
    id: number;
    alias: string;
    city: string;
    specialization: string;
    rating: number;
    debt: number;
    isTestMaster: boolean;
    isAvailable: boolean;
    orderLimit: number;
    activeOrdersCount: number;
  };
  fomoBlock: FomoBlock;
  availableOrders: OrderHomeCard[];
  pendingOrders: OrderHomeCard[];
  missedOrders: MissedOrderCard[];
  todayActivity: { total: number; taken: number };
  activeOrders: ActiveOrderHomeCard[];
}

export const cabinetHome = {
  fetch: () => req<CabinetHome>("GET", "/home"),
};


// ── Profile ─────────────────────────────────────────────────────────────────

export interface WorkingHours {
  start: string;
  end: string;
  days: number[];
}

export interface ServicePrice {
  service: string;
  priceFrom: number;
}

export interface ProfileData {
  id: number;
  alias: string;
  city: string;
  specialization: string;
  specializations: string[];
  phone: string | null;
  rating: number;
  debt: number;
  totalOrders: number;
  acceptedOrders: number;
  isTestMaster: boolean;
  customAvatarUrl: string | null;
  contractSignedAt: string | null;
  tags: string[];
  workingHours: WorkingHours | null;
  preferredDistricts: string[];
  minArea: number;
  servicePrices: ServicePrice[];
  stats: {
    conversionRate: number;
    paymentRate: number;
  };
  activeCount: number;
  completedCount: number;
  cancelledCount: number;
  createdAt: string;
  maxChatId: string | null;
  maxBotLink: string | null;
  // Marketplace publication state:
  slug: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  publicTitle: string | null;
  publicBio: string | null;
  yearsExperience: number | null;
  profileUrl: string | null;
}

export const cabinetProfile = {
  fetch: () => req<ProfileData>("GET", "/profile"),
  update: (input: ProfileUpdateInput) =>
    req<ProfileUpdateResponse>("PATCH", "/profile", input),
  setAvailability: (available: boolean) =>
    req<{ ok: true; isAvailable: boolean }>("PATCH", "/availability", { available }),
  uploadAvatar: profileUploadAvatar,
};

export interface ProfileUpdateInput {
  alias?: string;
  phone?: string | null;
  specializations?: string[];
  workingHours?: WorkingHours | null;
  preferredDistricts?: string[];
  minArea?: number;
  servicePrices?: ServicePrice[];
  publicTitle?: string | null;
  publicBio?: string | null;
  yearsExperience?: number | null;
}

export interface ProfileUpdateResponse {
  ok: true;
  success: true;
  autoPublished: boolean;
  isPublished: boolean;
  slug: string | null;
  publishedAt: string | null;
  profileUrl: string | null;
  readinessErrors: { field: string; code: string; message: string }[];
}

export interface ProfileValidationError {
  field: string;
  code: string;
  message: string;
}

/**
 * Multipart avatar upload through the cabinet proxy.
 *
 * Mirrors `POST /master-pwa/profile/avatar`. Returns the api-server-relative
 * URL stored in `customAvatarUrl`. Caller should refetch profile to pick up
 * any side-effects.
 */
async function profileUploadAvatar(file: File): Promise<{ customAvatarUrl: string }> {
  const fd = new FormData();
  fd.append("avatar", file);
  const res = await fetch(`${BASE}/profile/avatar`, {
    method: "POST",
    credentials: "same-origin",
    body: fd,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    const message =
      (data as { message?: string }).message
      ?? (data as { error?: string }).error
      ?? "Не удалось загрузить аватар";
    throw new CabinetApiError(message, res.status, data);
  }
  return res.json() as Promise<{ customAvatarUrl: string }>;
}
// ── Orders (read-only list) ─────────────────────────────────────────────────

export interface OrderListItem {
  id: number;
  leadId: number | null;
  city: string;
  district: string | null;
  serviceType: string;
  area: number;
  scheduledAt: string | null;
  status: string;
  masterWorkStatus: string | null;
  proposedAmount: number | null;
  paymentModel?: string;
  tokensCharged?: number | null;
  assignedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  // Optional rich fields populated on /orders/available and /home cards.
  services?: string | null;
  comment?: string | null;
  photos?: string[];
  dispatchedAt?: string | null;
  competitorCount?: number;
  isRepeatClient?: boolean;
  // Master-side photo galleries (only on /orders/my).
  photosBefore?: string[];
  photosAfter?: string[];
  photoAct?: string | null;
  // Client identity (only on /orders/my, after assignment).
  clientName?: string | null;
  clientPhone?: string | null;
  orderAmount?: number | null;
  commission?: number | null;
  paymentState?: string;
  agreementAmountSource?: string | null;
  hasOwnReceipt?: boolean;
}

export type OrderPhotoType = "before" | "after" | "act";

export const cabinetOrders = {
  fetchMy: (filter?: "active" | "completed" | "all") =>
    req<OrderListItem[]>("GET", `/orders/my${filter ? `?filter=${filter}` : ""}`),
  fetchAvailable: () => req<OrderListItem[]>("GET", "/orders/available"),
  accept: (id: number) =>
    req<{ ok: true } & Record<string, unknown>>("POST", `/orders/${id}/accept`),
  respond: (id: number, responseNote?: string) =>
    req<{ ok: true } & Record<string, unknown>>("POST", `/orders/${id}/respond`, {
      responseNote,
    }),
  reject: (id: number, reason?: string) =>
    req<{ ok: true } & Record<string, unknown>>("POST", `/orders/${id}/reject`, {
      reason,
    }),
  updateStatus: (id: number, masterWorkStatus: WorkStatus) =>
    req<{ ok: true } & Record<string, unknown>>("PATCH", `/orders/${id}/status`, {
      masterWorkStatus,
    }),
  complete: (id: number, proposedAmount: number) =>
    req<{ ok: true } & Record<string, unknown>>("POST", `/orders/${id}/complete`, {
      proposedAmount,
    }),
  cancel: (id: number, cancelType: CancelType, reason?: string) =>
    req<{ ok: true } & Record<string, unknown>>("POST", `/orders/${id}/cancel`, {
      cancelType,
      reason,
    }),
  addPhoto: (id: number, type: OrderPhotoType, url: string) =>
    req<{ success: true }>("PATCH", `/orders/${id}/photos`, { type, url }),
};

export type WorkStatus =
  | "on_the_way"
  | "on_site"
  | "estimating"
  | "in_progress"
  | "finishing"
  | "completed";

export type CancelType = "master_cancel" | "client_cancel" | "refund_request";


// ── Portfolio (cases) ───────────────────────────────────────────────────────

export interface PortfolioItem {
  id: number;
  title: string;
  slug: string | null;
  description: string | null;
  serviceTypeId: number | null;
  cityId: number | null;
  beforePhotos: string[];
  afterPhotos: string[];
  priceFrom: string | null;
  priceTo: string | null;
  area: string | null;
  completedAt: string | null;
  clientReviewText: string | null;
  clientRating: number | null;
  isPublished: boolean;
  isFeatured: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioListResponse {
  items: PortfolioItem[];
  limit: number;
  used: number;
}

export interface PortfolioValidationError {
  field: string;
  code: string;
  message: string;
}

export interface PortfolioCreateInput {
  title?: string | null;
  description?: string | null;
  serviceTypeId?: number | null;
  cityId?: number | null;
  priceFrom?: string | number | null;
  priceTo?: string | number | null;
  area?: string | number | null;
  completedAt?: string | null;
}

export type PortfolioUpdateInput = PortfolioCreateInput;

export interface PortfolioMutateResponse {
  ok: true;
  item: PortfolioItem;
}

export interface PortfolioPhotoUploadResponse {
  ok: true;
  url: string;
  item: PortfolioItem;
}

/**
 * Multipart photo upload through the cabinet proxy.
 *
 * The api-server's `POST /master-pwa/portfolio/:id/photos?type=...` accepts
 * a single `photo` field. The cabinet catch-all proxy forwards multipart
 * bodies as-is (Content-Type with boundary preserved), so we send a plain
 * `FormData` and let the proxy do the work.
 */
async function portfolioUploadPhoto(
  id: number,
  type: "before" | "after",
  file: File,
): Promise<PortfolioPhotoUploadResponse> {
  const fd = new FormData();
  fd.append("photo", file);
  const res = await fetch(`${BASE}/portfolio/${id}/photos?type=${type}`, {
    method: "POST",
    credentials: "same-origin",
    body: fd,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    const message =
      (data as { errors?: { message?: string }[] }).errors?.[0]?.message
      ?? (data as { message?: string }).message
      ?? (data as { error?: string }).error
      ?? "Не удалось загрузить фото";
    throw new CabinetApiError(message, res.status, data);
  }
  return res.json() as Promise<PortfolioPhotoUploadResponse>;
}

export const cabinetPortfolio = {
  list: () => req<PortfolioListResponse>("GET", "/portfolio"),
  create: (input: PortfolioCreateInput) =>
    req<PortfolioMutateResponse>("POST", "/portfolio", input),
  update: (id: number, input: PortfolioUpdateInput) =>
    req<PortfolioMutateResponse>("PATCH", `/portfolio/${id}`, input),
  remove: (id: number) =>
    req<{ ok: true }>("DELETE", `/portfolio/${id}`),
  uploadPhoto: portfolioUploadPhoto,
  removePhoto: (id: number, type: "before" | "after", url: string) =>
    req<PortfolioMutateResponse>("DELETE", `/portfolio/${id}/photos`, { type, url }),
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
  smoothDescription: (text: string) =>
    req<{
      ok: boolean;
      description: string | null;
      note?: string;
      meta?: { tokensUsed: number; model: string };
    }>("POST", "/portfolio/smooth-description", { text }),
};


// ── Chat ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: number;
  text: string;
  photoUrl: string | null;
  fromMaster: boolean;
  senderName: string | null;
  isRead: boolean;
  editedAt: string | null;
  createdAt: string;
}

export interface ChatUnread {
  count: number;
}

export const cabinetChat = {
  fetch: () => req<ChatMessage[]>("GET", "/chat"),
  send: (text: string, photoUrl?: string) =>
    req<ChatMessage>("POST", "/chat", { text, photoUrl }),
  unread: () => req<ChatUnread>("GET", "/chat/unread"),
};


// ── Daily checkin ───────────────────────────────────────────────────────────

export interface CheckinToday {
  id: number;
  masterId: number;
  date: string;
  isAvailable: boolean | null;
  respondedAt: string | null;
  reason?: string | null;
}

export const cabinetCheckin = {
  today: () => req<CheckinToday | null>("GET", "/checkin/today"),
  submit: (isAvailable: boolean) =>
    req<{ ok: true }>("POST", "/checkin/today", { isAvailable }),
};


// ── Analytics ───────────────────────────────────────────────────────────────

export interface AnalyticsData {
  totalDispatched: number;
  totalResponded: number;
  totalAssigned: number;
  winRate: number;
  last30Days: {
    dispatched: number;
    responded: number;
    assigned: number;
  };
  avgOrderAmount: number;
  rejectionReasons: Record<string, number>;
}

export const cabinetAnalytics = {
  fetch: () => req<AnalyticsData>("GET", "/analytics"),
};
