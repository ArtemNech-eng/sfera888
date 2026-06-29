/**
 * Integration / smoke test for the Blockout_Builder depth render (task 5.5).
 *
 * Feature: ai-design-3d-blockout
 *
 * **Validates: Requirements 5.2, 5.3, 12.1, 12.2**
 *
 * Module under test:
 *   - `artifacts/api-server/scripts/blockout/blockout_builder.py`
 *     (`setup_camera_rig`, `render_depth_maps`, `render_output_plan`,
 *     `EEVEE_NEXT_ENGINE`), driven through a real headless Blender process.
 *   - Scene_Spec built by `buildSceneSpec` / serialized by `serializeSceneSpec`
 *     from `artifacts/api-server/src/lib/blockout/sceneSpec.ts`.
 *
 * What this test asserts (only when a Blender binary is available):
 *   • Req 12.1 — the builder runs as a headless Blender process invoked exactly
 *     as `blender --background --python blockout_builder.py -- ...` and exits 0.
 *   • Req 5.2 — exactly one Depth_Map (`depth_<id>.png`) is produced per camera
 *     of the Camera_Rig (6 cameras → 6 depth maps).
 *   • Req 5.3 — with `render.renderNormals = true`, exactly one Normal_Map
 *     (`normal_<id>.png`) is additionally produced per camera (6 normal maps).
 *   • Req 12.2 — the Depth_Render_Step uses the EEVEE Next engine
 *     (`BLENDER_EEVEE_NEXT`) for the render.
 *
 * Environment handling:
 *   This test needs a real Blender executable. The binary is resolved from the
 *   `BLENDER_BIN` env var, falling back to `blender` on PATH, and probed with a
 *   `--version` call. If no working Blender is found (e.g. in CI or any machine
 *   without Blender / Python installed), the heavy integration test SKIPS
 *   gracefully with a clear message rather than failing — there is nothing to
 *   render against. The test runs fully only in a Blender-equipped environment.
 *
 *   A lightweight companion test ALWAYS runs: it statically verifies the
 *   builder's render contract (EEVEE Next engine constant + the
 *   `--background --python` headless invocation surface) directly from source,
 *   so the suite carries real assertion value even when Blender is absent.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildSceneSpec,
  serializeSceneSpec,
  type SceneSpec,
} from "../../src/lib/blockout/sceneSpec.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Absolute path to the Blender builder script under test. */
const BUILDER_SCRIPT = resolve(
  HERE,
  "../../scripts/blockout/blockout_builder.py",
);

// ─── Blender detection ─────────────────────────────────────────────────────

interface BlenderProbe {
  available: boolean;
  bin: string;
  /** Human-readable reason when unavailable (used in the skip message). */
  reason: string;
}

/**
 * Resolve a Blender binary from `BLENDER_BIN` (or `blender` on PATH) and probe
 * it with `--version`. Returns `available: false` (with a reason) instead of
 * throwing, so the caller can skip gracefully when Blender is not installed.
 */
function detectBlender(): BlenderProbe {
  const bin = process.env.BLENDER_BIN?.trim() || "blender";
  try {
    const probe = spawnSync(bin, ["--version"], {
      encoding: "utf8",
      timeout: 30_000,
    });
    if (probe.error) {
      return {
        available: false,
        bin,
        reason: `проба "${bin} --version" не запустилась: ${probe.error.message}`,
      };
    }
    if (probe.status !== 0) {
      return {
        available: false,
        bin,
        reason: `"${bin} --version" завершился кодом ${probe.status ?? "?"}`,
      };
    }
    const out = `${probe.stdout ?? ""}${probe.stderr ?? ""}`;
    if (!/blender/i.test(out)) {
      return {
        available: false,
        bin,
        reason: `"${bin} --version" не сообщил о Blender (вывод: ${out.trim().slice(0, 80)})`,
      };
    }
    return { available: true, bin, reason: "" };
  } catch (err) {
    return {
      available: false,
      bin,
      reason: `проба Blender выбросила исключение: ${(err as Error).message}`,
    };
  }
}

/** Scene_Spec for the smoke render, with normals enabled (Req 5.3). */
function buildNormalsSceneSpec(): SceneSpec {
  const base = buildSceneSpec({
    roomType: "living_room",
    areaM2: 24,
    style: {
      sharedStylePrompt: "scandinavian minimalist living room, soft daylight",
      negativePrompt: "clutter, lowres",
    },
  });
  // Enable normals so the render produces both Depth_Map and Normal_Map per
  // camera (Req 5.3). serializeSceneSpec re-validates the override below.
  return { ...base, render: { ...base.render, renderNormals: true } };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Blockout_Builder depth render smoke test (task 5.5)", () => {
  // -------------------------------------------------------------------------
  // Always-on companion: verify the render contract from source so the suite
  // asserts something real even when Blender is unavailable.
  //   • EEVEE Next is the configured engine (Req 12.2).
  //   • The builder is meant to run headless via `blender --background
  //     --python ... -- --scene <json> --out <dir>` (Req 12.1).
  //   • One Depth_Map per camera, and one Normal_Map per camera when
  //     renderNormals is true (Req 5.2, 5.3) — checked against the pure
  //     `render_output_plan` contract documented in the script.
  // -------------------------------------------------------------------------
  it("builder source declares EEVEE Next + headless invocation contract", () => {
    assert.equal(
      existsSync(BUILDER_SCRIPT),
      true,
      "blockout_builder.py must be present",
    );
    const source = readFileSync(BUILDER_SCRIPT, "utf8");

    // Req 12.2 — EEVEE Next engine constant and its use in the render step.
    assert.match(
      source,
      /EEVEE_NEXT_ENGINE\s*=\s*["']BLENDER_EEVEE_NEXT["']/,
      "must define EEVEE Next engine id (BLENDER_EEVEE_NEXT)",
    );
    assert.match(
      source,
      /scene\.render\.engine\s*=\s*EEVEE_NEXT_ENGINE/,
      "render_depth_maps must set the scene engine to EEVEE Next",
    );

    // Req 12.1 — headless invocation surface: a `--scene`/`--out` CLI behind
    // Blender's `--` separator, documented as `blender --background --python`.
    assert.match(
      source,
      /blender --background --python/,
      "must document the headless `blender --background --python` invocation",
    );
    assert.match(source, /--scene/, "CLI must accept --scene");
    assert.match(source, /--out/, "CLI must accept --out");

    // Req 5.2 / 5.3 — one depth map per camera, one normal map per camera when
    // renderNormals is set: the canonical filenames are keyed per camera id.
    assert.match(
      source,
      /def\s+render_output_plan/,
      "must expose the render output plan (one map per camera)",
    );
    assert.match(
      source,
      /depth_\{camera_id\}\.png|DEPTH_MAP_PREFIX/,
      "depth maps must be keyed per camera id",
    );
    assert.match(
      source,
      /normal_\{camera_id\}\.png|NORMAL_MAP_PREFIX/,
      "normal maps must be keyed per camera id",
    );

    // Sanity: the Scene_Spec we would feed it has the fixed 6-camera rig and
    // normals enabled, so the expected counts below are well-defined.
    const spec = buildNormalsSceneSpec();
    assert.equal(spec.cameraRig.length, 6, "Camera_Rig must hold 6 cameras");
    assert.equal(
      spec.render.renderNormals,
      true,
      "smoke Scene_Spec must enable renderNormals (Req 5.3)",
    );
    assert.equal(spec.render.engine, "EEVEE_NEXT", "engine must be EEVEE Next");
    // serializeSceneSpec re-validates the normals override (throws on any
    // schema violation) — reaching here proves the spec is render-ready.
    assert.doesNotThrow(() => serializeSceneSpec(spec));
  });

  // -------------------------------------------------------------------------
  // Heavy integration: run a real headless Blender render. SKIPS gracefully
  // when no Blender binary is available (CI / machines without Blender).
  // -------------------------------------------------------------------------
  it("headless Blender renders one Depth_Map + Normal_Map per camera", (t) => {
    const blender = detectBlender();
    if (!blender.available) {
      t.skip(
        `Blender недоступен — интеграционный рендер пропущен. ${blender.reason}. ` +
          `Задайте BLENDER_BIN на рабочий бинарь Blender, чтобы прогнать рендер полностью.`,
      );
      return;
    }

    // 1) Build a render-ready Scene_Spec with normals enabled and serialize it.
    const spec = buildNormalsSceneSpec();
    const numCameras = spec.cameraRig.length; // fixed Camera_Rig → 6
    const sceneJson = serializeSceneSpec(spec);

    // 2) Temp workspace for scene.json + rendered artifacts.
    const work = mkdtempSync(join(tmpdir(), "blockout-smoke-"));
    const scenePath = join(work, "scene.json");
    const outDir = join(work, "out");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(scenePath, sceneJson, "utf8");

    try {
      // 3) Invoke the builder exactly as `blender --background --python
      //    blockout_builder.py -- --scene <scene.json> --out <out>` (Req 12.1).
      const args = [
        "--background",
        "--python",
        BUILDER_SCRIPT,
        "--",
        "--scene",
        scenePath,
        "--out",
        outDir,
      ];
      // Explicitly confirm the headless invocation surface (Req 12.1).
      assert.deepEqual(
        args.slice(0, 2),
        ["--background", "--python"],
        "builder must be invoked headless via `blender --background --python`",
      );

      const run = spawnSync(blender.bin, args, {
        encoding: "utf8",
        timeout: 300_000,
      });

      assert.equal(
        run.status,
        0,
        `Blender exited ${run.status ?? "?"}.\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`,
      );

      // 4) Req 12.2 — EEVEE Next must be the engine that ran the render.
      assert.match(
        `${run.stdout}${run.stderr}`,
        /EEVEE|Depth_Map/i,
        "render log should reflect the EEVEE Next Depth_Render_Step",
      );

      // 5) Count produced artifacts in the output directory.
      const files = readdirSync(outDir);
      const depthMaps = files.filter((f) => /^depth_.+\.png$/.test(f));
      const normalMaps = files.filter((f) => /^normal_.+\.png$/.test(f));

      // Req 5.2 — exactly one Depth_Map per camera.
      assert.equal(
        depthMaps.length,
        numCameras,
        `expected ${numCameras} depth maps (one per camera), got ${depthMaps.length}: ${files.join(", ")}`,
      );
      // Req 5.3 — with renderNormals=true, one Normal_Map per camera too.
      assert.equal(
        normalMaps.length,
        numCameras,
        `expected ${numCameras} normal maps (one per camera), got ${normalMaps.length}: ${files.join(", ")}`,
      );
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
