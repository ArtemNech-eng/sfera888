/**
 * Property test: order of pre-flight checks in
 * `POST /api/marketplace/dizajn/generate`.
 *
 * Property 4: Captcha verifies before any other validation.
 *
 * **Validates: Requirements 3.2**
 *
 * The route handler in `src/routes/dizajn.ts` is documented to run the
 * Turnstile captcha verification *before* rate-limit increment, Zod form
 * validation, geometric pre-flight, slug picking and the final
 * `INSERT INTO designs`. This test pins that order down behaviourally.
 *
 * Strategy — drive the inline handler directly:
 *   1. Set fake env (`DATABASE_URL`, `R2_*`, `TURNSTILE_SECRET_KEY`) before
 *      importing any production module — `objectStorage.ts` builds an
 *      `S3Client` at module load and refuses to start without R2 creds, and
 *      `@workspace/db` instantiates a `pg.Pool` from `DATABASE_URL`.
 *   2. Patch the singleton `db` exported by `@workspace/db` so that
 *      `db.execute` (used by `designRateLimit`), `db.insert` (used by the
 *      route to write a new design row) and `db.select` (used by
 *      `pickUniqueSlug`) record their invocations. The captcha contract is
 *      that none of these three is touched when the token is invalid.
 *   3. Reach into the dizajn router's `stack` to pluck out the inline
 *      `POST /generate` handler, then drive it with a hand-rolled mock
 *      `req`/`res` pair under fast-check generators. Driving the handler
 *      function avoids spinning a full Express app + supertest just to
 *      assert call counts, which is overkill for this property.
 *
 * Captcha success/failure is steered through `TURNSTILE_SECRET_KEY`:
 *   - Empty / missing → `verifyTurnstileToken` short-circuits to
 *     `success: true` (dev-mode bypass; see `lib/turnstile.ts`). The
 *     network is never touched.
 *   - Set to a non-empty string with an empty token in the body →
 *     short-circuits to `success: false` with `missing-input-response`.
 *     The network is also never touched, so this is fully hermetic.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// Provide fake env *before* any production import so module-load-time
// checks (S3 client, pg.Pool) don't trip. These are only ever read by
// modules that we monkey-patch below.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";
process.env.R2_ENDPOINT = process.env.R2_ENDPOINT ?? "https://fake.r2.dev";
process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? "fake-key";
process.env.R2_SECRET_ACCESS_KEY =
  process.env.R2_SECRET_ACCESS_KEY ?? "fake-secret";
// Default to a non-empty secret so the captcha branch is exercised
// (rather than dev-mode bypass). Individual tests below flip this for
// the success-path case.
process.env.TURNSTILE_SECRET_KEY = "test_turnstile_secret";

// `@workspace/db` exposes a singleton `db` whose method bag we mutate to
// observe what the handler tries to do behind the captcha gate.
const dbModule = await import("@workspace/db");
const { db } = dbModule;

// ─── Call recorder ──────────────────────────────────────────────────────────

interface CallRecorder {
  /** Methods invoked, in the order they were called. */
  calls: string[];
  reset(): void;
}

const recorder: CallRecorder = {
  calls: [],
  reset(): void {
    recorder.calls.length = 0;
  },
};

// `db.execute` is invoked by `checkAndIncrement` / `decrement` for the
// `rate_limit_buckets` upserts. We pretend it succeeded with an empty result
// (the limiter then treats remaining/retry as defaults — irrelevant here,
// because this code path must never run when the captcha rejects).
(db as unknown as { execute: (..._a: unknown[]) => Promise<unknown> }).execute =
  async () => {
    recorder.calls.push("db.execute");
    return { rows: [] };
  };

// `db.insert(designsTable).values(...).returning(...)` — only the existence
// of a call matters. Build a chainable that resolves to a synthetic row, so
// if (somehow, contrary to spec) the handler calls it past the captcha, the
// test surfaces that as an extra recorded call rather than a TypeError.
(db as unknown as { insert: (..._a: unknown[]) => unknown }).insert = () => {
  recorder.calls.push("db.insert");
  return {
    values: () => ({
      returning: async () => [{ id: 1, slug: "captcha-test-fake-slug" }],
    }),
  };
};

// `db.select` is invoked by `pickUniqueSlug({ roomType, style })`. The chain
// is `.select({...}).from(designsTable).where(eq(...)).limit(1)` and the
// final `await` resolves to a row array. Empty array → "slug is free", so
// `pickUniqueSlug` would happily return a base slug if reached.
(db as unknown as { select: (..._a: unknown[]) => unknown }).select = () => {
  recorder.calls.push("db.select");
  const terminal = {
    where: () => terminal,
    limit: async () => [] as unknown[],
    then: (
      resolve: (value: unknown[]) => void,
      _reject?: (reason: unknown) => void,
    ) => resolve([]),
  };
  return {
    from: () => terminal,
  };
};

// ─── Load the route module after patching db ────────────────────────────────

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
  (l) =>
    l.route?.path === "/generate" && l.route.methods?.post === true,
);
assert.ok(generateLayer?.route, "POST /generate handler not found in router");
// Route layer stack is [multer upload.single("image"), asyncHandler]; the real
// request handler is the terminal entry. Driving it directly bypasses multer
// (irrelevant: captcha rejects before any photo handling).
const layerStack = generateLayer.route!.stack;
const handleGenerate = layerStack[layerStack.length - 1]!.handle;

// ─── Mock req/res helpers ───────────────────────────────────────────────────

interface MockResponse {
  statusCode: number;
  body: unknown;
  headers: Map<string, string>;
}

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

function createRes(): { res: unknown; out: MockResponse } {
  const out: MockResponse = {
    statusCode: 200,
    body: undefined,
    headers: new Map(),
  };
  const res = {
    status(code: number) {
      out.statusCode = code;
      return res;
    },
    json(b: unknown) {
      out.body = b;
      return res;
    },
    setHeader(k: string, v: string) {
      out.headers.set(k.toLowerCase(), v);
      return res;
    },
    set(k: string, v: string) {
      out.headers.set(k.toLowerCase(), v);
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

// ─── Generators ─────────────────────────────────────────────────────────────

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

/**
 * Generator of "intentionally invalid" form bodies — broad coverage of
 * the kinds of payloads a malicious or careless caller might send. The
 * captcha must reject ALL of these with `invalid_captcha` regardless of
 * what's wrong with the form.
 *
 * Includes:
 *   - Out-of-range numbers
 *   - Wrong-typed numbers (strings, NaN)
 *   - Missing fields
 *   - Locked MVP roomType (`kitchen`, `bathroom`, …)
 *   - Sub-min-area pairs (e.g. 200×200 = 4 m² < 6 m² for bedroom)
 *   - Garbage / non-object bodies
 */
const invalidFormArb = fc.oneof(
  // (1) Numerically invalid: out-of-range width/length
  fc.record({
    roomType: fc.constantFrom(...ROOM_TYPES),
    style: fc.constantFrom(...STYLES),
    widthCm: fc.integer({ min: 1, max: 199 }),
    lengthCm: fc.integer({ min: 1, max: 199 }),
    heightCm: fc.integer({ min: 220, max: 350 }),
    budget: fc.integer({ min: 50_000, max: 5_000_000 }),
    "cf-turnstile-response": fc.constant(""),
  }),
  // (2) MVP-locked room with otherwise valid input — would fail with
  // `mvp_room_locked` if it reached the validator. Captcha must still
  // pre-empt it.
  fc.record({
    roomType: fc.constantFrom("kitchen", "bathroom", "living_room", "hallway"),
    style: fc.constantFrom(...STYLES),
    widthCm: fc.integer({ min: 200, max: 800 }),
    lengthCm: fc.integer({ min: 200, max: 800 }),
    heightCm: fc.integer({ min: 220, max: 350 }),
    budget: fc.integer({ min: 50_000, max: 5_000_000 }),
    "cf-turnstile-response": fc.constant(""),
  }),
  // (3) Sub-min-area bedroom — would trip `checkMinArea` if reached
  // (200 × 200 = 4 m² vs bedroom-min 6 m²).
  fc.record({
    roomType: fc.constant("bedroom"),
    style: fc.constantFrom(...STYLES),
    widthCm: fc.constant(200),
    lengthCm: fc.constant(200),
    heightCm: fc.integer({ min: 220, max: 350 }),
    budget: fc.integer({ min: 50_000, max: 5_000_000 }),
    "cf-turnstile-response": fc.constant(""),
  }),
  // (4) Wrong types: string instead of number
  fc.record({
    roomType: fc.constantFrom(...ROOM_TYPES),
    style: fc.constantFrom(...STYLES),
    widthCm: fc.string(),
    lengthCm: fc.string(),
    heightCm: fc.string(),
    budget: fc.string(),
    "cf-turnstile-response": fc.constant(""),
  }),
  // (5) Empty / object body — captcha must still reject without crashing
  fc.constant({}),
  fc.constant({ "cf-turnstile-response": "" }),
);

/**
 * Generator of "structurally valid" forms — used for the captcha-success
 * branch. We don't actually want the handler to succeed (which would hit
 * external systems), so the test only asserts that the captcha is *not*
 * the rejecting step.
 */
const validBedroomFormArb = fc.record({
  roomType: fc.constant("bedroom"),
  style: fc.constantFrom(...STYLES),
  widthCm: fc.integer({ min: 250, max: 800 }),
  lengthCm: fc.integer({ min: 250, max: 800 }),
  heightCm: fc.integer({ min: 220, max: 350 }),
  budget: fc.integer({ min: 50_000, max: 5_000_000 }),
});

// Stable UUIDv4 — `req.anonId` validation in the handler only checks
// shape, not uniqueness, so a fixed value is fine and removes a noise
// dimension from the property.
const FAKE_ANON_ID = "11111111-1111-1111-1111-111111111111";

// ─── Properties ─────────────────────────────────────────────────────────────

describe("dizajn POST /generate — Property 4: captcha first", () => {
  // Validates: Requirements 3.2

  before(() => {
    // Force the captcha branch (non-empty secret) by default. Individual
    // tests reset this if they need the dev-mode bypass.
    process.env.TURNSTILE_SECRET_KEY = "test_turnstile_secret";
  });

  it("4.1 invalid captcha → 400 invalid_captcha and zero downstream side effects", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test_turnstile_secret";

    await fc.assert(
      fc.asyncProperty(
        invalidFormArb,
        fc.option(fc.ipV4(), { nil: null }),
        async (body, ip) => {
          recorder.reset();

          const req = createReq(body, FAKE_ANON_ID, ip);
          const { res, out } = createRes();
          await handleGenerate(req, res);

          // Status & error code: must be the captcha rejection regardless
          // of what's wrong with the form.
          assert.equal(
            out.statusCode,
            400,
            `expected 400 for invalid captcha + ${JSON.stringify(body)}, got ${out.statusCode}`,
          );
          assert.deepEqual(
            out.body,
            { ok: false, error: "invalid_captcha" },
            `body must be exactly { ok:false, error:"invalid_captcha" }`,
          );

          // Side-effect ledger: nothing past the captcha gate should have
          // run — no rate-limit upsert, no slug pre-check, no insert.
          assert.deepEqual(
            recorder.calls,
            [],
            `expected no DB calls after captcha rejection, got: ${recorder.calls.join(", ")}`,
          );
        },
      ),
      { numRuns: 50 },
    );
  });

  it("4.2 valid captcha → handler proceeds past the captcha gate (db.execute is reached)", async () => {
    // Dev-mode bypass: empty secret makes verifyTurnstileToken return
    // success: true without touching the network. Tracks "captcha
    // succeeded" without standing up an HTTP mock.
    process.env.TURNSTILE_SECRET_KEY = "";

    await fc.assert(
      fc.asyncProperty(
        validBedroomFormArb,
        fc.option(fc.ipV4(), { nil: null }),
        async (form, ip) => {
          recorder.reset();

          const body = {
            ...form,
            // No token needed in dev bypass — the function ignores it.
          };
          const req = createReq(body, FAKE_ANON_ID, ip);
          const { res, out } = createRes();
          await handleGenerate(req, res);

          // The captcha gate must not have fired — body cannot be the
          // captcha rejection shape.
          if (
            out.statusCode === 400 &&
            typeof out.body === "object" &&
            out.body !== null &&
            (out.body as { error?: unknown }).error === "invalid_captcha"
          ) {
            assert.fail(
              "captcha gated a request that should have passed (dev-mode bypass)",
            );
          }

          // First DB call after the captcha gate is the rate-limit upsert
          // (`db.execute`) — see the documented order in the route
          // handler. If captcha had run *after* anything else, the first
          // recorded call would not be `db.execute`.
          assert.ok(
            recorder.calls.length >= 1,
            `expected ≥ 1 DB call when captcha passes, got ${recorder.calls.length}`,
          );
          assert.equal(
            recorder.calls[0],
            "db.execute",
            `first DB call after captcha must be the rate-limit upsert; saw [${recorder.calls.join(", ")}]`,
          );
        },
      ),
      { numRuns: 30 },
    );
  });
});

// Restore env for any subsequent tests in the same suite run.
process.env.TURNSTILE_SECRET_KEY = "test_turnstile_secret";
