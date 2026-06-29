/**
 * Property test for SEO_Page publish failure preserving the board's public URL.
 *
 * Feature: ai-design-3d-blockout, Property 26: URL борда сохраняется при сбое
 * публикации.
 *
 * **Validates: Requirements 11.5**
 *
 * Module under test:
 *   - `publishSeoPage`, `RAILWAY_ENV_VARS` from
 *     `artifacts/api-server/src/lib/blockout/seoPublish.ts`.
 *
 * Property 26 (URL борда сохраняется при сбое публикации):
 *   For any SEO_Page publish that is skipped/failed *after* the board was
 *   uploaded to R2, the pipeline output still contains the public URL of the
 *   uploaded board (Requirement 11.5). `publishSeoPage` realises this by
 *   always returning `{ boardPublicUrl }` even on a skip — with
 *   `published === false` and a populated `skippedPublishReason`.
 *
 * How the skip is forced WITHOUT a real database (per `seoPublish.ts`, the
 * `@workspace/db` module is only imported *after* the Railway + `DATABASE_URL`
 * checks, so we can drive a deterministic skip purely through `process.env`):
 *   - scenario "not-railway"     — none of `RAILWAY_ENV_VARS` is set, so the
 *                                  publish is skipped before touching the DB;
 *   - scenario "no-database-url" — a Railway env var is set but `DATABASE_URL`
 *                                  is unset/blank, so the publish is skipped
 *                                  before the dynamic `@workspace/db` import.
 *   Both are genuine publish failures from the pipeline's point of view, and
 *   both must preserve `boardPublicUrl`.
 *
 * `process.env` is snapshotted and fully restored around every iteration, so
 * the test leaves the ambient environment untouched.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import type { DesignView } from "@workspace/db";
import {
  publishSeoPage,
  RAILWAY_ENV_VARS,
} from "../../src/lib/blockout/seoPublish.js";

// ─── Generators ──────────────────────────────────────────────────────────────

/**
 * Arbitrary public URL of the uploaded board. Mixes realistic R2-style URLs
 * with free-form non-blank strings, since `publishSeoPage` treats the value
 * opaquely and must echo it back exactly.
 */
const boardPublicUrlArb = fc.oneof(
  fc
    .tuple(
      fc.constantFrom("https://", "http://"),
      fc.constantFrom(
        "pub-r2.example.com",
        "cdn.sfera888.ru",
        "files.r2.dev",
      ),
      fc
        .array(
          fc.constantFrom(
            ..."abcdefghijklmnopqrstuvwxyz0123456789-_/".split(""),
          ),
          { minLength: 1, maxLength: 40 },
        )
        .map((c) => c.join("")),
      fc.constantFrom(".png", ".jpg", ".webp", ""),
    )
    .map(([proto, host, path, ext]) => `${proto}${host}/${path}${ext}`),
  fc.string({ minLength: 1, maxLength: 80 }).filter((s) => s.trim() !== ""),
);

/** A single project view (`designs.views[]`). */
const designViewArb: fc.Arbitrary<DesignView> = fc.record({
  url: boardPublicUrlArb,
  label: fc.string({ minLength: 1, maxLength: 30 }),
  position: fc.integer({ min: 1, max: 5 }),
});

/** Minimal-but-valid structured SEO content (roomType + style required). */
const contentArb = fc.record({
  roomType: fc.constantFrom(
    "bedroom",
    "kitchen",
    "bathroom",
    "living_room",
    "hallway",
  ),
  style: fc.constantFrom("modern", "scandi", "loft", "classic", "minimal"),
  area: fc.option(fc.integer({ min: 5, max: 200 }), { nil: null }),
  cityId: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: null }),
  slug: fc.option(
    fc
      .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-".split("")), {
        minLength: 1,
        maxLength: 24,
      })
      .map((c) => c.join("")),
    { nil: null },
  ),
});

/**
 * How to make a Railway env var "unset" (in the not-railway scenario every
 * Railway var is removed) or how `DATABASE_URL` is left missing (delete or
 * blank — both count as missing per `seoPublish.ts`).
 */
const blankModeArb = fc.constantFrom<string | undefined>(
  undefined, // delete the key
  "", // empty string
  " ", // single space
  "   ", // multiple spaces
  "\t", // tab
  "\n", // newline
);

/** Scenario that forces a deterministic publish skip without a database. */
const scenarioArb = fc.oneof(
  // 1. Not running on Railway → skip before any DB access.
  fc.record({
    kind: fc.constant("not-railway" as const),
    // DATABASE_URL is irrelevant here; vary it to prove it does not matter.
    databaseUrl: fc.option(fc.string({ minLength: 1, maxLength: 40 }), {
      nil: undefined,
    }),
  }),
  // 2. On Railway but DATABASE_URL is missing → skip before the @workspace/db
  //    import (which would otherwise throw on load).
  fc.record({
    kind: fc.constant("no-database-url" as const),
    // Which Railway var to set (any one is enough to look like Railway).
    railwayVar: fc.constantFrom(...RAILWAY_ENV_VARS),
    railwayValue: fc
      .string({ minLength: 1, maxLength: 20 })
      .filter((s) => s.trim() !== ""),
    databaseUrlBlankMode: blankModeArb,
  }),
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ENV_KEYS = [...RAILWAY_ENV_VARS, "DATABASE_URL"] as const;

/**
 * Snapshot every env key we touch, run `fn`, then restore — regardless of how
 * `fn` settles — so the ambient environment is never mutated by the test.
 */
async function withEnv(
  apply: () => void,
  fn: () => Promise<void>,
): Promise<void> {
  const saved = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) saved.set(key, process.env[key]);

  const restore = () => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };

  try {
    // Start from a clean slate for the keys under test, then apply scenario.
    for (const key of ENV_KEYS) delete process.env[key];
    apply();
    await fn();
  } finally {
    restore();
  }
}

/** Configure `process.env` for the given skip scenario. */
function applyScenario(scenario: {
  kind: "not-railway" | "no-database-url";
  databaseUrl?: string;
  railwayVar?: (typeof RAILWAY_ENV_VARS)[number];
  railwayValue?: string;
  databaseUrlBlankMode?: string;
}): void {
  if (scenario.kind === "not-railway") {
    // All Railway vars already deleted by withEnv. Optionally set a
    // (harmless) DATABASE_URL to prove it is not consulted off-Railway.
    if (scenario.databaseUrl !== undefined) {
      process.env.DATABASE_URL = scenario.databaseUrl;
    }
    return;
  }
  // no-database-url: look like Railway, but leave DATABASE_URL missing/blank.
  process.env[scenario.railwayVar!] = scenario.railwayValue!;
  if (scenario.databaseUrlBlankMode === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = scenario.databaseUrlBlankMode;
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("SEO_Page Property 26: board public URL is preserved on publish failure", () => {
  // -----------------------------------------------------------------------
  // Property 26 — a skipped/failed publish still returns the board URL.
  // Validates: Requirements 11.5
  // -----------------------------------------------------------------------
  it("publishSeoPage returns published=false with the exact boardPublicUrl and a skip reason", async () => {
    await fc.assert(
      fc.asyncProperty(
        boardPublicUrlArb,
        fc.array(designViewArb, { minLength: 0, maxLength: 5 }),
        contentArb,
        scenarioArb,
        async (boardPublicUrl, views, content, scenario) => {
          await withEnv(
            () => applyScenario(scenario),
            async () => {
              const result = await publishSeoPage({
                boardPublicUrl,
                views,
                content,
              });

              // The publish must have been skipped (not on Railway, or no
              // DATABASE_URL) — never an actual DB insert.
              assert.equal(
                result.published,
                false,
                "expected the publish to be skipped in a no-DB scenario",
              );

              // Core of Property 26: the uploaded board URL survives intact.
              assert.equal(
                result.boardPublicUrl,
                boardPublicUrl,
                "boardPublicUrl must be preserved exactly for re-publish",
              );

              // A skip must carry a non-empty reason and no designId.
              assert.ok(
                typeof result.skippedPublishReason === "string" &&
                  result.skippedPublishReason.trim() !== "",
                "a skipped publish must include a non-empty skippedPublishReason",
              );
              assert.equal(
                result.designId,
                undefined,
                "no designId may be reported when the publish is skipped",
              );
            },
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});
