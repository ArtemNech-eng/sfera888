/**
 * Property test for Depth_Map as the structural control signal.
 *
 * Feature: ai-design-3d-blockout, Property 13
 *
 * Property 13: Depth_Map передаётся как структурный управляющий сигнал.
 *
 * **Validates: Requirements 6.2**
 *
 * Module under test:
 *   - `falDepthControlNetRepaint` from
 *     `artifacts/api-server/src/lib/falAi.ts`
 *
 * Property verified here:
 *   For any input `depthMapUrl`, the request body that
 *   `falDepthControlNetRepaint` sends to the provider contains that exact URL
 *   in the structural control-signal field (`control_lora_image_url`). We mock
 *   `global.fetch` to capture the request body, return a valid fake fal
 *   response, and assert the parsed body's control-signal field equals the
 *   generated `depthMapUrl`.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { falDepthControlNetRepaint } from "../../src/lib/falAi.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FAKE_FAL_RESPONSE = {
  images: [{ url: "https://fal.example/out.png", width: 1024, height: 768 }],
  has_nsfw_concepts: [false],
};

/** Build a Response-like object the wrapper can `.text()` once. */
function makeFakeResponse(): Response {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(FAKE_FAL_RESPONSE),
  } as unknown as Response;
}

// ─── Generators ──────────────────────────────────────────────────────────────

// Arbitrary depth-map URL strings. We don't constrain to a URL shape: the
// wrapper must forward *whatever* string it receives into the control-signal
// field verbatim, so any non-empty string is a valid probe.
const depthMapUrlArb = fc.string({ minLength: 1, maxLength: 200 });

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Depth_ControlNet Property 13: Depth_Map as structural control signal", () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.FAL_API_KEY;

  before(() => {
    process.env.FAL_API_KEY = "test-fal-api-key";
  });

  after(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.FAL_API_KEY;
    } else {
      process.env.FAL_API_KEY = originalApiKey;
    }
  });

  // -----------------------------------------------------------------------
  // Property 13 — depthMapUrl is forwarded into control_lora_image_url.
  // Validates: Requirement 6.2
  // -----------------------------------------------------------------------
  it("forwards any depthMapUrl into the structural control-signal field (control_lora_image_url)", async () => {
    await fc.assert(
      fc.asyncProperty(depthMapUrlArb, async (depthMapUrl) => {
        let capturedBody: unknown = undefined;

        global.fetch = (async (
          _url: string | URL | Request,
          init?: RequestInit,
        ): Promise<Response> => {
          capturedBody = init?.body;
          return makeFakeResponse();
        }) as unknown as typeof fetch;

        await falDepthControlNetRepaint({
          depthMapUrl,
          prompt: "scandinavian living room, photoreal",
        });

        assert.equal(
          typeof capturedBody,
          "string",
          "request body must be a JSON string",
        );
        const parsed = JSON.parse(capturedBody as string);
        assert.equal(
          parsed.control_lora_image_url,
          depthMapUrl,
          `structural control-signal field must equal depthMapUrl; ` +
            `got ${JSON.stringify(parsed.control_lora_image_url)}`,
        );
      }),
      { numRuns: 200 },
    );
  });
});
