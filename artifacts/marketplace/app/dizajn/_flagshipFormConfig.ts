/**
 * Pure, dependency-free configuration and helpers for `Flagship_Form`.
 *
 * Extracted out of `_FlagshipForm.tsx` so the control catalog (`Room_Type` /
 * `Style` / `Palette` / `Price_Segment` tiles), the client-side bounds, the
 * deterministic `deriveRoomDims` mapping and the 202-success-navigation
 * decision can be unit-tested under the api-server `tsx --test` suite — which
 * runs pure helpers and cannot mount React (the marketplace app has no
 * React/jsdom test harness). This mirrors the convention of the sibling
 * flagship pure-helper tests (e.g. `flagship-quota.property.test.ts`,
 * `flagship-paywall-zero-quota.property.test.ts`).
 *
 * This module imports neither `react` nor `next/*`, so importing it from the
 * api-server test loader is safe and side-effect free.
 */

// ── control catalog types ─────────────────────────────────────────────────────

export interface RoomTypeOption {
  value: string;
  label: string;
  /** `MVP_Room_Lock`: only enabled room types can be submitted. */
  enabled: boolean;
}

export interface StyleOption {
  value: string;
  label: string;
}

export interface PaletteOption {
  value: string;
  label: string;
  /** Preview swatch colour for the tile. */
  swatch: string;
}

export type PriceSegmentId = "econom" | "optima" | "premium";

export interface PriceSegmentOption {
  id: PriceSegmentId;
  label: string;
}

// ── control catalog (values strictly mirror backend enums) ────────────────────

/**
 * Room types. `enabled` reflects `MVP_Room_Lock`: on the current phase the
 * backend accepts only `bedroom`; every other value is rendered with a «скоро»
 * badge and is not selectable (Requirement 6.1).
 */
export const ROOM_TYPES: ReadonlyArray<RoomTypeOption> = [
  { value: "bedroom", label: "Спальня", enabled: true },
  { value: "living_room", label: "Гостиная", enabled: false },
  { value: "kitchen", label: "Кухня", enabled: false },
  { value: "bathroom", label: "Ванная", enabled: false },
  { value: "hallway", label: "Прихожая", enabled: false },
  { value: "nursery", label: "Детская", enabled: false },
  { value: "apartment", label: "Квартира", enabled: false },
];

/** 7 styles (backend `STYLES` whitelist). */
export const STYLES: ReadonlyArray<StyleOption> = [
  { value: "modern", label: "Современный" },
  { value: "scandinavian", label: "Скандинавский" },
  { value: "loft", label: "Лофт" },
  { value: "minimalism", label: "Минимализм" },
  { value: "neoclassic", label: "Неоклассика" },
  { value: "japandi", label: "Джапанди" },
  { value: "classic", label: "Классика" },
];

/**
 * Palettes (backend `PALETTES` whitelist). `swatch` — tile preview colour.
 * Values must match `dizajnFormSchema.PALETTES`, otherwise the backend returns
 * `invalid_palette`.
 */
export const PALETTES: ReadonlyArray<PaletteOption> = [
  { value: "warm_neutral", label: "Тёплые нейтральные", swatch: "#d9c7b0" },
  { value: "white_wood", label: "Белый + дерево", swatch: "#e8dcc8" },
  { value: "cool_gray", label: "Холодный серый", swatch: "#b8bcc2" },
  { value: "beige_sand", label: "Бежевый песок", swatch: "#e0cda9" },
  { value: "green_sage", label: "Зелёный шалфей", swatch: "#aebfa3" },
  { value: "blue_calm", label: "Спокойный синий", swatch: "#a9bdd0" },
];

/** Price segment → budget reference (₽ per project). */
export const SEGMENT_BUDGET: Record<PriceSegmentId, number> = {
  econom: 200_000,
  optima: 500_000,
  premium: 1_500_000,
};

export const PRICE_SEGMENTS: ReadonlyArray<PriceSegmentOption> = [
  { id: "econom", label: "Эконом" },
  { id: "optima", label: "Оптима" },
  { id: "premium", label: "Премиум" },
];

/** Badge shown on `MVP_Room_Lock`-disabled room tiles (Requirement 6.1). */
export const MVP_ROOM_LOCK_BADGE = "скоро";

// ── client-side bounds (mirror of backend for pre-validation) ─────────────────

export const WIDTH_CM_MIN = 200;
export const WIDTH_CM_MAX = 800;
export const ROOM_HEIGHT_CM = 270;
export const BUDGET_MIN_RUB = 50_000;
export const BUDGET_MAX_RUB = 5_000_000;
export const MAX_PHOTO_SIZE_BYTES = 8 * 1024 * 1024;
export const ALLOWED_PHOTO_MIME_TYPES = ["image/jpeg", "image/png"] as const;

/**
 * Minimum allowed room areas, m² — mirror of `MIN_AREA_SQM_BY_ROOM_TYPE` on
 * the backend. Used for client `room_too_small` pre-validation (Requirement
 * 5.4); the backend remains the source of truth.
 */
export const MIN_AREA_SQM_BY_ROOM_TYPE: Readonly<Record<string, number>> = {
  bedroom: 6,
  kitchen: 4,
  bathroom: 3,
  living_room: 8,
  hallway: 2,
  nursery: 6,
  apartment: 18,
};

export const AREA_DEFAULT = "16";

// ── pure helpers ───────────────────────────────────────────────────────────────

/**
 * Returns the `MVP_Room_Lock` badge («скоро») for a locked room tile, or
 * `undefined` for an enabled one. Single source of truth for the badge so the
 * render and tests cannot drift (Requirement 6.1).
 */
export function mvpRoomLockBadge(option: RoomTypeOption): string | undefined {
  return option.enabled ? undefined : MVP_ROOM_LOCK_BADGE;
}

/**
 * Deterministic derivation of room dimensions from area (pure).
 *
 * Area (m²) → square room by default: side `side` in cm equals
 * `round(sqrt(area) * 100)`, clamped to `[WIDTH_CM_MIN..MAX]`; height fixed
 * (`ROOM_HEIGHT_CM`). Gives a reversible "area → dimensions" mapping good
 * enough for `checkMinArea` and worker prompts (design.md → `deriveRoomDims`).
 */
export function deriveRoomDims(areaSqm: number): {
  widthCm: number;
  lengthCm: number;
  heightCm: number;
} {
  const safeArea = Number.isFinite(areaSqm) && areaSqm > 0 ? areaSqm : 0;
  const rawSide = Math.round(Math.sqrt(safeArea) * 100);
  const side = Math.min(WIDTH_CM_MAX, Math.max(WIDTH_CM_MIN, rawSide));
  return { widthCm: side, lengthCm: side, heightCm: ROOM_HEIGHT_CM };
}

// ── submit outcome (202-success navigation) ───────────────────────────────────

/** Minimal shape of the parsed `Generate_Endpoint` response body. */
export interface GenerateResponseBody {
  ok?: boolean;
  design?: { slug?: string };
}

/** Side-effecting actions the success branch of `onSubmit` performs. */
export interface GenerateOutcomeActions {
  /** Consume exactly one `Free_Quota` unit (Requirement 8.4). */
  record: () => void;
  /** Navigate to a path (`router.push`). */
  navigate: (path: string) => void;
  /**
   * Optional: mark the started design slug as «this device's pending
   * generation», so the quota unit can be refunded later if it ends in
   * `failed`. No-op when omitted (keeps existing callers/tests valid).
   */
  markPending?: (slug: string) => void;
}

/**
 * `true` when the response is a successful generation start — HTTP 202 with a
 * non-empty `design.slug` (the exact condition `Flagship_Form.onSubmit` uses).
 */
export function isSuccessfulStart(
  status: number,
  body: GenerateResponseBody | null,
): boolean {
  return (
    status === 202 &&
    typeof body?.design?.slug === "string" &&
    body.design.slug.length > 0
  );
}

/**
 * Pure decision for the success branch of `Flagship_Form.onSubmit`
 * (Requirements 2.7, 8.4): on a 202 with a slug, consume exactly one quota
 * unit (`record()`) and navigate to `/dizajn/{slug}` — exactly once each — and
 * report that navigation happened. Otherwise no side effect and returns
 * `false` so the caller falls through to error handling.
 */
export function handleGenerateOutcome(
  status: number,
  body: GenerateResponseBody | null,
  actions: GenerateOutcomeActions,
): boolean {
  if (isSuccessfulStart(status, body)) {
    const slug = body!.design!.slug as string;
    actions.record();
    actions.markPending?.(slug);
    actions.navigate(`/dizajn/${slug}`);
    return true;
  }
  return false;
}
