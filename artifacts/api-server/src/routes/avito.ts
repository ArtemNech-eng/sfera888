import { Router } from "express";
import { db, avitoSettingsTable, leadsTable, ordersTable, systemSettingsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
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
// items:write is required for toggle/schedule — must be enabled in your Avito developer app settings first
const AVITO_SCOPES = "items:info items:write messenger:read messenger:write user:read user_balance:read";

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

/** Получить аванс через CPA API Авито
 *  POST /cpa/v2/balanceInfo — возвращает {"advance": N, "balance": M} в копейках
 *  CPA API требует ClientCredentials токен (не OAuth Authorization Code!):
 *    grant_type=client_credentials + client_id + client_secret
 */
async function getAdvanceBalance(_token: string, _userId: string, manualFallback: number): Promise<{ balanceRub: number; source: string; needsReauth: boolean }> {
  try {
    const settings = await getSettings();
    if (!settings?.clientId || !settings?.clientSecret) {
      console.log(`[avito:advance] no client_id/client_secret, using manual fallback`);
      return { balanceRub: manualFallback, source: "manual", needsReauth: false };
    }

    // CPA API requires client_credentials token — separate from OAuth user token
    console.log(`[avito:advance] getting client_credentials token for CPA API`);
    const tokenData = await fetchToken(settings.clientId, settings.clientSecret);
    const cpaToken = tokenData.access_token;

    const cpaUrl = `${AVITO_API}/cpa/v2/balanceInfo`;
    console.log(`[avito:advance] → POST ${cpaUrl}`);
    const resp = await fetch(cpaUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cpaToken}`,
        "Content-Type": "application/json",
        "X-Source": "sfera-master",
      },
      body: '{}',
    });
    const bodyText = await resp.text();
    console.log(`[avito:advance] ← status=${resp.status} body=${bodyText.slice(0, 400)}`);

    if (resp.status === 401 || resp.status === 403) {
      console.log(`[avito:advance] ${resp.status} — unauthorized`);
      return { balanceRub: manualFallback, source: "manual", needsReauth: true };
    }
    if (!resp.ok) {
      console.log(`[avito:advance] error ${resp.status}, using manual fallback=${manualFallback}`);
      return { balanceRub: manualFallback, source: "manual", needsReauth: false };
    }

    let data: any = {};
    try { data = JSON.parse(bodyText); } catch { data = {}; }

    // Response: {"result":{"advance": N, "balance": M, "debt": 0}} — values in KOPECKS
    // balance = текущий CPA баланс (основная метрика для отслеживания)
    // advance = аванс текущего месяца (может быть почти нулевым)
    const result = data?.result ?? data;
    const balanceKop = result?.balance;
    const advanceKop = result?.advance;
    const debtKop = result?.debt;
    console.log(`[avito:advance] balance=${balanceKop} advance=${advanceKop} debt=${debtKop} (kopecks)`);

    if (typeof balanceKop === "number") {
      const balanceRub = Math.round(balanceKop / 100);
      console.log(`[avito:advance] ✅ CPA баланс=${balanceRub}₽`);
      return { balanceRub, source: "cpa", needsReauth: false };
    }

    // no balance field — fallback
    console.log(`[avito:advance] no balance field in response, using manual fallback=${manualFallback}`);
    return { balanceRub: manualFallback, source: "manual", needsReauth: false };
  } catch (e: any) {
    console.log(`[avito:advance] error: ${e.message}`);
    return { balanceRub: manualFallback, source: "manual", needsReauth: false };
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
  const authUrl = `https://avito.ru/oauth?response_type=code&client_id=${encodeURIComponent(client_id)}&scope=messenger:read,messenger:write,user:read,user_balance:read,user_operations:read,items:info,stats:read`;

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

// GET /api/avito/chats — list chats (v2 per official docs)
router.get("/chats", async (req, res) => {
  const token = await getValidToken();
  if (!token) return res.status(403).json({ error: "Авито не подключён" });

  const settings = await getSettings();
  const userId = settings?.avitoUserId;
  if (!userId) return res.status(400).json({ error: "Нет ID пользователя Авито" });

  const limit = Number(req.query.limit) || 100;
  const unreadOnly = req.query.unread_only === "true" ? "&unread_only=true" : "";
  const itemId = req.query.item_id ? `&item_id=${req.query.item_id}` : "";

  try {
    console.log(`[avito:chats] GET /messenger/v2/accounts/${userId}/chats limit=${limit}`);
    const data = await avitoGet(
      `/messenger/v2/accounts/${userId}/chats?limit=${limit}${unreadOnly}${itemId}`,
      token
    ) as any;
    console.log(`[avito:chats] got ${data?.chats?.length ?? 0} chats`);
    res.json(data);
  } catch (e: any) {
    console.error(`[avito:chats] error:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/avito/chats/:chatId/messages (v3 per official docs)
router.get("/chats/:chatId/messages", async (req, res) => {
  const token = await getValidToken();
  if (!token) return res.status(403).json({ error: "Авито не подключён" });

  const settings = await getSettings();
  const userId = settings?.avitoUserId;
  if (!userId) return res.status(400).json({ error: "Нет ID пользователя Авито" });

  const limit = Number(req.query.limit) || 100;
  try {
    console.log(`[avito:messages] GET /messenger/v3/accounts/${userId}/chats/${req.params.chatId}/messages`);
    const data = await avitoGet(
      `/messenger/v3/accounts/${userId}/chats/${req.params.chatId}/messages?limit=${limit}`,
      token
    ) as any;
    console.log(`[avito:messages] got ${data?.messages?.length ?? 0} messages`);
    res.json(data);
  } catch (e: any) {
    console.error(`[avito:messages] error:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/avito/chats/:chatId/reply — отправить сообщение (v1 per official docs)
router.post("/chats/:chatId/reply", async (req, res) => {
  const token = await getValidToken();
  if (!token) return res.status(403).json({ error: "Авито не подключён" });

  const settings = await getSettings();
  const userId = settings?.avitoUserId;
  if (!userId) return res.status(400).json({ error: "Нет ID пользователя Авито" });

  const { text } = req.body as { text: string };
  if (!text?.trim()) return res.status(400).json({ error: "Нужен текст сообщения" });

  try {
    console.log(`[avito:send] POST /messenger/v1/accounts/${userId}/chats/${req.params.chatId}/messages`);
    const data = await avitoPost(
      `/messenger/v1/accounts/${userId}/chats/${req.params.chatId}/messages`,
      token,
      { message: { text }, type: "text" }
    );
    console.log(`[avito:send] sent OK`);
    res.json(data);
  } catch (e: any) {
    console.error(`[avito:send] error:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/avito/chats/:chatId/read — отметить чат прочитанным (v1 per official docs)
router.post("/chats/:chatId/read", async (req, res) => {
  const token = await getValidToken();
  if (!token) return res.status(403).json({ error: "Авито не подключён" });

  const settings = await getSettings();
  const userId = settings?.avitoUserId;
  if (!userId) return res.status(400).json({ error: "Нет ID пользователя Авито" });

  try {
    console.log(`[avito:read] POST /messenger/v1/accounts/${userId}/chats/${req.params.chatId}/read`);
    await avitoPost(
      `/messenger/v1/accounts/${userId}/chats/${req.params.chatId}/read`,
      token,
      {}
    );
    res.json({ ok: true });
  } catch (e: any) {
    console.error(`[avito:read] error:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/avito/advance — аванс (авто из операций или ручной)
router.get("/advance", async (_req, res) => {
  try {
    const settings = await getSettings();
    const manualBalance = settings?.advanceBalance ?? 0;

    const token = await getValidToken();
    if (token && settings?.avitoUserId) {
      const advance = await getAdvanceBalance(token, settings.avitoUserId, manualBalance);
      return res.json({
        advanceBalance: advance.balanceRub,
        source: advance.source,
        needsReauth: advance.needsReauth,
        updatedAt: settings?.advanceBalanceUpdatedAt ?? null,
      });
    }
    res.json({
      advanceBalance: manualBalance,
      source: "manual",
      needsReauth: false,
      updatedAt: settings?.advanceBalanceUpdatedAt ?? null,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/avito/advance — сохранить аванс вручную
router.post("/advance", async (req, res) => {
  try {
    const { amount } = req.body as { amount: number };
    if (typeof amount !== "number" || amount < 0) {
      return res.status(400).json({ error: "amount должен быть неотрицательным числом" });
    }
    await db
      .update(avitoSettingsTable)
      .set({ advanceBalance: Math.round(amount), advanceBalanceUpdatedAt: new Date() });
    res.json({ ok: true, advanceBalance: Math.round(amount) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/avito/balance — баланс кошелька
router.get("/balance", async (_req, res) => {
  const token = await getValidToken();
  if (!token) return res.status(403).json({ error: "Авито не подключён" });

  const settings = await getSettings();
  const userId = settings?.avitoUserId;
  if (!userId) return res.status(400).json({ error: "Нет ID пользователя Авито" });

  try {
    // 1) Standard balance endpoint (returns кошелёк only)
    const balUrl = `${AVITO_API}/core/v1/accounts/${userId}/balance/`;
    console.log(`[avito:balance] → GET ${balUrl}`);
    console.log(`[avito:balance] → Headers: Authorization: Bearer ${token.slice(0, 8)}...${token.slice(-4)}`);

    const balResp = await fetch(balUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const balBodyText = await balResp.text();
    console.log(`[avito:balance] ← status=${balResp.status} body=${balBodyText}`);
    console.log(`[avito:balance] ← response headers: content-type=${balResp.headers.get("content-type")}`);

    let balData: any = null;
    try { balData = JSON.parse(balBodyText); } catch {}

    const walletReal  = balData?.real ?? balData?.result?.real ?? 0;
    const walletBonus = balData?.bonus ?? balData?.result?.bonus ?? 0;

    // Get аванс: try operations history (auto) or fall back to manual DB value
    const manualBalance = settings?.advanceBalance ?? 0;
    const advance = await getAdvanceBalance(token, userId, manualBalance);

    console.log(`[avito:balance] walletReal=${walletReal} advance=${advance.balanceRub} source=${advance.source}`);
    res.json({
      balance: walletReal,
      bonus: walletBonus,
      balanceRub: advance.balanceRub,
      bonusRub: Math.round(walletBonus / 100),
      source: advance.source,
      needsReauth: advance.needsReauth,
      _debug: {
        balUrl,
        balStatus: balResp.status,
        balHeaders: Object.fromEntries(balResp.headers.entries()),
        balBody: balBodyText,
        userId,
        tokenPrefix: `${token.slice(0, 8)}...${token.slice(-4)}`,
      },
    });
  } catch (e: any) {
    console.error(`[avito:balance] error:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/avito/crm-stats — Авито лиды/заказы из CRM
router.get("/crm-stats", async (_req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOf7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOf30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // All Avito leads
    const allLeads = await db.select().from(leadsTable).where(eq(leadsTable.source, "avito"));
    const leadsMonth = allLeads.filter(l => l.createdAt && new Date(l.createdAt) >= startOf30Days).length;
    const leadsWeek  = allLeads.filter(l => l.createdAt && new Date(l.createdAt) >= startOf7Days).length;
    const leadsToday = allLeads.filter(l => {
      if (!l.createdAt) return false;
      const d = new Date(l.createdAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    }).length;

    // Avito lead IDs → joined orders + revenue
    const avitoLeadIds = allLeads.map(l => l.id);
    let ordersTotal = 0, ordersMonth = 0, ordersWeek = 0;
    let revenueTotal = 0, revenueMonth = 0;
    if (avitoLeadIds.length > 0) {
      const orders = await db.select().from(ordersTable).where(inArray(ordersTable.leadId, avitoLeadIds));
      ordersTotal = orders.length;
      ordersMonth = orders.filter(o => o.createdAt && new Date(o.createdAt) >= startOf30Days).length;
      ordersWeek  = orders.filter(o => o.createdAt && new Date(o.createdAt) >= startOf7Days).length;
      // Revenue = sum of orderAmount (stored as numeric string)
      for (const o of orders) {
        const amt = parseFloat(String(o.orderAmount ?? "0")) || 0;
        revenueTotal += amt;
        if (o.createdAt && new Date(o.createdAt) >= startOf30Days) revenueMonth += amt;
      }
    }

    // Аванс Авито — авто из операций (если есть user_operations:read) или ручной из БД
    const settingsForAdvance = await getSettings();
    const manualBalance = settingsForAdvance?.advanceBalance ?? 0;
    const advanceUpdatedAt = settingsForAdvance?.advanceBalanceUpdatedAt ?? null;
    const tokenForAdvance = await getValidToken();
    const userId = settingsForAdvance?.avitoUserId;
    let balanceRub = manualBalance;
    let advanceSource = "manual";
    let advanceNeedsReauth = false;
    if (tokenForAdvance && userId) {
      const adv = await getAdvanceBalance(tokenForAdvance, userId, manualBalance);
      balanceRub = adv.balanceRub;
      advanceSource = adv.source;
      advanceNeedsReauth = adv.needsReauth;
    }

    // Cost metrics: revenue / count (returns 0 if no data)
    const avgOrderAmount   = ordersTotal > 0 ? Math.round(revenueTotal / ordersTotal) : 0;
    // For cost per contact we need total Avito contacts — pass from frontend,
    // or use total leads as proxy (each lead = one contact)
    const costPerLead      = allLeads.length > 0 ? Math.round(revenueTotal / allLeads.length) : 0;

    res.json({
      leads:   { total: allLeads.length, month: leadsMonth, week: leadsWeek, today: leadsToday },
      orders:  { total: ordersTotal, month: ordersMonth, week: ordersWeek },
      revenue: { total: Math.round(revenueTotal), month: Math.round(revenueMonth), avgOrder: avgOrderAmount },
      costPerLead,
      balanceRub,
      advanceSource,
      advanceNeedsReauth,
      advanceUpdatedAt,
    });
  } catch (e: any) {
    console.error("[avito:crm-stats] error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/avito/analytics — сводная аналитика (расходы, по городам, по категориям)
router.get("/analytics", async (_req, res) => {
  try {
    const token = await getValidToken();
    const settings = await getSettings();
    const userId = settings?.avitoUserId;

    // 1. Balance
    const manualBalance = settings?.advanceBalance ?? 0;
    let balanceData: { balanceRub: number; source: string; needsReauth: boolean } = { balanceRub: manualBalance, source: "manual", needsReauth: false };
    if (token && userId) {
      balanceData = await getAdvanceBalance(token, userId, manualBalance);
    }

    // 2. Spending — try Avito operations API
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const yesterday = new Date(now.getTime() - 86400000);
    const yesterdayStr = yesterday.toISOString().split("T")[0];
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStartStr = monthStart.toISOString().split("T")[0];
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthStartStr = prevMonthStart.toISOString().split("T")[0];
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const prevMonthEndStr = prevMonthEnd.toISOString().split("T")[0];
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

    let spending: {
      today: number; yesterday: number;
      month: number; prevMonth: number;
      daily: { date: string; amount: number }[];
      available: boolean;
    } = { today: 0, yesterday: 0, month: 0, prevMonth: 0, daily: [], available: false };

    // POST /stats/v2/accounts/{user_id}/spendings
    // Работает с ClientCredentials без OAuth. Возвращает расходы в рублях (float).
    // Лимит: 1 запрос в минуту — у нас кэш 60 сек на фронте, всё ок.
    if (token && userId) {
      try {
        const dateFrom = thirtyDaysAgo.toISOString().split("T")[0];
        const spendUrl = `${AVITO_API}/stats/v2/accounts/${userId}/spendings`;
        const spendBody = {
          dateFrom,
          dateTo: todayStr,
          spendingTypes: ["all"],
          grouping: "day",
        };
        console.log(`[avito:analytics] → POST ${spendUrl} body=${JSON.stringify(spendBody)}`);
        const spendResp = await fetch(spendUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(spendBody),
        });
        console.log(`[avito:analytics] ← spendings status=${spendResp.status}`);
        if (spendResp.ok) {
          const spendData = await spendResp.json() as any;
          const groupings: any[] = spendData?.result?.groupings ?? [];
          console.log(`[avito:analytics] spendings groupings=${groupings.length}, sample=${JSON.stringify(groupings[0] ?? null)}`);
          for (const g of groupings) {
            const dateStr: string = g.date ?? "";
            if (!dateStr) continue;
            // value — рубли (float). Пробуем slug "all", если нет — суммируем все типы
            const spendings: any[] = g.spendings ?? [];
            const allEntry = spendings.find((s: any) => s.slug === "all");
            const amountRub = allEntry
              ? (typeof allEntry.value === "number" ? allEntry.value : 0)
              : spendings.reduce((sum: number, s: any) => sum + (typeof s.value === "number" ? s.value : 0), 0);
            spending.daily.push({ date: dateStr, amount: Math.round(amountRub) });
            if (dateStr === todayStr) spending.today += amountRub;
            if (dateStr === yesterdayStr) spending.yesterday += amountRub;
            if (dateStr >= monthStartStr) spending.month += amountRub;
            if (dateStr >= prevMonthStartStr && dateStr <= prevMonthEndStr) spending.prevMonth += amountRub;
          }
          spending.daily.sort((a, b) => a.date.localeCompare(b.date));
          spending.available = true;
          spending.today = Math.round(spending.today);
          spending.yesterday = Math.round(spending.yesterday);
          spending.month = Math.round(spending.month);
          spending.prevMonth = Math.round(spending.prevMonth);
          console.log(`[avito:analytics] spending today=${spending.today} month=${spending.month} days=${groupings.length}`);
        } else {
          const errText = await spendResp.text();
          console.warn(`[avito:analytics] spendings ${spendResp.status}: ${errText.slice(0, 400)}`);
        }
      } catch (e: any) {
        console.warn(`[avito:analytics] spending error: ${e.message}`);
      }
    } else {
      console.log(`[avito:analytics] skip spending — token=${!!token} userId=${userId}`);
    }

    // 3. CRM by city and category
    const SERVICE_CATEGORIES = ["Обои", "Шпаклёвка", "Покраска", "Плитка", "Санузел под ключ", "Ремонт под ключ"];
    const allLeads = await db.select().from(leadsTable).where(eq(leadsTable.source, "avito"));
    const avitoLeadIds = allLeads.map(l => l.id);
    let allOrders: (typeof ordersTable.$inferSelect)[] = [];
    if (avitoLeadIds.length > 0) {
      allOrders = await db.select().from(ordersTable).where(inArray(ordersTable.leadId, avitoLeadIds));
    }

    type CrmGroup = { leads: number; orders: number; revenue: number };
    const cityMap: Record<string, CrmGroup> = {};
    const categoryMap: Record<string, CrmGroup> = {};
    const itemMap: Record<string, CrmGroup> = {};

    for (const lead of allLeads) {
      const city = lead.city || "Не указан";
      if (!cityMap[city]) cityMap[city] = { leads: 0, orders: 0, revenue: 0 };
      cityMap[city].leads++;

      let category = "Другое";
      for (const cat of SERVICE_CATEGORIES) {
        if (lead.serviceType?.toLowerCase().includes(cat.toLowerCase())) { category = cat; break; }
      }
      if (!categoryMap[category]) categoryMap[category] = { leads: 0, orders: 0, revenue: 0 };
      categoryMap[category].leads++;

      if (lead.avitoItemId) {
        if (!itemMap[lead.avitoItemId]) itemMap[lead.avitoItemId] = { leads: 0, orders: 0, revenue: 0 };
        itemMap[lead.avitoItemId].leads++;
      }
    }

    for (const order of allOrders) {
      const lead = allLeads.find(l => l.id === order.leadId);
      const city = lead?.city || "Не указан";
      if (!cityMap[city]) cityMap[city] = { leads: 0, orders: 0, revenue: 0 };
      cityMap[city].orders++;
      cityMap[city].revenue += parseFloat(String(order.orderAmount ?? "0")) || 0;

      let category = "Другое";
      for (const cat of SERVICE_CATEGORIES) {
        if (lead?.serviceType?.toLowerCase().includes(cat.toLowerCase())) { category = cat; break; }
      }
      if (!categoryMap[category]) categoryMap[category] = { leads: 0, orders: 0, revenue: 0 };
      categoryMap[category].orders++;
      categoryMap[category].revenue += parseFloat(String(order.orderAmount ?? "0")) || 0;

      if (lead?.avitoItemId) {
        if (!itemMap[lead.avitoItemId]) itemMap[lead.avitoItemId] = { leads: 0, orders: 0, revenue: 0 };
        itemMap[lead.avitoItemId].orders++;
        itemMap[lead.avitoItemId].revenue += parseFloat(String(order.orderAmount ?? "0")) || 0;
      }
    }

    res.json({
      balance: balanceData,
      spending,
      crmByCity: Object.entries(cityMap).map(([city, d]) => ({
        city, leads: d.leads, orders: d.orders, revenue: Math.round(d.revenue),
      })),
      crmByCategory: Object.entries(categoryMap).map(([category, d]) => ({
        category, leads: d.leads, orders: d.orders, revenue: Math.round(d.revenue),
      })),
      crmByItem: Object.entries(itemMap).map(([itemId, d]) => ({
        itemId, leads: d.leads, orders: d.orders, revenue: Math.round(d.revenue),
      })),
    });
  } catch (e: any) {
    console.error("[avito:analytics] error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/avito/unread-count — количество непрочитанных чатов
router.get("/unread-count", async (_req, res) => {
  const token = await getValidToken();
  if (!token) return res.json({ count: 0 });

  const settings = await getSettings();
  const userId = settings?.avitoUserId;
  if (!userId) return res.json({ count: 0 });

  try {
    const data = await avitoGet(
      `/messenger/v2/accounts/${userId}/chats?limit=100&unread_only=true`,
      token
    ) as any;
    const count = data?.chats?.length ?? 0;
    res.json({ count });
  } catch {
    res.json({ count: 0 });
  }
});

// GET /api/avito/quick-replies — получить быстрые ответы
router.get("/quick-replies", async (_req, res) => {
  try {
    const [row] = await db.select().from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "avito_quick_replies"));
    const replies = row ? JSON.parse(row.value) : getDefaultQuickReplies();
    res.json({ replies });
  } catch {
    res.json({ replies: getDefaultQuickReplies() });
  }
});

// PUT /api/avito/quick-replies — сохранить быстрые ответы
router.put("/quick-replies", async (req, res) => {
  const { replies } = req.body as { replies: Array<{ id: string; label: string; text: string }> };
  if (!Array.isArray(replies)) return res.status(400).json({ error: "replies must be array" });
  try {
    await db.insert(systemSettingsTable)
      .values({ key: "avito_quick_replies", value: JSON.stringify(replies) })
      .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: JSON.stringify(replies) } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

function getDefaultQuickReplies() {
  return [
    {
      id: "prices",
      label: "Цены",
      text: "Здравствуйте!\nОбои от 300₽/м²\nШпаклёвка от 350₽/м²\nПокраска от 200₽/м²\nПлитка от 1200₽/м²\n\nПодскажите:\n1. Какой район?\n2. Примерная площадь?\n3. Когда хотите начать?"
    },
    {
      id: "master",
      label: "Мастер",
      text: "Отлично! Сейчас подберу мастера из вашего района.\nОн свяжется с вами в течение часа.\nСкиньте номер для связи 👍"
    },
    {
      id: "warranty",
      label: "Гарантия",
      text: "После работы выдаём гарантийный сертификат на 2 года.\nЕсли что-то отклеится — переделаем бесплатно 👍"
    },
    {
      id: "brigade",
      label: "Бригада",
      text: "Да, мы частная бригада, работаем по районам.\nЦены одинаковые.\nКто ближе — тот и выезжает."
    },
  ];
}

// POST /api/avito/leads — создать заявку из чата
router.post("/leads", async (req, res) => {
  const { chatId, clientName, clientPhone, itemTitle, itemId: bodyItemId, city, serviceType, district, area, comment } = req.body as {
    chatId: string;
    clientName?: string;
    clientPhone?: string;
    itemTitle?: string;
    itemId?: string | number;
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
    avitoItemId: bodyItemId ? String(bodyItemId) : null,
    avitoItemTitle: itemTitle || null,
  }).returning();

  res.json({ ok: true, leadId: lead.id });
});

// GET /api/avito/items/:itemId/daily-stats — суточная статистика объявления за 30 дней
router.get("/items/:itemId/daily-stats", async (req, res) => {
  const token = await getValidToken();
  if (!token) return res.status(403).json({ error: "Авито не подключён" });

  const settings = await getSettings();
  const userId = settings?.avitoUserId;
  if (!userId) return res.status(400).json({ error: "Нет ID пользователя" });

  const itemId = parseInt(req.params.itemId);
  if (!itemId) return res.status(400).json({ error: "Нужен itemId" });

  const now = new Date();
  const dateFrom = new Date(now.getTime() - 30 * 86400000).toISOString().split("T")[0];
  const dateTo = now.toISOString().split("T")[0];

  try {
    // Try stats/v1 — returns aggregate for period per item
    // We also try getting day/week/month by calling three separate periods
    const [monthData, weekData, todayData] = await Promise.all([
      avitoPost(`/stats/v1/accounts/${userId}/items`, token, {
        dateFrom,
        dateTo,
        fields: ["uniqViews", "uniqContacts", "uniqFavorites"],
        itemIds: [itemId],
      }).catch(() => null),
      avitoPost(`/stats/v1/accounts/${userId}/items`, token, {
        dateFrom: new Date(now.getTime() - 7 * 86400000).toISOString().split("T")[0],
        dateTo,
        fields: ["uniqViews", "uniqContacts", "uniqFavorites"],
        itemIds: [itemId],
      }).catch(() => null),
      avitoPost(`/stats/v1/accounts/${userId}/items`, token, {
        dateFrom: dateTo,
        dateTo,
        fields: ["uniqViews", "uniqContacts", "uniqFavorites"],
        itemIds: [itemId],
      }).catch(() => null),
    ]);

    // Real Avito Stats API v1 format:
    // { result: { items: [ { itemId, stats: [{date, uniqViews, uniqContacts, uniqFavorites}, ...] } ] } }
    function extractStats(data: any) {
      const items: any[] = data?.result?.items ?? [];
      const daily: { date: string; uniqViews: number; uniqContacts: number; uniqFavorites: number }[] =
        Array.isArray(items[0]?.stats) ? items[0].stats : [];
      const sum = (key: string) => daily.reduce((acc, d) => acc + (Number((d as any)[key]) || 0), 0);
      return {
        views: sum("uniqViews"),
        contacts: sum("uniqContacts"),
        favorites: sum("uniqFavorites"),
        daily,
      };
    }

    const monthResult = extractStats(monthData);
    const weekResult = extractStats(weekData);
    const todayResult = extractStats(todayData);

    res.json({
      today: { views: todayResult.views, contacts: todayResult.contacts, favorites: todayResult.favorites },
      week: { views: weekResult.views, contacts: weekResult.contacts, favorites: weekResult.favorites },
      month: { views: monthResult.views, contacts: monthResult.contacts, favorites: monthResult.favorites },
      daily: monthResult.daily.map(d => ({ date: d.date, views: d.uniqViews, contacts: d.uniqContacts })),
      dateFrom,
      dateTo,
    });
  } catch (e: any) {
    console.error(`[avito:daily-stats] error:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/avito/items/:itemId/toggle — включить / выключить объявление
router.post("/items/:itemId/toggle", async (req, res) => {
  const token = await getValidToken();
  if (!token) return res.status(403).json({ error: "Авито не подключён" });

  const settings = await getSettings();
  const userId = settings?.avitoUserId;
  if (!userId) return res.status(400).json({ error: "Нет ID пользователя" });

  const itemId = req.params.itemId;
  const { action } = req.body as { action: "activate" | "deactivate" };
  if (!action) return res.status(400).json({ error: "Нужен action: activate | deactivate" });

  try {
    // Avito API: PUT /core/v1/accounts/{userId}/items/{itemId}/status/
    // body: { action: "activate" | "close" }
    // Requires items:write scope
    const url = `${AVITO_API}/core/v1/accounts/${userId}/items/${itemId}/status/`;
    const body = { action: action === "activate" ? "activate" : "close" };
    const resp = await fetch(url, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    console.log(`[avito:toggle] ${action} item ${itemId} → ${resp.status}: ${text.slice(0, 200)}`);

    if (resp.status === 403 || resp.status === 401) {
      return res.status(403).json({
        error: "Нет прав на управление объявлениями. Требуется область доступа items:write.",
        hint: "open_avito",
      });
    }
    if (!resp.ok) {
      return res.status(resp.status).json({ error: `Авито API ${resp.status}: ${text.slice(0, 200)}` });
    }

    res.json({ ok: true, action, itemId });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
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
    console.log(`[avito:stats] POST /stats/v1/accounts/${userId}/items itemIds=[${itemIds.slice(0,5).join(",")}...] dateFrom=${dateFrom} dateTo=${dateTo}`);
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
    console.log(`[avito:stats] response keys:`, Object.keys(data ?? {}));

    // Normalize: fields can be { uniqViews: { value: N } } or { uniqViews: N }
    const normalized = (data.result?.items ?? []).map((s: any) => {
      const f = s.fields ?? {};
      return {
        itemId: s.itemId,
        fields: {
          uniqViews:    typeof f.uniqViews    === "object" ? (f.uniqViews?.value    ?? 0) : (f.uniqViews    ?? 0),
          uniqContacts: typeof f.uniqContacts === "object" ? (f.uniqContacts?.value ?? 0) : (f.uniqContacts ?? 0),
          uniqFavorites:typeof f.uniqFavorites=== "object" ? (f.uniqFavorites?.value?? 0) : (f.uniqFavorites?? 0),
        },
      };
    });
    res.json({ result: { items: normalized } });
  } catch (e: any) {
    console.error(`[avito:stats] FAILED:`, e.message);
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
  let statsError: string | null = null;
  if (items.length > 0) {
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    try {
      console.log(`[avito:items-with-stats] fetching stats for ${items.length} items (userId=${resolvedUid})`);
      const statsData = await avitoPost(
        `/stats/v1/accounts/${resolvedUid}/items`,
        token,
        {
          dateFrom: from.toISOString().split("T")[0],
          dateTo: now.toISOString().split("T")[0],
          fields: ["uniqViews", "uniqContacts", "uniqFavorites"],
          itemIds: items.map((i: any) => Number(i.id)),
        }
      ) as any;
      console.log(`[avito:items-with-stats] stats response keys:`, Object.keys(statsData ?? {}));
      // REAL Avito Stats API v1 format:
      // { result: { items: [ { itemId, stats: [ {date, uniqViews, uniqContacts, uniqFavorites}, ... ] } ] } }
      // stats is a FLAT ARRAY of daily records — NOT a "fields" object!
      const statItems: any[] = statsData.result?.items ?? [];
      console.log(`[avito:items-with-stats] raw item count=${statItems.length}`);
      if (statItems[0]) {
        console.log(`[avito:items-with-stats] SAMPLE:`, JSON.stringify(statItems[0]).slice(0, 400));
      }
      for (const s of statItems) {
        // s.stats is array of { date: "YYYY-MM-DD", uniqViews: N, uniqContacts: N, uniqFavorites: N }
        type DayStats = { date: string; uniqViews: number; uniqContacts: number; uniqFavorites: number };
        const daily: DayStats[] = Array.isArray(s.stats) ? s.stats : [];
        // sort ascending so slice(-N) gives last N days
        daily.sort((a, b) => a.date.localeCompare(b.date));
        const sum = (key: keyof DayStats, arr: DayStats[]) =>
          arr.reduce((acc, d) => acc + (Number(d[key]) || 0), 0);
        const viewsMonth    = sum("uniqViews",    daily);
        const contactsMonth = sum("uniqContacts", daily);
        const favsMonth     = sum("uniqFavorites",daily);
        const viewsWeek     = sum("uniqViews",    daily.slice(-7));
        const viewsDay      = sum("uniqViews",    daily.slice(-1));
        const contactsWeek  = sum("uniqContacts", daily.slice(-7));
        const contactsDay   = sum("uniqContacts", daily.slice(-1));
        const favsWeek      = sum("uniqFavorites",daily.slice(-7));
        statsMap[s.itemId] = {
          uniqViews:     viewsMonth,
          uniqContacts:  contactsMonth,
          uniqFavorites: favsMonth,
          viewsDay, viewsWeek, viewsMonth,
          contactsDay, contactsWeek, contactsMonth,
          favsDay: sum("uniqFavorites", daily.slice(-1)),
          favsWeek, favsMonth,
          // raw daily for charts
          daily: daily.slice(-30),
        };
        console.log(`[avito:items-with-stats] itemId=${s.itemId} viewsM=${viewsMonth} contactsM=${contactsMonth} favM=${favsMonth} | viewsW=${viewsWeek} contactsW=${contactsWeek} | viewsD=${viewsDay} contactsD=${contactsDay}`);
      }
      console.log(`[avito:items-with-stats] parsed stats for ${Object.keys(statsMap).length} items`);
    } catch (e: any) {
      // Stats are optional — items still shown without stats, but log the error
      console.error(`[avito:items-with-stats] stats fetch FAILED:`, e.message);
      statsError = e.message;
    }
  }

  // 3. Merge stats into items
  const enriched = items.map((item: any) => ({
    ...item,
    stats: statsMap[item.id] ?? { uniqViews: 0, uniqContacts: 0, uniqFavorites: 0 },
  }));

  res.json({ resources: enriched, meta, statsError });
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
      `/core/v1/items?per_page=100`,
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

// ══════════════════════════════════════════════════════════════════════════════
// РАСПИСАНИЕ ОБЪЯВЛЕНИЙ — вкл. 08:00 МСК, выкл. 20:00 МСК
// Экспортируется для вызова из index.ts по расписанию
// ══════════════════════════════════════════════════════════════════════════════

export async function runAvitoSchedule(action: "activate" | "deactivate") {
  try {
    const token = await getValidToken();
    if (!token) {
      console.log("[avito:schedule] No valid token — skipping");
      return { ok: false, error: "Нет токена Авито", results: [] };
    }

    const settings = await getSettings();
    const userId = settings?.avitoUserId;
    if (!userId) {
      console.log("[avito:schedule] No userId — skipping");
      return { ok: false, error: "Нет ID пользователя Авито", results: [] };
    }

    // Читаем список объявлений из БД
    const rows = await db.select().from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "avito_item_schedules"));
    let items: Array<{ itemId: string; title: string; enabled: boolean }> = [];
    try { items = JSON.parse(rows[0]?.value ?? "[]"); } catch {}

    const enabled = items.filter(i => i.enabled);
    if (enabled.length === 0) {
      console.log("[avito:schedule] No enabled items to toggle");
      return { ok: true, results: [] };
    }

    const apiAction = action === "activate" ? "activate" : "close";
    const results: { itemId: string; title: string; ok: boolean; error?: string }[] = [];

    for (const item of enabled) {
      try {
        // Correct Avito API endpoint: PUT /core/v1/accounts/{userId}/items/{itemId}/status/
        // body: { action: "activate" | "close" }  — requires items:write scope
        const url = `${AVITO_API}/core/v1/accounts/${userId}/items/${item.itemId}/status/`;
        const resp = await fetch(url, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ action: apiAction }),
        });
        const text = await resp.text();
        console.log(`[avito:schedule] ${action} item ${item.itemId} → ${resp.status}: ${text.slice(0, 120)}`);

        if (resp.status === 403 || resp.status === 401) {
          results.push({
            itemId: item.itemId, title: item.title, ok: false,
            error: "Нет прав. Нужна повторная авторизация с разрешением items:write в Авито.",
          });
        } else {
          results.push({
            itemId: item.itemId, title: item.title, ok: resp.ok,
            error: resp.ok ? undefined : `Авито ${resp.status}: ${text.slice(0, 100)}`,
          });
        }
      } catch (e: any) {
        results.push({ itemId: item.itemId, title: item.title, ok: false, error: e.message });
        console.error(`[avito:schedule] item ${item.itemId} error:`, e.message);
      }
    }

    // Сохраняем лог последнего запуска
    const log = { action, ts: new Date().toISOString(), results };
    await db.insert(systemSettingsTable)
      .values({ key: "avito_schedule_log", value: JSON.stringify(log) })
      .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: JSON.stringify(log), updatedAt: new Date() } });

    const okCount = results.filter(r => r.ok).length;
    console.log(`[avito:schedule] ${action} complete: ${okCount}/${results.length} ok`);
    return { ok: true, results };
  } catch (e: any) {
    console.error("[avito:schedule] unexpected error:", e.message);
    return { ok: false, error: e.message, results: [] };
  }
}

// GET /api/avito/schedules — список объявлений в расписании + лог
router.get("/schedules", async (_req, res) => {
  try {
    const rows = await db.select().from(systemSettingsTable)
      .where(inArray(systemSettingsTable.key, ["avito_item_schedules", "avito_schedule_log"]));
    const getVal = (k: string) => rows.find(r => r.key === k)?.value ?? null;

    let items: any[] = [];
    try { items = JSON.parse(getVal("avito_item_schedules") ?? "[]"); } catch {}
    let lastLog: any = null;
    try { lastLog = JSON.parse(getVal("avito_schedule_log") ?? "null"); } catch {}

    res.json({ items, lastLog });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/avito/schedules — добавить / обновить объявление в расписании
router.post("/schedules", async (req, res) => {
  const { itemId, title, enabled = true } = req.body as { itemId: string | number; title?: string; enabled?: boolean };
  if (!itemId) return res.status(400).json({ error: "Нужен itemId" });

  try {
    const rows = await db.select().from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "avito_item_schedules"));
    let items: any[] = [];
    try { items = JSON.parse(rows[0]?.value ?? "[]"); } catch {}

    const strId = String(itemId);
    const idx = items.findIndex((i: any) => i.itemId === strId);
    if (idx >= 0) {
      items[idx] = { ...items[idx], title: title ?? items[idx].title, enabled };
    } else {
      items.push({ itemId: strId, title: title ?? "Объявление", enabled });
    }

    await db.insert(systemSettingsTable)
      .values({ key: "avito_item_schedules", value: JSON.stringify(items) })
      .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: JSON.stringify(items), updatedAt: new Date() } });

    console.log(`[avito:schedules] ${enabled ? "Added" : "Disabled"} item ${strId} — ${title}`);
    res.json({ ok: true, items });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/avito/schedules/:itemId — убрать из расписания
router.delete("/schedules/:itemId", async (req, res) => {
  const { itemId } = req.params;
  try {
    const rows = await db.select().from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "avito_item_schedules"));
    let items: any[] = [];
    try { items = JSON.parse(rows[0]?.value ?? "[]"); } catch {}

    items = items.filter((i: any) => i.itemId !== itemId);

    await db.insert(systemSettingsTable)
      .values({ key: "avito_item_schedules", value: JSON.stringify(items) })
      .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: JSON.stringify(items), updatedAt: new Date() } });

    console.log(`[avito:schedules] Removed item ${itemId}`);
    res.json({ ok: true, items });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/avito/schedules/run — ручной запуск для теста
router.post("/schedules/run", async (req, res) => {
  const { action } = req.body as { action: "activate" | "deactivate" };
  if (!action) return res.status(400).json({ error: "Нужен action: activate | deactivate" });
  const result = await runAvitoSchedule(action);
  res.json(result);
});

export default router;
