/**
 * Persistent agent memory — survives restarts and redeployments.
 * Stored in PostgreSQL agent_memory table.
 */
import OpenAI from "openai";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface MemoryEntry {
  id: number;
  agent: string;
  category: string;
  title: string;
  content: string;
  sourceUrl: string | null;
  sessionId: number | null;
  importance: number;
  createdAt: string;
  expiresAt: string | null;
}

// ─── Categories ────────────────────────────────────────────────────────────

export const MEMORY_CATEGORIES = [
  { key: "competitor",  label: "Конкуренты",    emoji: "🏆" },
  { key: "price",       label: "Цены",           emoji: "💰" },
  { key: "contact",     label: "Контакты",       emoji: "📞" },
  { key: "content",     label: "Тексты и УТП",   emoji: "✍️" },
  { key: "supplier",    label: "Поставщики",      emoji: "📦" },
  { key: "review",      label: "Отзывы",          emoji: "⭐" },
  { key: "strategy",    label: "Стратегия",       emoji: "🎯" },
  { key: "general",     label: "Общее",           emoji: "📝" },
];

// ─── Extract memories from step result ─────────────────────────────────────

export async function extractAndSaveMemories(opts: {
  sessionId: number;
  goal: string;
  stepTitle: string;
  stepReport: string;
  logs: { type: string; text: string }[];
}): Promise<number> {
  const { sessionId, goal, stepTitle, stepReport, logs } = opts;

  const logText = logs
    .filter(l => l.type !== "thought")
    .map(l => l.text)
    .join("\n")
    .slice(0, 4000);

  let extracted: Array<{
    category: string;
    title: string;
    content: string;
    source_url: string | null;
    importance: number;
  }> = [];

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Ты аналитик памяти агента. Из лога и отчёта шага извлеки конкретные факты, которые стоит запомнить для будущего использования.

Верни JSON:
{
  "memories": [
    {
      "category": "competitor|price|contact|content|supplier|review|strategy|general",
      "title": "Краткий заголовок факта (до 60 символов)",
      "content": "Конкретный факт с деталями. Конкретные числа, имена, ссылки.",
      "source_url": "URL откуда взято или null",
      "importance": 1-5
    }
  ]
}

Правила:
- Только конкретные, проверяемые факты (цены, контакты, названия, URLs)
- НЕ сохраняй описания процесса работы агента
- Максимум 5 записей за шаг
- importance: 5=очень важно, 1=незначительно
- Если нечего запомнить — вернуть пустой массив`,
        },
        {
          role: "user",
          content: `Цель задания: ${goal}\nШаг: ${stepTitle}\n\nОтчёт:\n${stepReport}\n\nЛог:\n${logText}`,
        },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(response.choices[0].message.content ?? "{}");
    extracted = parsed.memories ?? [];
  } catch (e) {
    console.error("[agentMemory] Extract error:", e);
    return 0;
  }

  // Save to DB
  let saved = 0;
  for (const m of extracted.slice(0, 5)) {
    try {
      await db.execute(sql`
        INSERT INTO agent_memory (agent, category, title, content, source_url, session_id, importance)
        VALUES ('browser', ${m.category ?? "general"}, ${m.title}, ${m.content},
                ${m.source_url ?? null}, ${sessionId}, ${m.importance ?? 3})
      `);
      saved++;
    } catch (e) {
      console.error("[agentMemory] Save error:", e);
    }
  }

  if (saved > 0) {
    console.log(`[agentMemory] Saved ${saved} memories from step "${stepTitle}"`);
  }
  return saved;
}

// ─── Retrieve relevant memories for a new task ─────────────────────────────

export async function retrieveRelevantMemories(goal: string, limit = 15): Promise<MemoryEntry[]> {
  try {
    // Fetch recent + high-importance memories
    const res = await db.execute(sql`
      SELECT id, agent, category, title, content, source_url, session_id, importance, created_at, expires_at
      FROM agent_memory
      WHERE (expires_at IS NULL OR expires_at > NOW())
      ORDER BY importance DESC, created_at DESC
      LIMIT ${limit}
    `);
    return res.rows.map(rowToEntry);
  } catch (e) {
    console.error("[agentMemory] Retrieve error:", e);
    return [];
  }
}

// ─── Build memory context string for prompt injection ──────────────────────

export function buildMemoryContext(memories: MemoryEntry[]): string {
  if (!memories.length) return "";
  const grouped = new Map<string, MemoryEntry[]>();
  for (const m of memories) {
    if (!grouped.has(m.category)) grouped.set(m.category, []);
    grouped.get(m.category)!.push(m);
  }

  const lines: string[] = ["## Что агент уже знает (из прошлых заданий):\n"];
  for (const [cat, entries] of grouped) {
    const label = MEMORY_CATEGORIES.find(c => c.key === cat)?.label ?? cat;
    const emoji = MEMORY_CATEGORIES.find(c => c.key === cat)?.emoji ?? "📝";
    lines.push(`**${emoji} ${label}:**`);
    for (const e of entries) {
      lines.push(`- ${e.title}: ${e.content}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// ─── CRUD ──────────────────────────────────────────────────────────────────

export async function listMemories(opts?: {
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<{ entries: MemoryEntry[]; total: number }> {
  const { category, limit = 50, offset = 0 } = opts ?? {};
  const whereClause = category
    ? sql`WHERE category = ${category} AND (expires_at IS NULL OR expires_at > NOW())`
    : sql`WHERE (expires_at IS NULL OR expires_at > NOW())`;

  const [dataRes, countRes] = await Promise.all([
    db.execute(sql`
      SELECT id, agent, category, title, content, source_url, session_id, importance, created_at, expires_at
      FROM agent_memory
      ${whereClause}
      ORDER BY importance DESC, created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `),
    db.execute(sql`SELECT COUNT(*) as count FROM agent_memory ${whereClause}`),
  ]);

  return {
    entries: dataRes.rows.map(rowToEntry),
    total: Number((countRes.rows[0] as any)?.count ?? 0),
  };
}

export async function saveMemory(entry: {
  category: string;
  title: string;
  content: string;
  sourceUrl?: string;
  importance?: number;
  expiresAt?: string;
}): Promise<MemoryEntry> {
  const res = await db.execute(sql`
    INSERT INTO agent_memory (agent, category, title, content, source_url, importance, expires_at)
    VALUES ('browser', ${entry.category}, ${entry.title}, ${entry.content},
            ${entry.sourceUrl ?? null}, ${entry.importance ?? 3}, ${entry.expiresAt ?? null})
    RETURNING *
  `);
  return rowToEntry(res.rows[0] as any);
}

export async function updateMemory(id: number, entry: {
  category?: string;
  title?: string;
  content?: string;
  importance?: number;
}): Promise<void> {
  await db.execute(sql`
    UPDATE agent_memory
    SET category=COALESCE(${entry.category ?? null}, category),
        title=COALESCE(${entry.title ?? null}, title),
        content=COALESCE(${entry.content ?? null}, content),
        importance=COALESCE(${entry.importance ?? null}, importance)
    WHERE id=${id}
  `);
}

export async function deleteMemory(id: number): Promise<void> {
  await db.execute(sql`DELETE FROM agent_memory WHERE id=${id}`);
}

export async function clearMemories(category?: string): Promise<number> {
  const res = category
    ? await db.execute(sql`DELETE FROM agent_memory WHERE category=${category} RETURNING id`)
    : await db.execute(sql`DELETE FROM agent_memory RETURNING id`);
  return res.rows.length;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function rowToEntry(row: any): MemoryEntry {
  return {
    id: row.id,
    agent: row.agent,
    category: row.category,
    title: row.title,
    content: row.content,
    sourceUrl: row.source_url,
    sessionId: row.session_id,
    importance: row.importance,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}
