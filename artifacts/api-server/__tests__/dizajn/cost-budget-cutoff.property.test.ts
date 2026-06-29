/**
 * Feature: ai-design-3d-blockout, Property 22
 *
 * Property test for `Cost_Budget` cutoff in `lib/designCostGuard.ts`.
 *
 * Property 22: Отсечка по бюджету прекращает вызовы провайдера.
 *
 * **Validates: Requirements 12.5**
 *
 * Requirement 12.5 (3D-blockout): IF суммарная стоимость вызовов
 * `Depth_ControlNet_Provider` превышает верхнюю границу `Cost_Budget`, THEN
 * `Blockout_Pipeline` SHALL прекращать дальнейшие вызовы провайдера и
 * сообщать о превышении.
 *
 * Module under test:
 *   - `CostBudget` / `createCostBudget` / `CostBudgetExceededError`
 *     from `artifacts/api-server/src/lib/designCostGuard.ts`.
 *
 * Contract verified here (mirrors the orchestrator loop documented in the
 * `CostBudget` JSDoc — `ensureWithinBudget()` is called BEFORE every provider
 * call, `record()` after it):
 *
 *   For any upper bound `limit` and any sequence of provider call costs, the
 *   orchestrator loop calls `ensureWithinBudget()` before each provider call
 *   and `record()` after it. As soon as the accumulated recorded cost exceeds
 *   `limit` (strict `>`), the very next `ensureWithinBudget()` throws
 *   `CostBudgetExceededError`, no further `record()` happens, and the error /
 *   `report()` surfaces the overage (`spentKopeks` / `limitKopeks`).
 *
 *   Equality (`spent === limit`) is allowed — the limit is a ceiling, not a
 *   strict bound — so a sequence that never strictly exceeds `limit` runs to
 *   completion without throwing.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// `designCostGuard.ts` imports `@workspace/db`, which **throws** at module-eval
// time when `DATABASE_URL` is missing (it constructs a pg.Pool). Static
// `import` declarations are hoisted above regular code, so set a fake DSN here
// and pull the module in via a dynamic `await import(...)` below. The pool is
// lazy — none of the properties here run a query (the in-memory `CostBudget`
// never touches the DB).
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

const { createCostBudget, CostBudgetExceededError } = await import(
  "../../src/lib/designCostGuard.ts"
);

// ─── Generators ──────────────────────────────────────────────────────────────

// Upper bound of Cost_Budget in kopeks. 0 is meaningful ("no provider call
// allowed once anything is spent"); the upper edge spans realistic budgets.
const limitArb = fc.integer({ min: 0, max: 6000 });

// A sequence of provider call costs in kopeks. Non-negative integers model the
// real input space (a provider call — including an NSFW refusal — never costs a
// negative amount). Allowing 0 exercises the "free" native step. The cost range
// is wide enough that arbitrary prefixes both stay under and shoot past typical
// limits, so fast-check explores both the "runs to completion" and the
// "cut off mid-sequence" branches.
const costsArb = fc.array(fc.integer({ min: 0, max: 2000 }), {
  minLength: 0,
  maxLength: 25,
});

// ─── Reference model ──────────────────────────────────────────────────────────

interface RunOutcome {
  /** Number of provider calls that actually recorded a cost. */
  calls: number;
  /** Accumulated recorded cost in kopeks at the point the loop ended. */
  spent: number;
  /**
   * Whether the guard threw — i.e. the cutoff actively blocked a *remaining*
   * provider call. Note this is distinct from "ended over budget": if the very
   * last cost pushes the total over `limit` there is no further call to block,
   * so the loop completes without throwing even though `spent > limit`.
   */
  threw: boolean;
}

/**
 * Independent reference implementation of the orchestrator loop. Mirrors
 * `ensureWithinBudget()` (throws iff `spent > limit`) and `record()` (accrues
 * each cost) without touching the module under test, so the property has an
 * oracle to compare against.
 */
function modelRun(limit: number, costs: readonly number[]): RunOutcome {
  let spent = 0;
  let calls = 0;
  for (const cost of costs) {
    // Guard BEFORE the provider call.
    if (spent > limit) {
      return { calls, spent, threw: true };
    }
    spent += cost; // costs here are already non-negative integers
    calls += 1;
  }
  return { calls, spent, threw: false };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Cost_Budget Property 22: budget cutoff stops provider calls", () => {
  // -----------------------------------------------------------------------
  // Property 22 — cutoff fires exactly when accumulated cost exceeds the
  // upper bound; no further provider call (record) happens afterwards, and
  // the overage is reported.
  // Validates: Requirements 12.5
  // -----------------------------------------------------------------------
  it("stops the loop the moment accumulated cost exceeds the limit and reports the overage", () => {
    fc.assert(
      fc.property(limitArb, costsArb, (limit, costs) => {
        const budget = createCostBudget(limit);
        const expected = modelRun(limit, costs);

        let recordedCalls = 0;
        let thrown: unknown = null;
        // The accumulated spend observed *before* each recorded provider call.
        const spentBeforeEachCall: number[] = [];

        for (const cost of costs) {
          try {
            budget.ensureWithinBudget();
          } catch (err) {
            thrown = err;
            break; // cutoff: no further record() — the provider is never called
          }
          // Provider call succeeded → account for its cost.
          spentBeforeEachCall.push(budget.totalKopeks);
          budget.record(cost);
          recordedCalls += 1;
        }

        // The real guard and the reference model must agree on how many
        // provider calls happened, on the accumulated spend, and on whether
        // the cutoff actively blocked a remaining call.
        assert.equal(
          recordedCalls,
          expected.calls,
          `recorded ${recordedCalls} calls, model expected ${expected.calls} ` +
            `(limit=${limit}, costs=${JSON.stringify(costs)})`,
        );
        assert.equal(budget.calls, expected.calls);
        assert.equal(budget.totalKopeks, expected.spent);
        assert.equal(thrown !== null, expected.threw);

        // Core invariant (Req 12.5): every provider call that actually ran was
        // started while still within budget — no call is made once the
        // accumulated cost has already exceeded the ceiling.
        for (const spentBefore of spentBeforeEachCall) {
          assert.ok(
            spentBefore <= limit,
            `a provider call ran with spentBefore=${spentBefore} > limit=${limit}`,
          );
        }

        if (thrown !== null) {
          // Cutoff path: a remaining call was blocked. The guard threw the
          // typed error strictly above the limit and surfaces the overage.
          assert.ok(
            thrown instanceof CostBudgetExceededError,
            `expected CostBudgetExceededError, got ${String(thrown)}`,
          );
          const e = thrown as CostBudgetExceededError;
          assert.equal(e.limitKopeks, limit);
          assert.equal(e.spentKopeks, budget.totalKopeks);
          assert.ok(
            e.spentKopeks > e.limitKopeks,
            `cutoff must report spent (${e.spentKopeks}) > limit (${e.limitKopeks})`,
          );
          // The error message mentions the overage — actual spend and limit.
          assert.ok(e.message.includes(String(e.spentKopeks)));
          assert.ok(e.message.includes(String(e.limitKopeks)));
        }

        // `exceeded` and `report()` are consistent with the accumulated spend
        // regardless of whether a further call was there to be blocked. When
        // over budget, the report flags the overage and names spend + limit.
        const overBudget = budget.totalKopeks > limit;
        assert.equal(budget.exceeded, overBudget);
        const report = budget.report();
        assert.ok(report.includes(String(budget.totalKopeks)));
        assert.ok(report.includes(String(limit)));
        assert.equal(
          report.includes("ПРЕВЫШЕН"),
          overBudget,
          `report() overage flag must match exceeded=${overBudget}, got: ${report}`,
        );
      }),
      { numRuns: 300 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 22 — once the budget is exceeded, EVERY subsequent
  // ensureWithinBudget() keeps throwing (the cutoff is sticky: the provider
  // is never called again, no matter how many more steps remain).
  // Validates: Requirements 12.5
  // -----------------------------------------------------------------------
  it("keeps blocking every further provider call after the budget is exceeded", () => {
    fc.assert(
      fc.property(
        limitArb,
        // At least one cost guaranteed to push strictly over the limit.
        fc.integer({ min: 1, max: 4000 }),
        fc.integer({ min: 1, max: 10 }),
        (limit, overshoot, extraChecks) => {
          const budget = createCostBudget(limit);

          // First call is always allowed (spent = 0 <= limit).
          budget.ensureWithinBudget();
          // Record a cost that pushes strictly above the ceiling.
          budget.record(limit + overshoot);
          assert.ok(budget.totalKopeks > limit);
          assert.equal(budget.exceeded, true);

          // From now on, the guard must throw on every attempt and no
          // additional cost may be recorded.
          const callsBefore = budget.calls;
          const spentBefore = budget.totalKopeks;
          for (let i = 0; i < extraChecks; i += 1) {
            assert.throws(
              () => budget.ensureWithinBudget(),
              CostBudgetExceededError,
              `guard must keep throwing on attempt #${i + 1}`,
            );
          }
          // No record() ran, so the accumulator is untouched.
          assert.equal(budget.calls, callsBefore);
          assert.equal(budget.totalKopeks, spentBefore);
        },
      ),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 22 (boundary) — spent === limit is allowed: the ceiling is not
  // a strict bound, so the guard does NOT cut off at exact equality.
  // Validates: Requirements 12.5
  // -----------------------------------------------------------------------
  it("does not cut off when accumulated cost equals the limit exactly", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 6000 }), (limit) => {
        const budget = createCostBudget(limit);
        budget.ensureWithinBudget(); // spent 0 <= limit
        budget.record(limit); // spent === limit
        assert.equal(budget.totalKopeks, limit);
        assert.equal(budget.exceeded, false);
        // Equality is allowed → the next guard call must not throw.
        assert.doesNotThrow(() => budget.ensureWithinBudget());
      }),
      { numRuns: 100 },
    );
  });
});
