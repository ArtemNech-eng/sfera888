/**
 * Unit test for the photo-upload helper `uploadRoomPhoto(buf, mime)`.
 *
 * Module under test:
 *   - `uploadRoomPhoto` from `artifacts/api-server/src/lib/objectStorage.ts`
 *
 * Task 3.2 (ai-design-flagship):
 *   - Success → returns a key shaped like `dizajn/uploads/...`.
 *   - Storage `put` failure → the error is propagated (thrown).
 *
 * **Validates: Requirements 4.2**
 *
 * The R2/S3 client is mocked so no real network call happens. `objectStorage.ts`
 * builds its `s3Client` at import time (and throws if R2 env vars are missing),
 * so the required env vars are set *before* the module is dynamically imported,
 * and `s3Client.send` is replaced with a `node:test` mock per case.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it, before, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { PutObjectCommand } from "@aws-sdk/client-s3";

// ─── Env setup (must run before objectStorage.ts is imported) ───────────────
// objectStorage.ts calls getS3Client() at module load and throws unless these
// are present. The dynamic import in `before()` runs after these assignments.
process.env.R2_ENDPOINT = "https://example-account.r2.cloudflarestorage.com";
process.env.R2_ACCESS_KEY_ID = "test-access-key";
process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID = "test-bucket";

// ─── Lazily loaded module bindings ──────────────────────────────────────────
let uploadRoomPhoto: (
  buf: Buffer,
  mime: "image/jpeg" | "image/png",
) => Promise<string>;
// The shared, module-level S3 client whose `send` we mock.
let s3Client: { send: (...args: unknown[]) => Promise<unknown> };

const KEY_RE = /^dizajn\/uploads\/.+/;

describe("uploadRoomPhoto (mocked R2)", () => {
  before(async () => {
    const mod = await import("../../src/lib/objectStorage.js");
    uploadRoomPhoto = mod.uploadRoomPhoto;
    s3Client = mod.s3Client as unknown as typeof s3Client;
  });

  beforeEach(() => {
    mock.restoreAll();
  });

  afterEach(() => {
    mock.restoreAll();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Success → returns a key shaped like `dizajn/uploads/...`.
  // Validates: Requirements 4.2
  // ─────────────────────────────────────────────────────────────────────────
  it("returns a `dizajn/uploads/...` key on successful upload", async () => {
    const send = mock.method(s3Client, "send", async () => ({
      $metadata: { httpStatusCode: 200 },
    }));

    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // JPEG-ish bytes
    const key = await uploadRoomPhoto(buf, "image/jpeg");

    assert.match(
      key,
      KEY_RE,
      `expected key to match ${KEY_RE}, got "${key}"`,
    );

    // The helper sent exactly one PutObjectCommand to the storage client.
    assert.equal(send.mock.callCount(), 1);
    const command = send.mock.calls[0].arguments[0] as PutObjectCommand;
    assert.ok(
      command instanceof PutObjectCommand,
      "expected a PutObjectCommand to be sent",
    );
    assert.equal(command.input.Bucket, "test-bucket");
    assert.equal(command.input.Key, key);
    assert.equal(command.input.Body, buf);
    assert.equal(command.input.ContentType, "image/jpeg");
  });

  it("generates a distinct key per call (uuid suffix)", async () => {
    mock.method(s3Client, "send", async () => ({
      $metadata: { httpStatusCode: 200 },
    }));

    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG-ish bytes
    const key1 = await uploadRoomPhoto(buf, "image/png");
    const key2 = await uploadRoomPhoto(buf, "image/png");

    assert.match(key1, KEY_RE);
    assert.match(key2, KEY_RE);
    assert.notEqual(key1, key2, "keys should be unique per upload");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Storage `put` failure → error is propagated (thrown).
  // Validates: Requirements 4.2
  // ─────────────────────────────────────────────────────────────────────────
  it("propagates the error when the storage `put` fails", async () => {
    const storageError = new Error("R2 put failed");
    mock.method(s3Client, "send", async () => {
      throw storageError;
    });

    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

    await assert.rejects(
      () => uploadRoomPhoto(buf, "image/jpeg"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as Error).message, "R2 put failed");
        return true;
      },
    );
  });
});
