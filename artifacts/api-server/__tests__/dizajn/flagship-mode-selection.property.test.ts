// Feature: ai-design-flagship, Property 1: Generation mode is determined solely by photo presence
/**
 * Property test for AI_Design_Flagship generation-mode selection.
 *
 * Property 1: Generation mode is determined solely by photo presence.
 *
 * **Validates: Requirements 3.1, 3.2, 3.4, 4.4, 4.7**
 *
 * For any generation request, the created `Design_Project` is created in
 * `Image_To_Image_Mode` if and only if a valid `Room_Photo` was accepted and
 * persisted (`designs.input_image_url` non-null), and in `Text_To_Image_Mode`
 * otherwise. Materialised in the schema, this means:
 *   - photo present AND `uploadRoomPhoto` succeeds  → `input_image_url != null`
 *   - no photo                                      → `input_image_url == null`
 *
 * Behaviour under test lives in the inline `POST /generate` handler of
 * `src/routes/dizajn.ts`, which depends on Turnstile, the rate-limiter,
 * `validateGenerateRequest`, `uploadRoomPhoto`, and a DB insert. Following the
 * harness established by `captcha-order.property.test.ts`, we drive the route
 * handler directly with a hand-rolled `req`/`res` pair and mock every external
 * dependency so that 100+ iterations stay cheap and deterministic:
 *
 *   - Turnstile: `TURNSTILE_SECRET_KEY=""` → `verifyTurnstileToken` short-
 *     circuits to `success: true` without touching the network (dev bypass).
 *   - Rate-limiter: `db.execute` returns `{ rows: [] }` so `checkAndIncrement`
 *     reports `allowed: true` for both the anon and ip keys.
 *   - `uploadRoomPhoto`: backed by the module-level `s3Client`, whose `.send`
 *     we patch to resolve successfully → returns a `dizajn/uploads/{uuid}` key.
 *   - `pickUniqueSlug`: `db.select` reports the slug as free.
 *   - The final INSERT: `db.insert(...).values(row)` captures `row` so the test
 *     can read back the `inputImageUrl` actually persisted on the project.
 *
 * Multer's `upload.single("image")` middleware is bypassed by invoking the
 * terminal route handler directly and setting `req.file` ourselves — the same
 * shape multer would have produced (`{ buffer, mimetype, size }`).
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
// connect, since we monkey-patch their methods below.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";
process.env.R2_ENDPOINT = process.env.R2_ENDPOINT ?? "https://fake.r2.dev";
process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? "fake-key";
process.env.R2_SECRET_ACCESS_KEY =
  process.env.R2_SECRET_ACCESS_KEY ?? "fake-secret";
// `uploadRoomPhoto` requires a bucket id; the actual PUT is mocked.
process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID =
  process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? "fake-bucket";
// Empty secret → verifyTurnstileToken dev-bypass returns success: true,
// so the captcha gate never rejects and the network is never touched.
process.env.TURNSTILE_SECRET_KEY = "";

// ── Patch the @workspace/db singleton ────────────────────────────────────────
const dbModule = await import("@workspace/db");
const { db } = dbModule;

/** Captures the row passed to `db.insert(designsTable).values(row)`. */
let insertedRow: Record<string, unknown> | null = null;

// Rate-limit upsert / rollback: returning empty rows makes checkAndIncrement
// fall into its `allowed: true` branch (see designRateLimit.ts: `if (!row)`).
(db as unknown as { execute: (..._a: unknown[]) => Promise<unknown> }).execute =
  async () => ({ rows: [] });

// INSERT INTO designs ... RETURNING — capture the row, echo back a slug.
(db as unknown as { insert: (..._a: unknown[]) => unknown }).insert = () => ({
  values: (row: Record<string, unknown>) => {
    insertedRow = row;
    return {
      returning: async () => [
        { id: 1, slug: (row.slug as string) ?? "mode-test-slug" },
      ],
    };
  },
});

// pickUniqueSlug({ roomType, style }) → `.select({...}).from().where().limit(1)`
// resolving to `[]` means "slug is free", so a base slug is returned.
(db as unknown as { select: (..._a: unknown[]) => unknown }).select = () => {
  const terminal = {
    where: () => terminal,
    limit: async () => [] as unknown[],
    then: (resolve: (value: unknown[]) => void) => resolve([]),
  };
  return { from: () => terminal };
};

// ── Patch s3Client.send so uploadRoomPhoto succeeds without real R2 ──────────
const objectStorageModule = await import("../../src/lib/objectStorage.ts");
(
  objectStorageModule.s3Client as unknown as {
    send: (..._a: unknown[]) => Promise<unknown>;
  }
).send = async () => ({});

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
// The route layer's stack is [multer middleware, ...handlers]; the actual
// request handler is the terminal entry. Driving it directly bypasses multer,
// letting us set `req.file` ourselves.
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
  file: MockFile | null,
): unknown {
  return {
    anonId,
    body,
    file: file ?? undefined,
    headers: { "x-forwarded-for": "203.0.113.7" },
    socket: { remoteAddress: "203.0.113.7" },
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

// MVP-allowed room type only — `bedroom`. Any other valid room type would be
// rejected by the MVP lock (`mvp_room_locked`), which is a different property.
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

interface ValidBody {
  roomType: "bedroom";
  style: string;
  palette: string;
  widthCm: number;
  lengthCm: number;
  heightCm: number;
  budget: number;
}

/**
 * Fully valid `Flagship_Form` body (bedroom, in-range dims/budget, valid
 * palette). Width/length ≥ 300 cm ⇒ area ≥ 9 m² ≥ bedroom-min, so the only
 * variable under test is photo presence.
 */
const validBodyArb: fc.Arbitrary<ValidBody> = fc.record({
  roomType: fc.constant("bedroom" as const),
  style: fc.constantFrom(...STYLES),
  palette: fc.constantFrom(...PALETTES),
  widthCm: fc.integer({ min: 300, max: 800 }),
  lengthCm: fc.integer({ min: 300, max: 800 }),
  heightCm: fc.integer({ min: 220, max: 350 }),
  budget: fc.integer({ min: 50_000, max: 5_000_000 }),
});

// A valid JPG/PNG photo: arbitrary bytes (content irrelevant — R2 is mocked),
// size within the 8 МБ ceiling so validation accepts it.
const MAX_PHOTO_SIZE_BYTES = 8 * 1024 * 1024;
const validFileArb: fc.Arbitrary<MockFile> = fc
  .record({
    bytes: fc.uint8Array({ minLength: 1, maxLength: 64 }),
    mimetype: fc.constantFrom("image/jpeg", "image/png"),
    size: fc.integer({ min: 1, max: MAX_PHOTO_SIZE_BYTES }),
  })
  .map(({ bytes, mimetype, size }) => ({
    buffer: Buffer.from(bytes),
    mimetype,
    size,
  }));

const FAKE_ANON_ID = "11111111-1111-1111-1111-111111111111";

// ── Property 1 ────────────────────────────────────────────────────────────────

describe("Property 1: generation mode is determined solely by photo presence", () => {
  // Validates: Requirements 3.1, 3.2, 3.4, 4.4, 4.7

  it("photo present + storage success → Image_To_Image_Mode (input_image_url non-null)", async () => {
    await fc.assert(
      fc.asyncProperty(validBodyArb, validFileArb, async (body, file) => {
        insertedRow = null;
        const req = createReq(body, FAKE_ANON_ID, file);
        const { res, out } = createRes();

        await handleGenerate(req, res);

        // A project is started (202) and persisted as generating.
        assert.equal(
          out.statusCode,
          202,
          `expected 202 for valid request + photo, got ${out.statusCode}: ${JSON.stringify(out.body)}`,
        );
        assert.ok(insertedRow, "a Design_Project row must be inserted");
        assert.equal(insertedRow!.status, "generating");

        // Mode is Image_To_Image ⇔ input_image_url references the stored photo.
        const inputImageUrl = insertedRow!.inputImageUrl;
        assert.notEqual(
          inputImageUrl,
          null,
          "with an accepted+persisted photo, input_image_url must be non-null (Image_To_Image_Mode)",
        );
        assert.equal(
          typeof inputImageUrl,
          "string",
          "input_image_url must be the stored R2 key",
        );
        assert.match(
          inputImageUrl as string,
          /^dizajn\/uploads\//,
          "input_image_url must reference the uploaded object",
        );
      }),
      { numRuns: 100 },
    );
  });

  it("no photo → Text_To_Image_Mode (input_image_url null)", async () => {
    await fc.assert(
      fc.asyncProperty(validBodyArb, async (body) => {
        insertedRow = null;
        const req = createReq(body, FAKE_ANON_ID, null);
        const { res, out } = createRes();

        await handleGenerate(req, res);

        assert.equal(
          out.statusCode,
          202,
          `expected 202 for valid request without photo, got ${out.statusCode}: ${JSON.stringify(out.body)}`,
        );
        assert.ok(insertedRow, "a Design_Project row must be inserted");
        assert.equal(insertedRow!.status, "generating");

        // No photo ⇒ Text_To_Image_Mode ⇒ input_image_url is null.
        assert.equal(
          insertedRow!.inputImageUrl,
          null,
          "without a photo, input_image_url must be null (Text_To_Image_Mode)",
        );
      }),
      { numRuns: 100 },
    );
  });

  it("mode is a pure function of photo presence (iff): photo↔non-null, none↔null", async () => {
    await fc.assert(
      fc.asyncProperty(
        validBodyArb,
        fc.option(validFileArb, { nil: null }),
        async (body, file) => {
          insertedRow = null;
          const req = createReq(body, FAKE_ANON_ID, file);
          const { res, out } = createRes();

          await handleGenerate(req, res);

          assert.equal(out.statusCode, 202, `expected 202, got ${out.statusCode}`);
          assert.ok(insertedRow, "a Design_Project row must be inserted");

          const isImageToImage = insertedRow!.inputImageUrl !== null;
          // The biconditional: photo present ⇔ Image_To_Image_Mode.
          assert.equal(
            isImageToImage,
            file !== null,
            `mode must be determined solely by photo presence: photo=${file !== null}, ` +
              `inputImageUrl=${JSON.stringify(insertedRow!.inputImageUrl)}`,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
