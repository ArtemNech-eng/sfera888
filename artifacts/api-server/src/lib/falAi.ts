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
 * GPT Image 1.5 (edit-image) через Fal.ai — image-to-image с reference
 * картинкой(ами). Ключевое для нашего pipeline: даёт identity preservation
 * между разными ракурсами одной комнаты — view 1 генерится text-to-image,
 * views 2/3/4 генерятся edit-image с reference=[view1] чтобы материалы /
 * мебель / палитра выглядели как в референсе.
 *
 * Endpoint: `fal-ai/gpt-image-1.5/edit`
 * Schema:
 *   • prompt (required)
 *   • image_urls: list<string> (required, 1+ reference images)
 *   • image_size: same enum as text-to-image
 *   • quality: low/medium/high
 *   • input_fidelity: "low" | "high" — how strictly to follow reference
 *   • output_format: jpeg/png/webp
 */
export async function falGenerateGptImageEdit(input: {
  prompt: string;
  imageUrls: string[];
  imageSize?: "auto" | "1024x1024" | "1536x1024" | "1024x1536";
  quality?: "auto" | "low" | "medium" | "high";
  inputFidelity?: "low" | "high";
}): Promise<FalGenerationResult> {
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) {
    throw new Error("FAL_API_KEY is not set");
  }
  const baseModel = process.env.FAL_MODEL_GPT_IMAGE ?? "fal-ai/gpt-image-1.5";
  const model = `${baseModel}/edit`;
  const url = `${FAL_BASE_URL}/${model}`;
  const imageSize = input.imageSize ?? "1024x1024";
  const quality = input.quality ?? "medium";

  const body: Record<string, unknown> = {
    prompt: input.prompt,
    image_urls: input.imageUrls,
    image_size: imageSize,
    quality,
    input_fidelity: input.inputFidelity ?? "high",
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
    throw new Error(`Fal.ai gpt-image-edit network error: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Fal.ai gpt-image-edit HTTP ${response.status}: ${errText.slice(0, 500)}`);
  }

  const data = (await response.json()) as {
    images?: Array<{ url: string; width?: number; height?: number }>;
  };

  if (!data.images || data.images.length === 0) {
    throw new Error("Fal.ai gpt-image-edit returned no images");
  }

  // Edit endpoint cost = output cost (same as text-to-image) + input image
  // tokens. Approximation: same as text2img + small input overhead.
  const costMap: Record<string, number> = {
    "1024x1024": 340,
    "1536x1024": 500,
    "1024x1536": 510,
    auto: 510,
  };
  const baseCostKopeks = costMap[imageSize] ?? 500;
  const qualityMultiplier = quality === "high" ? 4 : quality === "low" ? 0.3 : 1;
  // +30 kop примерно за 1 input image high fidelity (~3050 tokens × $0.008/1k)
  const inputOverhead = (input.inputFidelity === "high" ? 30 : 5) * input.imageUrls.length;

  const first = data.images[0]!;
  return {
    imageUrl: first.url,
    width: first.width ?? 1024,
    height: first.height ?? 1024,
    generationMs: Date.now() - startedAt,
    costKopeks: Math.round(baseCostKopeks * qualityMultiplier + inputOverhead),
  };
}

/**
 * FLUX.1 Kontext [pro] (edit-image) через Fal.ai — альтернативный edit-image
 * провайдер для Angle_Render с identity preservation. Принимает один
 * reference image и текстовую инструкцию редактирования; модель оптимизирована
 * на сохранении персонажей/материалов/палитры между ракурсами.
 *
 * Контракт сигнатуры зеркалит `falGenerateGptImageEdit`, чтобы воркер мог
 * переключать провайдеров через `getEditImageProvider()` (env
 * `AI_DESIGN_EDIT_PROVIDER`) без переделки пайплайна — см. Requirement 7.5,
 * 7.6 и `design.md` §Identity_Preservation.
 *
 * Endpoint: `fal-ai/flux-pro/kontext` (см. https://fal.ai/docs/model-api-reference/image-generation-api/flux-pro-kontext)
 * Schema:
 *   • prompt (required)
 *   • image_url (single reference image; берём `imageUrls[0]`)
 *   • aspect_ratio: "21:9" | "16:9" | "4:3" | "3:2" | "1:1" | "2:3" | "3:4" | "9:16" | "9:21"
 *   • guidance_scale: 1..20 (default 3.5)
 *   • num_images: 1..4
 *   • output_format: "jpeg" | "png"
 *   • safety_tolerance: "1".."6"
 *
 * Pricing: фиксированные $0.04 за изображение = 400 копеек, не зависит от
 * `imageSize` / `quality` — поэтому соответствующие параметры принимаются
 * только для совместимости с контрактом `falGenerateGptImageEdit` и
 * мапятся в `aspect_ratio` / `guidance_scale`.
 *
 * Используется в воркере (5 параллельных вызовов на дизайн с
 * `image_urls = [Hero_Render.imageUrl]`) и в оффлайн-пилоте Identity_Preservation.
 */
export async function falGenerateFluxKontextPro(input: {
  prompt: string;
  imageUrls: string[];
  imageSize?: "auto" | "1024x1024" | "1536x1024" | "1024x1536";
  quality?: "auto" | "low" | "medium" | "high";
  inputFidelity?: "low" | "high";
}): Promise<FalGenerationResult> {
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) {
    throw new Error("FAL_API_KEY is not set");
  }
  if (!input.imageUrls || input.imageUrls.length === 0) {
    throw new Error("Fal.ai flux-kontext-pro requires at least one reference image_url");
  }

  const model = process.env.FAL_MODEL_FLUX_KONTEXT_PRO ?? "fal-ai/flux-pro/kontext";
  const url = `${FAL_BASE_URL}/${model}`;
  const imageSize = input.imageSize ?? "1024x1024";
  const quality = input.quality ?? "medium";

  // FLUX Kontext Pro принимает один reference image (image_url, не image_urls).
  // Воркер передаёт одно изображение Hero_Render; если когда-нибудь придёт
  // больше — берём первое и не падаем, чтобы контракт оставался совместим.
  const referenceImageUrl = input.imageUrls[0]!;

  const body: Record<string, unknown> = {
    prompt: input.prompt,
    image_url: referenceImageUrl,
    aspect_ratio: imageSizeToKontextAspectRatio(imageSize),
    guidance_scale: qualityToKontextGuidance(quality),
    num_images: 1,
    output_format: "jpeg",
    safety_tolerance: "2",
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
    throw new Error(
      `Fal.ai flux-kontext-pro network error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Fal.ai flux-kontext-pro HTTP ${response.status}: ${errText.slice(0, 500)}`);
  }

  const data = (await response.json()) as {
    images?: Array<{ url: string; width?: number; height?: number }>;
    has_nsfw_concepts?: boolean[];
  };

  if (!data.images || data.images.length === 0) {
    throw new Error("Fal.ai flux-kontext-pro returned no images");
  }
  if (data.has_nsfw_concepts?.some((flag) => flag === true)) {
    throw new Error("Fal.ai flux-kontext-pro flagged image as NSFW");
  }

  const first = data.images[0]!;
  // FLUX Kontext Pro: фиксированные $0.04/image = 400 копеек, не зависит от
  // imageSize/quality (см. https://fal.ai/docs/.../flux-pro-kontext §Pricing).
  const FLUX_KONTEXT_PRO_COST_KOPEKS = 400;

  return {
    imageUrl: first.url,
    width: first.width ?? 1024,
    height: first.height ?? 1024,
    generationMs: Date.now() - startedAt,
    costKopeks: FLUX_KONTEXT_PRO_COST_KOPEKS,
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

/**
 * Маппинг enum'а `imageSize` (контракт `falGenerateGptImageEdit`) в
 * `aspect_ratio` FLUX Kontext Pro. `auto` оставляем undefined — модель
 * подберёт пропорцию под reference. Сохраняет визуальную совместимость
 * между провайдерами edit-image при переключении через env.
 */
function imageSizeToKontextAspectRatio(
  imageSize: "auto" | "1024x1024" | "1536x1024" | "1024x1536",
): "1:1" | "3:2" | "2:3" | undefined {
  switch (imageSize) {
    case "1024x1024":
      return "1:1";
    case "1536x1024":
      return "3:2";
    case "1024x1536":
      return "2:3";
    case "auto":
    default:
      return undefined;
  }
}

/**
 * Маппинг enum'а `quality` (контракт `falGenerateGptImageEdit`) в
 * `guidance_scale` FLUX Kontext Pro. У Kontext Pro нет прямого аналога
 * quality/inputFidelity — повышаем CFG для high (строже следует промпту)
 * и понижаем для low. `medium`/`auto` — дефолт модели 3.5.
 */
function qualityToKontextGuidance(quality: "auto" | "low" | "medium" | "high"): number {
  switch (quality) {
    case "high":
      return 5.0;
    case "low":
      return 2.5;
    case "medium":
    case "auto":
    default:
      return 3.5;
  }
}

export { NEGATIVE_PROMPT };

/**
 * Nano Banana 2 (Google Gemini 3 Flash Image) — text2img. SOTA по
 * консистентности и качеству на fal (2026). Используется для единого холста
 * мульти-ракурсного дизайн-борда (одна генерация = когерентная комната).
 *
 * Endpoint: `fal-ai/nano-banana-2`
 * Pricing: $0.08 @ 1K, ×1.5 @ 2K, ×2 @ 4K.
 */
export async function falGenerateNanoBanana2(input: {
  prompt: string;
  aspectRatio?: string;
  resolution?: "0.5K" | "1K" | "2K" | "4K";
}): Promise<FalGenerationResult> {
  return nanoBanana2Request("fal-ai/nano-banana-2", {
    prompt: input.prompt,
    aspect_ratio: input.aspectRatio ?? "1:1",
    resolution: input.resolution ?? "1K",
    output_format: "jpeg",
    num_images: 1,
  }, input.resolution ?? "1K");
}

/**
 * Nano Banana 2 (edit) — image-to-image с до 14 reference-изображений и
 * identity-консистентностью. Для цепочки ракурсов: каждый новый ракурс
 * генерится с reference на мастер (и опц. предыдущие виды), удерживая комнату.
 *
 * Endpoint: `fal-ai/nano-banana-2/edit`
 */
export async function falEditNanoBanana2(input: {
  prompt: string;
  imageUrls: string[];
  aspectRatio?: string;
  resolution?: "0.5K" | "1K" | "2K" | "4K";
}): Promise<FalGenerationResult> {
  if (!input.imageUrls || input.imageUrls.length === 0) {
    throw new Error("Fal.ai nano-banana-2/edit requires at least one image_url");
  }
  return nanoBanana2Request("fal-ai/nano-banana-2/edit", {
    prompt: input.prompt,
    image_urls: input.imageUrls,
    aspect_ratio: input.aspectRatio ?? "1:1",
    resolution: input.resolution ?? "1K",
    output_format: "jpeg",
    num_images: 1,
  }, input.resolution ?? "1K");
}

/** Общий HTTP-вызов Nano Banana 2 (generate/edit делят формат ответа). */
async function nanoBanana2Request(
  modelId: string,
  body: Record<string, unknown>,
  resolution: "0.5K" | "1K" | "2K" | "4K",
): Promise<FalGenerationResult> {
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) {
    throw new Error("FAL_API_KEY is not set");
  }
  const url = `${FAL_BASE_URL}/${modelId}`;

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
    throw new Error(`Fal.ai nano-banana-2 network error: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Fal.ai nano-banana-2 HTTP ${response.status}: ${errText.slice(0, 500)}`);
  }

  const data = (await response.json()) as {
    images?: Array<{ url: string; width?: number; height?: number }>;
  };
  if (!data.images || data.images.length === 0) {
    throw new Error("Fal.ai nano-banana-2 returned no images");
  }

  // $0.08 @ 1K база; 0.5K ×0.75, 2K ×1.5, 4K ×2.
  const mult: Record<string, number> = { "0.5K": 0.75, "1K": 1, "2K": 1.5, "4K": 2 };
  const first = data.images[0]!;
  return {
    imageUrl: first.url,
    width: first.width ?? 1024,
    height: first.height ?? 1024,
    generationMs: Date.now() - startedAt,
    costKopeks: Math.round(800 * (mult[resolution] ?? 1)),
  };
}

/**
 * Depth_ControlNet_Wrapper (подход B2, ai-design-3d-blockout spec §6).
 *
 * Перекрашивает одну `Depth_Map` в фотореалистичный ракурс через depth-управляемую
 * модель на fal по тому же паттерну, что и остальные обёртки в этом файле
 * (raw fetch, заголовок `Authorization: Key ${FAL_API_KEY}`, базовый URL
 * `https://fal.run/{model}`, синхронный режим).
 *
 * Карта глубины задаёт СТРУКТУРУ (геометрию комнаты и расстановку мебели),
 * `Shared_Style_Prompt` задаёт стиль/материалы/освещение. Так геометрия
 * фиксируется блокаутом и одинакова во всех камерах `Camera_Rig`.
 *
 * Модель: env `FAL_MODEL_DEPTH_CONTROLNET`
 *   (default `fal-ai/flux-control-lora-depth` — text-to-image: промпт задаёт
 *   контент, карта глубины — структуру; init-изображение не требуется).
 *
 * Поведение при ошибках (Requirement 1.5, 6.6, 6.7):
 *   • HTTP >= 400 или пустой результат → ошибка `Fal.ai HTTP {status}: {text}`.
 *   • `has_nsfw_concepts=true` → бросает `NsfwBlockedError` (изображение НЕ
 *     возвращается), который несёт `costKopeks`, чтобы оркестратор учёл
 *     стоимость в `Cost_Budget` (Req 6.7).
 */

/** Аппроксимация cost'a одного depth-ControlNet вызова в копейках (~$0.025). */
const DEPTH_CONTROLNET_COST_KOPEKS = 250;

/**
 * Сила depth-контроля (`control_lora_strength`) из env
 * `FAL_DEPTH_CONTROL_STRENGTH`. Принимает число 0..1; при кривом/отсутствующем
 * значении — дефолт 1 (жёсткое следование глубине). Ниже 1 даёт модели больше
 * свободы — полезно, когда блокаут грубый (боксовая мебель).
 */
function resolveDepthControlStrength(): number {
  const raw = process.env["FAL_DEPTH_CONTROL_STRENGTH"];
  if (typeof raw !== "string") return 1;
  const v = Number.parseFloat(raw.trim());
  if (!Number.isFinite(v) || v < 0 || v > 1) return 1;
  return v;
}

/**
 * Ошибка NSFW-отказа. Несёт стоимость вызова, чтобы вызывающий код (cost guard)
 * мог учесть её в бюджете даже при отказе вернуть изображение (Req 6.6, 6.7).
 */
export class NsfwBlockedError extends Error {
  readonly costKopeks: number;
  constructor(costKopeks: number, message = "Fal.ai depth-controlnet flagged image as NSFW") {
    super(message);
    this.name = "NsfwBlockedError";
    this.costKopeks = costKopeks;
  }
}

export interface DepthRepaintInput {
  /** Публичный/signed URL Depth_Map в R2 — структурный управляющий сигнал. */
  depthMapUrl: string;
  /** Shared_Style_Prompt — единый стилевой промпт проекта. */
  prompt: string;
  /** Опц. направляющее изображение цвета (init image). */
  initImageUrl?: string;
  /** Целевой aspect-ratio выходного изображения. */
  aspectRatio?: "16:9" | "4:3" | "1:1";
  /**
   * Опц. переопределение модели fal. Например, для hero+reference используется
   * img2img-вариант `fal-ai/flux-control-lora-depth/image-to-image` вместе с
   * `initImageUrl` = hero-ракурс (структура из глубины, внешность из hero).
   * По умолчанию — env `FAL_MODEL_DEPTH_CONTROLNET` или text2image-вариант.
   */
  modelId?: string;
}

/**
 * Один синхронный вызов depth-ControlNet на fal. `Depth_Map` передаётся как
 * структурный управляющий сигнал (`control_lora_image_url`), опциональное
 * init-изображение — как направляющий цвет (`image_url`).
 */
export async function falDepthControlNetRepaint(
  input: DepthRepaintInput,
): Promise<FalGenerationResult> {
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) {
    throw new Error("FAL_API_KEY is not set");
  }
  const model =
    input.modelId ??
    process.env.FAL_MODEL_DEPTH_CONTROLNET ??
    "fal-ai/flux-control-lora-depth";
  const url = `${FAL_BASE_URL}/${model}`;

  const body: Record<string, unknown> = {
    prompt: input.prompt,
    negative_prompt: NEGATIVE_PROMPT,
    // Depth_Map как структурный управляющий сигнал (Req 6.2).
    control_lora_image_url: input.depthMapUrl,
    // Сила depth-контроля. 1 = жёстко следовать глубине (грубый блокаут даёт
    // «кубическую» мебель); ниже — больше свободы модели и правдоподобнее
    // детали. Настраивается через env `FAL_DEPTH_CONTROL_STRENGTH` (0..1).
    control_lora_strength: resolveDepthControlStrength(),
    num_inference_steps: 28,
    guidance_scale: 3.5,
    image_size: aspectToImageSize(input.aspectRatio ?? "4:3"),
    num_images: 1,
    enable_safety_checker: true,
  };
  // Эндпоинт `fal-ai/flux-control-lora-depth` — text-to-image: картинка
  // генерируется по `prompt`, а `control_lora_image_url` (карта глубины) задаёт
  // только СТРУКТУРУ. `image_url` опционально и нужно лишь для img2img-варианта;
  // подставлять туда серую карту глубины НЕЛЬЗЯ — иначе результат остаётся серым
  // блокаутом (подтверждено живым прогоном). Поэтому init-изображение
  // передаём ТОЛЬКО если оператор задал его явно (направляющий цвет).
  if (input.initImageUrl) {
    body.image_url = input.initImageUrl;
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
    throw new Error(
      `Fal.ai depth-controlnet network error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // Читаем тело как текст один раз, чтобы и при ошибке, и при пустом результате
  // включить HTTP-статус и текст ответа в сообщение (Req 1.5, паттерн
  // `Fal.ai HTTP {status}: {text}`).
  const rawText = await response.text().catch(() => "");

  if (!response.ok) {
    throw new Error(`Fal.ai HTTP ${response.status}: ${rawText.slice(0, 500)}`);
  }

  let data: {
    images?: Array<{ url: string; width?: number; height?: number }>;
    has_nsfw_concepts?: boolean[];
  };
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`Fal.ai HTTP ${response.status}: ${rawText.slice(0, 500)}`);
  }

  // NSFW-отказ: НЕ возвращаем изображение, но сообщаем стоимость (Req 6.6, 6.7).
  if (data.has_nsfw_concepts?.some((flag) => flag === true)) {
    throw new NsfwBlockedError(DEPTH_CONTROLNET_COST_KOPEKS);
  }

  if (!data.images || data.images.length === 0) {
    throw new Error(`Fal.ai HTTP ${response.status}: ${rawText.slice(0, 500)}`);
  }

  const first = data.images[0]!;
  return {
    imageUrl: first.url,
    width: first.width ?? 1024,
    height: first.height ?? 768,
    generationMs: Date.now() - startedAt,
    costKopeks: DEPTH_CONTROLNET_COST_KOPEKS,
  };
}
