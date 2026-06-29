/**
 * Feature: ai-design-3d-blockout, Property 17
 *
 * Property test: Ошибки провайдера несут HTTP-статус и текст.
 *
 * Property 17: Ошибки провайдера несут HTTP-статус и текст.
 *
 * **Validates: Requirements 1.5**
 *
 * Module under test:
 *   - `falDepthControlNetRepaint` from
 *     `artifacts/api-server/src/lib/falAi.ts` (the Depth_ControlNet_Wrapper).
 *
 * Property verified here:
 *   *Для любого* ответа провайдера со статусом `>= 400` ИЛИ с пустым набором
 *   изображений, `falDepthControlNetRepaint` завершается ошибкой, чьё
 *   сообщение содержит HTTP-статус и текст ответа провайдера
 *   (паттерн `Fal.ai HTTP {status}: {text}`).
 *
 * Two generated scenarios:
 *   (a) status >= 400 with arbitrary error-text body — the thrown message
 *       MUST contain the status number and the response text.
 *   (b) ok status (200) but an empty `images` array — the wrapper MUST throw.
 *
 * `global.fetch` is mocked and `process.env.FAL_API_KEY` is set; both are
 * restored after the suite.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { falDepthControlNetRepaint } from "../../src/lib/falAi.js";

// ─── Test doubles ────────────────────────────────────────────────────────────

/**
 * Minimal stand-in for the global `fetch` Response that
 * `falDepthControlNetRepaint` actually uses: it reads `.status`, `.ok`, and
 * awaits `.text()` exactly once.
 */
function fakeResponse(status: number, body: string): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => body,
  } as unknown as Response;
}

const baseInput = {
  depthMapUrl: "https://r2.example.com/depth/room-1.png",
  prompt: "scandinavian bedroom, soft daylight, photoreal",
  aspectRatio: "4:3" as const,
};

// ─── Fixture lifecycle ───────────────────────────────────────────────────────

const realFetch = globalThis.fetch;
const realApiKey = process.env.FAL_API_KEY;

before(() => {
  process.env.FAL_API_KEY = "test-key";
});

after(() => {
  globalThis.fetch = realFetch;
  if (realApiKey === undefined) {
    delete process.env.FAL_API_KEY;
  } else {
    process.env.FAL_API_KEY = realApiKey;
  }
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Depth_ControlNet_Wrapper Property 17: provider errors carry HTTP status and text", () => {
  // The wrapper slices the response text to 500 chars before embedding it in
  // the message, so we keep generated bodies well under that to assert full
  // containment.
  const errorTextArb = fc.string({ maxLength: 200 });
  const errorStatusArb = fc.integer({ min: 400, max: 599 });

  // -----------------------------------------------------------------------
  // Scenario (a) — status >= 400 with arbitrary error-text body.
  // Validates: Requirements 1.5
  // -----------------------------------------------------------------------
  it("throws a message containing the HTTP status and the provider response text for status >= 400", async () => {
    await fc.assert(
      fc.asyncProperty(errorStatusArb, errorTextArb, async (status, text) => {
        globalThis.fetch = (async () => fakeResponse(status, text)) as typeof fetch;

        let thrown: unknown;
        try {
          await falDepthControlNetRepaint({ ...baseInput });
        } catch (e) {
          thrown = e;
        }

        assert.ok(
          thrown instanceof Error,
          `expected falDepthControlNetRepaint to throw for status ${status}`,
        );
        const message = (thrown as Error).message;
        assert.ok(
          message.includes(String(status)),
          `message "${message}" must contain HTTP status ${status}`,
        );
        assert.ok(
          message.includes(text),
          `message "${message}" must contain provider response text ${JSON.stringify(text)}`,
        );
      }),
      { numRuns: 100 },
    );
  });

  // -----------------------------------------------------------------------
  // Scenario (b) — ok status (200) but an empty `images` array.
  // Validates: Requirements 1.5
  // -----------------------------------------------------------------------
  it("throws when the provider returns an ok status but an empty image set", async () => {
    await fc.assert(
      fc.asyncProperty(
        // The body still has to parse as JSON with an empty images array.
        fc.constantFrom(
          JSON.stringify({ images: [] }),
          JSON.stringify({ images: [], has_nsfw_concepts: [false] }),
          JSON.stringify({}),
        ),
        async (body) => {
          globalThis.fetch = (async () => fakeResponse(200, body)) as typeof fetch;

          let thrown: unknown;
          try {
            await falDepthControlNetRepaint({ ...baseInput });
          } catch (e) {
            thrown = e;
          }

          assert.ok(
            thrown instanceof Error,
            `expected falDepthControlNetRepaint to throw on empty image set (body: ${body})`,
          );
          const message = (thrown as Error).message;
          // The empty-result branch reuses the same `Fal.ai HTTP {status}`
          // pattern, so the message still carries the status.
          assert.ok(
            message.includes("200"),
            `message "${message}" must contain HTTP status 200`,
          );
        },
      ),
      { numRuns: 30 },
    );
  });
});
