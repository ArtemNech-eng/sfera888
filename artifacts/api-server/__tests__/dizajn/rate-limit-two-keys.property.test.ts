// Feature: ai-design-flagship, Property 9: Rate limiting checks both keys and blocks over-limit requests
//
// **Validates: Requirements 7.3, 7.4**
//
// Property 9 (design.md): *For any* request that passes captcha, the
// `Rate_Limiter` is consulted for both the `Anon_Id` and the IP key; and *for
// any* key whose count would exceed its limit, the endpoint responds with
// `rate_limited`, a `retryAfterSeconds` ≥ 0, and creates no `Design_Project`.
//
// Behaviour under test — the inline `POST /generate` handler in
// `src/routes/dizajn.ts`. Documented order (design.md → "Порядок проверок"):
//   anonId → verifyTurnstileToken → checkAndIncrement("anon") then ("ip") →
//   validateGenerateRequest → uploadRoomPhoto → pickUniqueSlug → INSERT designs.
//
// The handler consults the anon key first; if it is already over its limit the
// ip key is intentionally NOT touched (no slot is burned). If the anon key
// passes but the ip key is over its limit, the anon increment is rolled back.
// In every over-limit case the response is `429 rate_limited` with a
// `retryAfterSeconds` and NO `Design_Project` row is written.
//
// Strategy — combine the two existing hermetic harnesses:
//   * captcha-gate-side-effects.property.test.ts — pluck the inline handler out
//     of the router and drive it with mock req/res; force Turnstile to PASS by
//     stubbing `globalThis.fetch` with a `success: true` siteverify body.
//   * rate-limiter.property.test.ts — back the real `checkAndIncrement` /
//     `decrement` with an in-memory simulator of the Postgres
//     `INSERT ... ON CONFLICT DO UPDATE` semantics, driven through a patched
//     `db.execute`, with `Date.now()` pinned to a fake clock so
//     `computeRetryAfter` is deterministic.
//
// `db.insert` (the Design_Project write) and `db.select` (slug pre-check) are
// patched to record their invocations, so the test can assert no project is
// created on the over-limit path and one IS created on the happy path.
//
// Run via: pnpm --filter @workspace/api-server test

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// Fake env *before* any production import so module-load-time checks
// (S3 client, pg.Pool) don't trip. A non-empty SMARTCAPTCHA_SERVER_KEY ensures
// the captcha branch is actually exercised (not the dev-mode bypass).
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";
process.env.R2_ENDPOINT = process.env.R2_ENDPOINT ?? "https://fake.r2.dev";
process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? "fake-key";
process.env.R2_SECRET_ACCESS_KEY =
  process.env.R2_SECRET_ACCESS_KEY ?? "fake-secret";
process.env.SMARTCAPTCHA_SERVER_KEY = "test_smartcaptcha_secret";

const dbModule = await import("@workspace/db");
const { db } = dbModule;

// ─── In-memory rate-limit store + fake clock ─────────────────────────────────
//
// Mirrors `rate-limiter.property.test.ts`. The real `checkAndIncrement` /
// `decrement` run unmodified; only the `db.execute` they call is simulated.

type Bucket = { counter: number; window_start: Date };
const store = new Map<string, Bucket>();
let fakeNow = new Date("2025-01-01T00:00:00Z");

const WINDOW_SECONDS = 24 * 60 * 60;
const WINDOW_MS = WINDOW_SECONDS * 1000;

const LIMITS = { anon: 3, ip: 5 } as const;

function resetStore(initial: Date = new Date("2025-01-01T00:00:00Z")): void {
  store.clear();
  fakeNow = new Date(initial);
}

// Pin Date.now so the implementation's computeRetryAfter shares the clock.
Date.now = () => fakeNow.getTime();

/** Pre-saturate a bucket to exactly its limit so the next increment overflows. */
function saturate(kind: keyof typeof LIMITS, rawKey: string): void {
  store.set(`${kind}:${rawKey}`, {
    counter: LIMITS[kind],
    window_start: new Date(fakeNow),
  });
}

// ─── SQL inspector (verbatim from rate-limiter.property.test.ts) ─────────────

interface SqlInfo {
  text: string;
  params: unknown[];
}

function inspectSql(sqlObj: unknown): SqlInfo {
  const chunks: unknown[] =
    (sqlObj as { queryChunks?: unknown[] })?.queryChunks ?? [];
  let text = "";
  const params: unknown[] = [];
  for (const c of chunks) {
    if (
      c !== null &&
      typeof c === "object" &&
      Array.isArray((c as { value?: unknown }).value)
    ) {
      text += (c as { value: string[] }).value.join("");
    } else if (
      c !== null &&
      typeof c === "object" &&
      "value" in c &&
      "encoder" in (c as Record<string, unknown>)
    ) {
      params.push((c as { value: unknown }).value);
      text += `$${params.length}`;
    } else {
      params.push(c);
      text += `$${params.length}`;
    }
  }
  return { text, params };
}

type SqlKind = "insert" | "rollback" | "decrement";

function classify(text: string): SqlKind {
  if (text.includes("INSERT INTO rate_limit_buckets")) return "insert";
  if (text.includes("GREATEST(counter - 1")) return "decrement";
  if (
    text.includes("UPDATE rate_limit_buckets") &&
    text.includes("SET counter =")
  ) {
    return "rollback";
  }
  throw new Error(`Unrecognised SQL: ${text.slice(0, 160)}`);
}

// ─── Recorders: which buckets were consulted / decremented, plus DB writes ───

const recorder = {
  consulted: [] as string[], // bucket_key per checkAndIncrement upsert, in order
  decremented: [] as string[], // bucket_key per decrement, in order
  dbSelect: 0, // slug pre-check
  dbInsert: 0, // Design_Project write
  reset(): void {
    recorder.consulted.length = 0;
    recorder.decremented.length = 0;
    recorder.dbSelect = 0;
    recorder.dbInsert = 0;
  },
};

// ─── Mocked db.execute = rate-limiter simulator ──────────────────────────────

async function fakeExecute(
  sqlObj: unknown,
): Promise<{ rows: Array<Record<string, unknown>> }> {
  const { text, params } = inspectSql(sqlObj);
  const kind = classify(text);

  if (kind === "insert") {
    const key = String(params[0]);
    recorder.consulted.push(key);
    const existing = store.get(key);
    if (!existing) {
      const fresh: Bucket = { counter: 1, window_start: new Date(fakeNow) };
      store.set(key, fresh);
      return { rows: [{ counter: fresh.counter, window_start: fresh.window_start }] };
    }
    const elapsedMs = fakeNow.getTime() - existing.window_start.getTime();
    if (elapsedMs > WINDOW_MS) {
      existing.counter = 1;
      existing.window_start = new Date(fakeNow);
    } else {
      existing.counter += 1;
    }
    return {
      rows: [{ counter: existing.counter, window_start: existing.window_start }],
    };
  }

  if (kind === "rollback") {
    // SET counter = ${limit} WHERE bucket_key = ${key} AND counter > ${limit}
    const limit = Number(params[0]);
    const key = String(params[1]);
    const existing = store.get(key);
    if (existing && existing.counter > limit) existing.counter = limit;
    return { rows: [] };
  }

  // decrement: UPDATE ... SET counter = GREATEST(counter - 1, 0) WHERE bucket_key = ${key}
  const key = String(params[0]);
  recorder.decremented.push(key);
  const existing = store.get(key);
  if (existing) existing.counter = Math.max(existing.counter - 1, 0);
  return { rows: [] };
}

(db as unknown as { execute: typeof fakeExecute }).execute = fakeExecute;

// `db.insert(designsTable).values(...).returning(...)` — Design_Project write.
(db as unknown as { insert: (..._a: unknown[]) => unknown }).insert = () => {
  recorder.dbInsert += 1;
  return {
    values: () => ({
      returning: async () => [{ id: 1, slug: "rate-limit-fake-slug" }],
    }),
  };
};

// `db.select` — invoked by `pickUniqueSlug`; chain resolves to [] (slug free).
(db as unknown as { select: (..._a: unknown[]) => unknown }).select = () => {
  recorder.dbSelect += 1;
  const terminal = {
    where: () => terminal,
    limit: async () => [] as unknown[],
    then: (resolve: (v: unknown[]) => void) => resolve([]),
  };
  return { from: () => terminal };
};

// ─── Hermetic captcha PASS for every non-empty token ─────────────────────────
//
// Installed in `before()` (and torn down in `after()`) rather than at module
// load: `describe`/`it` only *register* the tests, which actually run after the
// whole module has been evaluated. Patching `globalThis.fetch` at module scope
// would be reverted by any module-level restore before a single test executed.

const originalFetch = globalThis.fetch;
const passingFetch = (async () =>
  ({
    ok: true,
    json: async () => ({
      status: "ok",
      host: "sfera.test",
    }),
  }) as unknown as Response) as typeof fetch;

// ─── Load route module after patching db ─────────────────────────────────────

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
const layerStack = generateLayer.route!.stack;
// Final layer is the async handler (after multer's upload.single). Driving it
// directly bypasses multer, which is irrelevant to rate-limit behaviour.
const handleGenerate = layerStack[layerStack.length - 1]!.handle;

// ─── Mock req/res ─────────────────────────────────────────────────────────────

interface MockResponse {
  statusCode: number;
  body: unknown;
}

function createReq(body: unknown, anonId: string, ip: string | null): unknown {
  return {
    anonId,
    body,
    headers: ip ? { "x-forwarded-for": ip } : {},
    // Mirror production: with no XFF and no socket address, getClientIp returns
    // null and the handler falls back to the "unknown" ip bucket key. Keeping
    // remoteAddress aligned with `ip` keeps the test's ipKey in lockstep.
    socket: { remoteAddress: ip },
    cookies: {},
    query: {},
    params: {},
    // No `file` → Text_To_Image_Mode; photo handling is past the rate gate.
  };
}

function createRes(): { res: unknown; out: MockResponse } {
  const out: MockResponse = { statusCode: 200, body: undefined };
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

// ─── Generators ───────────────────────────────────────────────────────────────

// A well-formed bedroom form so that, on the happy path, the ONLY thing that
// can stop the request is the rate limiter (not validation). Over-limit cases
// never reach validation, so the exact field values are immaterial there.
function validBody(token: string): Record<string, unknown> {
  return {
    roomType: "bedroom",
    style: "modern",
    palette: "warm_neutral",
    widthCm: 400,
    lengthCm: 500,
    heightCm: 270,
    budget: 1_000_000,
    "smart-token": token,
  };
}

const tokenArb = fc.string({ minLength: 1, maxLength: 48 }).filter((s) => s.length > 0);
// `getClientIp` falls back to "unknown" when no IP is present; cover both.
const ipArb = fc.option(fc.ipV4(), { nil: null });
// Which key(s) are pre-saturated above their limit before the request runs.
const overScenarioArb = fc.constantFrom("anon", "ip", "both");

const FAKE_ANON_ID = "11111111-1111-1111-1111-111111111111";

describe("dizajn POST /generate — Property 9: rate limiting checks both keys and blocks over-limit requests", () => {
  // Validates: Requirements 7.3, 7.4

  before(() => {
    process.env.SMARTCAPTCHA_SERVER_KEY = "test_smartcaptcha_secret";
    globalThis.fetch = passingFetch;
  });

  after(() => {
    globalThis.fetch = originalFetch;
  });

  // -------------------------------------------------------------------------
  // Over-limit ⇒ 429 rate_limited + retryAfterSeconds ≥ 0 + no Design_Project.
  // -------------------------------------------------------------------------
  it("any over-limit key → 429 rate_limited, retryAfterSeconds ≥ 0, no Design_Project created", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        ipArb,
        tokenArb,
        overScenarioArb,
        async (anonId, ip, token, scenario) => {
          resetStore();
          recorder.reset();

          const ipKey = ip ?? "unknown";
          if (scenario === "anon" || scenario === "both") saturate("anon", anonId);
          if (scenario === "ip" || scenario === "both") saturate("ip", ipKey);

          const req = createReq(validBody(token), anonId, ip);
          const { res, out } = createRes();
          await handleGenerate(req, res);

          // Response is exactly the rate-limit rejection.
          assert.equal(
            out.statusCode,
            429,
            `expected 429 for scenario=${scenario}, got ${out.statusCode} ${JSON.stringify(out.body)}`,
          );
          const body = out.body as {
            ok?: boolean;
            error?: string;
            retryAfterSeconds?: number;
            kind?: string;
          };
          assert.equal(body.ok, false);
          assert.equal(body.error, "rate_limited");
          assert.equal(
            typeof body.retryAfterSeconds,
            "number",
            "retryAfterSeconds must be present",
          );
          assert.ok(
            (body.retryAfterSeconds as number) >= 0,
            `retryAfterSeconds must be ≥ 0, got ${body.retryAfterSeconds}`,
          );

          // No Design_Project may be created when a key is over its limit.
          assert.equal(
            recorder.dbInsert,
            0,
            "no Design_Project may be created on the over-limit path",
          );

          // The anon key is consulted first.
          assert.ok(
            recorder.consulted.includes(`anon:${anonId}`),
            "anon key must be consulted",
          );

          if (scenario === "anon" || scenario === "both") {
            // anon over limit ⇒ ip key is NOT consulted (no slot burned),
            // and the rejecting key in the response is "anon".
            assert.equal(
              body.kind,
              "anon",
              "rejecting key should be reported as anon",
            );
            assert.ok(
              !recorder.consulted.includes(`ip:${ipKey}`),
              "ip key must not be consulted once anon is already over limit",
            );
          } else {
            // anon under limit but ip over ⇒ BOTH keys consulted, and the
            // already-counted anon slot is rolled back (Requirement 7.5 wiring).
            assert.equal(body.kind, "ip", "rejecting key should be reported as ip");
            assert.ok(
              recorder.consulted.includes(`ip:${ipKey}`),
              "ip key must be consulted when anon passes",
            );
            assert.ok(
              recorder.decremented.includes(`anon:${anonId}`),
              "anon counter must be rolled back when ip rejects",
            );
            const anonBucket = store.get(`anon:${anonId}`);
            assert.equal(
              anonBucket?.counter,
              0,
              "anon counter must return to its pre-request value (0)",
            );
          }
        },
      ),
      { numRuns: 120 },
    );
  });

  // -------------------------------------------------------------------------
  // Happy path ⇒ both keys consulted, request proceeds, Design_Project created.
  // Establishes the "Rate_Limiter is consulted for both keys" half of Property 9.
  // -------------------------------------------------------------------------
  it("under-limit request consults BOTH keys (anon then ip) and creates a Design_Project", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), ipArb, tokenArb, async (anonId, ip, token) => {
        resetStore();
        recorder.reset();

        const ipKey = ip ?? "unknown";
        const req = createReq(validBody(token), anonId, ip);
        const { res, out } = createRes();
        await handleGenerate(req, res);

        assert.equal(
          out.statusCode,
          202,
          `expected 202 on under-limit happy path, got ${out.statusCode} ${JSON.stringify(out.body)}`,
        );

        // Both keys consulted, anon strictly before ip.
        const anonIdx = recorder.consulted.indexOf(`anon:${anonId}`);
        const ipIdx = recorder.consulted.indexOf(`ip:${ipKey}`);
        assert.ok(anonIdx >= 0, "anon key must be consulted");
        assert.ok(ipIdx >= 0, "ip key must be consulted");
        assert.ok(anonIdx < ipIdx, "anon key must be consulted before ip key");

        // A Design_Project is created and neither counter is rolled back.
        assert.equal(recorder.dbInsert, 1, "exactly one Design_Project created");
        assert.equal(
          recorder.decremented.length,
          0,
          "no counter rollback on the happy path",
        );
      }),
      { numRuns: 80 },
    );
  });
});

// Tests install/restore `globalThis.fetch` via before/after hooks above, so no
// module-level fetch restoration is needed here.
