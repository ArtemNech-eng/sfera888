// Feature: ai-design-flagship, Property 11: Exhausted free quota opens the paywall instead of generating
/**
 * Property test for the client-side Free_Quota → Paywall_Modal gate that
 * guards `Flagship_Form` submission.
 *
 * Property 11: Exhausted free quota opens the paywall instead of generating.
 *
 * **Validates: Requirements 8.3**
 *
 * Requirement 8.3 (design.md → "Flagship_Form (клиент)", "Поведение submit"):
 *   2. Если `Free_Quota.canGenerate === false` → открыть `Paywall_Modal`, **не** отправлять.
 *
 * The real `Flagship_Form.onSubmit` (artifacts/marketplace/app/dizajn/_FlagshipForm.tsx)
 * applies this gate verbatim as its first decision after clearing errors:
 *
 *     if (quota.ready && !quota.canGenerate) {
 *       setPaywallOpen(true);
 *       return;            // <- no FormData built, no fetch("/api/dizajn/generate")
 *     }
 *
 * Since the marketplace app has no React/jsdom test harness (api-server runs
 * the pure-helper property suite under `tsx --test`), this test exercises the
 * *real* quota projection — `deriveQuota` from `useGenerationQuota.ts` — to
 * decide `canGenerate`, and drives it through a faithful, side-effect-tracking
 * reproduction of the submit gate above (`simulateSubmitGate`). A `fetch` spy
 * stands in for the network call so the property can assert that *no*
 * generation request is issued when the quota is exhausted.
 *
 * The property: for any Free_Quota state whose remaining count is zero,
 * submitting opens the Paywall_Modal and issues no generation request.
 *
 * Run via:
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
const { deriveQuota, FREE_ANON, PRO_GENERATIONS } = quota;

// ─── Submit-gate reproduction ─────────────────────────────────────────────────

interface SubmitGateOutcome {
  /** Did the gate open the Paywall_Modal? */
  paywallOpened: boolean;
  /** Was a generation request issued (fetch called)? */
  fetchCalled: boolean;
}

/**
 * Faithful reproduction of the first decision in `Flagship_Form.onSubmit`.
 *
 * Mirrors the real component line-for-line: the quota gate runs *before* any
 * `FormData` assembly or `fetch("/api/dizajn/generate")`. `canGenerate` is the
 * real value produced by `deriveQuota` (the same projection the hook returns),
 * so the only thing reproduced here is the trivial branch + early return.
 */
function simulateSubmitGate(state: StoredQuota, ready: boolean): SubmitGateOutcome {
  let paywallOpened = false;
  let fetchCalled = false;

  const { canGenerate } = deriveQuota(state);

  // ── 2. Гейт квоты (Requirement 8.3): исчерпана → Paywall, не отправляем ──
  if (ready && !canGenerate) {
    paywallOpened = true;
    return { paywallOpened, fetchCalled };
  }

  // Past the gate the form would build FormData and POST to the proxy. The
  // network call is the observable side effect Property 11 forbids when the
  // quota is exhausted, so we record it here as the spy.
  fetchCalled = true;
  return { paywallOpened, fetchCalled };
}

// ─── Generators ────────────────────────────────────────────────────────────────

const tierArb: fc.Arbitrary<QuotaTier> = fc.constantFrom("anon", "pro");

/**
 * States whose `remaining` is exactly zero, across both tiers:
 *   • anon — limit = FREE_ANON (1)         → exhausted at used ≥ 1
 *   • pro  — limit = PRO_GENERATIONS (100) → exhausted at used ≥ 100
 * `used` ranges past the limit to also cover the over-spent / clamped case.
 */
const exhaustedQuotaArb: fc.Arbitrary<StoredQuota> = tierArb.chain((tier) => {
  const limit = tier === "pro" ? PRO_GENERATIONS : FREE_ANON;
  return fc.record({
    tier: fc.constant(tier),
    used: fc.integer({ min: limit, max: limit + 50 }),
  });
});

/** States with quota still available (`remaining > 0`) — the contrast case. */
const availableQuotaArb: fc.Arbitrary<StoredQuota> = tierArb.chain((tier) => {
  const limit = tier === "pro" ? PRO_GENERATIONS : FREE_ANON;
  return fc.record({
    tier: fc.constant(tier),
    used: fc.integer({ min: 0, max: limit - 1 }),
  });
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Free_Quota Property 11: exhausted free quota opens the paywall instead of generating", () => {
  // -----------------------------------------------------------------------
  // Property 11 — the core invariant.
  // Validates: Requirements 8.3
  // -----------------------------------------------------------------------
  it("a zero-remaining quota opens the Paywall_Modal and issues no generation request", () => {
    fc.assert(
      fc.property(exhaustedQuotaArb, (state) => {
        // Sanity: the real projection agrees the quota is exhausted.
        const { remaining, canGenerate } = deriveQuota(state);
        assert.equal(remaining, 0, "fixture precondition: remaining must be 0");
        assert.equal(canGenerate, false, "exhausted quota must not allow generation");

        // The quota is known (`ready`) — the only situation in which the form
        // can assert the count is zero.
        const outcome = simulateSubmitGate(state, true);

        assert.equal(
          outcome.paywallOpened,
          true,
          "exhausted quota must open the Paywall_Modal",
        );
        assert.equal(
          outcome.fetchCalled,
          false,
          "exhausted quota must NOT issue a generation request",
        );
      }),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 11 (contrast) — "instead of generating": with quota available,
  // the gate does NOT open the paywall and the request proceeds.
  // Validates: Requirements 8.3
  // -----------------------------------------------------------------------
  it("a quota with remaining > 0 proceeds to generate without opening the paywall", () => {
    fc.assert(
      fc.property(availableQuotaArb, (state) => {
        const { remaining, canGenerate } = deriveQuota(state);
        assert.ok(remaining > 0, "fixture precondition: remaining must be > 0");
        assert.equal(canGenerate, true, "available quota must allow generation");

        const outcome = simulateSubmitGate(state, true);

        assert.equal(
          outcome.paywallOpened,
          false,
          "available quota must not open the Paywall_Modal",
        );
        assert.equal(
          outcome.fetchCalled,
          true,
          "available quota must proceed to a generation request",
        );
      }),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 11 (boundary) — the gate keys on `canGenerate`, never on tier.
  // An exhausted PRO quota is paywalled exactly like an exhausted anon one.
  // Validates: Requirements 8.3
  // -----------------------------------------------------------------------
  it("the gate depends only on remaining===0, independent of tier", () => {
    fc.assert(
      fc.property(exhaustedQuotaArb, (state) => {
        const outcome = simulateSubmitGate(state, true);
        // Same outcome regardless of whether tier is "anon" or "pro".
        assert.deepEqual(outcome, { paywallOpened: true, fetchCalled: false });
      }),
      { numRuns: 200 },
    );
  });
});
