// Feature: ai-design-flagship, Property 10: Validation failure rolls back consumed rate-limit counters
/**
 * Property test for AI_Design_Flagship rate-limit rollback on validation failure.
 *
 * Property 10: Validation failure rolls back consumed rate-limit counters.
 *
 * **Validates: Requirements 7.5**
 *
 * For any request that passes captcha and is counted by the Rate_Limiter but
 * then fails `validateGenerateRequest`, BOTH the Anon_Id and IP counters return
 * to their pre-request values, and NO Design_Project is created.
 *
 * Behaviour under test — the inline `POST /generate` handler in
 * `src/routes/dizajn.ts`. Its documented order (design.md → «Порядок проверок
 * в Generate_Endpoint» + «Error Handling») is:
 *   anonId → verifyTurnstileToken → checkAndIncrement("anon") →
 *   checkAndIncrement("ip") → validateGenerateRequest → ...
 * When `validateGenerateRequest` fails, the handler calls `rollbackRateLimits`
 * (Requirement 7.5), which `decrement`s both keys that were incremented in this
 * request, and responds `400 { error: "validation_error", violations[] }`
 * without inserting a design row.
 *
 * Strategy — fuse the two existing harnesses:
 *   - From `flagship-mode-selection.property.test.ts`: drive the terminal route
 *     handler directly with a hand-rolled req/res, dev-bypass the captcha
 *     (`TURNSTILE_SECRET_KEY=""` → `verifyTurnstileToken` returns success).
 *   - From `rate-limiter.property.test.ts`: back the REAL `checkAndIncrement` /
 *     `decrement` (which the handler invokes) with an in-memory store driven by
 *     a faithful `INSERT ... ON CONFLICT` / rollback / decrement SQL simulator
 *     over the patched `db.execute`. This lets us read the actual counter values
 *     before and after the request and assert the rollback restored them.
 *
 * Buckets are pre-seeded to arbitrary in-window values strictly below the limit
 * (so the increment is allowed and validation — not the limiter — is the
 * rejection cause). After the request, each counter must equal its pre-request
 * seed exactly.
 *
 * Run via Node's built-in test runner (tsx --test):
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// ── Fake env BEFORE any production import ────────────────────────────────────
// `objectStorage.ts` builds an S3Client at module load and `@workspace/db`
// instantiates a pg.Pool from DATABASE_URL — both only read these vars, never
// connect, because we monkey-patch their methods below.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";
process.env.R2_ENDPOINT = process.env.R2_ENDPOINT ?? "https://fake.r2.dev";
process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? "fake-key";
process.env.R2_SECRET_ACCESS_KEY =
  process.env.R2_SECRET_ACCESS_KEY ?? "fake-secret";
process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID =
  process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? "fake-bucket";
// Empty secret → verifyTurnstileToken dev-bypass returns success: true, so the
// captcha gate never rejects and the network is never touched.
process.env.TURNSTILE_SECRET_KEY = "";

// ── Patch the @workspace/db singleton ────────────────────────────────────────
const dbModule = await import("@workspace/db");
const { db } = dbModule;

// === In-memory rate_limit_buckets store + fake clock =======================

type Bucket = { counter: number; window_start: Date };
const store = new Map<string, Bucket>();
let fakeNow = new Date("2025-01-01T00:00:00Z");
const WINDOW_MS = 24 * 60 * 60 * 1000;

// Share the clock with the implementation's computeRetryAfter / NOW().
Date.now = () => fakeNow.getTime();

function resetStore(): void {
  store.clear();
  fakeNow = new Date("2025-01-01T00:00:00Z");
}

// === SQL inspector (mirrors rate-limiter.property.test.ts) ==================

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

type Kind = "insert" | "rollback" | "decrement";

function classify(text: string): Kind {
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

async function fakeExecute(
  sqlObj: unknown,
): Promise<{ rows: Array<Record<string, unknown>> }> {
  const { text, params } = inspectSql(sqlObj);
  const kind = classify(text);

  if (kind === "insert") {
    const key = String(params[0]);
    const existing = store.get(key);
    if (!existing) {
      const fresh: Bucket = { counter: 1, window_start: new Date(fakeNow) };
      store.set(key, fresh);
      return {
        rows: [{ counter: fresh.counter, window_start: fresh.window_start }],
      };
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

  // decrement: SET counter = GREATEST(counter - 1, 0) WHERE bucket_key = ${key}
  const key = String(params[0]);
  const existing = store.get(key);
  if (existing) existing.counter = Math.max(existing.counter - 1, 0);
  return { rows: [] };
}

(db as unknown as { execute: typeof fakeExecute }).execute = fakeExecute;

// === Observe db.insert / db.select ==========================================
// Validation fails before either is reached; we record any invocation so the
// property can assert "no Design_Project created" (and no slug pre-check).

const sideEffects: string[] = [];

(db as unknown as { insert: (..._a: unknown[]) => unknown }).insert = () => {
  sideEffects.push("db.insert");
  return {
    values: () => ({
      returning: async () => [{ id: 1, slug: "should-not-happen" }],
    }),
  };
};

(db as unknown as { select: (..._a: unknown[]) => unknown }).select = () => {
  sideEffects.push("db.select");
  const terminal = {
    where: () => terminal,
    limit: async () => [] as unknown[],
    then: (resolve: (value: unknown[]) => void) => resolve([]),
  };
  return { from: () => terminal };
};

// ── Load the route after patching, pluck the terminal POST /generate handler ─
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
const routeStack = generateLayer.route!.stack;
const handleGenerate = routeStack[routeStack.length - 1]!.handle;

// ── Mock req/res helpers ─────────────────────────────────────────────────────

interface MockResponse {
  statusCode: number;
  body: unknown;
}

interface MockFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

function createReq(
  body: unknown,
  anonId: string,
  ip: string,
  file: MockFile | null,
): unknown {
  return {
    anonId,
    body,
    file: file ?? undefined,
    headers: { "x-forwarded-for": ip },
    socket: { remoteAddress: ip },
    cookies: {},
    query: {},
    params: {},
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

// ── Generators ───────────────────────────────────────────────────────────────

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

// Limits from designRateLimit.ts.
const ANON_LIMIT = 3;
const IP_LIMIT = 5;
const MAX_PHOTO_SIZE_BYTES = 8 * 1024 * 1024;

/** A fully valid bedroom body — the baseline we then break in exactly one way. */
function baseValidBody(): Record<string, unknown> {
  return {
    roomType: "bedroom",
    style: "modern",
    palette: "warm_neutral",
    widthCm: 350,
    lengthCm: 400,
    heightCm: 260,
    budget: 1_000_000,
    "cf-turnstile-response": "dev-bypass",
  };
}

/**
 * Generators of requests that PASS captcha but FAIL validation. Each variant
 * mutates exactly one aspect of an otherwise-valid bedroom body so a violation
 * is guaranteed regardless of the other (random) fields. `file` is the optional
 * MockFile attached to the request (only the photo variants use it).
 */
interface BrokenRequest {
  body: Record<string, unknown>;
  file: MockFile | null;
  label: string;
}

const invalidRoomTypeArb: fc.Arbitrary<BrokenRequest> = fc
  .constantFrom("garage", "office", "studio", "balcony", "garden", "attic")
  .map((roomType) => ({
    body: { ...baseValidBody(), roomType },
    file: null,
    label: `invalid_roomType:${roomType}`,
  }));

const invalidStyleArb: fc.Arbitrary<BrokenRequest> = fc
  .constantFrom("brutalism", "rococo", "memphis", "bauhaus", "victorian")
  .map((style) => ({
    body: { ...baseValidBody(), style },
    file: null,
    label: `invalid_style:${style}`,
  }));

const budgetOutOfRangeArb: fc.Arbitrary<BrokenRequest> = fc
  .oneof(
    fc.integer({ min: 0, max: 49_999 }),
    fc.integer({ min: 5_000_001, max: 50_000_000 }),
  )
  .map((budget) => ({
    body: { ...baseValidBody(), budget },
    file: null,
    label: `budget_out_of_range:${budget}`,
  }));

const dimensionOutOfRangeArb: fc.Arbitrary<BrokenRequest> = fc
  .oneof(
    fc.integer({ min: 1, max: 199 }),
    fc.integer({ min: 801, max: 5_000 }),
  )
  .map((widthCm) => ({
    body: { ...baseValidBody(), widthCm },
    file: null,
    label: `width_out_of_range:${widthCm}`,
  }));

const invalidPaletteArb: fc.Arbitrary<BrokenRequest> = fc
  .oneof(
    fc.constantFrom("neon", "rainbow", "monochrome", ""),
    fc.string({ minLength: 1, maxLength: 16 }).filter(
      (s) => !(PALETTES as readonly string[]).includes(s),
    ),
  )
  .map((palette) => ({
    body: { ...baseValidBody(), palette },
    file: null,
    label: `invalid_palette:${palette}`,
  }));

const invalidPhotoTypeArb: fc.Arbitrary<BrokenRequest> = fc
  .record({
    bytes: fc.uint8Array({ minLength: 1, maxLength: 64 }),
    mimetype: fc.constantFrom(
      "image/gif",
      "image/webp",
      "application/pdf",
      "text/plain",
      "image/svg+xml",
    ),
    size: fc.integer({ min: 1, max: MAX_PHOTO_SIZE_BYTES }),
  })
  .map(({ bytes, mimetype, size }) => ({
    body: baseValidBody(),
    file: { buffer: Buffer.from(bytes), mimetype, size },
    label: `invalid_photo_type:${mimetype}`,
  }));

const photoTooLargeArb: fc.Arbitrary<BrokenRequest> = fc
  .record({
    bytes: fc.uint8Array({ minLength: 1, maxLength: 64 }),
    mimetype: fc.constantFrom("image/jpeg", "image/png"),
    size: fc.integer({
      min: MAX_PHOTO_SIZE_BYTES + 1,
      max: MAX_PHOTO_SIZE_BYTES * 4,
    }),
  })
  .map(({ bytes, mimetype, size }) => ({
    body: baseValidBody(),
    file: { buffer: Buffer.from(bytes), mimetype, size },
    label: `photo_too_large:${size}`,
  }));

const brokenRequestArb: fc.Arbitrary<BrokenRequest> = fc.oneof(
  invalidRoomTypeArb,
  invalidStyleArb,
  budgetOutOfRangeArb,
  dimensionOutOfRangeArb,
  invalidPaletteArb,
  invalidPhotoTypeArb,
  photoTooLargeArb,
);

const FAKE_ANON_ID = "11111111-1111-1111-1111-111111111111";

// ── Property 10 ───────────────────────────────────────────────────────────────

describe("dizajn POST /generate — Property 10: validation failure rolls back consumed rate-limit counters", () => {
  // Validates: Requirements 7.5

  it("after a counted-but-invalid request, both anon and ip counters return to their pre-request values", async () => {
    await fc.assert(
      fc.asyncProperty(
        brokenRequestArb,
        fc.ipV4(),
        // Pre-request seed counters strictly below the limit so the increment
        // is allowed and validation — not the limiter — is the rejection cause.
        fc.integer({ min: 0, max: ANON_LIMIT - 1 }),
        fc.integer({ min: 0, max: IP_LIMIT - 1 }),
        async (broken, ip, anonPre, ipPre) => {
          resetStore();
          sideEffects.length = 0;

          const anonKey = `anon:${FAKE_ANON_ID}`;
          const ipKey = `ip:${ip}`;

          // Seed the buckets with their pre-request values, in-window.
          store.set(anonKey, {
            counter: anonPre,
            window_start: new Date(fakeNow),
          });
          store.set(ipKey, { counter: ipPre, window_start: new Date(fakeNow) });

          const req = createReq(broken.body, FAKE_ANON_ID, ip, broken.file);
          const { res, out } = createRes();

          await handleGenerate(req, res);

          // (a) The endpoint rejected on validation — not rate-limit / captcha.
          assert.equal(
            out.statusCode,
            400,
            `[${broken.label}] expected 400 validation_error, got ${out.statusCode}: ${JSON.stringify(out.body)}`,
          );
          const body = out.body as {
            ok?: boolean;
            error?: string;
            violations?: unknown[];
          };
          assert.equal(body.ok, false);
          assert.equal(
            body.error,
            "validation_error",
            `[${broken.label}] expected error="validation_error", got ${JSON.stringify(body)}`,
          );
          assert.ok(
            Array.isArray(body.violations) && body.violations.length >= 1,
            `[${broken.label}] expected a non-empty violations[]`,
          );

          // (b) No Design_Project was created (and no slug pre-check ran).
          assert.ok(
            !sideEffects.includes("db.insert"),
            `[${broken.label}] no design row may be inserted on validation failure`,
          );

          // (c) The core property: both counters were consumed during the
          //     request (anon then ip) and then rolled back to their seeds.
          const anonAfter = store.get(anonKey)?.counter;
          const ipAfter = store.get(ipKey)?.counter;
          assert.equal(
            anonAfter,
            anonPre,
            `[${broken.label}] anon counter must return to pre-request value ${anonPre}, got ${anonAfter}`,
          );
          assert.equal(
            ipAfter,
            ipPre,
            `[${broken.label}] ip counter must return to pre-request value ${ipPre}, got ${ipAfter}`,
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});
