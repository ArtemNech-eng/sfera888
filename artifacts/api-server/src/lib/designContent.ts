/**
 * AI-генерация структурированного контента для дизайн-проекта.
 *
 * На вход — параметры проекта (room/style/area/budget). На выход — пакет
 * артефактов которые показываются на странице `/dizajn/{slug}`:
 *
 *   • h1, seoTitle, seoDescription, description (300-700 знаков)
 *   • materials  — таблица «Рекомендуемые материалы» (5-7 строк)
 *   • estimate   — смета реализации (5 строк, копейки)
 *   • solutions  — 4-6 ключевых решений
 *
 * Использует тот же AI-шлюз что dispatcherAI (env: AI_INTEGRATIONS_OPENAI_*).
 * Default-модель — claude-opus-4-7 через OpenRouter; можно override через
 * AI_INTEGRATIONS_DESIGN_MODEL.
 *
 * Антишаблонность:
 *   1. Жёсткий системный промпт «без AI-канцелярита, как живой дизайнер».
 *   2. Ротация 8 narrative-стилей подачи (см. NARRATIVE_STYLES) — случайный
 *      выбор перед запросом. Каждый стиль даёт разную «оптику» текста, поэтому
 *      даже массовая генерация не выглядит штамповкой.
 *   3. Few-shot эталоны в промпте (что считается «живым» текстом, что —
 *      AI-штампом).
 *   4. Структурированный вывод через json_schema — гарантирует валидную форму
 *      без regex-парсинга.
 */

import OpenAI from "openai";
import type {
  DesignMaterial,
  DesignEstimateItem,
  DesignSolution,
} from "@workspace/db";

const apiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
const baseURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
// Use shared model env (same gateway as dispatcherAI). Fallback chain:
//   AI_INTEGRATIONS_DESIGN_MODEL → AI_INTEGRATIONS_OPENAI_MODEL → default.
const model = process.env["AI_INTEGRATIONS_DESIGN_MODEL"]
  ?? process.env["AI_INTEGRATIONS_OPENAI_MODEL"]
  ?? "claude-opus-4-7";

let openai: OpenAI | null = null;
function client(): OpenAI {
  if (!openai) {
    if (!apiKey) {
      throw new Error("AI_INTEGRATIONS_OPENAI_API_KEY is not configured");
    }
    openai = new OpenAI({ apiKey, baseURL });
  }
  return openai;
}

export interface DesignContentInput {
  room: string;
  style: string;
  area: number | null;
  budget: number | null;
  durationWeeks: number | null;
  cityName: string | null;
  district?: string | null;
  /** Опциональный сид — для воспроизводимой ротации narrative-стилей. */
  seed?: number;
}

export interface DesignContent {
  h1: string;
  seoTitle: string;
  seoDescription: string;
  description: string;
  materials: DesignMaterial[];
  estimate: DesignEstimateItem[];
  solutions: DesignSolution[];
}

const ROOM_LABELS: Record<string, string> = {
  bathroom: "ванной комнаты",
  kitchen: "кухни",
  living_room: "гостиной",
  bedroom: "спальни",
  hallway: "прихожей",
  apartment: "квартиры",
  nursery: "детской",
};

const STYLE_LABELS: Record<string, string> = {
  modern: "современный",
  scandinavian: "скандинавский",
  loft: "лофт",
  minimalism: "минимализм",
  neoclassic: "неоклассика",
  japandi: "японди",
  classic: "классика",
};

// ─── Narrative style rotation (8 personas) ────────────────────────────────────
//
// Goal: 50 проектов написаны 8 разными «оптиками» — текст выглядит как у разных
// авторов, а не как у одного бота с разными параметрами. Каждый стиль даёт
// свою заточку description + solutions, при этом параметры (materials/estimate)
// остаются нейтральными (это таблицы, не нужна индивидуальность).

interface NarrativeStyle {
  id: string;
  /** Дополнение к system promptу — задаёт «оптику» автора. */
  systemAddon: string;
  /** Подсказка к user promptу — какую структуру / интонацию description'а ждать. */
  descriptionHint: string;
}

const NARRATIVE_STYLES: NarrativeStyle[] = [
  {
    id: "first_person_client",
    systemAddon: "Пиши от лица заказчика, который рассказывает свою историю проекта. Использование «мы», «нам хотелось», «получилось» — нормально. Без хвастовства.",
    descriptionHint: "От первого лица заказчика — что хотели, что получилось, чем особенно довольны. Естественная разговорная речь.",
  },
  {
    id: "designer_review",
    systemAddon: "Пиши от лица практикующего дизайнера интерьеров, который объясняет логику решений. Без позы и без саморекламы — как разбор кейса с коллегами.",
    descriptionHint: "От лица дизайнера: какая задача стояла, какие компромиссы, какие приёмы помогли. Конкретные термины (модульное хранение, акцентная подсветка).",
  },
  {
    id: "technical_breakdown",
    systemAddon: "Пиши как технический разбор проекта. Конкретные размеры, материалы, инженерные решения. Без эмоций.",
    descriptionHint: "Сухой технический разбор: габариты, ориентация по сторонам света, материалы по слоям, инженерные решения. Стиль — описание из строительного журнала.",
  },
  {
    id: "emotional_descriptive",
    systemAddon: "Пиши атмосферно, через тактильные и визуальные ощущения. «Мягкий свет», «тёплый дуб под ладонью» — но без вычурности.",
    descriptionHint: "Атмосферное описание через ощущения: свет, текстуры, запахи (где уместно), как ощущается утро/вечер. Эмоционально, но без литературщины.",
  },
  {
    id: "story_arc",
    systemAddon: "Пиши как короткая история проекта: было — что хотели — что сделали — что вышло. Стиль публикации в Houzz / журнале «Salon».",
    descriptionHint: "Сюжетная арка: исходная ситуация, запрос заказчиков, ключевое решение, результат. Каждый абзац ≈ 2-3 предложения.",
  },
  {
    id: "list_solutions",
    systemAddon: "Пиши концентрированно — каждая мысль одно решение. Минимум воды, максимум информации.",
    descriptionHint: "Описание построено вокруг 3 главных решений: каждое — отдельный компактный абзац. Что сделали и почему. Никаких вводных фраз.",
  },
  {
    id: "journal_review",
    systemAddon: "Пиши как редакционная заметка в журнале по интерьеру (стиль AD, Salon, Elle Decor). С контекстом эпохи стиля и его особенностей.",
    descriptionHint: "Редакционный обзор: коротко о стиле и его корнях, что в этом проекте характерно для стиля, что — авторская интерпретация. Уровень — журнал AD.",
  },
  {
    id: "practical_guide",
    systemAddon: "Пиши как практическое руководство — «если у вас такая же комната, делайте так-то». Без снисходительности.",
    descriptionHint: "Практический совет: на каких приёмах из этого проекта можно сэкономить, какие — нельзя, что повторить дома. Тон — старший товарищ, не учитель.",
  },
];

function pickNarrativeStyle(seed?: number): NarrativeStyle {
  const idx = seed != null
    ? Math.abs(seed) % NARRATIVE_STYLES.length
    : Math.floor(Math.random() * NARRATIVE_STYLES.length);
  return NARRATIVE_STYLES[idx];
}

// ─── Anti-cliche guard ────────────────────────────────────────────────────────
// Эти фразы — типичные AI-штампы. Запрещаем их явно в промпте.

const FORBIDDEN_PHRASES = [
  "создан современный интерьер",
  "идеальное сочетание",
  "уютная атмосфера",
  "функциональное пространство",
  "стильный дизайн",
  "продуманная планировка",
  "эргономичное решение",
  "гармоничное сочетание",
  "современные технологии",
  "максимальный комфорт",
  "не оставит равнодушным",
  "заслуживает внимания",
];

// ─── Main entry point ────────────────────────────────────────────────────────

export async function generateDesignContent(input: DesignContentInput): Promise<DesignContent> {
  const roomLabel = ROOM_LABELS[input.room] ?? input.room;
  const styleLabel = STYLE_LABELS[input.style] ?? input.style;
  const areaText = input.area ? `${input.area} м²` : "не указана";
  const budgetText = input.budget ? `${input.budget.toLocaleString("ru-RU")} ₽` : "не задан";
  const durationText = input.durationWeeks ? `${input.durationWeeks} недель` : "не задан";
  const cityText = input.cityName ? ` в ${input.cityName}` : "";
  const districtText = input.district ? `, район ${input.district}` : "";
  const narrative = pickNarrativeStyle(input.seed);

  const systemPrompt = [
    "Ты опытный дизайнер интерьеров с 15-летней практикой. Пишешь для блога-портфолио на сайте о ремонте квартир. Тексты на русском языке.",
    "",
    "ПРАВИЛА:",
    "1. Пиши как живой человек, не как нейросеть. Конкретика вместо общих слов: не «современный интерьер», а «деревянные рейки на акцентной стене и встроенный шкаф во всю длину».",
    "2. Никаких маркетинговых клише и AI-штампов. Запрещены фразы:",
    ...FORBIDDEN_PHRASES.map(p => `   • «${p}»`),
    "3. Не используй слово «AI» или «нейросеть». Это просто проект — кто его сделал, не упоминаем.",
    "4. Не льсти заказчику. Не используй «волшебно», «непревзойдённо», «безупречно».",
    "5. Если бюджет ограничен — это нормально, не извиняйся. Покажи как обыграли ограничение.",
    "6. Каждое решение должно быть конкретным: где именно, какой материал, какой эффект.",
    "",
    "ОПТИКА АВТОРА (этот проект):",
    narrative.systemAddon,
  ].join("\n");

  const userPrompt = [
    "Параметры проекта:",
    `- Помещение: ${roomLabel}`,
    `- Стиль: ${styleLabel}`,
    `- Площадь: ${areaText}`,
    `- Бюджет: ${budgetText}`,
    `- Сроки реализации: ${durationText}`,
    input.cityName ? `- Город: ${input.cityName}${districtText}` : "",
    "",
    "Сгенерируй пакет артефактов:",
    "",
    `1. **h1** — заголовок страницы. Формат: «Дизайн ${roomLabel} ${areaText} в стиле ${styleLabel}${cityText}». Если площадь не задана, опусти её.`,
    "",
    "2. **seoTitle** — title-тег (60-70 символов), включает ключевое слово, бюджет, город. Пример: «Дизайн спальни 14 м² в стиле джапанди — 200 000₽, Краснодар».",
    "",
    "3. **seoDescription** — meta-description (140-180 символов). Без призыва «закажи сейчас», нейтрально-информативно. Пример: «Готовый проект спальни 14 м² в стиле джапанди для квартиры в Краснодаре. Смета 200 000 ₽: материалы, мебель, освещение».",
    "",
    `4. **description** — описание проекта (500-700 символов, 2-3 абзаца). ${narrative.descriptionHint}`,
    "",
    "5. **materials** — таблица материалов (5-7 строк). Категории: Стены, Акцентная стена (если есть), Пол, Плинтус, Потолок, Дверь, при необходимости — Сантехника или Фурнитура. Описания конкретные: марка/тип материала, его параметры (например: «Ламинат 32 класса, цвет дуб натуральный, толщина 8 мм»).",
    "",
    `6. **estimate** — смета реализации (5 строк). Категории: «Отделочные материалы», «Мебель», «Освещение», «Текстиль и декор», «Прочие расходы». Сумма в копейках (рубли × 100). Реалистично распредели бюджет ${budgetText}: отделка ~25-35%, мебель ~40-50%, освещение ~5-10%, текстиль ~5-10%, прочее ~5-10%. Сумма всех строк ≤ бюджета.`,
    "",
    "7. **solutions** — 4-6 ключевых решений проекта. Каждое — конкретный приём с локацией. НЕ: «функциональная планировка». ДА: «Рабочий стол поставлен у окна — естественный свет на левую руку при правшах».",
    "",
    "Все тексты на русском.",
  ].filter(Boolean).join("\n");

  const schema = {
    name: "DesignContent",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["h1", "seoTitle", "seoDescription", "description", "materials", "estimate", "solutions"],
      properties: {
        h1: { type: "string" },
        seoTitle: { type: "string" },
        seoDescription: { type: "string" },
        description: { type: "string" },
        materials: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["category", "description"],
            properties: {
              category: { type: "string" },
              description: { type: "string" },
            },
          },
        },
        estimate: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["category", "amountKopeks"],
            properties: {
              category: { type: "string" },
              amountKopeks: { type: "integer" },
            },
          },
        },
        solutions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["text"],
            properties: {
              text: { type: "string" },
            },
          },
        },
      },
    },
  } as const;

  const completion = await client().chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_schema", json_schema: schema },
    // Слегка повышенная температура для разнообразия между проектами одной
    // narrative-style группы. Ниже 0.7 — текст становится более стабильным
    // (но скучным); выше 0.9 — теряется связность.
    temperature: 0.85,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("AI returned empty response");
  }
  const parsed = JSON.parse(raw) as DesignContent;
  return parsed;
}

/** Экспорт для тестов / debug — даёт детерминистичный выбор стиля. */
export const __test__ = { NARRATIVE_STYLES, pickNarrativeStyle };
