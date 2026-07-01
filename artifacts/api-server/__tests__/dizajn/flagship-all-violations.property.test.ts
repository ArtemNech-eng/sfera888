// Feature: ai-design-flagship, Property 6: All violations are reported together
/**
 * Property test for AI_Design_Flagship aggregate request validation.
 *
 * Property 6: All violations are reported together.
 *
 * **Validates: Requirements 5.7**
 *
 * Function under test:
 *   - `validateGenerateRequest(body, photo)` from
 *     `artifacts/api-server/src/lib/dizajnFormSchema.ts`
 *
 * Property statement (design.md → Correctness Properties → Property 6):
 *   *For any* request containing K ≥ 1 independent validation violations,
 *   the `Generate_Endpoint` response lists all K violations, not only the first.
 *
 * Strategy:
 *   Start from a fully-valid `Request_Contract` baseline (multipart string
 *   fields + a valid JPEG `PhotoMeta`). A pool of independent violation
 *   "injectors" each mutate exactly one orthogonal aspect of the request and
 *   carry a matcher that recognises their own violation in the result. The
 *   generator picks a non-empty subset (K ≥ 1) of those injectors, applies
 *   them, and the test asserts that:
 *     1. validation fails (`ok === false`),
 *     2. every one of the K injected violations is present in `violations`
 *        (i.e. not just the first), and
 *     3. at least K violations are reported.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import {
  validateGenerateRequest,
  type PhotoMeta,
  type DesignFormViolation,
  STYLES,
  PALETTES,
  MAX_PHOTO_SIZE_BYTES,
  BUDGET_MIN_RUB,
  BUDGET_MAX_RUB,
  HEIGHT_CM_MIN,
  HEIGHT_CM_MAX,
  INVALID_PALETTE_CODE,
  INVALID_PHOTO_TYPE_CODE,
  PHOTO_TOO_LARGE_CODE,
} from "../../src/lib/dizajnFormSchema.js";

// ─── Baseline (fully valid) request ──────────────────────────────────────────
//
// Multipart fields arrive as strings; numeric coercion is done inside
// validateGenerateRequest. Dimensions 500×500 ⇒ 25 м², which clears the minimum
// area for EVERY whitelist room type (max is apartment at 18 м²), so swapping in
// a non-bedroom room type (the MVP-lock injector) never spuriously triggers
// `room_too_small`. Height 270 ∈ [220..350].

interface RequestParts {
  body: Record<string, string>;
  photo: PhotoMeta;
}

function baselineRequest(): RequestParts {
  return {
    body: {
      roomType: "bedroom",
      style: "modern",
      palette: "warm_neutral",
      widthCm: "500",
      lengthCm: "500",
      heightCm: "270",
      budget: "1000000",
    },
    photo: { mime: "image/jpeg", sizeBytes: 1024 * 1024 },
  };
}

// ─── Generators for invalid values ───────────────────────────────────────────

const badStyleArb = fc
  .string({ minLength: 1, maxLength: 24 })
  .filter((s) => !(STYLES as readonly string[]).includes(s));

const badPaletteArb = fc
  .string({ minLength: 1, maxLength: 24 })
  .filter((s) => !(PALETTES as readonly string[]).includes(s));

const outOfRangeBudgetArb = fc.oneof(
  fc.integer({ min: 0, max: BUDGET_MIN_RUB - 1 }),
  fc.integer({ min: BUDGET_MAX_RUB + 1, max: 50_000_000 }),
);

const outOfRangeHeightArb = fc.oneof(
  fc.integer({ min: 1, max: HEIGHT_CM_MIN - 1 }),
  fc.integer({ min: HEIGHT_CM_MAX + 1, max: 5_000 }),
);

const badMimeArb = fc.constantFrom(
  "image/gif",
  "image/webp",
  "image/bmp",
  "application/pdf",
  "text/plain",
  "application/octet-stream",
);

const oversizedBytesArb = fc.integer({
  min: MAX_PHOTO_SIZE_BYTES + 1,
  max: MAX_PHOTO_SIZE_BYTES * 4,
});

// ─── Violation injectors ─────────────────────────────────────────────────────
//
// Each injector mutates exactly ONE orthogonal aspect of the request and knows
// how to recognise its own violation in the result list. Injectors are mutually
// independent: their target paths/codes do not collide (the two photo injectors
// share path `image` but use distinct codes), so applying any subset yields
// exactly that many distinguishable violations.

type Injector = {
  key: string;
  apply: (req: RequestParts, params: GeneratedParams) => void;
  matches: (v: DesignFormViolation) => boolean;
};

interface GeneratedParams {
  badStyle: string;
  badPalette: string;
  badBudget: number;
  badHeight: number;
  badMime: string;
  oversized: number;
}

const INJECTORS: Injector[] = [
  {
    key: "style",
    apply: (req, p) => {
      req.body.style = p.badStyle;
    },
    // Zod issue code may vary across versions; match by field path.
    matches: (v) => v.path === "style",
  },
  {
    key: "budget",
    apply: (req, p) => {
      req.body.budget = String(p.badBudget);
    },
    matches: (v) => v.path === "budget",
  },
  {
    key: "height",
    apply: (req, p) => {
      req.body.heightCm = String(p.badHeight);
    },
    matches: (v) => v.path === "heightCm",
  },
  {
    key: "palette",
    apply: (req, p) => {
      req.body.palette = p.badPalette;
    },
    matches: (v) => v.code === INVALID_PALETTE_CODE,
  },
  {
    key: "photoType",
    apply: (req, p) => {
      req.photo.mime = p.badMime;
    },
    matches: (v) => v.code === INVALID_PHOTO_TYPE_CODE,
  },
  {
    key: "photoSize",
    apply: (req, p) => {
      req.photo.sizeBytes = p.oversized;
    },
    matches: (v) => v.code === PHOTO_TOO_LARGE_CODE,
  },
];

const INJECTOR_KEYS = INJECTORS.map((i) => i.key);
const INJECTOR_BY_KEY = new Map(INJECTORS.map((i) => [i.key, i]));

// ─── Test ────────────────────────────────────────────────────────────────────

describe("Flagship Property 6: All violations are reported together", () => {
  it("reports every one of K ≥ 1 independent violations, not just the first", () => {
    fc.assert(
      fc.property(
        // K ≥ 1 distinct injectors (a non-empty subset of the pool).
        fc.subarray(INJECTOR_KEYS, { minLength: 1 }),
        badStyleArb,
        badPaletteArb,
        outOfRangeBudgetArb,
        outOfRangeHeightArb,
        badMimeArb,
        oversizedBytesArb,
        (
          selectedKeys,
          badStyle,
          badPalette,
          badBudget,
          badHeight,
          badMime,
          oversized,
        ) => {
          const params: GeneratedParams = {
            badStyle,
            badPalette,
            badBudget,
            badHeight,
            badMime,
            oversized,
          };

          const req = baselineRequest();
          const selected = selectedKeys.map((k) => INJECTOR_BY_KEY.get(k)!);
          for (const injector of selected) {
            injector.apply(req, params);
          }

          const result = validateGenerateRequest(req.body, req.photo);

          // 1. With ≥ 1 violation present, validation must fail.
          assert.equal(
            result.ok,
            false,
            `expected validation to fail for injected: ${selectedKeys.join(", ")}`,
          );
          if (result.ok) return;

          const { violations } = result;

          // 2. Every injected violation must be present — proving the validator
          //    aggregates ALL violations rather than short-circuiting on the
          //    first one.
          for (const injector of selected) {
            assert.ok(
              violations.some((v) => injector.matches(v)),
              `missing violation for injector "${injector.key}"; ` +
                `selected=[${selectedKeys.join(", ")}] ` +
                `got=${JSON.stringify(violations)}`,
            );
          }

          // 3. At least K violations are reported together.
          assert.ok(
            violations.length >= selected.length,
            `expected at least ${selected.length} violations, got ${violations.length}: ` +
              `${JSON.stringify(violations)}`,
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it("reports both violations when exactly two independent rules are broken", () => {
    // Concrete K = 2 example: invalid palette + photo too large.
    const req = baselineRequest();
    req.body.palette = "rainbow_unicorn";
    req.photo.sizeBytes = MAX_PHOTO_SIZE_BYTES + 1;

    const result = validateGenerateRequest(req.body, req.photo);
    assert.equal(result.ok, false);
    if (result.ok) return;

    assert.ok(
      result.violations.some((v) => v.code === INVALID_PALETTE_CODE),
      "expected invalid_palette violation",
    );
    assert.ok(
      result.violations.some((v) => v.code === PHOTO_TOO_LARGE_CODE),
      "expected photo_too_large violation",
    );
    assert.ok(
      result.violations.length >= 2,
      `expected at least 2 violations, got ${result.violations.length}`,
    );
  });
});
