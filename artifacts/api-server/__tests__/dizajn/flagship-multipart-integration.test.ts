/**
 * Integration test (task 11.1, ai-design-flagship): a real JPEG submitted as
 * `multipart/form-data` survives the `Proxy_Route` re-encoding, reaches the
 * `Generate_Endpoint`, is uploaded to `Object_Storage` (R2 `put` mocked) and
 * the created `Design_Project` is persisted with a NON-NULL `input_image_url`,
 * the endpoint answering `202`.
 *
 * **Validates: Requirements 4.1, 4.2**
 *
 * This closes the historically broken chain documented in design.md → Overview:
 * the Next proxy forwards `multipart`, but the backend used to accept JSON only
 * and never populated `input_image_url`. Unlike the pure property tests (which
 * bypass multer and set `req.file` by hand), this test exercises the *real*
 * wiring end-to-end:
 *
 *   real JPEG bytes
 *     → encoded as multipart/form-data (global FormData + Blob)
 *     → `Proxy_Route` rebuild step (copy every entry + inject `anonId`)
 *     → real HTTP POST over an ephemeral Express server
 *     → `cookieParser` + `anonIdMiddleware`
 *     → `multer` memory storage actually parses the multipart body
 *     → inline `POST /generate` handler
 *     → `uploadRoomPhoto` → mocked `s3Client.send` (R2 `put`)
 *     → captured INSERT row.
 *
 * External services are mocked so the test is cheap and deterministic:
 *   - Turnstile: `TURNSTILE_SECRET_KEY=""` → `verifyTurnstileToken` dev-bypass.
 *   - Rate-limiter: `db.execute` → `{ rows: [] }` ⇒ `checkAndIncrement` allows.
 *   - `pickUniqueSlug`: `db.select` reports the slug as free.
 *   - R2: `s3Client.send` resolves and captures the `PutObjectCommand`.
 *   - INSERT: `db.insert(...).values(row)` captures `row` and echoes a slug.
 *
 * Run via Node's built-in test runner (tsx --test):
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { PutObjectCommand } from "@aws-sdk/client-s3";

// ── Fake env BEFORE any production import ─────────────────────────────────────
// `objectStorage.ts` builds an S3Client at module load; `@workspace/db`
// instantiates a pg.Pool from DATABASE_URL. Both only *read* these vars — the
// network is never touched because we monkey-patch their methods below.
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

// A real, minimal but valid baseline JPEG (1×1 px). Starts with the SOI marker
// (FFD8) and ends with EOI (FFD9) — i.e. genuine JPEG bytes, not a placeholder.
const REAL_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof" +
  "Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwh" +
  "MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAAR" +
  "CAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAA" +
  "AAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oA" +
  "DAMBAAIRAxEAPwCdABmX/9k=";
const REAL_JPEG = Buffer.from(REAL_JPEG_BASE64, "base64");

const ANON_ID = "11111111-1111-1111-1111-111111111111";

// ── Captured side effects ─────────────────────────────────────────────────
/** Row passed to `db.insert(designsTable).values(row)`. */
let insertedRow: Record<string, unknown> | null = null;
/** The `PutObjectCommand` sent to R2 by `uploadRoomPhoto`. */
let putCommand: PutObjectCommand | null = null;

// ── Patch the @workspace/db singleton ────────────────────────────────────────
const dbModule = await import("@workspace/db");
const { db } = dbModule;

// Rate-limit upsert / rollback: empty rows → checkAndIncrement allows (see
// designRateLimit.ts: `if (!row) { return { allowed: true, ... } }`).
(db as unknown as { execute: (..._a: unknown[]) => Promise<unknown> }).execute =
  async () => ({ rows: [] });

// INSERT INTO designs ... RETURNING — capture the row, echo back a slug.
(db as unknown as { insert: (..._a: unknown[]) => unknown }).insert = () => ({
  values: (row: Record<string, unknown>) => {
    insertedRow = row;
    return {
      returning: async () => [
        { id: 1, slug: (row.slug as string) ?? "integration-slug" },
      ],
    };
  },
});

// pickUniqueSlug → `.select({...}).from().where().limit(1)` resolving to `[]`
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
 * read every entry from the original form and append it to a fresh FormData,
 * then inject the resolved `anonId`. This is precisely the re-encoding step
 * that must NOT lose the image bytes — the heart of the regression.
 */
function proxyForward(originalForm: FormData, anonId: string): FormData {
  const upstreamForm = new FormData();
  for (const [key, value] of originalForm.entries()) {
    upstreamForm.append(key, value);
  }
  upstreamForm.set("anonId", anonId);
  return upstreamForm;
}

describe("Integration: multipart photo reaches R2 and fills input_image_url (task 11.1)", () => {
  // Validates: Requirements 4.1, 4.2

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

  it("a real JPEG → proxy re-encode → backend → R2 put → 202 with non-null input_image_url", async () => {
    insertedRow = null;
    putCommand = null;

    // 1. The form the browser would submit to the Flagship_Form's proxy.
    const browserForm = new FormData();
    browserForm.set("roomType", "bedroom"); // MVP-allowed
    browserForm.set("style", "modern");
    browserForm.set("palette", "warm_neutral");
    browserForm.set("widthCm", "400");
    browserForm.set("lengthCm", "400");
    browserForm.set("heightCm", "270");
    browserForm.set("budget", "500000");
    browserForm.set(
      "image",
      new Blob([REAL_JPEG], { type: "image/jpeg" }),
      "room.jpg",
    );

    // 2. Proxy_Route rebuilds the multipart form and injects anonId.
    const upstreamForm = proxyForward(browserForm, ANON_ID);

    // 3. Real HTTP POST to the Generate_Endpoint. Sending the kiro_anon_id
    //    cookie makes anonIdMiddleware resolve req.anonId deterministically
    //    (the same cookie the proxy sets on the client).
    const res = await fetch(`${baseUrl}/api/marketplace/dizajn/generate`, {
      method: "POST",
      body: upstreamForm,
      headers: {
        cookie: `kiro_anon_id=${ANON_ID}`,
        "x-forwarded-for": "203.0.113.7",
      },
    });

    const body = (await res.json()) as {
      ok?: boolean;
      design?: { slug?: string };
      error?: string;
      violations?: unknown;
    };

    // ── 202 Accepted (Requirement 4.1: photo data reaches the endpoint) ──
    assert.equal(
      res.status,
      202,
      `expected 202, got ${res.status}: ${JSON.stringify(body)}`,
    );
    assert.equal(body.ok, true);
    assert.equal(typeof body.design?.slug, "string");

    // ── R2 `put` actually happened (Requirement 4.2: stored in Object_Storage) ──
    assert.ok(putCommand, "uploadRoomPhoto must send a PutObjectCommand to R2");
    assert.equal(putCommand!.input.Bucket, "fake-bucket");
    assert.equal(putCommand!.input.ContentType, "image/jpeg");
    assert.match(
      String(putCommand!.input.Key),
      /^dizajn\/uploads\//,
      "photo must be stored under dizajn/uploads/",
    );
    // The exact JPEG bytes survived multipart encode → proxy re-encode →
    // multer parse → R2 put (no data loss — the core of Requirement 4.1).
    assert.ok(
      Buffer.isBuffer(putCommand!.input.Body),
      "R2 body must be the photo buffer",
    );
    assert.equal(
      Buffer.compare(putCommand!.input.Body as Buffer, REAL_JPEG),
      0,
      "the bytes uploaded to R2 must equal the original JPEG (no data loss)",
    );

    // ── Design_Project persisted with NON-NULL input_image_url linked to R2 ──
    assert.ok(insertedRow, "a Design_Project row must be inserted");
    assert.equal(insertedRow!.status, "generating");
    assert.equal(insertedRow!.anonId, ANON_ID);
    const inputImageUrl = insertedRow!.inputImageUrl;
    assert.equal(
      typeof inputImageUrl,
      "string",
      "input_image_url must be the stored R2 key (non-null)",
    );
    assert.equal(
      inputImageUrl,
      String(putCommand!.input.Key),
      "input_image_url must reference exactly the object stored in R2 (Requirement 4.2)",
    );
  });
});
