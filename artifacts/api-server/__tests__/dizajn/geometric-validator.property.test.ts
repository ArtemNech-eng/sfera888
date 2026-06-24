/**
 * Property tests for `validateLayout` (Geometric_Validator post-Layout phase).
 *
 *   Property 7: Geometric_Validator detects out-of-room, intersection and
 *               door blockage.
 *   Property 8: Geometric_Validator finds 60-cm path to functional items.
 *
 * Validates: Requirements 2.4, 2.5, 2.6
 *
 * The fixture room is a fixed bedroom 400×400×270 with the door on the south
 * wall (offsetCm=155, widthCm=90). That door places its 60×60 cm clearance
 * zone at x∈[170, 230], y∈[340, 400]. Tests perturb a known-valid layout —
 * push items outside the room, force overlaps, drop items into the door
 * clearance, or seal off `bed`/`wardrobe` from the door — and assert the
 * validator surfaces the corresponding violation code.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import {
  validateLayout,
  type FurnitureItem,
  type RoomDims,
  type ValidationViolation,
} from "../../src/lib/geometricValidator.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/**
 * Bedroom 400×400×270 with the door on the south wall and a 90 cm opening
 * centred at x = 200 cm. Identical setup is reused across all subtests so
 * the door clearance zone has a known position.
 */
function defaultRoom(): RoomDims {
  return {
    widthCm: 400,
    lengthCm: 400,
    heightCm: 270,
    roomType: "bedroom",
    doorWall: "south",
    doorOffsetCm: 155,
    doorWidthCm: 90,
    windowWall: "north",
    windowOffsetCm: 100,
    windowWidthCm: 200,
  };
}

function makeItem(overrides: Partial<FurnitureItem> & { id: string }): FurnitureItem {
  return {
    type: "rug",
    widthCm: 100,
    depthCm: 100,
    heightCm: 5,
    xCm: 0,
    yCm: 0,
    rotationDeg: 0,
    ...overrides,
  } as FurnitureItem;
}

function violationCodes(violations: ValidationViolation[]): string[] {
  return violations.map((v) => v.code);
}

// ---------------------------------------------------------------------------
// Property 7 — OUT_OF_ROOM / INTERSECTS / BLOCKS_DOOR detection
// ---------------------------------------------------------------------------

describe("validateLayout — Property 7: detects OUT_OF_ROOM / INTERSECTS / BLOCKS_DOOR", () => {
  // -------------------------------------------------------------------------
  // Test 1 — items pushed entirely outside the room must produce OUT_OF_ROOM.
  // We sample placements far past each wall on either axis. A non-functional
  // type (`rug`) is used so the BFS path-checker does not introduce spurious
  // NO_PATH_TO_FUNCTIONAL_ITEM violations from an out-of-grid AABB.
  // -------------------------------------------------------------------------
  it("any item placed entirely outside the room produces OUT_OF_ROOM", () => {
    type Placement = { xCm: number; yCm: number; widthCm: number; depthCm: number };

    const farEast: fc.Arbitrary<Placement> = fc.record({
      xCm: fc.integer({ min: 410, max: 700 }),
      yCm: fc.integer({ min: 0, max: 350 }),
      widthCm: fc.integer({ min: 30, max: 100 }),
      depthCm: fc.integer({ min: 30, max: 100 }),
    });
    const farWest: fc.Arbitrary<Placement> = fc.record({
      xCm: fc.integer({ min: -700, max: -110 }),
      yCm: fc.integer({ min: 0, max: 350 }),
      widthCm: fc.integer({ min: 30, max: 100 }),
      depthCm: fc.integer({ min: 30, max: 100 }),
    });
    const farSouth: fc.Arbitrary<Placement> = fc.record({
      xCm: fc.integer({ min: 0, max: 350 }),
      yCm: fc.integer({ min: 410, max: 700 }),
      widthCm: fc.integer({ min: 30, max: 100 }),
      depthCm: fc.integer({ min: 30, max: 100 }),
    });
    const farNorth: fc.Arbitrary<Placement> = fc.record({
      xCm: fc.integer({ min: 0, max: 350 }),
      yCm: fc.integer({ min: -700, max: -110 }),
      widthCm: fc.integer({ min: 30, max: 100 }),
      depthCm: fc.integer({ min: 30, max: 100 }),
    });

    fc.assert(
      fc.property(fc.oneof(farEast, farWest, farSouth, farNorth), (p) => {
        const room = defaultRoom();
        const result = validateLayout(room, [
          makeItem({
            id: "outside",
            type: "rug",
            widthCm: p.widthCm,
            depthCm: p.depthCm,
            xCm: p.xCm,
            yCm: p.yCm,
          }),
        ]);

        assert.equal(result.ok, false);
        assert.ok(
          violationCodes(result.violations).includes("OUT_OF_ROOM"),
          `expected OUT_OF_ROOM in ${JSON.stringify(violationCodes(result.violations))} ` +
            `for placement ${JSON.stringify(p)}`,
        );
      }),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // Test 2 — two AABBs overlapping by strictly more than 1 cm on both axes
  // must produce INTERSECTS. We place item A inside the room, then drop B
  // such that its top-left corner sits `(aw - ox, ad - oy)` cm into A,
  // guaranteeing (ox × oy) cm of overlap with ox, oy ≥ 2.
  // -------------------------------------------------------------------------
  it("two items overlapping by > 1 cm on both axes produce INTERSECTS", () => {
    fc.assert(
      fc.property(
        fc.record({
          ax: fc.integer({ min: 10, max: 240 }),
          ay: fc.integer({ min: 10, max: 100 }), // keep inside room and away from south door
          aw: fc.integer({ min: 40, max: 100 }),
          ad: fc.integer({ min: 40, max: 100 }),
          bw: fc.integer({ min: 40, max: 100 }),
          bd: fc.integer({ min: 40, max: 100 }),
          ox: fc.integer({ min: 2, max: 30 }),
          oy: fc.integer({ min: 2, max: 30 }),
        }),
        ({ ax, ay, aw, ad, bw, bd, ox, oy }) => {
          // B starts at (ax + aw - ox, ay + ad - oy). With ox < min(aw, bw) and
          // oy < min(ad, bd) this guarantees an `ox × oy` cm overlap on both axes.
          const bx = ax + aw - ox;
          const by = ay + ad - oy;

          // Skip generated cases where B would slip out of the room (those are
          // not overlap-pathological — they would correctly emit OUT_OF_ROOM).
          fc.pre(bx + bw <= 380 && by + bd <= 250);

          const room = defaultRoom();
          const result = validateLayout(room, [
            makeItem({
              id: "a",
              type: "rug",
              widthCm: aw,
              depthCm: ad,
              xCm: ax,
              yCm: ay,
            }),
            makeItem({
              id: "b",
              type: "rug",
              widthCm: bw,
              depthCm: bd,
              xCm: bx,
              yCm: by,
            }),
          ]);

          assert.equal(result.ok, false);
          const codes = violationCodes(result.violations);
          assert.ok(
            codes.includes("INTERSECTS"),
            `expected INTERSECTS in ${JSON.stringify(codes)} for ` +
              `A=(${ax},${ay},${aw}×${ad}) B=(${bx},${by},${bw}×${bd})`,
          );
          // The INTERSECTS row must reference both items.
          const inter = result.violations.find((v) => v.code === "INTERSECTS")!;
          assert.deepEqual([...inter.itemIds].sort(), ["a", "b"]);
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // Test 3 — items dropped fully inside the south-door 60×60 cm clearance
  // zone (x∈[170, 230], y∈[340, 400]) must produce BLOCKS_DOOR. The item is
  // sized 10×10 cm so the AABB stays inside the clearance regardless of the
  // sampled top-left corner.
  // -------------------------------------------------------------------------
  it("item dropped inside the door clearance produces BLOCKS_DOOR", () => {
    fc.assert(
      fc.property(
        fc.record({
          xCm: fc.integer({ min: 175, max: 220 }),
          yCm: fc.integer({ min: 345, max: 390 }),
        }),
        ({ xCm, yCm }) => {
          const room = defaultRoom();
          const result = validateLayout(room, [
            makeItem({
              id: "blocker",
              type: "rug",
              widthCm: 10,
              depthCm: 10,
              xCm,
              yCm,
            }),
          ]);

          assert.equal(result.ok, false);
          const codes = violationCodes(result.violations);
          assert.ok(
            codes.includes("BLOCKS_DOOR"),
            `expected BLOCKS_DOOR in ${JSON.stringify(codes)} for ` +
              `item at (${xCm}, ${yCm})`,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // Sanity floor — a known-valid layout (bed + wardrobe with clear corridor)
  // must NOT trigger OUT_OF_ROOM / INTERSECTS / BLOCKS_DOOR. This guards
  // against the validator over-rejecting (false positives), without which the
  // tests above would pass trivially against an "always fails" implementation.
  // -------------------------------------------------------------------------
  it("a clean bed+wardrobe layout has none of OUT_OF_ROOM/INTERSECTS/BLOCKS_DOOR", () => {
    const room = defaultRoom();
    const result = validateLayout(room, [
      makeItem({
        id: "bed",
        type: "bed",
        widthCm: 160,
        depthCm: 200,
        heightCm: 50,
        xCm: 20,
        yCm: 20,
      }),
      makeItem({
        id: "wardrobe",
        type: "wardrobe",
        widthCm: 100,
        depthCm: 60,
        heightCm: 220,
        xCm: 280,
        yCm: 20,
      }),
    ]);
    const codes = violationCodes(result.violations);
    assert.ok(!codes.includes("OUT_OF_ROOM"), `unexpected OUT_OF_ROOM: ${JSON.stringify(result.violations)}`);
    assert.ok(!codes.includes("INTERSECTS"), `unexpected INTERSECTS: ${JSON.stringify(result.violations)}`);
    assert.ok(!codes.includes("BLOCKS_DOOR"), `unexpected BLOCKS_DOOR: ${JSON.stringify(result.violations)}`);
  });
});

// ---------------------------------------------------------------------------
// Property 8 — BFS-based 60-cm path to functional items
// ---------------------------------------------------------------------------

describe("validateLayout — Property 8: 60-cm path to functional items", () => {
  // -------------------------------------------------------------------------
  // Case A — empty bedroom with bed in a corner and wardrobe on the opposite
  // wall, leaving a wide corridor. The validator must not raise any
  // path-related violation, and the overall result must be ok=true.
  // -------------------------------------------------------------------------
  it("empty room with bed+wardrobe and clear corridor: ok=true (no path violations)", () => {
    const room = defaultRoom();
    const result = validateLayout(room, [
      makeItem({
        id: "bed",
        type: "bed",
        widthCm: 160,
        depthCm: 200,
        heightCm: 50,
        xCm: 20,
        yCm: 20,
      }),
      makeItem({
        id: "wardrobe",
        type: "wardrobe",
        widthCm: 100,
        depthCm: 60,
        heightCm: 220,
        xCm: 280,
        yCm: 20,
      }),
    ]);
    assert.equal(result.ok, true, `expected ok=true, got ${JSON.stringify(result.violations)}`);
  });

  // -------------------------------------------------------------------------
  // Case B — single small obstacle in the room centre that does NOT block
  // either functional item. With wardrobe on the east wall and bed on the
  // west wall, a 60×60 chair in the middle still leaves > 60 cm corridors on
  // either side, so the path check must pass.
  // -------------------------------------------------------------------------
  it("single non-blocking obstacle near the middle: ok=true", () => {
    const room = defaultRoom();
    const result = validateLayout(room, [
      makeItem({
        id: "bed",
        type: "bed",
        widthCm: 160,
        depthCm: 200,
        heightCm: 50,
        xCm: 20,
        yCm: 20,
      }),
      makeItem({
        id: "wardrobe",
        type: "wardrobe",
        widthCm: 100,
        depthCm: 60,
        heightCm: 220,
        xCm: 280,
        yCm: 20,
      }),
      makeItem({
        id: "ottoman",
        type: "rug",
        widthCm: 60,
        depthCm: 60,
        heightCm: 40,
        xCm: 200,
        yCm: 240,
      }),
    ]);
    assert.equal(
      result.ok,
      true,
      `expected ok=true with single non-blocking obstacle, got ${JSON.stringify(result.violations)}`,
    );
  });

  // -------------------------------------------------------------------------
  // Case C — the bed is fenced off by a full-height cabinet wall that runs
  // across the room with no gap. The bed sits in the isolated west pocket
  // with no 60-cm corridor leading to the door, so the BFS must surface
  // NO_PATH_TO_FUNCTIONAL_ITEM for the bed (the wardrobe stays reachable).
  // -------------------------------------------------------------------------
  it("bed sealed off by a full-height cabinet: NO_PATH_TO_FUNCTIONAL_ITEM for bed", () => {
    const room = defaultRoom();
    const result = validateLayout(room, [
      makeItem({
        id: "bed",
        type: "bed",
        widthCm: 100,
        depthCm: 100,
        heightCm: 50,
        xCm: 10,
        yCm: 10,
      }),
      // 5×400 cabinet running full N-S, splitting the room into a sealed
      // west pocket (where the bed lives) and the east half with the door.
      makeItem({
        id: "wall_cabinet",
        type: "cabinet",
        widthCm: 5,
        depthCm: 400,
        heightCm: 220,
        xCm: 130,
        yCm: 0,
      }),
      makeItem({
        id: "wardrobe",
        type: "wardrobe",
        widthCm: 100,
        depthCm: 60,
        heightCm: 220,
        xCm: 280,
        yCm: 20,
      }),
    ]);

    assert.equal(result.ok, false);
    const noPath = result.violations.filter(
      (v) => v.code === "NO_PATH_TO_FUNCTIONAL_ITEM",
    );
    assert.ok(
      noPath.some((v) => v.itemIds.includes("bed")),
      `expected NO_PATH_TO_FUNCTIONAL_ITEM for "bed", got ${JSON.stringify(result.violations)}`,
    );
  });

  // -------------------------------------------------------------------------
  // Case D — the wardrobe sits far from the door (north wall) but a wide
  // corridor on the east side keeps it reachable. ok=true expected.
  // -------------------------------------------------------------------------
  it("wardrobe far from door but with a wide corridor: ok=true", () => {
    const room = defaultRoom();
    const result = validateLayout(room, [
      makeItem({
        id: "bed",
        type: "bed",
        widthCm: 160,
        depthCm: 200,
        heightCm: 50,
        xCm: 20,
        yCm: 100,
      }),
      makeItem({
        id: "wardrobe",
        type: "wardrobe",
        widthCm: 120,
        depthCm: 60,
        heightCm: 220,
        xCm: 250,
        yCm: 20,
      }),
    ]);
    assert.equal(
      result.ok,
      true,
      `expected ok=true for far wardrobe, got ${JSON.stringify(result.violations)}`,
    );
  });

  // -------------------------------------------------------------------------
  // Case E — door is fully boxed in by a row of cabinets along the south
  // wall, leaving no 60-cm clearance in front of it. The validator must
  // raise at least PATH_TOO_NARROW (door corridor) or BLOCKS_DOOR; either
  // way `ok` must be false.
  // -------------------------------------------------------------------------
  it("door corridor narrowed below 60 cm: ok=false with PATH_TOO_NARROW or BLOCKS_DOOR", () => {
    const room = defaultRoom();
    const result = validateLayout(room, [
      makeItem({
        id: "bed",
        type: "bed",
        widthCm: 160,
        depthCm: 200,
        heightCm: 50,
        xCm: 20,
        yCm: 20,
      }),
      makeItem({
        id: "wardrobe",
        type: "wardrobe",
        widthCm: 100,
        depthCm: 60,
        heightCm: 220,
        xCm: 280,
        yCm: 20,
      }),
      // Ottoman pushed into the door clearance zone.
      makeItem({
        id: "ottoman",
        type: "rug",
        widthCm: 50,
        depthCm: 50,
        heightCm: 40,
        xCm: 180,
        yCm: 350,
      }),
    ]);
    assert.equal(result.ok, false);
    const codes = violationCodes(result.violations);
    assert.ok(
      codes.includes("PATH_TOO_NARROW") || codes.includes("BLOCKS_DOOR"),
      `expected PATH_TOO_NARROW or BLOCKS_DOOR, got ${JSON.stringify(codes)}`,
    );
  });
});
