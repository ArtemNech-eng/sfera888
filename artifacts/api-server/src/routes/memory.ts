import { Router } from "express";
import {
  listMemories,
  saveMemory,
  updateMemory,
  deleteMemory,
  clearMemories,
  MEMORY_CATEGORIES,
} from "../agentMemory.js";

const router = Router();

// GET /api/agent-memory — list with optional ?category=&limit=&offset=
router.get("/", async (req, res) => {
  try {
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const limit = Math.min(Number(req.query.limit ?? 100), 200);
    const offset = Number(req.query.offset ?? 0);
    const result = await listMemories({ category, limit, offset });
    res.json({ ...result, categories: MEMORY_CATEGORIES });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// GET /api/agent-memory/categories — list categories with counts
router.get("/categories", async (_req, res) => {
  try {
    const { db } = await import("@workspace/db");
    const { sql } = await import("drizzle-orm");
    const rows = await db.execute(sql`
      SELECT category, COUNT(*) as count
      FROM agent_memory
      WHERE (expires_at IS NULL OR expires_at > NOW())
      GROUP BY category
      ORDER BY count DESC
    `);
    res.json({ categories: MEMORY_CATEGORIES, counts: rows.rows });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/agent-memory — add a memory manually
router.post("/", async (req, res) => {
  const { category, title, content, sourceUrl, importance } = req.body as any;
  if (!title || !content) return res.status(400).json({ error: "title and content required" });
  try {
    const entry = await saveMemory({ category: category ?? "general", title, content, sourceUrl, importance });
    res.json(entry);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// PATCH /api/agent-memory/:id — update a memory
router.patch("/:id", async (req, res) => {
  try {
    await updateMemory(Number(req.params.id), req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// DELETE /api/agent-memory/:id — delete one memory
router.delete("/:id", async (req, res) => {
  try {
    await deleteMemory(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// DELETE /api/agent-memory — clear all (or by category)
router.delete("/", async (req, res) => {
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  try {
    const count = await clearMemories(category);
    res.json({ ok: true, deleted: count });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
