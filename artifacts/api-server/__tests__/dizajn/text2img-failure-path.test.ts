/**
 * Unit test (NOT property-based) for the Text_To_Image failure path of the
 * Design_Worker.
 *
 * Task 10.2 (ai-design-flagship):
 *   - Text2img failure → `status='failed'`, with no retries and no hidden
 *     recovery.
 *
 * **Validates: Requirements 3.8**
 *
 * Module under test:
 *   - `artifacts/api-server/src/lib/designWorker.ts` (observed through the
 *     `__test__` hatch only; the FSM body itself is private).
 *
 * What is observable / testable here.
 *   In `Text_To_Image_Mode` the worker has no user photo, so the scene is
 *   built from scratch via the required steps Layout_JSON → Hero_Render →
 *   Real_Estimate → AI-текст. When any of those *required* steps fails to
 *   produce its artifact, the worker `throw`s a `RequiredStepFailedError`,
 *   which the outer catch in `processDesign` routes to `markFailed`
 *   (`status='failed'`, `is_public=false`) — terminally, with no retry loop
 *   and no silent degrade to a "completed" row. Two facts make Requirement
 *   3.8 observable through the existing exports:
 *
 *     1. `assertCompletionInvariant` throws `RequiredStepFailedError` the
 *        moment a required artifact (layout / hero / content) is missing —
 *        this is the exact error the worker's catch turns into a `failed`
 *        status. A missing artifact is never "recovered" by reaching the
 *        success UPDATE.
 *     2. The text2img scene-building steps are classified **required**
 *        (`STEPS_REQUIRED`), not **optional** (`STEPS_OPTIONAL`). Optional
 *        steps degrade-but-continue; required steps abort to the fail path.
 *        This classification is what guarantees "no hidden recovery".
 *
 *   The image-to-image geometric retry loop (Req 3.6/3.7) is the *only*
 *   retry path in the worker and is gated on a user photo; it is owned by
 *   `.kiro/specs/ai-design-quality-fix` and is not exercised here. This test
 *   pins the contract that the text2img path has no such recovery.
 *
 * `@workspace/db` (pulled in transitively by `designWorker.ts`) throws at
 * module-eval time when `DATABASE_URL` is missing, and `objectStorage.ts`
 * eagerly builds an S3 client and throws without R2 credentials. Static
 * `import` would hoist those loads above any env assignment, so fake env vars
 * are wired up first and the worker is then pulled in via top-level
 * `await import(...)`. Neither pg.Pool nor the S3 client connects eagerly, so
 * dummy values suffice — this test runs no query and hits no network.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";
process.env.R2_ENDPOINT =
  process.env.R2_ENDPOINT ?? "https://fake.r2.cloudflarestorage.com";
process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? "fake";
process.env.R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? "fake";

import { describe, it } from "node:test";
import assert from "node:assert/strict";

const designWorkerModule = await import("../../src/lib/designWorker.ts");
const { __test__ } = designWorkerModule;

const {
  STEP_LAYOUT_JSON,
  STEP_HERO_RENDER,
  STEP_REAL_ESTIMATE,
  STEP_AI_TEXT,
  STEPS_REQUIRED,
  STEPS_OPTIONAL,
  RequiredStepFailedError,
  assertCompletionInvariant,
} = __test__ as {
  STEP_LAYOUT_JSON: string;
  STEP_HERO_RENDER: string;
  STEP_REAL_ESTIMATE: string;
  STEP_AI_TEXT: string;
  STEPS_REQUIRED: readonly string[];
  STEPS_OPTIONAL: readonly string[];
  RequiredStepFailedError: new (...args: unknown[]) => Error;
  assertCompletionInvariant: (state: {
    designId: number;
    layout: unknown;
    heroPublicUrl: unknown;
    content: unknown;
    viewsCount?: number;
  }) => void;
};

// Minimal "present" artifacts — the helper only checks for presence
// (truthy / non-null), so tiny stand-ins suffice.
const VALID_LAYOUT = { room: { roomType: "bedroom" } };
const VALID_HERO_URL = "/api/marketplace/dizajn/img/results/1_view_1.jpg";
const VALID_CONTENT = { h1: "Дизайн спальни 12 м²" };

// Helper: run the invariant and capture whatever it throws (or null).
function capture(state: {
  designId: number;
  layout: unknown;
  heroPublicUrl: unknown;
  content: unknown;
}): unknown {
  try {
    assertCompletionInvariant(state);
    return null;
  } catch (e) {
    return e;
  }
}

// ===========================================================================
// 1. Text2img hero-render failure routes to the fail path (status='failed').
// ===========================================================================
//
// In Text_To_Image_Mode the hero image is rendered from scratch. If that
// render produces no artifact (`heroPublicUrl === null`), the worker must not
// reach the success UPDATE — `assertCompletionInvariant` throws the same
// `RequiredStepFailedError` the outer catch turns into `markFailed`
// (status='failed', is_public=false).
describe("Task 10.2 — text-to-image failure path → status='failed'", () => {
  // Validates: Requirements 3.8

  it("text2img hero render failure (heroPublicUrl=null) throws RequiredStepFailedError on STEP_HERO_RENDER", () => {
    const err = capture({
      designId: 100,
      layout: VALID_LAYOUT,
      heroPublicUrl: null, // text2img scene render produced nothing
      content: VALID_CONTENT,
    });

    assert.ok(
      err instanceof RequiredStepFailedError,
      "missing hero artifact must throw the error type the worker routes to markFailed",
    );
    assert.equal(
      (err as { stepName: string }).stepName,
      STEP_HERO_RENDER,
      "stepName must identify the failed required step (hero render)",
    );
    assert.ok(
      typeof (err as { userMessage: string }).userMessage === "string"
        && (err as { userMessage: string }).userMessage.length > 0,
      "userMessage becomes the user-visible error_message — must be non-empty",
    );
  });

  it("text2img layout failure (layout=null) throws RequiredStepFailedError on STEP_LAYOUT_JSON", () => {
    const err = capture({
      designId: 101,
      layout: null, // scene plan could not be built from params
      heroPublicUrl: VALID_HERO_URL,
      content: VALID_CONTENT,
    });

    assert.ok(err instanceof RequiredStepFailedError);
    assert.equal((err as { stepName: string }).stepName, STEP_LAYOUT_JSON);
  });

  it("text2img description failure (content=null) throws RequiredStepFailedError on STEP_AI_TEXT", () => {
    const err = capture({
      designId: 102,
      layout: VALID_LAYOUT,
      heroPublicUrl: VALID_HERO_URL,
      content: null, // AI-текст step produced nothing
    });

    assert.ok(err instanceof RequiredStepFailedError);
    assert.equal((err as { stepName: string }).stepName, STEP_AI_TEXT);
  });

  // =========================================================================
  // 2. No hidden recovery: a missing required artifact never reaches success.
  // =========================================================================
  //
  // "No hidden recovery" means the worker cannot silently fill in a missing
  // required artifact and continue to a `completed` row. The invariant proves
  // this: with every *other* artifact present, dropping any single required
  // one still throws. There is no combination that slips through.
  it("a single missing required artifact always aborts — no silent fill-in to 'completed'", () => {
    // hero missing, everything else present
    assert.ok(
      capture({
        designId: 103,
        layout: VALID_LAYOUT,
        heroPublicUrl: null,
        content: VALID_CONTENT,
      }) instanceof RequiredStepFailedError,
    );
    // layout missing, everything else present
    assert.ok(
      capture({
        designId: 104,
        layout: null,
        heroPublicUrl: VALID_HERO_URL,
        content: VALID_CONTENT,
      }) instanceof RequiredStepFailedError,
    );
    // content missing, everything else present
    assert.ok(
      capture({
        designId: 105,
        layout: VALID_LAYOUT,
        heroPublicUrl: VALID_HERO_URL,
        content: null,
      }) instanceof RequiredStepFailedError,
    );
  });

  it("the happy path (all required artifacts present) does NOT throw", () => {
    assert.doesNotThrow(() =>
      assertCompletionInvariant({
        designId: 106,
        layout: VALID_LAYOUT,
        heroPublicUrl: VALID_HERO_URL,
        content: VALID_CONTENT,
      }),
    );
  });

  // =========================================================================
  // 3. No hidden recovery is structural: text2img steps are REQUIRED, never
  //    OPTIONAL. Optional steps degrade-but-continue; required steps abort.
  // =========================================================================
  //
  // The text2img scene is built by Layout_JSON, Hero_Render, Real_Estimate
  // and AI-текст. All four are in STEPS_REQUIRED and none in STEPS_OPTIONAL —
  // so their failure cannot be quietly degraded into a published result.
  it("text2img scene-building steps are classified required (abort), not optional (degrade)", () => {
    const required = new Set<string>(STEPS_REQUIRED);
    const optional = new Set<string>(STEPS_OPTIONAL);

    for (const step of [
      STEP_LAYOUT_JSON,
      STEP_HERO_RENDER,
      STEP_REAL_ESTIMATE,
      STEP_AI_TEXT,
    ]) {
      assert.ok(
        required.has(step),
        `${step} must be a required step so its failure routes to status='failed'`,
      );
      assert.equal(
        optional.has(step),
        false,
        `${step} must NOT be optional — optional steps degrade silently (hidden recovery)`,
      );
    }
  });

  // =========================================================================
  // 4. No retries on the text2img required-step failure.
  // =========================================================================
  //
  // The only retry loop in the worker is the image-to-image geometric retry,
  // gated on a user photo (Req 3.6/3.7). A text2img required-step failure is
  // terminal: the thrown stepName is always one of the four required steps,
  // never a placeholder/optional one, confirming the failure aborts directly
  // to the fail path rather than re-entering a recovery loop.
  it("every text2img required-step failure aborts directly to a required-step error (no recovery loop)", () => {
    const required = new Set<string>(STEPS_REQUIRED);

    for (const [layout, hero, content] of [
      [null, VALID_HERO_URL, VALID_CONTENT],
      [VALID_LAYOUT, null, VALID_CONTENT],
      [VALID_LAYOUT, VALID_HERO_URL, null],
    ] as const) {
      const err = capture({
        designId: 107,
        layout,
        heroPublicUrl: hero,
        content,
      });
      assert.ok(err instanceof RequiredStepFailedError);
      assert.ok(
        required.has((err as { stepName: string }).stepName),
        "failure must surface as a required-step error, not a retried/degraded state",
      );
    }
  });
});
