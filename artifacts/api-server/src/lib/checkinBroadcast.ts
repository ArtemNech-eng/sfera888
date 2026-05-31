import { db, mastersTable, masterCheckinsTable, systemSettingsTable, masterMessagesTable } from "@workspace/db";
import { eq, isNotNull, and, isNull, inArray, sql } from "drizzle-orm";
import { sendMaxWithButtons } from "../maxBot.js";
import { sendPushToMaster } from "./push.js";
import { runWithConcurrencyLimit } from "./broadcastUtils.js";

const CONCURRENCY = 10;

// ─── Morning broadcast ────────────────────────────────────────────────────────

export async function broadcastCheckin(): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  // Mark broadcast as fired in DB — prevents double-fire after restart
  await db
    .insert(systemSettingsTable)
    .values({ key: "checkin_last_broadcast_date", value: today })
    .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: today, updatedAt: new Date() } });

  // Fetch only needed columns, not the whole row
  const masters = await db
    .select({
      id: mastersTable.id,
      alias: mastersTable.alias,
      contractFullName: mastersTable.contractFullName,
      maxChatId: mastersTable.maxChatId,
      telegramId: mastersTable.telegramId,
    })
    .from(mastersTable)
    .where(and(eq(mastersTable.status, "active"), isNull(mastersTable.deletedAt)));

  const withMax = masters.filter((m) => m.maxChatId);
  console.log(`[checkin] broadcast: ${masters.length} active masters, ${withMax.length} with maxChatId`);

  if (masters.length === 0) {
    console.log("[checkin] no active masters to broadcast to");
    return;
  }

  // Batch-fetch existing checkins for today in ONE query
  const masterIds = masters.map((m) => m.id);
  const existingRows = await db
    .select({ masterId: masterCheckinsTable.masterId })
    .from(masterCheckinsTable)
    .where(and(eq(masterCheckinsTable.date, today), inArray(masterCheckinsTable.masterId, masterIds)));

  const existingIds = new Set(existingRows.map((r) => r.masterId));
  const targets = masters.filter((m) => !existingIds.has(m.id));

  console.log(`[checkin] ${targets.length} masters need broadcast (skipped ${existingIds.size} already sent)`);

  if (targets.length === 0) {
    console.log("[checkin] all masters already have a checkin record for today");
    return;
  }

  // Build message + checkin records for bulk insert
  const messageValues: Array<{
    masterId: number;
    telegramChatId: string;
    text: string;
    fromMaster: boolean;
    senderName: string;
    isRead: boolean;
    photoUrl: string | null;
    telegramMessageId: number | null;
    maxMid: string | null;
  }> = [];

  const checkinValues: Array<{
    masterId: number;
    date: string;
    isAvailable: boolean | null;
    respondedAt: Date | null;
  }> = [];

  // Send phase: concurrency-limited parallel sends
  let sent = 0;

  await runWithConcurrencyLimit(targets, CONCURRENCY, async (master, index) => {
    const name = master.contractFullName?.split(" ")[0] || master.alias;
    const checkinText =
      `☀️ Доброе утро, **${name}**!\n\n` +
      `Вы сегодня готовы принимать заказы?\n` +
      `При появлении заказа мы отправим его вам в первую очередь.`;

    // MAX — только для привязанных мастеров
    if (master.maxChatId) {
      try {
        await sendMaxWithButtons(
          master.maxChatId,
          checkinText,
          [
            [
              { text: "✅ Готов", payload: "checkin:yes" },
              { text: "❌ Не готов", payload: "checkin:no" },
            ],
          ]
        );
      } catch (e) {
        console.error(`[checkin] MAX send failed for master ${master.id}:`, e);
      }
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

    // Collect for bulk insert
    messageValues.push({
      masterId: master.id,
      telegramChatId: String(master.telegramId ?? `pwa_${master.id}`),
      text: checkinText,
      fromMaster: false,
      senderName: "Система",
      isRead: true,
      photoUrl: null,
      telegramMessageId: null,
      maxMid: null,
    });

    checkinValues.push({
      masterId: master.id,
      date: today,
      isAvailable: null,
      respondedAt: null,
    });

    sent++;

    // Log progress every 10 masters
    if ((index + 1) % 10 === 0 || index === targets.length - 1) {
      console.log(`[checkin] progress: ${index + 1}/${targets.length} masters processed`);
    }
  });

  // Bulk insert messages and checkins
  if (messageValues.length > 0) {
    try {
      await db.insert(masterMessagesTable).values(messageValues);
      console.log(`[checkin] bulk-inserted ${messageValues.length} messages`);
    } catch (e) {
      console.error("[checkin] bulk insert messages failed:", e);
    }
  }

  if (checkinValues.length > 0) {
    try {
      await db.insert(masterCheckinsTable).values(checkinValues);
      console.log(`[checkin] bulk-inserted ${checkinValues.length} checkins`);
    } catch (e) {
      console.error("[checkin] bulk insert checkins failed:", e);
    }
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
    .select({
      id: mastersTable.id,
      alias: mastersTable.alias,
      contractFullName: mastersTable.contractFullName,
      maxChatId: mastersTable.maxChatId,
    })
    .from(mastersTable)
    .where(and(eq(mastersTable.status, "active"), isNull(mastersTable.deletedAt)));

  const targets = masters.filter((m) => pendingIds.has(m.id));
  const withMax = targets.filter((m) => m.maxChatId);
  console.log(
    `[checkin] reminder: ${targets.length} pending non-responders, ${withMax.length} with maxChatId`
  );

  if (targets.length === 0) return;

  let sent = 0;

  await runWithConcurrencyLimit(targets, CONCURRENCY, async (master, index) => {
    const name = master.contractFullName?.split(" ")[0] || master.alias;

    // MAX — только для привязанных мастеров
    if (master.maxChatId) {
      try {
        await sendMaxWithButtons(
          master.maxChatId,
          `🔔 **${name}**, вы ещё не ответили на утренний вопрос.\n\nВы готовы сегодня принять заказы?`,
          [
            [
              { text: "✅ Готов", payload: "checkin:yes" },
              { text: "❌ Не готов", payload: "checkin:no" },
            ],
          ]
        );
      } catch (e) {
        console.error(`[checkin] MAX reminder failed for master ${master.id}:`, e);
      }
    }

    // Push reminder — для всех активных мастеров
    await sendPushToMaster(master.id, {
      type: "checkin",
      title: "🔔 Напоминание",
      body: `${name}, вы ещё не ответили — готовы ли вы сегодня принимать заказы?`,
    }).catch(() => {});

    sent++;

    if ((index + 1) % 10 === 0 || index === targets.length - 1) {
      console.log(`[checkin] reminder progress: ${index + 1}/${targets.length} masters processed`);
    }
  });

  console.log(`[checkin] Reminder sent to ${sent} non-responder(s) for ${today}`);
}
