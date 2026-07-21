/**
 * Real Price — LLM-разбор фото/PDF сметы (spec: `.kiro/specs/real-price`,
 * task 3.4 / Req 7.4). Тонкая обёртка над OpenAI поверх чистого нормализатора
 * (`estimateNormalize.ts`).
 *
 * Переиспускает конфиг OpenAI-клиента так же, как `aiContent.ts` /
 * `dispatcherAI` / `autonomousAgent`:
 *   AI_INTEGRATIONS_OPENAI_API_KEY, AI_INTEGRATIONS_OPENAI_BASE_URL,
 *   AI_INTEGRATIONS_OPENAI_VISION_MODEL | AI_INTEGRATIONS_OPENAI_MODEL.
 *
 * Изображения разбираются через vision (`chat.completions`, как в существующем
 * `POST /api/client/estimate`); PDF — через Responses API (`input_file`). Обе
 * ветки завершаются одним и тем же чистым нормализатором. Фича изолирована:
 * при отсутствии ключа кидаем `EstimateParserDisabledError` (эндпойнт отвечает
 * 503), существующие маршруты не затрагиваются.
 */

import OpenAI from "openai";
import {
  normalizeParsedEstimate,
  ACCEPTED_ESTIMATE_MIME,
  type ParsedEstimateItem,
} from "./estimateNormalize.js";

export { ACCEPTED_ESTIMATE_MIME, type ParsedEstimateItem };

const apiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
const baseURL = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
const model =
  process.env["AI_INTEGRATIONS_OPENAI_VISION_MODEL"] ??
  process.env["AI_INTEGRATIONS_OPENAI_MODEL"] ??
  "gpt-4o-mini";

const client = apiKey ? new OpenAI({ apiKey, baseURL }) : null;

export class EstimateParserDisabledError extends Error {
  constructor() {
    super("Estimate parser is not configured (AI_INTEGRATIONS_OPENAI_API_KEY missing).");
    this.name = "EstimateParserDisabledError";
  }
}

const SYSTEM_PROMPT = `Ты извлекаешь позиции из фотографии или PDF строительной сметы на ремонт.

Верни СТРОГО валидный JSON вида:
{"items":[{"description": string, "unit": string|null, "quantity": number|null, "price": number|null}]}

Правила:
- "description" — краткое наименование вида работ (напр. «Укладка плитки на стены»). Без материалов-брендов, если их нет в смете.
- "unit" — единица измерения (м², шт, м.п., точка …) или null.
- "quantity" — количество (число) или null.
- "price" — ЦЕНА ЗА ЕДИНИЦУ в рублях (число). Если в смете только сумма по строке и количество — раздели сумму на количество. Если определить нельзя — null.
- Бери только строки работ. Пропускай заголовки разделов, «Итого», налоги, скидки, доставку.
- Ничего не выдумывай: если значения нет — ставь null.
- Максимум 40 позиций. Никакого текста вне JSON.`;

/**
 * Parse an uploaded estimate (image or PDF) into clean checker rows.
 * Throws `EstimateParserDisabledError` when the OpenAI key is not configured.
 */
export async function parseEstimateFile(input: {
  buffer: Buffer;
  mimeType: string;
}): Promise<ParsedEstimateItem[]> {
  if (!client) throw new EstimateParserDisabledError();

  const { buffer, mimeType } = input;
  const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;

  let content: string | null = null;

  if (mimeType === "application/pdf") {
    // Responses API accepts PDFs as an input_file (base64 data URL).
    const resp = await client.responses.create({
      model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: SYSTEM_PROMPT },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK file-input shape
            { type: "input_file", filename: "smeta.pdf", file_data: dataUrl } as any,
          ],
        },
      ],
    });
    content = (resp as { output_text?: string }).output_text ?? null;
  } else {
    const resp = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- multimodal content parts
          content: [
            { type: "text", text: "Извлеки позиции сметы из изображения." },
            { type: "image_url", image_url: { url: dataUrl } },
          ] as any,
        },
      ],
    });
    content = resp.choices[0]?.message?.content ?? null;
  }

  return normalizeParsedEstimate(content);
}
