/**
 * Regression test (task 11.2, ai-design-flagship): guards the *historically
 * broken chain* documented in design.md → Overview ("разрыв в цепочке
 * запросов" / "сломанная цепочка").
 *
 * **Validates: Requirements 4.1, 4.2, 4.3**
 *
 * ── What used to be broken ────────────────────────────────────────────────
 * The Next proxy (`app/api/dizajn/generate/route.ts`) always forwarded
 * `multipart/form-data`, but the backend `POST /api/marketplace/dizajn/generate`
 * accepted **JSON only** and had **no upload handler** (no `multer`, no R2
 * receive). The consequences, verbatim from the design Overview, were:
 *
 *   1. Under `multipart`, `express.json()` did not parse the body, so
 *      `validateDesignForm(req.body)` saw an *empty object* → the request died
 *      with a `validation_error` (400) and **no project was created**.
 *   2. Even when a request slipped through, the photo had nowhere to go — the
 *      HTTP path **never populated `input_image_url`** — so `Image_To_Image_Mode`
 *      was unreachable from the web and `Design_Worker` never received a photo.
 *
 * ── What this test asserts (the gap is closed) ────────────────────────────
 * Driving the exact "форма с фото → прокси → backend" path, the endpoint:
 *   - does NOT answer with the old `400 validation_error` (multipart fields are
 *     now parsed, not seen as an empty body — Requirement 4.3 unified contract);
 *   - answers `202` (Requirement 4.1: photo data reaches the endpoint);
 *   - persists a `Design_Project` with a **non-null** `input_image_url`
 *     (Requirement 4.2: photo stored and linked — the closed gap).
 *
 * This is intentionally *complementary* to the 11.1 integration test (which
 * proves byte-exact R2 round-trip). Here the focus is the regression itself:
 * proving the broken-chain symptoms (empty-body 400, null `input_image_url`)
 * can no longer occur.
 *
 * External services are mocked so the test is cheap and deterministic:
 *   - Turnstile: `TURNSTILE_SECRET_KEY=""` → `verifyTurnstileToken` dev-bypass.
 *   - Rate-limiter: `db.execute` → `{ rows: [] }` ⇒ `checkAndIncrement` allows.
 *   - `pickUniqueSlug`: `db.select` reports the slug as free.
 *   - R2: `s3Client.send` resolves (so `uploadRoomPhoto` succeeds).
 *   - INSERT: `db.insert(...).values(row)` captures `row` and echoes a slug.
 *
 * Run via Node's built-in test runner (tsx --test).
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { PutObjectCommand } from "@aws-sdk/client-s3";

// ── Fake env BEFORE any production import ─────────────────────────────────────
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";
process.env.R2_ENDPOINT = process.env.R2_ENDPOINT ?? "https://fake.r2.dev";
process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? "fake-key";
process.env.R2_SECRET_ACCESS_KEY =
  process.env.R2_SECRET_ACCESS_KEY ?? "fake-secret";
process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID =
  process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? "fake-bucket";
// Empty secret → verifyTurnstileToken dev-bypass returns success: true.
process.env.TURNSTILE_SECRET_KEY = "";

// A real, minimal but valid baseline JPEG (1×1 px): SOI (FFD8) … EOI (FFD9).
const REAL_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof" +
  "Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwh" +
  "MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAAR" +
  "CAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAA" +
  "AAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oA" +
  "DAMBAAIRAxEAPwCdABmX/9k=";
const REAL_JPEG = Buffer.from(REAL_JPEG_BASE64, "base64");

const ANON_ID = "22222222-2222-2222-2222-222222222222";

// ── Captured side effects ─────────────────────────────────────────────────
/** Row passed to `db.insert(designsTable).values(row)`. */
let insertedRow: Record<string, unknown> | null = null;
/** The `PutObjectCommand` sent to R2 by `uploadRoomPhoto`. */
let putCommand: PutObjectCommand | null = null;

// ── Patch the @workspace/db singleton ────────────────────────────────────────
const dbModule = await import("@workspace/db");
const { db } = dbModule;

// Rate-limit upsert / rollback: empty rows → checkAndIncrement allows.
(db as unknown as { execute: (..._a: unknown[]) => Promise<unknown> }).execute =
  async () => ({ rows: [] });

// INSERT INTO designs ... RETURNING — capture the row, echo back a slug.
(db as unknown as { insert: (..._a: unknown[]) => unknown }).insert = () => ({
  values: (row: Record<string, unknown>) => {
    insertedRow = row;
    return {
      returning: async () => [
        { id: 1, slug: (row.slug as string) ?? "regression-slug" },
      ],
    };
  },
});

// pickUniqueSlug → `.select(...).from().where().limit(1)` resolving to `[]`
// means "slug is free", so the base slug is returned unchanged.
(db as unknown as { select: (..._a: unknown[]) => unknown }).select = () => {
  const terminal = {
    where: () => terminal,
    limit: async () => [] as unknown[],
    then: (resolve: (value: unknown[]) => void) => resolve([]),
  };
  return { from: () => terminal };
};

// ── Patch s3Client.send so uploadRoomPhoto's R2 `put` succeeds (and capture) ─
const objectStorageModule = await import("../../src/lib/objectStorage.ts");
(
  objectStorageModule.s3Client as unknown as {
    send: (cmd: unknown) => Promise<unknown>;
  }
).send = async (cmd: unknown) => {
  if (cmd instanceof PutObjectCommand) {
    putCommand = cmd;
  }
  return { $metadata: { httpStatusCode: 200 } };
};

// ── Build the Express app exactly like production wiring ─────────────────────
const expressModule = await import("express");
const express = expressModule.default;
const cookieParserModule = await import("cookie-parser");
const cookieParser = cookieParserModule.default;
const { anonIdMiddleware } = await import(
  "../../src/middlewares/anonIdMiddleware.ts"
);
const dizajnRouterModule = await import("../../src/routes/dizajn.ts");
const dizajnRouter = dizajnRouterModule.default;

const app = express();
app.use(cookieParser());
app.use(anonIdMiddleware);
app.use("/api/marketplace/dizajn", dizajnRouter);

let server: http.Server;
let baseUrl = "";

/**
 * Faithful in-process replica of `Proxy_Route` (app/api/dizajn/generate/route.ts):
 * copy every entry from the browser form into a fresh FormData, then inject the
 * resolved `anonId` — and *nothing else* (Requirement 4.3: the contract is the
 * same `multipart/form-data` on every link, the proxy only adds `anonId`).
 */
function proxyForward(originalForm: FormData, anonId: string): FormData {
  const upstreamForm = new FormData();
  for (const [key, value] of originalForm.entries()) {
    upstreamForm.append(key, value);
  }
  upstreamForm.set("anonId", anonId);
  return upstreamForm;
}

describe("Regression: broken multipart chain is closed (task 11.2)", () => {
  // Validates: Requirements 4.1, 4.2, 4.3

  before(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("«форма с фото → прокси → backend» ends with 202 and a non-null input_image_url", async () => {
    insertedRow = null;
    putCommand = null;

    // The form the Flagship_Form submits, carrying a Room_Photo.
    const browserForm = new FormData();
    browserForm.set("roomType", "bedroom"); // MVP-allowed
    browserForm.set("style", "scandinavian");
    browserForm.set("palette", "white_wood");
    browserForm.set("widthCm", "400");
    browserForm.set("lengthCm", "400");
    browserForm.set("heightCm", "270");
    browserForm.set("budget", "750000");
    browserForm.set(
      "image",
      new Blob([REAL_JPEG], { type: "image/jpeg" }),
      "room.jpg",
    );

    // Proxy re-encodes the multipart form and injects only anonId.
    const upstreamForm = proxyForward(browserForm, ANON_ID);

    const res = await fetch(`${baseUrl}/api/marketplace/dizajn/generate`, {
      method: "POST",
      body: upstreamForm,
      headers: {
        cookie: `kiro_anon_id=${ANON_ID}`,
        "x-forwarded-for": "198.51.100.23",
      },
    });

    const body = (await res.json()) as {
      ok?: boolean;
      design?: { slug?: string };
      error?: string;
      violations?: unknown;
    };

    // ── Historic symptom #1 must NOT recur: a multipart body parsed as an
    //    empty object used to die with `400 validation_error`. ──────────────
    assert.notEqual(
      res.status,
      400,
      `regression: multipart request must not be rejected as if its body were ` +
        `empty (got 400 ${JSON.stringify(body)})`,
    );
    assert.notEqual(
      body.error,
      "validation_error",
      "regression: multipart fields must be parsed, not seen as empty body",
    );

    // ── The chain now completes: 202 (Requirement 4.1). ───────────────────
    assert.equal(
      res.status,
      202,
      `expected 202, got ${res.status}: ${JSON.stringify(body)}`,
    );
    assert.equal(body.ok, true);
    assert.equal(typeof body.design?.slug, "string");

    // ── Proof the multipart text fields actually arrived (the old JSON-only
    //    handler saw req.body = {}). The row reflects what the form sent. ───
    assert.ok(insertedRow, "a Design_Project row must be inserted");
    assert.equal(insertedRow!.roomType, "bedroom");
    assert.equal(insertedRow!.style, "scandinavian");
    assert.equal(insertedRow!.palette, "white_wood");
    assert.equal(insertedRow!.anonId, ANON_ID);
    assert.equal(insertedRow!.status, "generating");

    // ── Historic symptom #2 must NOT recur: the HTTP path now populates
    //    input_image_url (Requirement 4.2 — the closed gap). ────────────────
    const inputImageUrl = insertedRow!.inputImageUrl;
    assert.notEqual(
      inputImageUrl,
      null,
      "regression: input_image_url must no longer be null for a photo upload",
    );
    assert.equal(
      typeof inputImageUrl,
      "string",
      "input_image_url must be the stored R2 key (non-null)",
    );
    // The photo did reach Object_Storage and is linked to the project.
    assert.ok(
      putCommand,
      "the uploaded photo must be persisted to Object_Storage",
    );
    assert.equal(
      inputImageUrl,
      String(putCommand!.input.Key),
      "input_image_url must reference exactly the stored object (Requirement 4.2)",
    );
  });
});
