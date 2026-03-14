import { Router } from "express";
import { db, mastersTable, telegramChatsTable, masterMessagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { notifyMasterActivated } from "../telegram-notify.js";

const router = Router();

// POST /api/okidoki/webhook — receives status updates from doki.online
// external_id = master.id (string) passed when creating the contract
router.post("/webhook", async (req, res) => {
  res.sendStatus(200); // acknowledge immediately
  try {
    const body = req.body;
    const externalId = body?.external_id;
    const statusName: string = body?.status?.name ?? "";
    const internalId: number = body?.status?.internal_id ?? -1;

    // internal_id 2 = "Подписан"
    if (internalId !== 2 && statusName !== "Подписан") return;

    if (!externalId) return;
    const masterId = parseInt(String(externalId), 10);
    if (isNaN(masterId)) return;

    // Activate the master
    await db.update(mastersTable)
      .set({ status: "active" })
      .where(eq(mastersTable.id, masterId));

    console.log(`[OkiDoki] Master ${masterId} activated after contract signing`);

    // Notify master in Telegram
    const masterRows = await db.select().from(mastersTable).where(eq(mastersTable.id, masterId));
    const master = masterRows[0];
    if (master?.telegramId) {
      const tgRows = await db.select().from(telegramChatsTable).where(eq(telegramChatsTable.telegramChatId, master.telegramId));
      const chatId = tgRows[0]?.telegramChatId ?? master.telegramId;
      // Log to CRM chat
      await db.insert(masterMessagesTable).values({
        masterId,
        telegramChatId: chatId,
        text: "✅ Договор подписан — аккаунт активирован",
        fromMaster: false,
        senderName: "system",
        isRead: true,
      }).catch(() => {});
      await notifyMasterActivated(chatId, master.alias);
    }
  } catch (err) {
    console.error("[OkiDoki] Webhook error:", err);
  }
});

export default router;
