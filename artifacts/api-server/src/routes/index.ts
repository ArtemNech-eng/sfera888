import { Router } from "express";
import { db, serviceTypesTable, taskSnoozesTable, operatorPushSubscriptionsTable } from "@workspace/db";
import { lt } from "drizzle-orm";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import usersRouter from "./users.js";
import leadsRouter from "./leads.js";
import ordersRouter from "./orders.js";
import mastersRouter from "./masters.js";
import financeRouter from "./finance.js";
import analyticsRouter from "./analytics.js";
import settingsRouter from "./settings.js";
import voronkaColumnsRouter from "./voronka-columns.js";
import masterChatRouter from "./master-chat.js";
import okidokiRouter from "./okidoki.js";
import dispatchRouter from "./dispatch.js";
import storageRouter from "./storage.js";
import yandexPayRouter from "./yandex-pay.js";
import trashRouter, { runTrashCleanup } from "./trash.js";
import receiptsRouter from "./receipts.js";
import tasksRouter from "./tasks.js";
import masterReviewsRouter from "./master-reviews.js";
import partnerPwaRouter from "./partner-pwa.js";
import crmPartnersRouter from "./crm-partners.js";
import landingRouter from "./landing.js";
import clientRouter from "./client.js";
import avitoRouter from "./avito.js";
import aiOfficeRouter from "./ai-office.js";
import autonomousRouter from "./autonomous.js";
import memoryRouter from "./memory.js";
import workMonitorRouter from "./work-monitor.js";
import workBoardRouter from "./work-board.js";
import workBoardTableRouter from "./work-board-table.js";
import dashboardActionItemsRouter from "./dashboard-action-items.js";
import accountBalanceRouter from "./account-balance.js";
import contractRouter from "./contract.js";
import systemRouter from "./system.js";
import marketplaceRouter from "./marketplace.js";
import dizajnRouter from "./dizajn.js";
import { sendPushToAllOperators } from "../lib/operatorPush.js";
import { buildItems } from "./dashboard-action-items.js";
import { requireRole } from "../middlewares/requireAuth.js";

declare const console: any;

const router = Router();
const ops = requireRole("admin", "master_operator", "lead_operator");

router.use("/", healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/leads", leadsRouter);
router.use("/orders", ordersRouter);
router.use("/masters", mastersRouter);
router.use("/finance", financeRouter);
router.use("/analytics", analyticsRouter);
router.use("/settings", settingsRouter);
router.use("/voronka", voronkaColumnsRouter);
router.use("/master-chat", masterChatRouter);
router.use("/okidoki", okidokiRouter);
router.use("/dispatch", dispatchRouter);
router.use("/yandex-pay", yandexPayRouter);
router.use("/", storageRouter);
router.use("/trash", trashRouter);
router.use("/receipts", receiptsRouter);
router.use("/tasks", tasksRouter);
router.use("/master-reviews", masterReviewsRouter);
router.use("/partner-pwa", partnerPwaRouter);
router.use("/crm", crmPartnersRouter);
router.use("/landing", landingRouter);
router.use("/client", clientRouter);
router.use("/avito", avitoRouter);
router.use("/ai-office", aiOfficeRouter);
router.use("/autonomous", autonomousRouter);
router.use("/agent-memory", memoryRouter);
router.use("/work-monitor", workMonitorRouter);
router.use("/work-board", workBoardRouter);
router.use("/work-board/table", workBoardTableRouter);
router.use("/dashboard", dashboardActionItemsRouter);
router.use("/account-balance", accountBalanceRouter);
router.use("/contract", contractRouter);
router.use("/system", systemRouter);
// AI-design router mounted BEFORE /marketplace to bypass marketplace's
// `requireMarketplaceAuth` Bearer-token middleware. AI-design pages and
// `/img/*` proxy must be reachable from browser (<img src>) without auth —
// see routes/dizajn.ts comment "stream R2 image (public, cached)".
router.use("/marketplace/dizajn", dizajnRouter);
router.use("/marketplace", marketplaceRouter);
// Push subscription endpoint for operators (CRM)
router.post("/push/operator-subscribe", ops, async (req: any, res: any) => {
  const { endpoint, p256dh, auth } = req.body ?? {};
  if (!endpoint || !p256dh || !auth) return res.status(400).json({ error: "Неверные данные подписки" });
  const operatorId = String((req as any).user?.id ?? (req as any).user?.name ?? "unknown");
  try {
    await db
      .insert(operatorPushSubscriptionsTable)
      .values({ operatorId, endpoint, p256dh, auth })
      .onConflictDoUpdate({
        target: operatorPushSubscriptionsTable.endpoint,
        set: { operatorId, p256dh, auth },
      });
    res.json({ ok: true });
  } catch (e: any) {
    console.error("[push/operator-subscribe]", e);
    res.status(500).json({ error: "Ошибка сохранения подписки" });
  }
});

// Seed popular repair services on startup (INSERT ... ON CONFLICT DO NOTHING)
async function seedServices() {
  const popular = [
    "Укладка плитки", "Поклейка обоев", "Покраска стен", "Монтаж ламината",
    "Штукатурка стен", "Электромонтаж", "Сантехника", "Натяжные потолки",
    "Комплексный ремонт", "Шпаклёвка стен и потолков", "Монтаж гипсокартона",
    "Демонтажные работы", "Монтаж межкомнатных дверей", "Монтаж напольных покрытий",
    "Монтаж тёплого пола", "Звукоизоляция", "Отделка балкона и лоджии",
    "Монтаж кухни", "Черновая отделка", "Чистовая отделка",
  ];
  for (const name of popular) {
    await db.insert(serviceTypesTable).values({ name }).onConflictDoNothing().catch(() => {});
  }
}
seedServices().catch(console.error);

// Run trash cleanup on startup, then every hour
runTrashCleanup().catch(console.error);
setInterval(() => runTrashCleanup().catch(console.error), 60 * 60 * 1000);

// Snooze wakeup job: every 15 minutes check for expired snoozes and send push
async function processExpiredSnoozes() {
  const now = new Date();
  const expired = await db
    .select()
    .from(taskSnoozesTable)
    .where(lt(taskSnoozesTable.snoozedUntil, now));

  if (expired.length === 0) return;

  // Build current items to get titles for notifications
  const itemTitles: Map<string, string> = new Map();
  try {
    const items = await buildItems();
    for (const item of items) itemTitles.set(item.id, item.title);
  } catch (e) {
    console.error("[snooze-job] buildItems failed:", e);
  }

  for (const snooze of expired) {
    const itemId = (snooze as any).itemId;
    const title = itemTitles.get(itemId);
    // Skip if the task is no longer in the active items list (already resolved/dismissed)
    if (!title) {
      console.log(`[snooze-job] item=${itemId} no longer active, skipping notification`);
      continue;
    }
    await sendPushToAllOperators({
      type: "snooze_wakeup",
      title: "Напоминание о задаче",
      body: title,
      itemId,
      url: "/dashboard",
    }).catch((e: any) => console.error("[snooze-job] push failed:", e));
    console.log(`[snooze-job] woke up item=${itemId}, sent push`);
  }

  // Delete all expired snoozes in bulk
  await db
    .delete(taskSnoozesTable)
    .where(lt(taskSnoozesTable.snoozedUntil, now))
    .catch((e: any) => console.error("[snooze-job] delete failed:", e));
}

setTimeout(() => processExpiredSnoozes().catch(console.error), 30_000);
setInterval(() => processExpiredSnoozes().catch(console.error), 15 * 60 * 1000);

export default router;
