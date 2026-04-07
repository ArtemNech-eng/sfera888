import { Router } from "express";
import { autonomousAgent } from "../autonomousAgent.js";

const router = Router();

// POST /api/autonomous — start a new autonomous session
router.post("/", async (req, res) => {
  const { goal } = req.body as { goal?: string };
  if (!goal?.trim()) return res.status(400).json({ error: "goal required" });
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

// GET /api/autonomous/:id — get full session details
router.get("/:id", async (req, res) => {
  try {
    const session = await autonomousAgent.getSession(Number(req.params.id));
    if (!session) return res.status(404).json({ error: "Session not found" });
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
