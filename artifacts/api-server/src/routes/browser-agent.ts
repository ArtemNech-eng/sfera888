import { Router } from "express";
import { browserAgent } from "../browserAgent.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

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
    pendingInputPrompt: browserAgent.getPendingInputPrompt() || null,
  });
});

// POST /api/browser-agent/input — provide user input (e.g. SMS code)
router.post("/input", (req, res) => {
  const { value } = req.body as { value?: string };
  if (!value?.trim()) return res.status(400).json({ error: "value required" });
  const ok = browserAgent.provideInput(value.trim());
  if (!ok) return res.status(409).json({ error: "Агент не ожидает ввода" });
  res.json({ ok: true });
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

// ─── Memory ────────────────────────────────────────────────────────────────────

// GET /api/browser-agent/memory
router.get("/memory", async (_req, res) => {
  try {
    const rows = await browserAgent.getAllMemory();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/browser-agent/memory — manually save a fact
router.post("/memory", async (req, res) => {
  const { key, value, context } = req.body as { key?: string; value?: string; context?: string };
  if (!key?.trim() || !value?.trim()) return res.status(400).json({ error: "key and value required" });
  try {
    await browserAgent.saveMemory(key.trim(), value.trim(), context?.trim());
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// DELETE /api/browser-agent/memory/:key — forget a fact
router.delete("/memory/:key", async (req, res) => {
  try {
    await browserAgent.deleteMemory(decodeURIComponent(req.params.key));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ─── Scenarios ────────────────────────────────────────────────────────────────

const DEFAULT_SCENARIOS = [
  {
    name: "Проверить сообщения на Авито",
    description: "Авторизоваться и прочитать последние диалоги",
    task_template: "Зайди на avito.ru, авторизуйся используя сохранённые учётные данные для avito.ru, открой раздел «Сообщения» и покажи последние 5 диалогов — с кем переписка, что спрашивают.",
    icon: "message",
    color: "blue",
  },
  {
    name: "Написать конкурентам на Авито",
    description: "Найти конкурентов по ремонту и написать им",
    task_template: "Зайди на avito.ru, найди объявления по запросу «ремонт квартиры» в Краснодаре. Открой первые 3 объявления конкурентов и напиши каждому: «Здравствуйте! Рассматриваете ли вы сотрудничество или партнёрство?»",
    icon: "users",
    color: "orange",
  },
  {
    name: "Мониторинг цен конкурентов",
    description: "Проверить расценки на укладку плитки в городе",
    task_template: "Зайди на avito.ru, найди объявления «укладка плитки» в Краснодаре. Посмотри цены первых 5 объявлений и составь краткий отчёт: минимальная цена, максимальная цена, средняя цена за м².",
    icon: "chart",
    color: "green",
  },
  {
    name: "Разместить объявление",
    description: "Создать новое объявление на Авито",
    task_template: "Зайди на avito.ru, авторизуйся используя сохранённые данные для avito.ru. Нажми «Разместить объявление», выбери категорию «Ремонт и строительство → Отделочные работы». Заполни: заголовок «Укладка плитки профессионально», описание «Профессиональная укладка плитки. Опыт 10 лет. Гарантия качества. Бесплатный замер», цена «от 800 руб за м²». Нажми «Опубликовать».",
    icon: "plus",
    color: "purple",
  },
  {
    name: "Проверить объявления",
    description: "Посмотреть статистику своих объявлений",
    task_template: "Зайди на avito.ru, авторизуйся используя сохранённые данные. Открой раздел «Мои объявления». Запиши количество просмотров и звонков по каждому активному объявлению.",
    icon: "eye",
    color: "teal",
  },
  {
    name: "Найти и заказать билеты",
    description: "Найти билеты на конкретный маршрут",
    task_template: "Зайди на rzd.ru (РЖД) и найди билеты на поезд из [откуда] в [куда] на [дата]. Покажи доступные варианты с ценами и временем отправления.",
    icon: "train",
    color: "red",
  },
];

// Seed default scenarios once
async function seedDefaultScenarios() {
  try {
    const existing = await db.execute(sql`SELECT COUNT(*) as count FROM browser_agent_scenarios`);
    if (Number((existing.rows[0] as any)?.count ?? 0) > 0) return;
    for (const s of DEFAULT_SCENARIOS) {
      await db.execute(sql`
        INSERT INTO browser_agent_scenarios (name, description, task_template, icon, color)
        VALUES (${s.name}, ${s.description}, ${s.task_template}, ${s.icon}, ${s.color})
        ON CONFLICT DO NOTHING
      `);
    }
    console.log("[browser-agent] Seeded default scenarios");
  } catch (e) {
    console.error("[browser-agent] Seed scenarios error:", e);
  }
}
seedDefaultScenarios();

// GET /api/browser-agent/scenarios
router.get("/scenarios", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT id, name, description, task_template, icon, color, run_count, last_run_at, created_at
      FROM browser_agent_scenarios ORDER BY created_at
    `);
    res.json(rows.rows);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/browser-agent/scenarios
router.post("/scenarios", async (req, res) => {
  const { name, description, task_template, icon, color } = req.body as any;
  if (!name || !task_template) return res.status(400).json({ error: "name and task_template required" });
  try {
    const row = await db.execute(sql`
      INSERT INTO browser_agent_scenarios (name, description, task_template, icon, color)
      VALUES (${name}, ${description ?? ""}, ${task_template}, ${icon ?? "globe"}, ${color ?? "blue"})
      RETURNING *
    `);
    res.json(row.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// PATCH /api/browser-agent/scenarios/:id
router.patch("/scenarios/:id", async (req, res) => {
  const { name, description, task_template, icon, color } = req.body as any;
  try {
    await db.execute(sql`
      UPDATE browser_agent_scenarios
      SET name=${name}, description=${description}, task_template=${task_template},
          icon=${icon}, color=${color}, updated_at=NOW()
      WHERE id=${Number(req.params.id)}
    `);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// DELETE /api/browser-agent/scenarios/:id
router.delete("/scenarios/:id", async (req, res) => {
  try {
    await db.execute(sql`DELETE FROM browser_agent_scenarios WHERE id=${Number(req.params.id)}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/browser-agent/scenarios/:id/run — run a scenario
router.post("/scenarios/:id/run", async (req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT * FROM browser_agent_scenarios WHERE id=${Number(req.params.id)} LIMIT 1
    `);
    const scenario = rows.rows[0] as any;
    if (!scenario) return res.status(404).json({ error: "Scenario not found" });

    // Update stats
    await db.execute(sql`
      UPDATE browser_agent_scenarios
      SET run_count=run_count+1, last_run_at=NOW()
      WHERE id=${Number(req.params.id)}
    `);

    res.json({ ok: true, task: scenario.task_template });

    // Run the task
    browserAgent.runTask(scenario.task_template).catch(e => {
      console.error("[browser-agent] scenario run error:", e);
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
