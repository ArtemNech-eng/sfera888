/**
 * Browser Agent — RPA + AI browser automation.
 * Uses Playwright-core + GPT-4o Vision to control a real Chromium browser
 * and execute tasks described in natural language.
 */

import type { Browser, BrowserContext, Page } from "playwright-core";
import OpenAI from "openai";
import { execSync } from "child_process";
import { db, browserAgentMemoryTable } from "@workspace/db";
import { sql, eq } from "drizzle-orm";

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
const MAX_STEPS = 50;
const STEP_DELAY_MS = 200;       // ms between GPT calls (reduced from 1200)

export type AgentStatus = "idle" | "starting" | "running" | "done" | "error" | "stopped" | "waiting_input";

export interface AgentLog {
  id: string;
  ts: string;
  type: "thought" | "action" | "result" | "error" | "info";
  text: string;
}

interface AgentAction {
  thought: string;
  action: "click" | "type" | "navigate" | "scroll" | "press_key" | "wait" | "clear" | "done" | "request_input" | "memorize" | "ask_user";
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

  // User input waiting mechanism
  private inputResolve: ((value: string) => void) | null = null;
  private pendingInputPrompt: string = "";
  private queuedInput: string | null = null; // input sent while agent is running

  getStatus(): AgentStatus { return this.status; }
  getLastScreenshot(): string | null { return this.lastScreenshot; }
  getPendingInputPrompt(): string { return this.pendingInputPrompt; }

  provideInput(value: string): boolean {
    if (this.inputResolve) {
      // Agent is actively waiting — deliver immediately
      this.inputResolve(value);
      this.inputResolve = null;
      this.pendingInputPrompt = "";
      this.status = "running";
      this.log("info", `Получен ввод от пользователя: ${value}`);
      return true;
    }
    if (this.status === "running" || this.status === "starting") {
      // Agent is busy — queue the input so it's used on next request_input call
      this.queuedInput = value;
      this.log("info", `Ввод сохранён в очередь, будет использован при следующем запросе: ${value}`);
      return true;
    }
    return false;
  }
  getCurrentTask(): string { return this.currentTask; }
  getSessionId(): string { return this.sessionId; }

  getLogs(limit = 50): AgentLog[] {
    return this.logs.slice(-limit);
  }

  async loadMemory(): Promise<string> {
    const parts: string[] = [];
    try {
      // Load browser agent-specific memory (key-value facts)
      const rows = await db.select().from(browserAgentMemoryTable).orderBy(browserAgentMemoryTable.updatedAt);
      if (rows.length) {
        parts.push("Сохранённые факты о пользователе и задачах:\n" +
          rows.map(r => `- ${r.key}: ${r.value}${r.context ? ` [${r.context}]` : ""}`).join("\n"));
      }
    } catch {}
    try {
      // Also load autonomous agent memory (researched data, competitors, contacts, etc.)
      const agentMem = await db.execute(sql`
        SELECT category, title, content FROM agent_memory
        WHERE expires_at IS NULL OR expires_at > NOW()
        ORDER BY importance DESC, created_at DESC LIMIT 30
      `);
      if (agentMem.rows.length) {
        parts.push("Исследовательская память агента (результаты прошлых задач):\n" +
          (agentMem.rows as any[]).map(r => `- [${r.category}] ${r.title}: ${String(r.content).slice(0, 200)}`).join("\n"));
      }
    } catch {}
    if (!parts.length) return "";
    return "\n\nПАМЯТЬ АГЕНТА:\n" + parts.join("\n\n");
  }

  async saveMemory(key: string, value: string, context?: string): Promise<void> {
    try {
      const existing = await db.select({ id: browserAgentMemoryTable.id })
        .from(browserAgentMemoryTable)
        .where(eq(browserAgentMemoryTable.key, key))
        .limit(1);
      if (existing.length) {
        await db.update(browserAgentMemoryTable)
          .set({ value, context, updatedAt: new Date() })
          .where(eq(browserAgentMemoryTable.key, key));
      } else {
        await db.insert(browserAgentMemoryTable).values({ key, value, context });
      }
      this.log("info", `🧠 Запомнено: ${key} = ${value}`);
    } catch (e) {
      console.error("[browserAgent] saveMemory error:", e);
    }
  }

  async getAllMemory(): Promise<{ key: string; value: string; context: string | null; updatedAt: Date }[]> {
    return db.select({
      key: browserAgentMemoryTable.key,
      value: browserAgentMemoryTable.value,
      context: browserAgentMemoryTable.context,
      updatedAt: browserAgentMemoryTable.updatedAt,
    }).from(browserAgentMemoryTable).orderBy(browserAgentMemoryTable.updatedAt);
  }

  async deleteMemory(key: string): Promise<void> {
    await db.delete(browserAgentMemoryTable).where(eq(browserAgentMemoryTable.key, key));
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
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const buf = await this.page.screenshot({ type: "jpeg", quality: 75 });
        this.lastScreenshot = buf.toString("base64");
        return this.lastScreenshot;
      } catch {
        if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
      }
    }
    return null;
  }

  async launch(): Promise<void> {
    if (this.browser) return;
    this.status = "starting";

    let chromium: import("playwright-core").BrowserType;
    try {
      const pw = await import("playwright-core");
      chromium = pw.chromium;
    } catch {
      this.status = "error";
      this.log("error", "playwright-core недоступен в данной среде. Браузер-агент работает только при наличии Chromium.");
      throw new Error("Браузер-агент недоступен: playwright-core не установлен");
    }

    this.log("info", `Запуск браузера (${CHROMIUM_PATH})`);
    this.browser = await chromium.launch({
      executablePath: CHROMIUM_PATH,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--use-gl=swiftshader",
        "--use-angle=swiftshader",
        "--enable-webgl",
        "--ignore-gpu-blocklist",
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
      case "request_input": {
        const prompt = String(p.prompt ?? "Введите данные");
        this.pendingInputPrompt = prompt;

        let value: string;
        if (this.queuedInput !== null) {
          // User pre-sent the value while agent was running — use it immediately
          value = this.queuedInput;
          this.queuedInput = null;
          this.log("info", `✅ Использован предварительно введённый код: ${"*".repeat(value.length)}`);
        } else {
          this.status = "waiting_input";
          this.log("info", `⏸ Ожидание ввода: ${prompt}`);
          value = await new Promise<string>((resolve, reject) => {
            this.inputResolve = resolve;
            // Auto-reject after 10 minutes if no input
            setTimeout(() => reject(new Error("Время ожидания ввода истекло (10 мин)")), 600_000);
          });
          this.log("info", `✅ Получен код: ${"*".repeat(value.length)}`);
        }

        this.pendingInputPrompt = "";
        this.status = "running";
        await this.page!.keyboard.type(value, { delay: 80 });
        await this.page!.waitForTimeout(500);
        break;
      }
      case "ask_user": {
        // Ask user a question and wait for answer, then remember it
        const question = String(p.question ?? "Уточните данные");
        this.pendingInputPrompt = question;

        let answer: string;
        if (this.queuedInput !== null) {
          answer = this.queuedInput;
          this.queuedInput = null;
          this.log("info", `✅ Использован предварительно введённый ответ: ${answer}`);
        } else {
          this.status = "waiting_input";
          this.log("info", `❓ Вопрос пользователю: ${question}`);
          answer = await new Promise<string>((resolve, reject) => {
            this.inputResolve = resolve;
            setTimeout(() => reject(new Error("Время ожидания ответа истекло (10 мин)")), 600_000);
          });
          this.log("info", `💬 Получен ответ: ${answer}`);
        }

        this.pendingInputPrompt = "";
        this.status = "running";

        // Auto-save non-OTP answers to memory (OTP is all-digits short string)
        const isOtp = /^\d{4,8}$/.test(answer.trim());
        if (!isOtp && answer.trim().length > 1) {
          const memKey = question.length > 80 ? question.slice(0, 77) + "…" : question;
          await this.saveMemory(memKey, answer.trim());
        }

        // Store answer for GPT to use in next step (inject into history)
        actionHistory.push(`ask_user("${question}") → ответ: "${answer}"`);
        break;
      }
      case "memorize": {
        const key = String(p.key ?? "факт");
        const value = String(p.value ?? "");
        const context = p.context ? String(p.context) : undefined;
        if (key && value) {
          await this.saveMemory(key, value, context);
        }
        break;
      }
    }
  }

  async runTask(task: string): Promise<void> {
    if (this.status === "running") throw new Error("Агент уже выполняет задачу");
    if (!this.browser) await this.launch();

    this.abortFlag = false;
    this.queuedInput = null;
    this.status = "running";
    this.currentTask = task;
    this.sessionId = `ses_${Date.now()}`;
    this.log("info", `Новая задача: ${task}`);

    // Load saved credentials to inject into the prompt
    let credentialsContext = "";
    try {
      const creds = await db.execute(sql`
        SELECT site, login, password_enc FROM browser_agent_credentials ORDER BY site
      `);
      if (creds.rows.length > 0) {
        const lines = (creds.rows as any[]).map(r =>
          `  - ${r.site}: логин="${r.login}", пароль="${Buffer.from(r.password_enc, "base64").toString()}"`
        ).join("\n");
        credentialsContext = `\nСохранённые учётные данные (используй их для входа):\n${lines}`;
      }
    } catch {}

    // Load persistent memory
    const memoryContext = await this.loadMemory();

    const actionHistory: string[] = [];
    let stepLimitReached = true;

    for (let step = 0; step < MAX_STEPS; step++) {
      if (this.abortFlag) {
        this.log("info", "Задача прервана пользователем");
        this.status = "idle";
        stepLimitReached = false;
        return;
      }

      const screenshot = await this.takeScreenshot();
      if (!screenshot) {
        this.log("error", "Не удалось получить скриншот — страница недоступна");
        stepLimitReached = false;
        break;
      }

      const currentUrl = this.page!.url();

      // ── Loop detection ──────────────────────────────────────────────────────
      const recentActions = actionHistory.slice(-6);

      // 1. Coordinate-based loop: same area clicked 3+ times
      const coordLoop = recentActions.length >= 3 && (() => {
        const clickPattern = recentActions.filter(a => a.toLowerCase().includes("клик") || a.toLowerCase().includes("click"));
        if (clickPattern.length < 3) return false;
        const coords = clickPattern.map(a => { const m = a.match(/\((\d+),\s*(\d+)\)/); return m ? `${Math.round(Number(m[1])/100)},${Math.round(Number(m[2])/100)}` : ""; });
        return coords.length >= 3 && new Set(coords).size <= 2;
      })();

      // 2. Auth-stuck loop: credentials were entered but URL is still a login page
      const loginKeywords = ["login", "auth", "sign", "вход", "signin", "account/login", "авторизация"];
      const isLoginPage = loginKeywords.some(k => currentUrl.toLowerCase().includes(k));
      const recentHasCredentials = recentActions.some(a =>
        a.includes("ask_user(") && a.includes("→ ответ:") ||
        a.includes("Ввод текста") // type action was executed
      );
      const authLoop = isLoginPage && recentHasCredentials && recentActions.filter(a =>
        a.toLowerCase().includes("клик") || a.toLowerCase().includes("ввод")
      ).length >= 3;

      // 3. Type-loop: same text typed multiple times
      const typedTexts = recentActions.filter(a => a.includes("Ввод текста:")).map(a => a.replace(/.*Ввод текста: /, "").slice(0, 30));
      const typeLoop = typedTexts.length >= 3 && new Set(typedTexts).size <= 1;

      const loopDetected = coordLoop || authLoop || typeLoop;

      const loopWarning = loopDetected
        ? (() => {
            if (authLoop) return "\n\n🚨 КРИТИЧНО: ТЫ ЗАСТРЯЛ НА СТРАНИЦЕ ВХОДА. Ты уже вводил данные, но страница не изменилась — это означает ОШИБКУ АВТОРИЗАЦИИ. НЕМЕДЛЕННО: 1) Используй ask_user с вопросом 'Авторизация не удалась. Что делать дальше? Может быть неверный логин/пароль или требуется другое действие.' 2) НЕ КЛИКАЙ больше на форму.";
            if (typeLoop) return "\n\n⚠️ ПЕТЛЯ: ты вводишь одинаковый текст несколько раз. СТОП. Используй ask_user.";
            return "\n\n⚠️ ПЕТЛЯ: ты кликаешь в одно и то же место несколько раз. СТОП. Используй ask_user чтобы спросить что делать.";
          })()
        : "";

      // Highlight ask_user answers prominently so GPT sees them
      const historyLines = actionHistory.slice(-10).map((a, i) => {
        const isAnswer = a.includes("ask_user(") && a.includes("→ ответ:");
        return isAnswer
          ? `${i + 1}. ⚡ ПОЛУЧЕНЫ ДАННЫЕ: ${a}`
          : `${i + 1}. ${a}`;
      });
      const historyText = actionHistory.length > 0
        ? `\nИстория действий (последние ${actionHistory.length}):\n${historyLines.join("\n")}${loopWarning}`
        : "";

      const systemPrompt = `Ты RPA+AI агент который управляет реальным браузером Chrome 1280×720px.

ЗАДАЧА: ${task}
ТЕКУЩИЙ URL: ${currentUrl}
${historyText}${credentialsContext}${memoryContext}

ВАЖНО: Проанализируй историю действий выше. Если там есть "⚡ ПОЛУЧЕНЫ ДАННЫЕ" — это ответ от пользователя который ТЫ ОБЯЗАН использовать прямо сейчас.

Посмотри на скриншот, подумай что происходит, и выбери ОДНО следующее действие.
Отвечай СТРОГО в формате JSON (без markdown):
{
  "thought": "что вижу и что нужно сделать",
  "action": "click|type|navigate|scroll|press_key|wait|clear|done|request_input|ask_user|memorize",
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
- memorize: { key: string, value: string, context?: string }  (сохранить факт в долгосрочную память)
- ask_user: { question: string }  (задать вопрос пользователю и получить ответ — используй когда нужна любая информация)

ПРАВИЛА (обязательные):

1. ДУМАЙ ПЕРЕД ДЕЙСТВИЕМ: в поле "thought" напиши подробно что ты видишь на скриншоте, что уже сделано (из истории), и почему выбираешь именно это действие.

2. АВТОРИЗАЦИЯ — строгий порядок:
   a) Видишь форму входа → проверь историю: уже ли вводил данные?
   b) Нет данных → ask_user: { "question": "Введите телефон/логин и пароль для [сайт]" }
   c) Данные есть в истории ("⚡ ПОЛУЧЕНЫ ДАННЫЕ") → введи их прямо сейчас
   d) После нажатия "Войти" → ОБЯЗАТЕЛЬНО используй: request_input: { "prompt": "Введите SMS-код если он пришёл, или напишите 'нет кода'" }
   e) Не нажимай "Войти" повторно, не вводи данные снова — жди SMS

3. ОШИБКА АВТОРИЗАЦИИ — если видишь на экране:
   - Красный текст, текст с "ошибка", "неверн", "не найден", "попробуйте снова", "incorrect", "invalid", "wrong"
   - Или ты уже нажал "Войти" но страница НЕ изменилась
   → НЕМЕДЛЕННО: ask_user: { "question": "Авторизация не удалась — сайт показал ошибку. Проверь логин и пароль и отправь заново, или опиши что делать." }
   → НЕ пытайся войти снова самостоятельно

4. ПОСЛЕ ask_user — В ИСТОРИИ будет строка "⚡ ПОЛУЧЕНЫ ДАННЫЕ". Прочитай ответ и используй НЕМЕДЛЕННО.

5. SMS / 2FA: Если видишь поле для кода, цифр, "подтверждение", "код" → request_input: { "prompt": "Введите SMS-код" }. НЕ КЛИКАЙ на это поле сам.

6. ЗАПРЕТ ПЕТЕЛЬ: Одно и то же действие максимум 2 раза → ask_user.

7. Капча → done: { "result": "Обнаружена капча" }
8. Задача выполнена → done: { "result": "описание результата" }`;

      let parsed: AgentAction | null = null;
      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          max_tokens: 1500,
          temperature: 0,
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

    if (stepLimitReached) {
      this.log("error", `Превышен лимит шагов (${MAX_STEPS}) — задача слишком сложная или агент застрял`);
    }
    this.status = "idle";
  }

  abort(): void {
    this.abortFlag = true;
    this.queuedInput = null;
    // Unblock any pending input wait
    if (this.inputResolve) {
      this.inputResolve("__aborted__");
      this.inputResolve = null;
      this.pendingInputPrompt = "";
    }
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
