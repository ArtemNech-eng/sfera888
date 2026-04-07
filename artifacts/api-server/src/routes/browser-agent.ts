import { Router } from "express";
import { browserAgent } from "../browserAgent.js";

const router = Router();

// GET /api/browser-agent/status
router.get("/status", (_req, res) => {
  const screenshot = browserAgent.getLastScreenshot();
  res.json({
    status: browserAgent.getStatus(),
    task: browserAgent.getCurrentTask(),
    sessionId: browserAgent.getSessionId(),
    hasScreenshot: !!screenshot,
    logs: browserAgent.getLogs(30),
  });
});

// GET /api/browser-agent/screenshot
router.get("/screenshot", (_req, res) => {
  const b64 = browserAgent.getLastScreenshot();
  if (!b64) return res.status(204).end();
  const buf = Buffer.from(b64, "base64");
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "no-store");
  res.send(buf);
});

// POST /api/browser-agent/launch
router.post("/launch", async (_req, res) => {
  try {
    await browserAgent.launch();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/browser-agent/stop
router.post("/stop", async (_req, res) => {
  try {
    browserAgent.abort();
    await browserAgent.stop();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/browser-agent/abort
router.post("/abort", (_req, res) => {
  browserAgent.abort();
  res.json({ ok: true });
});

// POST /api/browser-agent/navigate
router.post("/navigate", async (req, res) => {
  const { url } = req.body as { url?: string };
  if (!url) return res.status(400).json({ error: "url required" });
  try {
    await browserAgent.navigate(url);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/browser-agent/task
router.post("/task", async (req, res) => {
  const { task } = req.body as { task?: string };
  if (!task?.trim()) return res.status(400).json({ error: "task required" });
  try {
    res.json({ ok: true, message: "Задача принята, агент работает" });
    browserAgent.runTask(task.trim()).catch(e => {
      console.error("[browser-agent] task error:", e);
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/browser-agent/credentials
router.get("/credentials", async (_req, res) => {
  try {
    const creds = await browserAgent.getCredentials();
    res.json(creds);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/browser-agent/credentials
router.post("/credentials", async (req, res) => {
  const { site, login, password } = req.body as { site?: string; login?: string; password?: string };
  if (!site || !login || !password) return res.status(400).json({ error: "site, login, password required" });
  try {
    await browserAgent.saveCredentials(site, login, password);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// DELETE /api/browser-agent/credentials/:site
router.delete("/credentials/:site", async (req, res) => {
  try {
    await browserAgent.deleteCredentials(req.params.site);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
