/**
 * Property test for AI_Design_Product Cost_Guard / pipeline status semantics
 * (`lib/designCostGuard.ts` + `lib/designConfig.ts`).
 *
 * Property 22: Pipeline status semantics with Cost_Ceiling guard.
 *
 * **Validates: Requirements 14.1, 14.2, 14.3, 14.5, 14.6, 14.7**
 *
 * Module under test:
 *   - `enforceCostCeiling(designId)` and `BudgetExceededError` from
 *     `artifacts/api-server/src/lib/designCostGuard.ts`
 *   - `getCostCeilingKopeks()` and `DEFAULT_COST_CEILING_KOPEKS` from
 *     `artifacts/api-server/src/lib/designConfig.ts`
 *
 * Strategy: this file covers three of the five sub-properties listed in the
 * design doc.
 *
 *   • 22.1 — `getCostCeilingKopeks()` env handling. Pure function over
 *     `process.env.DESIGN_COST_CEILING_KOPEKS`. Each property restores the
 *     env in a finally-block so the test order does not leak state.
 *   • 22.2 — `BudgetExceededError` shape. Construct-and-introspect — no IO.
 *   • 22.3 — `enforceCostCeiling()` semantics. The guard runs a single
 *     `db.select(...).from(...).where(...)` against `design_generations`
 *     and compares the SUM with `getCostCeilingKopeks()`. We monkey-patch
 *     `db.select` to return a controlled SUM, mirroring the same approach
 *     `rate-limiter.property.test.ts` and `real-estimate.property.test.ts`
 *     use elsewhere.
 *
 *   • 22.4 (required-vs-optional step membership) is already covered by
 *     `worker-fsm.property.test.ts` (task 15.2), which exercises
 *     `STEPS_REQUIRED` ∪ `STEPS_OPTIONAL` partitioning. Skipped here to
 *     avoid duplication, per the task brief.
 *   • 22.5 (`current_step` resets to null on `completed`) is end-to-end
 *     worker behaviour. Driving the full FSM through fast-check would
 *     require mocking the AI / R2 / DB surface in its entirety, which is
 *     out of scope. Documented as covered by integration tests.
 *
 * `@workspace/db` opens a `pg.Pool` at module load and demands DATABASE_URL,
 * so we point it at a fake DSN before the dynamic import. The pool stays
 * lazy: every test in this file routes through the `db.select` monkey-patch
 * before any real query would be issued.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// `@workspace/db` requires DATABASE_URL at module load time; supply a fake
// connection string BEFORE triggering its import. The pg.Pool does not
// connect eagerly, so this is harmless — every property below short-circuits
// through the mocked `db.select`.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

const dbModule = await import("@workspace/db");
const { db } = dbModule;

// ─── db.select mock ────────────────────────────────────────────────────────
//
// `enforceCostCeiling` calls `db.select({...}).from(designGenerationsTable)
// .where(eq(designGenerationsTable.designId, designId))` and `await`s the
// returned thenable for one row of `{ spentKopeks: number }`. We replace
// `db.select` with a thin chain whose `where(...)` resolves to the value
// `mockSpent` (kopeks). `null` is returned to exercise the empty-table
// branch (SUM(NULL) → COALESCE → 0).

let mockSpent: number | null = 0;

(db as unknown as { select: unknown }).select = (..._args: unknown[]) => ({
  from: (_table: unknown) => ({
    where: (_pred: unknown) =>
      Promise.resolve([
        {
          // Mirror Drizzle's behaviour for `sql<number>` mappings: when the
          // SQL is `COALESCE(SUM(...), 0)::int`, the driver hands back a
          // string (Postgres `numeric`). The implementation already calls
          // `Number(row?.spentKopeks ?? 0)`, so feeding either a number or
          // a string is fine; we feed numbers because that's what the
          // `::int` cast produces in practice.
          spentKopeks: mockSpent,
        },
      ]),
  }),
});

const designCostGuardModule = await import(
  "../../src/lib/designCostGuard.ts"
);
const { enforceCostCeiling, BudgetExceededError } = designCostGuardModule;

const designConfigModule = await import("../../src/lib/designConfig.ts");
const { getCostCeilingKopeks, DEFAULT_COST_CEILING_KOPEKS } =
  designConfigModule;

// Helper for property 22.1: run `body` with `DESIGN_COST_CEILING_KOPEKS` set
// to the supplied value (or unset for `undefined`), then unconditionally
// restore the original. fast-check shrinks aggressively, so even a single
// thrown assertion mid-iteration would otherwise leak the env into the rest
// of the suite.
function withEnv<T>(
  raw: string | undefined,
  body: () => T,
): T {
  const ENV_KEY = "DESIGN_COST_CEILING_KOPEKS";
  const previous = process.env[ENV_KEY];
  try {
    if (raw === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = raw;
    }
    return body();
  } finally {
    if (previous === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = previous;
    }
  }
}

// ─── Property 22.1 — getCostCeilingKopeks env handling ─────────────────────
//
// Validates: Requirement 14.5
//
// The env knob feeds the budget guard. Garbage values must NOT crash the
// worker — they fall back to `DEFAULT_COST_CEILING_KOPEKS = 10000`. The exact
// fallback table is fixed by the implementation (`parseIntSafe` rejects
// floats and non-decimal strings; negatives explicit-fail; 0 allowed).

describe("designConfig — Property 22.1: getCostCeilingKopeks env handling", () => {
  // Validates: Requirement 14.5

  it("DEFAULT_COST_CEILING_KOPEKS is the documented 10000-kopeks (100 ₽) ceiling", () => {
    // Bumped from the original 3000 ($0.30) to 10000 (100 ₽) to fit the
    // identity-preserving edit-image budget: hero(high) + 3×edit(high)
    // (ai-design-quality-fix design §F). 10000 is the current source of truth.
    assert.equal(DEFAULT_COST_CEILING_KOPEKS, 10000);
  });

  it("undefined env → DEFAULT_COST_CEILING_KOPEKS", () => {
    withEnv(undefined, () => {
      assert.equal(getCostCeilingKopeks(), DEFAULT_COST_CEILING_KOPEKS);
    });
  });

  it("empty string → DEFAULT_COST_CEILING_KOPEKS", () => {
    withEnv("", () => {
      assert.equal(getCostCeilingKopeks(), DEFAULT_COST_CEILING_KOPEKS);
    });
  });

  it("whitespace-only env → DEFAULT_COST_CEILING_KOPEKS", () => {
    withEnv("   ", () => {
      assert.equal(getCostCeilingKopeks(), DEFAULT_COST_CEILING_KOPEKS);
    });
  });

  it("non-integer string ('abc') → DEFAULT_COST_CEILING_KOPEKS", () => {
    withEnv("abc", () => {
      assert.equal(getCostCeilingKopeks(), DEFAULT_COST_CEILING_KOPEKS);
    });
  });

  it("decimal string ('12.5') → DEFAULT_COST_CEILING_KOPEKS (parseInt strict, not float)", () => {
    withEnv("12.5", () => {
      assert.equal(getCostCeilingKopeks(), DEFAULT_COST_CEILING_KOPEKS);
    });
  });

  it("negative integer ('-100') → DEFAULT_COST_CEILING_KOPEKS", () => {
    withEnv("-100", () => {
      assert.equal(getCostCeilingKopeks(), DEFAULT_COST_CEILING_KOPEKS);
    });
  });

  it("'0' → 0 (allowed for staging dry-runs)", () => {
    withEnv("0", () => {
      assert.equal(getCostCeilingKopeks(), 0);
    });
  });

  it("'5000' → 5000", () => {
    withEnv("5000", () => {
      assert.equal(getCostCeilingKopeks(), 5000);
    });
  });

  it("for any non-negative integer string, getCostCeilingKopeks returns that integer", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        (value) => {
          withEnv(String(value), () => {
            assert.equal(getCostCeilingKopeks(), value);
          });
        },
      ),
      { numRuns: 100 },
    );
  });

  it("for any negative integer string, getCostCeilingKopeks falls back to default", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: -1 }),
        (value) => {
          withEnv(String(value), () => {
            assert.equal(
              getCostCeilingKopeks(),
              DEFAULT_COST_CEILING_KOPEKS,
            );
          });
        },
      ),
      { numRuns: 50 },
    );
  });

  it("for any string containing a non-digit char, getCostCeilingKopeks falls back to default", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 12 })
          // Skip the degenerate case where the random string happens to be
          // a valid integer literal — we want to exercise the fallback.
          .filter((s) => !/^-?\d+$/.test(s.trim())),
        (raw) => {
          withEnv(raw, () => {
            assert.equal(
              getCostCeilingKopeks(),
              DEFAULT_COST_CEILING_KOPEKS,
            );
          });
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 22.2 — BudgetExceededError shape ─────────────────────────────
//
// Validates: Requirements 14.5, 14.6, 14.7
//
// The error must carry enough structured information to:
//   - flag the row as `failed` with `error_message` mentioning the kopeks
//     count (Requirement 14.6, 14.5);
//   - allow the worker to log `design_id` and the cost-at-failure
//     (Requirement 14.7);
//   - be reliably caught by `instanceof BudgetExceededError` across module
//     boundaries (the constructor calls `Object.setPrototypeOf` for this).

describe("designCostGuard — Property 22.2: BudgetExceededError shape", () => {
  // Validates: Requirements 14.5, 14.6, 14.7

  const designIdArb = fc.integer({ min: 1, max: 1_000_000 });
  const kopeksArb = fc.integer({ min: 0, max: 1_000_000 });

  it("instanceof BudgetExceededError and instanceof Error", () => {
    fc.assert(
      fc.property(designIdArb, kopeksArb, kopeksArb, (designId, spent, limit) => {
        const err = new BudgetExceededError(designId, spent, limit);
        assert.ok(err instanceof BudgetExceededError, "instanceof self");
        assert.ok(err instanceof Error, "instanceof Error");
      }),
      { numRuns: 100 },
    );
  });

  it("public readonly fields preserve constructor arguments", () => {
    fc.assert(
      fc.property(designIdArb, kopeksArb, kopeksArb, (designId, spent, limit) => {
        const err = new BudgetExceededError(designId, spent, limit);
        assert.equal(err.designId, designId);
        assert.equal(err.spentKopeks, spent);
        assert.equal(err.limitKopeks, limit);
      }),
      { numRuns: 100 },
    );
  });

  it("error.name === 'BudgetExceededError'", () => {
    const err = new BudgetExceededError(1, 0, 0);
    assert.equal(err.name, "BudgetExceededError");
  });

  it("error.message mentions the spent kopeks count (Requirement 14.6)", () => {
    fc.assert(
      fc.property(designIdArb, kopeksArb, kopeksArb, (designId, spent, limit) => {
        const err = new BudgetExceededError(designId, spent, limit);
        assert.ok(typeof err.message === "string");
        assert.ok(
          err.message.includes(String(spent)),
          `error.message must mention spent=${spent}, got: ${err.message}`,
        );
      }),
      { numRuns: 50 },
    );
  });

  it("survives a 'thrown then caught' round-trip (prototype chain restored)", () => {
    // `extends Error` in TS targeting older runtimes is famous for breaking
    // `instanceof` after a throw/catch. The constructor calls
    // `Object.setPrototypeOf(this, BudgetExceededError.prototype)` to fix
    // that. Smoke-test the round-trip explicitly so regression is caught.
    fc.assert(
      fc.property(designIdArb, kopeksArb, kopeksArb, (designId, spent, limit) => {
        try {
          throw new BudgetExceededError(designId, spent, limit);
        } catch (caught) {
          assert.ok(
            caught instanceof BudgetExceededError,
            "instanceof must survive throw/catch",
          );
          assert.ok(caught instanceof Error);
          const e = caught as InstanceType<typeof BudgetExceededError>;
          assert.equal(e.designId, designId);
          assert.equal(e.spentKopeks, spent);
          assert.equal(e.limitKopeks, limit);
        }
      }),
      { numRuns: 50 },
    );
  });
});

// ─── Property 22.3 — enforceCostCeiling semantics ──────────────────────────
//
// Validates: Requirements 14.3, 14.5, 14.6, 14.7
//
// Three branches:
//   - spent < limit  → returns `spent`, no throw.
//   - spent === limit → returns `spent`, no throw (limit is a ceiling, not
//     a strict-less-than). The guard says "превысила Cost_Ceiling" in
//     Requirement 14.5 — boundary case is allowed.
//   - spent > limit  → throws BudgetExceededError with correct fields.
//
// Plus an empty-table case: SUM(NULL) → 0 via COALESCE, returns 0.

describe("designCostGuard — Property 22.3: enforceCostCeiling semantics", () => {
  // Validates: Requirements 14.3, 14.5, 14.6, 14.7

  const designIdArb = fc.integer({ min: 1, max: 1_000_000 });
  const limitArb = fc.integer({ min: 0, max: 100_000 });

  it("spent < limit → returns spent, does not throw", async () => {
    await fc.assert(
      fc.asyncProperty(
        designIdArb,
        // `limit ≥ 1` so `[0..limit-1]` is non-empty. Use a fresh
        // arbitrary that constrains spent ∈ [0, limit-1].
        fc
          .tuple(
            fc.integer({ min: 1, max: 100_000 }),
            fc.integer({ min: 0, max: 100_000 }),
          )
          .filter(([limit, spent]) => spent < limit),
        async (designId, [limit, spent]) => {
          mockSpent = spent;
          await withEnvAsync(String(limit), async () => {
            const result = await enforceCostCeiling(designId);
            assert.equal(result, spent, "should return current spent value");
          });
        },
      ),
      { numRuns: 50 },
    );
  });

  it("spent === limit → returns spent, does not throw (boundary is allowed)", async () => {
    await fc.assert(
      fc.asyncProperty(designIdArb, limitArb, async (designId, limit) => {
        mockSpent = limit;
        await withEnvAsync(String(limit), async () => {
          const result = await enforceCostCeiling(designId);
          assert.equal(result, limit);
        });
      }),
      { numRuns: 50 },
    );
  });

  it("spent > limit → throws BudgetExceededError with correct fields", async () => {
    await fc.assert(
      fc.asyncProperty(
        designIdArb,
        fc
          .tuple(
            fc.integer({ min: 0, max: 100_000 }),
            fc.integer({ min: 1, max: 200_000 }),
          )
          .filter(([limit, spent]) => spent > limit),
        async (designId, [limit, spent]) => {
          mockSpent = spent;
          await withEnvAsync(String(limit), async () => {
            await assert.rejects(
              () => enforceCostCeiling(designId),
              (err: unknown) => {
                assert.ok(
                  err instanceof BudgetExceededError,
                  "must throw BudgetExceededError",
                );
                const e = err as InstanceType<typeof BudgetExceededError>;
                assert.equal(e.designId, designId);
                assert.equal(e.spentKopeks, spent);
                assert.equal(e.limitKopeks, limit);
                return true;
              },
            );
          });
        },
      ),
      { numRuns: 50 },
    );
  });

  it("empty design_generations (mocked SUM=null) → returns 0, does not throw", async () => {
    // The SQL is `COALESCE(SUM(...), 0)::int`, so the implementation never
    // sees `null` from a real driver. But the guard's parsing
    // (`Number(row?.spentKopeks ?? 0)`) tolerates `null` defensively.
    // Exercise that branch by feeding `null` through the mock.
    mockSpent = null;
    await withEnvAsync("3000", async () => {
      const result = await enforceCostCeiling(42);
      assert.equal(result, 0);
    });
  });

  it("uses DEFAULT_COST_CEILING_KOPEKS when env is unset", async () => {
    // Confirms the guard reads the env on every call, not at module load.
    // Pick `spent = DEFAULT - 1` (just under) and `spent = DEFAULT + 1`
    // (just over) to exercise both branches against the default.
    mockSpent = DEFAULT_COST_CEILING_KOPEKS - 1;
    await withEnvAsync(undefined, async () => {
      const ok = await enforceCostCeiling(1);
      assert.equal(ok, DEFAULT_COST_CEILING_KOPEKS - 1);
    });
    mockSpent = DEFAULT_COST_CEILING_KOPEKS + 1;
    await withEnvAsync(undefined, async () => {
      await assert.rejects(
        () => enforceCostCeiling(1),
        BudgetExceededError,
      );
    });
  });
});

// ─── Property 22.4 — Required vs optional step membership ──────────────────
//
// Already covered by `worker-fsm.property.test.ts` (task 15.2), which pins
// `STEPS_REQUIRED` ⊆ `ALL_STEPS`, `STEPS_OPTIONAL` ⊆ `ALL_STEPS`,
// `STEPS_REQUIRED ∩ STEPS_OPTIONAL = ∅` and
// `STEPS_REQUIRED ∪ STEPS_OPTIONAL = ALL_STEPS`. Skipping here to avoid
// duplicate coverage, per the task brief.

// ─── Property 22.5 — current_step resets to null on completion ─────────────
//
// End-to-end behaviour of the FSM body. Driving it through fast-check
// requires mocking the AI / R2 / DB surface in its entirety; that is out
// of scope for a property test and is documented as covered by the
// integration suite.

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Async variant of `withEnv` — keeps the env scoped to one async run. */
async function withEnvAsync<T>(
  raw: string | undefined,
  body: () => Promise<T>,
): Promise<T> {
  const ENV_KEY = "DESIGN_COST_CEILING_KOPEKS";
  const previous = process.env[ENV_KEY];
  try {
    if (raw === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = raw;
    }
    return await body();
  } finally {
    if (previous === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = previous;
    }
  }
}
