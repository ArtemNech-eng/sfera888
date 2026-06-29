/**
 * Property test for `withStep` / `BlockoutStepError`: сообщение о сбое шага
 * `Blockout_Pipeline` всегда называет сбойный шаг и причину.
 *
 * Feature: ai-design-3d-blockout, Property 27: Сообщение о сбое называет шаг
 * и причину.
 *
 * **Validates: Requirements 13.5**
 *
 * Module under test:
 *   - `withStep` / `BlockoutStepError` from
 *     `artifacts/api-server/src/lib/blockout/pipeline.ts`
 *
 * Property verified here:
 *   For ANY `Blockout_Pipeline` step name and ANY failure reason, when the
 *   wrapped function throws, `withStep` rejects with a `BlockoutStepError`
 *   whose `.step` equals the step name and whose `.reason` includes the
 *   original failure reason, whose `.message` mentions BOTH the step and the
 *   reason, and the injected `StepLogger` receives a
 *   `{ status: "fail", step, reason }` journal entry (Req 13.5).
 *
 *   No network/DB/Blender is touched: the wrapped function simply throws an
 *   `Error(reason)`, and the logger is an in-memory array sink.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import type { StepLogEntry } from "../../src/lib/blockout/pipeline.js";

// `pipeline.ts` transitively imports `@workspace/db` (via designCostGuard /
// seoPublish chains), which **throws** at module-eval time when `DATABASE_URL`
// is missing (it constructs a pg.Pool). Static `import` declarations are
// hoisted above regular code, so set a fake DSN here and pull the module in
// via dynamic `await import(...)` below. The pool is lazy — nothing here runs
// a query.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";

const { withStep, BlockoutStepError } = await import(
  "../../src/lib/blockout/pipeline.ts"
);

// ─── Generators ──────────────────────────────────────────────────────────────

// Непустое имя шага пайплайна (идентификатор сбойного шага — Req 13.5).
const stepArb = fc.string({ minLength: 1, maxLength: 80 });

// Непустая причина сбоя (человекочитаемое сообщение об ошибке — Req 13.5).
const reasonArb = fc.string({ minLength: 1, maxLength: 200 });

// ─── Test ──────────────────────────────────────────────────────────────────

describe("withStep Property 27: сообщение о сбое называет шаг и причину", () => {
  // ---------------------------------------------------------------------------
  // Property 27 — при сбое шага withStep отклоняется BlockoutStepError, чьи
  // step/reason/message называют шаг и причину, а логгер получает запись fail.
  // Validates: Requirements 13.5
  // ---------------------------------------------------------------------------
  it("отклоняется BlockoutStepError со шагом и причиной и логирует fail-запись", async () => {
    await fc.assert(
      fc.asyncProperty(stepArb, reasonArb, async (step, reason) => {
        // Инъецируемый логгер: собирает все записи журнала шагов в память.
        const entries: StepLogEntry[] = [];
        const logger = (entry: StepLogEntry): void => {
          entries.push(entry);
        };

        // Шаг бросает ошибку с произвольной причиной — withStep должен
        // нормализовать её в BlockoutStepError, называющий шаг и причину.
        let caught: unknown;
        try {
          await withStep(step, logger, async () => {
            throw new Error(reason);
          });
          assert.fail("withStep должен был отклониться при сбое шага");
        } catch (err) {
          caught = err;
        }

        // (Req 13.5) Отклонение — именно BlockoutStepError.
        assert.ok(
          caught instanceof BlockoutStepError,
          "ожидался BlockoutStepError",
        );
        const error = caught as InstanceType<typeof BlockoutStepError>;

        // (Req 13.5) .step называет сбойный шаг.
        assert.equal(error.step, step);

        // (Req 13.5) .reason содержит исходную причину сбоя.
        assert.ok(
          error.reason.includes(reason),
          `reason "${error.reason}" должен содержать причину "${reason}"`,
        );

        // (Req 13.5) .message называет И шаг, И причину.
        assert.ok(
          error.message.includes(step),
          `message "${error.message}" должен называть шаг "${step}"`,
        );
        assert.ok(
          error.message.includes(reason),
          `message "${error.message}" должен называть причину "${reason}"`,
        );

        // (Req 13.5) Логгер получил запись о сбое с тем же шагом и причиной.
        const failEntry = entries.find((e) => e.status === "fail");
        assert.ok(failEntry, "логгер должен получить запись со status=fail");
        assert.equal(failEntry.step, step);
        assert.equal(failEntry.reason, reason);
      }),
      { numRuns: 100 },
    );
  });
});
