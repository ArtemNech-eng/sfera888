import { db, mastersTable, masterCheckinsTable, systemSettingsTable, masterMessagesTable } from "@workspace/db";
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
    .where(and(eq(mastersTable.status, "active"), isNull(mastersTable.deletedAt)));

  const withMax = masters.filter(m => m.maxChatId);
  console.log(`[checkin] broadcast: ${masters.length} active masters, ${withMax.length} with maxChatId`);

  let sent = 0;
  for (const master of masters) {
    // Skip if already sent today (any existing record = already sent)
    const existing = await db
      .select()
      .from(masterCheckinsTable)
      .where(and(eq(masterCheckinsTable.masterId, master.id), eq(masterCheckinsTable.date, today)));

    if (existing.length > 0) continue;

    const name = master.contractFullName?.split(" ")[0] || master.alias;
    const checkinText = `☀️ Доброе утро, **${name}**!\n\nВы сегодня готовы принимать заказы?\nПри появлении заказа мы отправим его вам в первую очередь.`;

    // MAX — только для привязанных мастеров
    if (master.maxChatId) {
      await sendMaxWithButtons(
        master.maxChatId,
        checkinText,
        [[
          { text: "✅ Готов", payload: "checkin:yes" },
          { text: "❌ Не готов", payload: "checkin:no" },
        ]]
      );
    }

    // Push notification to PWA — для всех активных мастеров
    await sendPushToMaster(master.id, {
      type: "checkin",
      title: "☀️ Доброе утро!",
      body: `${name}, вы сегодня готовы принимать заказы?`,
      actions: [
        { action: "checkin_yes", title: "✅ Готов" },
        { action: "checkin_no", title: "❌ Не готов" },
      ],
    }).catch(() => {});

    // Сохраняем сообщение в CRM чат, чтобы оператор видел отправку
    await db.insert(masterMessagesTable).values({
      masterId: master.id,
      telegramChatId: master.telegramId ?? `pwa_${master.id}`,
      text: checkinText,
      fromMaster: false,
      senderName: "Система",
      isRead: true,
      photoUrl: null,
      telegramMessageId: null,
      maxMid: null,
    });

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
    .where(and(eq(mastersTable.status, "active"), isNull(mastersTable.deletedAt)));

  const withMax = masters.filter(m => m.maxChatId);
  console.log(`[checkin] reminder: ${masters.length} active masters, ${withMax.length} with maxChatId`);

  let sent = 0;
  for (const master of masters) {
    if (!pendingIds.has(master.id)) continue;

    const name = master.contractFullName?.split(" ")[0] || master.alias;

    // MAX — только для привязанных мастеров
    if (master.maxChatId) {
      await sendMaxWithButtons(
        master.maxChatId,
        `🔔 **${name}**, вы ещё не ответили на утренний вопрос.\n\nВы готовы сегодня принять заказы?`,
        [[
          { text: "✅ Готов", payload: "checkin:yes" },
          { text: "❌ Не готов", payload: "checkin:no" },
        ]]
      );
    }

    // Push reminder — для всех активных мастеров
    await sendPushToMaster(master.id, {
      type: "checkin",
      title: "🔔 Напоминание",
      body: `${name}, вы ещё не ответили — готовы ли вы сегодня принимать заказы?`,
    }).catch(() => {});

    sent++;
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`[checkin] Reminder sent to ${sent} non-responder(s) for ${today}`);
}
