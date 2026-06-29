/**
 * Task 12.3 — Integration verification: publication threshold + edit-image path.
 *
 * **Validates: Requirements 2.4, 2.8, 2.9, 3.2**
 *
 * Unlike the per-property exploration tests (tasks 1–8) and the pure-resolver
 * unit/property tests, this file exercises the *worker-level decision wiring*
 * end-to-end at the seam between `designWorker.ts` and `designConfig.ts`,
 * without real network / DB / R2. It pins the three integration behaviors the
 * design's Testing Strategy §Integration Tests calls out:
 *
 *   1. Flagship publication threshold (Property 4 / Requirement 2.4):
 *      a full required artifact set still routes through the standard fail path
 *      (`RequiredStepFailedError(STEP_ANGLE_RENDERS)` → `is_public=false`) when
 *      the rendered view count is below `FLAGSHIP_MIN_VIEWS`, and completes
 *      otherwise. This is exactly the wiring at the final success UPDATE in
 *      `processDesign` (`assertCompletionInvariant({ ..., viewsCount: views.length })`).
 *
 *   2. User photo → edit-image reference (Property 9 / Requirement 2.9):
 *      `chooseHeroGenerationStrategy` for a user-upload project yields
 *      `mode="edit_image"`, `imageUrls=[userPhotoUrl]`, `inputFidelity="high"`
 *      — the exact strategy the worker resolves at step 2 (`heroStrategy`).
 *
 *   3. Identity-preserving views with fallback (Property 8 / Requirement 2.8,
 *      3.2): `chooseViewStrategy({ editImageAvailable: true })` selects native
 *      1024 primary with no upscale; `{ editImageAvailable: false }` degrades to
 *      the collage slice fallback — an OPTIONAL degradation that never routes
 *      the project to `failed`.
 *
 * The `assertCompletionInvariant` / `FLAGSHIP_MIN_VIEWS` / `STEP_ANGLE_RENDERS`
 * / `RequiredStepFailedError` symbols come from `designWorker.__test__`; the
 * `chooseHeroGenerationStrategy` / `chooseViewStrategy` resolvers come from
 * `designConfig`. Both are the real production decision functions the worker
 * calls — this test wires them the same way `processDesign` does.
 *
 * Run via Node's built-in test runner:
 *   npx tsx --test ./__tests__/dizajn/quality-fix-integration.property.test.ts
 *   (or: pnpm --filter @workspace/api-server test)
 */

// `@workspace/db` (imported transitively by `designWorker.ts`) **throws** at
// module-eval time when `DATABASE_URL` is missing, and `objectStorage.ts`
// (also pulled in transitively) eagerly instantiates an S3 client and so
// throws when R2 credentials are missing. Static `import` would hoist those
// loads above any top-of-file env assignment, so we wire fake env vars first
// and then pull in `designWorker.ts` via top-level `await import(...)`.
// Neither pg.Pool nor the S3 client connects eagerly, so dummy values are
// enough — none of the assertions in this file run a query or hit R2.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";
process.env.R2_ENDPOINT =
  process.env.R2_ENDPOINT ?? "https://fake.r2.cloudflarestorage.com";
process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? "fake";
process.env.R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? "fake";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// Worker FSM internals exposed for tests (publication threshold + completion guard).
const designWorkerModule = await import("../../src/lib/designWorker.ts");
const { __test__ } = designWorkerModule;

const {
  FLAGSHIP_MIN_VIEWS,
  STEP_ANGLE_RENDERS,
  RequiredStepFailedError,
  assertCompletionInvariant,
} = __test__ as {
  FLAGSHIP_MIN_VIEWS: number;
  STEP_ANGLE_RENDERS: string;
  RequiredStepFailedError: new (...args: unknown[]) => Error;
  assertCompletionInvariant: (state: {
    designId: number;
    layout: unknown;
    heroPublicUrl: unknown;
    content: unknown;
    viewsCount?: number;
  }) => void;
};

// Production decision resolvers — the worker calls these exact functions.
const designConfigModule = await import("../../src/lib/designConfig.ts");
const { chooseHeroGenerationStrategy, chooseViewStrategy } = designConfigModule;

// ─── Shared fixtures ─────────────────────────────────────────────────────────

// Native per-view resolution target (design.md §F / §Bug Condition B8). The
// hero collage is 1024×1024 and every view must be native 1024, never an
// upscale of a 512-px quadrant.
const NATIVE_VIEW_PX = 1024;

// A minimally valid full required artifact set — only the fields the completion
// guard inspects (truthy / non-null).
const VALID_LAYOUT = { room: { roomType: "bedroom" } };
const VALID_HERO_URL = "/api/marketplace/dizajn/img/results/1_view_1.jpg";
const VALID_CONTENT = { h1: "Дизайн спальни 12 м²" };

function runCompletion(viewsCount: number, designId = 1): void {
  assertCompletionInvariant({
    designId,
    layout: VALID_LAYOUT,
    heroPublicUrl: VALID_HERO_URL,
    content: VALID_CONTENT,
    viewsCount,
  });
}

// =========================================================================
// 1. Flagship publication threshold (Property 4 / Requirement 2.4)
// =========================================================================
//
// At the final success UPDATE the worker calls
//   assertCompletionInvariant({ ..., viewsCount: views.length })
// A full required set (layout + hero + content all present) is NOT enough to
// publish a "flagship": the coherent view set must reach FLAGSHIP_MIN_VIEWS.
// Below the threshold the guard throws RequiredStepFailedError(STEP_ANGLE_RENDERS),
// which the worker's outer catch routes to markFailed (status='failed',
// is_public=false) — i.e. NOT published as a sparse one-frame flagship.
// At or above the threshold a full set completes (no throw → published).

describe("12.3 (Property 4 / Req 2.4) — flagship publication threshold wiring", () => {
  it("FLAGSHIP_MIN_VIEWS is a positive integer ≥ 2 (degenerate one-frame guard)", () => {
    assert.ok(Number.isInteger(FLAGSHIP_MIN_VIEWS));
    assert.ok(
      FLAGSHIP_MIN_VIEWS >= 2,
      `FLAGSHIP_MIN_VIEWS=${FLAGSHIP_MIN_VIEWS} must be ≥ 2 to reject a single ` +
        `duplicated hero from being published as a flagship`,
    );
  });

  it("full required set but viewsCount < threshold → RequiredStepFailedError(STEP_ANGLE_RENDERS)", () => {
    for (let n = 0; n < FLAGSHIP_MIN_VIEWS; n++) {
      let captured: unknown = null;
      try {
        runCompletion(n, 100 + n);
        assert.fail(
          `must throw when viewsCount=${n} < FLAGSHIP_MIN_VIEWS=${FLAGSHIP_MIN_VIEWS}`,
        );
      } catch (e) {
        captured = e;
      }
      assert.ok(
        captured instanceof RequiredStepFailedError,
        `throw at viewsCount=${n} must be RequiredStepFailedError (→ fail path, is_public=false)`,
      );
      assert.equal(
        (captured as { stepName: string }).stepName,
        STEP_ANGLE_RENDERS,
        `threshold failure must be attributed to STEP_ANGLE_RENDERS at viewsCount=${n}`,
      );
      assert.equal(
        typeof (captured as { userMessage: string }).userMessage,
        "string",
      );
      assert.ok(
        (captured as { userMessage: string }).userMessage.length > 0,
        "fail path must carry a non-empty user message",
      );
    }
  });

  it("full required set and viewsCount ≥ threshold → completes (no throw → published)", () => {
    for (let n = FLAGSHIP_MIN_VIEWS; n <= FLAGSHIP_MIN_VIEWS + 4; n++) {
      assert.doesNotThrow(
        () => runCompletion(n, 200 + n),
        `must NOT throw when viewsCount=${n} ≥ FLAGSHIP_MIN_VIEWS=${FLAGSHIP_MIN_VIEWS}`,
      );
    }
  });

  // Property: across the whole viewsCount domain, the completion guard throws
  // RequiredStepFailedError(STEP_ANGLE_RENDERS) iff viewsCount < threshold —
  // exactly the "coherent adaptive page OR failed below threshold" dichotomy.
  it("∀ viewsCount: completed (no throw) ⟺ viewsCount ≥ FLAGSHIP_MIN_VIEWS", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 8 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        (viewsCount, designId) => {
          const shouldPublish = viewsCount >= FLAGSHIP_MIN_VIEWS;
          if (shouldPublish) {
            assert.doesNotThrow(
              () => runCompletion(viewsCount, designId),
              `viewsCount=${viewsCount} ≥ threshold must complete`,
            );
          } else {
            let captured: unknown = null;
            try {
              runCompletion(viewsCount, designId);
            } catch (e) {
              captured = e;
            }
            assert.ok(
              captured instanceof RequiredStepFailedError,
              `viewsCount=${viewsCount} < threshold must route to fail path`,
            );
            assert.equal(
              (captured as { stepName: string }).stepName,
              STEP_ANGLE_RENDERS,
            );
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  // Preservation (3.2): a MISSING required artifact still fails regardless of
  // view count — the threshold guard does not weaken the required-artifact
  // semantics. (Missing layout below threshold must still fail.)
  it("missing required artifact still fails even with enough views (3.2 preserved)", () => {
    let captured: unknown = null;
    try {
      assertCompletionInvariant({
        designId: 18,
        layout: null, // required artifact missing
        heroPublicUrl: VALID_HERO_URL,
        content: VALID_CONTENT,
        viewsCount: FLAGSHIP_MIN_VIEWS + 2, // plenty of views
      });
      assert.fail("must throw when a required artifact is missing");
    } catch (e) {
      captured = e;
    }
    assert.ok(captured instanceof RequiredStepFailedError);
  });
});

// =========================================================================
// 2. User photo → edit-image reference (Property 9 / Requirement 2.9)
// =========================================================================
//
// The worker resolves heroStrategy = chooseHeroGenerationStrategy({
//   userPhotoUrl: design.inputImageUrl ?? null, isSeed: !design.anonId, style })
// A user-upload project (photo present, NOT seed) must feed the photo as an
// edit-image reference: mode="edit_image", imageUrls=[photo], inputFidelity="high".

describe("12.3 (Property 9 / Req 2.9) — user photo fed as edit-image reference", () => {
  it("user-upload project → edit_image with image_urls=[photo], input_fidelity=high", () => {
    const userPhotoUrl = "https://cdn.example.com/uploads/user-room-42.jpg";
    const s = chooseHeroGenerationStrategy({
      userPhotoUrl,
      isSeed: false,
      style: "modern",
    });
    assert.equal(s.mode, "edit_image");
    assert.equal(s.usesUserPhoto, true);
    assert.deepStrictEqual(s.imageUrls, [userPhotoUrl]);
    assert.equal(s.inputFidelity, "high");
  });

  it("∀ user-upload (photo present, not seed) → edit_image reference to that photo", () => {
    const STYLE = fc.constantFrom(
      "modern",
      "scandinavian",
      "loft",
      "classic",
      "minimalism",
      "japandi",
    );
    const PHOTO = fc
      .webUrl()
      .map((u) => `${u}/uploads/room-${Math.abs(u.length * 31)}.jpg`);
    fc.assert(
      fc.property(PHOTO, STYLE, (userPhotoUrl, style) => {
        const s = chooseHeroGenerationStrategy({
          userPhotoUrl,
          isSeed: false,
          style,
        });
        assert.equal(s.mode, "edit_image");
        assert.equal(s.usesUserPhoto, true);
        assert.equal(s.imageUrls.length, 1);
        assert.equal(s.imageUrls[0], userPhotoUrl);
        assert.equal(s.inputFidelity, "high");
      }),
      { numRuns: 200 },
    );
  });

  // Preservation (§G): seed projects keep the legacy text2img path, no reference.
  it("seed project keeps text2img path (no reference) — preservation §G", () => {
    const s = chooseHeroGenerationStrategy({
      userPhotoUrl: "https://cdn.example.com/seed/before.jpg",
      isSeed: true,
      style: "scandinavian",
    });
    assert.equal(s.mode, "text2img");
    assert.equal(s.usesUserPhoto, false);
    assert.deepStrictEqual(s.imageUrls, []);
    assert.equal(s.inputFidelity, null);
  });
});

// =========================================================================
// 3. Identity-preserving views with fallback (Property 8 / Req 2.8, 3.2)
// =========================================================================
//
// The worker resolves viewStrategy = chooseViewStrategy({
//   editImageAvailable: isEditImageAvailable() }).
//   - edit-image available  → native 1024 primary, no upscale, identity kept.
//   - edit-image unavailable → collage slice fallback (512→1024 upscale), an
//     OPTIONAL degradation that never routes the project to `failed`.

describe("12.3 (Property 8 / Req 2.8, 3.2) — identity-preserving views + fallback", () => {
  it("edit-image available → native 1024 primary, no upscale, identity preserved", () => {
    const s = chooseViewStrategy({ editImageAvailable: true });
    assert.equal(s.kind, "primary");
    assert.equal(s.identityPreserving, true);
    assert.equal(s.outputResolutionPx, NATIVE_VIEW_PX);
    assert.equal(
      s.sourceResolutionPx,
      NATIVE_VIEW_PX,
      "primary path must source native 1024 pixels (no upscale)",
    );
    assert.ok(
      s.sourceResolutionPx >= s.outputResolutionPx,
      "primary path must not upscale (source ≥ output)",
    );
  });

  it("edit-image unavailable → fallback collage slice (optional degradation, NOT failed)", () => {
    const s = chooseViewStrategy({ editImageAvailable: false });
    assert.equal(
      s.kind,
      "fallback",
      "without edit-image the worker degrades to the collage fallback",
    );
    // The fallback is an optional-step degradation: it produces a (lower-res)
    // result rather than throwing — angle renders stay optional, project is
    // never routed to `failed` because of it (3.2 preserved).
    assert.equal(s.outputResolutionPx, NATIVE_VIEW_PX);
    assert.ok(
      s.sourceResolutionPx < s.outputResolutionPx,
      "fallback path upscales the 512-px quadrant to 1024 (documented degradation)",
    );
  });

  // Property: edit-image availability fully determines primary-vs-fallback, and
  // the primary path is always native identity-preserving with no upscale.
  it("∀ availability: available ⟺ native identity primary (no upscale)", () => {
    fc.assert(
      fc.property(fc.boolean(), (editImageAvailable) => {
        const s = chooseViewStrategy({ editImageAvailable });
        if (editImageAvailable) {
          assert.equal(s.kind, "primary");
          assert.equal(s.identityPreserving, true);
          assert.equal(s.sourceResolutionPx, NATIVE_VIEW_PX);
          assert.equal(s.outputResolutionPx, NATIVE_VIEW_PX);
          assert.ok(s.sourceResolutionPx >= s.outputResolutionPx);
        } else {
          assert.equal(s.kind, "fallback");
          assert.ok(s.sourceResolutionPx < s.outputResolutionPx);
        }
      }),
      { numRuns: 200 },
    );
  });
});
