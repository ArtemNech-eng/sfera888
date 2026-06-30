// Feature: ai-design-flagship, Property 16: Pending page polls until a terminal status
/**
 * Property test for the `Pending_Page` polling predicate.
 *
 * Property 16: Pending page polls until a terminal status.
 *
 * **Validates: Requirements 2.8**
 *
 * Module under test (pure predicate, no React / browser runtime needed):
 *   - `shouldContinuePolling(status)`
 *   - `NON_TERMINAL_STATUS`
 *   from `artifacts/marketplace/components/dizajn/shouldContinuePolling.ts`
 *   (task 9.3).
 *
 * Requirement 2.8: WHILE a `Design_Project` is still being generated
 *   (`Generation_Status === "generating"`) the `Pending_Page` keeps polling;
 *   once the status reaches a terminal value (`completed`, `failed`, or any
 *   other non-`generating` status) polling stops.
 *
 * The property: for any `Generation_Status` — across the full `DesignStatus`
 * space plus arbitrary junk strings — `shouldContinuePolling` returns `true`
 * iff the status is the single non-terminal value (`generating`), and `false`
 * for every terminal status (`completed`, `failed`, and any other status).
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import type { DesignStatus } from "../../../marketplace/lib/types.js";
import * as pollingNs from "../../../marketplace/components/dizajn/shouldContinuePolling.js";

// `shouldContinuePolling.ts` is authored as ESM but lives in the marketplace
// package, which has no `"type": "module"` (it's a Next.js app, CJS by
// default). Under the api-server ESM test loader its named exports may
// collapse onto the module's `default` (module.exports). Normalise both
// shapes so the pure predicate is accessed the same way regardless of loader.
type PollingModule =
  typeof import("../../../marketplace/components/dizajn/shouldContinuePolling.js");
const polling = ((pollingNs as { default?: PollingModule }).default ??
  (pollingNs as unknown as PollingModule));
const { shouldContinuePolling, NON_TERMINAL_STATUS } = polling;

// ─── Generators ──────────────────────────────────────────────────────────────

// The full `DesignStatus` space (mirror of the union in marketplace/lib/types).
const ALL_DESIGN_STATUSES: DesignStatus[] = [
  "draft",
  "generating",
  "completed",
  "failed",
  "private",
];

// The single non-terminal status: only here is there anything left to wait for.
const NON_TERMINAL: DesignStatus = "generating";

// Every other declared status is terminal from the Pending_Page's POV.
const TERMINAL_STATUSES = ALL_DESIGN_STATUSES.filter((s) => s !== NON_TERMINAL);

const designStatusArb = fc.constantFrom(...ALL_DESIGN_STATUSES);

// Arbitrary junk strings — anything that is *not* the non-terminal status,
// including near-misses (casing, whitespace) and unrelated free text.
const junkStringArb = fc
  .string()
  .filter((s) => s !== NON_TERMINAL);

// Full input space: known statuses ∪ arbitrary strings.
const anyStatusArb = fc.oneof(designStatusArb, junkStringArb);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Pending_Page Property 16: polls until a terminal status", () => {
  // -----------------------------------------------------------------------
  // Property 16 — the core biconditional.
  // Validates: Requirements 2.8
  // -----------------------------------------------------------------------
  it("returns true iff status is the non-terminal value, across the full status space plus junk", () => {
    fc.assert(
      fc.property(anyStatusArb, (status) => {
        const result = shouldContinuePolling(status as DesignStatus);
        assert.equal(
          result,
          status === NON_TERMINAL_STATUS,
          `shouldContinuePolling(${JSON.stringify(status)}) must equal ` +
            `(status === "${NON_TERMINAL_STATUS}")`,
        );
      }),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 16 (focused) — the only true case is `generating`.
  // Validates: Requirements 2.8
  // -----------------------------------------------------------------------
  it("keeps polling only for the non-terminal status", () => {
    assert.equal(NON_TERMINAL_STATUS, "generating");
    assert.equal(shouldContinuePolling("generating"), true);
  });

  // -----------------------------------------------------------------------
  // Property 16 (terminal) — every declared terminal status stops polling.
  // Validates: Requirements 2.8
  // -----------------------------------------------------------------------
  it("stops polling for every terminal DesignStatus (completed, failed, draft, private)", () => {
    fc.assert(
      fc.property(fc.constantFrom(...TERMINAL_STATUSES), (status) => {
        assert.equal(
          shouldContinuePolling(status),
          false,
          `terminal status "${status}" must stop polling`,
        );
      }),
      { numRuns: 100 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 16 (junk) — arbitrary non-`generating` strings are terminal.
  // Validates: Requirements 2.8
  // -----------------------------------------------------------------------
  it("stops polling for arbitrary non-`generating` strings", () => {
    fc.assert(
      fc.property(junkStringArb, (status) => {
        assert.equal(
          shouldContinuePolling(status as DesignStatus),
          false,
          `junk status ${JSON.stringify(status)} must stop polling`,
        );
      }),
      { numRuns: 200 },
    );
  });
});
