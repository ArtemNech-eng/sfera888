import { Router } from "express";
import { db, avitoSettingsTable, leadsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import OpenAI from "openai";

const router = Router();

const AVITO_API = "https://api.avito.ru";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// ── helpers ──────────────────────────────────────────────────────────────────

async function getSettings() {
  const rows = await db.select().from(avitoSettingsTable).limit(1);
  return rows[0] ?? null;
}

async function fetchToken(clientId: string, clientSecret: string) {
  const res = await fetch(`${AVITO_API}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Авито токен: ${res.status} — ${text}`);
  }
  const data = await res.json() as { access_token: string; expires_in: number };
  return data;
}

async function getValidToken(): Promise<string | null> {
  const settings = await getSettings();
  if (!settings || !settings.enabled || !settings.clientId || !settings.clientSecret) return null;

  const now = new Date();
  // Refresh 60 seconds early to avoid edge-case expiry during request
  if (settings.accessToken && settings.tokenExpiresAt && settings.tokenExpiresAt > new Date(now.getTime() + 60_000)) {
    return settings.accessToken;
  }

  // Refresh token
  const tokenData = await fetchToken(settings.clientId, settings.clientSecret);
  const expiresAt = new Date(now.getTime() + tokenData.expires_in * 1000);
  await db.update(avitoSettingsTable)
    .set({ accessToken: tokenData.access_token, tokenExpiresAt: expiresAt, updatedAt: new Date() })
    .where(eq(avitoSettingsTable.id, settings.id));
  return tokenData.access_token;
}

async function avitoGet(path: string, token: string) {
  const res = await fetch(`${AVITO_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Авито API ${res.status}: ${text}`);
  }
  return res.json();
}

async function avitoPost(path: string, token: string, body: object) {
  const res = await fetch(`${AVITO_API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Авито API ${res.status}: ${text}`);
  }
  return res.json();
}

// ── routes ────────────────────────────────────────────────────────────────────

// GET /api/avito/settings
router.get("/settings", async (_req, res) => {
  const s = await getSettings();
  if (!s) return res.json({ connected: false });
  res.json({
    connected: s.enabled && !!s.accessToken,
    clientId: s.clientId,
    avitoUserId: s.avitoUserId,
    avitoUserName: s.avitoUserName,
    enabled: s.enabled,
    tokenExpiresAt: s.tokenExpiresAt,
  });
});

// POST /api/avito/settings — save credentials + test connection
router.post("/settings", async (req, res) => {
  const { clientId, clientSecret } = req.body as { clientId: string; clientSecret: string };
  if (!clientId || !clientSecret) return res.status(400).json({ error: "Нужны client_id и client_secret" });

  let tokenData: { access_token: string; expires_in: number };
  try {
    tokenData = await fetchToken(clientId, clientSecret);
  } catch (e: any) {
    return res.status(400).json({ error: e.message ?? "Ошибка авторизации в Авито" });
  }

  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

  let avitoUserId: string | null = null;
  let avitoUserName: string | null = null;
  try {
    const self = await fetch(`${AVITO_API}/core/v1/accounts/self`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    }).then(r => r.json()) as any;
    avitoUserId = String(self.id ?? "");
    avitoUserName = self.name ?? null;
  } catch {}

  const existing = await getSettings();
  if (existing) {
    await db.update(avitoSettingsTable).set({
      clientId, clientSecret, accessToken: tokenData.access_token,
      tokenExpiresAt: expiresAt, avitoUserId, avitoUserName,
      enabled: true, updatedAt: new Date(),
    }).where(eq(avitoSettingsTable.id, existing.id));
  } else {
    await db.insert(avitoSettingsTable).values({
      clientId, clientSecret, accessToken: tokenData.access_token,
      tokenExpiresAt: expiresAt, avitoUserId, avitoUserName, enabled: true,
    });
  }

  res.json({ ok: true, avitoUserId, avitoUserName });
});

// DELETE /api/avito/settings — disconnect
router.delete("/settings", async (_req, res) => {
  const existing = await getSettings();
  if (existing) {
    await db.update(avitoSettingsTable).set({
      enabled: false, accessToken: null, tokenExpiresAt: null,
      clientId: null, clientSecret: null, updatedAt: new Date(),
    }).where(eq(avitoSettingsTable.id, existing.id));
  }
  res.json({ ok: true });
});

// GET /api/avito/chats — list chats
router.get("/chats", async (_req, res) => {
  const token = await getValidToken();
  if (!token) return res.status(403).json({ error: "Авито не подключён" });

  const settings = await getSettings();
  const userId = settings?.avitoUserId;
  if (!userId) return res.status(400).json({ error: "Нет ID пользователя Авито" });

  try {
    const data = await avitoGet(
      `/messenger/v3/accounts/${userId}/chats?limit=50&unread_only=false`,
      token
    ) as any;
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/avito/chats/:chatId/messages
router.get("/chats/:chatId/messages", async (req, res) => {
  const token = await getValidToken();
  if (!token) return res.status(403).json({ error: "Авито не подключён" });

  const settings = await getSettings();
  const userId = settings?.avitoUserId;
  if (!userId) return res.status(400).json({ error: "Нет ID пользователя Авито" });

  try {
    const data = await avitoGet(
      `/messenger/v3/accounts/${userId}/chats/${req.params.chatId}/messages/?limit=100`,
      token
    ) as any;
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/avito/chats/:chatId/reply
router.post("/chats/:chatId/reply", async (req, res) => {
  const token = await getValidToken();
  if (!token) return res.status(403).json({ error: "Авито не подключён" });

  const settings = await getSettings();
  const userId = settings?.avitoUserId;
  if (!userId) return res.status(400).json({ error: "Нет ID пользователя Авито" });

  const { text } = req.body as { text: string };
  if (!text?.trim()) return res.status(400).json({ error: "Нужен текст сообщения" });

  try {
    const data = await avitoPost(
      `/messenger/v3/accounts/${userId}/chats/${req.params.chatId}/messages`,
      token,
      { message: { text }, type: "text" }
    );
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/avito/leads — создать заявку из чата
router.post("/leads", async (req, res) => {
  const { chatId, clientName, clientPhone, itemTitle } = req.body as {
    chatId: string; clientName?: string; clientPhone?: string; itemTitle?: string;
  };

  if (!chatId) return res.status(400).json({ error: "Нужен chatId" });

  const [lead] = await db.insert(leadsTable).values({
    clientName: clientName || "Клиент с Авито",
    clientPhone: clientPhone || "—",
    city: "Не указан",
    district: "Не указан",
    serviceType: itemTitle || "Авито",
    comment: `Заявка из Авито чата #${chatId}`,
    source: "avito",
    status: "new",
  }).returning();

  res.json({ ok: true, leadId: lead.id });
});

// GET /api/avito/ping — поддержание онлайн-статуса
router.get("/ping", async (_req, res) => {
  const token = await getValidToken();
  if (!token) return res.json({ online: false });

  const settings = await getSettings();
  const userId = settings?.avitoUserId;
  if (!userId) return res.json({ online: false });

  try {
    await avitoGet(`/core/v1/accounts/self`, token);
    res.json({ online: true, ts: Date.now() });
  } catch {
    res.json({ online: false, ts: Date.now() });
  }
});

// GET /api/avito/items — список объявлений
// Avito API v1: GET /core/v1/accounts/{user_id}/items
// Status filter uses comma-encoded param — but safer to fetch all without filter
router.get("/items", async (req, res) => {
  const token = await getValidToken();
  if (!token) return res.status(403).json({ error: "Авито не подключён" });

  const settings = await getSettings();
  const userId = settings?.avitoUserId;
  if (!userId) return res.status(400).json({ error: "Нет ID пользователя Авито" });

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(req.query.per_page as string) || 50));
  const statusFilter = req.query.status as string | undefined;

  // Build URL — Avito accepts status as comma-separated: status=active,old
  // Must be URL-encoded to avoid parse issues on some proxies
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
  });
  if (statusFilter) {
    // e.g. "active" or "active,old"
    params.set("status", statusFilter);
  }

  try {
    const data = await avitoGet(
      `/core/v1/accounts/${userId}/items?${params.toString()}`,
      token
    ) as any;
    res.json(data);
  } catch (e: any) {
    // Fallback: try without status param if API rejected it
    try {
      const data = await avitoGet(
        `/core/v1/accounts/${userId}/items?page=${page}&per_page=${perPage}`,
        token
      ) as any;
      res.json(data);
    } catch (e2: any) {
      res.status(500).json({ error: e2.message });
    }
  }
});

// GET /api/avito/stats — статистика просмотров/контактов/избранного за N дней
router.get("/stats", async (req, res) => {
  const token = await getValidToken();
  if (!token) return res.status(403).json({ error: "Авито не подключён" });

  const settings = await getSettings();
  const userId = settings?.avitoUserId;
  if (!userId) return res.status(400).json({ error: "Нет ID пользователя Авито" });

  const days = Math.min(90, Math.max(1, parseInt(req.query.days as string) || 30));

  // Fetch all active items first
  let itemIds: number[] = [];
  try {
    const items = await avitoGet(
      `/core/v1/accounts/${userId}/items?per_page=100`,
      token
    ) as any;
    itemIds = (items.resources ?? []).map((r: any) => Number(r.id)).filter(Boolean);
  } catch (e: any) {
    return res.status(500).json({ error: `Не удалось загрузить объявления: ${e.message}` });
  }

  if (itemIds.length === 0) return res.json({ result: { items: [] } });

  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const dateFrom = from.toISOString().split("T")[0];
  const dateTo = now.toISOString().split("T")[0];

  try {
    const data = await avitoPost(
      `/stats/v1/accounts/${userId}/items`,
      token,
      {
        dateFrom,
        dateTo,
        fields: ["uniqViews", "uniqContacts", "uniqFavorites"],
        itemIds: itemIds.slice(0, 200),
      }
    ) as any;
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/avito/items+stats — combined: items list WITH stats in one request
router.get("/items-with-stats", async (req, res) => {
  const token = await getValidToken();
  if (!token) return res.status(403).json({ error: "Авито не подключён" });

  const settings = await getSettings();
  const userId = settings?.avitoUserId;
  if (!userId) return res.status(400).json({ error: "Нет ID пользователя Авито" });

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const perPage = Math.min(100, parseInt(req.query.per_page as string) || 50);

  // 1. Fetch items
  let items: any[] = [];
  let meta: any = {};
  try {
    const data = await avitoGet(
      `/core/v1/accounts/${userId}/items?page=${page}&per_page=${perPage}`,
      token
    ) as any;
    items = data.resources ?? [];
    meta = data.meta ?? {};
  } catch (e: any) {
    return res.status(500).json({ error: `Объявления: ${e.message}` });
  }

  // 2. Fetch stats for these items (last 30 days)
  let statsMap: Record<number, any> = {};
  if (items.length > 0) {
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    try {
      const statsData = await avitoPost(
        `/stats/v1/accounts/${userId}/items`,
        token,
        {
          dateFrom: from.toISOString().split("T")[0],
          dateTo: now.toISOString().split("T")[0],
          fields: ["uniqViews", "uniqContacts", "uniqFavorites"],
          itemIds: items.map((i: any) => Number(i.id)),
        }
      ) as any;
      for (const s of (statsData.result?.items ?? [])) {
        statsMap[s.itemId] = s.fields ?? {};
      }
    } catch {
      // Stats are optional — don't fail the whole request
    }
  }

  // 3. Merge stats into items
  const enriched = items.map((item: any) => ({
    ...item,
    stats: statsMap[item.id] ?? { uniqViews: 0, uniqContacts: 0, uniqFavorites: 0 },
  }));

  res.json({ resources: enriched, meta });
});

// POST /api/avito/ai-analyze — AI-анализ объявлений и рекомендации
router.post("/ai-analyze", async (_req, res) => {
  const token = await getValidToken();
  if (!token) return res.status(403).json({ error: "Авито не подключён" });

  const settings = await getSettings();
  const userId = settings?.avitoUserId;
  if (!userId) return res.status(400).json({ error: "Нет ID пользователя Авито" });

  let items: any[] = [];
  let statsMap: Record<number, any> = {};

  try {
    const itemsData = await avitoGet(
      `/core/v1/accounts/${userId}/items?per_page=100`,
      token
    ) as any;
    items = itemsData.resources ?? [];
  } catch (e: any) {
    return res.status(500).json({ error: "Не удалось загрузить объявления: " + e.message });
  }

  if (items.length > 0) {
    try {
      const now = new Date();
      const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const statsData = await avitoPost(
        `/stats/v1/accounts/${userId}/items`,
        token,
        {
          dateFrom: from.toISOString().split("T")[0],
          dateTo: now.toISOString().split("T")[0],
          fields: ["uniqViews", "uniqContacts", "uniqFavorites"],
          itemIds: items.slice(0, 200).map((i: any) => Number(i.id)),
        }
      ) as any;
      for (const item of (statsData.result?.items ?? [])) {
        statsMap[item.itemId] = item.fields ?? {};
      }
    } catch {}
  }

  const itemsSummary = items.slice(0, 20).map((item: any) => {
    const stats = statsMap[item.id] ?? {};
    return {
      id: item.id,
      title: item.title,
      price: item.price,
      status: item.status,
      category: item.category?.name,
      views: stats.uniqViews ?? 0,
      contacts: stats.uniqContacts ?? 0,
      favorites: stats.uniqFavorites ?? 0,
      conversionRate: (stats.uniqViews ?? 0) > 0
        ? (((stats.uniqContacts ?? 0) / stats.uniqViews) * 100).toFixed(1) + "%"
        : "0%",
    };
  });

  const prompt = `Ты эксперт по маркетингу на Авито. Проанализируй объявления компании по ремонту квартир и дай конкретные рекомендации.

Объявления (данные за последние 30 дней):
${JSON.stringify(itemsSummary, null, 2)}

Дай анализ:
1. Какие объявления работают хорошо (высокая конверсия контакты/просмотры)
2. Какие объявления нужно улучшить (низкая конверсия или мало просмотров)
3. Конкретные рекомендации: заголовок, описание, цена, фото, теги
4. Общие советы по продвижению для ремонтного бизнеса

Отвечай на русском. Используй конкретные данные. Форматируй с разделами и эмодзи для наглядности.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2000,
    });

    res.json({
      analysis: response.choices[0]?.message?.content ?? "Не удалось получить анализ",
      itemsCount: items.length,
      analyzedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    res.status(500).json({ error: "AI анализ недоступен: " + e.message });
  }
});

// POST /api/avito/webhook — принимать сообщения от Авито в реальном времени
// Авито шлёт POST-запросы при новых сообщениях
router.post("/webhook", async (req, res) => {
  // Авито ожидает 200 ответ быстро
  res.json({ ok: true });

  const event = req.body as any;
  if (!event || event.name !== "message") return;

  // Логируем для отладки
  console.log("[avitoWebhook] incoming message event:", JSON.stringify(event).slice(0, 200));
  // TODO: можно добавить создание уведомления или обработку автоответа
});

export default router;
