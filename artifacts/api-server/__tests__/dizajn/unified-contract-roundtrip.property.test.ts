// Feature: ai-design-flagship, Property 4: Unified contract round-trips fields and photo bytes
/**
 * Property test for the AI_Design_Flagship unified Request_Contract.
 *
 * Property 4: Unified contract round-trips fields and photo bytes.
 *
 * **Validates: Requirements 4.1, 4.3**
 *
 * For any valid set of form fields and any photo byte buffer, encoding them as
 * the `Request_Contract` (`multipart/form-data`) and passing through the
 * `Proxy_Route` to the `Generate_Endpoint` preserves every field value and the
 * exact photo bytes (no data loss), with only `anonId` added by the proxy.
 *
 * What is under test
 * ------------------
 * The contract round-trip spans three hops:
 *
 *   Flagship_Form ──multipart──▶ Proxy_Route ──multipart(+anonId)──▶ Generate_Endpoint
 *
 * The only transform on the wire is the one performed by
 * `app/api/dizajn/generate/route.ts` (`Proxy_Route`): it reads the incoming
 * `multipart/form-data` via `req.formData()`, rebuilds a fresh `FormData`
 * copying *every* entry verbatim, and then injects exactly one field —
 * `anonId` — via `upstreamForm.set("anonId", anonId)`. It deliberately sets no
 * manual `Content-Type` so the platform re-serialises a correct multipart
 * boundary.
 *
 * Because the `Proxy_Route` is a Next.js route handler bound to `next/server`,
 * `next/headers` and marketplace env, it cannot be imported into the api-server
 * test package. Instead this test reproduces its documented passthrough
 * transform *exactly* (copy all entries, then `set("anonId", ...)`) and
 * exercises the **real** WHATWG multipart serialisation/deserialisation on both
 * hops via `Request`/`FormData`/`Blob` (the same undici implementation Next and
 * `multer`-equivalents parse). This proves the contract itself round-trips
 * without data loss — which is the substance of Requirements 4.1 and 4.3.
 *
 * Run via Node's built-in test runner (tsx --test):
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

// ── Reserved field names ─────────────────────────────────────────────────────
// `anonId` is the field the proxy injects; `image` is the binary photo part.
// Generated text fields must avoid both so we can assert "only anonId added".
const RESERVED_FIELDS = new Set(["anonId", "image"]);

// ── Proxy_Route transform (faithful replica of route.ts) ─────────────────────
/**
 * Mirrors the passthrough in `app/api/dizajn/generate/route.ts`:
 *   const upstreamForm = new FormData();
 *   for (const [key, value] of originalForm.entries()) upstreamForm.append(key, value);
 *   upstreamForm.set("anonId", anonId);
 *
 * Returns the FormData the proxy would forward to the Generate_Endpoint.
 */
function proxyForward(incoming: FormData, anonId: string): FormData {
  const upstreamForm = new FormData();
  for (const [key, value] of incoming.entries()) {
    upstreamForm.append(key, value);
  }
  upstreamForm.set("anonId", anonId);
  return upstreamForm;
}

/**
 * Serialise a FormData to a real `multipart/form-data` body and parse it back —
 * exactly what crossing an HTTP hop does. This exercises the platform's
 * multipart encoder (boundary generation) and decoder, with no manual
 * Content-Type (the proxy relies on the platform to set the boundary).
 */
async function overTheWire(form: FormData): Promise<FormData> {
  const req = new Request("http://contract.local/marketplace/dizajn/generate", {
    method: "POST",
    body: form,
  });
  return req.formData();
}

// ── Generators ───────────────────────────────────────────────────────────────

// Field names: identifier-like, non-empty, excluding the reserved names.
const fieldKeyArb = fc
  .string({
    minLength: 1,
    maxLength: 24,
    unit: fc.constantFrom(
      ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_".split(
        "",
      ),
    ),
  })
  .filter((k) => k.length > 0 && !RESERVED_FIELDS.has(k));

// Field values: arbitrary text WITHOUT control characters. Real Request_Contract
// values (roomType, style, palette, numeric strings, cityId) never contain
// CR/LF/control bytes; excluding them keeps the multipart round-trip about data
// preservation rather than encoder edge-cases that the contract never exercises.
const fieldValueArb = fc
  .string({ minLength: 0, maxLength: 48 })
  // strip C0 controls + DEL so values can't smuggle a header/boundary delimiter
  .map((s) => s.replace(/[\u0000-\u001f\u007f]/g, ""));

// An arbitrary set of form fields (unique keys), modelling the variable part of
// the Request_Contract. Includes 0..12 fields so the empty-form edge is covered.
const fieldSetArb: fc.Arbitrary<Record<string, string>> = fc.dictionary(
  fieldKeyArb,
  fieldValueArb,
  { maxKeys: 12 },
);

// A photo byte buffer: arbitrary bytes (content is opaque to the contract),
// straddling the empty boundary up to a few KiB. MIME ∈ {jpeg, png}.
interface PhotoArb {
  bytes: Uint8Array;
  mime: "image/jpeg" | "image/png";
  filename: string;
}
const photoArb: fc.Arbitrary<PhotoArb> = fc.record({
  bytes: fc.uint8Array({ minLength: 0, maxLength: 4096 }),
  mime: fc.constantFrom("image/jpeg" as const, "image/png" as const),
  filename: fc.constantFrom("room.jpg", "room.png", "photo.jpeg", "upload.png"),
});

// A v4-shaped anon id the proxy injects (value is opaque to the round-trip).
const anonIdArb = fc.uuid();

// ── Helpers ──────────────────────────────────────────────────────────────────

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

async function fileBytes(value: FormDataEntryValue): Promise<Uint8Array> {
  assert.ok(
    value instanceof Blob,
    "the `image` part must round-trip as a File/Blob, not a text field",
  );
  return new Uint8Array(await (value as Blob).arrayBuffer());
}

// ── Property 4 ────────────────────────────────────────────────────────────────

describe("Property 4: unified contract round-trips fields and photo bytes", () => {
  // Validates: Requirements 4.1, 4.3

  it("with a photo: every field value and the exact photo bytes survive, only anonId is added", async () => {
    await fc.assert(
      fc.asyncProperty(
        fieldSetArb,
        photoArb,
        anonIdArb,
        async (fields, photo, anonId) => {
          // 1. Flagship_Form encodes the contract as multipart/form-data.
          const clientForm = new FormData();
          for (const [k, v] of Object.entries(fields)) clientForm.append(k, v);
          clientForm.append(
            "image",
            new Blob([photo.bytes], { type: photo.mime }),
            photo.filename,
          );

          // 2. First hop: Flagship_Form → Proxy_Route (real multipart wire).
          const atProxy = await overTheWire(clientForm);

          // 3. Proxy_Route transform: passthrough + inject anonId.
          const forwarded = proxyForward(atProxy, anonId);

          // 4. Second hop: Proxy_Route → Generate_Endpoint (real multipart wire).
          const atEndpoint = await overTheWire(forwarded);

          // ── Assertions ───────────────────────────────────────────────────
          // Every text field value is preserved verbatim.
          for (const [k, v] of Object.entries(fields)) {
            assert.equal(
              atEndpoint.get(k),
              v,
              `field "${k}" must round-trip unchanged`,
            );
          }

          // The photo part survives as a Blob with the exact bytes and MIME.
          const received = atEndpoint.get("image");
          const receivedBytes = await fileBytes(received!);
          assert.ok(
            bytesEqual(receivedBytes, photo.bytes),
            `photo bytes must be preserved exactly (len ${photo.bytes.length} → ${receivedBytes.length})`,
          );
          assert.equal(
            (received as Blob).type,
            photo.mime,
            "photo MIME type must be preserved",
          );

          // Only anonId is added by the proxy: keys = original ∪ {image, anonId}.
          const receivedKeys = new Set(atEndpoint.keys());
          const expectedKeys = new Set<string>([
            ...Object.keys(fields),
            "image",
            "anonId",
          ]);
          assert.deepEqual(
            [...receivedKeys].sort(),
            [...expectedKeys].sort(),
            "endpoint must receive exactly the original fields plus the proxy-injected anonId",
          );
          assert.equal(
            atEndpoint.get("anonId"),
            anonId,
            "the proxy-injected anonId must arrive intact",
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("without a photo: fields survive and the proxy adds only anonId (no image part)", async () => {
    await fc.assert(
      fc.asyncProperty(fieldSetArb, anonIdArb, async (fields, anonId) => {
        const clientForm = new FormData();
        for (const [k, v] of Object.entries(fields)) clientForm.append(k, v);

        const atProxy = await overTheWire(clientForm);
        const forwarded = proxyForward(atProxy, anonId);
        const atEndpoint = await overTheWire(forwarded);

        for (const [k, v] of Object.entries(fields)) {
          assert.equal(
            atEndpoint.get(k),
            v,
            `field "${k}" must round-trip unchanged`,
          );
        }

        assert.equal(
          atEndpoint.get("image"),
          null,
          "no photo was sent, so no image part may appear at the endpoint",
        );

        const receivedKeys = new Set(atEndpoint.keys());
        const expectedKeys = new Set<string>([...Object.keys(fields), "anonId"]);
        assert.deepEqual(
          [...receivedKeys].sort(),
          [...expectedKeys].sort(),
          "endpoint must receive exactly the original fields plus the proxy-injected anonId",
        );
        assert.equal(atEndpoint.get("anonId"), anonId);
      }),
      { numRuns: 100 },
    );
  });
});
