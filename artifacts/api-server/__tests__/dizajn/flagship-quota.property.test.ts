// Feature: ai-design-flagship, Property 12: Successful start consumes exactly one quota unit
/**
 * Property test for client-side Free_Quota consumption.
 *
 * Property 12: Successful start consumes exactly one quota unit.
 *
 * **Validates: Requirements 8.4**
 *
 * Module under test (pure helpers, no React runtime needed):
 *   - `recordUsage(state)`       — quota state transition on HTTP 202
 *   - `computeRemaining(limit, used)` — non-negative remainder arithmetic
 *   - `deriveQuota(state)`       — projection to { limit, remaining, canGenerate }
 *   from `artifacts/marketplace/lib/useGenerationQuota.ts` (task 7.1).
 *
 * Requirement 8.4: WHEN генерация успешно стартовала (статус 202),
 *   THE AI_Design_Flagship SHALL списать одну единицу из `Free_Quota`.
 * Requirement 8.5 (context): `Free_Quota` is a UX trigger; `remaining` is
 *   `max(0, limit - used)` and never goes negative.
 *
 * The property: for any starting Free_Quota state, recording a successful
 * generation increases `used` by exactly one and decreases `remaining` by
 * exactly one — but never below zero.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import * as quotaNs from "../../../marketplace/lib/useGenerationQuota.js";
import type {
  StoredQuota,
  QuotaTier,
} from "../../../marketplace/lib/useGenerationQuota.js";

// `useGenerationQuota.ts` is authored as ESM but lives in the marketplace
// package, which has no `"type": "module"` (it's a Next.js app, CJS by
// default). Under the api-server ESM test loader its named exports therefore
// collapse onto the module's `default` (module.exports). Normalise both
// shapes so the pure helpers are accessed the same way regardless of loader.
type QuotaModule = typeof import("../../../marketplace/lib/useGenerationQuota.js");
const quota = ((quotaNs as { default?: QuotaModule }).default ??
  (quotaNs as unknown as QuotaModule));
const { recordUsage, deriveQuota, computeRemaining } = quota;

// ─── Generators ──────────────────────────────────────────────────────────────

const tierArb: fc.Arbitrary<QuotaTier> = fc.constantFrom("anon", "pro");

// `used` is generated across a range that brackets both tier limits
// (FREE_ANON = 1, PRO_GENERATIONS = 100) so the property exercises:
//   • fresh state (used = 0, remaining > 0),
//   • the exhaustion boundary (used = limit),
//   • already-exhausted state (used > limit, remaining clamped at 0).
const storedQuotaArb: fc.Arbitrary<StoredQuota> = fc.record({
  used: fc.integer({ min: 0, max: 150 }),
  tier: tierArb,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Free_Quota Property 12: successful start consumes exactly one quota unit", () => {
  // -----------------------------------------------------------------------
  // Property 12 — the core invariant.
  // Validates: Requirements 8.4
  // -----------------------------------------------------------------------
  it("recording a 202 increases `used` by one and drops `remaining` by one (never below zero)", () => {
    fc.assert(
      fc.property(storedQuotaArb, (state) => {
        const before = deriveQuota(state);
        const next = recordUsage(state);
        const after = deriveQuota(next);

        // `used` increases by exactly one.
        assert.equal(
          next.used,
          state.used + 1,
          `used must increase by exactly 1: ${state.used} -> ${next.used}`,
        );

        // Tier is never mutated by a usage record.
        assert.equal(next.tier, state.tier, "tier must not change");

        // `limit` depends only on tier, which is unchanged.
        assert.equal(after.limit, before.limit, "limit must not change");

        // `remaining` decreases by exactly one, clamped at zero — i.e. it
        // never goes negative even when the quota was already exhausted.
        assert.equal(
          after.remaining,
          Math.max(0, before.remaining - 1),
          `remaining must drop by one (never below zero): ` +
            `${before.remaining} -> ${after.remaining}`,
        );

        // remaining is always non-negative.
        assert.ok(after.remaining >= 0, "remaining must never be negative");
      }),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 12 (focused) — when quota is available, the decrement is exact.
  // Validates: Requirements 8.4
  // -----------------------------------------------------------------------
  it("when `remaining > 0` before the start, `remaining` decreases by exactly one", () => {
    fc.assert(
      fc.property(storedQuotaArb, (state) => {
        const before = deriveQuota(state);
        fc.pre(before.remaining > 0); // only states with quota to spend

        const after = deriveQuota(recordUsage(state));
        assert.equal(
          after.remaining,
          before.remaining - 1,
          `with quota available, remaining must decrease by exactly one: ` +
            `${before.remaining} -> ${after.remaining}`,
        );
      }),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 12 (boundary) — an exhausted quota stays at zero.
  // Validates: Requirements 8.4, 8.5
  // -----------------------------------------------------------------------
  it("an already-exhausted quota stays at zero remaining after another start", () => {
    fc.assert(
      fc.property(storedQuotaArb, (state) => {
        const before = deriveQuota(state);
        fc.pre(before.remaining === 0); // already exhausted

        const after = deriveQuota(recordUsage(state));
        assert.equal(after.remaining, 0, "remaining must stay clamped at 0");
      }),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------------
  // computeRemaining arithmetic is consistent with the decrement invariant.
  // Validates: Requirements 8.4
  // -----------------------------------------------------------------------
  it("computeRemaining is consistent: remaining(limit, used+1) == max(0, remaining(limit, used) - 1)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 150 }),
        fc.integer({ min: 0, max: 150 }),
        (limit, used) => {
          const before = computeRemaining(limit, used);
          const after = computeRemaining(limit, used + 1);
          assert.equal(after, Math.max(0, before - 1));
          assert.ok(after >= 0, "computeRemaining must never be negative");
        },
      ),
      { numRuns: 200 },
    );
  });
});
