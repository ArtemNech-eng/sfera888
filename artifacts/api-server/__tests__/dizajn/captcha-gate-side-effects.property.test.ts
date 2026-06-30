// Feature: ai-design-flagship, Property 8: Captcha gate precedes and gates all side effects
//
// **Validates: Requirements 7.2**
//
// Property 8 (design.md): *For any* request with a missing or invalid
// `Turnstile` token, the `Generate_Endpoint` responds with `invalid_captcha`,
// creates no `Design_Project`, and consumes no `Rate_Limiter` counter.
//
// Behaviour under test — the inline `POST /generate` handler in
// `src/routes/dizajn.ts`. The handler's documented order is:
//   anonId → verifyTurnstileToken → checkAndIncrement(anon, ip) →
//   validateGenerateRequest → uploadRoomPhoto → pickUniqueSlug → INSERT designs.
// When the captcha fails, NOTHING past the gate may run: no rate-limit upsert
// (`checkAndIncrement` → `db.execute`), no slug pre-check (`db.select`), and no
// design row (`db.insert`).
//
// Strategy — reuse the same hermetic mocking approach as
// `captcha-order.property.test.ts` (tasks 4.3/4.4/4.5 share this harness):
//   1. Set fake env (`DATABASE_URL`, `R2_*`, `TURNSTILE_SECRET_KEY`) *before*
//      importing any production module — `objectStorage.ts` builds an
//      `S3Client` at load and `@workspace/db` instantiates a `pg.Pool`.
//   2. Patch the singleton `db` exported by `@workspace/db` so that
//      `db.execute` (the rate-limiter's `checkAndIncrement` upsert),
//      `db.insert` (the new-design write) and `db.select` (slug pre-check)
//      record their invocations. The captcha contract is that none of these
//      is touched when the token is invalid. Observing `db.execute` is the
//      faithful proxy for "`checkAndIncrement` was never called" — the limiter
//      performs all its work through `db.execute` (see `designRateLimit.ts`).
//   3. Force `verifyTurnstileToken` to FAIL for *every* generated token —
//      missing, empty, and garbage:
//        - missing / empty token → the function short-circuits to
//          `success: false` (`missing-input-response`) with a non-empty
//          `TURNSTILE_SECRET_KEY`, no network touched.
//        - garbage (non-empty) token → would hit Cloudflare; we stub
//          `globalThis.fetch` to return a `success: false` siteverify body,
//          so the failure is hermetic and deterministic across 100+ runs.
//   4. Pluck the inline `POST /generate` handler out of the router stack and
//      drive it with a hand-rolled mock `req`/`res` pair under fast-check.
//
// Run via: pnpm --filter @workspace/api-server test

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// Fake env *before* any production import so module-load-time checks
// (S3 client, pg.Pool) don't trip. A non-empty SMARTCAPTCHA_SERVER_KEY ensures
// the captcha branch is actually exercised (not dev-mode bypass).
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";
process.env.R2_ENDPOINT = process.env.R2_ENDPOINT ?? "https://fake.r2.dev";
process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? "fake-key";
process.env.R2_SECRET_ACCESS_KEY =
  process.env.R2_SECRET_ACCESS_KEY ?? "fake-secret";
process.env.SMARTCAPTCHA_SERVER_KEY = "test_smartcaptcha_secret";

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
// `rate_limit_buckets` upserts — i.e. it IS the observable footprint of the
// Rate_Limiter. It must never run when the captcha rejects.
(db as unknown as { execute: (..._a: unknown[]) => Promise<unknown> }).execute =
  async () => {
    recorder.calls.push("db.execute");
    return { rows: [] };
  };

// `db.insert(designsTable).values(...).returning(...)` — creates the
// Design_Project. Build a chainable resolving to a synthetic row so that if
// (contrary to spec) it is reached, the test surfaces it as a recorded call
// rather than a TypeError.
(db as unknown as { insert: (..._a: unknown[]) => unknown }).insert = () => {
  recorder.calls.push("db.insert");
  return {
    values: () => ({
      returning: async () => [{ id: 1, slug: "captcha-gate-fake-slug" }],
    }),
  };
};

// `db.select` is invoked by `pickUniqueSlug({ roomType, style })`. The chain is
// `.select({...}).from(...).where(eq(...)).limit(1)` awaited to a row array.
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

// ─── Hermetic captcha failure for *every* token ─────────────────────────────
//
// `verifyTurnstileToken` only reaches the network for a non-empty token
// (garbage case). Stub `globalThis.fetch` to mimic a Cloudflare siteverify
// rejection so non-empty garbage tokens fail without any real I/O. Missing /
// empty tokens never reach here (short-circuit), but the stub also guards
// against accidental real network calls.
const originalFetch = globalThis.fetch;
let fetchCalledWithRealNetwork = false;
globalThis.fetch = (async () => {
  fetchCalledWithRealNetwork = true;
  return {
    ok: true,
    json: async () => ({
      status: "failed",
      message: "Invalid or expired Token",
    }),
  } as unknown as Response;
}) as typeof fetch;

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
  (l) => l.route?.path === "/generate" && l.route.methods?.post === true,
);
assert.ok(generateLayer?.route, "POST /generate handler not found in router");
// The route registers `upload.single("image")` then the async handler, so the
// final layer in the stack is the handler under test. Driving it directly
// bypasses multer (irrelevant: captcha fails before any photo handling).
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
    // No `file`: captcha gate is reached before any photo handling, so a
    // photo would never be consulted on the rejection path anyway.
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
const PALETTES = [
  "warm_neutral",
  "white_wood",
  "cool_gray",
  "beige_sand",
  "green_sage",
  "blue_calm",
] as const;

/**
 * Generator of "missing / empty / garbage" SmartCaptcha tokens. The handler
 * pulls the token from `smart-token` (preferred) or `smartToken`/`captchaToken`
 * (fallback); `undefined` models the field being entirely absent.
 *
 *   - missing  → field omitted (undefined)
 *   - empty    → ""  (short-circuits to success:false, no network)
 *   - garbage  → arbitrary non-empty string (drives stubbed fetch → failure)
 */
const tokenArb = fc.oneof(
  fc.constant<undefined>(undefined), // missing
  fc.constant(""), // empty
  fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.length > 0), // garbage
  fc.constantFrom(
    "0.garbage-token",
    "XXXX.dummy.invalid",
    "not-a-real-cf-token",
    " ",
  ),
);

/**
 * Body generator: a structurally valid-ish bedroom form plus a missing/empty/
 * garbage captcha token, optionally placed under either accepted field name.
 * The form fields are deliberately well-formed so that the ONLY rejection
 * reason can be the captcha — proving the gate pre-empts validation too.
 */
const bodyArb = fc
  .record({
    roomType: fc.constantFrom(...ROOM_TYPES),
    style: fc.constantFrom(...STYLES),
    palette: fc.constantFrom(...PALETTES),
    widthCm: fc.integer({ min: 250, max: 800 }),
    lengthCm: fc.integer({ min: 250, max: 800 }),
    heightCm: fc.integer({ min: 220, max: 350 }),
    budget: fc.integer({ min: 50_000, max: 5_000_000 }),
    token: tokenArb,
    useFallbackField: fc.boolean(),
  })
  .map(({ token, useFallbackField, ...form }) => {
    const body: Record<string, unknown> = { ...form };
    if (token !== undefined) {
      if (useFallbackField) body["smartToken"] = token;
      else body["smart-token"] = token;
    }
    return body;
  });

// Stable UUIDv4 — `req.anonId` validation checks shape only.
const FAKE_ANON_ID = "11111111-1111-1111-1111-111111111111";

// ─── Property ───────────────────────────────────────────────────────────────

describe("dizajn POST /generate — Property 8: captcha gate precedes and gates all side effects", () => {
  // Validates: Requirements 7.2

  before(() => {
    process.env.SMARTCAPTCHA_SERVER_KEY = "test_smartcaptcha_secret";
  });

  after(() => {
    globalThis.fetch = originalFetch;
  });

  it("missing/invalid captcha → 400 invalid_captcha, no Design_Project, no Rate_Limiter counter consumed", async () => {
    await fc.assert(
      fc.asyncProperty(
        bodyArb,
        fc.option(fc.ipV4(), { nil: null }),
        async (body, ip) => {
          recorder.reset();

          const req = createReq(body, FAKE_ANON_ID, ip);
          const { res, out } = createRes();
          await handleGenerate(req, res);

          // (a) Response is exactly the captcha rejection.
          assert.equal(
            out.statusCode,
            400,
            `expected 400 invalid_captcha for ${JSON.stringify(body)}, got ${out.statusCode} ${JSON.stringify(out.body)}`,
          );
          assert.deepEqual(
            out.body,
            { ok: false, error: "invalid_captcha" },
            `body must be exactly { ok:false, error:"invalid_captcha" }`,
          );

          // (b) No side effects whatsoever past the gate:
          //     - no `db.execute`  ⇒ Rate_Limiter.checkAndIncrement NEVER ran
          //                           (no counter consumed),
          //     - no `db.select`   ⇒ no slug pre-check,
          //     - no `db.insert`   ⇒ no Design_Project created.
          assert.deepEqual(
            recorder.calls,
            [],
            `expected zero DB side effects after captcha rejection, got: [${recorder.calls.join(", ")}]`,
          );
          assert.ok(
            !recorder.calls.includes("db.execute"),
            "Rate_Limiter counter must not be consumed when captcha fails",
          );
          assert.ok(
            !recorder.calls.includes("db.insert"),
            "no Design_Project may be created when captcha fails",
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Restore the original fetch for any subsequent module-level code.
globalThis.fetch = originalFetch;
void fetchCalledWithRealNetwork; // referenced to avoid unused-var lint
