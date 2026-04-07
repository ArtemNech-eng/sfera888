import OpenAI from "openai";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  extractAndSaveMemories,
  retrieveRelevantMemories,
  buildMemoryContext,
} from "./agentMemory.js";

// ─── Predefined Scenarios ──────────────────────────────────────────────────

export interface PredefinedScenario {
  id: string;
  title: string;
  shortDescription: string;
  description: string;
  icon: string;
  color: string;
  goal: string;
  estimatedMinutes: number;
  category: "pricing" | "analytics" | "content" | "marketing" | "operations";
}

export const PREDEFINED_SCENARIOS: PredefinedScenario[] = [
  {
    id: "market_pricing_analysis",
    title: "Анализ рыночных цен",
    shortDescription: "Изучает сметы и прайсы мастеров, формирует актуальный прайс-лист средних рыночных цен",
    description: "Агент анализирует все сметы (оплаченные и неоплаченные) и прайс-листы мастеров. Группирует услуги, считает средние цены, выявляет аномалии. Итоговый прайс-лист сохраняется в постоянную память и доступен другим агентам.",
    icon: "chart",
    color: "green",
    estimatedMinutes: 6,
    category: "pricing",
    goal: `Проведи комплексный анализ рыночного ценообразования для строительно-ремонтного сервиса «Честный мастер».

ЗАДАЧА: используя реальные данные из смет и прайс-листов мастеров (уже загружены в контекст), определи средние рыночные цены по каждой услуге, выяви закономерности и аномалии, сформируй актуальный прайс-лист.

ШАГ 1 — АНАЛИЗ СМЕТ (оплаченных и неоплаченных):
Изучи каждую позицию из всех смет. Сгруппируй похожие/одинаковые названия услуг (например, «укладка плитки», «плитка укладка» и «монтаж плитки» — одна группа). Для каждой группы вычисли:
• Среднюю цену за единицу
• Минимальную и максимальную цену (диапазон)
• Количество упоминаний в сметах (частота)
• Типичную единицу измерения (м², п.м., шт, ч, кг и т.д.)
Отдельно выдели статистику по оплаченным сметам — они достовернее отражают принятые рынком цены.

ШАГ 2 — АНАЛИЗ ПРАЙС-ЛИСТОВ МАСТЕРОВ:
Изучи цены, которые мастера указали в своих профилях. Для каждой услуги сравни прайс мастера с реальными ценами из смет:
• Где мастера систематически занижают цены в прайсе (теряют деньги)
• Где мастера завышают цены в прайсе (проигрывают конкурентам)
• Услуги, которые есть в сметах, но отсутствуют в прайсах
• Услуги в прайсах, не встречающиеся в сметах

ШАГ 3 — ИТОГОВЫЙ ПРАЙС-ЛИСТ РЫНОЧНЫХ ЦЕН:
Составь таблицу топ-30 самых востребованных услуг по формату:
Услуга | Ср. цена | Мин | Макс | Ед. изм. | Кол-во в сметах
Отсортируй по убыванию частоты. Это будет официальный прайс-ориентир бизнеса.

ШАГ 4 — АНАЛИТИКА И РЕКОМЕНДАЦИИ:
• Услуги с наибольшим разбросом цен — где нужен единый стандарт
• Самые маржинальные услуги (высокие цены + высокая частота)
• Рекомендации: какие цены скорректировать мастерам, какие услуги продвигать

ОБЯЗАТЕЛЬНО — СОХРАНИ В ПОСТОЯННУЮ ПАМЯТЬ:
После завершения анализа обязательно сохрани итоговый прайс-лист и ключевые выводы в постоянную память агента:
- Категория: pricing
- Заголовок: «Рыночный прайс-лист [месяц и год анализа]»
- Важность: 5 (критично)
- Содержание: полная таблица с ценами + топ-5 выводов

Эти данные будут автоматически использоваться для: проверки смет клиентов, ценовых подсказок мастерам, ответов на вопросы о стоимости работ, настройки алертов на аномальные цены в сметах.`,
  },
];

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

// ─── Pricing context loader (specialized for market_pricing_analysis) ──────

async function loadPricingContext(): Promise<string> {
  try {
    const [receipts, masters] = await Promise.all([
      db.execute(sql`
        SELECT r.id, r.service_type, r.total_amount, r.city, r.district,
               r.line_items, r.prepayment_submitted_at, r.created_at,
               m.alias AS master_alias
        FROM receipts r
        LEFT JOIN masters m ON m.id = r.master_id
        WHERE jsonb_array_length(r.line_items) > 0
        ORDER BY r.created_at DESC
        LIMIT 400
      `),
      db.execute(sql`
        SELECT alias, city, specialization, service_prices
        FROM masters
        WHERE service_prices IS NOT NULL
          AND service_prices != 'null'::jsonb
          AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 120
      `),
    ]);

    const receiptRows = receipts.rows as any[];
    const masterRows = masters.rows as any[];
    const lines: string[] = ["=== ДАННЫЕ ДЛЯ АНАЛИЗА ЦЕН ==="];

    lines.push(`\n📋 СМЕТЫ (всего ${receiptRows.length} шт с позициями):`);
    for (const r of receiptRows) {
      const items: any[] = Array.isArray(r.line_items) ? r.line_items : [];
      if (items.length === 0) continue;
      const isPaid = !!r.prepayment_submitted_at;
      lines.push(
        `\n[Смета #${r.id}] ${r.service_type} | ${r.city}${r.district ? `, ${r.district}` : ""} | ` +
        `${isPaid ? "✅ оплачена" : "📝 не оплачена"} | итого: ${r.total_amount} руб | ` +
        `мастер: ${r.master_alias ?? "неизвестен"} | ` +
        `дата: ${new Date(r.created_at).toLocaleDateString("ru-RU")}`
      );
      for (const item of items) {
        const qty = item.quantity
          ? ` × ${item.quantity}${item.unit ? ` ${item.unit}` : ""}`
          : item.unit ? ` (${item.unit})` : "";
        lines.push(`  • ${item.description}${qty}: ${item.price} руб`);
      }
    }

    lines.push(`\n\n👷 ПРАЙС-ЛИСТЫ МАСТЕРОВ (${masterRows.length} мастеров с ценами):`);
    for (const m of masterRows) {
      let prices: any[] = [];
      if (Array.isArray(m.service_prices)) prices = m.service_prices;
      else if (typeof m.service_prices === "string") {
        try { prices = JSON.parse(m.service_prices); } catch {}
      }
      if (prices.length === 0) continue;
      lines.push(`\n${m.alias} | ${m.city} | ${m.specialization ?? "без специализации"}:`);
      for (const p of prices.slice(0, 30)) {
        lines.push(`  • ${p.service}: ${p.price} руб${p.unit ? ` / ${p.unit}` : ""}`);
      }
    }

    return lines.join("\n");
  } catch (e) {
    console.error("[loadPricingContext] error:", e);
    return "=== ОШИБКА ЗАГРУЗКИ ДАННЫХ О ЦЕНАХ ===";
  }
}

// ─── Context loader dispatcher ─────────────────────────────────────────────

async function loadContextForScenario(scenarioId: string): Promise<string> {
  switch (scenarioId) {
    case "market_pricing_analysis": return loadPricingContext();
    default: return loadCrmContext();
  }
}

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

async function runSession(sessionId: number, goal: string, plan: StepPlan[], scenarioId?: string) {
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

  // Load context: specialized loader for known scenarios, generic CRM context otherwise
  const crmContext = scenarioId
    ? await loadContextForScenario(scenarioId)
    : await loadCrmContext();

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
  getScenarios(): PredefinedScenario[] {
    return PREDEFINED_SCENARIOS.map(s => ({ ...s, goal: s.goal.slice(0, 200) + "..." }));
  },

  async start(goal: string, scenarioId?: string): Promise<number> {
    const res = await db.execute(sql`
      INSERT INTO autonomous_sessions (goal, status)
      VALUES (${goal}, 'planning')
      RETURNING id
    `);
    const sessionId = Number((res.rows[0] as any).id);

    (async () => {
      try {
        const plan = await planGoal(goal);
        await runSession(sessionId, goal, plan, scenarioId);
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

  async runScenario(scenarioId: string): Promise<number> {
    const scenario = PREDEFINED_SCENARIOS.find(s => s.id === scenarioId);
    if (!scenario) throw new Error(`Unknown scenario: ${scenarioId}`);
    return this.start(scenario.goal, scenarioId);
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
