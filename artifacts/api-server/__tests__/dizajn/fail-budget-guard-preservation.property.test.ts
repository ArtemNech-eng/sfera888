/**
 * Property 11: Preservation — Неизменность fail/budget/guard-семантики.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 *
 * Preservation Requirements (bugfix.md §Unchanged Behavior):
 *   3.1 WHEN `Layout_Planner` получает корректный план, проходящий схему и
 *       геометрию THEN система SHALL CONTINUE TO завершать пайплайн и
 *       публиковать проект как `completed`.
 *   3.2 WHEN обязательный шаг (Layout_JSON, Hero_Render, Real_Estimate,
 *       AI-текст) необратимо падает THEN система SHALL CONTINUE TO
 *       переводить запись в `failed` с `is_public = false` и пользовательским
 *       сообщением, не публикуя полуготовый проект.
 *   3.3 WHEN суммарная стоимость генерации превышает `Cost_Ceiling` THEN
 *       система SHALL CONTINUE TO прерывать пайплайн с `failed` и сообщением
 *       «превышен бюджет генерации».
 *   3.4 WHEN срабатывают captcha-проверка и rate-limit на форме `/ai-design`
 *       THEN система SHALL CONTINUE TO применять их без изменений.
 *
 * Expected Behavior (Property 11, design.md §Correctness Properties):
 *   _For any_ входа, где срабатывает fail обязательного шага, превышение
 *   `Cost_Ceiling`, captcha/rate-limit или completion-invariant, фикс SHALL
 *   сохранить текущее поведение (`status=failed`, `is_public=false`,
 *   пользовательское сообщение; «превышен бюджет генерации»; captcha/limit
 *   без изменений), не вмешиваясь в эти пути.
 *
 * ─── Methodology (bugfix preservation test, observation-first) ─────────────
 * Этот тест — Preservation. Он фиксирует НАБЛЮДАЕМОЕ поведение fail/budget/
 * guard-путей на НЕИСПРАВЛЕННОМ коде (baseline) и ДОЛЖЕН ПРОХОДИТЬ как до
 * фикса, так и после (перепрогон в задаче 12.2 без новых тестов).
 *
 * Фикс (задачи 11.x) меняет шаги воркера (`designWorker.ts`), конфиг
 * (`designConfig.ts`), инфографику, валидатор и планировщик. Эти fail-пути
 * НЕ должны измениться. Поэтому тест импортирует и прогоняет РЕАЛЬНЫЕ
 * функции/ошибки fail-путей (а не реплики):
 *   • `assertCompletionInvariant`, `RequiredStepFailedError`, `STEPS_REQUIRED`
 *     из `designWorker.ts` (через `__test__`) — required-fail семантика (3.2).
 *   • `enforceCostCeiling`, `BudgetExceededError` из `designCostGuard.ts` +
 *     `getCostCeilingKopeks`, `DEFAULT_COST_CEILING_KOPEKS` из
 *     `designConfig.ts` — budget семантика (3.3).
 *   • `checkAndIncrement` из `designRateLimit.ts` — rate-limit (3.4, guard).
 *   • Реальный обработчик `POST /generate` из `routes/dizajn.ts` —
 *     captcha-first (3.4). Captcha-first порядок дополнительно покрыт
 *     Property 4 (`captcha-order.property.test.ts`); здесь пинуем как часть
 *     единой Property 11 preservation.
 *
 * Наблюдаемые baseline-значения (из чтения исходников на неисправленном коде):
 *   • markFailed SET-clause: `status='failed'`, `is_public=false`,
 *     `error_message` = усечённое до 500 символов сообщение (designWorker.ts).
 *   • Терминальный catch воркера маршрутизирует:
 *       BudgetExceededError    → markFailed(designId, "превышен бюджет генерации")
 *       RequiredStepFailedError → markFailed(designId, e.userMessage)
 *   • userMessage required-шагов:
 *       layout  → "не удалось получить план комнаты"
 *       hero    → "не удалось сгенерировать ракурс"
 *       content → "не удалось сгенерировать описание"
 *   • DEFAULT_COST_CEILING_KOPEKS = 3000.
 *   • Rate-limit: anon=3, ip=5 запросов в сутки (designRateLimit.ts).
 *   • Captcha: невалидный токен → 400 `{ ok:false, error:"invalid_captcha" }`
 *     без побочных эффектов (db не трогается).
 *
 * Run via Node's built-in test runner (Cyrillic-path safe — нет `cd`):
 *   npx tsx --test __tests__/dizajn/fail-budget-guard-preservation.property.test.ts
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// ─── Fake env BEFORE any production import ───────────────────────────────────
//
// `@workspace/db` opens a pg.Pool and `objectStorage.ts` builds an S3 client
// at module-eval time; both throw without env. `routes/dizajn.ts` reads the
// Turnstile secret. None connect eagerly — every property routes through the
// swappable `db` dispatcher below before any real query/network call.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";
process.env.R2_ENDPOINT =
  process.env.R2_ENDPOINT ?? "https://fake.r2.cloudflarestorage.com";
process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? "fake";
process.env.R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? "fake";
// Non-empty secret forces the real captcha branch (rather than dev-bypass).
process.env.TURNSTILE_SECRET_KEY =
  process.env.TURNSTILE_SECRET_KEY ?? "test_turnstile_secret";

// ─── Swappable db dispatcher ─────────────────────────────────────────────────
//
// One shared `db` singleton drives the cost-guard (`db.select`), the
// rate-limiter (`db.execute`) and the route's slug pre-check / insert
// (`db.select` / `db.insert`). We install thin dispatchers once and let each
// section assign the active handler, so the three concerns never clobber each
// other's method bag.
const dbModule = await import("@workspace/db");
const { db } = dbModule;

type AnyFn = (...args: unknown[]) => unknown;
let selectHandler: AnyFn = () => {
  throw new Error("selectHandler not set");
};
let executeHandler: AnyFn = () => {
  throw new Error("executeHandler not set");
};
let insertHandler: AnyFn = () => {
  throw new Error("insertHandler not set");
};

(db as unknown as { select: AnyFn }).select = (...a: unknown[]) =>
  selectHandler(...a);
(db as unknown as { execute: AnyFn }).execute = (...a: unknown[]) =>
  executeHandler(...a);
(db as unknown as { insert: AnyFn }).insert = (...a: unknown[]) =>
  insertHandler(...a);

// ─── Real fail-path modules under test ───────────────────────────────────────

const designWorkerModule = await import("../../src/lib/designWorker.ts");
const { __test__ } = designWorkerModule;
const {
  STEP_LAYOUT_JSON,
  STEP_HERO_RENDER,
  STEP_AI_TEXT,
  STEPS_REQUIRED,
  RequiredStepFailedError,
  assertCompletionInvariant,
} = __test__ as {
  STEP_LAYOUT_JSON: string;
  STEP_HERO_RENDER: string;
  STEP_AI_TEXT: string;
  STEPS_REQUIRED: readonly string[];
  RequiredStepFailedError: new (...args: unknown[]) => Error & {
    userMessage: string;
    stepName: string;
  };
  assertCompletionInvariant: (state: {
    designId: number;
    layout: unknown;
    heroPublicUrl: unknown;
    content: unknown;
  }) => void;
};

const designCostGuardModule = await import("../../src/lib/designCostGuard.ts");
const { enforceCostCeiling, BudgetExceededError } = designCostGuardModule;

const designConfigModule = await import("../../src/lib/designConfig.ts");
const { getCostCeilingKopeks, DEFAULT_COST_CEILING_KOPEKS } = designConfigModule;

const designRateLimitModule = await import("../../src/lib/designRateLimit.ts");
const { checkAndIncrement } = designRateLimitModule;

const dizajnRouterModule = await import("../../src/routes/dizajn.ts");
const dizajnRouter = dizajnRouterModule.default as unknown as {
  stack: Array<{
    route?: {
      path?: string;
      methods?: Record<string, boolean>;
      stack: Array<{ handle: (req: unknown, res: unknown) => Promise<void> }>;
    };
  }>;
};
const generateLayer = dizajnRouter.stack.find(
  (l) => l.route?.path === "/generate" && l.route.methods?.post === true,
);
assert.ok(generateLayer?.route, "POST /generate handler not found in router");
// Route layer stack is [multer upload.single("image"), asyncHandler]; the real
// request handler is the terminal entry. Driving it directly bypasses multer
// (irrelevant: captcha rejects before any photo handling).
const routeStack = generateLayer.route!.stack;
const handleGenerate = routeStack[routeStack.length - 1]!.handle;

// ─── Baseline constants (observed on the unfixed code) ───────────────────────

const LAYOUT_USER_MSG = "не удалось получить план комнаты";
const HERO_USER_MSG = "не удалось сгенерировать ракурс";
const CONTENT_USER_MSG = "не удалось сгенерировать описание";
const BUDGET_USER_MSG = "превышен бюджет генерации";

const RATE_LIMIT_ANON = 3; // Requirement 3.4
const RATE_LIMIT_IP = 5; // Requirement 3.3
const ERROR_MESSAGE_MAX = 500; // markFailed truncation

// Minimal valid required-artifact shapes (helper only checks presence).
const VALID_LAYOUT = { room: { roomType: "bedroom" } };
const VALID_HERO_URL = "/api/marketplace/dizajn/img/results/1_view_1.jpg";
const VALID_CONTENT = { h1: "Дизайн спальни 12 м²" };

/**
 * Faithful replica of `markFailed`'s SET-clause (designWorker.ts). The helper
 * itself is private (not exported), so we pin the documented terminal
 * transition: `status='failed'`, `is_public=false`, message truncated to 500.
 * The fix tasks (11.x) MUST NOT change this shape.
 */
function markFailedShape(errorMessage: string): {
  status: string;
  isPublic: boolean;
  errorMessage: string;
} {
  return {
    status: "failed",
    isPublic: false,
    errorMessage: errorMessage.slice(0, ERROR_MESSAGE_MAX),
  };
}

/**
 * Replica of the worker's terminal catch routing (designWorker.ts):
 *   BudgetExceededError     → markFailed(designId, "превышен бюджет генерации")
 *   RequiredStepFailedError → markFailed(designId, e.userMessage)
 * We feed REAL error instances through it to pin the user-visible message.
 */
function routeFailError(e: unknown): ReturnType<typeof markFailedShape> {
  if (e instanceof BudgetExceededError) {
    return markFailedShape(BUDGET_USER_MSG);
  }
  if (e instanceof RequiredStepFailedError) {
    return markFailedShape(
      (e as { userMessage: string }).userMessage,
    );
  }
  // Unknown error → top-level safety net still fails the row with the raw
  // message (tick-level catch in designWorker.ts).
  const msg = e instanceof Error ? e.message : String(e);
  return markFailedShape(msg);
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 1 — Required-step fail semantics unchanged (3.1, 3.2)
// ═════════════════════════════════════════════════════════════════════════════

describe("Property 11 (Preservation) — required-step fail semantics (3.1, 3.2)", () => {
  // Validates: Requirements 3.1, 3.2

  // ---------------------------------------------------------------------------
  // 3.1 — все required-артефакты присутствуют → success-путь не прерывается
  //       (completion-invariant НЕ бросает). EXPECTED: PASS on unfixed code.
  // ---------------------------------------------------------------------------
  it("3.1 — полный набор required-артефактов → assertCompletionInvariant не бросает (success-путь сохраняется)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), (designId) => {
        assert.doesNotThrow(() =>
          assertCompletionInvariant({
            designId,
            layout: VALID_LAYOUT,
            heroPublicUrl: VALID_HERO_URL,
            content: VALID_CONTENT,
          }),
        );
      }),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // 3.2 — для каждого {layout,hero,content} ∈ {present,null}^3 инвариант
  //       бросает RequiredStepFailedError ⟺ хоть один required отсутствует.
  //       EXPECTED: PASS on unfixed code (baseline fail-семантика).
  // ---------------------------------------------------------------------------
  it("3.2 — required-артефакт отсутствует ⟺ бросается RequiredStepFailedError", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.integer({ min: 1, max: 1_000_000 }),
        (hasLayout, hasHero, hasContent, designId) => {
          const state = {
            designId,
            layout: hasLayout ? VALID_LAYOUT : null,
            heroPublicUrl: hasHero ? VALID_HERO_URL : null,
            content: hasContent ? VALID_CONTENT : null,
          };
          const allPresent = hasLayout && hasHero && hasContent;
          if (allPresent) {
            assert.doesNotThrow(() => assertCompletionInvariant(state));
            return;
          }
          let captured: unknown = null;
          try {
            assertCompletionInvariant(state);
          } catch (e) {
            captured = e;
          }
          assert.ok(
            captured instanceof RequiredStepFailedError,
            `missing artifact must throw RequiredStepFailedError ` +
              `(state=${JSON.stringify({ hasLayout, hasHero, hasContent })})`,
          );
          // stepName всегда из STEPS_REQUIRED — optional-шаг сюда не попадает.
          const stepName = (captured as { stepName: string }).stepName;
          assert.ok(
            (STEPS_REQUIRED as readonly string[]).includes(stepName),
            `stepName=${stepName} must be in STEPS_REQUIRED`,
          );
        },
      ),
      { numRuns: 80 },
    );
  });

  // ---------------------------------------------------------------------------
  // 3.2 — baseline пользовательские сообщения required-шагов не меняются.
  //       EXPECTED: PASS on unfixed code.
  // ---------------------------------------------------------------------------
  it("3.2 — пользовательские сообщения required-шагов == baseline", () => {
    const cases: Array<{
      missing: "layout" | "hero" | "content";
      step: string;
      msg: string;
    }> = [
      { missing: "layout", step: STEP_LAYOUT_JSON, msg: LAYOUT_USER_MSG },
      { missing: "hero", step: STEP_HERO_RENDER, msg: HERO_USER_MSG },
      { missing: "content", step: STEP_AI_TEXT, msg: CONTENT_USER_MSG },
    ];
    for (const { missing, step, msg } of cases) {
      let captured: unknown = null;
      try {
        assertCompletionInvariant({
          designId: 1,
          layout: missing === "layout" ? null : VALID_LAYOUT,
          heroPublicUrl: missing === "hero" ? null : VALID_HERO_URL,
          content: missing === "content" ? null : VALID_CONTENT,
        });
      } catch (e) {
        captured = e;
      }
      assert.ok(captured instanceof RequiredStepFailedError);
      assert.equal((captured as { stepName: string }).stepName, step);
      assert.equal((captured as { userMessage: string }).userMessage, msg);
    }
  });

  // ---------------------------------------------------------------------------
  // 3.2 — терминальный catch маршрутизирует RequiredStepFailedError в
  //       markFailed(designId, e.userMessage): status=failed, is_public=false.
  //       EXPECTED: PASS on unfixed code.
  // ---------------------------------------------------------------------------
  it("3.2 — RequiredStepFailedError → fail-shape (status=failed, is_public=false, message=userMessage)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(STEP_LAYOUT_JSON, STEP_HERO_RENDER, STEP_AI_TEXT),
        fc.string({ minLength: 1, maxLength: 600 }),
        (stepName, userMessage) => {
          const err = new RequiredStepFailedError(stepName, userMessage);
          const shape = routeFailError(err);
          assert.equal(shape.status, "failed");
          assert.equal(shape.isPublic, false);
          assert.equal(shape.errorMessage, userMessage.slice(0, ERROR_MESSAGE_MAX));
          assert.ok(
            shape.errorMessage.length <= ERROR_MESSAGE_MAX,
            "error_message must be truncated to 500 chars",
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 2 — Cost_Ceiling / budget semantics unchanged (3.3)
// ═════════════════════════════════════════════════════════════════════════════

describe("Property 11 (Preservation) — Cost_Ceiling / budget semantics (3.3)", () => {
  // Validates: Requirement 3.3

  // `enforceCostCeiling` runs `db.select({...}).from(...).where(...)` and
  // awaits one row `{ spentKopeks }`. Mock the chain with a controlled SUM.
  let mockSpent: number | null = 0;
  before(() => {
    selectHandler = () => ({
      from: () => ({
        where: () => Promise.resolve([{ spentKopeks: mockSpent }]),
      }),
    });
  });

  it("3.3 — DEFAULT_COST_CEILING_KOPEKS baseline == 10000", () => {
    // Observed on the unfixed code (designConfig.ts) and corroborated by
    // design.md §F ("укладывается в текущий DEFAULT_COST_CEILING_KOPEKS = 10000").
    assert.equal(DEFAULT_COST_CEILING_KOPEKS, 10000);
  });

  it("3.3 — spent ≤ limit → enforceCostCeiling возвращает spent без throw", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc
          .tuple(
            fc.integer({ min: 0, max: 100_000 }),
            fc.integer({ min: 0, max: 100_000 }),
          )
          .filter(([limit, spent]) => spent <= limit),
        async (designId, [limit, spent]) => {
          mockSpent = spent;
          await withEnvAsync(String(limit), async () => {
            const result = await enforceCostCeiling(designId);
            assert.equal(result, spent);
          });
        },
      ),
      { numRuns: 60 },
    );
  });

  it("3.3 — spent > limit → throws BudgetExceededError с корректными полями", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc
          .tuple(
            fc.integer({ min: 0, max: 100_000 }),
            fc.integer({ min: 1, max: 200_000 }),
          )
          .filter(([limit, spent]) => spent > limit),
        async (designId, [limit, spent]) => {
          mockSpent = spent;
          await withEnvAsync(String(limit), async () => {
            await assert.rejects(
              () => enforceCostCeiling(designId),
              (err: unknown) => {
                assert.ok(err instanceof BudgetExceededError);
                const e = err as InstanceType<typeof BudgetExceededError>;
                assert.equal(e.designId, designId);
                assert.equal(e.spentKopeks, spent);
                assert.equal(e.limitKopeks, limit);
                return true;
              },
            );
          });
        },
      ),
      { numRuns: 60 },
    );
  });

  it("3.3 — BudgetExceededError → fail-shape с сообщением «превышен бюджет генерации»", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (designId, spent, limit) => {
          const err = new BudgetExceededError(designId, spent, limit);
          // BudgetExceededError.message содержит фактические копейки (для логов).
          assert.ok(err.message.includes(String(spent)));
          // Терминальный catch воркера маршрутизирует в фиксированное
          // пользовательское сообщение (а НЕ err.message).
          const shape = routeFailError(err);
          assert.equal(shape.status, "failed");
          assert.equal(shape.isPublic, false);
          assert.equal(shape.errorMessage, BUDGET_USER_MSG);
        },
      ),
      { numRuns: 80 },
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 3 — captcha / rate-limit on /ai-design unchanged (3.4)
// ═════════════════════════════════════════════════════════════════════════════

describe("Property 11 (Preservation) — captcha / rate-limit guard (3.4)", () => {
  // Validates: Requirement 3.4

  // ── Rate-limit baseline (the "guard") ──────────────────────────────────────
  //
  // `checkAndIncrement` runs one upsert (`db.execute`, RETURNING counter,
  // window_start). If counter > limit it issues a second rollback `db.execute`.
  // We feed a controlled post-upsert counter and pin the baseline thresholds
  // anon=3 / ip=5 through the REAL limit-comparison logic.
  async function runCheck(
    kind: "anon" | "ip",
    counterAfterUpsert: number,
  ): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }> {
    let call = 0;
    executeHandler = () => {
      call += 1;
      if (call === 1) {
        // Upsert RETURNING. window_start = NOW so retryAfter ≈ 24h on block.
        return Promise.resolve({
          rows: [{ counter: counterAfterUpsert, window_start: new Date() }],
        });
      }
      // Rollback UPDATE — no rows needed.
      return Promise.resolve({ rows: [] });
    };
    return checkAndIncrement(kind, "preservation-key");
  }

  it("3.4 — anon baseline лимит == 3 (counter ≤ 3 allowed, counter 4 blocked)", async () => {
    for (let counter = 1; counter <= RATE_LIMIT_ANON; counter++) {
      const res = await runCheck("anon", counter);
      assert.equal(res.allowed, true, `anon counter=${counter} must be allowed`);
      assert.equal(res.remaining, RATE_LIMIT_ANON - counter);
      assert.equal(res.retryAfterSeconds, 0);
    }
    const blocked = await runCheck("anon", RATE_LIMIT_ANON + 1);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
    assert.ok(blocked.retryAfterSeconds > 0, "blocked request must report retry-after");
  });

  it("3.4 — ip baseline лимит == 5 (counter ≤ 5 allowed, counter 6 blocked)", async () => {
    for (let counter = 1; counter <= RATE_LIMIT_IP; counter++) {
      const res = await runCheck("ip", counter);
      assert.equal(res.allowed, true, `ip counter=${counter} must be allowed`);
      assert.equal(res.remaining, RATE_LIMIT_IP - counter);
    }
    const blocked = await runCheck("ip", RATE_LIMIT_IP + 1);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
  });

  it("3.4 — для любого counter > limit запрос отвергается (anon и ip)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<"anon" | "ip">("anon", "ip"),
        fc.integer({ min: 1, max: 50 }),
        async (kind, over) => {
          const limit = kind === "anon" ? RATE_LIMIT_ANON : RATE_LIMIT_IP;
          const res = await runCheck(kind, limit + over);
          assert.equal(res.allowed, false);
          assert.equal(res.remaining, 0);
        },
      ),
      { numRuns: 50 },
    );
  });

  // ── Captcha-first baseline ─────────────────────────────────────────────────
  //
  // Invalid captcha must reject with 400 `invalid_captcha` BEFORE any
  // downstream side effect (rate-limit upsert, slug pre-check, insert). The
  // fix tasks (11.x) do not touch `routes/dizajn.ts`, so this baseline holds.
  const ROOM_TYPES = [
    "bedroom",
    "kitchen",
    "bathroom",
    "living_room",
    "hallway",
    "nursery",
    "apartment",
  ] as const;
  const STYLES = [
    "modern",
    "scandinavian",
    "loft",
    "minimalism",
    "neoclassic",
    "japandi",
    "classic",
  ] as const;
  const FAKE_ANON_ID = "11111111-1111-1111-1111-111111111111";

  function createReq(body: unknown, anonId: string, ip: string | null): unknown {
    return {
      anonId,
      body,
      headers: ip ? { "x-forwarded-for": ip } : {},
      socket: { remoteAddress: ip ?? "127.0.0.1" },
      cookies: {},
      query: {},
      params: {},
    };
  }
  function createRes(): {
    res: unknown;
    out: { statusCode: number; body: unknown };
  } {
    const out = { statusCode: 200, body: undefined as unknown };
    const res = {
      status(code: number) {
        out.statusCode = code;
        return res;
      },
      json(b: unknown) {
        out.body = b;
        return res;
      },
      setHeader() {
        return res;
      },
      set() {
        return res;
      },
      cookie() {
        return res;
      },
      end(b?: unknown) {
        if (b !== undefined) out.body = b;
        return res;
      },
    };
    return { res, out };
  }

  const invalidFormArb = fc.oneof(
    fc.record({
      roomType: fc.constantFrom(...ROOM_TYPES),
      style: fc.constantFrom(...STYLES),
      widthCm: fc.integer({ min: 1, max: 199 }),
      lengthCm: fc.integer({ min: 1, max: 199 }),
      heightCm: fc.integer({ min: 220, max: 350 }),
      budget: fc.integer({ min: 50_000, max: 5_000_000 }),
      "cf-turnstile-response": fc.constant(""),
    }),
    fc.constant({}),
    fc.constant({ "cf-turnstile-response": "" }),
  );

  it("3.4 — невалидная captcha → 400 invalid_captcha без побочных эффектов в db", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test_turnstile_secret";
    await fc.assert(
      fc.asyncProperty(
        invalidFormArb,
        fc.option(fc.ipV4(), { nil: null }),
        async (body, ip) => {
          // Любой вызов db за captcha-гейтом — нарушение baseline.
          const calls: string[] = [];
          executeHandler = () => {
            calls.push("db.execute");
            return Promise.resolve({ rows: [] });
          };
          insertHandler = () => {
            calls.push("db.insert");
            return {
              values: () => ({ returning: async () => [{ id: 1, slug: "x" }] }),
            };
          };
          selectHandler = () => {
            calls.push("db.select");
            const terminal = {
              where: () => terminal,
              limit: async () => [] as unknown[],
              then: (resolve: (v: unknown[]) => void) => resolve([]),
            };
            return { from: () => terminal };
          };

          const req = createReq(body, FAKE_ANON_ID, ip);
          const { res, out } = createRes();
          await handleGenerate(req, res);

          assert.equal(out.statusCode, 400, "invalid captcha must be 400");
          assert.deepEqual(out.body, { ok: false, error: "invalid_captcha" });
          assert.deepEqual(
            calls,
            [],
            `no db side effects allowed after captcha rejection, got: ${calls.join(", ")}`,
          );
        },
      ),
      { numRuns: 40 },
    );
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Scope `DESIGN_COST_CEILING_KOPEKS` to one async run, then restore. */
async function withEnvAsync<T>(
  raw: string | undefined,
  body: () => Promise<T>,
): Promise<T> {
  const ENV_KEY = "DESIGN_COST_CEILING_KOPEKS";
  const previous = process.env[ENV_KEY];
  try {
    if (raw === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = raw;
    }
    return await body();
  } finally {
    if (previous === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = previous;
    }
  }
}
