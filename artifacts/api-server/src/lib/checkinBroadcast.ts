import { db, mastersTable, masterCheckinsTable, systemSettingsTable } from "@workspace/db";
import { eq, isNotNull, and, isNull } from "drizzle-orm";
import { sendMaxWithButtons, sendMaxMessage } from "../maxBot.js";
import { sendPushToMaster } from "./push.js";

// ─── Morning broadcast ────────────────────────────────────────────────────────

export async function broadcastCheckin(): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  // Mark broadcast as fired in DB — prevents double-fire after restart
  await db
    .insert(systemSettingsTable)
    .values({ key: "checkin_last_broadcast_date", value: today })
    .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: today, updatedAt: new Date() } });

  const masters = await db
    .select()
    .from(mastersTable)
    .where(and(eq(mastersTable.status, "active"), isNotNull(mastersTable.maxChatId)));

  let sent = 0;
  for (const master of masters) {
    if (!master.maxChatId) continue;

    // Skip if already sent today (any existing record = already sent)
    const existing = await db
      .select()
      .from(masterCheckinsTable)
      .where(and(eq(masterCheckinsTable.masterId, master.id), eq(masterCheckinsTable.date, today)));

    if (existing.length > 0) continue;

    const name = master.contractFullName?.split(" ")[0] || master.alias;

    await sendMaxWithButtons(
      master.maxChatId,
      `☀️ Доброе утро, **${name}**!\n\nВы сегодня готовы принимать заказы?\nПри появлении заказа мы отправим его вам в первую очередь.`,
      [[
        { text: "✅ Готов", payload: "checkin:yes" },
        { text: "❌ Не готов", payload: "checkin:no" },
      ]]
    );

    // Push notification to PWA
    await sendPushToMaster(master.id, {
      type: "checkin",
      title: "☀️ Доброе утро!",
      body: `${name}, вы сегодня готовы принимать заказы?`,
      actions: [
        { action: "checkin_yes", title: "✅ Готов" },
        { action: "checkin_no", title: "❌ Не готов" },
      ],
    }).catch(() => {});

    await db.insert(masterCheckinsTable).values({
      masterId: master.id,
      date: today,
      isAvailable: null,
      respondedAt: null,
    });

    sent++;
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`[checkin] Morning broadcast sent to ${sent} master(s) for ${today}`);
}

// ─── Reminder for non-responders ─────────────────────────────────────────────

export async function broadcastCheckinReminder(): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  // Mark reminder as fired
  await db
    .insert(systemSettingsTable)
    .values({ key: "checkin_last_reminder_date", value: today })
    .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: today, updatedAt: new Date() } });

  // Find checkin records created today without a response
  const pending = await db
    .select({ masterId: masterCheckinsTable.masterId })
    .from(masterCheckinsTable)
    .where(and(eq(masterCheckinsTable.date, today), isNull(masterCheckinsTable.respondedAt)));

  if (pending.length === 0) {
    console.log("[checkin] Reminder: no pending non-responders for today");
    return;
  }

  const pendingIds = new Set(pending.map((r) => r.masterId));

  const masters = await db
    .select()
    .from(mastersTable)
    .where(and(eq(mastersTable.status, "active"), isNotNull(mastersTable.maxChatId)));

  let sent = 0;
  for (const master of masters) {
    if (!master.maxChatId || !pendingIds.has(master.id)) continue;

    const name = master.contractFullName?.split(" ")[0] || master.alias;

    await sendMaxWithButtons(
      master.maxChatId,
      `🔔 **${name}**, вы ещё не ответили на утренний вопрос.\n\nВы готовы сегодня принять заказы?`,
      [[
        { text: "✅ Готов", payload: "checkin:yes" },
        { text: "❌ Не готов", payload: "checkin:no" },
      ]]
    );

    sent++;
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`[checkin] Reminder sent to ${sent} non-responder(s) for ${today}`);
}
