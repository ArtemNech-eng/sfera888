/**
 * Property test for `pdfRenderer.ts` (PDF_Renderer composition + cache key).
 *
 * Property 21: PDF artifact composition is ordered, cached and self-referential.
 *
 * **Validates: Requirements 13.3, 13.4, 13.5, 13.7**
 *
 * Module under test: `artifacts/api-server/src/lib/pdfRenderer.ts`
 *   - `buildDesignHtml(design): string` — pure HTML composer (Requirement 13.3,
 *     fixed section order Cover → Параметры → Top_Down_Plan → Isometric_Render
 *     → Ракурсы → Color_Palette → Materials → Estimate → Solutions → Furniture).
 *   - `pdfR2Key(designId): string` — deterministic R2 cache key
 *     (`dizajn/pdf/{designId}.pdf`, Requirements 13.4, 13.5).
 *   - `PdfRenderError` — thrown by the renderer on failures (Requirement 13.6).
 *
 * The cache-orchestration logic in `getOrRenderPdf` (R2 HEAD/GET, Postgres
 * soft-lock through `designs.pdf_rendering_at`, Puppeteer launch) is heavy
 * to mock and is exercised by integration tests that boot R2 + Postgres.
 * Property 21.5 from the design therefore reduces here to verifying the
 * deterministic cache key contract — every call site of `getOrRenderPdf`
 * upstream goes through `pdfR2Key`, so a stable key is enough to express
 * the cache identity (Requirement 13.4).
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

// `@workspace/db` (transitively imported by `pdfRenderer.ts`) opens a
// pg.Pool at module load and demands DATABASE_URL. `objectStorage.ts`
// instantiates an S3Client at module load and demands the R2_* triple.
// All of these are lazy connections — no SQL, no R2 round-trip is ever
// executed because the properties below only call `buildDesignHtml`
// (pure HTML composer) and `pdfR2Key` (pure string formatter).
//
// Lock `MARKETPLACE_PUBLIC_URL` to its production default so the
// self-referential URL Property 21.2 is independent of the host
// environment that runs the test.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://fake:fake@localhost:5432/fake";
process.env.R2_ENDPOINT =
  process.env.R2_ENDPOINT ?? "https://fake.r2.local";
process.env.R2_ACCESS_KEY_ID =
  process.env.R2_ACCESS_KEY_ID ?? "fake-access-key";
process.env.R2_SECRET_ACCESS_KEY =
  process.env.R2_SECRET_ACCESS_KEY ?? "fake-secret-key";
delete process.env.MARKETPLACE_PUBLIC_URL;

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import type {
  Design,
  DesignView,
  DesignMaterial,
  DesignEstimateItem,
  DesignSolution,
  DesignColorSwatch,
  DesignDetailCrop,
  PickedFurnitureRow,
} from "@workspace/db";

const pdfRenderer = await import("../../src/lib/pdfRenderer.ts");
const { buildDesignHtml, pdfR2Key, PdfRenderError } = pdfRenderer;

// ─── Constants ────────────────────────────────────────────────────────────

const PUBLIC_HOST = "chestnye-mastera.ru";

/**
 * Section markers in the order required by Requirement 13.3.
 * Each marker is a unique substring that appears exactly once in the
 * output of a complete `buildDesignHtml` invocation. The cover marker
 * is the eyebrow string (cover has no `<h2>` — its title is `<h1>`),
 * everything else uses the `<h2 class="section-title">…</h2>` opener.
 */
const SECTION_MARKERS_IN_ORDER = [
  { name: "Cover", marker: "AI-дизайн-проект" },
  { name: "Параметры", marker: '<h2 class="section-title">Параметры проекта</h2>' },
  { name: "Top_Down_Plan", marker: '<h2 class="section-title">Вид сверху</h2>' },
  { name: "Isometric_Render", marker: '<h2 class="section-title">Изометрический вид</h2>' },
  { name: "Ракурсы", marker: '<h2 class="section-title">Ракурсы</h2>' },
  { name: "Color_Palette", marker: '<h2 class="section-title">Цветовая палитра</h2>' },
  { name: "Materials", marker: '<h2 class="section-title">Отделочные материалы</h2>' },
  { name: "Estimate", marker: '<h2 class="section-title">Смета</h2>' },
  { name: "Solutions", marker: '<h2 class="section-title">Дизайн-решения</h2>' },
  { name: "Furniture", marker: '<h2 class="section-title">Подобранная мебель</h2>' },
] as const;

// ─── Sample data builders ─────────────────────────────────────────────────

function makeViews(): DesignView[] {
  return [
    { url: "/api/v/1.jpg", label: "Общий вид от входа", position: 1 },
    { url: "/api/v/2.jpg", label: "Зона сна", position: 2 },
    { url: "/api/v/3.jpg", label: "Зона хранения", position: 3 },
    { url: "/api/v/4.jpg", label: "У окна", position: 4 },
    { url: "/api/v/5.jpg", label: "Изометрия", position: 5 },
    { url: "/api/v/6.jpg", label: "Угловой ракурс", position: 6 },
  ];
}

function makeDetailCrops(): DesignDetailCrop[] {
  return [
    { url: "/api/c/1.jpg", label: "Кровать", fromView: 1 },
    { url: "/api/c/2.jpg", label: "Шкаф", fromView: 3 },
    { url: "/api/c/3.jpg", label: "Тумба", fromView: 2 },
    { url: "/api/c/4.jpg", label: "Стол", fromView: 4 },
    { url: "/api/c/5.jpg", label: "Светильник", fromView: 1 },
    { url: "/api/c/6.jpg", label: "Текстиль", fromView: 2 },
  ];
}

function makeFurniture(): PickedFurnitureRow[] {
  return [
    {
      layoutId: "bed1",
      type: "bed",
      sku: "BED-MOD-160",
      name: "Кровать «Аура» 160×200",
      pricePaidKopeks: 5_499_000,
      partnerUrl: "https://example.com/p/BED-MOD-160",
      imageUrl: "/api/f/bed-mod-160.jpg",
    },
    {
      layoutId: "wardrobe1",
      type: "wardrobe",
      sku: null,
      name: null,
      pricePaidKopeks: 0,
      partnerUrl: null,
      imageUrl: null,
    },
  ];
}

function makeMaterials(): DesignMaterial[] {
  return [
    { category: "Стены", description: "Краска интерьерная, матовая, тёплый бежевый" },
    { category: "Пол", description: "Инженерная доска, дуб натуральный" },
    { category: "Потолок", description: "Покраска по штукатурке, белый" },
  ];
}

function makeEstimate(): DesignEstimateItem[] {
  return [
    { category: "Отделочные материалы", amountKopeks: 18_000_000 },
    { category: "Мебель", amountKopeks: 24_500_000 },
    { category: "Работы", amountKopeks: 16_000_000 },
    { category: "Прочие расходы", amountKopeks: 5_850_000 },
  ];
}

function makeSolutions(): DesignSolution[] {
  return [
    { text: "Кровать вдоль глухой стены, шкаф напротив окна — короткий маршрут к двери." },
    { text: "Цветовая гамма строится вокруг тёплого бежевого с акцентом графита." },
    { text: "Один центральный потолочный светильник + точечная подсветка над тумбами." },
  ];
}

function makePalette(): DesignColorSwatch[] {
  return [
    { hex: "#E8DFD0", name: "Бежевый тёплый" },
    { hex: "#1F2933", name: "Графит" },
    { hex: "#C2B280", name: "Песок" },
    { hex: "#F5F2EC", name: "Молоко" },
    { hex: "#7A6C5D", name: "Корица" },
  ];
}

/**
 * Construct a fully populated `Design` row with every optional jsonb
 * artifact present, so Property 21.1 can verify the full ordered chain.
 */
function makeCompleteDesign(overrides: Partial<Design> = {}): Design {
  const base: Design = {
    id: 1,
    slug: "spalnya-modern-1",
    anonId: null,
    clientPhoneHash: null,
    roomType: "bedroom",
    style: "modern",
    cityId: null,
    district: null,
    area: "20.00",
    budget: 1_500_000,
    durationWeeks: 8,
    inputImageUrl: null,
    resultImageUrl: "/api/result.jpg",
    materials: makeMaterials(),
    estimate: makeEstimate(),
    solutions: makeSolutions(),
    colorPalette: makePalette(),
    views: makeViews(),
    detailCrops: makeDetailCrops(),
    status: "completed",
    errorMessage: null,
    isPublic: true,
    publicConsentAt: new Date("2026-02-01T10:00:00.000Z"),
    seoTitle: null,
    seoDescription: null,
    h1: "Спальня в стиле модерн 20 м²",
    description: null,
    estimatedPriceFrom: null,
    estimatedPriceTo: null,
    viewCount: 0,
    saveCount: 0,
    leadId: null,
    layoutJson: null,
    topDownPlanUrl: "/api/topdown/1.png",
    pickedFurniture: makeFurniture(),
    progress: 100,
    currentStep: null,
    pdfUrl: null,
    pdfRenderingAt: null,
    createdAt: new Date("2026-02-01T10:00:00.000Z"),
    updatedAt: new Date("2026-02-01T10:00:00.000Z"),
  };
  return { ...base, ...overrides };
}

/**
 * Generate slug values that satisfy the `slug.ts` contract
 * (`^[a-z0-9-]+$`, ≤ 160 chars). Constraining the generator to the real
 * input space keeps Property 21.2 deterministic and avoids interaction
 * with `escape()` (which only kicks in for `& < > " '`, none of which
 * appear in valid slugs).
 */
const slugCharArb = fc.constantFrom(
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
  "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "-",
);
const slugArb = fc
  .array(slugCharArb, { minLength: 1, maxLength: 80 })
  .map((chars) => chars.join(""))
  // strip leading/trailing dashes to mirror `slugify`'s post-trim rule.
  .map((s) => s.replace(/^-+|-+$/g, ""))
  .filter((s) => s.length >= 1);

const positiveDesignIdArb = fc.integer({ min: 1, max: 2_000_000_000 });

// ─── Property 21.1 — Section order ────────────────────────────────────────

describe("Property 21.1: section order is fixed (Requirement 13.3)", () => {
  it("buildDesignHtml emits sections in the canonical order for a fully populated Design", () => {
    const design = makeCompleteDesign();
    const html = buildDesignHtml(design);

    let lastIdx = -1;
    let lastName = "<start>";
    for (const { name, marker } of SECTION_MARKERS_IN_ORDER) {
      const idx = html.indexOf(marker);
      assert.ok(
        idx !== -1,
        `section "${name}" not found in HTML (marker: ${marker})`,
      );
      assert.ok(
        idx > lastIdx,
        `section "${name}" must appear after "${lastName}"; ` +
          `found at ${idx}, last was ${lastIdx}`,
      );
      lastIdx = idx;
      lastName = name;
    }
  });

  it("each section marker appears exactly once", () => {
    const design = makeCompleteDesign();
    const html = buildDesignHtml(design);

    for (const { name, marker } of SECTION_MARKERS_IN_ORDER) {
      // count occurrences of literal substring (no regex special chars
      // that would need escaping — markers are HTML literals).
      let count = 0;
      let from = 0;
      for (;;) {
        const idx = html.indexOf(marker, from);
        if (idx === -1) break;
        count += 1;
        from = idx + marker.length;
      }
      assert.equal(
        count,
        1,
        `section "${name}" expected to appear once, found ${count}`,
      );
    }
  });

  it("ordered output is reproducible regardless of input view ordering (sortedViews invariant)", () => {
    fc.assert(
      fc.property(
        // shuffle the same six views into arbitrary order; output must
        // still place positions 1..6 in stable section slots.
        fc.shuffledSubarray(makeViews(), {
          minLength: 6,
          maxLength: 6,
        }),
        (shuffled) => {
          const design = makeCompleteDesign({ views: shuffled });
          const html = buildDesignHtml(design);
          let lastIdx = -1;
          for (const { marker } of SECTION_MARKERS_IN_ORDER) {
            const idx = html.indexOf(marker);
            assert.ok(idx > lastIdx, `marker out of order: ${marker}`);
            lastIdx = idx;
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ─── Property 21.2 — Self-referential URL ────────────────────────────────

describe("Property 21.2: cover contains chestnye-mastera.ru/dizajn/{slug} (Requirement 13.7)", () => {
  it("for any valid slug, the rendered HTML embeds the public URL", () => {
    fc.assert(
      fc.property(slugArb, (slug) => {
        const design = makeCompleteDesign({ slug });
        const html = buildDesignHtml(design);
        const expected = `${PUBLIC_HOST}/dizajn/${slug}`;
        assert.ok(
          html.includes(expected),
          `expected HTML to embed "${expected}"`,
        );
      }),
      { numRuns: 100 },
    );
  });

  it("falls back to `${id}` when slug is null (URL still self-references the design)", () => {
    const design = makeCompleteDesign({ slug: null, id: 4242 });
    const html = buildDesignHtml(design);
    assert.ok(
      html.includes(`${PUBLIC_HOST}/dizajn/4242`),
      "expected fallback URL to use design.id when slug is null",
    );
  });

  it("URL appears inside the cover section, not as a stray template fragment", () => {
    const design = makeCompleteDesign({ slug: "kitchen-loft-42" });
    const html = buildDesignHtml(design);

    // The cover section embeds the URL in a dedicated `<div class="cover-url">`
    // element. Asserting the literal element is precise — it pins the URL to
    // the cover (Requirement 13.7) and is robust against the same URL
    // separately appearing in `<meta name="design-url">` inside `<head>`.
    const coverUrlElement = `<div class="cover-url">https://${PUBLIC_HOST}/dizajn/kitchen-loft-42</div>`;
    assert.ok(
      html.includes(coverUrlElement),
      `expected cover section to contain "${coverUrlElement}"`,
    );

    // And the cover-url element sits between the cover eyebrow and the
    // first `<h2>` of the next section — i.e. inside the cover.
    const coverIdx = html.indexOf("AI-дизайн-проект");
    const paramsIdx = html.indexOf(
      '<h2 class="section-title">Параметры проекта</h2>',
    );
    const coverUrlIdx = html.indexOf(coverUrlElement);
    assert.ok(
      coverIdx !== -1 && paramsIdx !== -1 && coverUrlIdx !== -1,
      "expected cover + params + cover-url markers to be present",
    );
    assert.ok(
      coverUrlIdx > coverIdx && coverUrlIdx < paramsIdx,
      "cover-url element must live inside the cover section",
    );
  });
});

// ─── Property 21.3 — Optional sections skipped when null/empty ───────────

describe("Property 21.3: optional sections are skipped when null/empty (Requirement 13.3)", () => {
  type OptionalField =
    | "topDownPlanUrl"
    | "colorPalette"
    | "materials"
    | "estimate"
    | "solutions"
    | "pickedFurniture"
    | "views";

  /**
   * Map each optional field to the section markers that must disappear
   * when the field is missing. `views: null` collapses both the
   * isometric block (position-5 view) and the «Ракурсы» grid.
   */
  const FIELD_TO_MARKERS: Record<OptionalField, string[]> = {
    topDownPlanUrl: ['<h2 class="section-title">Вид сверху</h2>'],
    colorPalette: ['<h2 class="section-title">Цветовая палитра</h2>'],
    materials: ['<h2 class="section-title">Отделочные материалы</h2>'],
    estimate: ['<h2 class="section-title">Смета</h2>'],
    solutions: ['<h2 class="section-title">Дизайн-решения</h2>'],
    pickedFurniture: ['<h2 class="section-title">Подобранная мебель</h2>'],
    views: [
      '<h2 class="section-title">Изометрический вид</h2>',
      '<h2 class="section-title">Ракурсы</h2>',
    ],
  };

  /**
   * For array-shaped optionals, emptiness has two flavours: `null` and
   * `[]`. The composer must treat both as "section absent" per Req 13.3.
   */
  const EMPTY_VARIANTS: Record<OptionalField, Array<unknown>> = {
    topDownPlanUrl: [null],
    colorPalette: [null, []],
    materials: [null, []],
    estimate: [null, []],
    solutions: [null, []],
    pickedFurniture: [null, []],
    views: [null, []],
  };

  for (const field of Object.keys(FIELD_TO_MARKERS) as OptionalField[]) {
    for (const emptyValue of EMPTY_VARIANTS[field]) {
      const variantLabel =
        emptyValue === null ? "null" : Array.isArray(emptyValue) ? "[]" : "?";
      it(`skips ${field} section when ${field}=${variantLabel}`, () => {
        const overrides = { [field]: emptyValue } as Partial<Design>;
        const design = makeCompleteDesign(overrides);
        const html = buildDesignHtml(design);
        for (const marker of FIELD_TO_MARKERS[field]) {
          assert.equal(
            html.includes(marker),
            false,
            `marker "${marker}" must NOT appear when ${field}=${variantLabel}`,
          );
        }
      });
    }
  }

  it("when every optional artifact is missing, only Cover + Параметры remain", () => {
    const design = makeCompleteDesign({
      topDownPlanUrl: null,
      colorPalette: null,
      materials: null,
      estimate: null,
      solutions: null,
      pickedFurniture: null,
      views: null,
    });
    const html = buildDesignHtml(design);

    // Cover + Параметры are mandatory.
    assert.ok(html.includes("AI-дизайн-проект"));
    assert.ok(
      html.includes('<h2 class="section-title">Параметры проекта</h2>'),
    );

    // Every other section marker disappears.
    const optionalMarkers = SECTION_MARKERS_IN_ORDER
      .filter((s) => s.name !== "Cover" && s.name !== "Параметры")
      .map((s) => s.marker);
    for (const marker of optionalMarkers) {
      assert.equal(
        html.includes(marker),
        false,
        `marker "${marker}" must NOT appear in minimal Design`,
      );
    }
  });
});

// ─── Property 21.4 — pdfR2Key format (cache identity) ─────────────────────

describe("Property 21.4: pdfR2Key has stable format dizajn/pdf/{id}.pdf (Requirements 13.4, 13.5)", () => {
  const KEY_RE = /^dizajn\/pdf\/\d+\.pdf$/;

  it("pdfR2Key(123) === 'dizajn/pdf/123.pdf'", () => {
    assert.equal(pdfR2Key(123), "dizajn/pdf/123.pdf");
  });

  it("for any positive integer designId, the key matches /^dizajn\\/pdf\\/\\d+\\.pdf$/", () => {
    fc.assert(
      fc.property(positiveDesignIdArb, (designId) => {
        const key = pdfR2Key(designId);
        assert.match(key, KEY_RE, `key "${key}" violates ${KEY_RE}`);
        // Round-trip the integer back out of the key — guarantees no
        // collisions across distinct ids (cache identity, Req 13.4).
        const match = key.match(/^dizajn\/pdf\/(\d+)\.pdf$/);
        assert.ok(match, "key must expose the numeric id segment");
        assert.equal(Number(match![1]), designId);
      }),
      { numRuns: 200 },
    );
  });

  it("two different designIds produce different keys (injective)", () => {
    fc.assert(
      fc.property(
        positiveDesignIdArb,
        positiveDesignIdArb,
        (a, b) => {
          fc.pre(a !== b);
          assert.notEqual(pdfR2Key(a), pdfR2Key(b));
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Sanity: PdfRenderError surface ──────────────────────────────────────

describe("PdfRenderError shape (Requirement 13.6)", () => {
  it("PdfRenderError is an Error with name=='PdfRenderError' and preserves cause", () => {
    const cause = new Error("underlying");
    const err = new PdfRenderError("wrapper message", cause);
    assert.ok(err instanceof Error);
    assert.ok(err instanceof PdfRenderError);
    assert.equal(err.name, "PdfRenderError");
    assert.equal(err.message, "wrapper message");
    assert.equal(err.cause, cause);
  });
});
