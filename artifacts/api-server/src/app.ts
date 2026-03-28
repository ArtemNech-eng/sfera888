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
    const isConfirmed = !!receipt.prepaymentSubmittedAt;

    const lineItemsHtml = lineItems.map(item =>
      `<tr><td class="item-desc">${item.description}</td><td class="item-price">${Number(item.price).toLocaleString("ru-RU")} ₽</td></tr>`
    ).join("");

    const notesHtml = receipt.notes
      ? `<div class="notes-block"><p class="label">Примечание</p><p class="notes-text">${receipt.notes}</p></div>`
      : "";

    const masterName = master?.contractFullName || master?.alias || "Мастер";
    const masterPhone = master?.phone || "";

    const statusBadgeHtml = isConfirmed
      ? `<div class="badge badge-pending">⏳ Предоплата ожидает подтверждения</div>`
      : `<div class="badge badge-unpaid">⚠️ Предоплата не внесена</div>`;

    const confirmSectionHtml = isConfirmed
      ? `<div class="confirm-success">
          <div class="confirm-success-icon">✅</div>
          <div class="confirm-success-title">Заявка принята!</div>
          <p class="confirm-success-sub">Ваше ФИО и скриншот оплаты отправлены оператору. Мы свяжемся с вами в ближайшее время.</p>
          ${receipt.clientSubmittedName ? `<p class="confirm-submitted-name">👤 ${receipt.clientSubmittedName}</p>` : ""}
        </div>`
      : `<div class="confirm-section">
          <div class="confirm-title">📲 Внесите предоплату и подтвердите</div>
          <p class="confirm-desc">Переведите <strong>${prepayment} ₽</strong> на реквизиты ниже, затем введите ваше ФИО и прикрепите скриншот оплаты.</p>

          <div id="form-area">
            <div class="field-group">
              <label class="field-label">Ваше ФИО <span class="req">*</span></label>
              <input id="client-name" type="text" class="field-input" placeholder="Иванов Иван Иванович" autocomplete="name" />
            </div>

            <div class="field-group">
              <label class="field-label">Скриншот оплаты <span class="req">*</span></label>
              <label class="upload-label" for="screenshot-input">
                <span id="upload-text">📎 Прикрепить скриншот</span>
              </label>
              <input id="screenshot-input" type="file" accept="image/*" style="display:none" />
              <div id="preview-wrap" style="display:none;margin-top:10px">
                <img id="preview-img" src="" style="max-width:100%;border-radius:10px;border:1px solid #e0e4ec" />
              </div>
            </div>

            <div id="form-error" style="display:none;color:#c62828;font-size:13px;margin-bottom:8px;padding:8px 12px;background:#ffeaea;border-radius:8px"></div>

            <button id="submit-btn" class="submit-btn">Отправить подтверждение</button>
            <p class="field-note">Данные передаются оператору для подтверждения брони</p>
          </div>

          <div id="success-area" style="display:none">
            <div class="confirm-success">
              <div class="confirm-success-icon">✅</div>
              <div class="confirm-success-title">Заявка отправлена!</div>
              <p class="confirm-success-sub">Оператор свяжется с вами для подтверждения.</p>
            </div>
          </div>
        </div>

        <script>
          const fileInput = document.getElementById('screenshot-input');
          const uploadText = document.getElementById('upload-text');
          const previewWrap = document.getElementById('preview-wrap');
          const previewImg = document.getElementById('preview-img');
          const submitBtn = document.getElementById('submit-btn');
          const formError = document.getElementById('form-error');
          const formArea = document.getElementById('form-area');
          const successArea = document.getElementById('success-area');

          fileInput.addEventListener('change', function() {
            const file = this.files[0];
            if (!file) return;
            uploadText.textContent = '✅ ' + file.name;
            const reader = new FileReader();
            reader.onload = e => { previewImg.src = e.target.result; previewWrap.style.display = 'block'; };
            reader.readAsDataURL(file);
          });

          submitBtn.addEventListener('click', async function() {
            const name = document.getElementById('client-name').value.trim();
            const file = fileInput.files[0];
            formError.style.display = 'none';

            if (!name) { showError('Введите ваше ФИО'); return; }
            if (name.split(' ').filter(w=>w.length>1).length < 2) { showError('Введите полное ФИО (Фамилия Имя Отчество)'); return; }
            if (!file) { showError('Прикрепите скриншот оплаты'); return; }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Отправка...';

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

          function showError(msg) {
            formError.textContent = msg;
            formError.style.display = 'block';
          }
        </script>`;

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
    .badge { display: inline-flex; align-items: center; gap: 6px; border-radius: 20px; padding: 5px 14px; margin-top: 14px; font-size: 13px; font-weight: 600; }
    .badge-unpaid { background: rgba(255,180,0,.25); color: #ffe082; border: 1px solid rgba(255,180,0,.4); }
    .badge-pending { background: rgba(255,255,255,.18); color: #fff; }
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
    .totals-row.remainder-row { border-top: 1px dashed #e0e4ec; margin-top: 6px; padding-top: 8px; }
    .totals-row.remainder-row .totals-label { font-weight: 600; color: #444; }
    .totals-row.remainder-row .totals-value { font-size: 15px; font-weight: 700; color: #333; }
    .guarantee-banner { display: flex; align-items: flex-start; gap: 12px; background: linear-gradient(135deg, #e8f5e9, #f1f8e9); border: 1px solid #c8e6c9; border-radius: 12px; padding: 14px 16px; margin-top: 14px; }
    .guarantee-icon { font-size: 24px; flex-shrink: 0; line-height: 1; }
    .guarantee-text { font-size: 12.5px; color: #2e7d32; line-height: 1.5; }
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
    /* Confirm section */
    .confirm-section { margin: 20px 28px; background: #f0f7ff; border: 1.5px solid #bbdefb; border-radius: 16px; padding: 20px; }
    .confirm-title { font-size: 15px; font-weight: 700; color: #0d47a1; margin-bottom: 8px; }
    .confirm-desc { font-size: 13px; color: #444; line-height: 1.6; margin-bottom: 16px; }
    .field-group { margin-bottom: 14px; }
    .field-label { display: block; font-size: 12px; font-weight: 600; color: #555; margin-bottom: 6px; }
    .req { color: #e53935; }
    .field-input { width: 100%; height: 44px; border: 1.5px solid #c5cae9; border-radius: 10px; padding: 0 14px; font-size: 15px; font-family: inherit; color: #1a1a2e; background: #fff; outline: none; transition: border-color 0.2s; }
    .field-input:focus { border-color: #1565c0; }
    .upload-label { display: flex; align-items: center; justify-content: center; gap: 8px; height: 48px; border: 2px dashed #90caf9; border-radius: 12px; background: #fff; cursor: pointer; font-size: 14px; font-weight: 600; color: #1565c0; transition: background 0.2s; }
    .upload-label:hover { background: #e3f2fd; }
    .submit-btn { width: 100%; height: 52px; background: linear-gradient(135deg, #1565c0, #0d47a1); color: #fff; font-size: 15px; font-weight: 700; border: none; border-radius: 14px; cursor: pointer; margin-top: 6px; letter-spacing: 0.02em; transition: opacity 0.2s; }
    .submit-btn:hover { opacity: 0.92; }
    .submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .field-note { font-size: 11px; color: #999; text-align: center; margin-top: 10px; }
    .confirm-success { margin: 20px 28px; text-align: center; padding: 24px 20px; background: #f1f8e9; border: 1.5px solid #c5e1a5; border-radius: 16px; }
    .confirm-success-icon { font-size: 40px; margin-bottom: 10px; }
    .confirm-success-title { font-size: 18px; font-weight: 700; color: #2e7d32; margin-bottom: 8px; }
    .confirm-success-sub { font-size: 13px; color: #555; line-height: 1.6; }
    .confirm-submitted-name { margin-top: 12px; font-size: 14px; font-weight: 600; color: #2e7d32; }
    @media print { body { background: #fff; padding: 0; } .card { box-shadow: none; border-radius: 0; } .confirm-section,.confirm-success { display: none; } }
  </style>
</head>
<body>
<div class="card">
  <div class="header">
    <div class="header-logo">Честный мастер</div>
    <div class="header-title">Расписка об оплате</div>
    <div class="header-prepay">${prepayment} <span>₽</span></div>
    <div class="header-sub">Предоплата за услуги</div>
    ${statusBadgeHtml}
  </div>

  ${confirmSectionHtml}

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
        <span class="totals-label">Предоплата (бронь)</span>
        <span class="totals-value">${prepayment} ₽</span>
      </div>
      <div class="totals-row remainder-row">
        <span class="totals-label">Остаток после брони</span>
        <span class="totals-value">${remainder} ₽</span>
      </div>
    </div>

    <div class="guarantee-banner">
      <div class="guarantee-icon">🛡️</div>
      <div class="guarantee-text">
        <strong>Гарантия и безопасная сделка</strong><br>
        Оплачивая работы через сервис, вы получаете дополнительную гарантию 6 месяцев на выполненные работы и защиту в рамках безопасной сделки.
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
      <p class="party-name">ИП Коваленко Игорь Геннадьевич</p>
      <p class="party-info">📞 8 (989) 286-08-63</p>
      <p class="party-info">ИНН: 262409599800</p>
      <p class="party-info">ОГРНИП: 325265100150717</p>
    </div>
  </div>

  <div class="footer">
    <p class="footer-bank">Получатель: <strong>ИП Коваленко Игорь Геннадьевич</strong></p>
    <p class="footer-bank">Банк: <strong>Альфа Банк</strong> · Тел. для перевода: <strong>8 (989) 286-08-63</strong></p>
    <p class="footer-bank">ИНН: 262409599800 · ОГРНИП: 325265100150717</p>
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
