/**
 * AI-assisted content tooling for marketplace user-generated content.
 *
 * Used by:
 *   - Master-PWA portfolio editor: light copy-edit of master-supplied
 *     description ("Сделать читаемым" button).
 *
 * Design principles (plan §11.7.6 + the SEO discussion in `MARKETPLACE_PRODUCTION_PLAN`):
 *
 *   1. **Never invent facts.** The model receives the master's own text
 *      and must only smooth grammar, fix capitalization, split run-ons.
 *      No price, no area, no service, no city is added. If the master
 *      didn't write it, it doesn't appear.
 *   2. **First-person voice preserved.** "Я снял", "мы положили" must
 *      stay first-person. No corporate marketing tone.
 *   3. **Length constraints.** Output is at most 1.5× input length and
 *      no more than 2000 chars. Empty/very-short input returns empty.
 *   4. **Reuses existing OpenAI client config.** Same env vars as
 *      dispatcherAI / autonomousAgent / agentMemory:
 *        AI_INTEGRATIONS_OPENAI_API_KEY
 *        AI_INTEGRATIONS_OPENAI_BASE_URL
 *        AI_INTEGRATIONS_OPENAI_MODEL (defaults to a cheap model)
 *
 * Why a separate module: keeps dispatcherAI focused on master-bot dialog
 * (with its conversation history, tools, etc.) and avoids leaking that
 * complexity into a one-shot text helper.
 */

import OpenAI from "openai";

const apiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
const baseURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
// Cheaper default than dispatcherAI (which uses claude-opus-4-7) — copy-edit
// is a simple task, no need for a flagship model. Override via env.
const model = process.env["AI_INTEGRATIONS_OPENAI_CONTENT_MODEL"]
  ?? process.env["AI_INTEGRATIONS_OPENAI_MODEL"]
  ?? "gpt-4o-mini";

const client = apiKey
  ? new OpenAI({ apiKey, baseURL })
  : null;

export class AiContentDisabledError extends Error {
  constructor() {
    super("AI content helper is not configured (AI_INTEGRATIONS_OPENAI_API_KEY missing).");
    this.name = "AiContentDisabledError";
  }
}

const SMOOTH_SYSTEM_PROMPT = `Ты редактор русскоязычного текста на сайте мастеров по ремонту.

Тебе дают черновик описания работы, написанный самим мастером. Часто он
состоит из коротких отрывистых предложений или собранных тезисов.

Твоя задача — СДЕЛАТЬ ТЕКСТ ЧИТАЕМЫМ, не меняя смысл и не добавляя фактов.

ПРАВИЛА (нарушение → ошибка):
1. НЕ ДОБАВЛЯЙ ФАКТЫ. Если в черновике нет цены, площади, материала, бренда,
   срока — НИЧЕГО НЕ ВЫДУМЫВАЙ. Если в черновике "положил плитку" — НЕ пиши
   "положил керамогранит Cersanit формата 60×60". Опиши только то, что есть.
2. ПЕРВОЕ ЛИЦО ЕДИНСТВЕННОГО ЧИСЛА. "Я снял старое покрытие", "Мы с
   напарником подняли пол". НЕ перевод в третье лицо ("мастер выполнил").
3. ИЗБЕГАЙ КЛИШЕ. Запрещены фразы: "команда профессионалов", "качественно
   выполнили работы", "учитывая все пожелания клиента", "под ключ",
   "по доступной цене", "с гарантией качества", "опытные специалисты".
4. СОХРАНЯЙ ФАКТЫ. Все числа, названия материалов, бренды, сроки — точно
   как в черновике. Если "плитка 30×30" — оставь "30×30", не "30×60".
5. РАЗМЕР ВЫХОДА. Не больше 1.5× длины черновика и не больше 2000 символов.
6. ОТВЕТ — ТОЛЬКО ТЕКСТ ОПИСАНИЯ, без вступлений, без markdown, без
   "Вот отредактированный текст:". Просто абзац или несколько абзацев.

Если черновик пустой или менее 20 символов — верни строку "EMPTY".`;

interface SmoothResult {
  /** The smoothed description text, or null if input was empty / too short. */
  text: string | null;
  /** Approximate token usage from the API response (for cost monitoring). */
  tokensUsed: number;
  /** Model that was actually called. */
  model: string;
}

/**
 * Calls the OpenAI-compatible API to lightly copy-edit a master-supplied
 * description. Throws AiContentDisabledError when the helper is not
 * configured (no API key). Other errors propagate so the route can return
 * a 502 to the client.
 */
export async function smoothPortfolioDescription(text: string): Promise<SmoothResult> {
  if (!client) throw new AiContentDisabledError();

  const trimmed = (text ?? "").trim();
  if (trimmed.length < 20) {
    return { text: null, tokensUsed: 0, model };
  }
  // Hard cap on input — we never want to ship 50 KB of free-form text to
  // the model. If the master wrote that much, no need to "smooth" it.
  if (trimmed.length > 4000) {
    return { text: null, tokensUsed: 0, model };
  }

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SMOOTH_SYSTEM_PROMPT },
      { role: "user", content: trimmed },
    ],
    temperature: 0.3, // low — we want predictable copy-edit, not creative writing
    max_tokens: 1500,
  });

  const choice = completion.choices?.[0];
  const raw = choice?.message?.content?.trim() ?? "";
  if (!raw || raw === "EMPTY") {
    return { text: null, tokensUsed: completion.usage?.total_tokens ?? 0, model };
  }

  // Defensive cap — never let the API return something 5× the input.
  const maxLen = Math.min(2000, Math.ceil(trimmed.length * 1.6));
  const finalText = raw.length > maxLen ? raw.slice(0, maxLen) + "…" : raw;

  return {
    text: finalText,
    tokensUsed: completion.usage?.total_tokens ?? 0,
    model,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure (non-AI) description assembler — called from
// POST /api/master-pwa/portfolio/assemble-description.
//
// Takes 5 short structured fields from the master and produces a coherent
// paragraph using fixed templates. No AI involved — guaranteed
// deterministic and SEO-safe.
//
// Why a template-based assembler instead of just concatenation:
//   - Joining "снял плитку" + "положил тёплый пол" with newlines reads
//     like a list, not a paragraph. Search engines reward narrative text.
//   - Templates add small connector words ("После этого", "В результате")
//     that make the output read naturally.
//   - The structure is consistent across all cases, which helps Yandex
//     parse them as the same content type.
// ─────────────────────────────────────────────────────────────────────────────

export interface AssembleInput {
  /** "Что было ДО ремонта" — short situation description. */
  before?: string;
  /** Sequence of action steps. Either single textarea or array of lines. */
  steps?: string;
  /** Materials / brands list. Free-form text. */
  materials?: string;
  /** What was hard / unusual about the project. */
  challenges?: string;
  /** Anything else the master wants to mention. */
  otherDetails?: string;
}

/**
 * Pure transformation: 5 short fields → narrative paragraph(s).
 *
 * All fields are optional. Empty fields are skipped (no "не указано"
 * placeholders). Punctuation is added when the master forgot a final dot.
 *
 * The result is always 1-3 paragraphs, separated by blank lines so the
 * frontend can render them as <p> blocks.
 */
export function assemblePortfolioDescription(input: AssembleInput): string {
  const parts: string[] = [];

  const before = cleanLine(input.before);
  const steps = cleanLine(input.steps);
  const materials = cleanLine(input.materials);
  const challenges = cleanLine(input.challenges);
  const otherDetails = cleanLine(input.otherDetails);

  // Paragraph 1: situation + main work
  const para1: string[] = [];
  if (before) {
    para1.push(`До начала работ ${lcFirst(before).replace(/\.$/, "")}.`);
  }
  if (steps) {
    // If steps look like a list (multiple lines), keep them as a list.
    const lines = steps.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    if (lines.length >= 2) {
      // Multi-step list. Keep the lead-in but render as bullet block (markdown).
      para1.push("Выполнил следующее:");
      for (const ln of lines) {
        para1.push(`• ${ensureCapital(ln).replace(/\.$/, "")}.`);
      }
    } else {
      // Single line — natural language sentence.
      para1.push(`${ensureCapital(steps).replace(/\.$/, "")}.`);
    }
  }
  if (para1.length > 0) parts.push(para1.join("\n"));

  // Paragraph 2: materials
  if (materials) {
    const lines = materials.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    if (lines.length >= 2) {
      const items = ["Использованные материалы:", ...lines.map((ln) => `• ${ln.replace(/\.$/, "")}.`)];
      parts.push(items.join("\n"));
    } else {
      parts.push(`Из материалов использовал ${lcFirst(materials).replace(/\.$/, "")}.`);
    }
  }

  // Paragraph 3: challenges + other
  const para3: string[] = [];
  if (challenges) {
    para3.push(`Сложность была в том, что ${lcFirst(challenges).replace(/\.$/, "")}.`);
  }
  if (otherDetails) {
    para3.push(`${ensureCapital(otherDetails).replace(/\.$/, "")}.`);
  }
  if (para3.length > 0) parts.push(para3.join(" "));

  return parts.join("\n\n").trim();
}

function cleanLine(s: string | undefined | null): string {
  if (!s) return "";
  return String(s).trim().replace(/\s+/g, " ");
}

function ensureCapital(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function lcFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}
