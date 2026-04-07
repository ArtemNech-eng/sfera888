import OpenAI from "openai";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  extractAndSaveMemories,
  retrieveRelevantMemories,
  buildMemoryContext,
} from "./agentMemory.js";

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

// ─── CRM data loader ───────────────────────────────────────────────────────

async function loadCrmContext(): Promise<string> {
  try {
    const [orders, masters, leads] = await Promise.all([
      db.execute(sql`
        SELECT status, COUNT(*) as cnt, AVG(total_price) as avg_price
        FROM orders GROUP BY status ORDER BY cnt DESC LIMIT 10
      `),
      db.execute(sql`
        SELECT name, specialty, rating, completed_orders, status
        FROM masters ORDER BY completed_orders DESC NULLS LAST LIMIT 15
      `),
      db.execute(sql`
        SELECT status, COUNT(*) as cnt FROM leads GROUP BY status ORDER BY cnt DESC
      `),
    ]);

    const lines: string[] = ["=== ДАННЫЕ CRM ==="];

    if (orders.rows.length > 0) {
      lines.push("\nЗаказы по статусам:");
      (orders.rows as any[]).forEach(r => {
        lines.push(`  ${r.status}: ${r.cnt} шт${r.avg_price ? `, ср. цена ${Math.round(r.avg_price)} руб` : ""}`);
      });
    }

    if (masters.rows.length > 0) {
      lines.push("\nМастера:");
      (masters.rows as any[]).forEach(r => {
        lines.push(`  ${r.name} (${r.specialty ?? "—"}) | рейтинг: ${r.rating ?? "—"} | заказов: ${r.completed_orders ?? 0} | статус: ${r.status}`);
      });
    }

    if (leads.rows.length > 0) {
      lines.push("\nЛиды по статусам:");
      (leads.rows as any[]).forEach(r => {
        lines.push(`  ${r.status}: ${r.cnt}`);
      });
    }

    return lines.join("\n");
  } catch {
    return "";
  }
}

// ─── Plan decomposition ────────────────────────────────────────────────────

async function planGoal(goal: string): Promise<StepPlan[]> {
  const memories = await retrieveRelevantMemories(goal, 15);
  const memoryContext = buildMemoryContext(memories);

  const systemPrompt = `Ты опытный ИИ-ассистент и руководитель проектов для сервиса ремонта "Честный мастер".
Тебе дают высокоуровневую цель. Разбей её на 3-7 конкретных последовательных шагов.

Каждый шаг — это задание для ИИ-агента, который умеет:
- Анализировать данные CRM (заказы, мастера, лиды, финансы)
- Создавать тексты, скрипты продаж, шаблоны сообщений
- Разрабатывать стратегии и планы
- Давать рекомендации на основе данных
- Составлять отчёты и инструкции

Если из памяти уже известны нужные данные — не трать шаги на их повторный анализ.

Верни JSON:
{
  "steps": [
    {
      "index": 0,
      "title": "Краткое название (3-5 слов)",
      "description": "Что будет сделано (1-2 предложения)",
      "task": "Подробное задание для ИИ-агента. Что именно проанализировать, написать, разработать."
    }
  ]
}`;

  const userContent = memoryContext
    ? `Цель: ${goal}\n\n${memoryContext}`
    : `Цель: ${goal}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0].message.content ?? "{}";
  const parsed = JSON.parse(content);
  const steps: StepPlan[] = Array.isArray(parsed) ? parsed : (parsed.steps ?? parsed.plan ?? []);
  return steps.slice(0, 7).map((s, i) => ({ ...s, index: i }));
}

// ─── Execute one step with AI ──────────────────────────────────────────────

async function executeStep(
  goal: string,
  step: StepPlan,
  previousResults: { title: string; report: string }[],
  crmContext: string,
): Promise<string> {
  const prevContext = previousResults.length > 0
    ? "\n\nРезультаты предыдущих шагов:\n" +
      previousResults.map(r => `### ${r.title}\n${r.report}`).join("\n\n")
    : "";

  const memories = await retrieveRelevantMemories(step.task, 8);
  const memoryContext = buildMemoryContext(memories);

  const systemPrompt = `Ты ИИ-ассистент для строительно-ремонтного сервиса "Честный мастер" (Россия).
У тебя есть доступ к данным CRM и предыдущим результатам. Выполни поставленный шаг качественно и детально.

Правила:
- Используй данные CRM если они релевантны задаче
- Пиши конкретно, с числами и примерами там где уместно
- Используй Markdown для структуры
- Пиши на русском
- Максимум 400 слов на отчёт

${crmContext}${memoryContext ? "\n\n" + memoryContext : ""}${prevContext}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Общая цель: ${goal}\n\nТекущий шаг: ${step.title}\nЗадание: ${step.task}\n\nВыполни этот шаг и предоставь подробный результат.`,
      },
    ],
    temperature: 0.4,
    max_tokens: 1200,
  });

  return response.choices[0].message.content ?? "Нет результата";
}

// ─── Final summary report ──────────────────────────────────────────────────

async function generateFinalReport(
  goal: string,
  steps: StepResult[],
): Promise<string> {
  const stepsText = steps
    .map((s, i) =>
      `## Шаг ${i + 1}: ${s.title}\n${s.status === "error" ? "❌ Ошибка выполнения" : s.report}`,
    )
    .join("\n\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Ты аналитик. Напиши итоговый отчёт по выполненному заданию.

Структура:
# Итоговый отчёт: [название]

## Резюме
(2-3 предложения о результате)

## Ключевые результаты
(самые важные данные, тексты, рекомендации)

## Итог
(конкретный результат — что создано, написано, разработано)

## Следующие шаги
(рекомендации что делать дальше)

Форматирование Markdown. Пиши на русском.`,
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

  await db.execute(sql`
    UPDATE autonomous_sessions
    SET status='running', steps=${JSON.stringify(steps)}::jsonb, plan=${JSON.stringify(plan)}::jsonb
    WHERE id=${sessionId}
  `);

  // Load CRM context once for all steps
  const crmContext = await loadCrmContext();

  try {
    const completedResults: { title: string; report: string }[] = [];

    for (let i = 0; i < steps.length; i++) {
      if (ctrl.cancelled) {
        steps[i].status = "error";
        steps[i].report = "Отменено пользователем";
        break;
      }

      steps[i].status = "running";
      steps[i].startedAt = new Date().toISOString();
      const t0 = Date.now();

      await db.execute(sql`
        UPDATE autonomous_sessions
        SET steps=${JSON.stringify(steps)}::jsonb, current_step=${i}
        WHERE id=${sessionId}
      `);

      try {
        const report = await executeStep(goal, steps[i], completedResults, crmContext);
        steps[i].status = "done";
        steps[i].report = report;
        completedResults.push({ title: steps[i].title, report });

        // Save learnings to persistent memory
        extractAndSaveMemories({
          sessionId,
          goal,
          stepTitle: steps[i].title,
          stepReport: report,
          logs: [],
        }).catch(e => console.error("[autonomousAgent] Memory save error:", e));
      } catch (e) {
        steps[i].status = "error";
        steps[i].report = `Ошибка: ${String(e)}`;
      }

      steps[i].completedAt = new Date().toISOString();
      steps[i].durationMs = Date.now() - t0;

      await db.execute(sql`
        UPDATE autonomous_sessions
        SET steps=${JSON.stringify(steps)}::jsonb, current_step=${i + 1}
        WHERE id=${sessionId}
      `);

      if (i < steps.length - 1 && !ctrl.cancelled) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

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
    const res = await db.execute(sql`
      INSERT INTO autonomous_sessions (goal, status)
      VALUES (${goal}, 'planning')
      RETURNING id
    `);
    const sessionId = Number((res.rows[0] as any).id);

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
    if (ctrl) ctrl.cancelled = true;
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
