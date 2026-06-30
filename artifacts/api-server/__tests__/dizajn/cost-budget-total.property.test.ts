/**
 * Property test for Cost_Budget total accounting.
 *
 * Feature: ai-design-3d-blockout, Property 21
 *
 * Property 21: Суммарная стоимость равна сумме вызовов провайдера.
 *
 * **Validates: Requirements 12.4**
 *
 * Module under test:
 *   - `CostBudget` / `createCostBudget` from
 *     `artifacts/api-server/src/lib/designCostGuard.ts`
 *
 * Property verified here:
 *   For any sequence of `Depth_ControlNet_Provider` calls with known costs,
 *   the reported total cost in kopeks (`totalKopeks`) equals the sum of
 *   `costKopeks` of all `record()`ed calls — including calls that ended in an
 *   NSFW refusal (which are recorded the same way). The budget limit is set
 *   high enough that no cutoff interferes with pure accumulation.
 *
 *   `CostBudget.record()` sanitizes non-finite / non-positive costs to 0, so
 *   the generators below produce finite non-negative integers. Under that
 *   input space `record()` is the identity on the cost value and the total is
 *   exactly the arithmetic sum.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// ─── Fake env BEFORE any production import ───────────────────────────────────
//
// `designCostGuard.ts` transitively imports `@workspace/db`, which instantiates
// a `pg.Pool` from `DATABASE_URL` at module-load time (and `objectStorage.ts`
// builds an S3 client from the R2_* vars). Neither connects eagerly, but their
// presence checks throw without env. Static `import` statements are hoisted and
// would run before any env assignment, so the module is loaded via a dynamic
// `import` *after* the env is seeded (mirrors the flagship dizajn tests).
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";
process.env.R2_ENDPOINT = process.env.R2_ENDPOINT ?? "https://fake.r2.dev";
process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? "fake-key";
process.env.R2_SECRET_ACCESS_KEY =
  process.env.R2_SECRET_ACCESS_KEY ?? "fake-secret";
process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID =
  process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? "fake-bucket";

const { createCostBudget } = await import("../../src/lib/designCostGuard.js");

// ─── Generators ──────────────────────────────────────────────────────────────

// A single call cost: finite, non-negative integer kopeks. Capped well below
// the budget so the per-call value never individually trips the cutoff, and so
// the running total over a bounded sequence stays under the high limit used in
// the test (no cutoff interferes with the pure-sum property).
const callCostArb = fc.integer({ min: 0, max: 1_000 });

// A sequence of provider calls. `maxLength: 64` * `max: 1_000` = 64_000 max
// total, comfortably under the 10_000_000-kopek limit set below.
const callSequenceArb = fc.array(callCostArb, { minLength: 0, maxLength: 64 });

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Cost_Budget Property 21: total equals sum of provider calls", () => {
  // -----------------------------------------------------------------------
  // Property 21 — totalKopeks == sum(costKopeks) over all recorded calls.
  // Validates: Requirement 12.4
  // -----------------------------------------------------------------------
  it("totalKopeks equals the arithmetic sum of all recorded call costs", () => {
    fc.assert(
      fc.property(callSequenceArb, (costs) => {
        // High limit so the cutoff (Req 12.5) never interferes with pure
        // accumulation — we are isolating the totalling behaviour (Req 12.4).
        const budget = createCostBudget(10_000_000);

        for (const cost of costs) {
          budget.record(cost);
        }

        const expected = costs.reduce((acc, c) => acc + c, 0);

        assert.equal(
          budget.totalKopeks,
          expected,
          `totalKopeks=${budget.totalKopeks} != sum=${expected} for ${JSON.stringify(costs)}`,
        );
        // Every call is counted (including any that would have been NSFW
        // refusals — they go through the same record() path).
        assert.equal(
          budget.calls,
          costs.length,
          `calls=${budget.calls} != ${costs.length}`,
        );
      }),
      { numRuns: 300 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 21 — incremental record() return value tracks the running sum,
  // and the final return equals totalKopeks. This pins the "reported total"
  // to the accumulated sum at every step (Req 12.4).
  // -----------------------------------------------------------------------
  it("record() returns the running total at each step, matching totalKopeks", () => {
    fc.assert(
      fc.property(callSequenceArb, (costs) => {
        const budget = createCostBudget(10_000_000);

        let running = 0;
        for (const cost of costs) {
          running += cost;
          const returned = budget.record(cost);
          assert.equal(
            returned,
            running,
            `record() returned ${returned}, expected running total ${running}`,
          );
        }

        assert.equal(budget.totalKopeks, running);
      }),
      { numRuns: 200 },
    );
  });
});
