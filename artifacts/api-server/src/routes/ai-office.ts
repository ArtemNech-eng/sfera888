import { Router } from "express";
import { db } from "@workspace/db";
import { sql, and, eq, isNull, inArray, lt } from "drizzle-orm";
import { mastersTable, ordersTable } from "@workspace/db";
import { sendMaxMessage } from "../maxBot.js";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMskNow() {
  return new Date(Date.now() + 3 * 60 * 60 * 1000);
}

async function saveScenarioRun(
  scenario: string,
  runType: "manual" | "auto",
  status: "success" | "error",
  summary: unknown,
  errorText: string | null,
  durationMs: number
) {
  await db.execute(sql`
    INSERT INTO scenario_runs (scenario, run_type, status, summary, error_text, duration_ms, created_at)
    VALUES (${scenario}, ${runType}, ${status}, ${JSON.stringify(summary ?? null)}::jsonb, ${errorText}, ${durationMs}, NOW())
  `);
}

async function getScenarioSettings(): Promise<Record<string, boolean>> {
  const rows = await db.execute(sql`SELECT scenario, auto_enabled FROM scenario_settings`);
  const map: Record<string, boolean> = {};
  for (const r of rows.rows as any[]) map[r.scenario] = !!r.auto_enabled;
  return map;
}

async function notifyAdminError(scenario: string, error: string) {
  const admins = await db.execute(sql`
    SELECT max_chat_id FROM masters WHERE max_chat_id IS NOT NULL
    AND deleted_at IS NULL LIMIT 1
  `);
  const adminRow = (admins.rows[0] as any);
  if (adminRow?.max_chat_id) {
    await sendMaxMessage(adminRow.max_chat_id, `⚠️ Сценарий [${scenario}] завершился с ошибкой:\n${error}`);
  }
}

// ─── Scenario 1: Broadcast Open Orders ────────────────────────────────────────

async function runBroadcastOrders() {
  const orders = await db.execute(sql`
    SELECT id, city, district, service_type, area, scheduled_at, comment
    FROM orders
    WHERE status = 'waiting_master' AND deleted_at IS NULL
    ORDER BY created_at ASC
  `);

  if ((orders.rows as any[]).length === 0) {
    return { totalOrders: 0, totalSent: 0, citySummary: {} };
  }

  // Masters: active, has Max chat, with their active order counts
  const masters = await db.execute(sql`
    SELECT m.id, m.alias, m.city, m.specialization, m.specializations,
           m.max_chat_id, m.accepted_orders, m.total_leads_received,
           COALESCE(active.cnt, 0) AS active_orders
    FROM masters m
    LEFT JOIN (
      SELECT master_id, COUNT(*) AS cnt
      FROM orders
      WHERE status IN ('master_assigned', 'in_progress') AND deleted_at IS NULL
      GROUP BY master_id
    ) active ON active.master_id = m.id
    WHERE m.status = 'active' AND m.deleted_at IS NULL AND m.max_chat_id IS NOT NULL
  `);

  const mastersList = masters.rows as any[];
  let totalSent = 0;
  const citySummary: Record<string, { orders: number; masters: number }> = {};

  for (const order of orders.rows as any[]) {
    const serviceType = order.service_type as string;
    const stLower = serviceType.toLowerCase();

    const matching = mastersList
      .filter(m => {
        if (m.city !== order.city) return false;
        if (Number(m.active_orders) >= 3) return false;
        const specs: string[] = Array.isArray(m.specializations) && m.specializations.length > 0
          ? m.specializations
          : [m.specialization ?? ""];
        return specs.some(s =>
          s.toLowerCase().includes(stLower) ||
          stLower.includes(s.toLowerCase())
        );
      })
      .sort((a, b) => {
        const convA = a.total_leads_received > 0 ? a.accepted_orders / a.total_leads_received : 0;
        const convB = b.total_leads_received > 0 ? b.accepted_orders / b.total_leads_received : 0;
        return convB - convA;
      });

    if (matching.length === 0) continue;

    const scheduledText = order.scheduled_at
      ? new Date(order.scheduled_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })
      : "по договорённости";

    const areaStr = order.area ? `${Number(order.area).toFixed(0)} м²` : "—";

    const message =
      `🔔 Новый заказ!\n\n` +
      `📍 ${order.city}, ${order.district}\n` +
      `🔨 ${order.service_type}\n` +
      `📐 ${areaStr}\n` +
      `📅 ${scheduledText}\n\n` +
      `Откликнитесь в приложении чтобы взять заказ 👍`;

    for (const m of matching) {
      await sendMaxMessage(m.max_chat_id, message);
      totalSent++;
    }

    if (!citySummary[order.city]) citySummary[order.city] = { orders: 0, masters: 0 };
    citySummary[order.city].orders++;
    citySummary[order.city].masters += matching.length;
  }

  return { totalOrders: (orders.rows as any[]).length, totalSent, citySummary };
}

// ─── Scenario 2: Payment Reminders ────────────────────────────────────────────

async function runPaymentReminders() {
  const now = new Date();
  const h24ago = new Date(now.getTime() - 24 * 3600_000).toISOString();

  const rows = await db.execute(sql`
    SELECT r.id, r.order_id, r.created_at, r.service_type, r.district, r.city,
           m.alias AS master_alias, m.max_chat_id,
           o.status AS order_status
    FROM receipts r
    JOIN orders o ON o.id = r.order_id
    JOIN masters m ON m.id = r.master_id
    WHERE r.prepayment_submitted_at IS NULL
      AND r.created_at < ${h24ago}
      AND o.status NOT IN ('completed', 'cancelled', 'cancellation_requested', 'waiting_master')
      AND o.deleted_at IS NULL
      AND m.max_chat_id IS NOT NULL
  `);

  let sent24h = 0, sent48h = 0, returnedToPool = 0;

  for (const r of rows.rows as any[]) {
    const hoursElapsed = (now.getTime() - new Date(r.created_at).getTime()) / 3600_000;
    const chatId = r.max_chat_id;

    if (hoursElapsed >= 72) {
      await db.execute(sql`
        UPDATE orders SET status = 'waiting_master', master_id = NULL, updated_at = NOW()
        WHERE id = ${r.order_id} AND status NOT IN ('completed', 'cancelled', 'waiting_master')
      `);
      const msg =
        `${r.master_alias}, заказ #${r.order_id} возвращён в пул — клиент не оплатил предоплату.\n\n` +
        `Готовим для вас новый заказ.\nПроверяйте приложение 👍`;
      await sendMaxMessage(chatId, msg);
      returnedToPool++;
    } else if (hoursElapsed >= 48) {
      const days = Math.ceil(hoursElapsed / 24);
      const msg =
        `⚠️ ${r.master_alias}, по заказу #${r.order_id} предоплата не поступила уже ${days} дня.\n\n` +
        `Если клиент не оплатит в течение 24 часов — заказ вернётся в пул и мы подготовим для вас новую заявку.\n\n` +
        `Не ждите — заказов много 👍`;
      await sendMaxMessage(chatId, msg);
      sent48h++;
    } else {
      const location = r.district || r.city;
      const msg =
        `👋 ${r.master_alias}, добрый день!\n\n` +
        `По заказу #${r.order_id} (${r.service_type}, ${location}) клиент пока не оплатил предоплату.\n\n` +
        `Напомните клиенту про бронь — одно сообщение часто решает вопрос 👍\n\n` +
        `Если клиент отказался — нажмите «Отказ клиента» в приложении, и мы дадим вам новый заказ.`;
      await sendMaxMessage(chatId, msg);
      sent24h++;
    }
  }

  return { sent24h, sent48h, returnedToPool };
}

// ─── Scenario 3: Order Diagnostics ────────────────────────────────────────────

async function runOrderDiagnostics() {
  const now = new Date();

  const rows = await db.execute(sql`
    SELECT o.id, o.city, o.district, o.service_type, o.area,
           o.status, o.assigned_at, o.updated_at, o.order_amount,
           m.alias AS master_alias, m.max_chat_id,
           r.prepayment_submitted_at, r.total_amount AS receipt_amount,
           ARRAY_LENGTH(o.photos_before, 1) AS photos_before_count,
           ARRAY_LENGTH(o.photos_after, 1) AS photos_after_count
    FROM orders o
    LEFT JOIN masters m ON m.id = o.master_id
    LEFT JOIN receipts r ON r.order_id = o.id
    WHERE o.status IN ('master_assigned', 'in_progress')
      AND o.deleted_at IS NULL
    ORDER BY o.assigned_at ASC NULLS LAST
  `);

  const critical: any[] = [];
  const warning: any[] = [];
  const ok: any[] = [];
  let criticalAmount = 0;
  let warningAmount = 0;

  for (const o of rows.rows as any[]) {
    const daysSinceAssigned = o.assigned_at
      ? (now.getTime() - new Date(o.assigned_at).getTime()) / 86_400_000
      : 0;
    const daysSinceUpdated = (now.getTime() - new Date(o.updated_at).getTime()) / 86_400_000;
    const hoursSinceAssigned = daysSinceAssigned * 24;
    const prepaidOk = !!o.prepayment_submitted_at;
    const amount = Number(o.order_amount ?? o.receipt_amount ?? 0);

    let risk = "ok";
    const reasons: string[] = [];

    // Master assigned but no response
    if (o.status === "master_assigned") {
      if (daysSinceAssigned >= 2) {
        risk = "critical";
        reasons.push(`Мастер назначен ${Math.floor(daysSinceAssigned)} дн. назад — нет отклика`);
      } else if (daysSinceAssigned >= 1) {
        if (risk !== "critical") risk = "warning";
        reasons.push(`Мастер назначен ${Math.floor(daysSinceAssigned)} дн. назад`);
      }
    }

    // Prepayment overdue
    if (!prepaidOk) {
      if (hoursSinceAssigned >= 72) {
        risk = "critical";
        reasons.push("Предоплата не оплачена > 72ч");
      } else if (hoursSinceAssigned >= 24) {
        if (risk !== "critical") risk = "warning";
        reasons.push("Предоплата не оплачена > 24ч");
      }
    }

    // Order stale
    if (o.status === "in_progress") {
      if (daysSinceUpdated >= 14) {
        risk = "critical";
        reasons.push(`В работе > 14 дней без обновлений`);
      } else if (daysSinceUpdated >= 7) {
        if (risk !== "critical") risk = "warning";
        reasons.push(`В работе > 7 дней без обновлений`);
      }
    }

    const entry = {
      orderId: o.id,
      masterAlias: o.master_alias ?? "—",
      maxChatId: o.max_chat_id,
      city: o.city,
      district: o.district,
      serviceType: o.service_type,
      status: o.status,
      daysSinceAssigned: Math.floor(daysSinceAssigned),
      daysSinceUpdated: Math.floor(daysSinceUpdated),
      prepaidOk,
      amount,
      risk,
      reasons,
    };

    if (risk === "critical") { critical.push(entry); criticalAmount += amount; }
    else if (risk === "warning") { warning.push(entry); warningAmount += amount; }
    else ok.push(entry);
  }

  return { critical, warning, ok, totalAmount: { critical: criticalAmount, warning: warningAmount } };
}

// ─── Scenario 4: Price Analysis ───────────────────────────────────────────────

async function runPriceAnalysis() {
  const rows = await db.execute(sql`
    SELECT o.service_type, o.area, o.city, o.order_amount,
           m.alias AS master_alias, m.id AS master_id
    FROM orders o
    JOIN masters m ON m.id = o.master_id
    WHERE o.status IN ('completed', 'in_progress')
      AND o.order_amount IS NOT NULL
      AND o.area IS NOT NULL AND CAST(o.area AS NUMERIC) > 0
      AND o.deleted_at IS NULL
  `);

  const byService: Record<string, number[]> = {};
  const byMaster: Record<string, { alias: string; services: Record<string, number[]> }> = {};
  const byCity: Record<string, Record<string, number[]>> = {};

  for (const o of rows.rows as any[]) {
    const area = Number(o.area);
    const amount = Number(o.order_amount);
    if (!area || !amount || area <= 0 || amount <= 0) continue;
    const ppm2 = amount / area;
    if (!isFinite(ppm2) || ppm2 <= 0 || ppm2 > 100_000) continue;

    const svc = o.service_type as string;
    if (!byService[svc]) byService[svc] = [];
    byService[svc].push(ppm2);

    const mk = String(o.master_id);
    if (!byMaster[mk]) byMaster[mk] = { alias: o.master_alias, services: {} };
    if (!byMaster[mk].services[svc]) byMaster[mk].services[svc] = [];
    byMaster[mk].services[svc].push(ppm2);

    const city = o.city as string;
    if (!byCity[city]) byCity[city] = {};
    if (!byCity[city][svc]) byCity[city][svc] = [];
    byCity[city][svc].push(ppm2);
  }

  function calcStats(prices: number[]) {
    if (prices.length === 0) return null;
    const sorted = [...prices].sort((a, b) => a - b);
    const avg = sorted.reduce((s, p) => s + p, 0) / sorted.length;
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
    return {
      min: Math.round(sorted[0]),
      max: Math.round(sorted[sorted.length - 1]),
      avg: Math.round(avg),
      median: Math.round(median),
      count: sorted.length,
    };
  }

  const services = Object.entries(byService)
    .map(([service, prices]) => ({ service, ...calcStats(prices)! }))
    .filter(s => s.count >= 2)
    .sort((a, b) => b.count - a.count);

  const anomalies: { master: string; service: string; avgPrice: number; marketAvg: number; deviation: number; type: "over" | "under" }[] = [];
  for (const { alias, services: svcMap } of Object.values(byMaster)) {
    for (const [svc, prices] of Object.entries(svcMap)) {
      const market = byService[svc];
      if (!market || market.length < 3) continue;
      const marketAvg = market.reduce((s, p) => s + p, 0) / market.length;
      const masterAvg = prices.reduce((s, p) => s + p, 0) / prices.length;
      const dev = (masterAvg - marketAvg) / marketAvg;
      if (Math.abs(dev) >= 0.3) {
        anomalies.push({
          master: alias,
          service: svc,
          avgPrice: Math.round(masterAvg),
          marketAvg: Math.round(marketAvg),
          deviation: Math.round(dev * 100),
          type: dev > 0 ? "over" : "under",
        });
      }
    }
  }

  const allServices = Object.keys(byService).filter(s => (byService[s]?.length ?? 0) >= 2);
  const cityComparison = Object.entries(byCity).map(([city, svcMap]) => {
    const entry: Record<string, any> = { city };
    for (const svc of allServices) {
      const prices = svcMap[svc];
      if (prices && prices.length > 0) {
        entry[svc] = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);
      }
    }
    return entry;
  });

  return { services, anomalies, cityComparison };
}

// ─── Public runner (used by cron in index.ts) ──────────────────────────────────

export async function runTemplateScenario(
  scenarioId: string,
  runType: "manual" | "auto" = "manual"
): Promise<any> {
  const start = Date.now();
  try {
    let result: any;
    if (scenarioId === "broadcast-orders") result = await runBroadcastOrders();
    else if (scenarioId === "payment-reminders") result = await runPaymentReminders();
    else if (scenarioId === "order-diagnostics") result = await runOrderDiagnostics();
    else if (scenarioId === "price-analysis") result = await runPriceAnalysis();
    else throw new Error(`Unknown scenario: ${scenarioId}`);
    await saveScenarioRun(scenarioId, runType, "success", result, null, Date.now() - start);
    return result;
  } catch (e) {
    await saveScenarioRun(scenarioId, runType, "error", null, String(e), Date.now() - start);
    notifyAdminError(scenarioId, String(e)).catch(() => {});
    throw e;
  }
}

// ─── Scenario metadata ────────────────────────────────────────────────────────

const SCENARIO_META = [
  {
    id: "broadcast-orders",
    title: "📋 Разослать открытые заказы",
    description: "Находит заказы со статусом «ищем мастера», подбирает подходящих мастеров по городу и специализации и отправляет им уведомление в Max.",
    autoInterval: "каждые 15 мин",
  },
  {
    id: "payment-reminders",
    title: "💰 Напомнить об оплате",
    description: "Проверяет сметы, по которым предоплата не поступила более 24 часов, и отправляет напоминания мастерам. После 72 часов — возвращает заказ в пул.",
    autoInterval: "каждые 6 часов",
  },
  {
    id: "order-diagnostics",
    title: "🔍 Диагностика заказов",
    description: "Анализирует активные заказы на риски: нет отклика от мастера, предоплата задерживается, заказ завис. Присваивает уровни 🔴 Критично / 🟡 Внимание / 🟢 Норма.",
    autoInterval: "ежедневно в 9:00",
  },
  {
    id: "price-analysis",
    title: "📊 Анализ рыночных цен",
    description: "Собирает данные смет и заказов, считает среднюю/медианную цену за м² по видам работ и городам, выявляет аномалии у мастеров.",
    autoInterval: "еженедельно пн 8:00",
  },
];

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/ai-office/template-scenarios — list all with last run + settings
router.get("/template-scenarios", async (_req, res) => {
  try {
    const settings = await getScenarioSettings();

    const lastRuns = await db.execute(sql`
      SELECT DISTINCT ON (scenario) scenario, status, summary, error_text, duration_ms, created_at, run_type
      FROM scenario_runs
      ORDER BY scenario, created_at DESC
    `);
    const lastRunMap: Record<string, any> = {};
    for (const r of lastRuns.rows as any[]) lastRunMap[r.scenario] = r;

    const result = SCENARIO_META.map(s => ({
      ...s,
      autoEnabled: settings[s.id] ?? false,
      lastRun: lastRunMap[s.id] ?? null,
    }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/ai-office/template-scenarios/:id/run — manual run
router.post("/template-scenarios/:id/run", async (req, res) => {
  const { id } = req.params;
  if (!SCENARIO_META.find(s => s.id === id)) return res.status(404).json({ error: "Not found" });
  try {
    const result = await runTemplateScenario(id, "manual");
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/ai-office/template-scenarios/:id/logs — run history
router.get("/template-scenarios/:id/logs", async (req, res) => {
  const { id } = req.params;
  try {
    const logs = await db.execute(sql`
      SELECT id, run_type, status, summary, error_text, duration_ms, created_at
      FROM scenario_runs
      WHERE scenario = ${id}
      ORDER BY created_at DESC
      LIMIT 30
    `);
    res.json(logs.rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// PUT /api/ai-office/template-scenarios/:id/toggle — toggle auto
router.put("/template-scenarios/:id/toggle", async (req, res) => {
  const { id } = req.params;
  const { enabled } = req.body as { enabled: boolean };
  if (!SCENARIO_META.find(s => s.id === id)) return res.status(404).json({ error: "Not found" });
  try {
    await db.execute(sql`
      INSERT INTO scenario_settings (scenario, auto_enabled, updated_at)
      VALUES (${id}, ${enabled}, NOW())
      ON CONFLICT (scenario) DO UPDATE SET auto_enabled = EXCLUDED.auto_enabled, updated_at = NOW()
    `);
    res.json({ ok: true, enabled });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/ai-office/template-scenarios/order-diagnostics/:orderId/message-master
router.post("/template-scenarios/order-diagnostics/:orderId/message-master", async (req, res) => {
  const orderId = Number(req.params.orderId);
  try {
    const rows = await db.execute(sql`
      SELECT o.id, o.service_type, o.district, o.city, o.status,
             EXTRACT(EPOCH FROM (NOW() - o.updated_at)) / 86400 AS days_no_update,
             m.alias AS master_alias, m.max_chat_id
      FROM orders o
      JOIN masters m ON m.id = o.master_id
      WHERE o.id = ${orderId} AND o.deleted_at IS NULL
    `);
    const o = rows.rows[0] as any;
    if (!o) return res.status(404).json({ error: "Order not found" });
    if (!o.max_chat_id) return res.status(400).json({ error: "Master has no Max chat" });

    const days = Math.floor(Number(o.days_no_update));
    const msg =
      `${o.master_alias}, по заказу #${o.id} (${o.service_type}, ${o.district || o.city}) нет обновлений уже ${days} дн.\n\nПодскажите что со статусом?\nВсё в порядке?`;
    await sendMaxMessage(o.max_chat_id, msg);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ─── Existing stats endpoint ──────────────────────────────────────────────────

router.get("/stats", async (_req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    const [managerSessions, managerLeads, managerMessages] = await Promise.all([
      db.execute(sql`SELECT COUNT(DISTINCT user_id) as count FROM bot_sessions WHERE bot_type = 'manager' AND updated_at >= ${todayISO}`),
      db.execute(sql`SELECT COUNT(*) as count FROM leads WHERE created_at >= ${todayISO} AND deleted_at IS NULL`),
      db.execute(sql`SELECT SUM(jsonb_array_length(session_data->'messages')) as count FROM bot_sessions WHERE bot_type = 'manager' AND updated_at >= ${todayISO}`),
    ]);

    const [dispatchSent, dispatchResponded, ordersAssigned] = await Promise.all([
      db.execute(sql`SELECT COUNT(*) as count FROM order_dispatches WHERE created_at >= ${todayISO}`),
      db.execute(sql`SELECT COUNT(*) as count FROM order_dispatches WHERE created_at >= ${todayISO} AND status IN ('responded','assigned')`),
      db.execute(sql`SELECT COUNT(*) as count FROM orders WHERE assigned_at >= ${todayISO} AND master_id IS NOT NULL AND deleted_at IS NULL`),
    ]);

    const recentManagerActivity = await db.execute(sql`
      SELECT session_data->'messages' as messages, updated_at FROM bot_sessions WHERE bot_type = 'manager' ORDER BY updated_at DESC LIMIT 3
    `);

    const recentDispatcher = await db.execute(sql`
      SELECT od.created_at, o.service_type, o.city, m.alias as master_alias, od.status
      FROM order_dispatches od JOIN orders o ON o.id = od.order_id JOIN masters m ON m.id = od.master_id
      ORDER BY od.created_at DESC LIMIT 5
    `);

    const recentBrowserLogs = await db.execute(sql`SELECT action_type, description, created_at FROM browser_agent_logs ORDER BY created_at DESC LIMIT 10`).catch(() => ({ rows: [] }));

    res.json({
      manager: {
        online: !!process.env.MANAGER_BOT_TOKEN,
        todayStats: {
          sessions: Number((managerSessions.rows[0] as any)?.count ?? 0),
          leads: Number((managerLeads.rows[0] as any)?.count ?? 0),
          messages: Number((managerMessages.rows[0] as any)?.count ?? 0),
        },
        recentActivity: recentManagerActivity.rows.map((r: any) => {
          const msgs = Array.isArray(r.messages) ? r.messages : [];
          const lastUser = [...msgs].reverse().find((m: any) => m.role === "user");
          return { ts: r.updated_at, text: lastUser?.content?.slice(0, 80) ?? "разговор" };
        }).filter((r: any) => r.text),
      },
      dispatcher: {
        online: !!process.env.MAX_BOT_TOKEN,
        todayStats: {
          sent: Number((dispatchSent.rows[0] as any)?.count ?? 0),
          responded: Number((dispatchResponded.rows[0] as any)?.count ?? 0),
          assigned: Number((ordersAssigned.rows[0] as any)?.count ?? 0),
        },
        recentActivity: (recentDispatcher.rows as any[]).map(r => ({
          ts: r.created_at,
          text: `${r.service_type}, ${r.city} → ${r.master_alias} (${r.status})`,
        })),
      },
      browser: {
        recentLogs: (recentBrowserLogs.rows as any[]).map(r => ({
          ts: r.created_at,
          type: r.action_type,
          text: r.description,
        })),
      },
    });
  } catch (e) {
    console.error("[ai-office] stats error:", e);
    res.status(500).json({ error: String(e) });
  }
});

export default router;
