// Daily 10:00 MSK push reminder for masters with pending stuck-orders actions.
//
// Triggered by the minute-tick scheduler in src/index.ts. Iterates active
// masters, checks for any non-snoozed pending action, sends one aggregated
// push per master.
//
// Spec: .kiro/specs/stuck-orders-and-master-banner (R8)

import { db, mastersTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { getPendingActionsForMaster, type StuckOrderItem } from "./stuckOrders.js";
import { sendPushToMaster } from "./push.js";

function buildReminderText(visible: StuckOrderItem[]): string {
  if (visible.length === 1) {
    const a = visible[0];
    switch (a.category) {
      case "needs_call_report":
        return `По заказу #${a.id} — отчитайтесь о созвоне с клиентом.`;
      case "needs_result":
        return `По заказу #${a.id} (${a.serviceType}) — пришлите фото и сумму.`;
      case "needs_commission_payment":
        return `По заказу #${a.id} — оплатите комиссию${a.netPayable ? ` (${a.netPayable.toLocaleString("ru-RU")} ₽)` : ""}.`;
      default:
        return `По заказу #${a.id} нужно действие.`;
    }
  }
  return `У вас ${visible.length} заказов требуют действия`;
}

export async function dailyMasterReminder(): Promise<{ sent: number; skipped: number }> {
  const now = new Date();
  const masters = await db
    .select({ id: mastersTable.id, alias: mastersTable.alias })
    .from(mastersTable)
    .where(and(eq(mastersTable.status, "active"), isNull(mastersTable.deletedAt)));

  let sent = 0;
  let skipped = 0;
  for (const m of masters) {
    try {
      const items = await getPendingActionsForMaster(m.id);
      const visible = items.filter(i =>
        ["needs_call_report", "needs_result", "needs_commission_payment"].includes(i.category)
        && (!i.bannerSnoozedUntil || i.bannerSnoozedUntil < now)
      );
      if (visible.length === 0) {
        skipped++;
        continue;
      }
      const text = buildReminderText(visible);
      await sendPushToMaster(m.id, {
        title: "🔔 Напоминание",
        body: text,
        url: "/home",
      });
      sent++;
    } catch (err) {
      console.error(`[dailyMasterReminder] failed for master ${m.id}:`, err);
    }
  }
  console.log(`[dailyMasterReminder] sent=${sent} skipped=${skipped} of ${masters.length} active masters`);
  return { sent, skipped };
}
