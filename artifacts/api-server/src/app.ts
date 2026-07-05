import express, { type Express } from "express";
import cors from "cors";
import compression from "compression";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import cookieParser from "cookie-parser";
import router from "./routes/index.js";
import partnerPwaRouter from "./routes/partner-pwa.js";
import crmPartnersRouter from "./routes/crm-partners.js";
import masterPwaRouter from "./routes/master-pwa.js";
import dizajnShowcaseRouter from "./routes/admin/dizajnShowcase.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import multer from "multer";
import { UPLOAD_BASE } from "./config.js";
import { ObjectStorageService } from "./lib/objectStorage.js";

import { handleMaxUpdate, registerWebhook, sendMaxMessage, sendMaxWithButtons } from "./maxBot.js";
import { handleManagerUpdate, registerManagerWebhook, notifyManagerReceiptPaid } from "./managerBot.js";
import { errorLoggerMiddleware } from "./middlewares/errorLogger.js";
import { anonIdMiddleware } from "./middlewares/anonIdMiddleware.js";
import { PROTECTED_NOINDEX_PATTERNS } from "./lib/communitySeo.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

function getAllowedOrigins(): string[] {
  const raw = [
    process.env.CRM_ORIGIN,
    process.env.CRM_URL,
    process.env.PUBLIC_CRM_URL,
    process.env.CRM_PUBLIC_URL,
    // Web_Facade (marketplace) origin — the community register/login forms POST
    // here with `credentials: "include"`, so the facade's origin MUST be an
    // allowed CORS origin for the `connect.sid` cookie to be set/sent
    // (community-phone-registration, Requirement 8.5). Cross-origin credentialed
    // cookies additionally require the session cookie's `SameSite=None; Secure`
    // (configured below). `MARKETPLACE_PUBLIC_URL` is the variable actually set
    // on this service in production (= https://chestnye-mastera.ru); the others
    // are accepted as aliases for flexibility.
    process.env.MARKETPLACE_PUBLIC_URL,
    process.env.MARKETPLACE_ORIGIN,
    process.env.MARKETPLACE_URL,
    process.env.PUBLIC_MARKETPLACE_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim().replace(/\/+$/, ""));

  const defaults = [
    "https://sfera-master.ru",
    "https://www.sfera-master.ru",
    // Marketplace Web_Facade custom domain (community forms live here). Hardcoded
    // alongside the API's own domains so cross-origin credentialed auth works
    // even if the env var above is ever unset.
    "https://chestnye-mastera.ru",
    "https://www.chestnye-mastera.ru",
  ];

  return Array.from(new Set([...raw, ...defaults]));
}

const screenshotUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Только изображения"));
  },
});

const _objectStorageService = new ObjectStorageService();

/** Convert file buffer to base64 data URI — stored directly in DB (like passport photos) */
function bufferToDataUri(buffer: Buffer, mimetype: string): string {
  return `data:${mimetype};base64,${buffer.toString("base64")}`;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

// Trust reverse proxy headers (X-Forwarded-Proto, X-Forwarded-Host) so that
// secure cookies work correctly behind Railway's proxy.
app.set("trust proxy", 1);

// ── Response compression ──────────────────────────────────────────────────────
// JSON responses (esp. /api/masters and /api/orders/stuck) compress to
// 5-15% of their original size with gzip. Without this, a 600 KB response
// can take 10+ seconds to download to a client on a slow link, since most
// of the payload is repetitive JSON keys. Apply BEFORE any other middleware
// so it covers the entire response surface.
app.use(compression({
  // Compress everything > 1 KB (default is 1024 bytes, which we keep)
  threshold: 1024,
  // Default level 6 is a good speed/ratio tradeoff; bump to 4 for less CPU
  // since most responses are JSON which compresses well at any level.
  level: 4,
}));

// ── Security headers ──────────────────────────────────────────────────────────
// CRM, master-pwa and partner-pwa are served from this same Express instance
// (see app.use("/crm", express.static(...)) further down). They need to load:
//   • images from API/uploads/banners (same origin) and external CDNs (data:, blob:, https:)
//   • fonts from Google Fonts
//   • inline styles & scripts (Vite + React class-names)
//   • SSE/WebSocket connections (work-board live stream)
//   • service workers (PWA install)
// We set a permissive-but-explicit CSP so that anything proxying these
// responses (CDN, Railway edge, etc.) doesn't fall back to a strict default
// like default-src 'none'.
app.use((_req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "img-src 'self' data: blob: https:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "connect-src 'self' https: wss: ws:",
      "manifest-src 'self'",
      "worker-src 'self' blob:",
      "frame-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// Redirect www to canonical non-www domain
app.use((req, res, next) => {
  const host = req.hostname ?? "";
  if (host === "www.sfera-master.ru") {
    return res.redirect(301, "https://sfera-master.ru" + req.url);
  }
  next();
});

const allowedOrigins = getAllowedOrigins();
console.log('[cors] Allowed origins:', allowedOrigins);

app.use(cors({
  origin: (origin, callback) => {
    console.log(`[cors] Checking origin: ${origin}`);
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.log(`[cors] BLOCKED origin: ${origin}`);
    return callback(new Error(`Origin not allowed: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Anonymous ID cookie middleware ────────────────────────────────────────────
// Reads / issues `kiro_anon_id` cookie so that any downstream handler under
// `/api/marketplace/dizajn` can rely on `req.anonId` without parsing cookies
// itself. Must run after `cookieParser()` (so `req.cookies` is populated) and
// before `app.use("/api", router)` (so the API routes see the value).
// Implements requirement 4.2 of the AI_Design_Product spec.
app.use(anonIdMiddleware);

// Log all requests
app.use((req, res, next) => {
  console.log(`[request] ${req.method} ${req.path} - Origin: ${req.headers.origin || 'none'}`);
  next();
});

// ── robots.txt for sfera-master.ru ────────────────────────────────────────────
// Internal SPAs (CRM, master-pwa, partner) and API are blocked from indexing.
// Public master-recruitment landings (/, /master-landing/*, /masteram, /partners,
// /r/:slug) remain crawlable. Sitemap is intentionally not advertised here —
// it will live on the future marketplace domain (chestnye-mastera.ru).
// Must be registered BEFORE the noindex middleware so the robots.txt response
// itself is not tagged with X-Robots-Tag: noindex.
app.get("/robots.txt", (_req, res) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send([
    "User-agent: *",
    "Disallow: /crm",
    "Disallow: /crm/",
    "Disallow: /master-pwa",
    "Disallow: /master-pwa/",
    "Disallow: /partner",
    "Disallow: /partner/",
    "Disallow: /api",
    "Disallow: /api/",
    "Disallow: /receipt",
    "Disallow: /receipt/",
    "Disallow: /smeta",
    "Disallow: /smeta/",
    "Disallow: /my-orders",
    "Disallow: /support",
    "Disallow: /zayavka",
    "Disallow: /zayavka/",
    // PRO_Protected_Layer (hochu-takzhe-community): verified-only sensitive
    // content must never be indexed (Requirement 7.2/7.3). Only the /protected
    // suffix is disallowed so public Sosedi and PRO_Public paths stay crawlable.
    // These are already covered by the /api block above but are listed
    // explicitly for clarity and forward-compatibility with the facade paths
    // once the protected URL scheme is finalised in the community routes.
    "Disallow: /api/community/pro/protected",
    "Disallow: /api/community/pro/protected/",
    "Disallow: /marketplace/pro/*/protected",
    "Disallow: /pro/*/protected",
    "Allow: /",
    "",
    "Host: sfera-master.ru",
    "",
  ].join("\n"));
});

// ── X-Robots-Tag noindex for internal SPAs and API ────────────────────────────
// Defence-in-depth on top of robots.txt: even if a crawler ignores robots.txt,
// the HTTP header tells it not to index the response. Applied path-prefix-based
// so /partners (recruitment landing) and / (root landing) stay indexable.
const NOINDEX_PATH_PATTERNS: RegExp[] = [
  /^\/crm(\/|$)/,
  /^\/master-pwa(\/|$)/,
  /^\/partner(\/|$)/,        // matches /partner and /partner/ but NOT /partners
  /^\/api(\/|$)/,
  /^\/receipt(\/|$)/,
  /^\/smeta(\/|$)/,
  /^\/my-orders(\/|$)/,
  /^\/support(\/|$)/,
  /^\/zayavka(\/|$)/,
  // ── PRO_Protected_Layer (hochu-takzhe-community) ────────────────────────────
  // Requirement 7.2/7.3: every PRO_Protected_Layer response (verified-only
  // sensitive content: client black-lists, PII, object disputes) must always
  // emit X-Robots-Tag: noindex and be excluded from the sitemap. Only the
  // `/protected` segment is tagged so public Sosedi (indexable) and
  // PRO_Public_Layer (indexable) paths remain crawlable — existing public
  // patterns are untouched.
  //
  // These patterns live in `src/lib/communitySeo.ts` as the single source of
  // truth (also consumed by the community routes / sitemap generator and the
  // Property 4 test) so the noindex guarantee can never diverge between the
  // middleware and the community layer.
  ...PROTECTED_NOINDEX_PATTERNS,
];
app.use((req, res, next) => {
  if (NOINDEX_PATH_PATTERNS.some((rx) => rx.test(req.path))) {
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  next();
});

async function getDatabaseStatus(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

async function buildHealthResponse() {
  const databaseOk = await getDatabaseStatus();
  return {
    ok: true,
    service: "api-server",
    time: new Date().toISOString(),
    database: databaseOk ? "connected" : "error",
  };
}

app.get("/health", async (_req, res) => {
  res.json(await buildHealthResponse());
});

app.get("/api/health", async (_req, res) => {
  res.json(await buildHealthResponse());
});

app.get("/api/system-status", async (_req, res) => {
  const database = await getDatabaseStatus();
  const maxBotToken = !!process.env.MAX_BOT_TOKEN;
  const managerBotToken = !!process.env.MANAGER_BOT_TOKEN;
  const openAiKey = !!process.env.OPENAI_API_KEY;
  const avitoConfigured = !!(process.env.AVITO_TOKEN || process.env.AVITO_ACCESS_TOKEN || process.env.AVITO_CLIENT_ID || process.env.AVITO_CLIENT_SECRET);
  res.json({ database, maxBotToken, managerBotToken, openAiKey, avitoConfigured });
});

const PgSession = connectPgSimple(session);

const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error(
    "FATAL: SESSION_SECRET is not set or is shorter than 32 characters. " +
    "Set a strong random string in the environment variable SESSION_SECRET."
  );
}

const sessionMiddleware = session({
  store: new PgSession({
    pool: pgPool,
    createTableIfMissing: true,
    tableName: "sessions",
  }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 24 * 60 * 60 * 1000, // 1 day
    domain: undefined, // Let browser set domain automatically
  },
});

app.use(sessionMiddleware);

// ── Redirect old /receipt/:token links to new /api/receipt/:token ─────────────
app.get("/receipt/:token", (req, res) => {
  res.redirect(301, `/api/receipt/${req.params.token}`);
});
app.post("/receipt/:token/confirm", (req, res) => {
  res.redirect(308, `/api/receipt/${req.params.token}/confirm`);
});

// ── JSON data endpoint for the client React app ─────────────────────────────
app.get("/api/receipt/:token/data", async (req, res) => {
  try {
    const { receiptsTable, mastersTable } = await import("@workspace/db");
    const { db } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const [receipt] = await db.select().from(receiptsTable).where(eq(receiptsTable.token, req.params.token));
    if (!receipt) return res.status(404).json({ error: "not_found" });
    const [master] = await db.select().from(mastersTable).where(eq(mastersTable.id, receipt.masterId));
    const masterName = master?.contractFullName || master?.alias || "Мастер";
    const masterPhone = master?.phone || "";
    return res.json({
      id: receipt.id,
      token: receipt.token,
      clientName: receipt.clientName,
      clientPhone: receipt.clientPhone,
      city: receipt.city,
      district: receipt.district,
      serviceType: receipt.serviceType,
      prepaymentAmount: Number(receipt.prepaymentAmount),
      totalAmount: Number(receipt.totalAmount),
      lineItems: receipt.lineItems ?? [],
      notes: receipt.notes,
      masterName,
      masterPhone,
      isClientSubmitted: !!receipt.prepaymentSubmittedAt,
      isOperatorConfirmed: !!receipt.prepaymentSeenAt,
      createdAt: receipt.createdAt,
    });
  } catch (err) {
    console.error("receipt data error", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// ── Public receipt page (no auth required) ───────────────────────────────────
app.get("/api/receipt/:token/print", async (req, res) => {
  try {
    const { receiptsTable, mastersTable } = await import("@workspace/db");
    const { db } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const [receipt] = await db.select().from(receiptsTable).where(eq(receiptsTable.token, req.params.token));
    if (!receipt) return res.status(404).send("Смета не найдена");
    const [master] = await db.select().from(mastersTable).where(eq(mastersTable.id, receipt.masterId));
    const masterName = master?.contractFullName || master?.alias || "Мастер";
    const masterPhone = master?.phone || "";
    const fmtN = (n: number) => Number(n).toLocaleString("ru-RU");
    const date = new Date(receipt.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
    const lineItems: Array<{description: string; unit?: string; quantity?: number; price: number}> = (receipt.lineItems as any) ?? [];
    const totalAmount = Number(receipt.totalAmount);
    const prepaymentAmount = Number(receipt.prepaymentAmount);
    const remainder = totalAmount - prepaymentAmount;
    const orderInfo = [receipt.serviceType, receipt.city, receipt.district ? `(${receipt.district})` : ""].filter(Boolean).join(", ");
    const esc = (s: string) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const rows = lineItems.map((item, i) => {
      const qty = item.quantity ?? 1;
      return `<tr>
        <td style="padding:6px 8px;border:1px solid #ccc;text-align:center">${i + 1}</td>
        <td style="padding:6px 8px;border:1px solid #ccc">${esc(item.description)}</td>
        <td style="padding:6px 8px;border:1px solid #ccc;text-align:center">${esc(item.unit ?? "—")}</td>
        <td style="padding:6px 8px;border:1px solid #ccc;text-align:right">${qty}</td>
        <td style="padding:6px 8px;border:1px solid #ccc;text-align:right">${fmtN(item.price)}</td>
        <td style="padding:6px 8px;border:1px solid #ccc;text-align:right;font-weight:600">${fmtN(qty * Number(item.price))}</td>
      </tr>`;
    }).join("");
    const printHtml = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8"/>
<title>Смета №${receipt.id}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:13px;color:#000;background:#fff;padding:32px}
  h1{font-size:20px;font-weight:bold;text-align:center;margin-bottom:4px}
  .sub{text-align:center;font-size:12px;color:#444;margin-bottom:24px}
  table.meta{width:100%;margin-bottom:8px}
  table.meta td{padding:3px 0;font-size:13px}
  table.meta td:first-child{color:#555;width:180px}
  table.items{width:100%;border-collapse:collapse;margin-top:16px}
  table.items th{padding:7px 8px;border:1px solid #ccc;background:#f0f0f0;font-size:12px;text-align:left}
  .summary{margin-top:14px;text-align:right}
  .summary p{font-size:13px;margin-bottom:4px}
  .summary p.main{font-size:15px;font-weight:bold}
  .notes{margin-top:14px;padding:10px 12px;border:1px solid #ccc;border-radius:4px;font-size:12px}
  .sig{margin-top:40px;display:flex;justify-content:space-between;font-size:12px;color:#333}
  .sig div{flex:1;padding-right:24px}
  .sig-line{margin-top:24px;border-top:1px solid #000}
  @media print{body{padding:16px}}
</style></head><body>
<h1>СМЕТА №${receipt.id}</h1>
<div class="sub">Честный мастер · sfera-master.ru</div>
<hr style="border:none;border-top:1px solid #ccc;margin-bottom:20px"/>
<table class="meta">
  <tr><td>Дата составления:</td><td><strong>${date}</strong></td></tr>
  <tr><td>Клиент:</td><td><strong>${esc(receipt.clientName ?? "")}</strong></td></tr>
  ${receipt.clientPhone ? `<tr><td>Телефон клиента:</td><td>${esc(receipt.clientPhone)}</td></tr>` : ""}
  ${orderInfo ? `<tr><td>Объект / услуга:</td><td>${esc(orderInfo)}</td></tr>` : ""}
  <tr><td>Исполнитель:</td><td><strong>${esc(masterName)}</strong>${masterPhone ? ` · ${esc(masterPhone)}` : ""}</td></tr>
  <tr><td>Организатор:</td><td>ИП Коваленко И.Г. · ИНН 262409599800</td></tr>
</table>
<table class="items">
  <thead><tr>
    <th style="width:36px;text-align:center">№</th>
    <th>Наименование работ / материалов</th>
    <th style="width:70px;text-align:center">Ед.</th>
    <th style="width:60px;text-align:right">Кол-во</th>
    <th style="width:90px;text-align:right">Цена, ₽</th>
    <th style="width:100px;text-align:right">Сумма, ₽</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="summary">
  <p>Итого по смете: <strong>${fmtN(totalAmount)} ₽</strong></p>
  <p class="main">Предоплата (бронирование): <strong>${fmtN(prepaymentAmount)} ₽</strong></p>
  <p style="color:#555">Остаток по факту работ: ${fmtN(remainder)} ₽</p>
</div>
${receipt.notes ? `<div class="notes"><strong>Примечания:</strong> ${esc(receipt.notes)}</div>` : ""}
<div class="sig">
  <div>
    <p>Исполнитель: <strong>${esc(masterName)}</strong></p>
    <div class="sig-line"></div>
    <p style="margin-top:4px">подпись / дата</p>
  </div>
  <div>
    <p>Заказчик: <strong>${esc(receipt.clientName ?? "")}</strong></p>
    <div class="sig-line"></div>
    <p style="margin-top:4px">подпись / дата</p>
  </div>
</div>
<script>window.print();</script>
</body></html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(printHtml);
  } catch (err) {
    console.error("[receipt-print]", err);
    res.status(500).send("Ошибка сервера");
  }
});

app.get("/api/receipt/:token", async (req, res) => {
  try {
    const { receiptsTable, mastersTable } = await import("@workspace/db");
    const { db } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const [receipt] = await db.select().from(receiptsTable).where(eq(receiptsTable.token, req.params.token));
    if (!receipt) {
      return res.status(404).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Не найдено</title></head><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Смета не найдена</h2><p>Ссылка недействительна или устарела.</p></body></html>`);
    }
    const [master] = await db.select().from(mastersTable).where(eq(mastersTable.id, receipt.masterId));

    const prepayment = Number(receipt.prepaymentAmount).toLocaleString("ru-RU");
    const total = Number(receipt.totalAmount).toLocaleString("ru-RU");
    const remainder = (Number(receipt.totalAmount) - Number(receipt.prepaymentAmount)).toLocaleString("ru-RU");
    const date = new Date(receipt.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const district = receipt.district ? `, ${receipt.district}` : "";
    const lineItems: Array<{description: string; unit?: string; quantity?: number; price: number}> = (receipt.lineItems as any) ?? [];
    const isClientSubmitted = !!receipt.prepaymentSubmittedAt;
    const isOperatorConfirmed = !!receipt.prepaymentSeenAt;

    const lineItemsHtml = lineItems.map(item => {
      const qty = item.quantity && item.quantity !== 1 ? item.quantity : null;
      const unitStr = item.unit || "";
      const rowTotal = (item.quantity ?? 1) * item.price;
      let detailStr = "";
      if (qty) {
        detailStr = unitStr
          ? ` <span class="item-detail">${qty} ${unitStr} × ${Number(item.price).toLocaleString("ru-RU")} ₽</span>`
          : ` <span class="item-detail">${qty} × ${Number(item.price).toLocaleString("ru-RU")} ₽</span>`;
      } else if (unitStr) {
        detailStr = ` <span class="item-detail">₽/${unitStr}</span>`;
      }
      return `<div class="item-row"><span class="item-name">${item.description}${detailStr}</span><span class="item-amt">${Number(rowTotal).toLocaleString("ru-RU")} ₽</span></div>`;
    }).join("");

    const notesHtml = receipt.notes
      ? `<div class="notes"><div class="notes-lbl">Примечание</div><div class="notes-text">${receipt.notes}</div></div>`
      : "";

    const masterName = master?.contractFullName || master?.alias || "Мастер";
    const masterPhone = master?.phone || "";

    const statusBadgeHtml = isOperatorConfirmed
      ? `<span class="status-badge confirmed">✓ Подтверждена</span>`
      : isClientSubmitted
        ? `<span class="status-badge pending">⏳ Проверяем</span>`
        : `<span class="status-badge unpaid">⚠ Не оплачена</span>`;

    const confirmSectionHtml = isClientSubmitted
      ? `<div class="status-banner ${isOperatorConfirmed ? "confirmed" : "submitted"}">
          <span class="status-banner-icon">${isOperatorConfirmed ? "✅" : "⏳"}</span>
          <div>
            <div class="status-banner-title${isOperatorConfirmed ? " confirmed" : ""}">${isOperatorConfirmed ? "Оплата подтверждена!" : "Заявка принята!"}</div>
            <div class="status-banner-sub">${isOperatorConfirmed ? "Мастер закреплён за вашим заказом." : "Оператор проверяет скриншот — обычно до 30 мин."}</div>
          </div>
        </div>`
      : "";

    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Смета №${receipt.id} — Честный мастер</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif; background: #F5FAFA; min-height: 100dvh; color: #0D2B28; padding-bottom: 24px; }

    /* ── Topbar ── */
    .topbar { position: sticky; top: 0; z-index: 50; background: #fff; border-bottom: 1.5px solid #D0EDEB; display: flex; align-items: center; gap: 10px; padding: 11px 16px; box-shadow: 0 1px 8px rgba(13,148,136,.06); }
    .topbar-back { display: flex; align-items: center; gap: 4px; color: #4A6B69; text-decoration: none; font-size: 12px; font-weight: 600; flex-shrink: 0; }
    .topbar-title { font-size: 15px; font-weight: 700; color: #0D2B28; flex: 1; text-align: center; }
    .topbar-num { font-size: 11px; color: #4A6B69; font-weight: 500; flex-shrink: 0; white-space: nowrap; }
    .topbar-install { display: flex; align-items: center; gap: 5px; background: #F0FDFA; border: 1.5px solid #99F6E4; border-radius: 8px; padding: 5px 10px; cursor: pointer; font-family: inherit; font-size: 11px; font-weight: 700; color: #0D9488; text-decoration: none; flex-shrink: 0; white-space: nowrap; }

    /* ── Layout ── */
    .layout { padding: 10px 12px 20px; display: flex; flex-direction: column; gap: 8px; max-width: 600px; margin: 0 auto; }

    /* ── Hero card ── */
    .hero { background: linear-gradient(135deg, #0F4C45, #0D9488); border-radius: 16px; padding: 14px 16px; box-shadow: 0 4px 16px rgba(13,148,136,.2); }
    .hero-label { font-size: 9px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,.5); margin-bottom: 2px; }
    .hero-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .hero-amount { font-size: 30px; font-weight: 800; color: #fff; letter-spacing: -1px; line-height: 1; }
    .hero-cur { font-size: 15px; font-weight: 600; color: rgba(255,255,255,.55); margin-left: 3px; }
    .hero-sub { font-size: 10px; color: rgba(255,255,255,.45); margin-top: 2px; }
    .status-badge { display: inline-flex; align-items: center; gap: 4px; padding: 5px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; flex-shrink: 0; }
    .status-badge.confirmed { background: rgba(16,185,129,.25); color: #6ee7b7; }
    .status-badge.pending { background: rgba(13,148,136,.2); color: #99F6E4; }
    .status-badge.unpaid { background: rgba(251,191,36,.2); color: #fde68a; }

    /* ── CTA button ── */
    .cta-btn { width: 100%; height: 44px; background: #0D9488; color: #fff; font-size: 14px; font-weight: 700; border: none; border-radius: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 14px rgba(13,148,136,.3); font-family: inherit; }
    .cta-btn:active { background: #0F4C45; }

    /* ── Status banner ── */
    .status-banner { border-radius: 14px; padding: 12px 14px; display: flex; align-items: center; gap: 10px; }
    .status-banner.submitted { background: #F0FDFA; border: 1px solid #5EEAD4; }
    .status-banner.confirmed { background: #ecfdf5; border: 1px solid #a7f3d0; }
    .status-banner-icon { font-size: 24px; flex-shrink: 0; }
    .status-banner-title { font-size: 13px; font-weight: 700; color: #0F4C45; margin-bottom: 2px; }
    .status-banner-title.confirmed { color: #065f46; }
    .status-banner-sub { font-size: 12px; color: #6b7280; line-height: 1.5; }

    /* ── Section card ── */
    .sc { background: #fff; border-radius: 14px; border: 1.5px solid #D0EDEB; box-shadow: 0 1px 6px rgba(13,148,136,.04); overflow: hidden; }
    .sc.accent { border: 1.5px solid #99F6E4; }
    .sc-head { display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: #F5FAFA; border-bottom: 1.5px solid #D0EDEB; }
    .sc.accent .sc-head { background: #F0FDFA; border-bottom: 1.5px solid #99F6E4; }
    .sc-icon { width: 32px; height: 32px; border-radius: 10px; flex-shrink: 0; background: #F0FDFA; display: flex; align-items: center; justify-content: center; }
    .sc.accent .sc-icon { background: #CCFBF1; }
    .sc-title { font-size: 13px; font-weight: 700; color: #0D2B28; }
    .sc.accent .sc-title { color: #0F4C45; }
    .sc-body { padding: 8px 14px 10px; }

    /* ── Items ── */
    .item-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
    .item-row:last-child { border-bottom: none; }
    .item-name { font-size: 13px; color: #374151; flex: 1; line-height: 1.4; }
    .item-detail { font-size: 11px; color: #9ca3af; margin-left: 4px; font-weight: 400; }
    .item-amt { font-size: 13px; font-weight: 600; color: #111827; white-space: nowrap; }

    /* ── Totals ── */
    .totals { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
    .total-row { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; }
    .total-row.prepay { background: #F0FDFA; border-radius: 8px; padding: 6px 10px; }
    .total-lbl { font-size: 12px; color: #6b7280; }
    .total-val { font-size: 12px; font-weight: 600; color: #111827; }
    .total-row.prepay .total-lbl { font-size: 13px; font-weight: 700; color: #0D9488; }
    .total-row.prepay .total-val { font-size: 14px; font-weight: 800; color: #0D9488; }
    .total-row.remainder .total-lbl { font-weight: 600; color: #374151; font-size: 12px; }
    .total-row.remainder .total-val { font-weight: 700; color: #374151; font-size: 12px; }

    /* ── Notes ── */
    .notes { margin-top: 8px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 8px 10px; }
    .notes-lbl { font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px; }
    .notes-text { font-size: 12px; color: #374151; line-height: 1.5; }

    /* ── About section ── */
    .about-grid { padding: 10px 14px 6px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .about-cell { background: #f9fafb; border-radius: 10px; padding: 10px 12px; }
    .about-lbl { font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #9ca3af; margin-bottom: 4px; }
    .about-name { font-size: 12px; font-weight: 700; color: #111827; margin-bottom: 2px; }
    .about-sub { font-size: 11px; color: #6b7280; }
    .about-stamp { padding: 0 14px 10px; font-size: 10px; color: #d1d5db; }

    /* ── Payment section ── */
    .pay-body { padding: 12px 14px 14px; }
    .pay-phone-lbl { font-size: 10px; font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase; color: #9ca3af; margin-bottom: 4px; }
    .pay-phone-row { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
    .pay-phone { font-size: 24px; font-weight: 800; color: #0D9488; letter-spacing: -0.5px; flex: 1; line-height: 1; cursor: pointer; user-select: none; }
    .pay-bank-line { font-size: 11px; color: #6b7280; margin-bottom: 12px; }
    .copy-btn { flex-shrink: 0; padding: 7px 13px; background: #F0FDFA; border: 1.5px solid #99F6E4; border-radius: 9px; cursor: pointer; font-family: inherit; font-size: 12px; font-weight: 700; color: #0D9488; transition: all 0.15s; }
    .copy-btn.copied { background: #f0fdf4; border-color: #bbf7d0; color: #065f46; }
    .pay-details { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 7px 12px; margin-bottom: 12px; }
    .pay-detail-row { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; border-bottom: 1px solid #e5e7eb; }
    .pay-detail-row:last-child { border-bottom: none; }
    .pay-detail-lbl { font-size: 11px; color: #9ca3af; flex-shrink: 0; }
    .pay-detail-val { font-size: 11px; color: #374151; font-weight: 500; text-align: right; }

    /* ── Form ── */
    .divider { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .divider-line { flex: 1; height: 1px; background: #e5e7eb; }
    .divider-text { font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.07em; white-space: nowrap; }
    .field-group { margin-bottom: 8px; }
    .field-lbl { display: block; font-size: 11px; font-weight: 600; color: #374151; margin-bottom: 3px; }
    .field-req { color: #ef4444; }
    .field-input { width: 100%; height: 40px; border: 1.5px solid #d1d5db; border-radius: 9px; padding: 0 12px; font-size: 14px; font-family: inherit; color: #111827; background: #fff; outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
    .field-input:focus { border-color: #0D9488; box-shadow: 0 0 0 3px rgba(13,148,136,.1); }
    .upload-trigger { border: 2px dashed #d1d5db; border-radius: 10px; background: #fff; cursor: pointer; padding: 10px; display: flex; align-items: center; gap: 8px; transition: all 0.2s; }
    .upload-trigger:hover { border-color: #0D9488; background: #F0FDFA; }
    .upload-icon-wrap { width: 28px; height: 28px; background: #CCFBF1; border-radius: 7px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .upload-filename { font-size: 12px; font-weight: 600; color: #0D9488; }
    .upload-hint { font-size: 10px; color: #9ca3af; }
    .preview-img { max-width: 100%; border-radius: 8px; border: 1px solid #e5e7eb; margin-top: 8px; display: none; }
    .form-error { display: none; color: #b91c1c; font-size: 12px; margin-bottom: 8px; padding: 8px 10px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; }
    .submit-btn { width: 100%; height: 44px; background: #0D9488; color: #fff; font-size: 14px; font-weight: 700; border: none; border-radius: 10px; cursor: pointer; font-family: inherit; transition: background 0.15s; }
    .submit-btn:hover { background: #0F4C45; }
    .submit-btn:disabled { background: #6b7280; cursor: not-allowed; }
    .form-note { font-size: 10px; color: #9ca3af; text-align: center; margin-top: 6px; }

    /* ── Success ── */
    .success-box { text-align: center; padding: 20px; }
    .success-icon { width: 56px; height: 56px; background: #d1fae5; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; }
    .success-title { font-size: 17px; font-weight: 700; color: #111827; margin-bottom: 6px; }
    .success-sub { font-size: 13px; color: #6b7280; line-height: 1.6; }

    /* ── Guarantee block ── */
    .guarantee { background: linear-gradient(135deg, #0F4C45 0%, #0D9488 100%); border-radius: 16px; padding: 16px 18px; display: flex; gap: 14px; align-items: flex-start; }
    .guarantee-icon { width: 44px; height: 44px; border-radius: 12px; background: rgba(255,255,255,.15); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .guarantee-title { font-size: 14px; font-weight: 800; color: #fff; margin-bottom: 6px; letter-spacing: -0.01em; }
    .guarantee-text { font-size: 13px; color: rgba(255,255,255,.88); line-height: 1.55; }
    .guarantee-note { margin-top: 8px; font-size: 13px; font-weight: 700; color: #86EFAC; }

    /* ── Install banner ── */
    .install-banner { background: #fff; border: 1.5px solid #D0EDEB; border-radius: 16px; padding: 14px 16px; display: flex; align-items: center; gap: 14px; }
    .install-icon { width: 42px; height: 42px; border-radius: 12px; flex-shrink: 0; background: linear-gradient(135deg, #0D9488, #0F4C45); display: flex; align-items: center; justify-content: center; }
    .install-text { flex: 1; min-width: 0; }
    .install-text-title { font-size: 13px; font-weight: 700; color: #0D2B28; }
    .install-text-sub { font-size: 11px; color: #4A6B69; margin-top: 2px; }
    .install-btn { flex-shrink: 0; padding: 8px 14px; background: #0D9488; color: #fff; border: none; border-radius: 10px; font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit; white-space: nowrap; }
    .install-instructions { background: #F0FDFA; border: 1.5px solid #99F6E4; border-radius: 16px; padding: 14px 16px; display: none; }
    .install-instructions-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .install-instructions-text { font-size: 13px; color: #0F4C45; line-height: 1.7; }

    /* ── Print button ── */
    .print-btn { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; background: #F0FDFA; border: 1.5px solid #99F6E4; cursor: pointer; flex-shrink: 0; padding: 0; text-decoration: none; }

    @media(max-width: 380px) { .hero-amount { font-size: 24px; } .about-grid { grid-template-columns: 1fr; } }
    @media print { .cta-btn, .sc.accent, .install-banner, .install-instructions { display: none; } body { background: #fff; } }
  </style>
</head>
<body>

<!-- ── TOPBAR ── -->
<div class="topbar">
  <a href="/client/" class="topbar-back">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
    Главная
  </a>
  <span class="topbar-title">Честный мастер</span>
  <div style="display:flex;align-items:center;gap:7px;flex-shrink:0">
    <a href="/api/receipt/${req.params.token}/print" target="_blank" class="print-btn" title="Распечатать смету">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0D9488" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 6 2 18 2 18 9"/>
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
        <rect x="6" y="14" width="12" height="8"/>
      </svg>
    </a>
    <a href="/client/" class="topbar-install" id="topbar-install-btn" title="Установить приложение">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg>
      Установить
    </a>
  </div>
</div>

<div class="layout">

  <!-- ── HERO ── -->
  <div class="hero">
    <div class="hero-label">Сумма брони</div>
    <div class="hero-row">
      <div>
        <div><span class="hero-amount">${prepayment}</span><span class="hero-cur">₽</span></div>
        <div class="hero-sub">${receipt.serviceType} · итого ${total} ₽</div>
      </div>
      ${statusBadgeHtml}
    </div>
  </div>

  <!-- ── CTA BUTTON ── -->
  ${!isClientSubmitted ? `
  <button class="cta-btn" onclick="scrollToBooking()">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
    Забронировать мастера · ${prepayment} ₽
  </button>
  ` : ""}

  <!-- ── STATUS BANNER ── -->
  ${confirmSectionHtml}

  <!-- ── ПЕРЕЧЕНЬ РАБОТ ── -->
  <div class="sc">
    <div class="sc-head">
      <div class="sc-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
          <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
      </div>
      <span class="sc-title">Перечень работ · ${lineItems.length} поз.</span>
    </div>
    <div class="sc-body">
      ${lineItemsHtml}
      <div class="totals">
        <div class="total-row">
          <span class="total-lbl">Итого по смете</span>
          <span class="total-val">${total} ₽</span>
        </div>
        <div class="total-row prepay">
          <span class="total-lbl">Бронь (предоплата)</span>
          <span class="total-val">${prepayment} ₽</span>
        </div>
        <div class="total-row remainder">
          <span class="total-lbl">Остаток по факту работ</span>
          <span class="total-val">${remainder} ₽</span>
        </div>
      </div>
      ${notesHtml}
    </div>
  </div>

  <!-- ── ГАРАНТИЯ ── -->
  <div class="guarantee">
    <div class="guarantee-icon">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z" fill="rgba(255,255,255,0.25)" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M8.5 12.5l2.5 2.5 4.5-4.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <div>
      <div class="guarantee-title">Гарантия возврата</div>
      <div class="guarantee-text">Если по любой причине работы не начнутся — предоплата возвращается в полном объёме.</div>
      <div class="guarantee-note">Вы ничем не рискуете.</div>
    </div>
  </div>

  <!-- ── О ЗАКАЗЕ ── -->
  <div class="sc">
    <div class="sc-head">
      <div class="sc-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
        </svg>
      </div>
      <span class="sc-title">О заказе</span>
    </div>
    <div class="about-grid">
      <div class="about-cell">
        <div class="about-lbl">Исполнитель</div>
        <div class="about-name">${masterName}</div>
        ${masterPhone ? `<div class="about-sub">${masterPhone}</div>` : ""}
      </div>
      <div class="about-cell">
        <div class="about-lbl">Организатор</div>
        <div class="about-name">ИП Коваленко И.Г.</div>
        <div class="about-sub">ИНН 262409599800</div>
      </div>
    </div>
    <div class="about-stamp">Смета №${receipt.id} · ${date} · sfera-master.ru</div>
  </div>

  ${!isClientSubmitted ? `
  <div class="sc accent" id="booking-section">
    <div class="sc-head">
      <div class="sc-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0D9488" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>
        </svg>
      </div>
      <span class="sc-title">Забронировать мастера</span>
    </div>
    <div class="pay-body">
      <div class="pay-phone-lbl">СБП / Альфа Банк</div>
      <div class="pay-phone-row">
        <div class="pay-phone" onclick="copyPhone()">8 989 286-08-63</div>
        <button class="copy-btn" id="copy-btn" onclick="copyPhone()">Копировать</button>
      </div>
      <div class="pay-bank-line">Альфа Банк · ИП Коваленко Игорь Геннадьевич</div>
      <div class="pay-details">
        <div class="pay-detail-row">
          <span class="pay-detail-lbl">Банк</span>
          <span class="pay-detail-val">Альфа Банк · СБП</span>
        </div>
        <div class="pay-detail-row">
          <span class="pay-detail-lbl">ИНН</span>
          <span class="pay-detail-val">262409599800</span>
        </div>
        <div class="pay-detail-row">
          <span class="pay-detail-lbl">Назначение</span>
          <span class="pay-detail-val">Бронь №${receipt.id}</span>
        </div>
      </div>

      <div id="form-area">
        <div class="divider">
          <div class="divider-line"></div>
          <span class="divider-text">Подтвердите перевод</span>
          <div class="divider-line"></div>
        </div>
        <div class="field-group">
          <label class="field-lbl" for="client-name">Ваше ФИО <span class="field-req">*</span></label>
          <input class="field-input" type="text" id="client-name" placeholder="Иванов Иван Иванович" autocomplete="name">
        </div>
        <div class="field-group">
          <label class="field-lbl">Скриншот оплаты <span class="field-req">*</span></label>
          <div class="upload-trigger" onclick="document.getElementById('screenshot-input').click()">
            <div class="upload-icon-wrap">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0D9488" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            </div>
            <div>
              <div class="upload-filename" id="upload-text">Прикрепить скриншот</div>
              <div class="upload-hint">JPG, PNG · до 10 МБ</div>
            </div>
          </div>
          <input type="file" id="screenshot-input" accept="image/*" style="display:none">
          <img class="preview-img" id="preview-img" alt="preview">
        </div>
        <div class="form-error" id="form-error"></div>
        <button class="submit-btn" id="submit-btn">Отправить подтверждение</button>
        <p class="form-note">Защищено платформой «Честный мастер»</p>
      </div>

      <div id="success-area" style="display:none">
        <div class="success-box">
          <div class="success-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div class="success-title">Заявка отправлена!</div>
          <div class="success-sub">Оператор проверит ваш скриншот и подтвердит бронь в ближайшее время.</div>
        </div>
      </div>
    </div>
  </div>
  ` : ""}

</div>

<script>
  function scrollToBooking() {
    const el = document.getElementById('booking-section');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function copyPhone() {
    navigator.clipboard.writeText('79892860863').then(() => {
      const btn = document.getElementById('copy-btn');
      if (btn) { btn.textContent = '✓ Скопировано'; btn.classList.add('copied'); }
      setTimeout(() => { if (btn) { btn.textContent = 'Копировать'; btn.classList.remove('copied'); } }, 2500);
    }).catch(() => {});
  }

  const fileInput = document.getElementById('screenshot-input');
  const uploadText = document.getElementById('upload-text');
  const previewImg = document.getElementById('preview-img');
  const submitBtn = document.getElementById('submit-btn');
  const formError = document.getElementById('form-error');
  const formArea = document.getElementById('form-area');
  const successArea = document.getElementById('success-area');

  if (fileInput) {
    fileInput.addEventListener('change', function() {
      const file = this.files[0];
      if (!file) return;
      uploadText.textContent = '\u2713 ' + file.name;
      uploadText.style.color = '#065f46';
      const reader = new FileReader();
      reader.onload = e => { previewImg.src = e.target.result; previewImg.style.display = 'block'; };
      reader.readAsDataURL(file);
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', async function() {
      const name = document.getElementById('client-name').value.trim();
      const file = fileInput ? fileInput.files[0] : null;
      formError.style.display = 'none';
      if (!name) { showError('Введите ваше ФИО'); return; }
      if (name.split(' ').filter(w=>w.length>1).length < 2) { showError('Введите полное ФИО (Фамилия Имя Отчество)'); return; }
      if (!file) { showError('Прикрепите скриншот оплаты'); return; }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Отправляем...';
      const fd = new FormData();
      fd.append('clientName', name);
      fd.append('screenshot', file);
      try {
        const r = await fetch('/api/receipt/${req.params.token}/confirm', { method: 'POST', body: fd });
        const data = await r.json();
        if (!r.ok) { showError(data.error || 'Ошибка. Попробуйте ещё раз.'); submitBtn.disabled = false; submitBtn.textContent = 'Отправить подтверждение'; return; }
        formArea.style.display = 'none';
        successArea.style.display = 'block';
      } catch(e) {
        showError('Ошибка сети. Попробуйте ещё раз.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Отправить подтверждение';
      }
    });
  }

  function showError(msg) {
    formError.textContent = msg;
    formError.style.display = 'block';
  }

</script>
</body>
</html>
`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) {
    console.error("[receipt-page]", err);
    res.status(500).send("Ошибка сервера");
  }
});

// ── Public receipt confirmation (client submits ФИО + screenshot) ─────────────
app.post("/api/receipt/:token/confirm", screenshotUpload.single("screenshot"), async (req: any, res) => {
  try {
    const { receiptsTable } = await import("@workspace/db");
    const { db } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");

    const [receipt] = await db.select().from(receiptsTable).where(eq(receiptsTable.token, req.params.token));
    if (!receipt) return res.status(404).json({ error: "Расписка не найдена" });
    if (receipt.prepaymentSubmittedAt) return res.status(409).json({ error: "Подтверждение уже было отправлено" });

    const clientName = (req.body?.clientName ?? "").trim();
    if (!clientName) return res.status(400).json({ error: "Укажите ваше ФИО" });
    if (clientName.split(" ").filter((w: string) => w.length > 1).length < 2) {
      return res.status(400).json({ error: "Введите полное ФИО (Фамилия Имя Отчество)" });
    }

    let screenshotUrl: string | null = null;
    if (req.file) {
      screenshotUrl = bufferToDataUri(req.file.buffer, req.file.mimetype);
    }

    await db.update(receiptsTable).set({
      clientSubmittedName: clientName,
      prepaymentSubmittedAt: new Date(),
      prepaymentScreenshotUrl: screenshotUrl,
    }).where(eq(receiptsTable.token, req.params.token));

    // Auto-insert payment confirmation message into chat for this receipt
    try {
      const { clientSupportMessagesTable } = await import("@workspace/db");
      await db.insert(clientSupportMessagesTable).values({
        receiptToken: req.params.token,
        message: JSON.stringify({
          type: "payment_confirm",
          clientName,
          screenshotUrl,
          amount: Number(receipt.prepaymentAmount),
        }),
        fromClient: true,
      });
    } catch (e) {
      console.error("[receipt-confirm] chat insert error:", e);
    }

    // Notify master via Max Messenger + notify manager bot
    try {
      const { mastersTable } = await import("@workspace/db");
      const [master] = await db.select().from(mastersTable).where(eq(mastersTable.id, receipt.masterId));
      if (master?.maxChatId) {
        const prepayStr = Number(receipt.prepaymentAmount).toLocaleString("ru-RU");
        await sendMaxMessage(
          master.maxChatId,
          `💰 Клиент оплатил бронь!\n\nСмета #${receipt.id}\nКлиент: ${clientName}\nСумма брони: ${prepayStr} ₽\n\nСкриншот получен — проверьте в CRM.`
        );
      }
      // Notify manager bot immediately
      notifyManagerReceiptPaid({
        id: receipt.id,
        clientName,
        clientPhone: receipt.clientPhone,
        prepaymentAmount: Number(receipt.prepaymentAmount),
        masterAlias: master?.alias,
        city: receipt.city,
        serviceType: receipt.serviceType,
      }).catch(() => {});
    } catch (e) {
      console.error("[receipt-confirm] max notification error:", e);
    }

    res.json({ ok: true, message: "Подтверждение принято. Оператор свяжется с вами." });
  } catch (err) {
    console.error("[receipt-confirm]", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

app.use("/api/uploads", express.static(UPLOAD_BASE));
// Serve banner images
app.use("/api/banners", express.static(path.join(__dirname, "../public/banners")));

// ── Master landing page ──────────────────────────────────────────────────────
app.use("/master-landing", express.static(path.join(__dirname, "../../master-landing-v5/dist")));

// ── Max Messenger Bot Webhook (Masters) ──────────────────────────────────────
app.post("/api/max-webhook", express.json(), async (req, res) => {
  res.sendStatus(200);
  if (req.body) {
    handleMaxUpdate(req.body).catch((e) => console.error("[max-webhook]", e));
  }
});

// ── Manager AI Bot Webhook ────────────────────────────────────────────────────
app.post("/api/manager-webhook", express.json(), async (req, res) => {
  res.sendStatus(200);
  if (req.body) {
    handleManagerUpdate(req.body).catch((e) => console.error("[manager-webhook]", e));
  }
});

app.use("/api", router);
app.use("/api/partner", partnerPwaRouter);
app.use("/api/crm", crmPartnersRouter);
app.use("/api/master-pwa", masterPwaRouter);
app.use("/api/admin/dizajn", dizajnShowcaseRouter);

// ── Serve CRM and master-pwa as static files (production deployment) ─────────
// In development these are served by their own Vite dev servers via path routing.
// In production (deployed VM) the api-server is the only process, so it serves
// the pre-built static files for both frontends.

const crmDistPath = path.join(__dirname, "../../crm/dist/public");
const pwaDistPath = path.join(__dirname, "../../master-pwa/dist/public");
const partnerPwaDistPath = path.join(__dirname, "../../partner-pwa/dist/public");

// Vite emits hashed filenames into /assets/* — those can be cached forever.
// Everything else (index.html, sw.js, manifest.json, root files) must always
// revalidate so users never see stale HTML referencing deleted chunk hashes.
const spaStaticHeaders = (res: import("express").Response, filePath: string) => {
  if (/[\\/]assets[\\/]/.test(filePath)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  }
};

const spaIndexHeaders = (res: import("express").Response) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
};

if (fs.existsSync(crmDistPath)) {
  app.use("/crm", express.static(crmDistPath, { setHeaders: spaStaticHeaders }));
  app.use("/crm", (req, res) => {
    if (req.path.includes(".")) {
      return res.status(404).send("Not found");
    }
    spaIndexHeaders(res);
    res.sendFile(path.join(crmDistPath, "index.html"));
  });
}

if (fs.existsSync(pwaDistPath)) {
  app.use("/master-pwa", express.static(pwaDistPath, { setHeaders: spaStaticHeaders }));
  app.use("/master-pwa", (req, res) => {
    if (req.path.includes(".")) {
      return res.status(404).send("Not found");
    }
    spaIndexHeaders(res);
    res.sendFile(path.join(pwaDistPath, "index.html"));
  });
}

if (fs.existsSync(partnerPwaDistPath)) {
  app.use("/partner", express.static(partnerPwaDistPath, { setHeaders: spaStaticHeaders }));
  app.use("/partner", (req, res) => {
    if (req.path.includes(".")) {
      return res.status(404).send("Not found");
    }
    spaIndexHeaders(res);
    res.sendFile(path.join(partnerPwaDistPath, "index.html"));
  });
}

// ── Serve master-landing-v2 (recruitment landing) ─────────────────────────────
const landingV2DistPath = path.join(__dirname, "../../master-landing-v2/dist/public");

if (fs.existsSync(landingV2DistPath)) {
  app.use("/master-landing/v2", express.static(landingV2DistPath));
  app.use("/master-landing/v2", (_req, res) => {
    res.sendFile(path.join(landingV2DistPath, "index.html"));
  });
}

// ── Short URL alias for honest master landing ─────────────────────────────────
// Both /masters and /masteram redirect to the canonical /master-landing/v3/honest
// page. This frees us to use /mastera as the public marketplace catalog later
// (on chestnye-mastera.ru, different domain).
//
// /masters stays for backwards compatibility with existing visiting cards and
// Telegram links — it will be migrated to /masteram in a future task once
// /masteram has been live and indexed for a while.
//
// /masteram is the new canonical short URL for the masters-recruitment landing.
// Redirect (not direct serve) because master-landing is built with a fixed Vite
// base="/master-landing/v3/" — serving the same index.html under /masteram would
// load assets correctly but break the SPA client router (wouter), causing the
// LegacyLanding fallback to render instead of HonestLanding. A 301 keeps the
// canonical URL clean and gives us room to replace this redirect with proper
// SSR rendering on the future marketplace artifact.
app.get(["/masteram", "/masteram/"], (_req, res) =>
  res.redirect(301, "/"),
);
app.get("/masters", (_req, res) => res.redirect(301, "/"));

// ── Serve master-landing-v3 (honest + legacy SPA) ────────────────────────────
const landingV3DistPath = path.join(__dirname, "../../master-landing/dist/public");

if (fs.existsSync(landingV3DistPath)) {
  app.use("/master-landing/v3", express.static(landingV3DistPath));
  app.use("/master-landing/v3", (_req, res) => {
    res.sendFile(path.join(landingV3DistPath, "index.html"));
  });
}

// ── Serve master-landing (первый лендинг — registration) ──────────────────────
const landingV1DistPath = path.join(__dirname, "../../master-landing-v1/dist");

if (fs.existsSync(landingV1DistPath)) {
  app.use("/master-landing", express.static(landingV1DistPath));
  app.use("/master-landing", (_req, res) => {
    res.sendFile(path.join(landingV1DistPath, "index.html"));
  });
}

// ── Serve referral-landing (partner referral landing) ──────────────────────────
const referralLandingDistPath = path.join(__dirname, "../../referral-landing/dist/public");

if (fs.existsSync(referralLandingDistPath)) {
  app.use("/r", express.static(referralLandingDistPath));
  // SPA fallback: any /r/:slug serves index.html
  app.get("/r/:slug", (_req, res) => {
    res.sendFile(path.join(referralLandingDistPath, "index.html"));
  });
}

// ── Serve partner-landing (public partner recruitment landing) ───────────────
const partnerLandingDistPath = path.join(__dirname, "../public/partner-landing");

if (fs.existsSync(partnerLandingDistPath)) {
  app.use("/partners", express.static(partnerLandingDistPath));
  app.use("/partners", (_req, res) => {
    res.sendFile(path.join(partnerLandingDistPath, "index.html"));
  });
}

// Root: serve the current master-landing (v3) directly at sfera-master.ru/
// This is the main recruitment landing for masters — new business model
// (free onboarding, 500₽/lead + 15% commission after completion).
if (fs.existsSync(landingV3DistPath)) {
  app.use("/", express.static(landingV3DistPath, { index: false }));
}
app.get("/", (_req, res) => {
  if (fs.existsSync(landingV3DistPath)) {
    res.sendFile(path.join(landingV3DistPath, "index.html"));
  } else if (fs.existsSync(landingV1DistPath)) {
    res.redirect(301, "/master-landing/");
  } else {
    res.redirect(301, "/crm/");
  }
});

// ── Test endpoint for error logging ───────────────────────────────────────
app.get("/api/throw-error", (_req, _res) => {
  throw new Error("Test error from ai-log-agent monitoring");
});

// ── Auto-migration: partner_push_subscriptions ────────────────────────────────
db.execute(sql`
  CREATE TABLE IF NOT EXISTS partner_push_subscriptions (
    id SERIAL PRIMARY KEY,
    partner_id INTEGER NOT NULL REFERENCES traffic_partners(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS partner_push_partner_idx ON partner_push_subscriptions(partner_id);
`).catch((e: Error) => console.error("[migration] partner_push_subscriptions:", e.message));

// ── Register Max Bot Webhooks on startup ──────────────────────────────────────
const PROD_HOST = "https://sfera-master.ru";
registerWebhook(`${PROD_HOST}/api/max-webhook`);
registerManagerWebhook();

// ── Error Logging Middleware (MUST be last) ─────────────────────────────────
app.use(errorLoggerMiddleware());

export default app;
