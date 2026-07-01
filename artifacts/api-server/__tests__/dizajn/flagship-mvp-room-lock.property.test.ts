/**
 * Property test for room-type acceptance in the AI_Design_Flagship
 * generation-request validator.
 *
 * Feature: ai-design-flagship, Property 7 (RETIRED): the MVP room lock has been
 * lifted by product decision — ALL whitelist room types are now accepted, so
 * `mvp_room_locked` never fires for a valid `Room_Type`. Originally
 * Requirement 6.2 restricted the MVP to `bedroom`; `MVP_ALLOWED_ROOM_TYPES` now
 * covers every `ROOM_TYPES` value.
 *
 * Module under test:
 *   - `validateGenerateRequest(body, photo)` from
 *     `artifacts/api-server/src/lib/dizajnFormSchema.ts`
 *
 * Property (current):
 *   *For any* `Room_Type` in the whitelist, with every other field valid, the
 *   `Generate_Endpoint` does NOT reject with `mvp_room_locked`.
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

const roomTypeArb = fc.constantFrom(...ROOM_TYPES);
const styleArb = fc.constantFrom(...STYLES);
const paletteArb = fc.constantFrom(...PALETTES);

// Dimensions chosen so the derived area is well above the largest per-room
// minimum (apartment = 18 м²): 500..800 cm per side → 25..64 м².
const sideCmArb = fc.integer({ min: 500, max: 800 });
const heightCmArb = fc.integer({ min: 220, max: 350 });
const budgetArb = fc.integer({ min: 50_000, max: 5_000_000 });

const validRequestArb = fc.record({
  roomType: roomTypeArb,
  style: styleArb,
  palette: paletteArb,
  widthCm: sideCmArb,
  lengthCm: sideCmArb,
  heightCm: heightCmArb,
  budget: budgetArb,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Flagship Property 7 (retired lock): all whitelist rooms are accepted", () => {
  it("MVP_ALLOWED_ROOM_TYPES now covers every ROOM_TYPES (lock retired)", () => {
    for (const rt of ROOM_TYPES) {
      assert.ok(
        (MVP_ALLOWED_ROOM_TYPES as readonly string[]).includes(rt),
        `${rt} must be allowed`,
      );
    }
  });

  it("does NOT raise `mvp_room_locked` for any whitelist room type", () => {
    fc.assert(
      fc.property(validRequestArb, (fields) => {
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

        // Every otherwise-valid room must be accepted now.
        assert.equal(
          result.ok,
          true,
          `expected acceptance for roomType="${fields.roomType}", got ok=false`,
        );

        const codes = result.ok ? [] : result.violations.map((v) => v.code);
        assert.ok(
          !codes.includes(MVP_ROOM_LOCKED_CODE),
          `roomType="${fields.roomType}" must not be MVP-locked, got codes=${JSON.stringify(
            codes,
          )}`,
        );
      }),
      { numRuns: 200 },
    );
  });
});
