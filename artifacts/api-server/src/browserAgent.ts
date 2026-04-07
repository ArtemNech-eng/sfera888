/**
 * Browser Agent — RPA + AI browser automation.
 * Uses Playwright-core + GPT-4o Vision to control a real Chromium browser
 * and execute tasks described in natural language.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import OpenAI from "openai";
import { execSync } from "child_process";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

function findChromium(): string {
  try {
    return execSync("which chromium", { encoding: "utf8" }).trim();
  } catch {
    return "/usr/bin/chromium";
  }
}

const CHROMIUM_PATH = findChromium();
const VIEWPORT = { width: 1280, height: 720 };
const MAX_STEPS = 30;
const STEP_DELAY_MS = 1200;

export type AgentStatus = "idle" | "starting" | "running" | "done" | "error" | "stopped";

export interface AgentLog {
  id: string;
  ts: string;
  type: "thought" | "action" | "result" | "error" | "info";
  text: string;
}

interface AgentAction {
  thought: string;
  action: "click" | "type" | "navigate" | "scroll" | "press_key" | "wait" | "clear" | "done";
  params: Record<string, any>;
  done: boolean;
}

class BrowserAgentService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  private status: AgentStatus = "idle";
  private lastScreenshot: string | null = null;
  private logs: AgentLog[] = [];
  private sessionId: string = "";
  private currentTask: string = "";
  private abortFlag = false;

  getStatus(): AgentStatus { return this.status; }
  getLastScreenshot(): string | null { return this.lastScreenshot; }
  getCurrentTask(): string { return this.currentTask; }
  getSessionId(): string { return this.sessionId; }

  getLogs(limit = 50): AgentLog[] {
    return this.logs.slice(-limit);
  }

  private log(type: AgentLog["type"], text: string) {
    const entry: AgentLog = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ts: new Date().toISOString(),
      type,
      text,
    };
    this.logs.push(entry);
    if (this.logs.length > 200) this.logs = this.logs.slice(-200);
    console.log(`[browserAgent:${type}] ${text.slice(0, 120)}`);

    if (this.sessionId) {
      db.execute(sql`
        INSERT INTO browser_agent_logs (session_id, action_type, description)
        VALUES (${this.sessionId}, ${type}, ${text})
      `).catch(() => {});
    }
  }

  private async takeScreenshot(): Promise<string | null> {
    if (!this.page) return null;
    try {
      const buf = await this.page.screenshot({ type: "jpeg", quality: 75 });
      this.lastScreenshot = buf.toString("base64");
      return this.lastScreenshot;
    } catch {
      return null;
    }
  }

  async launch(): Promise<void> {
    if (this.browser) return;
    this.status = "starting";
    this.log("info", `Запуск браузера (${CHROMIUM_PATH})`);
    this.browser = await chromium.launch({
      executablePath: CHROMIUM_PATH,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--lang=ru-RU,ru",
      ],
    });
    this.context = await this.browser.newContext({
      viewport: VIEWPORT,
      locale: "ru-RU",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
      extraHTTPHeaders: { "Accept-Language": "ru-RU,ru;q=0.9" },
    });
    this.page = await this.context.newPage();
    this.status = "idle";
    this.log("info", "Браузер запущен и готов");
    await this.takeScreenshot();
  }

  async stop(): Promise<void> {
    this.abortFlag = true;
    this.status = "stopped";
    try {
      await this.page?.close();
      await this.context?.close();
      await this.browser?.close();
    } catch {}
    this.browser = null;
    this.context = null;
    this.page = null;
    this.lastScreenshot = null;
    this.log("info", "Браузер остановлен");
  }

  async navigate(url: string): Promise<void> {
    if (!this.page) await this.launch();
    await this.page!.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    await this.takeScreenshot();
  }

  private async executeAction(action: AgentAction): Promise<void> {
    if (!this.page) throw new Error("Браузер не запущен");
    const p = action.params;

    switch (action.action) {
      case "click": {
        const x = Number(p.x ?? 0);
        const y = Number(p.y ?? 0);
        this.log("action", `Клик (${x}, ${y}) — ${p.description ?? ""}`);
        await this.page.mouse.click(x, y);
        await this.page.waitForTimeout(600);
        break;
      }
      case "type": {
        const text = String(p.text ?? "");
        this.log("action", `Ввод текста: "${text.slice(0, 60)}"`);
        await this.page.keyboard.type(text, { delay: 60 });
        break;
      }
      case "clear": {
        this.log("action", `Очистка поля`);
        await this.page.keyboard.press("Control+a");
        await this.page.keyboard.press("Delete");
        break;
      }
      case "navigate": {
        const url = String(p.url ?? "");
        this.log("action", `Переход: ${url}`);
        await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
        break;
      }
      case "scroll": {
        const dir = p.direction === "up" ? -1 : 1;
        const amount = Number(p.amount ?? 400);
        this.log("action", `Прокрутка ${p.direction ?? "down"} на ${amount}px`);
        await this.page.mouse.wheel(0, dir * amount);
        await this.page.waitForTimeout(400);
        break;
      }
      case "press_key": {
        const key = String(p.key ?? "Enter");
        this.log("action", `Нажатие клавиши: ${key}`);
        await this.page.keyboard.press(key);
        await this.page.waitForTimeout(500);
        break;
      }
      case "wait": {
        const ms = Math.min(Number(p.ms ?? 1000), 5000);
        this.log("action", `Ожидание ${ms}ms`);
        await this.page.waitForTimeout(ms);
        break;
      }
      case "done": {
        this.log("result", `Задача выполнена: ${p.result ?? "готово"}`);
        break;
      }
    }
  }

  async runTask(task: string): Promise<void> {
    if (this.status === "running") throw new Error("Агент уже выполняет задачу");
    if (!this.browser) await this.launch();

    this.abortFlag = false;
    this.status = "running";
    this.currentTask = task;
    this.sessionId = `ses_${Date.now()}`;
    this.log("info", `Новая задача: ${task}`);

    const actionHistory: string[] = [];

    for (let step = 0; step < MAX_STEPS; step++) {
      if (this.abortFlag) {
        this.log("info", "Задача прервана пользователем");
        this.status = "idle";
        return;
      }

      const screenshot = await this.takeScreenshot();
      if (!screenshot) {
        this.log("error", "Не удалось получить скриншот");
        break;
      }

      const currentUrl = this.page!.url();
      const historyText = actionHistory.length > 0
        ? `\nИстория действий (последние ${actionHistory.length}):\n${actionHistory.slice(-8).map((a, i) => `${i + 1}. ${a}`).join("\n")}`
        : "";

      const systemPrompt = `Ты RPA+AI агент который управляет реальным браузером Chrome 1280×720px.
Задача: ${task}
Текущий URL: ${currentUrl}
${historyText}

Посмотри на скриншот и выбери ОДНО следующее действие.
Отвечай СТРОГО в формате JSON (без markdown):
{
  "thought": "что вижу и что нужно сделать",
  "action": "click|type|navigate|scroll|press_key|wait|clear|done",
  "params": { ... },
  "done": false
}

Доступные действия и их params:
- click: { x: number, y: number, description: string }
- type: { text: string }  (сначала кликни на поле, потом type)
- clear: {}  (очистить выделенное поле)
- navigate: { url: string }
- scroll: { direction: "up"|"down", amount: 300-1000 }
- press_key: { key: "Enter"|"Tab"|"Escape"|"Backspace" }
- wait: { ms: 1000-3000 }
- done: { result: string }

Правила:
- Координаты точные — смотри на скриншот внимательно
- После ввода данных нажимай Enter или кликай кнопку
- Если видишь капчу — action: "done", result: "Обнаружена капча, требуется ручная верификация"
- Если залогинился — сразу переходи к основной задаче
- Если задача выполнена — action: "done"`;

      let parsed: AgentAction | null = null;
      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          max_tokens: 400,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: systemPrompt },
                {
                  type: "image_url",
                  image_url: { url: `data:image/jpeg;base64,${screenshot}`, detail: "high" },
                },
              ],
            },
          ],
        });

        const raw = response.choices[0]?.message?.content ?? "";
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch (e) {
        this.log("error", `Ошибка AI: ${String(e).slice(0, 100)}`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      if (!parsed) {
        this.log("error", "AI вернул некорректный JSON");
        break;
      }

      this.log("thought", parsed.thought);
      actionHistory.push(`${parsed.action}: ${parsed.thought.slice(0, 80)}`);

      if (parsed.action === "done" || parsed.done) {
        await this.executeAction(parsed);
        this.status = "done";
        return;
      }

      try {
        await this.executeAction(parsed);
      } catch (e) {
        this.log("error", `Ошибка действия: ${String(e).slice(0, 100)}`);
      }

      await new Promise(r => setTimeout(r, STEP_DELAY_MS));
    }

    this.log("error", "Превышен лимит шагов (30)");
    this.status = "idle";
  }

  abort(): void {
    this.abortFlag = true;
  }

  async getCredentials(): Promise<{ site: string; login: string; last_login_at: string | null }[]> {
    const rows = await db.execute(sql`
      SELECT site, login, last_login_at FROM browser_agent_credentials ORDER BY site
    `);
    return rows.rows as any;
  }

  async saveCredentials(site: string, login: string, password: string): Promise<void> {
    const enc = Buffer.from(password).toString("base64");
    await db.execute(sql`
      INSERT INTO browser_agent_credentials (site, login, password_enc, updated_at)
      VALUES (${site}, ${login}, ${enc}, NOW())
      ON CONFLICT (site) DO UPDATE SET login = ${login}, password_enc = ${enc}, updated_at = NOW()
    `);
    this.log("info", `Учётные данные сохранены для: ${site}`);
  }

  async deleteCredentials(site: string): Promise<void> {
    await db.execute(sql`DELETE FROM browser_agent_credentials WHERE site = ${site}`);
  }

  async getStoredPassword(site: string): Promise<{ login: string; password: string } | null> {
    const rows = await db.execute(sql`
      SELECT login, password_enc FROM browser_agent_credentials WHERE site = ${site} LIMIT 1
    `);
    if (!rows.rows[0]) return null;
    const r = rows.rows[0] as any;
    return { login: r.login, password: Buffer.from(r.password_enc, "base64").toString() };
  }
}

export const browserAgent = new BrowserAgentService();
