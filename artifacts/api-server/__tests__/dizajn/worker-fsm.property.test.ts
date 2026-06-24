/**
 * Property test for the Design_Worker FSM.
 *
 * Property 13: Worker selects one oldest generating row per tick, with
 * watchdog and monotonic progress.
 *
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.7, 15.2**
 *
 * Module under test:
 *   - `artifacts/api-server/src/lib/designWorker.ts` (constants exposed via
 *     `__test__` only; the FSM body itself is private and end-to-end behaviour
 *     is exercised by tasks 15.3 and 15.4).
 *
 * `processDesign` is an 11-step async pipeline with heavy DB / R2 / AI side
 * effects; testing it end-to-end here would require mocking the entire I/O
 * surface and would not actually verify the FSM's *structural* invariants.
 * Instead, this file pins the constants the FSM is built from — step names,
 * progress milestones, required-vs-optional classification, watchdog timeout,
 * tick interval. If any of these silently shift, the runtime contract with
 * the frontend (`current_step`, `progress`) and with the watchdog (10-min
 * timeout, 5-second tick) breaks.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

// `@workspace/db` (imported transitively by `designWorker.ts`) **throws** at
// module-eval time when `DATABASE_URL` is missing, and `objectStorage.ts`
// (also pulled in transitively) eagerly instantiates an S3 client and so
// throws when R2 credentials are missing. Static `import` would hoist those
// loads above any top-of-file env assignment, so we wire fake env vars first
// and then pull in `designWorker.ts` via top-level `await import(...)`.
// Neither pg.Pool nor the S3 client connects eagerly, so dummy values are
// enough — none of the properties in this file actually run a query or hit
// R2.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";
process.env.R2_ENDPOINT =
  process.env.R2_ENDPOINT ?? "https://fake.r2.cloudflarestorage.com";
process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? "fake";
process.env.R2_SECRET_ACCESS_KEY =
  process.env.R2_SECRET_ACCESS_KEY ?? "fake";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

const designWorkerModule = await import("../../src/lib/designWorker.ts");
const { __test__ } = designWorkerModule;

const {
  STEP_LAYOUT_JSON,
  STEP_HERO_RENDER,
  STEP_ANGLE_RENDERS,
  STEP_TOP_DOWN_PLAN,
  STEP_ISOMETRIC_RENDER,
  STEP_DETAIL_CROPS,
  STEP_PICK_FURNITURE,
  STEP_REAL_ESTIMATE,
  STEP_COLOR_PALETTE,
  STEP_AI_TEXT,
  STEP_INFOGRAPHIC,
  ALL_STEPS,
  STEPS_REQUIRED,
  STEPS_OPTIONAL,
  PROGRESS_LAYOUT_JSON,
  PROGRESS_HERO_RENDER,
  PROGRESS_ANGLE_RENDERS,
  PROGRESS_TOP_DOWN_PLAN,
  PROGRESS_ISOMETRIC_RENDER,
  PROGRESS_DETAIL_CROPS,
  PROGRESS_PICK_FURNITURE,
  PROGRESS_REAL_ESTIMATE,
  PROGRESS_COLOR_PALETTE,
  PROGRESS_AI_TEXT,
  PROGRESS_INFOGRAPHIC,
  PROGRESS_COMPLETED,
  PROGRESS_SEQUENCE,
  STUCK_TIMEOUT_MIN,
  TICK_INTERVAL_MS,
} = __test__;

const STEP_NAME_RE = /^[a-z_]+$/;

// =========================================================================
// Property 13.1 — Step-name constants are recognizable strings
// =========================================================================
//
// `current_step` is what the public polling endpoint (`GET /:slug/status`,
// Requirement 5.3) returns to the frontend. Any non-string, mixed-case or
// punctuation-laced value would silently break the UI's i18n table mapping.
// We pin the format to /^[a-z_]+$/ and require uniqueness.

describe("Property 13.1 — step name constants are recognizable strings", () => {
  // Validates: Requirements 5.2, 5.3, 15.2

  const NAMED_STEPS = [
    ["STEP_LAYOUT_JSON",     STEP_LAYOUT_JSON],
    ["STEP_HERO_RENDER",     STEP_HERO_RENDER],
    ["STEP_ANGLE_RENDERS",   STEP_ANGLE_RENDERS],
    ["STEP_TOP_DOWN_PLAN",   STEP_TOP_DOWN_PLAN],
    ["STEP_ISOMETRIC_RENDER",STEP_ISOMETRIC_RENDER],
    ["STEP_DETAIL_CROPS",    STEP_DETAIL_CROPS],
    ["STEP_PICK_FURNITURE",  STEP_PICK_FURNITURE],
    ["STEP_REAL_ESTIMATE",   STEP_REAL_ESTIMATE],
    ["STEP_COLOR_PALETTE",   STEP_COLOR_PALETTE],
    ["STEP_AI_TEXT",         STEP_AI_TEXT],
    ["STEP_INFOGRAPHIC",     STEP_INFOGRAPHIC],
  ] as const;

  it("there are exactly 11 named step constants", () => {
    assert.equal(NAMED_STEPS.length, 11);
    assert.equal(ALL_STEPS.length, 11);
  });

  it("every step name is a non-empty string", () => {
    for (const [label, value] of NAMED_STEPS) {
      assert.equal(typeof value, "string", `${label} must be a string`);
      assert.ok((value as string).length > 0, `${label} must be non-empty`);
    }
  });

  it("every step name matches /^[a-z_]+$/", () => {
    for (const [label, value] of NAMED_STEPS) {
      assert.match(
        value as string,
        STEP_NAME_RE,
        `${label}=${JSON.stringify(value)} must match ${STEP_NAME_RE}`,
      );
    }
  });

  it("step names are unique (no two constants alias to the same string)", () => {
    const seen = new Set<string>();
    for (const [label, value] of NAMED_STEPS) {
      assert.equal(
        seen.has(value as string),
        false,
        `${label}=${JSON.stringify(value)} duplicates an earlier step name`,
      );
      seen.add(value as string);
    }
    assert.equal(seen.size, NAMED_STEPS.length);
  });

  // Statistical confirmation: any element of ALL_STEPS, randomly picked,
  // is a non-empty lowercase-snake string. fc.constantFrom samples the
  // array uniformly, so a quick-fail counterexample would land on the
  // offending entry within tens of runs.
  it("ALL_STEPS sampled uniformly is always a /^[a-z_]+$/ non-empty string", () => {
    fc.assert(
      fc.property(fc.constantFrom(...ALL_STEPS), (step) => {
        assert.equal(typeof step, "string");
        assert.ok((step as string).length > 0);
        assert.match(step as string, STEP_NAME_RE);
      }),
      { numRuns: 100 },
    );
  });
});

// =========================================================================
// Property 13.2 — Progress milestones are strictly monotonic
// =========================================================================
//
// The FSM updates `designs.progress` after each major step (Requirement 5.2).
// The frontend's progress bar relies on the value never going down within a
// generation; any tweak that swaps two milestones would jolt the bar
// backwards. Strict monotonicity also implicitly guarantees uniqueness.

describe("Property 13.2 — progress milestones are strictly monotonic", () => {
  // Validates: Requirements 5.2, 15.2

  const EXPECTED_SEQUENCE = [
    5, 25, 50, 60, 70, 75, 80, 85, 88, 92, 96, 100,
  ] as const;

  it("PROGRESS_SEQUENCE matches the design.md FSM milestones exactly", () => {
    assert.deepStrictEqual(
      Array.from(PROGRESS_SEQUENCE),
      Array.from(EXPECTED_SEQUENCE),
    );
  });

  it("each named milestone equals its position in the sequence", () => {
    assert.equal(PROGRESS_LAYOUT_JSON, 5);
    assert.equal(PROGRESS_HERO_RENDER, 25);
    assert.equal(PROGRESS_ANGLE_RENDERS, 50);
    assert.equal(PROGRESS_TOP_DOWN_PLAN, 60);
    assert.equal(PROGRESS_ISOMETRIC_RENDER, 70);
    assert.equal(PROGRESS_DETAIL_CROPS, 75);
    assert.equal(PROGRESS_PICK_FURNITURE, 80);
    assert.equal(PROGRESS_REAL_ESTIMATE, 85);
    assert.equal(PROGRESS_COLOR_PALETTE, 88);
    assert.equal(PROGRESS_AI_TEXT, 92);
    assert.equal(PROGRESS_INFOGRAPHIC, 96);
    assert.equal(PROGRESS_COMPLETED, 100);
  });

  it("every milestone is an integer in [0..100]", () => {
    for (const p of PROGRESS_SEQUENCE) {
      assert.ok(
        Number.isInteger(p),
        `progress milestone ${p} must be an integer`,
      );
      assert.ok(p >= 0 && p <= 100, `progress milestone ${p} must be in [0..100]`);
    }
  });

  it("the sequence is strictly ascending: ∀ i, seq[i] < seq[i+1]", () => {
    for (let i = 0; i + 1 < PROGRESS_SEQUENCE.length; i++) {
      const a = PROGRESS_SEQUENCE[i]!;
      const b = PROGRESS_SEQUENCE[i + 1]!;
      assert.ok(
        a < b,
        `progress sequence not strictly ascending at index ${i}: ${a} ≥ ${b}`,
      );
    }
  });

  it("the sequence ends at PROGRESS_COMPLETED = 100", () => {
    assert.equal(
      PROGRESS_SEQUENCE[PROGRESS_SEQUENCE.length - 1],
      PROGRESS_COMPLETED,
    );
    assert.equal(PROGRESS_COMPLETED, 100);
  });

  // For any two distinct indices i < j sampled uniformly, seq[i] < seq[j].
  // This is the same as strict monotonicity above but framed as the property
  // that justifies "monotonic progress" in design.md.
  it("for any i<j sampled uniformly, seq[i] < seq[j]", () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 0, max: PROGRESS_SEQUENCE.length - 1 }),
          fc.integer({ min: 0, max: PROGRESS_SEQUENCE.length - 1 }),
        ),
        ([a, b]) => {
          if (a === b) return; // trivially equal
          const [lo, hi] = a < b ? [a, b] : [b, a];
          assert.ok(
            PROGRESS_SEQUENCE[lo]! < PROGRESS_SEQUENCE[hi]!,
            `seq[${lo}]=${PROGRESS_SEQUENCE[lo]} ≥ seq[${hi}]=${PROGRESS_SEQUENCE[hi]}`,
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});

// =========================================================================
// Property 13.3 — Required vs optional step lists partition ALL_STEPS
// =========================================================================
//
// Requirement 14.1 splits the 11 steps into 4 required (their failure aborts
// the project) and 7 optional (their failure degrades but never aborts).
// `STEPS_REQUIRED ∪ STEPS_OPTIONAL = ALL_STEPS` and the two are disjoint.
// Forgetting a step in either list would silently change the failure
// semantics for that step.

describe("Property 13.3 — STEPS_REQUIRED and STEPS_OPTIONAL partition ALL_STEPS", () => {
  // Validates: Requirements 5.2, 14.1, 15.2

  it("STEPS_REQUIRED has exactly the 4 mandatory steps from Requirement 14.1", () => {
    const expected = new Set<string>([
      STEP_LAYOUT_JSON,
      STEP_HERO_RENDER,
      STEP_REAL_ESTIMATE,
      STEP_AI_TEXT,
    ]);
    assert.equal(STEPS_REQUIRED.length, 4);
    assert.deepStrictEqual(new Set<string>(STEPS_REQUIRED), expected);
  });

  it("STEPS_OPTIONAL has exactly the 7 optional steps", () => {
    const expected = new Set<string>([
      STEP_ANGLE_RENDERS,
      STEP_TOP_DOWN_PLAN,
      STEP_ISOMETRIC_RENDER,
      STEP_DETAIL_CROPS,
      STEP_PICK_FURNITURE,
      STEP_COLOR_PALETTE,
      STEP_INFOGRAPHIC,
    ]);
    assert.equal(STEPS_OPTIONAL.length, 7);
    assert.deepStrictEqual(new Set<string>(STEPS_OPTIONAL), expected);
  });

  it("STEPS_REQUIRED ∩ STEPS_OPTIONAL = ∅", () => {
    const required = new Set<string>(STEPS_REQUIRED);
    for (const step of STEPS_OPTIONAL) {
      assert.equal(
        required.has(step),
        false,
        `step ${step} appears in both STEPS_REQUIRED and STEPS_OPTIONAL`,
      );
    }
  });

  it("STEPS_REQUIRED ∪ STEPS_OPTIONAL = ALL_STEPS (as sets)", () => {
    const union = new Set<string>([...STEPS_REQUIRED, ...STEPS_OPTIONAL]);
    const all = new Set<string>(ALL_STEPS);
    assert.deepStrictEqual(union, all);
  });

  it("|STEPS_REQUIRED| + |STEPS_OPTIONAL| = |ALL_STEPS| (no duplicates)", () => {
    assert.equal(
      STEPS_REQUIRED.length + STEPS_OPTIONAL.length,
      ALL_STEPS.length,
    );
  });

  // Sampling property: any step picked from ALL_STEPS lives in exactly one
  // of the two classification lists.
  it("any step picked from ALL_STEPS is in exactly one of {required, optional}", () => {
    fc.assert(
      fc.property(fc.constantFrom(...ALL_STEPS), (step) => {
        const inRequired = (STEPS_REQUIRED as readonly string[]).includes(
          step,
        );
        const inOptional = (STEPS_OPTIONAL as readonly string[]).includes(
          step,
        );
        // XOR: exactly one membership.
        assert.notEqual(
          inRequired,
          inOptional,
          `step ${step} membership: required=${inRequired}, optional=${inOptional}`,
        );
      }),
      { numRuns: 100 },
    );
  });
});

// =========================================================================
// Property 13.4 — Watchdog timeout
// =========================================================================
//
// Requirement 5.7 fixes the watchdog at 10 minutes. Lowering it would flap
// long-running but otherwise healthy pipelines into `failed`; raising it
// would let stuck records linger, blocking the worker's single-row-per-tick
// invariant (Requirement 5.1).

describe("Property 13.4 — STUCK_TIMEOUT_MIN is fixed at 10 minutes", () => {
  // Validates: Requirement 5.7

  it("STUCK_TIMEOUT_MIN === 10", () => {
    assert.equal(STUCK_TIMEOUT_MIN, 10);
  });

  it("STUCK_TIMEOUT_MIN is a positive integer", () => {
    assert.ok(Number.isInteger(STUCK_TIMEOUT_MIN));
    assert.ok((STUCK_TIMEOUT_MIN as number) > 0);
  });
});

// =========================================================================
// Property 13.5 — Tick interval
// =========================================================================
//
// Requirement 5.1 fixes the worker tick at 5 seconds. The frontend's polling
// of `GET /:slug/status` is calibrated against this (3-second poll vs
// 5-second tick — Requirement 5.4).

describe("Property 13.5 — TICK_INTERVAL_MS is fixed at 5000 ms", () => {
  // Validates: Requirement 5.1

  it("TICK_INTERVAL_MS === 5000", () => {
    assert.equal(TICK_INTERVAL_MS, 5000);
  });

  it("TICK_INTERVAL_MS is a positive integer (milliseconds)", () => {
    assert.ok(Number.isInteger(TICK_INTERVAL_MS));
    assert.ok((TICK_INTERVAL_MS as number) > 0);
  });

  it("TICK_INTERVAL_MS is strictly less than the watchdog timeout", () => {
    // STUCK_TIMEOUT_MIN minutes → ms.
    const watchdogMs = (STUCK_TIMEOUT_MIN as number) * 60 * 1000;
    assert.ok(
      (TICK_INTERVAL_MS as number) < watchdogMs,
      `TICK_INTERVAL_MS=${TICK_INTERVAL_MS} must be strictly less than watchdog=${watchdogMs}ms`,
    );
  });
});

// =========================================================================
// Property 13.6 — Pre-completion invariant: required artifacts MUST exist
// =========================================================================
//
// Background. Test-прогон против Railway prod выявил soft-fail:
//   • design id=18: Layout_Planner на бесплатной модели вернул HTTP 200 с
//     невалидным/пустым JSON. Воркер проглотил это и прошёл оставшиеся
//     шаги по no-layout fallback, в итоге записав `status='completed'`,
//     `is_public=true` с `layout_json=NULL`.
//   • design id=19: Layout_Planner получил HTTP 402. Воркер корректно
//     поставил `status='failed'`, `is_public=false`. Hard-fail работает.
//
// Разное поведение hard-fail vs soft-fail нарушает spec (`design.md`
// Property 14, requirement 6.1-6.5) — Layout_JSON является required
// artifact. После фикса введён инвариант:
//
//   На входе в финальный success UPDATE (status='completed',
//   error_message=NULL, is_public left as-is): для каждого required
//   артефакта { layout, heroPublicUrl, content } этот артефакт MUST
//   быть non-null. Если хоть один null — это всегда баг (сбой required
//   step не привёл к раннему выходу), и `assertCompletionInvariant`
//   throws `RequiredStepFailedError`, которое внешний catch routes в
//   `markFailed` (status='failed', is_public=false).
//
// Этот property test проверяет инвариант на чистом хелпере без I/O.

const { RequiredStepFailedError, assertCompletionInvariant } = __test__ as {
  RequiredStepFailedError: new (...args: unknown[]) => Error;
  assertCompletionInvariant: (state: {
    designId: number;
    layout: unknown;
    heroPublicUrl: unknown;
    content: unknown;
  }) => void;
};

describe("Property 13.6 — completion invariant: required artifacts MUST exist", () => {
  // Validates: Requirements 6.1, 6.5, 14.1, 15.2

  // A minimally valid LayoutJson shape — only the fields the helper looks
  // at (truthy / non-null). The real type is structural; the helper just
  // checks for presence, so a tiny object suffices.
  const VALID_LAYOUT = { room: { roomType: "bedroom" } };
  const VALID_HERO_URL = "/api/marketplace/dizajn/img/results/1_view_1.jpg";
  const VALID_CONTENT = { h1: "Дизайн спальни 12 м²" };

  it("all three required artifacts present → no throw", () => {
    assert.doesNotThrow(() =>
      assertCompletionInvariant({
        designId: 1,
        layout: VALID_LAYOUT,
        heroPublicUrl: VALID_HERO_URL,
        content: VALID_CONTENT,
      }),
    );
  });

  it("layout=null → throws RequiredStepFailedError", () => {
    let captured: unknown = null;
    try {
      assertCompletionInvariant({
        designId: 18,
        layout: null,
        heroPublicUrl: VALID_HERO_URL,
        content: VALID_CONTENT,
      });
      assert.fail("must throw on null layout");
    } catch (e) {
      captured = e;
    }
    assert.ok(
      captured instanceof RequiredStepFailedError,
      "throw must be RequiredStepFailedError",
    );
    assert.equal(
      (captured as { stepName: string }).stepName,
      STEP_LAYOUT_JSON,
      "stepName must be STEP_LAYOUT_JSON",
    );
    assert.equal(
      (captured as { userMessage: string }).userMessage,
      "не удалось получить план комнаты",
      "userMessage must match Requirement 14.1 spec for layout",
    );
  });

  it("heroPublicUrl=null → throws RequiredStepFailedError on STEP_HERO_RENDER", () => {
    let captured: unknown = null;
    try {
      assertCompletionInvariant({
        designId: 1,
        layout: VALID_LAYOUT,
        heroPublicUrl: null,
        content: VALID_CONTENT,
      });
      assert.fail("must throw on null heroPublicUrl");
    } catch (e) {
      captured = e;
    }
    assert.ok(captured instanceof RequiredStepFailedError);
    assert.equal((captured as { stepName: string }).stepName, STEP_HERO_RENDER);
  });

  it("content=null → throws RequiredStepFailedError on STEP_AI_TEXT", () => {
    let captured: unknown = null;
    try {
      assertCompletionInvariant({
        designId: 1,
        layout: VALID_LAYOUT,
        heroPublicUrl: VALID_HERO_URL,
        content: null,
      });
      assert.fail("must throw on null content");
    } catch (e) {
      captured = e;
    }
    assert.ok(captured instanceof RequiredStepFailedError);
    assert.equal((captured as { stepName: string }).stepName, STEP_AI_TEXT);
  });

  // Property: for every triple ∈ {present, null}^3, the helper throws iff
  // any of the three artifacts is null. This is the structural invariant
  // — no clever combination should slip through.
  it("for every {layout, hero, content} ∈ {present, null}^3 — throws iff any is null", () => {
    fc.assert(
      fc.property(
        fc.boolean(), // hasLayout
        fc.boolean(), // hasHero
        fc.boolean(), // hasContent
        fc.integer({ min: 1, max: 1_000_000 }),
        (hasLayout, hasHero, hasContent, designId) => {
          const state = {
            designId,
            layout: hasLayout ? VALID_LAYOUT : null,
            heroPublicUrl: hasHero ? VALID_HERO_URL : null,
            content: hasContent ? VALID_CONTENT : null,
          };
          const allPresent = hasLayout && hasHero && hasContent;
          if (allPresent) {
            assert.doesNotThrow(
              () => assertCompletionInvariant(state),
              `unexpected throw when all artifacts present (state=${JSON.stringify({ hasLayout, hasHero, hasContent })})`,
            );
          } else {
            let threw = false;
            try {
              assertCompletionInvariant(state);
            } catch (e) {
              threw = e instanceof RequiredStepFailedError;
            }
            assert.equal(
              threw,
              true,
              `must throw RequiredStepFailedError when any artifact is null (state=${JSON.stringify({ hasLayout, hasHero, hasContent })})`,
            );
          }
        },
      ),
      { numRuns: 64 }, // 2^3 = 8 distinct cases × IDs — 64 covers the matrix many times.
    );
  });

  // Property: the thrown stepName is always one of the four required
  // steps — never an optional step, never an unknown string. A bug that
  // misclassified an optional step as required would surface here.
  it("thrown stepName is always in STEPS_REQUIRED", () => {
    const requiredSet = new Set<string>(STEPS_REQUIRED as readonly string[]);
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (hasLayout, hasHero, hasContent) => {
          // Skip the all-present case — it doesn't throw.
          fc.pre(!(hasLayout && hasHero && hasContent));
          let captured: unknown = null;
          try {
            assertCompletionInvariant({
              designId: 1,
              layout: hasLayout ? VALID_LAYOUT : null,
              heroPublicUrl: hasHero ? VALID_HERO_URL : null,
              content: hasContent ? VALID_CONTENT : null,
            });
          } catch (e) {
            captured = e;
          }
          assert.ok(captured instanceof RequiredStepFailedError);
          const stepName = (captured as { stepName: string }).stepName;
          assert.ok(
            requiredSet.has(stepName),
            `stepName=${stepName} must be in STEPS_REQUIRED ${[...requiredSet].join("|")}`,
          );
        },
      ),
      { numRuns: 50 },
    );
  });
});

// =========================================================================
// Property 13.7 — RequiredStepFailedError shape
// =========================================================================
//
// The error class is what `processDesign`'s outer catch matches against
// (`if (e instanceof RequiredStepFailedError)`) to call `markFailed` with
// `e.userMessage`. Three properties guarantee the contract:
//
//   1. `userMessage` is a non-empty string (becomes `error_message` in DB,
//      shown to the user — no empty messages).
//   2. `stepName` is one of the 11 documented step names (so the worker's
//      log line `required step "${e.stepName}" failed` is greppable and
//      maps to the FSM diagram).
//   3. `instanceof RequiredStepFailedError` survives `throw`/`catch`
//      (no prototype loss across async boundaries).

describe("Property 13.7 — RequiredStepFailedError shape", () => {
  // Validates: Requirements 14.1, 14.6, 15.2

  it("userMessage and stepName are preserved across throw/catch", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          STEP_LAYOUT_JSON,
          STEP_HERO_RENDER,
          STEP_REAL_ESTIMATE,
          STEP_AI_TEXT,
        ),
        fc.string({ minLength: 1, maxLength: 200 }),
        (stepName, userMessage) => {
          let captured: unknown = null;
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            throw new (RequiredStepFailedError as any)(stepName, userMessage);
          } catch (e) {
            captured = e;
          }
          assert.ok(captured instanceof RequiredStepFailedError);
          assert.equal(
            (captured as { stepName: string }).stepName,
            stepName,
          );
          assert.equal(
            (captured as { userMessage: string }).userMessage,
            userMessage,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  // Soft-fail bug specifically: when Layout_Planner returns HTTP 200 + bad
  // JSON, the worker's defense-in-depth catch must wrap it as
  // RequiredStepFailedError(STEP_LAYOUT_JSON, "не удалось получить план
  // комнаты", cause). assertCompletionInvariant covers the post-step
  // guard — this property tests that the SOFT-FAIL wrapper produces the
  // same user-visible message as the HARD-FAIL path (HTTP 402 etc.).
  it("any layout failure surfaces as the same user-readable message", () => {
    // Both hard-fail (HTTP error) and soft-fail (HTTP 200 + bad JSON)
    // converge on the same user-readable string after the fix. We model
    // the convergence by asserting that the helper, given a null layout,
    // throws with exactly this message — independent of what the
    // underlying error was.
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        (designId) => {
          let captured: unknown = null;
          try {
            assertCompletionInvariant({
              designId,
              layout: null,
              heroPublicUrl: "/x",
              content: { h1: "x" },
            });
          } catch (e) {
            captured = e;
          }
          assert.ok(captured instanceof RequiredStepFailedError);
          assert.equal(
            (captured as { userMessage: string }).userMessage,
            "не удалось получить план комнаты",
          );
        },
      ),
      { numRuns: 50 },
    );
  });
});
