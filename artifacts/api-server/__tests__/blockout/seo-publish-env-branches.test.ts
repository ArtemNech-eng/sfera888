/**
 * Unit tests for environment / DB branching in `publishSeoPage`.
 *
 * Feature: ai-design-3d-blockout, Task 12.3 (Unit-тесты ветвлений
 * окружения/БД).
 *
 * **Validates: Requirements 11.2, 11.3, 11.4**
 *
 * Module under test:
 *   - `publishSeoPage`, `isRailwayEnvironment`, `RAILWAY_ENV_VARS`
 *     from `artifacts/api-server/src/lib/blockout/seoPublish.ts`.
 *
 * Branches covered:
 *   1. Not on Railway → publication skipped (`published=false`,
 *      `skippedPublishReason` mentions Railway), no throw (Requirement 11.3).
 *   2. On Railway but no `DATABASE_URL` → skipped, no throw (Requirement 11.4
 *      — DB publish only happens on Railway *with* a DB available).
 *   3. On Railway with a bogus / unreachable `DATABASE_URL` → skipped without
 *      throwing, `boardPublicUrl` preserved in the result (Requirement 11.4).
 *   4. Batch semantics: invoking `publishSeoPage` for an array of N city
 *      inputs yields exactly N results — one run per project
 *      (Requirement 11.2 — Batch_Project_Set runs a project per city).
 *
 * `process.env` is snapshotted and fully restored around every test so the
 * ambient environment is left untouched regardless of outcome.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  publishSeoPage,
  isRailwayEnvironment,
  RAILWAY_ENV_VARS,
  type PublishSeoPageInput,
} from "../../src/lib/blockout/seoPublish.js";

// ─── Env save / restore ──────────────────────────────────────────────────────

/**
 * Keys that the environment branches depend on. We snapshot and restore at
 * least these around every test; the helpers below only ever touch these
 * keys, so a full restore returns the process to its prior state.
 */
const TOUCHED_ENV_KEYS = [...RAILWAY_ENV_VARS, "DATABASE_URL"] as const;

let savedEnv: Map<string, string | undefined>;

/** Remove every Railway marker and `DATABASE_URL` from the environment. */
function clearBranchEnv(): void {
  for (const key of TOUCHED_ENV_KEYS) {
    delete process.env[key];
  }
}

beforeEach(() => {
  savedEnv = new Map();
  for (const key of TOUCHED_ENV_KEYS) {
    savedEnv.set(key, process.env[key]);
  }
  // Start every test from a known-clean slate (local-like environment).
  clearBranchEnv();
});

afterEach(() => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal-but-valid `PublishSeoPageInput` for a given city. */
function makeInput(cityId: number, boardPublicUrl: string): PublishSeoPageInput {
  return {
    boardPublicUrl,
    views: [
      {
        url: `${boardPublicUrl}#front`,
        label: "Фронтальный",
        position: 1,
      },
    ],
    content: {
      roomType: "living_room",
      style: "modern",
      cityId,
      slug: `proj-${cityId}`,
    },
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("publishSeoPage — environment / DB branches (Requirements 11.2, 11.3, 11.4)", () => {
  // -----------------------------------------------------------------------
  // 1. Not on Railway → publication skipped, no throw (Requirement 11.3).
  // -----------------------------------------------------------------------
  it("skips publication when not running on Railway, naming Railway in the reason", async () => {
    // beforeEach already cleared every Railway marker.
    assert.equal(
      isRailwayEnvironment(),
      false,
      "precondition: environment must look non-Railway",
    );

    const input = makeInput(1, "https://cdn.example.com/boards/board-1.png");
    const result = await publishSeoPage(input);

    assert.equal(result.published, false, "publication must be skipped off-Railway");
    assert.equal(
      result.boardPublicUrl,
      input.boardPublicUrl,
      "board URL must be preserved for later re-publication",
    );
    assert.ok(
      typeof result.skippedPublishReason === "string" &&
        /railway/i.test(result.skippedPublishReason),
      `skip reason ${JSON.stringify(
        result.skippedPublishReason,
      )} must mention Railway`,
    );
    assert.equal(result.designId, undefined, "no design row should be created");
  });

  // -----------------------------------------------------------------------
  // 2. On Railway but no DATABASE_URL → skipped, no throw (Requirement 11.4).
  // -----------------------------------------------------------------------
  it("skips publication on Railway when DATABASE_URL is not set", async () => {
    process.env.RAILWAY_ENVIRONMENT = "production";
    // DATABASE_URL intentionally left unset by beforeEach.
    assert.equal(
      isRailwayEnvironment(),
      true,
      "precondition: environment must look like Railway",
    );

    const input = makeInput(2, "https://cdn.example.com/boards/board-2.png");
    const result = await publishSeoPage(input);

    assert.equal(result.published, false, "publication must be skipped without DATABASE_URL");
    assert.equal(result.boardPublicUrl, input.boardPublicUrl);
    assert.ok(
      typeof result.skippedPublishReason === "string" &&
        /DATABASE_URL/.test(result.skippedPublishReason),
      `skip reason ${JSON.stringify(
        result.skippedPublishReason,
      )} must mention DATABASE_URL`,
    );
    assert.equal(result.designId, undefined);
  });

  // -----------------------------------------------------------------------
  // 3. On Railway with a bogus / unreachable DATABASE_URL → skipped without
  //    throwing; boardPublicUrl preserved (Requirement 11.4).
  // -----------------------------------------------------------------------
  it("skips publication (no throw) when the DB is unreachable, preserving the board URL", async () => {
    process.env.RAILWAY_ENVIRONMENT_NAME = "production";
    // Points at a closed local port so the connection fails fast instead of
    // hanging; the module under test must catch this and skip gracefully.
    process.env.DATABASE_URL =
      "postgres://nouser:nopass@127.0.0.1:1/no_such_db";

    const input = makeInput(3, "https://cdn.example.com/boards/board-3.png");

    // The contract is "no throw for environment/DB-availability reasons".
    const result = await publishSeoPage(input);

    assert.equal(result.published, false, "publication must be skipped when DB is down");
    assert.equal(
      result.boardPublicUrl,
      input.boardPublicUrl,
      "board URL must be preserved so publication can be retried later",
    );
    assert.ok(
      typeof result.skippedPublishReason === "string" &&
        result.skippedPublishReason.length > 0,
      "a skip reason must be provided when the DB is unreachable",
    );
    assert.equal(result.designId, undefined);
  });

  // -----------------------------------------------------------------------
  // 4. Batch semantics: N city inputs → N results, one run per project
  //    (Requirement 11.2).
  // -----------------------------------------------------------------------
  it("produces exactly one result per city input for a batch of N projects", async () => {
    // Off-Railway keeps each run side-effect-free while still exercising the
    // per-project run path: the batch is modeled by mapping over N inputs.
    const cityIds = [101, 202, 303, 404, 505];
    const inputs = cityIds.map((id) =>
      makeInput(id, `https://cdn.example.com/boards/city-${id}.png`),
    );

    const results = await Promise.all(inputs.map((i) => publishSeoPage(i)));

    assert.equal(
      results.length,
      inputs.length,
      "batch must yield exactly one result per city project",
    );
    for (let i = 0; i < results.length; i++) {
      assert.equal(
        results[i].boardPublicUrl,
        inputs[i].boardPublicUrl,
        `result ${i} must correspond to its own project's board URL`,
      );
      assert.equal(results[i].published, false);
    }
  });
});
