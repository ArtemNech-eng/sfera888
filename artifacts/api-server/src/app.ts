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
import multer from "multer";
import { UPLOAD_BASE } from "./config.js";
import { objectStorageClient } from "./lib/objectStorage.js";

const screenshotUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Только изображения"));
  },
});

async function uploadScreenshotToStorage(buffer: Buffer, mimetype: string): Promise<string> {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) throw new Error("Object storage not configured");
  const ext = mimetype === "image/png" ? "png" : "jpg";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const bucket = objectStorageClient.bucket(bucketId);
  await bucket.file(`public/receipt-screenshots/${filename}`).save(buffer, { contentType: mimetype, resumable: false });
  return `/api/storage/public-objects/receipt-screenshots/${filename}`;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

// Trust reverse proxy headers (X-Forwarded-Proto, X-Forwarded-Host) so that
// req.protocol returns "https" in production behind Replit's proxy.
app.set("trust proxy", 1);

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

// ── Public receipt page (no auth required) — served under /api/ so Replit's ──
// ── deployment proxy doesn't intercept it (non-/api paths go to CRM static). ──
app.get("/api/receipt/:token", async (req, res) => {
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
    const remainder = (Number(receipt.totalAmount) - Number(receipt.prepaymentAmount)).toLocaleString("ru-RU");
    const date = new Date(receipt.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const district = receipt.district ? `, ${receipt.district}` : "";
    const lineItems: Array<{description: string; price: number}> = (receipt.lineItems as any) ?? [];
    const isClientSubmitted = !!receipt.prepaymentSubmittedAt;
    const isOperatorConfirmed = !!receipt.prepaymentSeenAt;

    const lineItemsHtml = lineItems.map(item =>
      `<tr><td class="item-desc">${item.description}</td><td class="item-price">${Number(item.price).toLocaleString("ru-RU")} ₽</td></tr>`
    ).join("");

    const notesHtml = receipt.notes
      ? `<div class="notes-block"><p class="label">Примечание</p><p class="notes-text">${receipt.notes}</p></div>`
      : "";

    const masterName = master?.contractFullName || master?.alias || "Мастер";
    const masterPhone = master?.phone || "";

    const statusBadgeHtml = isOperatorConfirmed
      ? `<div class="status-pill confirmed"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Оплата подтверждена</div>`
      : isClientSubmitted
        ? `<div class="status-pill pending"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Проверяем оплату</div>`
        : `<div class="status-pill unpaid"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Бронь не оплачена</div>`;

    const confirmSectionHtml = isClientSubmitted
      ? `<div class="state-box ${isOperatorConfirmed ? "confirmed" : "pending"}">
          <div class="state-icon">${isOperatorConfirmed ? "✅" : "⏳"}</div>
          <div class="state-title ${isOperatorConfirmed ? "confirmed" : "pending"}">${isOperatorConfirmed ? "Оплата подтверждена!" : "Заявка принята!"}</div>
          <p class="state-sub">${isOperatorConfirmed
            ? "Ваша предоплата подтверждена оператором. Мастер приступит к работе в согласованное время."
            : "Ваши данные и скриншот оплаты отправлены оператору. Мы свяжемся с вами в ближайшее время."
          }</p>
          ${receipt.clientSubmittedName ? `<div class="state-name"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>${receipt.clientSubmittedName}</div>` : ""}
        </div>`
      : ``;

    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Смета №${receipt.id} — Честный мастер</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif; background: #f5f3ff; min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 0 0 60px; color: #1a1040; }

    /* ── Top bar ── */
    .topbar { width: 100%; background: #fff; border-bottom: 1.5px solid #ede9fc; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 20px; box-shadow: 0 1px 8px rgba(109,40,217,.06); }
    .topbar-logo { display: flex; align-items: center; gap: 9px; }
    .topbar-icon { width: 30px; height: 30px; background: linear-gradient(135deg,#1e3a8a,#2563eb); border-radius: 9px; display: flex; align-items: center; justify-content: center; }
    .topbar-icon svg { display: block; }
    .topbar-name { font-size: 15px; font-weight: 700; color: #1a1040; letter-spacing: -0.3px; }
    .topbar-sub { font-size: 12px; color: #9490b4; margin-left: 2px; }
    .topbar-install { display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(135deg,#1e3a8a,#1d4ed8); color: #fff; border: none; border-radius: 10px; padding: 7px 12px; font-size: 12px; font-weight: 700; cursor: pointer; text-decoration: none; white-space: nowrap; box-shadow: 0 2px 8px rgba(29,78,216,.3); font-family: inherit; }

    /* ── Card ── */
    .card { background: #fff; max-width: 540px; width: calc(100% - 24px); margin: 24px auto 0; border-radius: 20px; box-shadow: 0 2px 20px rgba(0,0,0,.08), 0 0 0 1px rgba(0,0,0,.04); overflow: hidden; }

    /* ── Header ── */
    .hd { background: #fff; padding: 22px 22px 18px; border-bottom: 1px solid #e5e7eb; }
    .hd-doc { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #9ca3af; margin-bottom: 16px; }
    .hd-amount-label { font-size: 12px; font-weight: 700; color: #1d4ed8; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
    .hd-amount { font-size: 48px; font-weight: 800; color: #111827; letter-spacing: -2px; line-height: 1; }
    .hd-amount span { font-size: 26px; font-weight: 600; color: #6b7280; }
    .hd-secondary { font-size: 13px; color: #6b7280; margin-top: 8px; }
    .hd-meta { margin-top: 10px; font-size: 12px; color: #9ca3af; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .hd-meta-sep { width: 3px; height: 3px; background: #d1d5db; border-radius: 50%; }
    .status-pill { display: inline-flex; align-items: center; gap: 6px; margin-top: 14px; padding: 6px 14px; border-radius: 100px; font-size: 12px; font-weight: 600; }
    .status-pill.unpaid { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
    .status-pill.pending { background: #ede9fe; color: #5b21b6; border: 1px solid #c4b5fd; }
    .status-pill.confirmed { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
    .status-pill svg { flex-shrink: 0; }

    /* ── Trust bar ── */
    .trust-bar { display: grid; grid-template-columns: 1fr 1fr 1fr; background: #f9fafb; border-bottom: 1px solid #e5e7eb; }
    .trust-item { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; padding: 14px 8px; text-align: center; border-right: 1px solid #e5e7eb; }
    .trust-item:last-child { border-right: none; }
    .trust-item-icon { width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
    .trust-item-icon.blue { background: #eff6ff; }
    .trust-item-icon.green { background: #f0fdf4; }
    .trust-item-icon.amber { background: #fffbeb; }
    .trust-item-label { font-size: 11px; font-weight: 600; color: #374151; line-height: 1.3; }
    .trust-item-sub { font-size: 10px; color: #9ca3af; }

    /* ── Status states ── */
    .state-box { margin: 20px; border-radius: 16px; padding: 20px; text-align: center; }
    .state-box.pending { background: linear-gradient(135deg, #eef2ff, #e0e7ff); border: 1px solid #c7d2fe; }
    .state-box.confirmed { background: linear-gradient(135deg, #ecfdf5, #d1fae5); border: 1px solid #a7f3d0; }
    .state-icon { font-size: 36px; margin-bottom: 10px; }
    .state-title { font-size: 17px; font-weight: 700; color: #1a1d2e; margin-bottom: 6px; }
    .state-title.confirmed { color: #065f46; }
    .state-title.pending { color: #3730a3; }
    .state-sub { font-size: 13px; color: #6b7280; line-height: 1.6; }
    .state-name { margin-top: 10px; display: inline-flex; align-items: center; gap: 6px; background: #fff; border-radius: 8px; padding: 6px 12px; font-size: 13px; font-weight: 600; color: #374151; }

    /* ── Section body ── */
    .body { padding: 20px 20px 4px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #e5e7eb; border-radius: 12px; overflow: hidden; margin-bottom: 16px; }
    .info-cell { background: #f9fafb; padding: 12px 14px; }
    .info-cell.full { grid-column: 1 / -1; }
    .info-lbl { font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #9ca3af; margin-bottom: 3px; }
    .info-val { font-size: 14px; font-weight: 500; color: #111827; }

    /* ── Items ── */
    .section-title { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #9ca3af; margin-bottom: 10px; padding: 0 2px; }
    .items-wrap { border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; margin-bottom: 16px; }
    .item-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 11px 14px; border-bottom: 1px solid #f3f4f6; }
    .item-row:last-child { border-bottom: none; }
    .item-name { font-size: 14px; color: #374151; line-height: 1.4; flex: 1; }
    .item-amt { font-size: 14px; font-weight: 600; color: #111827; white-space: nowrap; }

    /* ── Totals ── */
    .totals-wrap { border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; margin-bottom: 16px; }
    .totals-row { display: flex; justify-content: space-between; align-items: center; padding: 11px 14px; border-bottom: 1px solid #f3f4f6; }
    .totals-row:last-child { border-bottom: none; }
    .totals-lbl { font-size: 13px; color: #6b7280; }
    .totals-val { font-size: 14px; font-weight: 600; color: #111827; }
    .totals-row.prepay { background: #eff6ff; }
    .totals-row.prepay .totals-lbl { font-weight: 700; color: #1d4ed8; font-size: 14px; }
    .totals-row.prepay .totals-val { font-size: 20px; font-weight: 800; color: #1d4ed8; }
    .totals-row.remainder .totals-lbl { font-weight: 600; color: #374151; }
    .totals-row.remainder .totals-val { font-weight: 700; color: #374151; }

    /* ── Notes ── */
    .notes-wrap { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px 14px; margin-bottom: 16px; }
    .notes-text { font-size: 14px; color: #374151; line-height: 1.6; margin-top: 5px; }

    /* ── Trust info row ── */
    .trust-detail { display: flex; align-items: flex-start; gap: 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 14px; margin-bottom: 16px; }
    .trust-detail-text { font-size: 12.5px; color: #15803d; line-height: 1.55; }
    .trust-detail-text strong { font-weight: 700; }

    /* ── Parties ── */
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #e5e7eb; border-top: 1px solid #e5e7eb; }
    .party { background: #f9fafb; padding: 16px 18px; }
    .party-lbl { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #9ca3af; margin-bottom: 8px; }
    .party-name { font-size: 13px; font-weight: 700; color: #111827; line-height: 1.4; margin-bottom: 4px; }
    .party-line { font-size: 12px; color: #6b7280; line-height: 1.7; }

    /* ── Footer ── */
    .footer { padding: 14px 20px; background: #fff; border-top: 1px solid #e5e7eb; }
    .footer-row { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #9ca3af; margin-bottom: 4px; }
    .footer-row:last-child { margin-bottom: 0; }
    .footer-row a { color: #6b7280; text-decoration: none; }
    .doc-stamp { text-align: center; padding: 12px 20px 0; font-size: 11px; color: #d1d5db; }

    /* ── Payment block ── */
    .pay-block { margin: 20px; background: #fff; border: 1.5px solid #bfdbfe; border-radius: 16px; overflow: hidden; }
    .pay-block-head { background: #eff6ff; padding: 14px 18px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #bfdbfe; }
    .pay-block-head-text { }
    .pay-block-title { font-size: 14px; font-weight: 700; color: #1e3a8a; }
    .pay-block-subtitle { font-size: 12px; color: #3b82f6; margin-top: 2px; }
    .pay-body { padding: 16px 18px; }
    .pay-phone-label { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #9ca3af; margin-bottom: 6px; }
    .pay-phone { font-size: 30px; font-weight: 800; color: #1d4ed8; letter-spacing: -1px; text-decoration: none; display: block; line-height: 1; margin-bottom: 4px; }
    .pay-bank { font-size: 13px; color: #6b7280; margin-bottom: 14px; }
    .pay-details { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 11px 13px; font-size: 12px; color: #374151; line-height: 1.8; margin-bottom: 12px; }
    .pay-details strong { color: #111827; font-weight: 600; }
    .pay-copy-btn { width: 100%; padding: 13px; background: #1d4ed8; color: #fff; font-size: 14px; font-weight: 700; border: none; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: background 0.15s; }
    .pay-copy-btn:hover { background: #1e40af; }
    .pay-steps { border-top: 1px solid #e5e7eb; padding: 14px 18px; display: flex; flex-direction: column; gap: 10px; }
    .pay-step { display: flex; align-items: flex-start; gap: 12px; }
    .pay-step-num { width: 24px; height: 24px; background: #dbeafe; color: #1d4ed8; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; flex-shrink: 0; margin-top: 1px; }
    .pay-step-text { font-size: 13px; color: #374151; line-height: 1.5; }

    /* ── Confirm form ── */
    .form-block { margin: 20px; background: #f9fafb; border: 1.5px solid #e5e7eb; border-radius: 16px; padding: 18px; }
    .form-title { font-size: 15px; font-weight: 700; color: #111827; margin-bottom: 4px; }
    .form-sub { font-size: 13px; color: #6b7280; margin-bottom: 16px; line-height: 1.5; }
    .field-group { margin-bottom: 12px; }
    .field-label { display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 6px; }
    .req { color: #ef4444; }
    .field-input { width: 100%; height: 46px; border: 1.5px solid #d1d5db; border-radius: 10px; padding: 0 14px; font-size: 15px; font-family: inherit; color: #111827; background: #fff; outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
    .field-input:focus { border-color: #1d4ed8; box-shadow: 0 0 0 3px rgba(29,78,216,.1); }
    .upload-area { border: 2px dashed #d1d5db; border-radius: 12px; background: #fff; cursor: pointer; transition: all 0.2s; display: block; }
    .upload-inner { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 20px; }
    .upload-area:hover { border-color: #1d4ed8; background: #eff6ff; }
    .upload-icon { width: 36px; height: 36px; background: #dbeafe; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
    .upload-text { font-size: 13px; font-weight: 600; color: #1d4ed8; }
    .upload-hint { font-size: 11px; color: #9ca3af; }
    .form-error { display: none; color: #b91c1c; font-size: 13px; margin-bottom: 10px; padding: 10px 12px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; }
    .submit-btn { width: 100%; height: 52px; background: #1d4ed8; color: #fff; font-size: 15px; font-weight: 700; border: none; border-radius: 12px; cursor: pointer; margin-top: 4px; letter-spacing: 0.01em; transition: background 0.15s; font-family: inherit; }
    .submit-btn:hover { background: #1e40af; }
    .submit-btn:disabled { background: #6b7280; cursor: not-allowed; }
    .form-note { font-size: 11px; color: #9ca3af; text-align: center; margin-top: 10px; }

    /* ── Combined booking block ── */
    .combined-block { background: #fff; border: 1.5px solid #bfdbfe; border-radius: 16px; overflow: hidden; }
    .confirm-divider { display: flex; align-items: center; gap: 10px; padding: 4px 18px 16px; }
    .confirm-divider-line { flex: 1; height: 1px; background: #e5e7eb; }
    .confirm-divider-text { font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.07em; white-space: nowrap; }
    .form-inner { padding: 0 18px 18px; }
    .form-inner .form-sub { font-size: 13px; color: #6b7280; margin-bottom: 14px; line-height: 1.5; }

    /* ── Requisites in footer ── */
    .req-section { padding: 14px 18px; border-bottom: 1px solid #e5e7eb; }
    .req-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #9ca3af; margin-bottom: 10px; }
    .req-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; padding: 4px 0; border-bottom: 1px solid #f3f4f6; }
    .req-row:last-child { border-bottom: none; }
    .req-lbl { font-size: 12px; color: #9ca3af; white-space: nowrap; flex-shrink: 0; }
    .req-val { font-size: 12px; color: #374151; font-weight: 500; text-align: right; }

    .success-box { text-align: center; padding: 20px; }
    .success-icon-wrap { width: 64px; height: 64px; background: #d1fae5; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 14px; }
    .success-title { font-size: 18px; font-weight: 700; color: #111827; margin-bottom: 6px; }
    .success-sub { font-size: 13px; color: #6b7280; line-height: 1.6; }

    @media(max-width: 420px) { .hd-amount { font-size: 38px; } .hd-amount span { font-size: 20px; } .info-grid { grid-template-columns: 1fr; } .parties { grid-template-columns: 1fr; } }
    @media print { body { background: #fff; } .card { box-shadow: none; border-radius: 0; margin: 0; width: 100%; } .combined-block, .req-section { display: none; } }
  </style>
</head>
<body>
<div class="topbar">
  <div class="topbar-logo">
    <div class="topbar-icon">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    </div>
    <span class="topbar-name">Честный мастер</span>
  </div>
  <a href="/client/" class="topbar-install" id="pwa-btn">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/></svg>
    Установить приложение
  </a>
</div>

<div class="card">

  <!-- ── HEADER ── -->
  <div class="hd">
    <div class="hd-doc">Смета №${receipt.id} · Честный мастер</div>
    <div class="hd-amount-label">Сумма брони</div>
    <div class="hd-amount">${prepayment} <span>₽</span></div>
    <div class="hd-secondary">Итого по смете: ${total} ₽</div>
    <div class="hd-meta">
      <span>${receipt.city}${district}</span>
      <span class="hd-meta-sep"></span>
      <span>${receipt.serviceType}</span>
      <span class="hd-meta-sep"></span>
      <span>${date}</span>
    </div>
    ${statusBadgeHtml}
  </div>

  <!-- ── TRUST BAR ── -->
  <div class="trust-bar">
    <div class="trust-item">
      <div class="trust-item-icon green">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      </div>
      <div class="trust-item-label">Безопасная сделка</div>
      <div class="trust-item-sub">Гарантия 6 мес.</div>
    </div>
    <div class="trust-item">
      <div class="trust-item-icon blue">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      </div>
      <div class="trust-item-label">ИП зарегистрирован</div>
      <div class="trust-item-sub">ИНН 262409599800</div>
    </div>
    <div class="trust-item">
      <div class="trust-item-icon amber">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 11.9 19.79 19.79 0 0 1 1.6 3.28 2 2 0 0 1 3.58 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.54a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
      </div>
      <div class="trust-item-label">Поддержка</div>
      <div class="trust-item-sub">8 (989) 286-08-63</div>
    </div>
  </div>

  <!-- ── STATUS STATE (submitted / confirmed) ── -->
  ${confirmSectionHtml}

  <!-- ── BODY ── -->
  <div class="body">
    <p class="section-title">Перечень работ</p>
    <div class="items-wrap">
      ${lineItems.map(item => `<div class="item-row"><span class="item-name">${item.description}</span><span class="item-amt">${Number(item.price).toLocaleString("ru-RU")} ₽</span></div>`).join("")}
    </div>

    <div class="totals-wrap">
      <div class="totals-row">
        <span class="totals-lbl">Итого по смете</span>
        <span class="totals-val">${total} ₽</span>
      </div>
      <div class="totals-row prepay">
        <span class="totals-lbl">Бронь мастера (предоплата)</span>
        <span class="totals-val">${prepayment} ₽</span>
      </div>
      <div class="totals-row remainder">
        <span class="totals-lbl">Остаток мастеру по факту работ</span>
        <span class="totals-val">${remainder} ₽</span>
      </div>
    </div>

    ${receipt.notes ? `<p class="section-title">Примечание</p><div class="notes-wrap"><div class="notes-text">${receipt.notes}</div></div>` : ""}

  </div>
</div>

<!-- ── COMBINED BOOKING + CONFIRM BLOCK ── -->
${!isClientSubmitted ? `<div style="max-width:540px;width:calc(100% - 24px);margin:16px auto 0">
  <div class="combined-block">
    <div class="pay-block-head">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
      <div class="pay-block-head-text">
        <div class="pay-block-title">Забронируйте мастера</div>
        <div class="pay-block-subtitle">Внесите бронь ${prepayment} ₽ — мастер будет закреплён за вами</div>
      </div>
    </div>
    <div class="pay-body">
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:10px 14px;margin-bottom:14px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center">
        <div style="font-size:11px;color:#0369a1;line-height:1.4">Мастер не<br>возьмёт другой<br>заказ</div>
        <div style="font-size:11px;color:#0369a1;line-height:1.4;border-left:1px solid #bae6fd;border-right:1px solid #bae6fd">Гарантия<br>6 месяцев<br>на работы</div>
        <div style="font-size:11px;color:#0369a1;line-height:1.4">Оплата<br>защищена<br>платформой</div>
      </div>
      <div class="pay-phone-label">Переведите на номер (СБП / Альфа Банк)</div>
      <a href="tel:+79892860863" class="pay-phone">8 989 286-08-63</a>
      <div class="pay-bank">Альфа Банк · реквизиты в разделе ниже</div>
      <button class="pay-copy-btn" id="copy-phone-btn" onclick="navigator.clipboard.writeText('79892860863').then(()=>{this.innerHTML='<svg width=\\'16\\' height=\\'16\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'#fff\\' stroke-width=\\'2.5\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'><polyline points=\\'20 6 9 17 4 12\\'/></svg> Скопировано!';setTimeout(()=>{this.innerHTML='<svg width=\\'16\\' height=\\'16\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'#fff\\' stroke-width=\\'2\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'><rect x=\\'9\\' y=\\'9\\' width=\\'13\\' height=\\'13\\' rx=\\'2\\' ry=\\'2\\'/><path d=\\'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1\\'/></svg> Скопировать номер телефона'},2500)})">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        Скопировать номер телефона
      </button>
    </div>
    <div class="confirm-divider">
      <div class="confirm-divider-line"></div>
      <div class="confirm-divider-text">Подтвердите перевод</div>
      <div class="confirm-divider-line"></div>
    </div>
    <div class="form-inner">
      <div class="form-sub">После перевода введите ФИО и прикрепите скриншот — оператор подтвердит бронь.</div>
      <div id="form-area">
        <div class="field-group">
          <label class="field-label" for="client-name">Ваше ФИО <span class="req">*</span></label>
          <input id="client-name" type="text" class="field-input" placeholder="Иванов Иван Иванович" autocomplete="name" />
        </div>
        <div class="field-group">
          <label class="field-label">Скриншот оплаты <span class="req">*</span></label>
          <label class="upload-area" for="screenshot-input">
            <div class="upload-inner">
              <div class="upload-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              </div>
              <div class="upload-text" id="upload-text">Прикрепить скриншот</div>
              <div class="upload-hint">JPG, PNG · до 10 МБ</div>
            </div>
          </label>
          <input id="screenshot-input" type="file" accept="image/*" style="display:none" />
          <div id="preview-wrap" style="display:none;margin-top:10px">
            <img id="preview-img" src="" style="max-width:100%;border-radius:10px;border:1px solid #e5e7eb" />
          </div>
        </div>
        <div id="form-error" class="form-error"></div>
        <button id="submit-btn" class="submit-btn">Отправить подтверждение</button>
        <p class="form-note">Данные передаются оператору · Защищено платформой «Честный мастер»</p>
      </div>
      <div id="success-area" style="display:none">
        <div class="success-box">
          <div class="success-icon-wrap">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div class="success-title">Заявка отправлена!</div>
          <div class="success-sub">Оператор проверит ваш скриншот и подтвердит бронь в ближайшее время.</div>
        </div>
      </div>
    </div>
  </div>
</div>` : ""}

<!-- ── BOTTOM CARD: РЕКВИЗИТЫ + PARTIES + FOOTER ── -->
<div style="max-width:540px;width:calc(100% - 24px);margin:12px auto 0">
  <div class="card">
    ${!isClientSubmitted ? `<div class="req-section">
      <div class="req-title">Реквизиты для перевода</div>
      <div class="req-row"><span class="req-lbl">Телефон (СБП)</span><span class="req-val">8 989 286-08-63</span></div>
      <div class="req-row"><span class="req-lbl">Банк</span><span class="req-val">Альфа Банк · СБП</span></div>
      <div class="req-row"><span class="req-lbl">Получатель</span><span class="req-val">ИП Коваленко Игорь Геннадьевич</span></div>
      <div class="req-row"><span class="req-lbl">ИНН</span><span class="req-val">262409599800</span></div>
      <div class="req-row"><span class="req-lbl">Назначение</span><span class="req-val">Бронирование по смете №${receipt.id}</span></div>
    </div>` : ""}
    <div class="parties">
      <div class="party">
        <div class="party-lbl">Исполнитель</div>
        <div class="party-name">${masterName}</div>
        ${masterPhone ? `<div class="party-line">${masterPhone}</div>` : ""}
      </div>
      <div class="party">
        <div class="party-lbl">Организатор</div>
        <div class="party-name">ИП Коваленко И.Г.</div>
        <div class="party-line">ИНН 262409599800</div>
        <div class="party-line">ОГРНИП 325265100150717</div>
        <div class="party-line">Альфа Банк · 8 (989) 286-08-63</div>
      </div>
    </div>
    <div class="footer">
      <div class="footer-row">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        Смета №${receipt.id} · ${date} · действительна без подписи
      </div>
      <div class="footer-row">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        Платформа «Честный мастер» · <a href="https://sfera-project.digital">sfera-project.digital</a>
      </div>
    </div>
  </div>
</div>

<script>
  // ── PWA install prompt ──────────────────────────────────────────────────────
  let _pwaPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _pwaPrompt = e;
  });
  const pwaBtn = document.getElementById('pwa-btn');
  if (pwaBtn) {
    pwaBtn.addEventListener('click', async (e) => {
      if (_pwaPrompt) {
        e.preventDefault();
        _pwaPrompt.prompt();
        const { outcome } = await _pwaPrompt.userChoice;
        if (outcome === 'accepted') _pwaPrompt = null;
      }
      // else: follows href="/client/" naturally
    });
  }

  // ── Payment form ────────────────────────────────────────────────────────────
  const fileInput = document.getElementById('screenshot-input');
  const uploadText = document.getElementById('upload-text');
  const previewWrap = document.getElementById('preview-wrap');
  const previewImg = document.getElementById('preview-img');
  const submitBtn = document.getElementById('submit-btn');
  const formError = document.getElementById('form-error');
  const formArea = document.getElementById('form-area');
  const successArea = document.getElementById('success-area');

  if (fileInput) {
    fileInput.addEventListener('change', function() {
      const file = this.files[0];
      if (!file) return;
      uploadText.textContent = '✓ ' + file.name;
      const reader = new FileReader();
      reader.onload = e => { previewImg.src = e.target.result; previewWrap.style.display = 'block'; };
      reader.readAsDataURL(file);
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', async function() {
      const name = document.getElementById('client-name').value.trim();
      const file = fileInput.files[0];
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
</html>`;
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
      screenshotUrl = await uploadScreenshotToStorage(req.file.buffer, req.file.mimetype);
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

    res.json({ ok: true, message: "Подтверждение принято. Оператор свяжется с вами." });
  } catch (err) {
    console.error("[receipt-confirm]", err);
    res.status(500).json({ error: "Ошибка сервера" });
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
