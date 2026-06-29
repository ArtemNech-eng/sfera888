/**
 * Property test for Depth_ControlNet_Wrapper NSFW refusal carrying cost.
 *
 * Feature: ai-design-3d-blockout, Property 16: NSFW gives an error without an
 * image, but with a cost.
 *
 * **Validates: Requirements 6.6, 6.7**
 *
 * Module under test:
 *   - `falDepthControlNetRepaint`, `NsfwBlockedError`
 *     from `artifacts/api-server/src/lib/falAi.ts`.
 *
 * Property 16 (NSFW → error, no image, with cost):
 *   For any provider response flagged as NSFW (`has_nsfw_concepts` contains
 *   `true`) and any wrapper input, `falDepthControlNetRepaint`:
 *     1. rejects (throws) rather than resolving with an image — so no image is
 *        ever returned to the caller (Requirement 6.6);
 *     2. the thrown error is a `NsfwBlockedError` (Requirement 6.6);
 *     3. the error carries an available `costKopeks` that is a finite,
 *        non-negative number, so the orchestrator can still account for the
 *        spend in `Cost_Budget` (Requirement 6.7).
 *
 * `global.fetch` and `process.env.FAL_API_KEY` are stubbed for the duration of
 * the test and restored afterwards. The stubbed fetch returns a 200 response
 * whose JSON body always reports at least one NSFW concept (plus arbitrary
 * images, to prove the wrapper refuses even when images are present).
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  falDepthControlNetRepaint,
  NsfwBlockedError,
  type DepthRepaintInput,
} from "../../src/lib/falAi.js";

// ─── Environment / fetch stubbing ────────────────────────────────────────────

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.FAL_API_KEY;

before(() => {
  process.env.FAL_API_KEY = "test-fal-api-key";
});

after(() => {
  // Restore fetch.
  if (originalFetch === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).fetch;
  } else {
    globalThis.fetch = originalFetch;
  }
  // Restore env.
  if (originalApiKey === undefined) {
    delete process.env.FAL_API_KEY;
  } else {
    process.env.FAL_API_KEY = originalApiKey;
  }
});

// ─── Generators ──────────────────────────────────────────────────────────────

const urlArb = fc
  .webUrl()
  .map((u) => u)
  .filter((u) => u.length > 0);

const aspectArb = fc.constantFrom<"16:9" | "4:3" | "1:1">("16:9", "4:3", "1:1");

const depthRepaintInputArb: fc.Arbitrary<DepthRepaintInput> = fc.record(
  {
    depthMapUrl: urlArb,
    prompt: fc.string({ minLength: 1, maxLength: 200 }),
    initImageUrl: fc.option(urlArb, { nil: undefined }),
    aspectRatio: fc.option(aspectArb, { nil: undefined }),
  },
  { requiredKeys: ["depthMapUrl", "prompt"] },
);

/**
 * NSFW flag arrays that always contain at least one `true`. We interleave
 * arbitrary `false` flags around a guaranteed `true` so the wrapper's
 * `.some(flag => flag === true)` is exercised across positions.
 */
const nsfwFlagsArb: fc.Arbitrary<boolean[]> = fc
  .tuple(
    fc.array(fc.boolean(), { maxLength: 4 }),
    fc.array(fc.boolean(), { maxLength: 4 }),
  )
  .map(([before, after]) => [...before, true, ...after]);

/** Arbitrary image list — present to prove the wrapper refuses anyway. */
const imagesArb = fc.array(
  fc.record({
    url: urlArb,
    width: fc.integer({ min: 1, max: 4096 }),
    height: fc.integer({ min: 1, max: 4096 }),
  }),
  { minLength: 0, maxLength: 3 },
);

// ─── fetch stub ───────────────────────────────────────────────────────────────

/**
 * Install a `global.fetch` stub returning a 200 OK response whose body reports
 * the given NSFW flags and images. Mirrors the minimal `Response` surface the
 * wrapper consumes: `ok`, `status`, and `text()`.
 */
function stubFetchWithNsfw(nsfwFlags: boolean[], images: unknown[]): void {
  const payload = JSON.stringify({
    images,
    has_nsfw_concepts: nsfwFlags,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.fetch = (async () =>
    ({
      ok: true,
      status: 200,
      text: async () => payload,
    }) as unknown as Response) as typeof fetch;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Depth_ControlNet_Wrapper Property 16: NSFW → error, no image, with cost", () => {
  // -----------------------------------------------------------------------
  // Property 16 — NSFW response throws NsfwBlockedError, returns no image,
  // and the error carries a finite, non-negative costKopeks.
  // Validates: Requirements 6.6, 6.7
  // -----------------------------------------------------------------------
  it("throws NsfwBlockedError with non-negative costKopeks and never returns an image", async () => {
    await fc.assert(
      fc.asyncProperty(
        depthRepaintInputArb,
        nsfwFlagsArb,
        imagesArb,
        async (input, nsfwFlags, images) => {
          stubFetchWithNsfw(nsfwFlags, images);

          let returnedValue: unknown = undefined;
          let thrown: unknown = undefined;
          try {
            returnedValue = await falDepthControlNetRepaint(input);
          } catch (e) {
            thrown = e;
          }

          // 1. The wrapper must NOT resolve with an image (Req 6.6).
          assert.equal(
            returnedValue,
            undefined,
            "falDepthControlNetRepaint must not return a result for NSFW responses",
          );

          // 2. It must throw a NsfwBlockedError (Req 6.6).
          assert.ok(
            thrown instanceof NsfwBlockedError,
            `expected NsfwBlockedError, got: ${String(thrown)}`,
          );

          // 3. The error carries an available, finite, non-negative cost (Req 6.7).
          const { costKopeks } = thrown as NsfwBlockedError;
          assert.equal(
            typeof costKopeks,
            "number",
            "costKopeks must be a number",
          );
          assert.ok(
            Number.isFinite(costKopeks),
            `costKopeks must be finite, got: ${costKopeks}`,
          );
          assert.ok(
            costKopeks >= 0,
            `costKopeks must be non-negative, got: ${costKopeks}`,
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});
