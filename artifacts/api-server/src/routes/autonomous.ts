import { Router } from "express";
import { autonomousAgent } from "../autonomousAgent.js";
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
    const sessionId = await autonomousAgent.runScenario(req.params.id);
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
