// Feature: ai-design-flagship, Property 5: Invalid input is rejected without creating a project
/**
 * Property test for AI_Design_Flagship aggregate request validation.
 *
 * Property 5: Invalid input is rejected without creating a project.
 *
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6**
 *
 * Module under test:
 *   - `validateGenerateRequest(body, photo)` from
 *     `artifacts/api-server/src/lib/dizajnFormSchema.ts` (task 2.1)
 *
 * What this property asserts:
 *   For any request in which at least one field violates the contract —
 *     - `roomType` outside the whitelist                 (Req 5.1 → invalid_enum_value)
 *     - `style` outside the whitelist                    (Req 5.2 → invalid_enum_value)
 *     - `budget` outside 50 000..5 000 000 ₽             (Req 5.3 → too_small/too_big)
 *     - derived room area below the per-room minimum     (Req 5.4 → room_too_small)
 *     - `Room_Photo` of a type other than JPG/PNG        (Req 5.5 → invalid_photo_type)
 *     - `Room_Photo` exceeding 8 МБ                       (Req 5.6 → photo_too_large)
 *   `validateGenerateRequest` returns `{ ok: false }` with the matching
 *   violation code AND carries no validated project data (no `data` field),
 *   i.e. nothing that would seed a `Design_Project`.
 *
 * External dependencies (R2 / Fal AI / Turnstile) are not involved: this is
 * the pure validation core, so 100+ iterations stay cheap and deterministic.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import {
  validateGenerateRequest,
  ROOM_TYPES,
  STYLES,
  PALETTES,
  HEIGHT_CM_MIN,
  HEIGHT_CM_MAX,
  BUDGET_MIN_RUB,
  BUDGET_MAX_RUB,
  MAX_PHOTO_SIZE_BYTES,
  ALLOWED_PHOTO_MIME_TYPES,
  INVALID_PHOTO_TYPE_CODE,
  PHOTO_TOO_LARGE_CODE,
  ROOM_TOO_SMALL_CODE,
  type PhotoMeta,
  type DesignFormViolation,
  type GenerateRequestValidationResult,
} from "../../src/lib/dizajnFormSchema.js";
import { MIN_AREA_SQM_BY_ROOM_TYPE } from "../../src/lib/geometricValidator.js";

// ─── Shared facts ────────────────────────────────────────────────────────────

// MVP-allowed room type — used as the valid baseline so the only violation in
// each case is the one deliberately injected.
const BASE_ROOM_TYPE = "bedroom" as const;
const BEDROOM_MIN_SQM = MIN_AREA_SQM_BY_ROOM_TYPE[BASE_ROOM_TYPE]!; // 6 m²
const BEDROOM_MIN_AREA_CM2 = BEDROOM_MIN_SQM * 10_000; // 60 000 cm²

// ─── Generators ──────────────────────────────────────────────────────────────

const validStyleArb = fc.constantFrom(...STYLES);
const validPaletteArb = fc.constantFrom(...PALETTES);
const validHeightArb = fc.integer({ min: HEIGHT_CM_MIN, max: HEIGHT_CM_MAX });
const validBudgetArb = fc.integer({ min: BUDGET_MIN_RUB, max: BUDGET_MAX_RUB });

// Width/length that are individually inside the Zod range AND whose product is
// comfortably above the bedroom minimum area, so a baseline request is fully
// valid (area never the accidental failure).
const validWidthArb = fc.integer({ min: 300, max: 800 });
const validLengthArb = fc.integer({ min: 300, max: 800 }); // 300*300 = 9 m² ≥ 6 m²

interface RequestBody {
  roomType: string;
  style: string;
  palette: string;
  widthCm: number;
  lengthCm: number;
  heightCm: number;
  budget: number;
  [k: string]: unknown;
}

/** A fully valid baseline request body (no photo, or a valid photo added separately). */
const validBodyArb: fc.Arbitrary<RequestBody> = fc.record({
  roomType: fc.constant(BASE_ROOM_TYPE),
  style: validStyleArb,
  palette: validPaletteArb,
  widthCm: validWidthArb,
  lengthCm: validLengthArb,
  heightCm: validHeightArb,
  budget: validBudgetArb,
});

/** Room-type strings deliberately outside the whitelist. */
const invalidRoomTypeArb = fc
  .oneof(
    fc.string({ minLength: 1, maxLength: 20 }),
    fc.constantFrom("garage", "balcony", "office", "veranda", "studio_x"),
  )
  .filter((s) => !(ROOM_TYPES as readonly string[]).includes(s));

/** Style strings deliberately outside the whitelist. */
const invalidStyleArb = fc
  .oneof(
    fc.string({ minLength: 1, maxLength: 20 }),
    fc.constantFrom("brutalism", "artdeco", "rustic", "boho", "vaporwave"),
  )
  .filter((s) => !(STYLES as readonly string[]).includes(s));

/** Budget values outside the inclusive [50k..5M] ₽ window. */
const outOfRangeBudgetArb = fc.oneof(
  fc.integer({ min: 0, max: BUDGET_MIN_RUB - 1 }), // too small
  fc.integer({ min: BUDGET_MAX_RUB + 1, max: 50_000_000 }), // too big
);

/**
 * Width/length pairs that are each inside the Zod range [200..800] but whose
 * product is below the bedroom minimum area (→ `room_too_small`).
 * For bedroom min = 60 000 cm²: width < 300 guarantees a feasible length ≥ 200.
 */
const tooSmallDimsArb = fc
  .integer({ min: 200, max: 299 })
  .chain((widthCm) => {
    const maxLen = Math.min(800, Math.floor((BEDROOM_MIN_AREA_CM2 - 1) / widthCm));
    return fc
      .integer({ min: 200, max: maxLen })
      .map((lengthCm) => ({ widthCm, lengthCm }));
  })
  .filter(({ widthCm, lengthCm }) => widthCm * lengthCm < BEDROOM_MIN_AREA_CM2);

/** MIME types that are neither image/jpeg nor image/png. */
const invalidMimeArb = fc
  .oneof(
    fc.constantFrom(
      "image/gif",
      "image/webp",
      "image/bmp",
      "image/tiff",
      "application/pdf",
      "text/plain",
      "application/octet-stream",
      "",
    ),
    fc.string({ minLength: 1, maxLength: 30 }),
  )
  .filter((m) => !(ALLOWED_PHOTO_MIME_TYPES as readonly string[]).includes(m));

const validMimeArb = fc.constantFrom(...ALLOWED_PHOTO_MIME_TYPES);
const validPhotoSizeArb = fc.integer({ min: 1, max: MAX_PHOTO_SIZE_BYTES });
const oversizePhotoSizeArb = fc.integer({
  min: MAX_PHOTO_SIZE_BYTES + 1,
  max: MAX_PHOTO_SIZE_BYTES * 4,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Assert rejection and that NO validated project data is carried back. */
function expectRejectedWithoutData(
  result: GenerateRequestValidationResult,
  context: string,
): DesignFormViolation[] {
  assert.equal(result.ok, false, `expected rejection for ${context}`);
  // A rejected result must not expose validated project data — nothing that
  // could seed a Design_Project row.
  assert.equal(
    "data" in result,
    false,
    `rejected result must carry no project data for ${context}`,
  );
  if (result.ok) throw new Error("unreachable");
  assert.ok(
    result.violations.length >= 1,
    `expected at least one violation for ${context}`,
  );
  return result.violations;
}

function hasViolation(
  violations: readonly DesignFormViolation[],
  path: string,
  code: string,
): boolean {
  return violations.some((v) => v.path === path && v.code === code);
}

// ─── Property 5 ────────────────────────────────────────────────────────────────

describe("Property 5: invalid input is rejected without creating a project", () => {
  // Req 5.1 — roomType outside the whitelist.
  it("rejects an out-of-whitelist roomType (invalid_enum_value), no project data", () => {
    fc.assert(
      fc.property(validBodyArb, invalidRoomTypeArb, (base, badRoomType) => {
        const body = { ...base, roomType: badRoomType };
        const result = validateGenerateRequest(body, null);
        const violations = expectRejectedWithoutData(
          result,
          `roomType="${badRoomType}"`,
        );
        assert.ok(
          hasViolation(violations, "roomType", "invalid_enum_value"),
          `expected invalid_enum_value on roomType for "${badRoomType}", got ${JSON.stringify(violations)}`,
        );
      }),
      { numRuns: 100 },
    );
  });

  // Req 5.2 — style outside the whitelist.
  it("rejects an out-of-whitelist style (invalid_enum_value), no project data", () => {
    fc.assert(
      fc.property(validBodyArb, invalidStyleArb, (base, badStyle) => {
        const body = { ...base, style: badStyle };
        const result = validateGenerateRequest(body, null);
        const violations = expectRejectedWithoutData(
          result,
          `style="${badStyle}"`,
        );
        assert.ok(
          hasViolation(violations, "style", "invalid_enum_value"),
          `expected invalid_enum_value on style for "${badStyle}", got ${JSON.stringify(violations)}`,
        );
      }),
      { numRuns: 100 },
    );
  });

  // Req 5.3 — budget outside 50 000..5 000 000 ₽.
  it("rejects a budget outside [50k..5M] (too_small/too_big), no project data", () => {
    fc.assert(
      fc.property(validBodyArb, outOfRangeBudgetArb, (base, badBudget) => {
        const body = { ...base, budget: badBudget };
        const result = validateGenerateRequest(body, null);
        const violations = expectRejectedWithoutData(
          result,
          `budget=${badBudget}`,
        );
        const v = violations.find((x) => x.path === "budget");
        assert.ok(v, `expected a budget violation for ${badBudget}`);
        assert.ok(
          v!.code === "too_small" || v!.code === "too_big",
          `expected too_small/too_big on budget, got ${v!.code}`,
        );
      }),
      { numRuns: 100 },
    );
  });

  // Req 5.4 — derived room area below the per-room minimum.
  it("rejects dims whose area is below the room minimum (room_too_small), no project data", () => {
    fc.assert(
      fc.property(validBodyArb, tooSmallDimsArb, (base, dims) => {
        const body = { ...base, widthCm: dims.widthCm, lengthCm: dims.lengthCm };
        const result = validateGenerateRequest(body, null);
        const violations = expectRejectedWithoutData(
          result,
          `dims=${dims.widthCm}x${dims.lengthCm}`,
        );
        assert.ok(
          hasViolation(violations, "area", ROOM_TOO_SMALL_CODE),
          `expected ${ROOM_TOO_SMALL_CODE} on area for ${dims.widthCm}x${dims.lengthCm}, got ${JSON.stringify(violations)}`,
        );
      }),
      { numRuns: 100 },
    );
  });

  // Req 5.5 — Room_Photo of a type other than JPG/PNG.
  it("rejects a photo with a non-JPG/PNG MIME (invalid_photo_type), no project data", () => {
    fc.assert(
      fc.property(
        validBodyArb,
        invalidMimeArb,
        validPhotoSizeArb,
        (base, mime, sizeBytes) => {
          const photo: PhotoMeta = { mime, sizeBytes };
          const result = validateGenerateRequest(base, photo);
          const violations = expectRejectedWithoutData(
            result,
            `photo mime="${mime}"`,
          );
          assert.ok(
            hasViolation(violations, "image", INVALID_PHOTO_TYPE_CODE),
            `expected ${INVALID_PHOTO_TYPE_CODE} for mime="${mime}", got ${JSON.stringify(violations)}`,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  // Req 5.6 — Room_Photo exceeding 8 МБ.
  it("rejects a photo larger than 8 МБ (photo_too_large), no project data", () => {
    fc.assert(
      fc.property(
        validBodyArb,
        validMimeArb,
        oversizePhotoSizeArb,
        (base, mime, sizeBytes) => {
          const photo: PhotoMeta = { mime, sizeBytes };
          const result = validateGenerateRequest(base, photo);
          const violations = expectRejectedWithoutData(
            result,
            `photo size=${sizeBytes}`,
          );
          assert.ok(
            hasViolation(violations, "image", PHOTO_TOO_LARGE_CODE),
            `expected ${PHOTO_TOO_LARGE_CODE} for size=${sizeBytes}, got ${JSON.stringify(violations)}`,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
