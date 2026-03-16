import { Router } from "express";
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
import tasksRouter from "./tasks.js";
import masterReviewsRouter from "./master-reviews.js";

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
router.use("/tasks", tasksRouter);
router.use("/master-reviews", masterReviewsRouter);

// Run trash cleanup on startup, then every hour
runTrashCleanup().catch(console.error);
setInterval(() => runTrashCleanup().catch(console.error), 60 * 60 * 1000);

export default router;
