import webpush from "web-push";
import { db, clientPushSubscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL ?? "mailto:admin@example.com";
  if (!pub || !priv) return;
  webpush.setVapidDetails(email, pub, priv);
  vapidConfigured = true;
}

export async function sendPushToClient(phone: string, payload: object): Promise<void> {
  ensureVapid();
  if (!vapidConfigured) return;

  const normalizedPhone = phone.replace(/\D/g, "").slice(-10);
  if (normalizedPhone.length < 10) return;

  const subs = await db.select().from(clientPushSubscriptionsTable)
    .where(eq(clientPushSubscriptionsTable.phone, normalizedPhone));

  if (subs.length === 0) return;

  const json = JSON.stringify(payload);
  const stale: number[] = [];

  await Promise.all(subs.map(async sub => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        json,
      );
    } catch (err: any) {
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        stale.push(sub.id);
      }
    }
  }));

  if (stale.length > 0) {
    await Promise.all(stale.map(id =>
      db.delete(clientPushSubscriptionsTable).where(eq(clientPushSubscriptionsTable.id, id)).catch(() => {})
    ));
  }
}
