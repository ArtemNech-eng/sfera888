import { Router } from "express";
import { autonomousAgent, computeAtRiskMasters } from "../autonomousAgent.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

// POST /api/autonomous — start a new autonomous session
router.post("/", async (req, res) => {
  const { goal } = req.body as { goal?: string };
  if (!goal?.trim()) { res.status(400).json({ error: "goal required" }); return; }
  try {
    const sessionId = await autonomousAgent.start(goal.trim());
    res.json({ ok: true, sessionId });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/autonomous — list recent sessions
router.get("/", async (_req, res) => {
  try {
    const sessions = await autonomousAgent.listSessions(30);
    res.json(sessions);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/autonomous/scenarios — list predefined scenarios
router.get("/scenarios", (_req, res) => {
  res.json(autonomousAgent.getScenarios());
});

// POST /api/autonomous/scenarios/:id/run — run a predefined scenario immediately
router.post("/scenarios/:id/run", async (req, res) => {
  try {
    const { days } = req.body as { days?: number };
    const sessionId = await autonomousAgent.runScenario(req.params.id, { days });
    res.json({ ok: true, sessionId });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/autonomous/schedules — get scenario schedules
router.get("/schedules", async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT value FROM system_settings WHERE key = 'scenario_schedules' LIMIT 1
    `);
    const row = result.rows[0] as any;
    res.json(row ? JSON.parse(row.value) : {});
  } catch {
    res.json({});
  }
});

// PUT /api/autonomous/schedules — save scenario schedules
router.put("/schedules", async (req, res) => {
  try {
    const schedules = req.body as Record<string, { enabled: boolean; days: number[] }>;
    const value = JSON.stringify(schedules);
    await db.execute(sql`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ('scenario_schedules', ${value}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW()
    `);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/autonomous/scenarios/:id/preview — quick preview before confirmation
// Returns: count of affected masters, cities, total amount (no AI, fast)
router.get("/scenarios/:id/preview", async (req, res) => {
  try {
    const days = Math.min(14, Math.max(1, Number(req.query.days) || 7));

    if (req.params.id === "master_followup") {
      const { critical, warning } = await computeAtRiskMasters(days);
      const targets = [...critical, ...warning].filter(m => m.maxChatId);
      const totalAmount = targets.reduce((s, m) => s + m.totalAmount, 0);
      const cities = [...new Set(targets.map(m => m.city))].slice(0, 8);
      res.json({
        criticalCount: critical.filter(m => m.maxChatId).length,
        warningCount:  warning.filter(m => m.maxChatId).length,
        totalTargets:  targets.length,
        totalAmount,
        cities,
        days,
        masters: targets.slice(0, 20).map(m => ({
          alias: m.alias,
          city: m.city,
          risk: m.risk,
          daysSinceContact: Math.floor(m.daysSinceContact),
          totalAmount: m.totalAmount,
          orderCount: m.orders.length,
          riskReasons: m.riskReasons,
        })),
      });
      return;
    }

    if (req.params.id === "al_diagnostics") {
      const { critical, warning, ok, totalAmount, orderCount } = await computeAtRiskMasters(days);
      res.json({
        criticalCount: critical.length,
        warningCount:  warning.length,
        okCount:       ok.length,
        totalAmount,
        orderCount,
        days,
      });
      return;
    }

    res.status(404).json({ error: "No preview for this scenario" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/autonomous/:id — get full session details
router.get("/:id", async (req, res) => {
  try {
    const session = await autonomousAgent.getSession(Number(req.params.id));
    if (!session) { res.status(404).json({ error: "Session not found" }); return; }
    res.json(session);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/autonomous/:id/cancel — cancel running session
router.post("/:id/cancel", async (req, res) => {
  try {
    await autonomousAgent.cancel(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
