import { Router } from "express";
import { db, avitoSettingsTable, leadsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const AVITO_API = "https://api.avito.ru";

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
    throw new Error(`Авито токен: ${res.status} ${text}`);
  }
  const data = await res.json() as { access_token: string; expires_in: number };
  return data;
}

async function getValidToken(): Promise<string | null> {
  const settings = await getSettings();
  if (!settings || !settings.enabled || !settings.clientId || !settings.clientSecret) return null;

  const now = new Date();
  if (settings.accessToken && settings.tokenExpiresAt && settings.tokenExpiresAt > now) {
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
  });
});

// POST /api/avito/settings — save credentials + test connection
router.post("/settings", async (req, res) => {
  const { clientId, clientSecret } = req.body as { clientId: string; clientSecret: string };
  if (!clientId || !clientSecret) return res.status(400).json({ error: "Нужны client_id и client_secret" });

  // Test credentials
  let tokenData: { access_token: string; expires_in: number };
  try {
    tokenData = await fetchToken(clientId, clientSecret);
  } catch (e: any) {
    return res.status(400).json({ error: e.message ?? "Ошибка авторизации в Авито" });
  }

  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

  // Get Avito user info
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
      `/messenger/v3/accounts/${userId}/chats/${req.params.chatId}/messages/?limit=50`,
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
  const {
    chatId, clientName, clientPhone, itemTitle,
  } = req.body as {
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

export default router;
