/**
 * Property test for the MVP room-type lock in the AI_Design_Flagship
 * generation-request validator.
 *
 * Feature: ai-design-flagship, Property 7: MVP room lock rejects non-allowed room types with its own code
 *
 * **Validates: Requirements 6.2**
 *
 * Module under test:
 *   - `validateGenerateRequest(body, photo)` from
 *     `artifacts/api-server/src/lib/dizajnFormSchema.ts`
 *
 * Property 7 (design.md → Correctness Properties):
 *   *For any* `Room_Type` that is a valid member of the room-type whitelist
 *   but is not in the MVP-allowed subset, the `Generate_Endpoint` rejects the
 *   request with code `mvp_room_locked`.
 *
 * Strategy:
 *   The generator emits `roomType` values drawn from `ROOM_TYPES` MINUS
 *   `MVP_ALLOWED_ROOM_TYPES` (currently only `bedroom` is allowed, so the
 *   locked subset is {kitchen, bathroom, living_room, hallway, nursery,
 *   apartment}). Every other field is generated VALID — valid `style`, valid
 *   `palette`, in-range integer dims/budget, and a room area comfortably above
 *   the largest per-room minimum (apartment = 18 м²) — so the only reason the
 *   request can be rejected is the MVP lock. We assert the result is a
 *   rejection whose `violations` include the machine-readable code
 *   `mvp_room_locked`.
 *
 *   Fields are passed as strings to mirror the real `multipart/form-data`
 *   contract (multer delivers text fields as strings; the validator coerces
 *   numeric fields internally).
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
  MVP_ALLOWED_ROOM_TYPES,
  MVP_ROOM_LOCKED_CODE,
  STYLES,
  PALETTES,
} from "../../src/lib/dizajnFormSchema.js";

// ─── Generators ──────────────────────────────────────────────────────────────

/**
 * Room types that are valid whitelist members but NOT in the MVP-allowed
 * subset. Derived dynamically so the test tracks any future change to
 * `MVP_ALLOWED_ROOM_TYPES` without edits.
 */
const LOCKED_ROOM_TYPES = ROOM_TYPES.filter(
  (rt) => !(MVP_ALLOWED_ROOM_TYPES as readonly string[]).includes(rt),
);

const lockedRoomTypeArb = fc.constantFrom(...LOCKED_ROOM_TYPES);
const styleArb = fc.constantFrom(...STYLES);
const paletteArb = fc.constantFrom(...PALETTES);

/**
 * Dimensions chosen so the derived area (width × length / 10 000) is well
 * above the largest per-room minimum (apartment = 18 м²). 500..800 cm per side
 * yields 25..64 м², so `checkMinArea` never fires `room_too_small` and the MVP
 * lock is isolated as the sole rejection cause.
 */
const sideCmArb = fc.integer({ min: 500, max: 800 });
const heightCmArb = fc.integer({ min: 220, max: 350 });
const budgetArb = fc.integer({ min: 50_000, max: 5_000_000 });

const lockedRequestArb = fc.record({
  roomType: lockedRoomTypeArb,
  style: styleArb,
  palette: paletteArb,
  widthCm: sideCmArb,
  lengthCm: sideCmArb,
  heightCm: heightCmArb,
  budget: budgetArb,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Flagship Property 7: MVP room lock rejects non-allowed room types", () => {
  it("self-check: the locked subset is non-empty (otherwise the property is vacuous)", () => {
    assert.ok(
      LOCKED_ROOM_TYPES.length >= 1,
      `expected at least one locked room type; ROOM_TYPES=${JSON.stringify(
        ROOM_TYPES,
      )} MVP_ALLOWED=${JSON.stringify(MVP_ALLOWED_ROOM_TYPES)}`,
    );
  });

  it("rejects every locked room type with code `mvp_room_locked`", () => {
    fc.assert(
      fc.property(lockedRequestArb, (fields) => {
        // Mirror the multipart contract: all text fields arrive as strings.
        const body: Record<string, string> = {
          roomType: fields.roomType,
          style: fields.style,
          palette: fields.palette,
          widthCm: String(fields.widthCm),
          lengthCm: String(fields.lengthCm),
          heightCm: String(fields.heightCm),
          budget: String(fields.budget),
        };

        const result = validateGenerateRequest(body, null);

        // The request must be rejected …
        assert.equal(
          result.ok,
          false,
          `expected rejection for locked roomType="${fields.roomType}", got ok=true`,
        );
        if (result.ok) return;

        // … and the rejection must carry the MVP-lock code on `roomType`.
        const codes = result.violations.map((v) => v.code);
        assert.ok(
          codes.includes(MVP_ROOM_LOCKED_CODE),
          `expected a "${MVP_ROOM_LOCKED_CODE}" violation for roomType="${
            fields.roomType
          }", got codes=${JSON.stringify(codes)}`,
        );

        const lockViolation = result.violations.find(
          (v) => v.code === MVP_ROOM_LOCKED_CODE,
        );
        assert.equal(
          lockViolation?.path,
          "roomType",
          `MVP lock violation should point at "roomType", got "${lockViolation?.path}"`,
        );
      }),
      { numRuns: 200 },
    );
  });

  it("does NOT raise `mvp_room_locked` for the allowed room type (bedroom control)", () => {
    fc.assert(
      fc.property(
        fc.record({
          roomType: fc.constantFrom(...MVP_ALLOWED_ROOM_TYPES),
          style: styleArb,
          palette: paletteArb,
          widthCm: sideCmArb,
          lengthCm: sideCmArb,
          heightCm: heightCmArb,
          budget: budgetArb,
        }),
        (fields) => {
          const body: Record<string, string> = {
            roomType: fields.roomType,
            style: fields.style,
            palette: fields.palette,
            widthCm: String(fields.widthCm),
            lengthCm: String(fields.lengthCm),
            heightCm: String(fields.heightCm),
            budget: String(fields.budget),
          };

          const result = validateGenerateRequest(body, null);
          const codes = result.ok
            ? []
            : result.violations.map((v) => v.code);
          assert.ok(
            !codes.includes(MVP_ROOM_LOCKED_CODE),
            `allowed roomType="${fields.roomType}" must not be MVP-locked, got codes=${JSON.stringify(
              codes,
            )}`,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
