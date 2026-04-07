import OpenAI from "openai";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { browserAgent } from "./browserAgent.js";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface StepPlan {
  index: number;
  title: string;
  description: string;
  task: string;
}

export interface StepResult extends StepPlan {
  status: "pending" | "running" | "done" | "error";
  report: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

export interface AutonomousSession {
  id: number;
  goal: string;
  status: "planning" | "running" | "done" | "error" | "cancelled";
  plan: StepPlan[];
  steps: StepResult[];
  currentStep: number;
  finalReport: string | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

// ─── Active sessions map (in-memory for cancellation) ──────────────────────

const activeSessions = new Map<number, { cancelled: boolean }>();

// ─── Plan decomposition ────────────────────────────────────────────────────

async function planGoal(goal: string): Promise<StepPlan[]> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Ты опытный менеджер проекта и оркестратор ИИ-агентов. 
Тебе дают высокоуровневую цель. Твоя задача — разбить её на 5-10 конкретных последовательных шагов для браузер-агента.

Каждый шаг — конкретное действие в браузере или анализ информации:
- Поиск информации в интернете
- Просмотр сайтов конкурентов
- Сбор данных / цен / контактов
- Написание сообщений / текстов
- Создание структуры документа
- Публикация / отправка

ВАЖНО: Каждый шаг должен быть выполнимым браузер-агентом (работает с реальным браузером, может кликать, читать, заполнять формы, делать скриншоты).

Верни JSON массив шагов:
[
  {
    "index": 0,
    "title": "Краткое название шага (3-5 слов)",
    "description": "Что будет сделано на этом шаге (1-2 предложения)",
    "task": "Полная инструкция для браузер-агента. Конкретно что открыть, что сделать, что найти и что записать в результате."
  }
]

Возвращай ТОЛЬКО JSON, без пояснений.`,
      },
      {
        role: "user",
        content: `Цель: ${goal}`,
      },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0].message.content ?? "{}";
  const parsed = JSON.parse(content);
  const steps: StepPlan[] = Array.isArray(parsed) ? parsed : (parsed.steps ?? parsed.plan ?? []);
  return steps.slice(0, 10).map((s, i) => ({ ...s, index: i }));
}

// ─── Extract result from browser logs ─────────────────────────────────────

async function extractStepReport(
  goal: string,
  step: StepPlan,
  logs: { type: string; text: string }[],
): Promise<string> {
  const logText = logs
    .filter(l => l.type !== "thought")
    .map(l => `[${l.type}] ${l.text}`)
    .join("\n")
    .slice(0, 6000);

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Ты аналитик. На основе лога действий браузер-агента напиши краткий отчёт по выполненному шагу.
Отчёт должен содержать:
- Что было сделано
- Что найдено / собрано / написано (конкретные данные, цены, тексты, ссылки)
- Ключевые выводы

Пиши ёмко, информативно, на русском. Максимум 200 слов. Используй списки и цифры где уместно.`,
      },
      {
        role: "user",
        content: `Цель всего задания: ${goal}\n\nШаг: ${step.title}\nЗадача шага: ${step.task}\n\nЛог агента:\n${logText}`,
      },
    ],
    temperature: 0.2,
  });

  return response.choices[0].message.content ?? "Нет данных";
}

// ─── Final summary report ──────────────────────────────────────────────────

async function generateFinalReport(
  goal: string,
  steps: StepResult[],
): Promise<string> {
  const stepsText = steps
    .map(
      (s, i) =>
        `## Шаг ${i + 1}: ${s.title}\n${s.status === "error" ? "❌ Ошибка выполнения" : s.report}`,
    )
    .join("\n\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Ты аналитик. Напиши итоговый отчёт по выполненному автономному заданию.

Структура отчёта:
# Итоговый отчёт: [название задания]

## Резюме
(2-3 предложения о том что было сделано и к какому результату пришли)

## Ключевые находки
(самые важные данные: цены, контакты, тексты, ссылки — всё что нашёл агент)

## Результат
(конкретный итог — что создано, написано, найдено)

## Следующие шаги
(рекомендации что делать дальше)

Пиши информативно, используй структуру и списки. Форматирование Markdown.`,
      },
      {
        role: "user",
        content: `Цель: ${goal}\n\nОтчёты по шагам:\n${stepsText}`,
      },
    ],
    temperature: 0.3,
  });

  return response.choices[0].message.content ?? "Отчёт недоступен";
}

// ─── Main runner ───────────────────────────────────────────────────────────

async function runSession(sessionId: number, goal: string, plan: StepPlan[]) {
  const ctrl = activeSessions.get(sessionId) ?? { cancelled: false };
  activeSessions.set(sessionId, ctrl);

  const steps: StepResult[] = plan.map(p => ({
    ...p,
    status: "pending",
    report: "",
  }));

  // Save initial steps to DB
  await db.execute(sql`
    UPDATE autonomous_sessions
    SET status='running', steps=${JSON.stringify(steps)}::jsonb, plan=${JSON.stringify(plan)}::jsonb
    WHERE id=${sessionId}
  `);

  try {
    // Ensure browser is running
    if (browserAgent.getStatus() === "idle" || browserAgent.getStatus() === "stopped") {
      await browserAgent.launch();
      await new Promise(r => setTimeout(r, 2000));
    }

    for (let i = 0; i < steps.length; i++) {
      if (ctrl.cancelled) {
        steps[i].status = "error";
        steps[i].report = "Отменено пользователем";
        break;
      }

      steps[i].status = "running";
      steps[i].startedAt = new Date().toISOString();
      const t0 = Date.now();

      // Update DB with running step
      await db.execute(sql`
        UPDATE autonomous_sessions
        SET steps=${JSON.stringify(steps)}::jsonb, current_step=${i}
        WHERE id=${sessionId}
      `);

      try {
        await browserAgent.runTask(steps[i].task);

        // Wait for agent to finish
        let waited = 0;
        while (browserAgent.getStatus() === "running" || browserAgent.getStatus() === "starting") {
          await new Promise(r => setTimeout(r, 1500));
          waited += 1500;
          if (waited > 300_000) break; // 5 min max per step
          if (ctrl.cancelled) break;
        }

        // Collect logs and generate step report
        const logs = browserAgent.getLogs(100);
        const report = await extractStepReport(goal, steps[i], logs);
        steps[i].status = "done";
        steps[i].report = report;
      } catch (e) {
        steps[i].status = "error";
        steps[i].report = `Ошибка: ${String(e)}`;
      }

      steps[i].completedAt = new Date().toISOString();
      steps[i].durationMs = Date.now() - t0;

      // Save progress
      await db.execute(sql`
        UPDATE autonomous_sessions
        SET steps=${JSON.stringify(steps)}::jsonb, current_step=${i + 1}
        WHERE id=${sessionId}
      `);

      // Small pause between steps
      if (i < steps.length - 1 && !ctrl.cancelled) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    // Generate final report
    const finalReport = ctrl.cancelled
      ? `# Задание отменено\n\nВыполнено ${steps.filter(s => s.status === "done").length} из ${steps.length} шагов.`
      : await generateFinalReport(goal, steps);

    await db.execute(sql`
      UPDATE autonomous_sessions
      SET status=${ctrl.cancelled ? "cancelled" : "done"},
          steps=${JSON.stringify(steps)}::jsonb,
          final_report=${finalReport},
          completed_at=NOW()
      WHERE id=${sessionId}
    `);
  } catch (e) {
    const errMsg = String(e);
    console.error("[autonomousAgent] Session error:", e);
    await db.execute(sql`
      UPDATE autonomous_sessions
      SET status='error', error=${errMsg}, completed_at=NOW()
      WHERE id=${sessionId}
    `);
  } finally {
    activeSessions.delete(sessionId);
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export const autonomousAgent = {
  async start(goal: string): Promise<number> {
    // Create session record
    const res = await db.execute(sql`
      INSERT INTO autonomous_sessions (goal, status)
      VALUES (${goal}, 'planning')
      RETURNING id
    `);
    const sessionId = Number((res.rows[0] as any).id);

    // Plan in background
    (async () => {
      try {
        const plan = await planGoal(goal);
        await runSession(sessionId, goal, plan);
      } catch (e) {
        console.error("[autonomousAgent] Plan error:", e);
        await db.execute(sql`
          UPDATE autonomous_sessions
          SET status='error', error=${String(e)}, completed_at=NOW()
          WHERE id=${sessionId}
        `);
      }
    })();

    return sessionId;
  },

  async cancel(sessionId: number): Promise<void> {
    const ctrl = activeSessions.get(sessionId);
    if (ctrl) {
      ctrl.cancelled = true;
      browserAgent.abort();
    }
    // Also mark in DB if not running
    await db.execute(sql`
      UPDATE autonomous_sessions
      SET status='cancelled', completed_at=NOW()
      WHERE id=${sessionId} AND status NOT IN ('done','error','cancelled')
    `);
  },

  async getSession(sessionId: number): Promise<AutonomousSession | null> {
    const res = await db.execute(sql`
      SELECT * FROM autonomous_sessions WHERE id=${sessionId} LIMIT 1
    `);
    const row = res.rows[0] as any;
    if (!row) return null;
    return {
      id: row.id,
      goal: row.goal,
      status: row.status,
      plan: row.plan ?? [],
      steps: row.steps ?? [],
      currentStep: row.current_step,
      finalReport: row.final_report,
      error: row.error,
      startedAt: row.started_at,
      completedAt: row.completed_at,
    };
  },

  async listSessions(limit = 20): Promise<AutonomousSession[]> {
    const res = await db.execute(sql`
      SELECT id, goal, status, current_step,
             jsonb_array_length(steps) as total_steps,
             started_at, completed_at, final_report IS NOT NULL as has_report
      FROM autonomous_sessions
      ORDER BY started_at DESC
      LIMIT ${limit}
    `);
    return res.rows.map((row: any) => ({
      id: row.id,
      goal: row.goal,
      status: row.status,
      plan: [],
      steps: [],
      currentStep: row.current_step,
      finalReport: row.has_report ? "available" : null,
      error: null,
      startedAt: row.started_at,
      completedAt: row.completed_at,
    }));
  },
};
