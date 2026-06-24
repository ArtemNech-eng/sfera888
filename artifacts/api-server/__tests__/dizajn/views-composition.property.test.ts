/**
 * Property test for 6-view composition and env-driven edit-image provider.
 *
 * Property 15: 6-view composition and env-driven edit-image provider.
 *
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.7, 7.8**
 *
 * Modules under test:
 *   - `artifacts/api-server/src/lib/designConfig.ts` — `getEditImageProvider()`,
 *     `DEFAULT_EDIT_PROVIDER` (Requirement 7.5).
 *   - `artifacts/api-server/src/lib/designWorker.ts` — `__test__.VIEW_LABELS_6`
 *     (6 RU labels for Hero + 5 angles, Requirement 7.1, 7.8) and
 *     `__test__.ANGLE_PROMPTS_BEDROOM_5` (5 edit-image prompts with
 *     identity-preservation phrasing, Requirement 7.3).
 *
 * What this file pins down (and why each property maps to a requirement):
 *
 *   15.1 — `getEditImageProvider()` env-string normalisation.
 *          The worker reads this on every Angle_Render dispatch and uses the
 *          returned literal to pick `falGenerateGptImageEdit` vs
 *          `falGenerateFluxKontextPro`. The env-parse rules (case-insensitive,
 *          trim-whitespace, garbage → default, empty → default) are the
 *          contract operators rely on when hot-flipping `AI_DESIGN_EDIT_PROVIDER`
 *          in production. Validates Requirement 7.5.
 *
 *   15.2 — `VIEW_LABELS_6` has exactly 6 distinct non-empty Russian labels.
 *          These are written into `designs.views[].label` and rendered on the
 *          public page in the 6-photo gallery. A length drift would silently
 *          break the gallery layout and the PDF cover. Validates 7.1, 7.8.
 *
 *   15.3 — `ANGLE_PROMPTS_BEDROOM_5` has exactly 5 prompts, each carrying an
 *          identity-preservation phrase ("Та же спальня…"). Without that
 *          phrase the edit-image model can drift away from the Hero_Render
 *          palette/materials, defeating the whole point of running edit-image
 *          instead of text-to-image (Requirement 7.3 — "одна и та же
 *          комната").
 *
 *   15.4 — Provider-switch contract. The worker's `dispatchEditImage` body is
 *          a plain `if (provider === "flux_kontext_pro")` branch on the
 *          `getEditImageProvider()` literal. Mocking the underlying `falAi.ts`
 *          functions via ESM monkey-patching is brittle (frozen exports,
 *          dynamic-import timing), so we pin the *contract* end of the dispatch
 *          instead: every env value normalises to one of exactly two literals,
 *          and those two literals are the only ones the dispatch branch knows
 *          about. Validates Requirements 7.4, 7.5, 7.7 indirectly through the
 *          single-source-of-truth literal returned by `getEditImageProvider`.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

// `@workspace/db` (imported transitively by `designWorker.ts`) **throws** at
// module-eval time when `DATABASE_URL` is missing, and `objectStorage.ts`
// (also pulled in transitively) eagerly instantiates an S3 client and so
// throws when R2 credentials are missing. Static `import` would hoist those
// loads above any top-of-file env assignment, so we wire fake env vars first
// and then pull `designWorker.ts` in via top-level `await import(...)`.
// Neither pg.Pool nor the S3 client connects eagerly, so dummy values are
// enough — none of the properties in this file actually run a query or hit R2.
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

import {
  getEditImageProvider,
  DEFAULT_EDIT_PROVIDER,
  type EditImageProvider,
} from "../../src/lib/designConfig.ts";

const designWorkerModule = await import("../../src/lib/designWorker.ts");
const { __test__ } = designWorkerModule;
const {
  VIEW_LABELS_6,
  ANGLE_PROMPTS_BEDROOM_5,
  ISOMETRIC_VIEW_POSITION,
  ISOMETRIC_VIEW_LABEL,
} = __test__;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ALLOWED_PROVIDERS: ReadonlySet<EditImageProvider> = new Set<
  EditImageProvider
>(["gpt_image_1_5_edit", "flux_kontext_pro"]);

/** Save / clear / restore `AI_DESIGN_EDIT_PROVIDER` around a single check. */
function withEnv(value: string | undefined, fn: () => void): void {
  const prev = process.env["AI_DESIGN_EDIT_PROVIDER"];
  try {
    if (value === undefined) {
      delete process.env["AI_DESIGN_EDIT_PROVIDER"];
    } else {
      process.env["AI_DESIGN_EDIT_PROVIDER"] = value;
    }
    fn();
  } finally {
    if (prev === undefined) {
      delete process.env["AI_DESIGN_EDIT_PROVIDER"];
    } else {
      process.env["AI_DESIGN_EDIT_PROVIDER"] = prev;
    }
  }
}

// Russian-letter detection: any of \u0400–\u04FF (Cyrillic block) covers all
// modern Russian letters. We don't need to be exhaustive about non-Russian
// Cyrillic — the labels and prompts are written in literal Russian and a
// drift to ASCII-only English would fail the check, which is what we want.
const CYRILLIC_RE = /[\u0400-\u04FF]/;

// =========================================================================
// Property 15.1 — getEditImageProvider env-string normalisation
// =========================================================================
//
// Validates: Requirement 7.5
//
// `getEditImageProvider` is the single dispatch knob: the worker reads it on
// every Angle_Render and routes to one of two `falAi.ts` wrappers. We pin the
// env-parse rules here so an inadvertent change to the parser surfaces as a
// failing property rather than as silently-wrong production behaviour.

describe("Property 15.1 — getEditImageProvider env-string normalisation", () => {
  it("returns DEFAULT_EDIT_PROVIDER when env is undefined (operator never set it)", () => {
    withEnv(undefined, () => {
      assert.equal(getEditImageProvider(), DEFAULT_EDIT_PROVIDER);
    });
  });

  it("returns DEFAULT_EDIT_PROVIDER for the empty string (EXPORT FOO=)", () => {
    withEnv("", () => {
      assert.equal(getEditImageProvider(), DEFAULT_EDIT_PROVIDER);
    });
  });

  it("returns DEFAULT_EDIT_PROVIDER for whitespace-only values", () => {
    fc.assert(
      fc.property(
        fc
          .stringMatching(/^[ \t\r\n]+$/)
          .filter((s) => s.length > 0 && s.length <= 16),
        (ws) => {
          withEnv(ws, () => {
            assert.equal(getEditImageProvider(), DEFAULT_EDIT_PROVIDER);
          });
        },
      ),
      { numRuns: 30 },
    );
  });

  it("returns 'gpt_image_1_5_edit' for the canonical literal", () => {
    withEnv("gpt_image_1_5_edit", () => {
      assert.equal(getEditImageProvider(), "gpt_image_1_5_edit");
    });
  });

  it("returns 'flux_kontext_pro' for the canonical literal", () => {
    withEnv("flux_kontext_pro", () => {
      assert.equal(getEditImageProvider(), "flux_kontext_pro");
    });
  });

  it("is case-insensitive: arbitrary mixed-case spelling normalises to the lowercase literal", () => {
    // For each canonical provider, generate every mixed-case spelling and
    // assert the parser returns the canonical lowercase literal. This is the
    // contract that lets operators write `AI_DESIGN_EDIT_PROVIDER=GPT_IMAGE_1_5_EDIT`
    // in a hot-patch shell without worrying about exact casing.
    for (const canonical of ALLOWED_PROVIDERS) {
      fc.assert(
        fc.property(
          fc
            .array(fc.boolean(), {
              minLength: canonical.length,
              maxLength: canonical.length,
            })
            .map((bits) =>
              [...canonical]
                .map((ch, i) => (bits[i] ? ch.toUpperCase() : ch.toLowerCase()))
                .join(""),
            ),
          (variant) => {
            withEnv(variant, () => {
              assert.equal(getEditImageProvider(), canonical);
            });
          },
        ),
        { numRuns: 30 },
      );
    }
  });

  it("trims surrounding whitespace before matching", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("gpt_image_1_5_edit", "flux_kontext_pro"),
        fc.stringMatching(/^[ \t]{0,4}$/),
        fc.stringMatching(/^[ \t]{0,4}$/),
        (literal, before, after) => {
          withEnv(`${before}${literal}${after}`, () => {
            assert.equal(getEditImageProvider(), literal);
          });
        },
      ),
      { numRuns: 50 },
    );
  });

  it("falls back to DEFAULT_EDIT_PROVIDER for garbage or close-but-wrong values", () => {
    // Use a fixed list of plausible-looking misconfigurations rather than a
    // raw arbitrary string: the close-but-wrong cases are exactly what catches
    // operator typos in production.
    const garbage = [
      "garbage",
      "openai",
      "gpt-image-1.5-edit", // hyphens instead of underscores
      "flux",
      "flux_pro",
      "flux-kontext-pro",
      "gpt_image_1_5", // missing _edit suffix
      "gpt_image_2_0_edit", // future model name
      "fal-ai/gpt-image-1.5", // raw fal model id
      "  gpt image 1 5 edit  ", // spaces instead of underscores
      "GPT_IMAGE_2_5_EDIT",
      "null",
      "undefined",
      "0",
      "false",
    ];
    for (const value of garbage) {
      withEnv(value, () => {
        assert.equal(
          getEditImageProvider(),
          DEFAULT_EDIT_PROVIDER,
          `expected ${JSON.stringify(value)} to fall back to ${DEFAULT_EDIT_PROVIDER}`,
        );
      });
    }
  });

  it("DEFAULT_EDIT_PROVIDER is one of the two allowed literals", () => {
    assert.ok(
      ALLOWED_PROVIDERS.has(DEFAULT_EDIT_PROVIDER),
      `DEFAULT_EDIT_PROVIDER=${DEFAULT_EDIT_PROVIDER} must be one of ` +
        `${[...ALLOWED_PROVIDERS].join(", ")}`,
    );
  });

  it("DEFAULT_EDIT_PROVIDER is 'gpt_image_1_5_edit' (matches the conservative pre-pilot baseline)", () => {
    // Pin the documented default so a silent flip in `designConfig.ts` doesn't
    // change production behaviour for unset envs (Requirement 7.5).
    assert.equal(DEFAULT_EDIT_PROVIDER, "gpt_image_1_5_edit");
  });
});

// =========================================================================
// Property 15.2 — VIEW_LABELS_6 has exactly 6 distinct Russian labels
// =========================================================================
//
// Validates: Requirements 7.1, 7.8
//
// 7.1 mandates exactly 6 ракурсов (Hero + 5 Angle). 7.8 mandates that every
// successful render is recorded in `designs.views[]` in stable order. The
// `VIEW_LABELS_6` constant is the public-facing label for each of those 6
// positions; if its length drifted, the gallery layout and the PDF cover
// would both break silently.

describe("Property 15.2 — VIEW_LABELS_6 has exactly 6 distinct Russian labels", () => {
  it("VIEW_LABELS_6 has length 6 (Hero + 5 Angle)", () => {
    assert.equal(VIEW_LABELS_6.length, 6);
  });

  it("every label is a non-empty trimmed string", () => {
    for (let i = 0; i < VIEW_LABELS_6.length; i++) {
      const label = VIEW_LABELS_6[i];
      assert.equal(typeof label, "string", `VIEW_LABELS_6[${i}] must be a string`);
      assert.ok(label!.length > 0, `VIEW_LABELS_6[${i}] must be non-empty`);
      assert.equal(
        label,
        label!.trim(),
        `VIEW_LABELS_6[${i}]=${JSON.stringify(label)} must not have leading/trailing whitespace`,
      );
    }
  });

  it("every label is unique", () => {
    const seen = new Set<string>();
    for (let i = 0; i < VIEW_LABELS_6.length; i++) {
      const label = VIEW_LABELS_6[i]!;
      assert.equal(
        seen.has(label),
        false,
        `VIEW_LABELS_6[${i}]=${JSON.stringify(label)} duplicates an earlier label`,
      );
      seen.add(label);
    }
    assert.equal(seen.size, 6);
  });

  it("every label contains at least one Cyrillic character (sanity: it's Russian)", () => {
    for (let i = 0; i < VIEW_LABELS_6.length; i++) {
      const label = VIEW_LABELS_6[i]!;
      assert.match(
        label,
        CYRILLIC_RE,
        `VIEW_LABELS_6[${i}]=${JSON.stringify(label)} must contain Russian (Cyrillic) text`,
      );
    }
  });

  // Statistical confirmation: any element of VIEW_LABELS_6, randomly picked,
  // satisfies the same constraints. Uniform sampling lands on the offending
  // entry within tens of runs if anything regresses.
  it("any randomly picked element of VIEW_LABELS_6 is non-empty Cyrillic-bearing string", () => {
    fc.assert(
      fc.property(fc.constantFrom(...VIEW_LABELS_6), (label) => {
        assert.equal(typeof label, "string");
        assert.ok(label.length > 0);
        assert.match(label, CYRILLIC_RE);
      }),
      { numRuns: 60 },
    );
  });

  it("ISOMETRIC_VIEW_POSITION sits after the 6 photo positions (= 7) and ISOMETRIC_VIEW_LABEL is non-empty", () => {
    assert.equal(ISOMETRIC_VIEW_POSITION, 7);
    assert.equal(typeof ISOMETRIC_VIEW_LABEL, "string");
    assert.ok((ISOMETRIC_VIEW_LABEL as string).length > 0);
    // The isometric label must not collide with any of the 6 photo labels —
    // it shows up as a distinct slot in `designs.views[]`.
    for (const photoLabel of VIEW_LABELS_6) {
      assert.notEqual(
        ISOMETRIC_VIEW_LABEL,
        photoLabel,
        `ISOMETRIC_VIEW_LABEL must not duplicate any photo view label`,
      );
    }
  });
});

// =========================================================================
// Property 15.3 — ANGLE_PROMPTS_BEDROOM_5 has exactly 5 prompts, each carrying
// an identity-preservation phrase
// =========================================================================
//
// Validates: Requirement 7.3
//
// 7.3 mandates that each of the 5 Angle_Render prompts is an edit-image call
// with reference=Hero_Render, *and* that the description of the requested
// angle reinforces "the same room". Without an explicit identity-preservation
// phrase ("Та же спальня…") the edit-image model can drift on palette and
// materials, defeating the entire 6-view-composition purpose. The check below
// pins the phrase as part of the prompt contract.

describe("Property 15.3 — ANGLE_PROMPTS_BEDROOM_5 has exactly 5 identity-preserving prompts", () => {
  // The two phrasings the worker actually uses today. Both anchor the
  // edit-image model on the same source room — "Та же спальня" / "та же
  // палитра". A future prompt rewrite must keep at least one of these.
  const IDENTITY_PHRASES = ["Та же спальня", "та же палитра", "идентичная палитра"];

  it("ANGLE_PROMPTS_BEDROOM_5 has length 5 (one per Angle_Render position 2..6)", () => {
    assert.equal(ANGLE_PROMPTS_BEDROOM_5.length, 5);
  });

  it("every prompt is a non-empty string", () => {
    for (let i = 0; i < ANGLE_PROMPTS_BEDROOM_5.length; i++) {
      const prompt = ANGLE_PROMPTS_BEDROOM_5[i];
      assert.equal(
        typeof prompt,
        "string",
        `ANGLE_PROMPTS_BEDROOM_5[${i}] must be a string`,
      );
      assert.ok(
        prompt!.length > 0,
        `ANGLE_PROMPTS_BEDROOM_5[${i}] must be non-empty`,
      );
    }
  });

  it("every prompt is unique (no copy-paste mistake duplicating two angles)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < ANGLE_PROMPTS_BEDROOM_5.length; i++) {
      const prompt = ANGLE_PROMPTS_BEDROOM_5[i]!;
      assert.equal(
        seen.has(prompt),
        false,
        `ANGLE_PROMPTS_BEDROOM_5[${i}] duplicates an earlier prompt`,
      );
      seen.add(prompt);
    }
    assert.equal(seen.size, 5);
  });

  it("every prompt contains at least one identity-preservation phrase", () => {
    for (let i = 0; i < ANGLE_PROMPTS_BEDROOM_5.length; i++) {
      const prompt = ANGLE_PROMPTS_BEDROOM_5[i]!;
      const hasIdentity = IDENTITY_PHRASES.some((phrase) =>
        prompt.includes(phrase),
      );
      assert.equal(
        hasIdentity,
        true,
        `ANGLE_PROMPTS_BEDROOM_5[${i}] must include one of ${JSON.stringify(
          IDENTITY_PHRASES,
        )} to enforce Identity_Preservation (Requirement 7.3). ` +
          `Got: ${JSON.stringify(prompt)}`,
      );
    }
  });

  // Statistical confirmation analogous to 15.2.
  it("any randomly picked prompt is non-empty Cyrillic and identity-bearing", () => {
    fc.assert(
      fc.property(fc.constantFrom(...ANGLE_PROMPTS_BEDROOM_5), (prompt) => {
        assert.equal(typeof prompt, "string");
        assert.ok(prompt.length > 0);
        assert.match(prompt, CYRILLIC_RE);
        const hasIdentity = IDENTITY_PHRASES.some((phrase) =>
          prompt.includes(phrase),
        );
        assert.equal(hasIdentity, true);
      }),
      { numRuns: 50 },
    );
  });
});

// =========================================================================
// Property 15.4 — Provider-switch contract
// =========================================================================
//
// Validates: Requirements 7.4, 7.5, 7.7 (indirectly)
//
// The worker's `dispatchEditImage` body is a one-line branch on
// `getEditImageProvider() === "flux_kontext_pro"` — anything else routes to
// `falGenerateGptImageEdit`. Mocking the underlying `falAi.ts` exports via
// ESM monkey-patching is brittle (frozen exports, dynamic-import timing,
// loader caching), so we pin the *contract* end of the dispatch instead:
//
//   1. The result of `getEditImageProvider()` is always one of exactly two
//      literals, regardless of what the env contains.
//   2. The set of allowed literals is closed — no third option exists, so
//      the worker's `if/else` branch is exhaustive.
//   3. Each literal can be reached from at least one valid env value.
//
// Together (1)+(2)+(3) guarantee that every env value picks exactly one of
// the two `falAi.ts` wrappers — which is the entire contract the worker
// relies on.

describe("Property 15.4 — Provider-switch contract", () => {
  it("getEditImageProvider() returns a literal from the closed two-element set, for any env input", () => {
    // Cover the four documented input shapes plus arbitrary garbage:
    //   - undefined / empty / whitespace → DEFAULT_EDIT_PROVIDER
    //   - canonical literal → that literal
    //   - mixed case / surrounding whitespace → matching literal
    //   - garbage → DEFAULT_EDIT_PROVIDER
    const inputArb = fc.oneof(
      fc.constant(undefined),
      fc.constant(""),
      fc.string({ minLength: 0, maxLength: 32 }),
      fc.constantFrom("gpt_image_1_5_edit", "flux_kontext_pro"),
      fc
        .constantFrom("gpt_image_1_5_edit", "flux_kontext_pro")
        .map((s) => `  ${s.toUpperCase()}  `),
      fc.constantFrom("garbage", "openai", "flux", "gpt-image-1.5-edit"),
    );

    fc.assert(
      fc.property(inputArb, (raw) => {
        withEnv(raw, () => {
          const provider = getEditImageProvider();
          assert.ok(
            ALLOWED_PROVIDERS.has(provider),
            `getEditImageProvider() returned ${JSON.stringify(provider)} for ` +
              `env=${JSON.stringify(raw)} — must be one of ` +
              `${[...ALLOWED_PROVIDERS].join(", ")}`,
          );
        });
      }),
      { numRuns: 200 },
    );
  });

  it("both allowed literals are reachable from at least one env value (no dead branch)", () => {
    // If a literal weren't reachable, the corresponding `falAi.ts` wrapper
    // would be dead code in production and we'd want to know.
    withEnv("gpt_image_1_5_edit", () => {
      assert.equal(getEditImageProvider(), "gpt_image_1_5_edit");
    });
    withEnv("flux_kontext_pro", () => {
      assert.equal(getEditImageProvider(), "flux_kontext_pro");
    });
  });

  it("the literal type is exactly the two-element union (no third option)", () => {
    // Compile-time + runtime assertion: ALLOWED_PROVIDERS has size 2 and
    // contains the exact two strings the worker's switch knows about. If a
    // future change adds a third provider it must update both `EditImageProvider`
    // and the dispatch in `designWorker.ts`, and this property forces an
    // explicit re-pin here.
    assert.equal(ALLOWED_PROVIDERS.size, 2);
    assert.ok(ALLOWED_PROVIDERS.has("gpt_image_1_5_edit"));
    assert.ok(ALLOWED_PROVIDERS.has("flux_kontext_pro"));
  });

  // Note on dispatcher-level testing.
  //
  // The fully-faithful Property 15 would also assert that
  //   `dispatchEditImage(...)` calls `falGenerateGptImageEdit` when env =
  //   "gpt_image_1_5_edit" and `falGenerateFluxKontextPro` when env =
  //   "flux_kontext_pro" — by replacing those two exports on the loaded
  //   `falAi.ts` module and recording invocations.
  //
  // ESM exports in Node are *live bindings*: the importing module
  // (`designWorker.ts`) holds a reference to the binding, not the value, so
  // monkey-patching the imported object on the test side won't redirect calls
  // inside `designWorker.ts` unless we either (a) use a module loader hook,
  // (b) refactor the worker to inject the falAi functions, or (c) move
  // `dispatchEditImage` behind a DI boundary. None of those fit a single
  // property test file. The `getEditImageProvider()` literal is the *only*
  // input the dispatch branch reads, so pinning the literal end of the
  // contract here is sufficient for the FSM-level guarantee Requirement 7.5
  // makes ("env value picks one of two providers"). Direct mocking is left as
  // an integration-test exercise tied to the worker harness.
});
