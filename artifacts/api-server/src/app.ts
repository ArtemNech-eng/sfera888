import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import cookieParser from "cookie-parser";
import router from "./routes/index.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { UPLOAD_BASE } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const PgSession = connectPgSimple(session);

const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

app.use(session({
  store: new PgSession({
    pool: pgPool,
    createTableIfMissing: true,
    tableName: "user_sessions",
  }),
  secret: process.env.SESSION_SECRET || "crm-secret-key-2024",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
}));

// ── Public receipt page (no auth required) ───────────────────────────────────
app.get("/receipt/:token", async (req, res) => {
  try {
    const { receiptsTable } = await import("@workspace/db");
    const { db } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const [receipt] = await db.select().from(receiptsTable).where(eq(receiptsTable.token, req.params.token));
    if (!receipt) {
      return res.status(404).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Не найдено</title></head><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Расписка не найдена</h2><p>Ссылка недействительна или устарела.</p></body></html>`);
    }
    const amount = Number(receipt.amount).toLocaleString("ru-RU");
    const date = new Date(receipt.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const district = receipt.district ? `, ${receipt.district}` : "";
    const notes = receipt.notes ? `<div class="notes"><p class="label">Примечание</p><p>${receipt.notes}</p></div>` : "";
    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Расписка об оплате — Честный мастер</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f7fa; min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; padding: 32px 16px 64px; color: #1a1a2e; }
    .card { background: #fff; border-radius: 20px; box-shadow: 0 4px 32px rgba(0,0,0,.10); max-width: 480px; width: 100%; overflow: hidden; }
    .header { background: linear-gradient(135deg, #1a73e8 0%, #0d47a1 100%); color: #fff; padding: 32px 28px 24px; }
    .header-logo { font-size: 13px; font-weight: 600; letter-spacing: 0.08em; opacity: .8; text-transform: uppercase; margin-bottom: 12px; }
    .header-title { font-size: 26px; font-weight: 700; letter-spacing: -0.5px; }
    .header-amount { font-size: 44px; font-weight: 800; margin-top: 8px; letter-spacing: -1px; }
    .header-amount span { font-size: 22px; font-weight: 600; opacity: .85; }
    .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,.18); border-radius: 20px; padding: 4px 12px; margin-top: 14px; font-size: 13px; font-weight: 500; }
    .body { padding: 28px; }
    .section { margin-bottom: 20px; }
    .label { font-size: 11px; font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase; color: #888; margin-bottom: 4px; }
    .value { font-size: 16px; font-weight: 500; color: #1a1a2e; }
    .divider { height: 1px; background: #f0f0f0; margin: 20px 0; }
    .row { display: flex; gap: 20px; }
    .row .section { flex: 1; }
    .notes { background: #f8f9fc; border-radius: 12px; padding: 14px 16px; margin-top: 4px; }
    .notes .label { margin-bottom: 6px; }
    .notes p:last-child { font-size: 15px; line-height: 1.5; color: #333; }
    .footer { background: #f8f9fc; border-top: 1px solid #eee; padding: 20px 28px; }
    .footer-title { font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #888; margin-bottom: 8px; }
    .req { font-size: 14px; font-weight: 500; color: #333; line-height: 1.7; }
    .req strong { color: #1a73e8; }
    .stamp { text-align: center; margin-top: 20px; color: #aaa; font-size: 12px; }
    @media print { body { background: #fff; padding: 0; } .card { box-shadow: none; border-radius: 0; } }
  </style>
</head>
<body>
<div class="card">
  <div class="header">
    <div class="header-logo">Честный мастер</div>
    <div class="header-title">Расписка об оплате</div>
    <div class="header-amount">${amount} <span>₽</span></div>
    <div class="badge">✓ Предоплата получена</div>
  </div>
  <div class="body">
    <div class="section">
      <p class="label">Клиент</p>
      <p class="value">${receipt.clientName}</p>
    </div>
    <div class="section">
      <p class="label">Телефон</p>
      <p class="value">${receipt.clientPhone}</p>
    </div>
    <div class="divider"></div>
    <div class="row">
      <div class="section">
        <p class="label">Вид работ</p>
        <p class="value">${receipt.serviceType}</p>
      </div>
      <div class="section">
        <p class="label">Город</p>
        <p class="value">${receipt.city}${district}</p>
      </div>
    </div>
    <div class="divider"></div>
    ${notes}
    <div class="section">
      <p class="label">Дата и время</p>
      <p class="value">${date}</p>
    </div>
  </div>
  <div class="footer">
    <p class="footer-title">Реквизиты получателя</p>
    <p class="req">📞 <strong>89892860863</strong></p>
    <p class="req">🏦 Альфа Банк · Игорь К.</p>
    <p class="req">Система управления «Честный мастер»</p>
    <p class="stamp">Расписка сформирована автоматически · ID ${receipt.id}</p>
  </div>
</div>
</body>
</html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) {
    console.error("[receipt-page]", err);
    res.status(500).send("Ошибка сервера");
  }
});

app.use("/api/uploads", express.static(UPLOAD_BASE));
// Serve banner images
app.use("/api/banners", express.static(path.join(__dirname, "../public/banners")));

app.use("/api", router);

// ── Serve CRM and master-pwa as static files (production deployment) ─────────
// In development these are served by their own Vite dev servers via path routing.
// In production (deployed VM) the api-server is the only process, so it serves
// the pre-built static files for both frontends.

const crmDistPath = path.join(__dirname, "../../crm/dist/public");
const pwaDistPath = path.join(__dirname, "../../master-pwa/dist/public");

if (fs.existsSync(crmDistPath)) {
  app.use("/crm", express.static(crmDistPath));
  app.use("/crm", (_req, res) => {
    res.sendFile(path.join(crmDistPath, "index.html"));
  });
}

if (fs.existsSync(pwaDistPath)) {
  app.use("/master-pwa", express.static(pwaDistPath));
  app.use("/master-pwa", (_req, res) => {
    res.sendFile(path.join(pwaDistPath, "index.html"));
  });
}

// Root redirect: / → CRM
app.get("/", (_req, res) => {
  res.redirect(301, "/crm/");
});

export default app;
