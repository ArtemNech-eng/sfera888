/**
 * Unit test: Depth_ControlNet_Wrapper соответствует паттерну fal-обёрток.
 *
 * Feature: ai-design-3d-blockout, Task 6.6
 *
 * **Validates: Requirements 6.1**
 *
 * Module under test:
 *   - `falDepthControlNetRepaint` from
 *     `artifacts/api-server/src/lib/falAi.ts` (the Depth_ControlNet_Wrapper).
 *
 * What this verifies (Requirement 6.1):
 *   The wrapper calls fal по тому же паттерну, что и остальные обёртки файла:
 *     1. POST на URL вида `https://fal.run/{model}`, где `{model}` — это
 *        env `FAL_MODEL_DEPTH_CONTROLNET` или дефолт
 *        `fal-ai/flux-control-lora-depth/image-to-image`.
 *     2. Заголовок `Authorization: Key {FAL_API_KEY}`.
 *
 * We mock `global.fetch` to capture the URL and headers, set env vars, call
 * the wrapper, and assert on the captured request. fetch/env restored after.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { falDepthControlNetRepaint } from "../../src/lib/falAi.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const DEFAULT_MODEL = "fal-ai/flux-control-lora-depth/image-to-image";

const FAKE_FAL_RESPONSE = {
  images: [{ url: "https://fal.example/out.png", width: 1024, height: 768 }],
  has_nsfw_concepts: [false],
};

/** Minimal Response-like object the wrapper reads via `.ok`, `.status`, `.text()`. */
function makeFakeResponse(): Response {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(FAKE_FAL_RESPONSE),
  } as unknown as Response;
}

/** Extract the Authorization header from whatever HeadersInit fetch received. */
function readHeader(init: RequestInit | undefined, name: string): string | undefined {
  const headers = init?.headers;
  if (!headers) return undefined;
  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }
  // Plain object case (this is what the wrapper uses).
  const record = headers as Record<string, string>;
  return record[name];
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Depth_ControlNet wrapper matches fal request pattern (Task 6.6, Req 6.1)", () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.FAL_API_KEY;
  const originalModel = process.env.FAL_MODEL_DEPTH_CONTROLNET;

  let capturedUrl: string | URL | Request | undefined;
  let capturedInit: RequestInit | undefined;

  beforeEach(() => {
    capturedUrl = undefined;
    capturedInit = undefined;
    global.fetch = (async (
      url: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      capturedUrl = url;
      capturedInit = init;
      return makeFakeResponse();
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.FAL_API_KEY;
    } else {
      process.env.FAL_API_KEY = originalApiKey;
    }
    if (originalModel === undefined) {
      delete process.env.FAL_MODEL_DEPTH_CONTROLNET;
    } else {
      process.env.FAL_MODEL_DEPTH_CONTROLNET = originalModel;
    }
  });

  it("posts to https://fal.run/{default model} and sends Authorization: Key {FAL_API_KEY}", async () => {
    process.env.FAL_API_KEY = "test-fal-api-key";
    delete process.env.FAL_MODEL_DEPTH_CONTROLNET;

    await falDepthControlNetRepaint({
      depthMapUrl: "https://r2.example/depth/cam1.png",
      prompt: "scandinavian living room, photoreal",
    });

    assert.equal(
      capturedUrl,
      `https://fal.run/${DEFAULT_MODEL}`,
      "fetch URL must be https://fal.run/{default model}",
    );
    assert.equal(
      readHeader(capturedInit, "Authorization"),
      "Key test-fal-api-key",
      "Authorization header must be `Key {FAL_API_KEY}`",
    );
  });

  it("uses FAL_MODEL_DEPTH_CONTROLNET override in the URL", async () => {
    process.env.FAL_API_KEY = "another-key";
    process.env.FAL_MODEL_DEPTH_CONTROLNET = "fal-ai/custom-depth-model/image-to-image";

    await falDepthControlNetRepaint({
      depthMapUrl: "https://r2.example/depth/cam2.png",
      prompt: "japandi bedroom, photoreal",
    });

    assert.equal(
      capturedUrl,
      "https://fal.run/fal-ai/custom-depth-model/image-to-image",
      "fetch URL must use the FAL_MODEL_DEPTH_CONTROLNET model",
    );
    assert.equal(
      readHeader(capturedInit, "Authorization"),
      "Key another-key",
      "Authorization header must reflect the current FAL_API_KEY",
    );
  });
});
