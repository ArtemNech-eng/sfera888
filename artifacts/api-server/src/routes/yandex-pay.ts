import { Router } from "express";
import { db, transactionsTable, mastersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const YANDEX_PAY_API_KEY = process.env.YANDEX_PAY_API_KEY ?? "";
const DOMAIN = (process.env.REPLIT_DOMAINS ?? "").split(",")[0].trim();
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Sandbox vs production — switch when going live
const YANDEX_PAY_BASE = "https://sandbox.pay.yandex.ru/api/merchant/v1";

// ─── Create a Yandex Pay order and return the payment URL ────────────────────

export async function createYandexPayOrder(
  transactionId: number,
  amountRub: number,
  description: string
): Promise<string> {
  if (!YANDEX_PAY_API_KEY) throw new Error("YANDEX_PAY_API_KEY not set");

  // Include timestamp so repeated button presses always create a new unique order
  const orderId = `commission-${transactionId}-${Date.now()}`;
  const amount = amountRub.toFixed(2);

  const res = await fetch(`${YANDEX_PAY_BASE}/orders`, {
    method: "POST",
    headers: {
      Authorization: `Api-Key ${YANDEX_PAY_API_KEY}`,
      "Content-Type": "application/json",
      "X-Request-Id": `${orderId}-${Date.now()}`,
      "X-Request-Timeout": "10000",
      "X-Request-Attempt": "0",
    },
    body: JSON.stringify({
      orderId,
      currencyCode: "RUB",
      cart: {
        items: [
          {
            productId: orderId,
            title: description,
            quantity: { count: "1" },
            total: amount,
          },
        ],
        total: { amount },
      },
      redirectUrls: {
        onSuccess: `https://${DOMAIN}/api/yandex-pay/success`,
        onError: `https://${DOMAIN}/api/yandex-pay/error`,
      },
    }),
  });

  const data = (await res.json()) as any;

  if (data?.status !== "success") {
    console.error("[yandex-pay] create order failed:", JSON.stringify(data));
    throw new Error(data?.reason ?? "Yandex Pay create order failed");
  }

  return data.data.paymentUrl as string;
}

// ─── Webhook from Yandex Pay ─────────────────────────────────────────────────

router.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const body = req.body as any;

    // Flexible field detection — Yandex Pay may use different field names
    const order = body?.order ?? body;
    const orderId: string = order?.orderId ?? order?.order_id ?? "";
    const status: string = order?.paymentStatus ?? order?.status ?? order?.payment_status ?? "";

    console.log(`[yandex-pay webhook] orderId=${orderId} status=${status}`);

    if (!orderId || !status) return;

    const isPaid = ["CAPTURED", "PAID", "SUCCESS", "captured", "paid", "success"].includes(status);
    if (!isPaid) return;

    const match = orderId.match(/^commission-(\d+)(?:-\d+)?$/);
    if (!match) return;
    const transactionId = parseInt(match[1]);

    const txRows = await db.select().from(transactionsTable).where(eq(transactionsTable.id, transactionId));
    const tx = txRows[0];
    if (!tx || tx.paymentStatus === "paid") return;

    await db.update(transactionsTable).set({
      paymentStatus: "paid",
      paidAt: new Date(),
    }).where(eq(transactionsTable.id, transactionId));

    const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, tx.masterId));
    const master = masterRows[0];
    if (!master) return;

    const newDebt = Math.max(0, Number(master.debt) - Number(tx.commission));
    await db.update(mastersTable).set({ debt: String(newDebt) }).where(eq(mastersTable.id, master.id));

    if (master.telegramId && BOT_TOKEN) {
      await fetch(`${TG_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: master.telegramId,
          parse_mode: "HTML",
          text:
            `✅ <b>Оплата подтверждена!</b>\n\n` +
            `Комиссия по заказу #${tx.orderId} в размере <b>${Number(tx.commission).toLocaleString("ru-RU")} ₽</b> оплачена.\n\n` +
            (newDebt > 0
              ? `Оставшийся долг: <b>${newDebt.toLocaleString("ru-RU")} ₽</b>`
              : `Все задолженности погашены 🎉`),
          reply_markup: {
            inline_keyboard: [[{ text: "« Меню", callback_data: "main_menu" }]],
          },
        }),
      });
    }
  } catch (e) {
    console.error("[yandex-pay webhook] error:", e);
  }
});

// ─── Redirect pages ──────────────────────────────────────────────────────────

router.get("/success", (_req, res) => {
  res.send(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Оплата успешна</title>
<style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f0fdf4}
.card{text-align:center;padding:40px;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:360px}
h2{color:#16a34a;font-size:1.6rem;margin-bottom:8px}p{color:#555;line-height:1.5}
</style></head><body>
<div class="card"><div style="font-size:64px">✅</div>
<h2>Оплата прошла!</h2>
<p>Комиссия оплачена. Вернитесь в Telegram-бот.</p></div></body></html>`);
});

router.get("/error", (_req, res) => {
  res.send(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ошибка оплаты</title>
<style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fef2f2}
.card{text-align:center;padding:40px;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:360px}
h2{color:#dc2626;font-size:1.6rem;margin-bottom:8px}p{color:#555;line-height:1.5}
</style></head><body>
<div class="card"><div style="font-size:64px">❌</div>
<h2>Ошибка оплаты</h2>
<p>Что-то пошло не так. Попробуйте снова или отправьте скриншот оператору.</p></div></body></html>`);
});

export default router;
