/**
 * Билдер англоязычного промпта для нейросети из визуальных опций конфигуратора
 * «Хочу также». UI не даёт пользователю писать промпт руками — он выбирает
 * карточки (тип комнаты / стиль / палитра / ценовой сегмент), а эта чистая
 * функция собирает развёрнутый английский промпт под fal (FLUX / Nano Banana).
 *
 * Чистый модуль без зависимостей — импортируется и на клиенте (превью промпта),
 * и на сервере (Next route → api-server). Никаких секретов.
 */

// ─── Опции конфигуратора (значения = ключи, лейблы — для UI) ──────────────────

// ВНИМАНИЕ: `id` строго совпадают с enum'ами api-server
// (`dizajnFormSchema.ts` → ROOM_TYPES / STYLES). Это единый источник правды
// и для конфигуратора, и для submission в `/api/dizajn/generate` — рассинхрон
// id привёл бы к `validation_error` от бэкенда. `enabled` отражает MVP-гейт
// (Requirement 1.3): сейчас на пайплайне открыта только спальня.
export const ROOM_TYPES = [
  { id: "bedroom", label: "Спальня", en: "bedroom", enabled: true },
  { id: "living_room", label: "Гостиная", en: "living room", enabled: false },
  { id: "kitchen", label: "Кухня", en: "kitchen", enabled: false },
  { id: "bathroom", label: "Ванная", en: "bathroom", enabled: false },
  { id: "hallway", label: "Прихожая", en: "entrance hallway", enabled: false },
  { id: "nursery", label: "Детская", en: "children's room", enabled: false },
  { id: "apartment", label: "Квартира", en: "apartment", enabled: false },
] as const;

export const STYLES = [
  { id: "modern", label: "Современный", en: "modern contemporary" },
  { id: "scandinavian", label: "Скандинавский", en: "scandinavian" },
  { id: "loft", label: "Лофт", en: "industrial loft" },
  { id: "minimalism", label: "Минимализм", en: "minimalist" },
  { id: "neoclassic", label: "Неоклассика", en: "neoclassical" },
  { id: "japandi", label: "Джапанди", en: "japandi (japanese-scandinavian)" },
  { id: "classic", label: "Классика", en: "classic elegant" },
] as const;

export const PALETTES = [
  { id: "warm_neutral", label: "Тёплые нейтральные", en: "warm neutral beige and cream tones" },
  { id: "white_wood", label: "Белый + дерево", en: "white walls with natural light oak wood" },
  { id: "cool_grey", label: "Холодный серый", en: "cool light grey and white monochrome" },
  { id: "dark_moody", label: "Тёмный глубокий", en: "dark moody charcoal and deep green with brass accents" },
  { id: "earthy", label: "Терракота / земля", en: "earthy terracotta, clay and sand tones" },
  { id: "pastel", label: "Пастель", en: "soft pastel muted tones" },
  { id: "monochrome", label: "Монохром", en: "black and white monochrome with grey" },
] as const;

export const PRICE_SEGMENTS = [
  {
    id: "econom",
    label: "Эконом",
    en: "budget-friendly practical finishes, laminate flooring, painted walls, mass-market furniture, simple lighting",
  },
  {
    id: "optima",
    label: "Оптима",
    en: "mid-range quality finishes, engineered wood floor, accent wall, designer-look furniture, layered lighting",
  },
  {
    id: "premium",
    label: "Премиум",
    en: "premium high-end finishes, natural materials (oak, marble, brass), bespoke furniture, designer lighting, rich textures",
  },
] as const;

export type RoomTypeId = (typeof ROOM_TYPES)[number]["id"];
export type StyleId = (typeof STYLES)[number]["id"];
export type PaletteId = (typeof PALETTES)[number]["id"];
export type PriceSegmentId = (typeof PRICE_SEGMENTS)[number]["id"];

export interface DesignConfig {
  roomType: RoomTypeId;
  style: StyleId;
  palette: PaletteId;
  priceSegment: PriceSegmentId;
  /** Площадь, м² — опц., уточняет масштаб сцены. */
  areaSqm?: number;
  /** Есть ли загруженное фото комнаты пользователя (image-to-image режим). */
  hasUserPhoto?: boolean;
}

const NEGATIVE =
  "no text, no labels, no watermark, no people, no distortion, no clutter, no low quality";

function find<T extends { id: string; en: string }>(arr: readonly T[], id: string): T {
  const hit = arr.find((x) => x.id === id);
  if (!hit) throw new Error(`designPrompt: неизвестная опция "${id}"`);
  return hit;
}

/**
 * Собирает развёрнутый английский промпт из выбранных опций.
 *
 * Для text-to-image (нет фото) — полноценное описание сцены с ракурсом.
 * Для image-to-image (есть фото) — инструкция «перекрасить ту же комнату»,
 * сохранив геометрию пользовательского снимка.
 */
export function buildDesignPrompt(cfg: DesignConfig): { prompt: string; negativePrompt: string } {
  const room = find(ROOM_TYPES, cfg.roomType);
  const style = find(STYLES, cfg.style);
  const palette = find(PALETTES, cfg.palette);
  const segment = find(PRICE_SEGMENTS, cfg.priceSegment);
  const area = cfg.areaSqm && cfg.areaSqm > 0 ? `, approx ${Math.round(cfg.areaSqm)} sqm` : "";

  const core =
    `${style.en} interior design of a ${room.en}${area}, ` +
    `${palette.en}, ${segment.en}`;

  const quality =
    "interior design magazine photography, professional, photorealistic, ultra detailed, " +
    "sharp focus, natural soft daylight, cinematic warm lighting, cozy and inviting, 8k";

  const prompt = cfg.hasUserPhoto
    ? // image-to-image: сохраняем геометрию пользовательской комнаты
      `Redesign this room keeping the exact same walls, windows, doors and proportions. ` +
      `New look: ${core}. ${quality}.`
    : // text-to-image: рисуем сцену с нуля, широкий архитектурный ракурс
      `A ${core}. Wide-angle architectural view showing the full room layout and furniture. ${quality}.`;

  return { prompt, negativePrompt: NEGATIVE };
}

/** Человекочитаемое резюме выбора — для подписи под результатом / SEO. */
export function describeConfig(cfg: DesignConfig): string {
  const room = find(ROOM_TYPES, cfg.roomType);
  const style = find(STYLES, cfg.style);
  const segment = find(PRICE_SEGMENTS, cfg.priceSegment);
  return `${room.label} · ${style.label} · ${segment.label}`;
}
