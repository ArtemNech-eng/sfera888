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
  requiresConfirmation?: boolean;
}

export const PREDEFINED_SCENARIOS: PredefinedScenario[] = [
  {
    id: "masters_city_outreach",
    title: "Рассылка мастерам об открытых заказах",
    shortDescription: "Находит все заказы в поиске мастера и пишет каждому мастеру в его городе персональное сообщение",
    description: "Агент ищет все открытые заказы со статусом «ищем мастера», группирует по городам, составляет персональные сообщения для каждого мастера через GPT-4o и реально отправляет их в Max Messenger. Результаты сохраняются в память.",
    icon: "message",
    color: "blue",
    estimatedMinutes: 3,
    category: "operations",
    goal: "masters_city_outreach",
  },
  {
    id: "master_followup",
    title: "Связаться с мастерами по зависшим заказам",
    shortDescription: "Пишет мастерам из зоны риска: узнаёт как дела, почему завис заказ и когда ждать оплату",
    description: "Берёт мастеров с критичными и требующими внимания заказами (из АЛ-Диагностики), составляет персональные сообщения через GPT-4o и реально отправляет в Max Messenger. Каждое сообщение — адресное: упоминает конкретный заказ, деликатно уточняет статус и сроки оплаты.",
    icon: "users",
    color: "red",
    estimatedMinutes: 4,
    category: "operations",
    goal: "master_followup",
    requiresConfirmation: true,
  },
  {
    id: "al_diagnostics",
    title: "АЛ-Диагностика: пульс пайплайна",
    shortDescription: "Рентген активных заказов: кто из мастеров давно без контакта, сколько денег «висит» и кому писать сегодня",
    description: "Агент анализирует все заказы в статусах «мастер назначен» и «в работе» за последние 7 дней. Вычисляет дни без контакта для каждого мастера, группирует по уровню риска (🔴 критично / 🟡 внимание / 🟢 норма), оценивает сумму ожидаемых оплат и формирует чёткий план действий на сегодня. Работает даже с 1000+ мастерами.",
    icon: "zap",
    color: "orange",
    estimatedMinutes: 4,
    category: "analytics",
    goal: "al_diagnostics",
  },
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

// ─── Quiet hours helper ────────────────────────────────────────────────────

function isMasterCityQuietNow(city?: string | null): boolean {
  const offsetHours = 3; // all cities assumed MSK±0 for simplicity
  const localHour = new Date(Date.now() + offsetHours * 3600_000).getUTCHours();
  return localHour < 8 || localHour >= 22;
}

// ─── Masters outreach scenario (specialized executor) ─────────────────────
// Sends real Max Messenger messages to masters about waiting orders

async function runMastersOutreachScenario(sessionId: number): Promise<void> {
  const plan: StepPlan[] = [
    { index: 0, title: "Загрузка данных", description: "Поиск открытых заказов и активных мастеров", task: "" },
    { index: 1, title: "Генерация сообщений", description: "GPT-4o составляет персональные тексты", task: "" },
    { index: 2, title: "Отправка в Max", description: "Сообщения отправляются мастерам", task: "" },
    { index: 3, title: "Сохранение результатов", description: "Итоги записываются в постоянную память", task: "" },
  ];
  const steps: StepResult[] = plan.map(p => ({ ...p, status: "pending" as const, report: "", startedAt: undefined, completedAt: undefined, durationMs: undefined }));

  const updateSteps = async (currentStep: number) =>
    db.execute(sql`UPDATE autonomous_sessions SET steps=${JSON.stringify(steps)}::jsonb, current_step=${currentStep} WHERE id=${sessionId}`);

  await db.execute(sql`
    UPDATE autonomous_sessions
    SET status='running', steps=${JSON.stringify(steps)}::jsonb, plan=${JSON.stringify(plan)}::jsonb
    WHERE id=${sessionId}
  `);

  // ── Step 0: Load data ──────────────────────────────────────────────────
  steps[0].status = "running"; steps[0].startedAt = new Date().toISOString();
  await updateSteps(0);
  const t0 = Date.now();

  const [waitingOrdersRes, mastersRes] = await Promise.all([
    db.execute(sql`
      SELECT o.id, o.city, o.district, o.service_type, o.area, o.scheduled_at, o.comment,
             l.client_name
      FROM orders o
      LEFT JOIN leads l ON l.id = o.lead_id
      WHERE o.status = 'waiting_master'
        AND o.deleted_at IS NULL
      ORDER BY o.created_at DESC
      LIMIT 200
    `),
    db.execute(sql`
      SELECT id, alias, city, specialization, specializations, max_chat_id, status
      FROM masters
      WHERE status = 'active'
        AND max_chat_id IS NOT NULL
        AND max_chat_id != ''
        AND deleted_at IS NULL
    `),
  ]);

  const waitingOrders = waitingOrdersRes.rows as any[];
  const masters = mastersRes.rows as any[];

  const ordersByCity = new Map<string, any[]>();
  for (const o of waitingOrders) {
    const city = (o.city ?? "").trim();
    if (!city) continue;
    if (!ordersByCity.has(city)) ordersByCity.set(city, []);
    ordersByCity.get(city)!.push(o);
  }

  const mastersWithOrders = masters.filter(m => ordersByCity.has((m.city ?? "").trim()));

  steps[0].status = "done";
  steps[0].report =
    `Открытых заказов (ищем мастера): **${waitingOrders.length}** в ${ordersByCity.size} городах\n` +
    `Активных мастеров с Max Messenger: **${masters.length}** (в городах с заказами: **${mastersWithOrders.length}**)`;
  steps[0].completedAt = new Date().toISOString();
  steps[0].durationMs = Date.now() - t0;
  await updateSteps(1);

  if (mastersWithOrders.length === 0) {
    const finalReport =
      "# Рассылка отменена\n\nНет активных мастеров с Max Messenger в городах, где есть открытые заказы.";
    await db.execute(sql`
      UPDATE autonomous_sessions
      SET status='done', steps=${JSON.stringify(steps)}::jsonb, final_report=${finalReport}, completed_at=NOW()
      WHERE id=${sessionId}
    `);
    return;
  }

  // ── Step 1: Generate messages with GPT-4o ──────────────────────────────
  steps[1].status = "running"; steps[1].startedAt = new Date().toISOString();
  await updateSteps(1);
  const t1 = Date.now();

  // Build per-master context for batch GPT call
  const masterContexts = mastersWithOrders.map(m => {
    const cityOrders = ordersByCity.get((m.city ?? "").trim()) ?? [];
    // Prefer orders matching master's specialization
    let relevant = cityOrders;
    if (Array.isArray(m.specializations) && m.specializations.length > 0) {
      const filtered = cityOrders.filter(o =>
        (m.specializations as string[]).some(s =>
          (o.service_type ?? "").toLowerCase().includes(s.toLowerCase())
        )
      );
      if (filtered.length > 0) relevant = filtered;
    }
    const orderLines = relevant.slice(0, 5).map(o => {
      const parts: string[] = [o.service_type ?? "Ремонт"];
      if (o.district) parts.push(o.district);
      if (o.area) parts.push(`${o.area} м²`);
      if (o.scheduled_at) parts.push(new Date(o.scheduled_at).toLocaleDateString("ru-RU"));
      return `• ${parts.join(" · ")}`;
    }).join("\n");
    return {
      master: m,
      cityOrders: relevant,
      contextText: `Мастер: ${m.alias} | Город: ${m.city} | Специализация: ${m.specialization ?? "разные работы"}\nЗаказов в городе: ${cityOrders.length} (подходящих: ${relevant.length})\nЗаказы:\n${orderLines}`,
    };
  });

  const masterContextBatch = masterContexts.map((mc, i) => `[${i + 1}] ${mc.contextText}`).join("\n\n---\n\n");

  let generatedMessages: string[] = [];
  try {
    const gptRes = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Ты составляешь персональные сообщения мастерам строительно-ремонтного сервиса «Честный мастер».
Цель: уведомить мастера об открытых заказах в его городе и побудить взяться за один из них.

═══ СТРУКТУРА СООБЩЕНИЯ ═══

1. ОТКРЫТИЕ — имя + количество заказов (строго эту конструкцию):
   Одиночный: «Алексей, у нас есть 1 открытый заказ, по которому система ищет мастера.»
   Несколько: «Алексей, у нас сейчас 3 открытых заказа, по которым система ищет мастера.»

2. ПЕРЕЧИСЛЕНИЕ — кратко 2–4 заказа, каждый в отдельной строке:
   Включи: тип работ • район/улица (если есть) • площадь (если есть) • дата (если есть)
   Примеры строк:
   — Поклейка обоев, Центральный р-н, ~45 м²
   — Замена электропроводки, ул. Ленина, 10 апреля
   — Укладка плитки в санузле, ориентировочно на следующей неделе

3. ЗАВЕРШЕНИЕ — вопрос о готовности. Варьируй фразы между мастерами:
   «Готовы взять?» / «Есть интерес к кому-то из них?» / «Берёте один?» / «Готовы рассмотреть?»

═══ ТОНАЛЬНОСТЬ ═══
— Дружелюбно, по-деловому, как сообщение от диспетчера коллеге
— Никакого официоза, никаких вступительных слов («Добрый день» и т.п.)
— Уважительно: мастер — профессионал, не соискатель

═══ ТЕХНИЧЕСКИЕ ТРЕБОВАНИЯ ═══
— Длина: 5–9 строк, не длиннее
— Только обычный текст, никакого HTML и markdown
— Каждое сообщение уникально по формулировкам — не копируй шаблоны между мастерами
— Язык: русский

Верни строго JSON: {"messages": ["текст1", "текст2", ...]}, по одному сообщению для каждого мастера в том же порядке.`,
        },
        {
          role: "user",
          content: `Составь сообщения для ${masterContexts.length} мастеров:\n\n${masterContextBatch}`,
        },
      ],
      temperature: 0.65,
      response_format: { type: "json_object" },
    });
    const parsed = JSON.parse(gptRes.choices[0].message.content ?? "{}");
    generatedMessages = Array.isArray(parsed.messages) ? parsed.messages : [];
  } catch (e) {
    console.error("[mastersOutreach] GPT error:", e);
  }

  // Attach generated messages back to master contexts
  masterContexts.forEach((mc, i) => {
    (mc as any).message = generatedMessages[i] ?? null;
  });

  steps[1].status = "done";
  steps[1].report = `Сгенерировано сообщений: **${generatedMessages.filter(Boolean).length}** из ${masterContexts.length}`;
  steps[1].completedAt = new Date().toISOString();
  steps[1].durationMs = Date.now() - t1;
  await updateSteps(2);

  // ── Step 2: Send messages ──────────────────────────────────────────────
  steps[2].status = "running"; steps[2].startedAt = new Date().toISOString();
  await updateSteps(2);
  const t2 = Date.now();

  const { sendMaxMessage } = await import("./maxBot.js");

  let sent = 0;
  const sendLog: string[] = [];

  for (const mc of masterContexts) {
    const msg: string | null = (mc as any).message;
    if (!msg || !mc.master.max_chat_id) {
      sendLog.push(`${mc.master.alias}: пропущен (нет сообщения или Max ID)`);
      continue;
    }
    if (isMasterCityQuietNow(mc.master.city)) {
      sendLog.push(`${mc.master.alias}: пропущен — тихие часы`);
      continue;
    }
    try {
      await sendMaxMessage(mc.master.max_chat_id, msg);
      sent++;
      sendLog.push(`${mc.master.alias} (${mc.master.city}): ✅ — ${mc.cityOrders.length} заказ${mc.cityOrders.length === 1 ? "" : "ов"}`);
      await new Promise(r => setTimeout(r, 400)); // rate limit
    } catch {
      sendLog.push(`${mc.master.alias}: ⚠️ ошибка отправки`);
    }
  }

  steps[2].status = "done";
  steps[2].report = `Отправлено: **${sent}** из ${mastersWithOrders.length}\n\n${sendLog.join("\n")}`;
  steps[2].completedAt = new Date().toISOString();
  steps[2].durationMs = Date.now() - t2;
  await updateSteps(3);

  // ── Step 3: Save to persistent memory ─────────────────────────────────
  steps[3].status = "running"; steps[3].startedAt = new Date().toISOString();
  await updateSteps(3);

  const dateStr = new Date().toLocaleDateString("ru-RU");
  const memorySummary =
    `Рассылка мастерам об открытых заказах (${dateStr})\n` +
    `Отправлено: ${sent} мастерам\n` +
    `Открытых заказов в системе: ${waitingOrders.length}\n` +
    `Города с заказами: ${[...ordersByCity.keys()].join(", ")}\n\n` +
    sendLog.slice(0, 30).join("\n");

  await extractAndSaveMemories({
    sessionId,
    goal: `Рассылка мастерам об открытых заказах — ${dateStr}`,
    stepTitle: `Рассылка ${dateStr}: ${sent} мастеров`,
    stepReport: memorySummary,
    logs: [],
  }).catch(e => console.error("[mastersOutreach] Memory save error:", e));

  steps[3].status = "done";
  steps[3].report = "Итоги сохранены в постоянную память агента.";
  steps[3].completedAt = new Date().toISOString();

  const finalReport =
    `# Рассылка мастерам — ${dateStr}\n\n` +
    `## Результат\nОтправлено **${sent}** сообщений мастерам в ${ordersByCity.size} городах.\n\n` +
    `## Открытые заказы\nВсего: ${waitingOrders.length} заказов в статусе «ищем мастера»\n` +
    `Города: ${[...ordersByCity.keys()].join(", ")}\n\n` +
    `## Детали отправки\n${sendLog.join("\n")}\n\n` +
    `## Следующие шаги\n` +
    `— Проверить отклики мастеров через 1–2 часа\n` +
    `— Заказы без откликов — рассмотреть вручную или запустить сценарий повторно`;

  await db.execute(sql`
    UPDATE autonomous_sessions
    SET status='done',
        steps=${JSON.stringify(steps)}::jsonb,
        current_step=4,
        final_report=${finalReport},
        completed_at=NOW()
    WHERE id=${sessionId}
  `);
}

// ─── Shared: compute at-risk masters (used by AL-Diagnostics + Followup) ─────

export interface AtRiskMaster {
  masterId: number;
  alias: string;
  city: string;
  phone: string;
  maxChatId: string | null;
  orders: { id: number; serviceType: string; status: string; amount: number; assignedAt: Date | null; daysSinceAssigned?: number }[];
  totalAmount: number;
  lastContactAt: Date | null;
  daysSinceContact: number;
  risk: "critical" | "warning" | "ok";
  riskReasons: string[];
}

export async function computeAtRiskMasters(days = 7): Promise<{
  critical: AtRiskMaster[];
  warning: AtRiskMaster[];
  ok: AtRiskMaster[];
  all: AtRiskMaster[];
  totalAmount: number;
  orderCount: number;
  days: number;
}> {
  const safedays = Math.min(14, Math.max(1, Math.round(days)));
  const ordersRes = await db.execute(sql`
    SELECT
      o.id, o.service_type, o.city, o.status,
      COALESCE(o.order_amount, o.proposed_amount, 0)::numeric AS amount,
      o.assigned_at, o.updated_at, o.created_at,
      m.id AS master_id, m.alias AS master_alias,
      m.city AS master_city, m.phone AS master_phone,
      m.max_chat_id AS master_max_chat_id
    FROM orders o
    JOIN masters m ON m.id = o.master_id
    WHERE o.status IN ('master_assigned', 'in_progress')
      AND o.deleted_at IS NULL
      AND o.master_id IS NOT NULL
      AND o.created_at >= NOW() - (${safedays} || ' days')::interval
    ORDER BY o.updated_at ASC
  `);
  const orders = ordersRes.rows as any[];
  const masterIds = [...new Set(orders.map(o => Number(o.master_id)))];

  const lastContactMap = new Map<number, Date>();
  if (masterIds.length > 0) {
    const contactRes = await db.execute(sql`
      SELECT m_id, MAX(last_touch) AS last_contact_at
      FROM (
        SELECT master_id AS m_id, MAX(created_at) AS last_touch FROM master_messages
          WHERE master_id = ANY(${masterIds}::int[]) GROUP BY master_id
        UNION ALL
        SELECT master_id AS m_id, MAX(created_at) AS last_touch FROM master_tasks
          WHERE master_id = ANY(${masterIds}::int[]) GROUP BY master_id
        UNION ALL
        SELECT master_id AS m_id, MAX(created_at) AS last_touch FROM order_dispatches
          WHERE master_id = ANY(${masterIds}::int[]) GROUP BY master_id
      ) t GROUP BY m_id
    `);
    for (const row of contactRes.rows as any[]) {
      lastContactMap.set(Number(row.m_id), new Date(row.last_contact_at));
    }
  }

  const now = Date.now();
  const DAY_MS = 86_400_000;
  const masterMap = new Map<number, AtRiskMaster>();

  for (const o of orders) {
    const mid = Number(o.master_id);
    if (!masterMap.has(mid)) {
      const lastContact = lastContactMap.get(mid) ?? null;
      masterMap.set(mid, {
        masterId: mid,
        alias: o.master_alias,
        city: o.master_city,
        phone: o.master_phone,
        maxChatId: o.master_max_chat_id,
        orders: [],
        totalAmount: 0,
        lastContactAt: lastContact,
        daysSinceContact: lastContact ? (now - lastContact.getTime()) / DAY_MS : 999,
        risk: "ok",
        riskReasons: [],
      });
    }
    const entry = masterMap.get(mid)!;
    const assignedAt = o.assigned_at ? new Date(o.assigned_at) : null;
    entry.orders.push({
      id: Number(o.id), serviceType: o.service_type ?? "Ремонт",
      status: o.status, amount: Number(o.amount) || 0,
      assignedAt,
      daysSinceAssigned: assignedAt ? (now - assignedAt.getTime()) / DAY_MS : undefined,
    });
    entry.totalAmount += Number(o.amount) || 0;
  }

  for (const e of masterMap.values()) {
    const reasons: string[] = [];
    const d = e.daysSinceContact;
    const inProgress = e.orders.filter(o => o.status === "in_progress");
    const assigned   = e.orders.filter(o => o.status === "master_assigned");

    if (inProgress.length > 0 && d > 3) reasons.push(`в работе, контакта нет ${Math.floor(d)} дн.`);
    if (assigned.some(o => (o.daysSinceAssigned ?? 0) > 4)) reasons.push(`назначен >4 дней, не начал`);
    if (e.totalAmount > 0 && d > 4) reasons.push(`зависла сумма ${e.totalAmount.toLocaleString("ru-RU")} ₽`);

    if (reasons.length > 0) { e.risk = "critical"; e.riskReasons = reasons; continue; }

    if (d > 1.5) reasons.push(`${Math.floor(d)} дн. без контакта`);
    if (assigned.some(o => (o.daysSinceAssigned ?? 0) > 2)) reasons.push(`назначен >2 дней`);

    if (reasons.length > 0) { e.risk = "warning"; e.riskReasons = reasons; }
  }

  const all     = [...masterMap.values()];
  const critical = all.filter(e => e.risk === "critical").sort((a,b) => b.daysSinceContact - a.daysSinceContact);
  const warning  = all.filter(e => e.risk === "warning").sort((a,b) => b.daysSinceContact - a.daysSinceContact);
  const ok       = all.filter(e => e.risk === "ok");
  const totalAmount = all.reduce((s, e) => s + e.totalAmount, 0);

  return { critical, warning, ok, all, totalAmount, orderCount: orders.length, days: safedays };
}

// ─── Master followup scenario (write to stalled masters) ──────────────────
// Takes at-risk masters (critical + warning), generates personalized check-in
// messages via GPT-4o, sends via Max. Requires confirmation before sending.

async function runMasterFollowupScenario(sessionId: number): Promise<void> {
  const plan: StepPlan[] = [
    { index: 0, title: "Загрузка зоны риска",  description: "Мастера с зависшими заказами из АЛ-Диагностики", task: "" },
    { index: 1, title: "Составление сообщений", description: "GPT-4o пишет персональные follow-up по каждому заказу", task: "" },
    { index: 2, title: "Отправка в Max",         description: "Сообщения уходят мастерам", task: "" },
    { index: 3, title: "Сохранение в память",    description: "Итоги записываются в постоянную память агента", task: "" },
  ];
  const steps: StepResult[] = plan.map(p => ({ ...p, status: "pending" as const, report: "", startedAt: undefined, completedAt: undefined, durationMs: undefined }));
  const upd = async (step: number) =>
    db.execute(sql`UPDATE autonomous_sessions SET steps=${JSON.stringify(steps)}::jsonb, current_step=${step} WHERE id=${sessionId}`);

  await db.execute(sql`
    UPDATE autonomous_sessions SET status='running', steps=${JSON.stringify(steps)}::jsonb, plan=${JSON.stringify(plan)}::jsonb WHERE id=${sessionId}
  `);

  // ── Step 0: Load at-risk masters ────────────────────────────────────────
  steps[0].status = "running"; steps[0].startedAt = new Date().toISOString();
  await upd(0);
  const t0 = Date.now();

  const { critical, warning, all } = await computeAtRiskMasters();
  const targets = [...critical, ...warning].filter(m => m.maxChatId);

  steps[0].status = "done";
  steps[0].report =
    `🔴 Критично: **${critical.length}** | 🟡 Внимание: **${warning.length}**\n` +
    `Мастеров с Max Messenger (получат сообщение): **${targets.length}**`;
  steps[0].completedAt = new Date().toISOString();
  steps[0].durationMs = Date.now() - t0;
  await upd(1);

  if (targets.length === 0) {
    const report = "# Рассылка отменена\n\nНет мастеров в зоне риска с привязанным Max Messenger.";
    await db.execute(sql`UPDATE autonomous_sessions SET status='done', steps=${JSON.stringify(steps)}::jsonb, final_report=${report}, completed_at=NOW() WHERE id=${sessionId}`);
    return;
  }

  // ── Step 1: Generate follow-up messages ─────────────────────────────────
  steps[1].status = "running"; steps[1].startedAt = new Date().toISOString();
  await upd(1);
  const t1 = Date.now();

  const fmt = (n: number) => n > 0 ? `${n.toLocaleString("ru-RU")} ₽` : "";
  const riskLabel = (r: string) => r === "critical" ? "🔴 критично" : "🟡 внимание";

  const mastersBlock = targets.map((m, i) => {
    const contactStr = m.lastContactAt
      ? `${Math.floor(m.daysSinceContact)} дн. назад`
      : "контакта не было";
    const orderLines = m.orders.map(o => {
      const since = o.daysSinceAssigned ? `${Math.floor(o.daysSinceAssigned)} дн.` : "";
      const st = o.status === "in_progress" ? "в работе" : "назначен";
      return `${o.serviceType} [${st}${since ? " " + since : ""}]${o.amount > 0 ? " — " + fmt(o.amount) : ""}`;
    }).join("; ");
    return `[${i+1}] ${m.alias} | ${m.city} | ${riskLabel(m.risk)} | контакт: ${contactStr} | заказы: ${orderLines} | причина: ${m.riskReasons.join(", ")}`;
  }).join("\n");

  let generatedMessages: string[] = [];
  try {
    const gptRes = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.55,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Ты — диспетчер сервиса «Честный мастер». Твоя задача: написать мастерам, у которых зависли заказы — деликатно уточнить статус.

═══ ЦЕЛЬ СООБЩЕНИЯ ═══
Узнать: что происходит с заказом, есть ли сложности, когда планируется завершение и когда ожидать оплату.

═══ СТРУКТУРА (строго) ═══
1. Имя мастера (без «Привет» и «Добрый день» — сразу к делу)
2. Напомни о конкретном заказе (тип работ, статус, сколько дней)
3. Задай вопрос: как дела, есть ли сложности или что-то нужно с нашей стороны?
4. Уточни: когда планируется завершение и когда ждать закрытия?
5. Короткое предложение помощи: «Если что-то нужно — пиши, поможем»

═══ ТОНАЛЬНОСТЬ ═══
— Коллегиально, не как начальник к подчинённому
— Беспокойство, а не давление: мы заботимся, не наезжаем
— Конкретно: упомяни тип работ и статус, не «у тебя есть заказ»
— Каждое сообщение уникально — не повторяй одни и те же фразы
— Без HTML и markdown, только обычный текст
— Длина: 5–8 строк

═══ ПРИМЕР ═══
«Алексей, у тебя в работе ремонт ванной комнаты — уже 5 дней. Как всё идёт? Есть какие-то сложности или что-то нужно с нашей стороны? Когда планируешь завершить и когда клиент закроет оплату? Если что-то нужно — пиши, разберёмся.»

Верни строго JSON: {"messages": ["текст1", "текст2", ...]}, по одному на каждого мастера в том же порядке.`,
        },
        {
          role: "user",
          content: `Составь follow-up сообщения для ${targets.length} мастеров:\n\n${mastersBlock}`,
        },
      ],
    });
    const parsed = JSON.parse(gptRes.choices[0].message.content ?? "{}");
    generatedMessages = Array.isArray(parsed.messages) ? parsed.messages : [];
  } catch (e) {
    console.error("[masterFollowup] GPT error:", e);
  }

  steps[1].status = "done";
  steps[1].report = `Сгенерировано: **${generatedMessages.filter(Boolean).length}** из ${targets.length} сообщений`;
  steps[1].completedAt = new Date().toISOString();
  steps[1].durationMs = Date.now() - t1;
  await upd(2);

  // ── Step 2: Send messages ────────────────────────────────────────────────
  steps[2].status = "running"; steps[2].startedAt = new Date().toISOString();
  await upd(2);
  const t2 = Date.now();

  const { sendMaxMessage } = await import("./maxBot.js");
  let sent = 0;
  const sendLog: string[] = [];

  for (let i = 0; i < targets.length; i++) {
    const m = targets[i];
    const msg = generatedMessages[i];
    if (!msg || !m.maxChatId) { sendLog.push(`${m.alias}: пропущен (нет сообщения или Max ID)`); continue; }
    if (isMasterCityQuietNow(m.city)) { sendLog.push(`${m.alias}: пропущен — тихие часы`); continue; }
    try {
      await sendMaxMessage(m.maxChatId, msg);
      sent++;
      sendLog.push(`${m.alias} (${m.city}): ✅ ${riskLabel(m.risk)} — ${m.orders.length} заказ${m.orders.length === 1 ? "" : "а"}`);
      await new Promise(r => setTimeout(r, 400));
    } catch {
      sendLog.push(`${m.alias}: ⚠️ ошибка отправки`);
    }
  }

  steps[2].status = "done";
  steps[2].report = `Отправлено: **${sent}** из ${targets.length}\n\n${sendLog.join("\n")}`;
  steps[2].completedAt = new Date().toISOString();
  steps[2].durationMs = Date.now() - t2;
  await upd(3);

  // ── Step 3: Save to memory ──────────────────────────────────────────────
  steps[3].status = "running"; steps[3].startedAt = new Date().toISOString();
  await upd(3);

  const dateStr = new Date().toLocaleDateString("ru-RU");
  const critMasters = critical.filter(m => m.maxChatId);
  const warnMasters = warning.filter(m => m.maxChatId);

  const memorySummary =
    `Follow-up рассылка мастерам (${dateStr}): отправлено ${sent}/${targets.length} сообщений.\n` +
    `🔴 Критичных: ${critMasters.length} | 🟡 Внимание: ${warnMasters.length}\n` +
    (critMasters.length > 0
      ? `Топ критичных: ${critMasters.slice(0,5).map(m => `${m.alias} (${Math.floor(m.daysSinceContact)}дн., ${fmt(m.totalAmount)})`).join("; ")}`
      : "");

  await extractAndSaveMemories({
    sessionId,
    goal: `Follow-up по зависшим заказам — ${dateStr}`,
    stepTitle: `Follow-up ${dateStr}: 🔴${critMasters.length} 🟡${warnMasters.length} — отправлено ${sent}`,
    stepReport: memorySummary,
    logs: [],
  }).catch(e => console.error("[masterFollowup] Memory save error:", e));

  steps[3].status = "done";
  steps[3].report = "Результаты сохранены в постоянную память агента.";
  steps[3].completedAt = new Date().toISOString();

  const finalReport =
    `# Follow-up по зависшим заказам — ${dateStr}\n\n` +
    `## Результат\nОтправлено **${sent}** сообщений мастерам в зоне риска.\n` +
    `🔴 Критично: ${critical.length} | 🟡 Внимание: ${warning.length}\n\n` +
    `## Детали\n${sendLog.join("\n")}\n\n` +
    `## Следующие шаги\n` +
    `— Проверить ответы мастеров через 2–3 часа\n` +
    `— Не ответившим — позвонить или эскалировать\n` +
    `— Запустить АЛ-Диагностику завтра для сравнения`;

  await db.execute(sql`
    UPDATE autonomous_sessions SET status='done', steps=${JSON.stringify(steps)}::jsonb, current_step=4, final_report=${finalReport}, completed_at=NOW() WHERE id=${sessionId}
  `);
}

// ─── AL-Diagnostics scenario (pipeline health monitoring) ─────────────────
// Scans active orders, computes days-without-contact per master, risk-groups,
// and produces a prioritized action plan. Scales to 1000+ masters.

async function runALDiagnosticsScenario(sessionId: number, days = 7): Promise<void> {
  const plan: StepPlan[] = [
    { index: 0, title: "Загрузка пайплайна",      description: `Активные заказы за ${days} дн. + даты последнего контакта`, task: "" },
    { index: 1, title: "Классификация рисков",     description: "Расчёт дней без контакта, группировка 🔴/🟡/🟢", task: "" },
    { index: 2, title: "Анализ и план действий",   description: "GPT-4o формирует исполнительный отчёт и приоритеты на сегодня", task: "" },
    { index: 3, title: "Сохранение в память",      description: "Отчёт записывается в постоянную память агента", task: "" },
  ];
  const steps: StepResult[] = plan.map(p => ({ ...p, status: "pending" as const, report: "", startedAt: undefined, completedAt: undefined, durationMs: undefined }));

  const upd = async (step: number) =>
    db.execute(sql`UPDATE autonomous_sessions SET steps=${JSON.stringify(steps)}::jsonb, current_step=${step} WHERE id=${sessionId}`);

  await db.execute(sql`
    UPDATE autonomous_sessions
    SET status='running', steps=${JSON.stringify(steps)}::jsonb, plan=${JSON.stringify(plan)}::jsonb
    WHERE id=${sessionId}
  `);

  // ── Steps 0+1: Load data and classify risk (shared helper) ─────────────
  steps[0].status = "running"; steps[0].startedAt = new Date().toISOString();
  await upd(0);
  const t0 = Date.now();

  const { critical, warning, ok, all: allEntries, totalAmount, orderCount } = await computeAtRiskMasters(days);

  steps[0].status = "done";
  steps[0].report = `Активных заказов: **${orderCount}** у **${allEntries.length}** мастеров за последние **${days} дн.**`;
  steps[0].completedAt = new Date().toISOString();
  steps[0].durationMs = Date.now() - t0;
  await upd(1);

  steps[1].status = "running"; steps[1].startedAt = new Date().toISOString();
  await upd(1);
  const t1 = Date.now();

  const fmt = (n: number) => n.toLocaleString("ru-RU") + " ₽";
  const criticalAmount = critical.reduce((s, e) => s + e.totalAmount, 0);
  const warningAmount  = warning.reduce((s, e) => s + e.totalAmount, 0);
  const okAmount       = ok.reduce((s, e) => s + e.totalAmount, 0);

  steps[1].status = "done";
  steps[1].report =
    `🔴 Критично: **${critical.length}** мастеров / ${fmt(criticalAmount)}\n` +
    `🟡 Внимание: **${warning.length}** мастеров / ${fmt(warningAmount)}\n` +
    `🟢 Норма:    **${ok.length}** мастеров / ${fmt(okAmount)}\n\n` +
    `Итого ожидаемые оплаты: **${fmt(totalAmount)}**`;
  steps[1].completedAt = new Date().toISOString();
  steps[1].durationMs = Date.now() - t1;
  await upd(2);

  // ── Step 2: GPT analysis & action plan ────────────────────────────────
  steps[2].status = "running"; steps[2].startedAt = new Date().toISOString();
  await upd(2);
  const t2 = Date.now();

  // Build compact data block for GPT (scalable — groups, not rows)
  const formatEntry = (e: MasterPipelineEntry) => {
    const contactStr = e.lastContactAt
      ? `${Math.floor(e.daysSinceContact)} дн. назад (${e.lastContactAt.toLocaleDateString("ru-RU")})`
      : "никогда";
    const ordersSummary = e.orders.map(o =>
      `#${o.id} ${o.serviceType} [${o.status === "in_progress" ? "в работе" : "назначен"}]${o.amount > 0 ? ` ${o.amount.toLocaleString("ru-RU")} ₽` : ""}`
    ).join("; ");
    return `• ${e.alias} (${e.city}) — ${e.orders.length} заказ${e.orders.length > 1 ? "а" : ""}, ${fmt(e.totalAmount)}, контакт: ${contactStr} | ${e.riskReasons.join(", ")} | ${ordersSummary}`;
  };

  const criticalBlock = critical.slice(0, 50).map(formatEntry).join("\n") || "—";
  const warningBlock  = warning.slice(0, 30).map(formatEntry).join("\n") || "—";
  const okSummary     = ok.length > 0
    ? `${ok.length} мастеров, суммарно ${fmt(okAmount)} — без нареканий`
    : "—";

  const dateStr = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

  const gptInput = `
ДАТА ДИАГНОСТИКИ: ${dateStr}

═══ СВОДКА ═══
Всего мастеров с активными заказами: ${allEntries.length}
Заказов: ${orders.length} | Ожидаемые оплаты: ${fmt(totalAmount)}
🔴 Критично: ${critical.length} мастеров / ${fmt(criticalAmount)}
🟡 Внимание: ${warning.length} мастеров / ${fmt(warningAmount)}
🟢 Норма: ${ok.length} мастеров / ${fmt(okAmount)}

═══ 🔴 КРИТИЧНО (писать сегодня) ═══
${criticalBlock}

═══ 🟡 ВНИМАНИЕ (мониторить) ═══
${warningBlock}

═══ 🟢 НОРМА ═══
${okSummary}
`.trim();

  let finalReport = "";
  try {
    const gptRes = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Ты — аналитик сервиса «Честный мастер». Твоя задача: превратить сырые данные о пайплайне мастеров в чёткий исполнительный отчёт для руководителя.

СТРУКТУРА ОТЧЁТА (строго соблюдай):

# АЛ-Диагностика: пульс пайплайна — [дата]

## Итог одной строкой
[одно предложение: ключевое состояние пайплайна сегодня]

## Финансовый пайплайн
- Ожидаемые оплаты: [сумма]
- Из них под риском: [критично + внимание суммы]
- В норме: [сумма]

## 🔴 Критично — действовать СЕГОДНЯ ([N мастеров)
[для каждого мастера в группе критично:]
**Имя (город)** — [X заказов, сумма]
- Причина: [причина риска]
- Заказы: [список]
- Контакт: [когда]
- ✍️ Действие: [конкретная рекомендация — написать/позвонить/уточнить что именно]

## 🟡 Внимание — мониторинг ([N мастеров)
[аналогично, но компактнее — 1-2 строки на мастера]

## 🟢 Норма ([N мастеров / сумма)
[одна строка итога — без детализации по каждому]

## 📋 План на сегодня
[нумерованный список конкретных действий, отсортированных по приоритету]
1. ...
2. ...

ТОНАЛЬНОСТЬ:
— Деловая, конкретная, без воды
— Каждая рекомендация — чёткое действие, не общая фраза
— Числа в формате 25 000 ₽ (не "25000руб")
— Если критичных мастеров > 10 — выдели топ-10 по риску/сумме, остальных укажи счётчиком
— Язык: русский`,
        },
        {
          role: "user",
          content: gptInput,
        },
      ],
      temperature: 0.3,
    });
    finalReport = gptRes.choices[0].message.content ?? "";
  } catch (e) {
    console.error("[alDiagnostics] GPT error:", e);
    finalReport =
      `# АЛ-Диагностика — ${dateStr}\n\n` +
      `## Сводка\nАктивных мастеров: ${allEntries.length} | Ожидаемые оплаты: ${fmt(totalAmount)}\n\n` +
      `## 🔴 Критично (${critical.length})\n${criticalBlock}\n\n` +
      `## 🟡 Внимание (${warning.length})\n${warningBlock}\n\n` +
      `## 🟢 Норма: ${okSummary}`;
  }

  steps[2].status = "done";
  steps[2].report = `Отчёт сформирован. 🔴 ${critical.length} / 🟡 ${warning.length} / 🟢 ${ok.length}`;
  steps[2].completedAt = new Date().toISOString();
  steps[2].durationMs = Date.now() - t2;
  await upd(3);

  // ── Step 3: Save to persistent memory ─────────────────────────────────
  steps[3].status = "running"; steps[3].startedAt = new Date().toISOString();
  await upd(3);

  const memorySummary =
    `АЛ-Диагностика ${dateStr}: ` +
    `${allEntries.length} мастеров, ${orders.length} заказов, ${fmt(totalAmount)}. ` +
    `Критично: ${critical.length} (${fmt(criticalAmount)}), ` +
    `Внимание: ${warning.length} (${fmt(warningAmount)}), ` +
    `Норма: ${ok.length} (${fmt(okAmount)}). ` +
    (critical.length > 0
      ? `Топ-риск: ${critical.slice(0,3).map(e => `${e.alias} (${Math.floor(e.daysSinceContact)}дн. без контакта, ${fmt(e.totalAmount)})`).join("; ")}`
      : "Критичных нет.");

  await extractAndSaveMemories({
    sessionId,
    goal: `АЛ-Диагностика пайплайна — ${dateStr}`,
    stepTitle: `Диагностика ${dateStr}: 🔴${critical.length} / 🟡${warning.length} / 🟢${ok.length}`,
    stepReport: memorySummary,
    logs: [],
  }).catch(e => console.error("[alDiagnostics] Memory save error:", e));

  steps[3].status = "done";
  steps[3].report = "Диагностика сохранена в постоянную память агента.";
  steps[3].completedAt = new Date().toISOString();

  await db.execute(sql`
    UPDATE autonomous_sessions
    SET status='done',
        steps=${JSON.stringify(steps)}::jsonb,
        current_step=4,
        final_report=${finalReport},
        completed_at=NOW()
    WHERE id=${sessionId}
  `);
}

// ─── Market pricing analysis scenario (specialized executor) ─────────────────

async function runMarketPricingScenario(sessionId: number): Promise<void> {
  const plan: StepPlan[] = [
    { index: 0, title: "Загрузка данных",           description: "Сметы и прайс-листы мастеров из базы данных", task: "" },
    { index: 1, title: "Анализ цен (GPT-4o)",       description: "Группировка услуг, расчёт средних, аномалии, топ-30 прайс", task: "" },
    { index: 2, title: "Сохранение в память",       description: "Прайс-лист записывается в постоянную память агента", task: "" },
  ];
  const steps: StepResult[] = plan.map(p => ({ ...p, status: "pending" as const, report: "", startedAt: undefined, completedAt: undefined, durationMs: undefined }));

  const upd = async (step: number) =>
    db.execute(sql`UPDATE autonomous_sessions SET steps=${JSON.stringify(steps)}::jsonb, current_step=${step} WHERE id=${sessionId}`);

  await db.execute(sql`
    UPDATE autonomous_sessions
    SET status='running', steps=${JSON.stringify(steps)}::jsonb, plan=${JSON.stringify(plan)}::jsonb
    WHERE id=${sessionId}
  `);

  // ── Step 0: Load pricing data ─────────────────────────────────────────────
  steps[0].status = "running"; steps[0].startedAt = new Date().toISOString();
  await upd(0);
  const t0 = Date.now();

  const pricingData = await loadPricingContext();

  steps[0].status = "done";
  const receiptMatch = pricingData.match(/СМЕТЫ \(всего (\d+) шт/);
  const masterMatch  = pricingData.match(/ПРАЙС-ЛИСТЫ МАСТЕРОВ \((\d+) мастеров/);
  steps[0].report =
    `Загружено: **${receiptMatch?.[1] ?? "?"} смет** и **${masterMatch?.[1] ?? "?"} прайс-листов** мастеров.`;
  steps[0].completedAt = new Date().toISOString();
  steps[0].durationMs  = Date.now() - t0;
  await upd(1);

  // ── Step 1: GPT-4o analysis ───────────────────────────────────────────────
  steps[1].status = "running"; steps[1].startedAt = new Date().toISOString();
  await upd(1);
  const t1 = Date.now();

  const dateStr = new Date().toLocaleDateString("ru-RU", { month: "long", year: "numeric" });

  let finalReport = "";
  try {
    const gptRes = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 3000,
      messages: [
        {
          role: "system",
          content:
            `Ты — аналитик сервиса «Честный мастер». Проведи анализ рыночных цен на основе реальных данных из смет и прайсов мастеров.

СТРУКТУРА ОТЧЁТА (строго соблюдай):

# Рыночный прайс-лист — ${dateStr}

## Топ-30 услуг по востребованности
Таблица: Услуга | Ср. цена | Мин | Макс | Ед. изм. | Упоминаний

## Аномалии и несоответствия
Где мастера занижают/завышают цены vs сметы.

## Маржинальные услуги
Топ-5 самых прибыльных направлений.

## Рекомендации
Конкретные действия: какие цены скорректировать, какие услуги продвигать.

Будь конкретен, используй числа из данных. Отвечай по-русски.`,
        },
        {
          role: "user",
          content: pricingData.slice(0, 28000), // safety limit
        },
      ],
    });

    finalReport = gptRes.choices[0]?.message?.content?.trim() ?? "Анализ недоступен";
  } catch (e) {
    finalReport = `Ошибка GPT-4o: ${String(e)}`;
    console.error("[marketPricing] GPT error:", e);
  }

  steps[1].status    = "done";
  steps[1].report    = finalReport;
  steps[1].completedAt = new Date().toISOString();
  steps[1].durationMs  = Date.now() - t1;
  await upd(2);

  // ── Step 2: Save to persistent memory ────────────────────────────────────
  steps[2].status = "running"; steps[2].startedAt = new Date().toISOString();
  await upd(2);

  await extractAndSaveMemories({
    sessionId,
    goal: `Анализ рыночных цен — ${dateStr}`,
    stepTitle: `Рыночный прайс-лист ${dateStr}`,
    stepReport: finalReport,
    logs: [],
  }).catch(e => console.error("[marketPricing] Memory save error:", e));

  steps[2].status    = "done";
  steps[2].report    = `Рыночный прайс-лист за ${dateStr} сохранён в постоянную память агента.`;
  steps[2].completedAt = new Date().toISOString();

  await db.execute(sql`
    UPDATE autonomous_sessions
    SET status='done',
        steps=${JSON.stringify(steps)}::jsonb,
        current_step=3,
        final_report=${finalReport},
        completed_at=NOW()
    WHERE id=${sessionId}
  `);
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

  async runScenario(scenarioId: string, opts?: { days?: number }): Promise<number> {
    const scenario = PREDEFINED_SCENARIOS.find(s => s.id === scenarioId);
    if (!scenario) throw new Error(`Unknown scenario: ${scenarioId}`);

    const days = Math.min(14, Math.max(1, Math.round(opts?.days ?? 7)));

    // Specialized scenarios have their own executors (not AI planning pipeline)
    const SPECIALIZED: Record<string, (id: number, days?: number) => Promise<void>> = {
      masters_city_outreach:   runMastersOutreachScenario,
      master_followup:         runMasterFollowupScenario,
      al_diagnostics:          runALDiagnosticsScenario,
      market_pricing_analysis: (id) => runMarketPricingScenario(id),
    };

    if (SPECIALIZED[scenarioId]) {
      const res = await db.execute(sql`
        INSERT INTO autonomous_sessions (goal, status)
        VALUES (${scenario.title}, 'planning')
        RETURNING id
      `);
      const sessionId = Number((res.rows[0] as any).id);
      SPECIALIZED[scenarioId](sessionId, days).catch(e => {
        console.error(`[autonomousAgent] Scenario ${scenarioId} error:`, e);
        db.execute(sql`
          UPDATE autonomous_sessions
          SET status='error', error=${String(e)}, completed_at=NOW()
          WHERE id=${sessionId}
        `).catch(() => {});
      });
      return sessionId;
    }

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
