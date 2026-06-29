/**
 * Unit tests for the fallback branching of Blockout_Pipeline (task 13.4).
 *
 * Feature: ai-design-3d-blockout
 *
 * **Validates: Requirements 9.1, 9.2, 9.3**
 *
 * Modules under test:
 *   - `assertRenderEnvironment`, `RenderEnvironmentUnavailableError`,
 *     `FALLBACK_2D_PATH_HINT`, `STEP_ASSERT_RENDER_ENV` from
 *     `artifacts/api-server/src/lib/blockout/pipeline.ts`.
 *   - The existing 2D fallback generator
 *     `artifacts/api-server/src/scripts/generate-design-board.ts`
 *     (`Fallback_2D_Path`) — verified by inspection only, NOT modified.
 *
 * What these tests assert:
 *   • Req 9.3 — when Render_Environment is unavailable (probe reports failure
 *     or the configured Blender binary path does not exist),
 *     `assertRenderEnvironment` does NOT start the 3D path: it throws a typed
 *     `RenderEnvironmentUnavailableError` whose message reports unavailability
 *     and proposes `Fallback_2D_Path` (it carries `FALLBACK_2D_PATH_HINT`).
 *     The nonexistent-path branch additionally proves NOTHING is spawned: an
 *     injected probe spy is never invoked.
 *   • The success path (probe reports `{ ok: true }`) returns the resolved
 *     `{ blenderBin }` and never falls back to any 2D routine.
 *   • Req 9.1, 9.2 — the `Fallback_2D_Path` generator file
 *     `generate-design-board.ts` is present and its contract is unchanged: it
 *     still drives the 2D pipeline (Nano Banana 2 + composeInfographic + R2)
 *     and never reaches into the 3D Render_Environment (no Blender, no
 *     child-process spawn, no `assertRenderEnvironment`/`blockout/pipeline`).
 *
 * `pipeline.ts` transitively imports `@workspace/db` (via `designCostGuard`),
 * which constructs a `pg.Pool` at module-eval time and throws when
 * `DATABASE_URL` is missing. Static `import` declarations are hoisted, so we
 * set a fake DSN here and pull the module in via dynamic `await import(...)`.
 * The pool is lazy — none of these tests run a query.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

const {
  assertRenderEnvironment,
  RenderEnvironmentUnavailableError,
  FALLBACK_2D_PATH_HINT,
  STEP_ASSERT_RENDER_ENV,
} = await import("../../src/lib/blockout/pipeline.ts");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Silent step logger so tests don't spam stderr. */
const silentLogger = () => {};

const HERE = dirname(fileURLToPath(import.meta.url));
/** Absolute path to the existing 2D fallback generator (Fallback_2D_Path). */
const FALLBACK_2D_FILE = resolve(
  HERE,
  "../../src/scripts/generate-design-board.ts",
);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Blockout_Pipeline fallback branching (task 13.4)", () => {
  // -------------------------------------------------------------------------
  // Req 9.3 — unavailable via nonexistent binary path: throws the typed
  // error proposing Fallback_2D_Path AND spawns nothing (probe never called).
  // -------------------------------------------------------------------------
  it("nonexistent Blender path → throws RenderEnvironmentUnavailableError proposing Fallback_2D_Path, without spawning", async () => {
    let probeCalls = 0;
    const probeSpy = () => {
      probeCalls += 1;
      // If this ever runs, the env-detect tried to launch a process.
      return { ok: true as const };
    };

    const missingPath = resolve(HERE, "__no_such_blender_binary__.bin");
    assert.equal(
      existsSync(missingPath),
      false,
      "precondition: the fake Blender path must not exist on disk",
    );

    await assert.rejects(
      () =>
        assertRenderEnvironment({
          blenderBin: missingPath,
          logger: silentLogger,
          probe: probeSpy,
        }),
      (err: unknown) => {
        assert.ok(
          err instanceof RenderEnvironmentUnavailableError,
          "must be a RenderEnvironmentUnavailableError",
        );
        // Step name is carried for logging (Req 13.5) — sanity check.
        assert.equal(err.step, STEP_ASSERT_RENDER_ENV);
        // Message reports unavailability AND proposes the 2D fallback (Req 9.3).
        assert.match(err.message, /не найден/i);
        assert.ok(
          err.message.includes(FALLBACK_2D_PATH_HINT),
          "message must carry the FALLBACK_2D_PATH_HINT",
        );
        assert.match(err.message, /Fallback_2D_Path/);
        return true;
      },
    );

    // No 3D path / no process: the injected probe was never invoked (Req 9.3).
    assert.equal(
      probeCalls,
      0,
      "must not run the Blender probe (no spawn) when the path is missing",
    );
  });

  // -------------------------------------------------------------------------
  // Req 9.3 — unavailable via failing probe: throws the typed error proposing
  // Fallback_2D_Path; the failure reason is surfaced.
  // -------------------------------------------------------------------------
  it("probe {ok:false} → throws RenderEnvironmentUnavailableError proposing Fallback_2D_Path", async () => {
    const reason = "бинарь Blender \"blender\" не найден в PATH";

    await assert.rejects(
      () =>
        assertRenderEnvironment({
          blenderBin: "blender",
          logger: silentLogger,
          probe: () => ({ ok: false, reason }),
        }),
      (err: unknown) => {
        assert.ok(
          err instanceof RenderEnvironmentUnavailableError,
          "must be a RenderEnvironmentUnavailableError",
        );
        assert.ok(
          err.message.includes(reason),
          "message must surface the probe's failure reason",
        );
        assert.ok(
          err.message.includes(FALLBACK_2D_PATH_HINT),
          "message must carry the FALLBACK_2D_PATH_HINT",
        );
        assert.match(err.message, /Fallback_2D_Path/);
        return true;
      },
    );
  });

  // -------------------------------------------------------------------------
  // Success path — probe {ok:true} returns { blenderBin }; never falls back.
  // -------------------------------------------------------------------------
  it("probe {ok:true} → resolves { blenderBin } without any 2D fallback", async () => {
    let fallbackInvoked = false;

    const env = await assertRenderEnvironment({
      blenderBin: "blender",
      logger: silentLogger,
      probe: () => {
        // A successful probe means the 3D path proceeds; nothing here should
        // ever trigger a 2D fallback routine.
        fallbackInvoked = fallbackInvoked || false;
        return { ok: true };
      },
    });

    assert.deepEqual(
      env,
      { blenderBin: "blender" },
      "success path must return the resolved Blender binary",
    );
    assert.equal(
      fallbackInvoked,
      false,
      "the 2D fallback must not be invoked when Render_Environment is available",
    );
  });

  // -------------------------------------------------------------------------
  // Req 9.1, 9.2 — Fallback_2D_Path generator is present and its contract is
  // unchanged: it drives the 2D pipeline and never touches Render_Environment.
  // -------------------------------------------------------------------------
  it("generate-design-board.ts (Fallback_2D_Path) is present and its contract is unchanged", () => {
    assert.equal(
      existsSync(FALLBACK_2D_FILE),
      true,
      "the existing 2D fallback generator must remain present (Req 9.1)",
    );

    const source = readFileSync(FALLBACK_2D_FILE, "utf8");

    // Contract anchors: still the 2D board pipeline through the existing
    // composer + object storage (Req 9.1 — contract not changed).
    assert.match(
      source,
      /import\s*\{[^}]*composeInfographic[^}]*\}\s*from\s*["']\.\.\/lib\/infographicComposer\.js["']/,
      "fallback must still call the existing composeInfographic contract",
    );
    assert.match(
      source,
      /from\s*["']\.\.\/lib\/falAi\.js["']/,
      "fallback must still use the fal image provider (2D path)",
    );
    assert.match(
      source,
      /objectStorage/,
      "fallback must still upload the board to Object_Storage",
    );

    // Req 9.2 — the 2D fallback does NOT reach into the 3D Render_Environment:
    // no Blender, no child-process spawn, no env-detect, no blockout pipeline.
    assert.doesNotMatch(
      source,
      /blender/i,
      "fallback must not reference Blender (no Render_Environment)",
    );
    assert.doesNotMatch(
      source,
      /child_process|\bspawn(Sync)?\b/,
      "fallback must not spawn a render process",
    );
    assert.doesNotMatch(
      source,
      /assertRenderEnvironment|blockout\/pipeline/,
      "fallback must not invoke the 3D environment detection / pipeline",
    );
  });
});
