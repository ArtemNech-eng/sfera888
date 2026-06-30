/**
 * Unit test (task 7.6, ai-design-flagship) for `Flagship_Form` rendering and
 * navigation.
 *
 * Covers:
 *   - exactly one `Flagship_Form` is wired into `/dizajn`, exposing every
 *     control (photo, room-type / style / palette / segment tiles, budget,
 *     area, Turnstile, submit);
 *   - the `MVP_Room_Lock`-disabled (non-`bedroom`) room tiles are flagged
 *     «скоро»;
 *   - on a mocked HTTP 202 the submit logic navigates to `/dizajn/{slug}` and
 *     consumes exactly one `Free_Quota` unit (`record()` called once).
 *
 * **Validates: Requirements 1.1, 2.1, 2.7, 6.1, 8.2**
 *
 * The marketplace app is a Next.js client surface with no React/jsdom test
 * harness, so — like the sibling flagship pure-helper tests
 * (`flagship-quota.property.test.ts`, `flagship-paywall-zero-quota.property.test.ts`)
 * — this test exercises the *real* control catalog and submit-outcome logic
 * extracted into `app/dizajn/_flagshipFormConfig.ts` (imported by the actual
 * `_FlagshipForm.tsx`), and asserts the single-form wiring by reading the
 * component / page source (no DOM available to mount).
 *
 * Run via Node's built-in test runner (tsx --test):
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import fc from "fast-check";

import * as configNs from "../../../marketplace/app/dizajn/_flagshipFormConfig.js";

// `_flagshipFormConfig.ts` lives in the marketplace package, which has no
// `"type": "module"` (a Next.js app, CJS by default). Under the api-server ESM
// test loader its named exports therefore collapse onto the module's `default`
// (module.exports). Normalise both shapes so the helpers are accessed the same
// way regardless of loader (mirrors the flagship quota tests).
type ConfigModule = typeof import("../../../marketplace/app/dizajn/_flagshipFormConfig.js");
const config = ((configNs as { default?: ConfigModule }).default ??
  (configNs as unknown as ConfigModule));

const {
  ROOM_TYPES,
  STYLES,
  PALETTES,
  PRICE_SEGMENTS,
  MVP_ROOM_LOCK_BADGE,
  mvpRoomLockBadge,
  handleGenerateOutcome,
  isSuccessfulStart,
  deriveRoomDims,
} = config;

// ─── Source files (read for the single-form / all-controls structural checks) ──

const FORM_SRC = readFileSync(
  fileURLToPath(
    new URL("../../../marketplace/app/dizajn/_FlagshipForm.tsx", import.meta.url),
  ),
  "utf8",
);
const PAGE_SRC = readFileSync(
  fileURLToPath(
    new URL("../../../marketplace/app/dizajn/page.tsx", import.meta.url),
  ),
  "utf8",
);

function countMatches(haystack: string, pattern: RegExp): number {
  const matches = haystack.match(pattern);
  return matches ? matches.length : 0;
}

// ===========================================================================
// 1. Exactly one Flagship_Form, with every control.
//    Validates: Requirements 1.1, 2.1
// ===========================================================================
describe("Task 7.6 — exactly one Flagship_Form with all controls", () => {
  it("the /dizajn page renders exactly one <FlagshipForm/>", () => {
    // Imported and used as the single generation form on the canonical page.
    assert.match(
      PAGE_SRC,
      /import\s*\{\s*FlagshipForm\s*\}\s*from\s*"\.\/_FlagshipForm"/,
      "page must import FlagshipForm from ./_FlagshipForm",
    );
    assert.equal(
      countMatches(PAGE_SRC, /<FlagshipForm\b/g),
      1,
      "the page must render exactly one <FlagshipForm/> (single canonical form)",
    );
  });

  it("the component declares exactly one <form> element", () => {
    assert.equal(
      countMatches(FORM_SRC, /<form\b/g),
      1,
      "Flagship_Form must contain exactly one <form> element",
    );
    assert.equal(
      countMatches(FORM_SRC, /<\/form>/g),
      1,
      "the single <form> must be closed exactly once",
    );
  });

  it("the single form exposes every control (Requirement 2.1)", () => {
    // Photo upload (optional) + Turnstile + budget + area + submit are JSX
    // controls; the tile catalogs are asserted from the real config below.
    assert.match(FORM_SRC, /type="file"/, "must expose a photo file input");
    assert.match(FORM_SRC, /accept="image\/jpeg,image\/png"/, "photo input limited to JPG/PNG");
    assert.match(FORM_SRC, /smart-captcha/, "must include the SmartCaptcha widget");
    assert.match(FORM_SRC, /data-sitekey/, "captcha sitekey must be wired");
    assert.match(FORM_SRC, /aria-label="Бюджет/, "must expose a budget input");
    assert.match(FORM_SRC, /aria-label="Площадь/, "must expose an area (м²) input");
    assert.match(FORM_SRC, /type="submit"/, "must expose a submit control");
  });

  it("the control catalog covers every Room_Type, Style, Palette and Price_Segment", () => {
    // Room types — all 7 backend enum values present.
    const roomValues = new Set(ROOM_TYPES.map((o) => o.value));
    for (const rt of [
      "bedroom",
      "kitchen",
      "bathroom",
      "living_room",
      "hallway",
      "nursery",
      "apartment",
    ]) {
      assert.ok(roomValues.has(rt), `room type "${rt}" must be offered`);
    }
    assert.equal(ROOM_TYPES.length, 7, "exactly the 7 Room_Type tiles");

    // Styles — the 7 backend STYLES.
    const styleValues = new Set(STYLES.map((o) => o.value));
    for (const s of [
      "modern",
      "scandinavian",
      "loft",
      "minimalism",
      "neoclassic",
      "japandi",
      "classic",
    ]) {
      assert.ok(styleValues.has(s), `style "${s}" must be offered`);
    }
    assert.equal(STYLES.length, 7, "exactly the 7 Style tiles");

    // Palettes — the 6 backend PALETTES, each with a preview swatch.
    const paletteValues = new Set(PALETTES.map((o) => o.value));
    for (const p of [
      "warm_neutral",
      "white_wood",
      "cool_gray",
      "beige_sand",
      "green_sage",
      "blue_calm",
    ]) {
      assert.ok(paletteValues.has(p), `palette "${p}" must be offered`);
    }
    assert.equal(PALETTES.length, 6, "exactly the 6 Palette tiles");
    assert.ok(
      PALETTES.every((p) => typeof p.swatch === "string" && p.swatch.length > 0),
      "every palette tile must carry a preview swatch",
    );

    // Price segments — econom / optima / premium.
    assert.deepEqual(
      PRICE_SEGMENTS.map((s) => s.id),
      ["econom", "optima", "premium"],
      "the 3 Price_Segment tiles must be offered in order",
    );
  });

  it("renders the Free_Quota badge incl. the «0 осталось» exhausted state (Requirement 8.2)", () => {
    assert.match(FORM_SRC, /data-testid="quota-badge"/, "must render a quota badge");
    assert.match(
      FORM_SRC,
      /0 осталось/,
      "exhausted quota must still show «0 осталось», not hide the count",
    );
  });
});

// ===========================================================================
// 2. MVP_Room_Lock: non-bedroom room tiles are flagged «скоро».
//    Validates: Requirements 6.1
// ===========================================================================
describe("Task 7.6 — locked (non-bedroom) room tiles are flagged «скоро»", () => {
  it("exactly one room type is enabled, and it is `bedroom`", () => {
    const enabled = ROOM_TYPES.filter((o) => o.enabled);
    assert.equal(enabled.length, 1, "MVP unlocks exactly one room type");
    assert.equal(enabled[0].value, "bedroom", "the unlocked room type is the bedroom");
  });

  it("every non-bedroom tile is disabled and badged «скоро»; bedroom has no badge", () => {
    assert.equal(MVP_ROOM_LOCK_BADGE, "скоро");
    for (const opt of ROOM_TYPES) {
      if (opt.value === "bedroom") {
        assert.equal(opt.enabled, true, "bedroom must be selectable");
        assert.equal(
          mvpRoomLockBadge(opt),
          undefined,
          "the unlocked bedroom tile must carry no «скоро» badge",
        );
      } else {
        assert.equal(opt.enabled, false, `${opt.value} must be locked on MVP`);
        assert.equal(
          mvpRoomLockBadge(opt),
          "скоро",
          `${opt.value} must be flagged «скоро»`,
        );
      }
    }
  });

  it("the component wires the badge from the lock helper (no drifting literal)", () => {
    assert.match(
      FORM_SRC,
      /badge=\{mvpRoomLockBadge\(opt\)\}/,
      "room tiles must derive their badge from mvpRoomLockBadge",
    );
  });
});

// ===========================================================================
// 3. On a mocked 202: navigate to /dizajn/{slug} and record() exactly once.
//    Validates: Requirements 2.7, 8.2 (consume one quota unit on success)
// ===========================================================================
describe("Task 7.6 — 202 navigates to /dizajn/{slug} and records one quota unit", () => {
  function spies() {
    const calls = { record: 0, navigate: [] as string[] };
    return {
      calls,
      actions: {
        record: () => {
          calls.record += 1;
        },
        navigate: (path: string) => {
          calls.navigate.push(path);
        },
      },
    };
  }

  it("a 202 with a slug navigates to /dizajn/{slug} and calls record() exactly once", () => {
    const { calls, actions } = spies();

    const navigated = handleGenerateOutcome(
      202,
      { ok: true, design: { slug: "spalnya-modern-abc123" } },
      actions,
    );

    assert.equal(navigated, true, "a successful start must report navigation");
    assert.equal(calls.record, 1, "exactly one Free_Quota unit consumed");
    assert.deepEqual(
      calls.navigate,
      ["/dizajn/spalnya-modern-abc123"],
      "must push to /dizajn/{slug} exactly once",
    );
    assert.ok(isSuccessfulStart(202, { design: { slug: "x" } }));
  });

  it("a non-202 response neither navigates nor records (falls through to error handling)", () => {
    for (const [status, body] of [
      [400, { ok: false, error: "validation_error" }],
      [429, { ok: false, error: "rate_limited" }],
      [500, { ok: false, error: "internal_error" }],
    ] as const) {
      const { calls, actions } = spies();
      const navigated = handleGenerateOutcome(status, body, actions);
      assert.equal(navigated, false, `status ${status} must not navigate`);
      assert.equal(calls.record, 0, `status ${status} must not consume quota`);
      assert.equal(calls.navigate.length, 0, `status ${status} must not push a route`);
    }
  });

  it("a 202 WITHOUT a slug is not a successful start (no side effects)", () => {
    const { calls, actions } = spies();
    const navigated = handleGenerateOutcome(202, { ok: true, design: {} }, actions);
    assert.equal(navigated, false, "202 without a slug cannot navigate");
    assert.equal(calls.record, 0);
    assert.equal(calls.navigate.length, 0);
    assert.equal(isSuccessfulStart(202, { ok: true }), false);
    assert.equal(isSuccessfulStart(202, null), false);
  });

  // For ANY accepted slug, the success branch records exactly once and pushes
  // exactly the matching route — i.e. «единичный вызов record()» holds for all.
  it("for any slug, a 202 records exactly once and navigates to the matching route", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.trim().length > 0),
        (slug) => {
          const { calls, actions } = spies();
          const navigated = handleGenerateOutcome(
            202,
            { ok: true, design: { slug } },
            actions,
          );
          assert.equal(navigated, true);
          assert.equal(calls.record, 1, "record() must be called exactly once");
          assert.deepEqual(calls.navigate, [`/dizajn/${slug}`]);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ===========================================================================
// Sanity: the derivation re-exported by the component matches the config one.
// ===========================================================================
describe("Task 7.6 — deriveRoomDims wiring", () => {
  it("derives clamped square room dimensions from area", () => {
    const dims = deriveRoomDims(16); // 16 m² → 400×400 cm
    assert.deepEqual(dims, { widthCm: 400, lengthCm: 400, heightCm: 270 });
  });
});
