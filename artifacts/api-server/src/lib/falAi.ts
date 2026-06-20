/**
 * Fal.ai client wrapper для AI-дизайнера интерьеров (план §22, ai-designer
 * spec). Использует raw fetch — отдельный SDK не нужен, REST API простой.
 *
 * Модель: FLUX-dev img2img — img2img mode сохраняет геометрию входной
 * комнаты пользователя (стены, окна, размеры) и меняет отделку/мебель/тон
 * под выбранный стиль. Денойзинг ~0.7 — баланс между «новый дизайн» и
 * «узнаваемая комната».
 *
 * ENV:
 *   FAL_API_KEY — обязательный. Получается на https://fal.ai/dashboard/keys
 *   FAL_MODEL   — опциональный, default `fal-ai/flux/dev/image-to-image`
 *
 * Вызывается воркером (`designWorker`) — 4 параллельных calls на дизайн
 * (entrance / main / storage / window views). Каждый отдельный fal call =
 * ~10 сек, ~$0.01 USD.
 */

import sharp from "sharp";

const FAL_BASE_URL = "https://fal.run";
const DEFAULT_MODEL = "fal-ai/flux/dev/image-to-image";

const NEGATIVE_PROMPT =
  "text, watermark, blurry, distorted, deformed, ugly, cartoon, illustration, painting, low quality, jpeg artifacts, oversaturated, busy composition, fisheye";

/** Аппроксимация cost'a в копейках — Fal.ai не возвращает фактическую цену в ответе. */
const APPROX_COST_KOPEKS = 100; // $0.01

export interface FalGenerationResult {
  imageUrl: string;
  width: number;
  height: number;
  generationMs: number;
  costKopeks: number;
}

export interface FalGenerationInput {
  /** URL входного фото (R2 public или signed). */
  initImageUrl: string;
  /** Промпт описывающий целевой стиль и ракурс. */
  prompt: string;
  /** Сила трансформации: 0.5 — ближе к оригиналу, 0.8 — больше изменений. */
  strength?: number;
  /** Целевой aspect-ratio выходного изображения. */
  aspectRatio?: "16:9" | "4:3" | "1:1";
}

/**
 * Один синхронный вызов к Fal.ai. Sync mode — ждём результат прямо в HTTP
 * запросе. Latency ~5-15s. Если за 60s не вернулось — Fal.ai сам вернёт
 * timeout.
 */
export async function falGenerate(input: FalGenerationInput): Promise<FalGenerationResult> {
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) {
    throw new Error("FAL_API_KEY is not set");
  }
  const model = process.env.FAL_MODEL ?? DEFAULT_MODEL;
  const strength = input.strength ?? 0.7;

  const url = `${FAL_BASE_URL}/${model}`;
  const body = {
    image_url: input.initImageUrl,
    prompt: input.prompt,
    strength,
    num_inference_steps: 28,
    guidance_scale: 3.5,
    image_size: aspectToImageSize(input.aspectRatio ?? "4:3"),
    num_images: 1,
    enable_safety_checker: true,
  };

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(`Fal.ai network error: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Fal.ai HTTP ${response.status}: ${errText.slice(0, 500)}`);
  }

  const data = (await response.json()) as {
    images?: Array<{ url: string; width?: number; height?: number; content_type?: string }>;
    has_nsfw_concepts?: boolean[];
  };

  if (!data.images || data.images.length === 0) {
    throw new Error("Fal.ai returned no images");
  }
  if (data.has_nsfw_concepts?.some((flag) => flag === true)) {
    throw new Error("Fal.ai flagged image as NSFW");
  }

  const first = data.images[0]!;
  const generationMs = Date.now() - startedAt;

  return {
    imageUrl: first.url,
    width: first.width ?? 1024,
    height: first.height ?? 768,
    generationMs,
    costKopeks: APPROX_COST_KOPEKS,
  };
}

/**
 * Text-to-image через FLUX 1.1 Pro Ultra — премиум модель для качественных
 * интерьерных рендеров (на уровне DALL-E 3 / ChatGPT). Используется для
 * панорамных дизайн-моудбордов в seed-проектах.
 *
 * Endpoint: `fal-ai/flux-pro/v1.1-ultra`
 * Params (отличается от FLUX dev):
 *   • aspect_ratio: "21:9" | "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | "9:21"
 *   • safety_tolerance: "1".."6" (str)
 *   • image_prompt: optional URL — стиль/палитра наследуется от reference
 *   • image_prompt_strength: 0..1 (default 0.1)
 *
 * Cost: ~$0.06 per image (vs $0.025 у FLUX dev).
 */
export async function falGeneratePanoramicPro(input: {
  prompt: string;
  aspectRatio?: "21:9" | "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | "9:21";
  /** Reference image URL для наследования стиля/материалов/палитры. */
  imagePromptUrl?: string;
  /** Сила влияния референса: 0=ignore, 1=close copy. По умолчанию 0.1. */
  imagePromptStrength?: number;
}): Promise<FalGenerationResult> {
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) {
    throw new Error("FAL_API_KEY is not set");
  }
  const model = process.env.FAL_MODEL_PANORAMIC ?? "fal-ai/flux-pro/v1.1-ultra";
  const url = `${FAL_BASE_URL}/${model}`;

  const body: Record<string, unknown> = {
    prompt: input.prompt,
    aspect_ratio: input.aspectRatio ?? "21:9",
    num_images: 1,
    enable_safety_checker: true,
    safety_tolerance: "2",
    output_format: "jpeg",
  };
  if (input.imagePromptUrl) {
    body.image_prompt = input.imagePromptUrl;
    body.image_prompt_strength = input.imagePromptStrength ?? 0.4;
  }

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(`Fal.ai network error (panoramic): ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Fal.ai panoramic HTTP ${response.status}: ${errText.slice(0, 500)}`);
  }

  const data = (await response.json()) as {
    images?: Array<{ url: string; width?: number; height?: number }>;
    has_nsfw_concepts?: boolean[];
  };

  if (!data.images || data.images.length === 0) {
    throw new Error("Fal.ai panoramic returned no images");
  }
  if (data.has_nsfw_concepts?.some((flag) => flag === true)) {
    throw new Error("Fal.ai panoramic flagged image as NSFW");
  }

  const first = data.images[0]!;
  return {
    imageUrl: first.url,
    width: first.width ?? 2752,
    height: first.height ?? 1184,
    generationMs: Date.now() - startedAt,
    // FLUX Pro Ultra ~$0.06 per image
    costKopeks: 600,
  };
}

/**
 * GPT Image 1.5 (OpenAI's DALL-E 3 successor) через Fal.ai.
 *
 * Это **другой класс модели** vs FLUX: gpt-image-1.5 натренирована на
 * multi-panel композициях с identity preservation — то самое что ChatGPT
 * генерит в одном изображении. Используется для seed-проектов где надо
 * показать ОДНУ комнату с 4 ракурсов одновременно (2×2 collage), затем
 * sharp нарезает на отдельные views.
 *
 * Endpoint: `fal-ai/gpt-image-1.5`
 * Schema (text-to-image):
 *   • prompt (required)
 *   • image_size: "auto" | "1024x1024" | "1536x1024" | "1024x1536"
 *   • quality: "auto" | "low" | "medium" | "high"
 *   • output_format: "jpeg" | "png" | "webp"
 *   • num_images
 *
 * Pricing (medium quality):
 *   • 1024x1024 = $0.034
 *   • 1024x1536 = $0.051
 *   • 1536x1024 = $0.050
 *   (high quality ~4× дороже)
 */
export async function falGenerateGptImage(input: {
  prompt: string;
  imageSize?: "auto" | "1024x1024" | "1536x1024" | "1024x1536";
  quality?: "auto" | "low" | "medium" | "high";
}): Promise<FalGenerationResult> {
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) {
    throw new Error("FAL_API_KEY is not set");
  }
  const model = process.env.FAL_MODEL_GPT_IMAGE ?? "fal-ai/gpt-image-1.5";
  const url = `${FAL_BASE_URL}/${model}`;
  const imageSize = input.imageSize ?? "1024x1024";
  const quality = input.quality ?? "medium";

  const body: Record<string, unknown> = {
    prompt: input.prompt,
    image_size: imageSize,
    quality,
    output_format: "jpeg",
    num_images: 1,
  };

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(`Fal.ai gpt-image network error: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Fal.ai gpt-image HTTP ${response.status}: ${errText.slice(0, 500)}`);
  }

  const data = (await response.json()) as {
    images?: Array<{ url: string; width?: number; height?: number }>;
  };

  if (!data.images || data.images.length === 0) {
    throw new Error("Fal.ai gpt-image returned no images");
  }

  // Cost approximation per medium quality (most common). High quality ~4×.
  const costMap: Record<string, number> = {
    "1024x1024": 340,
    "1536x1024": 500,
    "1024x1536": 510,
    auto: 510,
  };
  const baseCostKopeks = costMap[imageSize] ?? 500;
  const qualityMultiplier = quality === "high" ? 4 : quality === "low" ? 0.3 : 1;

  const first = data.images[0]!;
  return {
    imageUrl: first.url,
    width: first.width ?? 1024,
    height: first.height ?? 1024,
    generationMs: Date.now() - startedAt,
    costKopeks: Math.round(baseCostKopeks * qualityMultiplier),
  };
}

/**
 * Text-to-image вызов Fal.ai (без init image). Используется seed-скриптом
 * для генерации starter-designs без user-upload, а также если в будущем
 * добавим «генерация без фото» в публичную форму.
 *
 * Endpoint: `fal-ai/flux/dev` (text2img, без /image-to-image suffix).
 */
export async function falGenerateText(input: {
  prompt: string;
  aspectRatio?: "16:9" | "4:3" | "1:1";
  /** Override aspectRatio with explicit pixel dimensions (e.g. 2048×768 for ultrawide). */
  imageSize?: { width: number; height: number };
}): Promise<FalGenerationResult> {
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) {
    throw new Error("FAL_API_KEY is not set");
  }
  const model = process.env.FAL_MODEL_TEXT ?? "fal-ai/flux/dev";
  const url = `${FAL_BASE_URL}/${model}`;

  const body = {
    prompt: input.prompt,
    num_inference_steps: 28,
    guidance_scale: 3.5,
    image_size: input.imageSize ?? aspectToImageSize(input.aspectRatio ?? "4:3"),
    num_images: 1,
    enable_safety_checker: true,
  };

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(`Fal.ai network error (text2img): ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Fal.ai text2img HTTP ${response.status}: ${errText.slice(0, 500)}`);
  }

  const data = (await response.json()) as {
    images?: Array<{ url: string; width?: number; height?: number }>;
    has_nsfw_concepts?: boolean[];
  };

  if (!data.images || data.images.length === 0) {
    throw new Error("Fal.ai text2img returned no images");
  }
  if (data.has_nsfw_concepts?.some((flag) => flag === true)) {
    throw new Error("Fal.ai text2img flagged image as NSFW");
  }

  const first = data.images[0]!;
  return {
    imageUrl: first.url,
    width: first.width ?? 1024,
    height: first.height ?? 768,
    generationMs: Date.now() - startedAt,
    costKopeks: APPROX_COST_KOPEKS,
  };
}

/**
 * Скачивает изображение по URL и возвращает буфер. Используется в воркере
 * после генерации Fal.ai чтобы загрузить результат в наш R2 (Fal.ai хранит
 * результаты только 24h).
 */
export async function downloadImage(imageUrl: string): Promise<Buffer> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download image: HTTP ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Конвертация исходного фото пользователя в JPEG нормального размера + опт.
 * compression. Fal.ai принимает image_url, поэтому мы сначала загружаем в R2
 * и передаём ссылку. Sharp ресайзит до max 1024px по большей стороне (FLUX
 * не нуждается в больше).
 */
export async function preprocessUserUpload(buffer: Buffer): Promise<Buffer> {
  return await sharp(buffer)
    .rotate() // auto-rotate by EXIF orientation
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88, progressive: true })
    .toBuffer();
}

function aspectToImageSize(aspect: "16:9" | "4:3" | "1:1"): { width: number; height: number } {
  switch (aspect) {
    case "16:9":
      return { width: 1024, height: 576 };
    case "1:1":
      return { width: 1024, height: 1024 };
    case "4:3":
    default:
      return { width: 1024, height: 768 };
  }
}

export { NEGATIVE_PROMPT };
