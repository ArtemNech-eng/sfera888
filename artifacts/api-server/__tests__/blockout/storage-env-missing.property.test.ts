/**
 * Property test for Object_Storage env-variable validation.
 *
 * Feature: ai-design-3d-blockout, Property 20: Отсутствие env-переменной
 * хранилища называет переменную.
 *
 * **Validates: Requirements 10.3**
 *
 * Module under test:
 *   - `assertStorageEnv`, `uploadDepthMaps`, `uploadBoard`,
 *     `REQUIRED_STORAGE_ENV_VARS` from
 *     `artifacts/api-server/src/lib/blockout/storage.ts`.
 *
 * Property 20 (Отсутствие env-переменной называет переменную):
 *   For any required `Object_Storage` env variable, if it is not set (deleted
 *   or blank), the upload step fails with an error whose message contains the
 *   name of exactly that missing variable. Because `assertStorageEnv` checks
 *   `REQUIRED_STORAGE_ENV_VARS` in a fixed order and all *other* variables are
 *   set to valid values, the single unset variable is always the first (and
 *   only) missing one — so the error must name it.
 *
 * The arbitraries (built on the same node:test + fast-check pattern as
 * `__tests__/dizajn/layout-json-roundtrip.property.test.ts`):
 *   - `targetVarArb`     — which required variable to unset;
 *   - `unsetModeArb`     — how to unset it (delete the key, or set it to an
 *                          empty / whitespace-only string);
 *   - `validValueArb`    — a non-blank value for every other required variable.
 *
 * `process.env` is snapshotted and fully restored around every iteration, so
 * the test leaves the ambient environment untouched.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  assertStorageEnv,
  uploadDepthMaps,
  uploadBoard,
  REQUIRED_STORAGE_ENV_VARS,
} from "../../src/lib/blockout/storage.js";

// ─── Generators ──────────────────────────────────────────────────────────────

/** The required variable that will be left unset in a given scenario. */
const targetVarArb = fc.constantFrom(...REQUIRED_STORAGE_ENV_VARS);

/**
 * How the target variable is "not set": either removed entirely, or present
 * but blank (empty / whitespace-only) — both must count as missing per
 * `assertStorageEnv` (Requirement 10.3).
 */
const unsetModeArb = fc.constantFrom<string | undefined>(
  undefined, // delete the key
  "", // empty string
  " ", // single space
  "   ", // multiple spaces
  "\t", // tab
  "\n", // newline
  " \t\n ", // mixed whitespace
);

/** A non-blank value used for every required variable that stays set. */
const validValueArb = fc
  .string({ minLength: 1, maxLength: 24 })
  .filter((s) => s.trim() !== "");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Run `fn` with `process.env` configured so that every required variable is
 * set to a valid value except `target`, which is unset via `unsetMode`.
 * Restores all required-variable env entries afterwards regardless of outcome.
 */
function withMissingVar(
  target: (typeof REQUIRED_STORAGE_ENV_VARS)[number],
  unsetMode: string | undefined,
  validValue: string,
  fn: () => void | Promise<void>,
): void | Promise<void> {
  const saved = new Map<string, string | undefined>();
  for (const name of REQUIRED_STORAGE_ENV_VARS) {
    saved.set(name, process.env[name]);
  }

  const restore = () => {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };

  try {
    for (const name of REQUIRED_STORAGE_ENV_VARS) {
      process.env[name] = validValue;
    }
    if (unsetMode === undefined) delete process.env[target];
    else process.env[target] = unsetMode;

    const result = fn();
    if (result instanceof Promise) {
      return result.finally(restore);
    }
    restore();
    return result;
  } catch (err) {
    restore();
    throw err;
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Object_Storage Property 20: a missing env variable is named in the error", () => {
  // -----------------------------------------------------------------------
  // Property 20 — assertStorageEnv names exactly the missing variable.
  // Validates: Requirements 10.3
  // -----------------------------------------------------------------------
  it("assertStorageEnv throws an error whose message contains the missing variable's name", () => {
    fc.assert(
      fc.property(
        targetVarArb,
        unsetModeArb,
        validValueArb,
        (target, unsetMode, validValue) => {
          withMissingVar(target, unsetMode, validValue, () => {
            assert.throws(
              () => assertStorageEnv(),
              (err: unknown) => {
                assert.ok(err instanceof Error, "thrown value must be an Error");
                assert.ok(
                  err.message.includes(target),
                  `error message ${JSON.stringify(
                    err.message,
                  )} must name the missing variable "${target}"`,
                );
                return true;
              },
            );
          });
        },
      ),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 20 — the public upload entry points reject naming the variable.
  // Validates: Requirements 10.3
  // -----------------------------------------------------------------------
  it("uploadDepthMaps rejects with an error naming the missing variable (before any upload)", async () => {
    await fc.assert(
      fc.asyncProperty(
        targetVarArb,
        unsetModeArb,
        validValueArb,
        async (target, unsetMode, validValue) => {
          await withMissingVar(target, unsetMode, validValue, async () => {
            await assert.rejects(
              () =>
                uploadDepthMaps(
                  [{ cameraId: "cam_top", png: Buffer.alloc(0) }],
                  { projectId: "p1" },
                ),
              (err: unknown) => {
                assert.ok(err instanceof Error, "rejection must be an Error");
                assert.ok(
                  err.message.includes(target),
                  `rejection message ${JSON.stringify(
                    err.message,
                  )} must name the missing variable "${target}"`,
                );
                return true;
              },
            );
          });
        },
      ),
      { numRuns: 60 },
    );
  });

  it("uploadBoard rejects with an error naming the missing variable (before any upload)", async () => {
    await fc.assert(
      fc.asyncProperty(
        targetVarArb,
        unsetModeArb,
        validValueArb,
        async (target, unsetMode, validValue) => {
          await withMissingVar(target, unsetMode, validValue, async () => {
            await assert.rejects(
              () => uploadBoard(Buffer.alloc(0), { projectId: "p1" }),
              (err: unknown) => {
                assert.ok(err instanceof Error, "rejection must be an Error");
                assert.ok(
                  err.message.includes(target),
                  `rejection message ${JSON.stringify(
                    err.message,
                  )} must name the missing variable "${target}"`,
                );
                return true;
              },
            );
          });
        },
      ),
      { numRuns: 60 },
    );
  });
});
