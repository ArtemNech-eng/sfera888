import { Router } from "express";
import { db, serviceTypesTable } from "@workspace/db";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import usersRouter from "./users.js";
import leadsRouter from "./leads.js";
import ordersRouter from "./orders.js";
import mastersRouter from "./masters.js";
import financeRouter from "./finance.js";
import analyticsRouter from "./analytics.js";
import settingsRouter from "./settings.js";
import telegramRouter from "./telegram.js";
import voronkaColumnsRouter from "./voronka-columns.js";
import masterChatRouter from "./master-chat.js";
import okidokiRouter from "./okidoki.js";
import dispatchRouter from "./dispatch.js";
import storageRouter from "./storage.js";
import tgFileRouter from "./tg-file.js";
import yandexPayRouter from "./yandex-pay.js";
import trashRouter, { runTrashCleanup } from "./trash.js";
import receiptsRouter from "./receipts.js";
import tasksRouter from "./tasks.js";
import masterReviewsRouter from "./master-reviews.js";
import masterPwaRouter from "./master-pwa.js";
import contractRouter from "./contract.js";
import clientRouter from "./client.js";
import avitoRouter from "./avito.js";
import aiOfficeRouter from "./ai-office.js";
import autonomousRouter from "./autonomous.js";
import memoryRouter from "./memory.js";
import chatCasesRouter from "./chat-cases.js";
import workMonitorRouter from "./work-monitor.js";
import { processCases, scheduleDigest } from "../lib/casesEngine.js";

const router = Router();

router.use("/", healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/leads", leadsRouter);
router.use("/orders", ordersRouter);
router.use("/masters", mastersRouter);
router.use("/finance", financeRouter);
router.use("/analytics", analyticsRouter);
router.use("/settings", settingsRouter);
router.use("/telegram", telegramRouter);
router.use("/voronka", voronkaColumnsRouter);
router.use("/master-chat", masterChatRouter);
router.use("/okidoki", okidokiRouter);
router.use("/dispatch", dispatchRouter);
router.use("/yandex-pay", yandexPayRouter);
router.use("/", storageRouter);
router.use("/tg-file", tgFileRouter);
router.use("/trash", trashRouter);
router.use("/receipts", receiptsRouter);
router.use("/tasks", tasksRouter);
router.use("/master-reviews", masterReviewsRouter);
router.use("/master-pwa", masterPwaRouter);
router.use("/contract", contractRouter);
router.use("/client", clientRouter);
router.use("/avito", avitoRouter);
router.use("/ai-office", aiOfficeRouter);
router.use("/autonomous", autonomousRouter);
router.use("/agent-memory", memoryRouter);
router.use("/chat-cases", chatCasesRouter);
router.use("/work-monitor", workMonitorRouter);

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

// Cases engine: process on startup, then every 5 minutes
setTimeout(() => processCases().catch(console.error), 10_000);
setInterval(() => processCases().catch(console.error), 5 * 60 * 1000);
scheduleDigest();

export default router;
