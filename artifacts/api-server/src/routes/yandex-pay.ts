import { Router } from "express";
import { db, transactionsTable, mastersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const YANDEX_PAY_API_KEY = process.env.YANDEX_PAY_API_KEY ?? "";
const DOMAIN = (process.env.REPLIT_DOMAINS ?? "").split(",")[0].trim();
// Telegram-бот удалён.

const YANDEX_PAY_BASE = "https://sandbox.pay.yandex.ru/api/merchant/v1";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function orderIdForTx(transactionId: number) {
  return `commission-${transactionId}`;
}

async function ypGet(path: string): Promise<any> {
  const res = await fetch(`${YANDEX_PAY_BASE}${path}`, {
    headers: {
      Authorization: `Api-Key ${YANDEX_PAY_API_KEY}`,
      "X-Request-Id": `get-${path}-${Date.now()}`,
      "X-Request-Timeout": "10000",
      "X-Request-Attempt": "0",
    },
  });
  return res.json();
}

async function ypPost(path: string, body: object): Promise<any> {
  const res = await fetch(`${YANDEX_PAY_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Api-Key ${YANDEX_PAY_API_KEY}`,
      "Content-Type": "application/json",
      "X-Request-Id": `post-${path}-${Date.now()}`,
      "X-Request-Timeout": "10000",
      "X-Request-Attempt": "0",
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ─── Create or retrieve Yandex Pay order, return paymentUrl ──────────────────

export async function createYandexPayOrder(
  transactionId: number,
  amountRub: number,
  description: string
): Promise<string> {
  if (!YANDEX_PAY_API_KEY) throw new Error("YANDEX_PAY_API_KEY not set");

  const orderId = orderIdForTx(transactionId);
  const amount = amountRub.toFixed(2);

  const data = await ypPost("/orders", {
    orderId,
    currencyCode: "RUB",
    cart: {
      items: [{ productId: orderId, title: description, quantity: { count: "1" }, total: amount }],
      total: { amount },
    },
    redirectUrls: {
      onSuccess: `https://${DOMAIN}/api/yandex-pay/success`,
      onError: `https://${DOMAIN}/api/yandex-pay/error`,
    },
  });

  // If order already exists — fetch it to get the existing paymentUrl
  if (data?.status !== "success") {
    if (data?.reasonCode === "ORDER_ALREADY_EXISTS") {
      console.log(`[yandex-pay] order ${orderId} already exists, fetching existing...`);
      const existing = await ypGet(`/orders/${encodeURIComponent(orderId)}`);
      console.log(`[yandex-pay] existing order:`, JSON.stringify(existing).slice(0, 300));
      const paymentUrl = existing?.data?.paymentUrl ?? existing?.data?.order?.paymentUrl;
      if (paymentUrl) return paymentUrl as string;
    }
    console.error("[yandex-pay] create order failed:", JSON.stringify(data));
    throw new Error(data?.reason ?? "Yandex Pay create order failed");
  }

  console.log(`[yandex-pay] order created: ${orderId}`);
  return data.data.paymentUrl as string;
}

// ─── Poll Yandex Pay for payment status (no in-memory dependency) ─────────────

export async function pollYandexPayStatus(transactionId: number): Promise<boolean> {
  const orderId = orderIdForTx(transactionId);
  try {
    const data = await ypGet(`/orders/${encodeURIComponent(orderId)}`);
    console.log(`[yandex-pay] poll ${orderId}:`, JSON.stringify(data).slice(0, 400));

    const order = data?.data?.order ?? data?.data ?? data?.order ?? data;
    const status: string =
      order?.paymentStatus ?? order?.payment_status ?? order?.status ?? "";
    console.log(`[yandex-pay] poll status: "${status}"`);

    return ["CAPTURED", "PAID", "SUCCESS", "captured", "paid", "success"].includes(status);
  } catch (e) {
    console.error("[yandex-pay] poll error:", e);
    return false;
  }
}

// ─── Shared: confirm payment in DB ────────────────────────────────────────────

export async function confirmPayment(
  transactionId: number
): Promise<"already_paid" | "not_found" | "confirmed"> {
  const txRows = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.id, transactionId));
  const tx = txRows[0];
  if (!tx) return "not_found";
  if (tx.paymentStatus === "paid") return "already_paid";

  await db
    .update(transactionsTable)
    .set({ paymentStatus: "paid", paidAt: new Date() })
    .where(eq(transactionsTable.id, transactionId));

  const masterRows = await db
    .select()
    .from(mastersTable)
    .where(eq(mastersTable.id, tx.masterId));
  const master = masterRows[0];
  if (master) {
    const newDebt = Math.max(0, Number(master.debt) - Number(tx.commission));
    await db
      .update(mastersTable)
      .set({ debt: String(newDebt) })
      .where(eq(mastersTable.id, master.id));
  }

  return "confirmed";
}

// ─── Webhook from Yandex Pay ─────────────────────────────────────────────────

router.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  console.log("[yandex-pay webhook] received:", JSON.stringify(req.body).slice(0, 500));

  try {
    const body = req.body as any;
    const order = body?.order ?? body?.event?.order ?? body;
    const orderId: string =
      order?.orderId ?? order?.order_id ?? body?.orderId ?? "";
    const status: string =
      order?.paymentStatus ?? order?.status ?? body?.status ?? "";

    console.log(`[yandex-pay webhook] orderId=${orderId} status=${status}`);
    if (!orderId || !status) return;

    const isPaid = ["CAPTURED", "PAID", "SUCCESS", "captured", "paid", "success"].includes(status);
    if (!isPaid) return;

    const match = orderId.match(/^commission-(\d+)(?:-\d+)?$/);
    if (!match) return;
    const transactionId = parseInt(match[1]);

    const result = await confirmPayment(transactionId);
    if (result !== "confirmed") return;

    // Notify master
    const txRows = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.id, transactionId));
    const tx = txRows[0];
    const masterRows = tx
      ? await db.select().from(mastersTable).where(eq(mastersTable.id, tx.masterId))
      : [];
    const master = masterRows[0];

    // Telegram-бот удалён — мастер увидит подтверждение в PWA / Max.
    void master;
    void tx;
  } catch (e) {
    console.error("[yandex-pay webhook] error:", e);
  }
});

// ─── Redirect pages ───────────────────────────────────────────────────────────

router.get("/success", (_req, res) => {
  res.send(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Оплата успешна</title>
<style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f0fdf4}
.card{text-align:center;padding:40px;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:360px}
h2{color:#16a34a;font-size:1.6rem;margin-bottom:8px}p{color:#555;line-height:1.5}</style></head><body>
<div class="card"><div style="font-size:64px">✅</div>
<h2>Оплата прошла!</h2>
<p>Можете закрыть это окно и вернуться в приложение мастера.</p></div></body></html>`);
});

router.get("/error", (_req, res) => {
  res.send(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ошибка оплаты</title>
<style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fef2f2}
.card{text-align:center;padding:40px;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:360px}
h2{color:#dc2626;font-size:1.6rem;margin-bottom:8px}p{color:#555;line-height:1.5}</style></head><body>
<div class="card"><div style="font-size:64px">❌</div>
<h2>Ошибка оплаты</h2>
<p>Попробуйте снова или отправьте скриншот оператору.</p></div></body></html>`);
});

export default router;
