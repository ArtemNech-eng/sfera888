/**
 * Property tests for `Design_Form` Zod schema (`dizajnFormSchema.ts`)
 * and the MVP room-gate.
 *
 * Property 1: Form schema accepts valid input and rejects with full violation list.
 * Property 3: MVP room gating.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 1.9, 1.10, 2.3**
 *
 * Module under test:
 *   - `validateDesignForm(input)`
 *   - `designFormSchema`
 *   - `ROOM_TYPES`, `STYLES`, `MVP_ALLOWED_ROOM_TYPES`
 *   - range constants `WIDTH_CM_MIN/MAX`, `LENGTH_CM_MIN/MAX`,
 *     `HEIGHT_CM_MIN/MAX`, `BUDGET_MIN_RUB/MAX_RUB`
 *   - `MVP_ROOM_LOCKED_CODE`
 *   - `DesignFormViolation` type
 *
 * Out of scope here:
 *   - **Property 2 (transactional effects of POST /generate)**:
 *     "no DB row created on captcha/validation/min-area failure" is an
 *     HTTP-level test that needs the full Express app + a transactional
 *     test database (supertest + ephemeral schema). It can't be
 *     exercised against the pure Zod module under test, and bringing
 *     up a test DB is significantly larger in scope than this property
 *     suite. Tracked separately; see `tasks.md` 16.3.
 *   - **Property 1.8/1.9 slug well-formedness**: covered by
 *     `slug.property.test.ts` (Property 23) — the slug pipeline runs
 *     after this validator succeeds, so we link the requirements here
 *     for traceability but do not duplicate the slug invariants.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import {
  validateDesignForm,
  designFormSchema,
  ROOM_TYPES,
  STYLES,
  MVP_ALLOWED_ROOM_TYPES,
  MVP_ROOM_LOCKED_CODE,
  WIDTH_CM_MIN,
  WIDTH_CM_MAX,
  LENGTH_CM_MIN,
  LENGTH_CM_MAX,
  HEIGHT_CM_MIN,
  HEIGHT_CM_MAX,
  BUDGET_MIN_RUB,
  BUDGET_MAX_RUB,
  type DesignFormViolation,
} from "../../src/lib/dizajnFormSchema.js";

// ─── Generators ──────────────────────────────────────────────────────────────

const validRoomTypeArb = fc.constantFrom(...ROOM_TYPES);
const validStyleArb = fc.constantFrom(...STYLES);
const validWidthArb = fc.integer({ min: WIDTH_CM_MIN, max: WIDTH_CM_MAX });
const validLengthArb = fc.integer({ min: LENGTH_CM_MIN, max: LENGTH_CM_MAX });
const validHeightArb = fc.integer({ min: HEIGHT_CM_MIN, max: HEIGHT_CM_MAX });
const validBudgetArb = fc.integer({
  min: BUDGET_MIN_RUB,
  max: BUDGET_MAX_RUB,
});

/** Valid input parameterised over `roomType` (so MVP-gated cases share it). */
function buildValidInputArb(roomTypeArb: fc.Arbitrary<(typeof ROOM_TYPES)[number]>) {
  return fc.record({
    roomType: roomTypeArb,
    style: validStyleArb,
    widthCm: validWidthArb,
    lengthCm: validLengthArb,
    heightCm: validHeightArb,
    budget: validBudgetArb,
  });
}

const validBedroomInputArb = buildValidInputArb(fc.constant("bedroom" as const));

const validInputAnyRoomArb = buildValidInputArb(validRoomTypeArb);

/** Non-enum room type strings — purposely sampled outside `ROOM_TYPES`. */
const nonEnumRoomTypeArb = fc
  .oneof(
    fc.string({ minLength: 1, maxLength: 20 }),
    fc.constantFrom("garage", "balcony", "office", "loft_room", "veranda", ""),
  )
  .filter((s) => !(ROOM_TYPES as readonly string[]).includes(s));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function expectFail(result: ReturnType<typeof validateDesignForm>): {
  violations: DesignFormViolation[];
} {
  assert.equal(result.ok, false, "expected validation to fail");
  if (result.ok) throw new Error("unreachable");
  return { violations: result.violations };
}

function findViolation(
  violations: readonly DesignFormViolation[],
  predicate: (v: DesignFormViolation) => boolean,
): DesignFormViolation | undefined {
  return violations.find(predicate);
}

// ─── Property 1.1 — All valid inputs pass ────────────────────────────────────

describe("Property 1.1: validateDesignForm accepts every valid input", () => {
  it("for roomType=bedroom (the MVP-allowed value) and any valid style/dims/budget", () => {
    fc.assert(
      fc.property(validBedroomInputArb, (input) => {
        const result = validateDesignForm(input);
        assert.equal(
          result.ok,
          true,
          `expected ok=true for ${JSON.stringify(input)}, got: ${JSON.stringify(
            result,
          )}`,
        );
        if (result.ok) {
          // Returned data must echo the input verbatim (no silent coercion).
          // Per-field equality avoids false negatives between
          // "key absent" vs "key present with value undefined" — Zod's
          // `.optional()` produces the former for unspecified fields,
          // which `deepStrictEqual` would otherwise distinguish.
          assert.equal(result.data.roomType, input.roomType);
          assert.equal(result.data.style, input.style);
          assert.equal(result.data.widthCm, input.widthCm);
          assert.equal(result.data.lengthCm, input.lengthCm);
          assert.equal(result.data.heightCm, input.heightCm);
          assert.equal(result.data.budget, input.budget);
          // Optional fields: not provided in input, must be absent or undefined in output.
          assert.equal(result.data.features, undefined);
          assert.equal(result.data.cityId, undefined);
          assert.equal(result.data.turnstileToken, undefined);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("designFormSchema.safeParse accepts the same valid inputs (non-MVP-gated)", () => {
    // Per the module contract, Zod itself permits any value of `ROOM_TYPES`.
    // The MVP gate lives outside the schema, in `validateDesignForm`.
    fc.assert(
      fc.property(validInputAnyRoomArb, (input) => {
        const result = designFormSchema.safeParse(input);
        assert.equal(
          result.success,
          true,
          `Zod rejected a structurally-valid input: ${JSON.stringify(input)}`,
        );
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 1.2 — All field violations are reported, not just the first ────

describe("Property 1.2: violations include ALL out-of-range fields", () => {
  /**
   * Generator for inputs with N independent invalid fields.
   * Each "bad" field is chosen from a value strictly outside its declared
   * range. We then assert that the violations array contains a Zod issue
   * for *each* invalid field (not just the first one Zod found).
   */
  it("multiple invalid fields → at least one violation per invalid field", () => {
    const tooSmallWidthArb = fc.integer({ min: -10_000, max: WIDTH_CM_MIN - 1 });
    const tooBigWidthArb = fc.integer({ min: WIDTH_CM_MAX + 1, max: 100_000 });
    const badWidthArb = fc.oneof(tooSmallWidthArb, tooBigWidthArb);

    const tooSmallLengthArb = fc.integer({ min: -10_000, max: LENGTH_CM_MIN - 1 });
    const tooBigLengthArb = fc.integer({ min: LENGTH_CM_MAX + 1, max: 100_000 });
    const badLengthArb = fc.oneof(tooSmallLengthArb, tooBigLengthArb);

    const tooSmallHeightArb = fc.integer({ min: -10_000, max: HEIGHT_CM_MIN - 1 });
    const tooBigHeightArb = fc.integer({ min: HEIGHT_CM_MAX + 1, max: 100_000 });
    const badHeightArb = fc.oneof(tooSmallHeightArb, tooBigHeightArb);

    const tooSmallBudgetArb = fc.integer({
      min: -10_000_000,
      max: BUDGET_MIN_RUB - 1,
    });
    const tooBigBudgetArb = fc.integer({
      min: BUDGET_MAX_RUB + 1,
      max: 100_000_000,
    });
    const badBudgetArb = fc.oneof(tooSmallBudgetArb, tooBigBudgetArb);

    fc.assert(
      fc.property(
        fc.record({
          roomType: fc.constant("bedroom" as const),
          style: validStyleArb,
          widthCm: badWidthArb,
          lengthCm: badLengthArb,
          heightCm: badHeightArb,
          budget: badBudgetArb,
        }),
        (input) => {
          const { violations } = expectFail(validateDesignForm(input));

          // One Zod issue per invalid field — the schema must surface every
          // violation, not bail out on the first error.
          const paths = new Set(violations.map((v) => v.path));
          assert.ok(
            paths.has("widthCm"),
            `missing violation for widthCm in ${JSON.stringify(violations)}`,
          );
          assert.ok(
            paths.has("lengthCm"),
            `missing violation for lengthCm in ${JSON.stringify(violations)}`,
          );
          assert.ok(
            paths.has("heightCm"),
            `missing violation for heightCm in ${JSON.stringify(violations)}`,
          );
          assert.ok(
            paths.has("budget"),
            `missing violation for budget in ${JSON.stringify(violations)}`,
          );

          // Every range violation must be `too_small` or `too_big`.
          for (const v of violations) {
            if (v.path === "roomType") continue; // mvp gate is separate
            assert.ok(
              v.code === "too_small" || v.code === "too_big",
              `expected too_small/too_big for ${v.path}, got ${v.code}`,
            );
          }
        },
      ),
      { numRuns: 80 },
    );
  });

  it("widthCm + budget invalid (the doc example) yields ≥ 2 violations", () => {
    const result = validateDesignForm({
      roomType: "bedroom",
      style: "modern",
      widthCm: 100, // < 200
      lengthCm: 400,
      heightCm: 250,
      budget: 10, // < 50000
    });
    const { violations } = expectFail(result);
    const paths = violations.map((v) => v.path);
    assert.ok(paths.includes("widthCm"));
    assert.ok(paths.includes("budget"));
  });
});

// ─── Property 1.3 — Range bounds are inclusive ──────────────────────────────

describe("Property 1.3: range bounds are inclusive on both ends", () => {
  const baseValid = {
    roomType: "bedroom" as const,
    style: "modern" as const,
    widthCm: 300,
    lengthCm: 400,
    heightCm: 250,
    budget: 100_000,
  };

  // Each row: [field, minOk, minFail, maxOk, maxFail, expectedCode]
  const cases: Array<
    [keyof typeof baseValid, number, number, number, number]
  > = [
    ["widthCm", WIDTH_CM_MIN, WIDTH_CM_MIN - 1, WIDTH_CM_MAX, WIDTH_CM_MAX + 1],
    [
      "lengthCm",
      LENGTH_CM_MIN,
      LENGTH_CM_MIN - 1,
      LENGTH_CM_MAX,
      LENGTH_CM_MAX + 1,
    ],
    [
      "heightCm",
      HEIGHT_CM_MIN,
      HEIGHT_CM_MIN - 1,
      HEIGHT_CM_MAX,
      HEIGHT_CM_MAX + 1,
    ],
    [
      "budget",
      BUDGET_MIN_RUB,
      BUDGET_MIN_RUB - 1,
      BUDGET_MAX_RUB,
      BUDGET_MAX_RUB + 1,
    ],
  ];

  for (const [field, minOk, minFail, maxOk, maxFail] of cases) {
    it(`${field}: ${minOk} accepted, ${minFail} rejected`, () => {
      const okResult = validateDesignForm({ ...baseValid, [field]: minOk });
      assert.equal(okResult.ok, true, `${field}=${minOk} should be accepted`);

      const failResult = validateDesignForm({ ...baseValid, [field]: minFail });
      const { violations } = expectFail(failResult);
      const v = findViolation(violations, (x) => x.path === field);
      assert.ok(v, `expected a violation on ${field}=${minFail}`);
      assert.equal(v?.code, "too_small");
    });

    it(`${field}: ${maxOk} accepted, ${maxFail} rejected`, () => {
      const okResult = validateDesignForm({ ...baseValid, [field]: maxOk });
      assert.equal(okResult.ok, true, `${field}=${maxOk} should be accepted`);

      const failResult = validateDesignForm({ ...baseValid, [field]: maxFail });
      const { violations } = expectFail(failResult);
      const v = findViolation(violations, (x) => x.path === field);
      assert.ok(v, `expected a violation on ${field}=${maxFail}`);
      assert.equal(v?.code, "too_big");
    });
  }
});

// ─── Property 1.4 — Unknown roomType produces invalid_enum_value ─────────────

describe("Property 1.4: unknown roomType yields invalid_enum_value, not other codes", () => {
  it("any non-enum string for roomType (otherwise valid input) → invalid_enum_value", () => {
    fc.assert(
      fc.property(
        fc.record({
          roomType: nonEnumRoomTypeArb,
          style: validStyleArb,
          widthCm: validWidthArb,
          lengthCm: validLengthArb,
          heightCm: validHeightArb,
          budget: validBudgetArb,
        }),
        (input) => {
          const { violations } = expectFail(validateDesignForm(input));
          const v = findViolation(violations, (x) => x.path === "roomType");
          assert.ok(
            v,
            `expected a roomType violation for ${JSON.stringify(input)}`,
          );
          // Zod 3.25 emits `invalid_enum_value` for `z.enum([...]).safeParse(unknown)`.
          assert.equal(
            v?.code,
            "invalid_enum_value",
            `expected invalid_enum_value, got ${v?.code} for roomType="${input.roomType}"`,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 3.1 — MVP room gating ──────────────────────────────────────────

describe("Property 3.1: MVP room gating", () => {
  /** All `ROOM_TYPES` minus the MVP-allowed set. Today this is everything except "bedroom". */
  const NON_MVP_ROOMS = (ROOM_TYPES as readonly string[]).filter(
    (rt) => !(MVP_ALLOWED_ROOM_TYPES as readonly string[]).includes(rt),
  );

  // Self-check: the test only makes sense if the MVP gate is non-trivially
  // restrictive. If product later expands `MVP_ALLOWED_ROOM_TYPES` to all
  // ROOM_TYPES, this property becomes vacuous and we want to know.
  assert.ok(
    NON_MVP_ROOMS.length > 0,
    "MVP_ALLOWED_ROOM_TYPES covers every ROOM_TYPES — Property 3.1 is vacuous; revisit the gate or this test",
  );

  it("non-bedroom roomType (kitchen, bathroom, …) emits mvp_room_locked at path roomType", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...NON_MVP_ROOMS),
        validStyleArb,
        validWidthArb,
        validLengthArb,
        validHeightArb,
        validBudgetArb,
        (roomType, style, widthCm, lengthCm, heightCm, budget) => {
          const input = { roomType, style, widthCm, lengthCm, heightCm, budget };
          const { violations } = expectFail(validateDesignForm(input));
          const mvpV = findViolation(
            violations,
            (v) => v.code === MVP_ROOM_LOCKED_CODE,
          );
          assert.ok(
            mvpV,
            `expected mvp_room_locked violation for roomType=${roomType}, got: ${JSON.stringify(
              violations,
            )}`,
          );
          assert.equal(mvpV?.path, "roomType");
        },
      ),
      { numRuns: 60 },
    );
  });

  it("bedroom (the MVP-allowed room) with otherwise-valid input → no MVP violation", () => {
    fc.assert(
      fc.property(validBedroomInputArb, (input) => {
        const result = validateDesignForm(input);
        assert.equal(result.ok, true);
        // Even if we look at the schema's safeParse output there are no
        // violations to inspect: it must be ok=true and `data.roomType === "bedroom"`.
        if (result.ok) {
          assert.equal(result.data.roomType, "bedroom");
        }
      }),
      { numRuns: 50 },
    );
  });
});

// ─── Property 3.2 — MVP gate doesn't fire for invalid roomType strings ───────

describe("Property 3.2: invalid (non-enum) roomType does not trigger mvp_room_locked", () => {
  /**
   * UX rationale: telling the user "garage is coming soon" implies the
   * product will eventually support garage, but garage is not a recognised
   * room type at all. The validator must say "garage doesn't exist"
   * (`invalid_enum_value`) and skip the MVP gate entirely.
   */
  it("for any non-enum roomType, violations contain invalid_enum_value but NOT mvp_room_locked", () => {
    fc.assert(
      fc.property(
        fc.record({
          roomType: nonEnumRoomTypeArb,
          style: validStyleArb,
          widthCm: validWidthArb,
          lengthCm: validLengthArb,
          heightCm: validHeightArb,
          budget: validBudgetArb,
        }),
        (input) => {
          const { violations } = expectFail(validateDesignForm(input));

          const hasEnumIssue = violations.some(
            (v) => v.path === "roomType" && v.code === "invalid_enum_value",
          );
          const hasMvpLock = violations.some(
            (v) => v.code === MVP_ROOM_LOCKED_CODE,
          );

          assert.ok(
            hasEnumIssue,
            `expected invalid_enum_value on roomType for "${input.roomType}"`,
          );
          assert.equal(
            hasMvpLock,
            false,
            `mvp_room_locked must not fire for non-enum roomType="${input.roomType}"`,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  // Hand-picked example pinned in the docstring, so a regression on the
  // exact "garage" wording is caught even if the random generator doesn't
  // happen to sample it.
  it('roomType="garage" yields exactly one roomType violation: invalid_enum_value', () => {
    const result = validateDesignForm({
      roomType: "garage",
      style: "modern",
      widthCm: 300,
      lengthCm: 400,
      heightCm: 250,
      budget: 200_000,
    });
    const { violations } = expectFail(result);
    const roomTypeViolations = violations.filter((v) => v.path === "roomType");
    assert.equal(roomTypeViolations.length, 1);
    assert.equal(roomTypeViolations[0]!.code, "invalid_enum_value");
  });
});

// ─── Property 3.3 — MVP gate combines with other field violations ────────────

describe("Property 3.3: MVP gate combines with other field violations", () => {
  /**
   * For roomType ∈ NON_MVP_ROOMS *and* an otherwise-invalid field
   * (e.g. widthCm=100), the violations array must contain BOTH the
   * mvp_room_locked code (Requirement 1.3) AND a range violation on the
   * other field (Requirement 1.10: surface every violation).
   */
  const NON_MVP_ROOMS = (ROOM_TYPES as readonly string[]).filter(
    (rt) => !(MVP_ALLOWED_ROOM_TYPES as readonly string[]).includes(rt),
  );

  it("non-MVP roomType + bad widthCm → both mvp_room_locked and a range violation", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...NON_MVP_ROOMS),
        fc.oneof(
          fc.integer({ min: -10_000, max: WIDTH_CM_MIN - 1 }),
          fc.integer({ min: WIDTH_CM_MAX + 1, max: 100_000 }),
        ),
        (roomType, badWidth) => {
          const result = validateDesignForm({
            roomType,
            style: "modern",
            widthCm: badWidth,
            lengthCm: 400,
            heightCm: 250,
            budget: 200_000,
          });
          const { violations } = expectFail(result);

          const hasMvp = violations.some(
            (v) => v.path === "roomType" && v.code === MVP_ROOM_LOCKED_CODE,
          );
          const hasWidth = violations.some(
            (v) =>
              v.path === "widthCm" &&
              (v.code === "too_small" || v.code === "too_big"),
          );

          assert.ok(
            hasMvp,
            `missing mvp_room_locked for roomType=${roomType}: ${JSON.stringify(
              violations,
            )}`,
          );
          assert.ok(
            hasWidth,
            `missing widthCm range violation for widthCm=${badWidth}: ${JSON.stringify(
              violations,
            )}`,
          );
        },
      ),
      { numRuns: 80 },
    );
  });

  it("kitchen + widthCm=100 (the doc example) yields both violations", () => {
    const result = validateDesignForm({
      roomType: "kitchen",
      style: "modern",
      widthCm: 100,
      lengthCm: 400,
      heightCm: 250,
      budget: 200_000,
    });
    const { violations } = expectFail(result);
    assert.ok(
      violations.some(
        (v) => v.path === "roomType" && v.code === MVP_ROOM_LOCKED_CODE,
      ),
      "expected mvp_room_locked on roomType",
    );
    assert.ok(
      violations.some(
        (v) => v.path === "widthCm" && v.code === "too_small",
      ),
      "expected too_small on widthCm",
    );
  });
});
