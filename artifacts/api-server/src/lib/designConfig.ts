/**
 * Runtime configuration for the AI_Design_Product pipeline.
 *
 * Spec: .kiro/specs/ai-design-product (design.md → "Identity_Preservation"
 *       and "Cost_Ceiling"). Requirements: 7.5, 14.5.
 *
 * The two knobs exposed here are intentionally read at call-site (not cached
 * at module load):
 *   - `getEditImageProvider()` picks the wrapper used for the 5 Angle_Render
 *     edit-image calls. The pilot (`identity-preservation-pilot.ts`) chooses a
 *     winner; ops fix it via `AI_DESIGN_EDIT_PROVIDER` without a redeploy.
 *   - `getCostCeilingKopeks()` is the per-project AI budget guard
 *     (`designCostGuard.ts`). Default 3000 kopeks ≈ 30 ₽ ≈ $0.30 USD —
 *     matches the Cost_Ceiling figure cited in Requirement 14.5 and design.md.
 *
 * Everything in this module is intentionally lenient: any garbage value in the
 * env (typos, surrounding whitespace, mixed case, NaN, negatives) silently
 * falls back to the documented default. We don't crash the worker because of
 * a misconfigured env — that would take down the whole generation queue. A
 * misconfigured operator gets the default behaviour and a one-line warning in
 * stderr; tests cover the fallback paths so the contract is verifiable.
 */

declare const console: { warn: (...args: unknown[]) => void };

/** Discriminated union of allowed edit-image providers (Requirement 7.5). */
export type EditImageProvider = "gpt_image_1_5_edit" | "flux_kontext_pro";

/**
 * Default edit-image provider. Matches the conservative pre-pilot baseline:
 * `gpt-image-1.5 edit` is what `falGenerateGptImageEdit` already drives in the
 * existing pipeline, so picking it as the fallback means an unset env behaves
 * exactly like the worker does today.
 */
export const DEFAULT_EDIT_PROVIDER: EditImageProvider = "gpt_image_1_5_edit";

/**
 * Default per-project AI budget in kopeks. 3000 kopeks = 30 ₽ ≈ $0.30 USD at
 * the ~100 RUB/USD reference rate used in design.md ("Cost_Ceiling: $0.30").
 * Stored as kopeks because that's the unit `design_generations.cost_kopeks`
 * already uses; no conversion at the guard site.
 */
export const DEFAULT_COST_CEILING_KOPEKS = 3000;

/** Set of valid `EditImageProvider` literals — single source of truth for the
 *  string-union check, avoids drift between the type and the runtime guard. */
const ALLOWED_PROVIDERS: ReadonlySet<EditImageProvider> = new Set<EditImageProvider>([
  "gpt_image_1_5_edit",
  "flux_kontext_pro",
]);

/**
 * Normalize a raw env string for enum-style comparisons:
 *   - returns `null` for undefined / non-string / empty-after-trim values
 *   - otherwise: trimmed and lowercased
 *
 * Centralised here so both env knobs (and any future ones) apply the same
 * "what counts as set?" rule. Whitespace-only values are treated as unset to
 * match how operators expect `EXPORT FOO=` (or `FOO=  `) to behave.
 */
function sanitizeEnvString(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed.toLowerCase();
}

/**
 * Parse a string as a base-10 integer.
 *
 * Returns `null` when the input is not a string, doesn't fully match an
 * optional-sign integer pattern (`/^-?\d+$/`), or evaluates to NaN. We don't
 * use `parseInt` directly because `parseInt("12abc")` returns 12 — that kind
 * of silent truncation hides config bugs. Strict full-string match makes
 * "valid integer" unambiguous.
 *
 * Negative integers are returned as-is here; the caller decides whether to
 * accept them. (`getCostCeilingKopeks` rejects them; future numeric knobs
 * may not.)
 */
function parseIntSafe(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (!/^-?\d+$/.test(trimmed)) return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve which edit-image wrapper the worker should call for Angle_Render.
 *
 * Reads `AI_DESIGN_EDIT_PROVIDER`. Recognised values (case-insensitive,
 * trimmed): `gpt_image_1_5_edit`, `flux_kontext_pro`. Anything else — empty
 * string, a typo, an unsupported model name — falls back to
 * `DEFAULT_EDIT_PROVIDER` with a warning. The return type is the literal
 * union, so call sites get exhaustiveness checking on the switch.
 *
 * Read fresh on every call: the worker is long-lived and we want operators to
 * be able to flip the env in a hot patch without restarting the queue.
 */
export function getEditImageProvider(): EditImageProvider {
  const raw = process.env["AI_DESIGN_EDIT_PROVIDER"];
  const sanitized = sanitizeEnvString(raw);
  if (sanitized === null) {
    return DEFAULT_EDIT_PROVIDER;
  }
  if (ALLOWED_PROVIDERS.has(sanitized as EditImageProvider)) {
    return sanitized as EditImageProvider;
  }
  console.warn(
    `[designConfig] AI_DESIGN_EDIT_PROVIDER="${raw}" is not one of ` +
      `gpt_image_1_5_edit | flux_kontext_pro — falling back to ${DEFAULT_EDIT_PROVIDER}`,
  );
  return DEFAULT_EDIT_PROVIDER;
}

/**
 * Resolve the per-project AI budget ceiling, in kopeks.
 *
 * Reads `DESIGN_COST_CEILING_KOPEKS`. Accepts a non-negative integer string;
 * any other shape (negative, decimal, NaN, missing, empty) falls back to
 * `DEFAULT_COST_CEILING_KOPEKS = 3000`. Zero is allowed and means "no AI calls
 * permitted" — useful for staging dry-runs that should hit the guard
 * immediately rather than burn budget. Negatives are nonsensical for a
 * ceiling, so they're rejected explicitly with a warning.
 *
 * Read fresh on every call to mirror `getEditImageProvider()` semantics.
 */
export function getCostCeilingKopeks(): number {
  const raw = process.env["DESIGN_COST_CEILING_KOPEKS"];
  const parsed = parseIntSafe(raw);
  if (parsed === null) {
    return DEFAULT_COST_CEILING_KOPEKS;
  }
  if (parsed < 0) {
    console.warn(
      `[designConfig] DESIGN_COST_CEILING_KOPEKS="${raw}" must be non-negative — ` +
        `falling back to ${DEFAULT_COST_CEILING_KOPEKS}`,
    );
    return DEFAULT_COST_CEILING_KOPEKS;
  }
  return parsed;
}
