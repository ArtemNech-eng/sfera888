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
    const { receiptsTable, mastersTable } = await import("@workspace/db");
    const { db } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const [receipt] = await db.select().from(receiptsTable).where(eq(receiptsTable.token, req.params.token));
    if (!receipt) {
      return res.status(404).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Не найдено</title></head><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Расписка не найдена</h2><p>Ссылка недействительна или устарела.</p></body></html>`);
    }
    const [master] = await db.select().from(mastersTable).where(eq(mastersTable.id, receipt.masterId));

    const prepayment = Number(receipt.prepaymentAmount).toLocaleString("ru-RU");
    const total = Number(receipt.totalAmount).toLocaleString("ru-RU");
    const date = new Date(receipt.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const district = receipt.district ? `, ${receipt.district}` : "";
    const lineItems: Array<{description: string; price: number}> = (receipt.lineItems as any) ?? [];

    const lineItemsHtml = lineItems.map(item =>
      `<tr><td class="item-desc">${item.description}</td><td class="item-price">${Number(item.price).toLocaleString("ru-RU")} ₽</td></tr>`
    ).join("");

    const notesHtml = receipt.notes
      ? `<div class="notes-block"><p class="label">Примечание</p><p class="notes-text">${receipt.notes}</p></div>`
      : "";

    const masterName = master?.contractFullName || master?.alias || "Мастер";
    const masterPhone = master?.phone || "";

    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Расписка об оплате — Честный мастер</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0f4f8; min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; padding: 24px 12px 60px; color: #1a1a2e; }
    .card { background: #fff; border-radius: 20px; box-shadow: 0 4px 32px rgba(0,0,0,.10); max-width: 520px; width: 100%; overflow: hidden; }
    .header { background: linear-gradient(135deg, #1565c0 0%, #0d47a1 100%); color: #fff; padding: 28px 28px 22px; }
    .header-logo { font-size: 12px; font-weight: 700; letter-spacing: 0.12em; opacity: .75; text-transform: uppercase; margin-bottom: 10px; }
    .header-title { font-size: 22px; font-weight: 700; }
    .header-prepay { font-size: 42px; font-weight: 800; margin-top: 6px; letter-spacing: -1px; }
    .header-prepay span { font-size: 20px; font-weight: 600; opacity: .85; }
    .header-sub { font-size: 13px; opacity: .75; margin-top: 4px; }
    .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,.18); border-radius: 20px; padding: 5px 14px; margin-top: 14px; font-size: 13px; font-weight: 600; }
    .body { padding: 24px 28px; }
    .section { margin-bottom: 16px; }
    .label { font-size: 10px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: #999; margin-bottom: 3px; }
    .value { font-size: 15px; font-weight: 500; color: #1a1a2e; }
    .divider { height: 1px; background: #eef0f4; margin: 18px 0; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .items-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    .items-table th { font-size: 10px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: #999; padding: 0 0 8px; text-align: left; border-bottom: 1px solid #eee; }
    .items-table th:last-child { text-align: right; }
    .item-desc { font-size: 14px; color: #222; padding: 9px 12px 9px 0; border-bottom: 1px solid #f5f5f5; line-height: 1.4; }
    .item-price { font-size: 14px; font-weight: 600; color: #1a1a2e; text-align: right; padding: 9px 0; border-bottom: 1px solid #f5f5f5; white-space: nowrap; }
    .totals { background: #f8f9fc; border-radius: 12px; padding: 14px 16px; margin-top: 14px; }
    .totals-row { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; }
    .totals-row.total-row { border-top: 1px solid #e0e4ec; margin-top: 8px; padding-top: 10px; }
    .totals-label { font-size: 13px; color: #666; }
    .totals-value { font-size: 14px; font-weight: 600; color: #1a1a2e; }
    .totals-row.prepay-row .totals-label { font-weight: 700; color: #1565c0; font-size: 14px; }
    .totals-row.prepay-row .totals-value { font-size: 18px; font-weight: 800; color: #1565c0; }
    .notes-block { background: #f8f9fc; border-radius: 10px; padding: 12px 14px; margin-top: 4px; }
    .notes-text { font-size: 14px; line-height: 1.5; color: #444; margin-top: 6px; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; padding: 20px 28px; background: #f8f9fc; border-top: 1px solid #eee; }
    .party-title { font-size: 10px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: #999; margin-bottom: 8px; }
    .party-name { font-size: 14px; font-weight: 700; color: #1a1a2e; line-height: 1.4; margin-bottom: 4px; }
    .party-info { font-size: 13px; color: #555; line-height: 1.7; }
    .footer { padding: 16px 28px 20px; border-top: 1px solid #eee; }
    .footer-bank { font-size: 13px; color: #555; line-height: 1.7; }
    .footer-bank strong { color: #1565c0; }
    .stamp { text-align: center; margin-top: 12px; color: #bbb; font-size: 11px; }
    @media print { body { background: #fff; padding: 0; } .card { box-shadow: none; border-radius: 0; } }
  </style>
</head>
<body>
<div class="card">
  <div class="header">
    <div class="header-logo">Честный мастер</div>
    <div class="header-title">Расписка об оплате</div>
    <div class="header-prepay">${prepayment} <span>₽</span></div>
    <div class="header-sub">Предоплата за услуги</div>
    <div class="badge">✓ Оплата подтверждена</div>
  </div>

  <div class="body">
    <div class="two-col">
      <div class="section">
        <p class="label">Заказчик</p>
        <p class="value">${receipt.clientName}</p>
      </div>
      <div class="section">
        <p class="label">Телефон</p>
        <p class="value">${receipt.clientPhone}</p>
      </div>
    </div>

    <div class="two-col">
      <div class="section">
        <p class="label">Вид работ</p>
        <p class="value">${receipt.serviceType}</p>
      </div>
      <div class="section">
        <p class="label">Адрес</p>
        <p class="value">${receipt.city}${district}</p>
      </div>
    </div>

    <div class="divider"></div>

    <p class="label">Перечень работ</p>
    <table class="items-table">
      <thead><tr><th>Наименование</th><th style="text-align:right">Сумма</th></tr></thead>
      <tbody>${lineItemsHtml}</tbody>
    </table>

    <div class="totals">
      <div class="totals-row total-row">
        <span class="totals-label">Итого по смете</span>
        <span class="totals-value">${total} ₽</span>
      </div>
      <div class="totals-row prepay-row">
        <span class="totals-label">Предоплата получена</span>
        <span class="totals-value">${prepayment} ₽</span>
      </div>
    </div>

    ${notesHtml}

    <div class="divider"></div>

    <div class="two-col">
      <div class="section">
        <p class="label">Дата составления</p>
        <p class="value">${date}</p>
      </div>
      <div class="section">
        <p class="label">Номер расписки</p>
        <p class="value">#${receipt.id}</p>
      </div>
    </div>
  </div>

  <div class="parties">
    <div>
      <p class="party-title">Исполнитель</p>
      <p class="party-name">${masterName}</p>
      ${masterPhone ? `<p class="party-info">📞 ${masterPhone}</p>` : ""}
    </div>
    <div>
      <p class="party-title">Организатор</p>
      <p class="party-name">Коваленко Игорь Игоревич</p>
      <p class="party-info">📞 89892860863</p>
    </div>
  </div>

  <div class="footer">
    <p class="footer-bank">Реквизиты: <strong>Альфа Банк</strong> · Коваленко Игорь Игоревич</p>
    <p class="footer-bank">Платформа «Честный мастер» · sfera-project.digital</p>
    <p class="stamp">Расписка сформирована автоматически и действительна без подписи</p>
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
