import { db, mastersTable, masterCheckinsTable } from "@workspace/db";
import { eq, isNotNull, and } from "drizzle-orm";
import { sendMaxWithButtons } from "../maxBot.js";

export async function broadcastCheckin(): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  const masters = await db
    .select()
    .from(mastersTable)
    .where(and(eq(mastersTable.status, "active"), isNotNull(mastersTable.maxChatId)));

  let sent = 0;
  for (const master of masters) {
    if (!master.maxChatId) continue;

    const existing = await db
      .select()
      .from(masterCheckinsTable)
      .where(
        and(eq(masterCheckinsTable.masterId, master.id), eq(masterCheckinsTable.date, today))
      );

    if (existing.length > 0 && existing[0].respondedAt !== null) continue;

    const name = master.contractFullName?.split(" ")[0] || master.alias;

    await sendMaxWithButtons(
      master.maxChatId,
      `☀️ Доброе утро, **${name}**!\n\nВы сегодня готовы принимать заказы?`,
      [[
        { text: "✅ Готов", payload: "checkin:yes" },
        { text: "❌ Не готов", payload: "checkin:no" },
      ]]
    );

    if (existing.length === 0) {
      await db.insert(masterCheckinsTable).values({
        masterId: master.id,
        date: today,
        isAvailable: null,
        respondedAt: null,
      });
    }

    sent++;
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`[checkin] Morning broadcast sent to ${sent} master(s) for ${today}`);
}
