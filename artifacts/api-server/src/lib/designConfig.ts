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
 *     (`designCostGuard.ts`). Default 10000 kopeks = 100 ₽ — covers the
 *     identity-preserving edit-image budget (hero + 3×edit) per
 *     ai-design-quality-fix design §F.
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
 * Native per-view resolution, in pixels. The Hero_Render is a 1024×1024 image
 * and every angle render MUST be native 1024 — never an upscale of a 512-px
 * collage quadrant (design.md §F / §Bug Condition B8, Property 8).
 */
export const NATIVE_VIEW_PX = 1024;

/**
 * Size of a single quadrant when a 1024×1024 collage is sliced 2×2
 * (`Math.floor(1024 / 2)`). The legacy success path resized this 512-px
 * quadrant up to 1024 (`fit: "cover"`) — a visible upscale that lost detail
 * and let angle renders drift apart (loss of identity). Kept only as the
 * documented source resolution of the degraded fallback branch.
 */
export const COLLAGE_QUADRANT_PX = 512;

/**
 * Per-view generation strategy for angle renders (views 2..4) — design.md §F.
 *
 *   kind                 — "primary" (identity-preserving edit-image success
 *                          path) or "fallback" (optional degradation: collage
 *                          slice-and-upscale);
 *   mode                 — human-readable strategy tag for telemetry/logs;
 *   sourceResolutionPx   — native resolution of the SOURCE pixels before any
 *                          resize (1024 for edit-image, 512 for a collage
 *                          quadrant);
 *   outputResolutionPx   — final per-view resolution;
 *   identityPreserving   — single source/reference (edit-image from hero) so
 *                          palette / furniture / style stay consistent.
 */
export type ViewStrategy = {
  kind: "primary" | "fallback";
  mode: string;
  sourceResolutionPx: number;
  outputResolutionPx: number;
  identityPreserving: boolean;
};

/**
 * Default edit-image provider. Matches the conservative pre-pilot baseline:
 * `gpt-image-1.5 edit` is what `falGenerateGptImageEdit` already drives in the
 * existing pipeline, so picking it as the fallback means an unset env behaves
 * exactly like the worker does today.
 */
export const DEFAULT_EDIT_PROVIDER: EditImageProvider = "gpt_image_1_5_edit";

/**
 * Default per-project AI budget in kopeks. 10000 kopeks = 100 ₽. Bumped from
 * the original 3000 (≈ $0.30) to fit the identity-preserving edit-image budget
 * (hero high + 3×edit high) introduced by ai-design-quality-fix design §F.
 * Stored as kopeks because that's the unit `design_generations.cost_kopeks`
 * already uses; no conversion at the guard site.
 */
export const DEFAULT_COST_CEILING_KOPEKS = 10000;

/**
 * Default model for the Layout_Planner / design content path.
 *
 * `gpt-4o-2024-08-06` is OpenAI's first GA model with first-class
 * `response_format: { type: "json_schema", strict: true }` (Structured
 * Outputs) support, so it holds the Layout_JSON schema reliably end-to-end.
 * That makes it a safe fallback for the structured-output path: an unset env
 * no longer routes to the previous `claude-opus-4-7` default, which did not
 * support strict JSON-schema structured outputs and caused `parseLayout` to
 * reject responses until retries were exhausted → `failed`.
 *
 * Spec: ai-design-quality-fix/design.md §D, Property 6, Requirement 2.6.
 */
export const DEFAULT_DESIGN_MODEL = "gpt-4o-2024-08-06";

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
 * Trim a raw env value, preserving its original case.
 *
 * Returns `null` for undefined / non-string / empty-after-trim values, and
 * the trimmed (but otherwise verbatim) string otherwise.
 *
 * Unlike `sanitizeEnvString`, this deliberately does NOT lowercase: model
 * identifiers are case- and slash-sensitive (e.g. `openai/gpt-4o-2024-08-06`,
 * `gpt-4.1-2025-04-14`) and must be passed to the provider exactly as the
 * operator set them. We only treat empty / whitespace-only values as "unset".
 */
function trimEnvString(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
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
 * `DEFAULT_COST_CEILING_KOPEKS = 10000`. Zero is allowed and means "no AI calls
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

/**
 * Resolve the model the Layout_Planner / design content path should call.
 *
 * Fallback chain (read fresh on every call):
 *   1. `AI_INTEGRATIONS_DESIGN_MODEL` — design-specific override;
 *   2. `AI_INTEGRATIONS_OPENAI_MODEL` — shared gateway model;
 *   3. `DEFAULT_DESIGN_MODEL` — reliable structured-output default.
 *
 * Values are returned verbatim (only trimmed) so case- and slash-sensitive
 * identifiers like `openai/gpt-4o-2024-08-06` reach the provider unchanged. An
 * empty / whitespace-only value is treated as "unset" and falls through the
 * chain. When neither env var yields a usable value, we fall back to
 * `DEFAULT_DESIGN_MODEL` and emit a one-line warning — a misconfigured env
 * gets safe, schema-capable behaviour instead of crashing the queue.
 *
 * Read fresh on every call (mirrors `getEditImageProvider()` /
 * `getCostCeilingKopeks()`): the worker is long-lived, so operators can flip
 * the model with a hot env patch without restarting the generation queue.
 *
 * Spec: ai-design-quality-fix/design.md §D, Property 6, Requirement 2.6.
 */
export function getDesignModel(): string {
  const designModel = trimEnvString(process.env["AI_INTEGRATIONS_DESIGN_MODEL"]);
  if (designModel !== null) {
    return designModel;
  }
  const openaiModel = trimEnvString(process.env["AI_INTEGRATIONS_OPENAI_MODEL"]);
  if (openaiModel !== null) {
    return openaiModel;
  }
  console.warn(
    `[designConfig] neither AI_INTEGRATIONS_DESIGN_MODEL nor ` +
      `AI_INTEGRATIONS_OPENAI_MODEL is set — falling back to ${DEFAULT_DESIGN_MODEL}`,
  );
  return DEFAULT_DESIGN_MODEL;
}

/**
 * Whether identity-preserving edit-image generation is available right now.
 *
 * Edit-image (`falGenerateGptImageEdit` / `falGenerateFluxKontextPro`) needs a
 * Fal.ai key to reach the provider; `getEditImageProvider()` always resolves a
 * provider literal, so availability really hinges on `FAL_API_KEY` being set.
 * Read fresh on every call to mirror the other knobs in this module — an
 * operator can unset the key and the worker degrades to the collage fallback
 * without a restart.
 */
export function isEditImageAvailable(): boolean {
  return trimEnvString(process.env["FAL_API_KEY"]) !== null;
}

/**
 * Choose the generation strategy for angle renders (views 2..4) — design.md §F,
 * Property 8 / Requirement 2.8.
 *
 *   - When edit-image is available we take the identity-preserving PRIMARY
 *     path: each view is generated natively at 1024 via the edit-image
 *     provider with `image_urls=[heroUrl]`, so there is no upscale
 *     (`sourceResolutionPx === outputResolutionPx === NATIVE_VIEW_PX`) and the
 *     shared hero reference keeps identity (`identityPreserving: true`).
 *   - When edit-image is unavailable we degrade to the FALLBACK collage
 *     slice-and-upscale: a 512-px quadrant resized up to 1024
 *     (`sourceResolutionPx < outputResolutionPx`). This is an optional-step
 *     degradation only — it never routes the project to `failed`.
 *
 * `editImageAvailable` defaults to `isEditImageAvailable()` so callers that
 * don't already know availability get the env-driven decision; the worker and
 * tests can pass it explicitly. Pure and read-fresh, mirroring
 * `getEditImageProvider()` / `getDesignModel()`.
 */
export function chooseViewStrategy(
  input: { editImageAvailable?: boolean } = {},
): ViewStrategy {
  const editImageAvailable = input.editImageAvailable ?? isEditImageAvailable();

  if (editImageAvailable) {
    return {
      kind: "primary",
      mode: "edit_image_native",
      sourceResolutionPx: NATIVE_VIEW_PX,
      outputResolutionPx: NATIVE_VIEW_PX,
      identityPreserving: true,
    };
  }

  // Optional degradation: collage 2×2 → 512-px quadrant → upscale to 1024.
  return {
    kind: "fallback",
    mode: "collage_slice_upscale",
    sourceResolutionPx: COLLAGE_QUADRANT_PX,
    outputResolutionPx: NATIVE_VIEW_PX,
    identityPreserving: false,
  };
}

/**
 * Input fidelity used when a user photo is fed as an edit-image reference.
 *
 * `falGenerateGptImageEdit` / `falGenerateFluxKontextPro` accept
 * `input_fidelity: "low" | "high"`. Per design.md §G (Property 9 /
 * Requirement 2.9) the user's room photo must be followed as strictly as
 * possible, so the reference path always uses `"high"`.
 */
export const USER_PHOTO_INPUT_FIDELITY: "high" = "high";

/**
 * Strategy describing how the hero / angle renders are generated for a
 * project — design.md §G (Property 9 / Requirement 2.9).
 *
 *   mode           — "edit_image" (identity/photo-preserving path via
 *                    `getEditImageProvider()` → `falGenerateGptImageEdit` /
 *                    `falGenerateFluxKontextPro`) or "text2img" (generated
 *                    from scratch out of the text prompt, `falGenerateGptImage`);
 *   imageUrls      — reference images fed to the provider (for a user-upload
 *                    project this is `[userPhotoUrl]`);
 *   inputFidelity  — how strictly to follow the reference ("high" | "low" |
 *                    `null` when there is no reference);
 *   usesUserPhoto  — whether the user's photo is fed as a reference.
 */
export type HeroGenerationStrategy = {
  mode: "edit_image" | "text2img";
  imageUrls: string[];
  inputFidelity: "high" | "low" | null;
  usesUserPhoto: boolean;
};

/**
 * Choose the hero / angle generation strategy for a project — design.md §G,
 * Property 9 / Requirement 2.9.
 *
 * A project is a *user-upload* when it carries a user photo
 * (`userPhotoUrl != null`) and is NOT a seed/showcase project (`isSeed`
 * false). Seed projects have no user photo to preserve (their `input_image_url`
 * is a server-generated "before" render), so they keep the legacy text2img
 * path unchanged (Preservation §G).
 *
 *   - user-upload → identity-preserving edit-image: the photo is fed as a
 *     reference (`image_urls=[userPhotoUrl]`, `input_fidelity:"high"`,
 *     `usesUserPhoto:true`) so the generated renders track the real room and
 *     the chosen style.
 *   - otherwise (seed project, or no photo) → text2img from scratch
 *     (`usesUserPhoto:false`, no reference).
 *
 * Pure and read-fresh, mirroring `getEditImageProvider()` / `getDesignModel()`
 * / `chooseViewStrategy()`. The `style` field is part of the call contract
 * (callers resolve the style clause from it) but does not change the chosen
 * mode — style binding is strengthened in the prompt builders, not here.
 */
export function chooseHeroGenerationStrategy(input: {
  userPhotoUrl: string | null;
  isSeed: boolean;
  style: string;
}): HeroGenerationStrategy {
  const isUserUpload = input.userPhotoUrl != null && !input.isSeed;

  if (isUserUpload) {
    return {
      mode: "edit_image",
      imageUrls: [input.userPhotoUrl as string],
      inputFidelity: USER_PHOTO_INPUT_FIDELITY,
      usesUserPhoto: true,
    };
  }

  // Seed project (no user photo to preserve) or no photo at all → legacy
  // text2img path, no reference (Preservation §G).
  return {
    mode: "text2img",
    imageUrls: [],
    inputFidelity: null,
    usesUserPhoto: false,
  };
}
