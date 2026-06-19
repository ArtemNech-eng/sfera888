/**
 * GPT-генерация структурированного контента для AI-дизайн-проекта.
 *
 * На вход — параметры дизайна (room/style/area/budget). На выход — три JSONB
 * артефакта которые показываются на странице `/dizajn/{slug}`:
 *
 *   • materials  — таблица «Рекомендуемые материалы» (стены / пол / потолок)
 *   • estimate   — таблица «Смета реализации» (отделочные / мебель / итого)
 *   • solutions  — список «Основные решения» (4-6 буллетов)
 *
 * Дополнительно генерируется H1, SEO-meta и краткое описание дизайна.
 *
 * Используется существующий OpenAI client с env-кредами проекта
 * (`AI_INTEGRATIONS_OPENAI_API_KEY` + custom `BASE_URL`). Структурированный
 * вывод через `json_schema` response_format — гарантирует валидную форму
 * без regex-парсинга.
 *
 * Cost: ~$0.001 / design (один gpt-4o-mini call с json_schema mode).
 */

import OpenAI from "openai";
import type {
  DesignMaterial,
  DesignEstimateItem,
  DesignSolution,
} from "@workspace/db";

const apiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
const baseURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
const model = process.env["AI_INTEGRATIONS_DESIGN_MODEL"] ?? "gpt-4o-mini";

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
  /** м². */
  area: number | null;
  /** ₽. */
  budget: number | null;
  /** недели. */
  durationWeeks: number | null;
  /** Город (для seo-meta). */
  cityName: string | null;
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
};

const STYLE_LABELS: Record<string, string> = {
  modern: "современный",
  scandinavian: "скандинавский",
  loft: "лофт",
  minimalism: "минимализм",
  neoclassic: "неоклассика",
  japandi: "японди",
};

export async function generateDesignContent(input: DesignContentInput): Promise<DesignContent> {
  const roomLabel = ROOM_LABELS[input.room] ?? input.room;
  const styleLabel = STYLE_LABELS[input.style] ?? input.style;
  const areaText = input.area ? `${input.area} м²` : "не указана";
  const budgetText = input.budget ? `${input.budget.toLocaleString("ru-RU")} ₽` : "не задан";
  const durationText = input.durationWeeks ? `${input.durationWeeks} недель` : "не задан";
  const cityText = input.cityName ? ` в ${input.cityName}` : "";

  const systemPrompt = `Ты профессиональный дизайнер интерьера. Тебе дан запрос на проект ремонта. Сгенерируй полный пакет артефактов дизайн-проекта на русском языке. Текст должен быть профессиональным, конкретным, без воды. Никаких маркетинговых клише.`;

  const userPrompt = `Параметры проекта:
- Помещение: дизайн ${roomLabel}
- Стиль: ${styleLabel}
- Площадь: ${areaText}
- Бюджет: ${budgetText}
- Сроки: ${durationText}
${input.cityName ? `- Город: ${input.cityName}` : ""}

Сгенерируй:

1. h1: Заголовок страницы. Формат: «Дизайн ${roomLabel} ${areaText} в стиле ${styleLabel}${cityText}». Если площадь не указана — без неё.

2. seoTitle: title-тег страницы (60-70 символов). Должен включать ключевое слово и быть привлекательным.

3. seoDescription: meta-description (140-180 символов). Описывает что внутри страницы.

4. description: Описание дизайн-концепции на 2-3 параграфа (300-500 символов). Что главное в этом проекте, какая атмосфера, для кого подходит.

5. materials: Таблица материалов (5-7 строк). Категории на русском (Стены, Акцентная стена, Пол, Плинтус, Потолок, Двери, при необходимости — Сантехника, Фурнитура). Описание — конкретный материал и его характеристики.

6. estimate: Смета реализации (5 строк). Каждая статья — это отдельная категория расходов. Сумма в копейках (рубли × 100). Категории: «Отделочные материалы», «Мебель», «Освещение», «Текстиль и декор», «Прочие расходы». Распредели бюджет ${budgetText} реалистично — отделка обычно 25-35%, мебель 40-50%, освещение 5-10%, текстиль 5-10%, прочее 5-10%.

7. solutions: 4-6 ключевых решений проекта. Конкретные функциональные/визуальные приёмы (например: «Функциональная планировка с рабочим местом у окна», «Встроенный шкаф во всю стену для максимального хранения»). Без воды.

Все тексты на русском языке.`;

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
    temperature: 0.7,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("OpenAI returned empty response");
  }
  const parsed = JSON.parse(raw) as DesignContent;
  return parsed;
}
