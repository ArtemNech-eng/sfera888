/**
 * Property test for the Depth_ControlNet_Wrapper cost reporting.
 *
 * Feature: ai-design-3d-blockout, Property 15: Обёртка возвращает стоимость
 * в копейках (неотрицательная).
 *
 * **Validates: Requirements 6.5**
 *
 * Module under test:
 *   - `falDepthControlNetRepaint` from `artifacts/api-server/src/lib/falAi.ts`
 *
 * Property verified here:
 *   For any successful provider response, the wrapper result carries a
 *   `costKopeks` that is a finite, non-negative number. `global.fetch` is
 *   mocked to return a successful fal response with an arbitrary image
 *   url/width/height and `has_nsfw_concepts: [false]`. `FAL_API_KEY` is set
 *   for the duration of the run; both `fetch` and the env var are restored
 *   afterwards.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  falDepthControlNetRepaint,
  type DepthRepaintInput,
} from "../../src/lib/falAi.js";

// ─── Mocked fal response shape ───────────────────────────────────────────────

type FalSuccessBody = {
  images: Array<{ url: string; width: number; height: number }>;
  has_nsfw_concepts: boolean[];
};

function makeFetchStub(body: FalSuccessBody): typeof fetch {
  // Minimal Response-like stub: the wrapper only reads `.ok`, `.status`
  // and `.text()`.
  return (async () =>
    ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
    }) as unknown as Response) as unknown as typeof fetch;
}

// ─── Generators ──────────────────────────────────────────────────────────────

const aspectRatioArb = fc.option(
  fc.constantFrom<"16:9" | "4:3" | "1:1">("16:9", "4:3", "1:1"),
  { nil: undefined },
);

const inputArb: fc.Arbitrary<DepthRepaintInput> = fc.record(
  {
    depthMapUrl: fc.webUrl(),
    prompt: fc.string({ minLength: 1, maxLength: 200 }),
    initImageUrl: fc.option(fc.webUrl(), { nil: undefined }),
    aspectRatio: aspectRatioArb,
  },
  { requiredKeys: ["depthMapUrl", "prompt"] },
);

// Arbitrary, non-negative dimensions for the mocked provider response.
const responseBodyArb = fc.record({
  url: fc.webUrl(),
  width: fc.integer({ min: 1, max: 8192 }),
  height: fc.integer({ min: 1, max: 8192 }),
});

// ─── Test lifecycle: env + fetch isolation ──────────────────────────────────

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.FAL_API_KEY;

describe("Depth_ControlNet_Wrapper Property 15: cost in kopeks", () => {
  before(() => {
    process.env.FAL_API_KEY = "test-key";
  });

  after(() => {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.FAL_API_KEY;
    } else {
      process.env.FAL_API_KEY = originalApiKey;
    }
  });

  // -----------------------------------------------------------------------
  // Property 15 — successful response ⇒ finite, non-negative costKopeks.
  // Validates: Requirements 6.5
  // -----------------------------------------------------------------------
  it("returns a finite, non-negative costKopeks for any successful provider response", async () => {
    await fc.assert(
      fc.asyncProperty(inputArb, responseBodyArb, async (input, resp) => {
        globalThis.fetch = makeFetchStub({
          images: [{ url: resp.url, width: resp.width, height: resp.height }],
          has_nsfw_concepts: [false],
        });

        const result = await falDepthControlNetRepaint(input);

        assert.equal(
          typeof result.costKopeks,
          "number",
          "costKopeks must be a number",
        );
        assert.ok(
          Number.isFinite(result.costKopeks),
          `costKopeks must be finite, got ${result.costKopeks}`,
        );
        assert.ok(
          result.costKopeks >= 0,
          `costKopeks must be non-negative, got ${result.costKopeks}`,
        );
      }),
      { numRuns: 200 },
    );
  });
});
