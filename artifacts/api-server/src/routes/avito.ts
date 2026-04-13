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

// Minimal scopes — only what is approved by default in Avito developer apps
// Extra scopes (stats:read, autouploading:read) can cause "Что-то пошло не так" if not whitelisted
const AVITO_SCOPES = "items:info messenger:read messenger:write user:read";

async function fetchToken(clientId: string, clientSecret: string) {
  const res = await fetch(`${AVITO_API}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: AVITO_SCOPES,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Авито токен: ${res.status} — ${text}`);
  }
  const data = await res.json() as { access_token: string; expires_in: number; scope?: string };
  console.log(`[avito:token] obtained, scope="${data.scope ?? "not returned"}"`);
  return data;
}

async function getValidToken(): Promise<string | null> {
  const settings = await getSettings();
  if (!settings || !settings.enabled || !settings.clientId || !settings.clientSecret) return null;

  const now = new Date();
  // Use cached token if still valid (with 60s buffer)
  if (settings.accessToken && settings.tokenExpiresAt && settings.tokenExpiresAt > new Date(now.getTime() + 60_000)) {
    return settings.accessToken;
  }

  // Try refresh_token first (OAuth code flow)
  if ((settings as any).refreshToken && settings.authType === "oauth_code") {
    try {
      const tokenData = await refreshAccessToken((settings as any).refreshToken, settings.clientId, settings.clientSecret);
      const expiresAt = new Date(now.getTime() + tokenData.expires_in * 1000);
      await db.update(avitoSettingsTable)
        .set({
          accessToken: tokenData.access_token,
          ...(tokenData.refresh_token ? { refreshToken: tokenData.refresh_token } : {}),
          tokenExpiresAt: expiresAt,
          updatedAt: new Date(),
        } as any)
        .where(eq(avitoSettingsTable.id, settings.id));
      return tokenData.access_token;
    } catch (e) {
      console.warn("[avito] refresh_token failed, falling back to client_credentials:", (e as Error).message);
    }
  }

  // Fallback: client_credentials
  const tokenData = await fetchToken(settings.clientId, settings.clientSecret);
  const expiresAt = new Date(now.getTime() + tokenData.expires_in * 1000);
  await db.update(avitoSettingsTable)
    .set({ accessToken: tokenData.access_token, tokenExpiresAt: expiresAt, updatedAt: new Date() })
    .where(eq(avitoSettingsTable.id, settings.id));
  return tokenData.access_token;
}

class AvitoApiError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = "AvitoApiError";
  }
}

async function avitoGet(path: string, token: string) {
  const res = await fetch(`${AVITO_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new AvitoApiError(res.status, `Авито API ${res.status}: ${text}`);
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
    throw new AvitoApiError(res.status, `Авито API ${res.status}: ${text}`);
  }
  return res.json();
}

// ── OAuth helpers ─────────────────────────────────────────────────────────────

const REDIRECT_URI = "https://sfera-master.ru/api/avito/callback";
// Redirect to CRM root — static file servers don't support SPA sub-routes.
// App.tsx will detect ?avito_connected=1 / ?avito_error=... and navigate to /avito.
const CRM_AVITO_URL = "https://sfera-master.ru/crm/";

/** Render a self-closing HTML page that shows status and redirects to CRM */
function oauthResultPage(ok: boolean, title: string, subtitle: string): string {
  const color = ok ? "#22c55e" : "#ef4444";
  const icon = ok ? "✅" : "❌";
  const redirectUrl = ok
    ? `${CRM_AVITO_URL}?avito_connected=1`
    : `${CRM_AVITO_URL}?avito_error=${encodeURIComponent(subtitle)}`;
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${ok ? "Авито подключён" : "Ошибка подключения"}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      background:#f8fafc;display:flex;align-items:center;justify-content:center;
      min-height:100vh;padding:24px}
    .card{background:#fff;border-radius:20px;box-shadow:0 4px 32px rgba(0,0,0,.12);
      padding:40px 32px;max-width:420px;width:100%;text-align:center}
    .icon{font-size:56px;margin-bottom:16px}
    h1{font-size:22px;font-weight:700;color:#111;margin-bottom:8px}
    p{font-size:14px;color:#6b7280;line-height:1.6;margin-bottom:24px}
    .btn{display:inline-block;padding:12px 28px;background:${color};color:#fff;
      font-size:15px;font-weight:600;border-radius:12px;text-decoration:none;
      transition:opacity .2s}
    .btn:hover{opacity:.85}
    .note{margin-top:14px;font-size:12px;color:#9ca3af}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${subtitle}</p>
    <a class="btn" href="${CRM_AVITO_URL}">Перейти в CRM →</a>
    <div class="note">Автоматический переход через 3 секунды…</div>
  </div>
  <script>setTimeout(()=>location.href=${JSON.stringify(redirectUrl)},3000)</script>
</body>
</html>`;
}

async function exchangeCode(code: string, clientId: string, clientSecret: string) {
  // Per official Avito docs: token exchange only needs grant_type, client_id, client_secret, code.
  // redirect_uri is NOT required (docs don't mention it in token exchange step).
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
  });

  console.log(`[avito:exchangeCode] POST ${AVITO_API}/token code_len=${code.length}`);

  const res = await fetch(`${AVITO_API}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  const rawText = await res.text();
  console.log(`[avito:exchangeCode] status=${res.status} body=${rawText}`);

  if (!res.ok) {
    let desc = rawText;
    try {
      const j = JSON.parse(rawText);
      desc = j.error_description ?? j.error ?? rawText;
    } catch {}
    throw new Error(`Авито OAuth ${res.status}: ${desc}`);
  }

  const data = JSON.parse(rawText);
  return data as { access_token: string; refresh_token?: string; expires_in: number };
}

async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string) {
  const res = await fetch(`${AVITO_API}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Авито refresh token: ${res.status} — ${text}`);
  }
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>;
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

// GET /api/avito/oauth-start — начать OAuth авторизацию через Авито
// ?client_id=XXX&client_secret=YYY (сохраняем credentials перед редиректом)
router.get("/oauth-start", async (req, res) => {
  const { client_id, client_secret } = req.query as { client_id?: string; client_secret?: string };
  if (!client_id || !client_secret) {
    return res.status(400).send("Нужны client_id и client_secret");
  }

  // Сохраняем credentials, чтобы использовать при callback
  const existing = await getSettings();
  if (existing) {
    await db.update(avitoSettingsTable)
      .set({ clientId: client_id, clientSecret: client_secret, updatedAt: new Date() })
      .where(eq(avitoSettingsTable.id, existing.id));
  } else {
    await db.insert(avitoSettingsTable).values({
      clientId: client_id, clientSecret: client_secret, enabled: false,
    });
  }

  // Per official Avito docs: https://developers.avito.ru/api-catalog/auth/documentation
  // - redirect_uri is NOT included (Avito uses the one registered in developer console)
  // - scope uses COMMA separator, NOT space
  // - no state required (optional)
  // user:read is required for /accounts/self (to get avitoUserId for messenger API)
  // items:info is required for listings/ads access
  const authUrl = `https://avito.ru/oauth?response_type=code&client_id=${encodeURIComponent(client_id)}&scope=messenger:read,messenger:write,user:read,items:info`;

  console.log(`[avito:oauth-start] redirect → ${authUrl}`);
  res.redirect(authUrl);
});

// GET /api/avito/callback — обработка OAuth callback от Авито
router.get("/callback", async (req, res) => {
  // Log all received params for debugging
  console.log(`[avito:callback] received query params:`, JSON.stringify(req.query));

  const { code, error, error_description } = req.query as {
    code?: string; error?: string; error_description?: string;
  };

  res.setHeader("Content-Type", "text/html; charset=utf-8");

  if (error) {
    const desc = error_description ?? error;
    console.error(`[avito:callback] Авито вернул ошибку: error="${error}" description="${error_description}"`);
    return res.send(oauthResultPage(false, "Авито отклонил авторизацию", String(desc)));
  }

  if (!code) {
    console.error(`[avito:callback] Нет параметра code. Все параметры:`, req.query);
    return res.send(oauthResultPage(
      false,
      "Нет кода авторизации",
      "Авито не вернул code. Убедитесь что вы открываете эту страницу через кнопку «Войти через Авито» в CRM, а не напрямую."
    ));
  }

  const settings = await getSettings();
  if (!settings?.clientId || !settings?.clientSecret) {
    console.error(`[avito:callback] Нет сохранённых credentials в БД`);
    return res.send(oauthResultPage(
      false,
      "Нет учётных данных",
      "Введите Client ID и Client Secret в форме подключения CRM, затем нажмите «Войти через Авито» снова."
    ));
  }

  try {
    const tokenData = await exchangeCode(code, settings.clientId, settings.clientSecret);
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    // Получаем данные аккаунта
    let avitoUserId: string | null = null;
    let avitoUserName: string | null = null;
    try {
      const selfRes = await fetch(`${AVITO_API}/core/v1/accounts/self`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const selfText = await selfRes.text();
      console.log(`[avito:callback] /accounts/self status=${selfRes.status} body=${selfText}`);
      if (selfRes.ok) {
        const self = JSON.parse(selfText);
        avitoUserId = String(self.id ?? "");
        avitoUserName = self.name ?? null;
      }
    } catch (selfErr: any) {
      console.warn(`[avito:callback] /accounts/self error:`, selfErr.message);
    }

    await db.update(avitoSettingsTable).set({
      accessToken: tokenData.access_token,
      ...(tokenData.refresh_token ? { refreshToken: tokenData.refresh_token } : {}),
      tokenExpiresAt: expiresAt,
      avitoUserId, avitoUserName,
      authType: "oauth_code",
      enabled: true,
      updatedAt: new Date(),
    } as any).where(eq(avitoSettingsTable.id, settings.id));

    console.log(`[avito:callback] ✅ OAuth success user="${avitoUserName}" id="${avitoUserId}" expires="${expiresAt.toISOString()}"`);
    return res.send(oauthResultPage(
      true,
      "Авито успешно подключён ✅",
      avitoUserName ? `Аккаунт: ${avitoUserName}` : "Токен получен и сохранён. Перенаправляем в CRM…"
    ));
  } catch (e: any) {
    console.error(`[avito:callback] ❌ token exchange failed:`, e.message);
    return res.send(oauthResultPage(false, "Ошибка получения токена", e.message));
  }
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
  const { chatId, clientName, clientPhone, itemTitle, city, serviceType, district, area, comment } = req.body as {
    chatId: string;
    clientName?: string;
    clientPhone?: string;
    itemTitle?: string;
    city?: string;
    serviceType?: string;
    district?: string;
    area?: string;
    comment?: string;
  };

  if (!chatId) return res.status(400).json({ error: "Нужен chatId" });

  const chatLink = `https://www.avito.ru/profile/chats/${chatId}`;
  const fullComment = [
    comment,
    area ? `Площадь: ${area}` : null,
    `Чат Авито: ${chatLink}`,
  ].filter(Boolean).join("\n");

  const [lead] = await db.insert(leadsTable).values({
    clientName: clientName || "Клиент с Авито",
    clientPhone: clientPhone || "—",
    city: city || "Не указан",
    district: district || "Не указан",
    serviceType: serviceType || itemTitle || "Авито",
    comment: fullComment,
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

  // Per official docs: GET /core/v1/items (no user_id in URL)
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
  });
  if (statusFilter) {
    params.set("status", statusFilter);
  }

  try {
    const data = await avitoGet(`/core/v1/items?${params.toString()}`, token) as any;
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: (e as Error).message });
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
  // Per docs: GET /core/v1/items (no user_id in URL)
  let itemIds: number[] = [];
  try {
    const items = await avitoGet(
      `/core/v1/items?per_page=100`,
      token
    ) as any;
    itemIds = (items.resources ?? items.items ?? []).map((r: any) => Number(r.id)).filter(Boolean);
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

  // Helper: fetch items using the correct Avito API endpoint.
  // Per official docs: GET /core/v1/items (NO user_id in URL — identity comes from Bearer token)
  // SDK reference: https://github.com/darkvovich/avito-php-api-items
  async function fetchItems(_uid: string): Promise<{ items: any[]; meta: any }> {
    const qs = `?page=${page}&per_page=${perPage}`;
    // Correct endpoint first, then fallbacks for older API versions
    const urls = [
      `/core/v1/items${qs}`,                      // ✅ official docs: no user_id in URL
      `/core/v1/items`,                            // ✅ without pagination
      `/core/v1/accounts/${_uid}/items${qs}`,      // legacy attempt
      `/core/v1/accounts/self/items${qs}`,         // legacy "self" alias
    ];

    let lastError: AvitoApiError | Error | null = null;
    for (const url of urls) {
      try {
        console.log(`[avito:items] trying: GET ${AVITO_API}${url}`);
        const data = await avitoGet(url, token) as any;
        console.log(`[avito:items] success url=${url} keys=${Object.keys(data).join(",")}, count=${(data.resources ?? data.items ?? []).length}`);
        return {
          items: data.resources ?? data.items ?? data.result ?? [],
          meta: data.meta ?? {},
        };
      } catch (e: any) {
        console.log(`[avito:items] failed url=${url}: ${e.message}`);
        lastError = e;
        // Only retry on routing errors; propagate auth / rate-limit errors immediately
        if (e instanceof AvitoApiError && e.statusCode !== 404 && e.statusCode !== 422) {
          throw e;
        }
      }
    }

    // All URLs failed — distinguish "no route" (wrong uid or missing scope) from others
    if (lastError instanceof AvitoApiError && lastError.statusCode === 404) {
      const permErr = new Error(
        "Авито API не нашёл маршрут для объявлений (404). " +
        "Возможные причины: приложение не имеет доступа к Items API, " +
        "или сохранённый ID аккаунта неверен. " +
        "Попробуйте переподключить Авито — нажмите «Отключить» и введите ключи заново."
      ) as any;
      permErr.code = "NO_ITEMS_PERMISSION";
      throw permErr;
    }
    throw lastError ?? new Error("Не удалось загрузить объявления");
  }

  // Resolve current userId (may have changed or been stored incorrectly)
  async function resolveUserId(): Promise<string> {
    try {
      const self = await avitoGet(`/core/v1/accounts/self`, token) as any;
      const freshId = String(self.id ?? "");
      if (freshId && freshId !== userId) {
        // Silently update stored userId if it changed
        await db.update(avitoSettingsTable)
          .set({ avitoUserId: freshId, avitoUserName: self.name ?? null, updatedAt: new Date() })
          .where(eq(avitoSettingsTable.id, (await getSettings())!.id));
        return freshId;
      }
    } catch {}
    return userId!;
  }

  // 1. Resolve userId (refresh from Avito if stored value is stale/wrong)
  const resolvedUid = await resolveUserId();

  // 2. Fetch items
  let items: any[] = [];
  let meta: any = {};
  try {
    const result = await fetchItems(resolvedUid);
    items = result.items;
    meta = result.meta;
  } catch (e: any) {
    const isPermission = e.code === "NO_ITEMS_PERMISSION";
    return res.status(isPermission ? 403 : 500).json({
      error: e.message,
      code: isPermission ? "NO_ITEMS_PERMISSION" : undefined,
    });
  }

  // 2. Fetch stats for these items (last 30 days) — optional, never fails the request
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
      // Stats are optional — items still shown without stats
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
