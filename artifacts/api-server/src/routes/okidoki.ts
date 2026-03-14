import { Router } from "express";
import { db, mastersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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
  } catch (err) {
    console.error("[OkiDoki] Webhook error:", err);
  }
});

export default router;
