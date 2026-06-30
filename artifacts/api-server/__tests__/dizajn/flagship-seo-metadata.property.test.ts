// Feature: ai-design-flagship, Property 13: Completed projects expose full SEO metadata
/**
 * Property test for `Public_Page` SEO-metadata completeness.
 *
 * Property 13: Completed projects expose full SEO metadata.
 *
 * **Validates: Requirements 1.5, 9.2, 9.3**
 *
 * Module under test (pure builder, no Next.js / React runtime needed):
 *   - `buildDesignJsonLd(design, baseUrl, slug)`
 *   - `ROOM_BREADCRUMB`
 *   from `artifacts/marketplace/app/dizajn/[slug]/buildDesignJsonLd.ts` (task 9.5).
 *
 * Requirement 1.5 / 9.2 / 9.3: a completed `Design_Project`'s `Public_Page`
 * exposes the canonical `/dizajn/{slug}`, OpenGraph + Twitter cards, and a
 * JSON-LD `@graph` containing `Article`, `BreadcrumbList`, `Service`/`Offer`,
 * and `ImageObject` entries. (OpenGraph/Twitter live in `generateMetadata`,
 * but the canonical URL they share is the same `${baseUrl}/dizajn/${slug}`
 * pinned here through the JSON-LD graph, which is the pure, deterministic
 * surface this property can exercise without the request machinery.)
 *
 * The property: for ANY completed, image-bearing `Design_Project` carrying a
 * (truthy) budget and at least one rendered view, `buildDesignJsonLd` returns
 * a `@graph` that
 *   1. contains all four required `@type` entries
 *      (`Article`, `BreadcrumbList`, `Service`, `ImageObject`), and
 *   2. anchors every canonical/url field on `${baseUrl}/dizajn/${slug}`.
 *
 * Run via Node's built-in test runner:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import type { DesignFullDTO } from "../../../marketplace/lib/types.ts";
import * as jsonLdNs from "../../../marketplace/app/dizajn/[slug]/buildDesignJsonLd.ts";

// `buildDesignJsonLd.ts` lives in the marketplace package, which has no
// `"type": "module"` (Next.js app, CJS by default). Under the api-server ESM
// test loader its named exports may collapse onto the module's `default`
// (module.exports). Normalise both shapes so the pure builder is accessed the
// same way regardless of how the loader resolves them — mirrors the
// flagship-quota / polling-predicate / parseRoute property tests.
type JsonLdModule =
  typeof import("../../../marketplace/app/dizajn/[slug]/buildDesignJsonLd.ts");
const mod = ((jsonLdNs as { default?: JsonLdModule }).default ??
  (jsonLdNs as unknown as JsonLdModule));
const { buildDesignJsonLd } = mod;

// ─── Generators ──────────────────────────────────────────────────────────────

const ROOM_TYPES = [
  "bathroom",
  "kitchen",
  "living_room",
  "bedroom",
  "hallway",
  "apartment",
  "nursery",
] as const;

const STYLES = [
  "modern",
  "scandinavian",
  "loft",
  "minimalism",
  "neoclassic",
  "japandi",
  "classic",
] as const;

// A non-empty, dash-free token (used as a URL-ish, non-empty string leaf).
const alnum = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
const tokenArb = fc
  .array(fc.constantFrom(...alnum), { minLength: 1, maxLength: 12 })
  .map((xs) => xs.join(""));

// A non-empty image URL — the field must be truthy for the page to be SEO-able.
const imageUrlArb = tokenArb.map((t) => `https://cdn.example.com/${t}.jpg`);

// `baseUrl`: a scheme+host with no trailing slash (matches how the page builds
// its absolute origin). The exact value is irrelevant to the property — what
// matters is that every canonical field is anchored on the SAME `${baseUrl}`.
const baseUrlArb = fc.domain().map((d) => `https://${d}`);

// `slug`: a non-empty lowercase-alnum-dash slug (full design slug shape).
const slugArb = fc
  .array(fc.constantFrom(...alnum, "-"), { minLength: 1, maxLength: 40 })
  .map((xs) => xs.join(""))
  .filter((s) => s.length > 0);

// A single rendered view (drives the ImageObject entries).
const viewArb = fc.record({
  url: imageUrlArb,
  label: fc.string(),
  position: fc.integer({ min: 1, max: 5 }),
});

/**
 * A COMPLETED, image-bearing `Design_Project` that also carries a truthy
 * `budget` (→ Service/Offer) and at least one view (→ ImageObject). Only the
 * fields `buildDesignJsonLd` reads are pinned with meaningful generators; the
 * remaining `DesignFullDTO` fields are filled with inert defaults and the whole
 * record is cast to `DesignFullDTO`.
 */
const completedDesignArb: fc.Arbitrary<DesignFullDTO> = fc
  .record({
    id: fc.integer({ min: 1, max: 1_000_000 }),
    roomType: fc.constantFrom(...ROOM_TYPES),
    style: fc.constantFrom(...STYLES),
    // budget MUST be truthy (non-zero) so the Service/Offer node is emitted.
    budget: fc.integer({ min: 50_000, max: 5_000_000 }),
    resultImageUrl: imageUrlArb,
    // at least one view so the ImageObject node(s) are emitted.
    views: fc.array(viewArb, { minLength: 1, maxLength: 5 }),
    h1: fc.string({ minLength: 1, maxLength: 60 }),
    description: fc.option(fc.string(), { nil: null }),
    seoDescription: fc.option(fc.string(), { nil: null }),
    cityName: fc.option(fc.string(), { nil: null }),
    createdAt: fc
      .date({
        min: new Date("2024-01-01"),
        max: new Date("2027-01-01"),
        noInvalidDate: true,
      })
      .map((d) => d.toISOString()),
  })
  .map(
    (partial) =>
      ({
        ...partial,
        slug: "ignored-by-builder",
        status: "completed",
        area: null,
        durationWeeks: null,
        citySlug: null,
        cityNameIn: null,
        district: null,
        seoTitle: null,
        materials: null,
        estimate: null,
        solutions: null,
        colorPalette: null,
        inputImageUrl: null,
        detailCrops: null,
        images: [],
        topDownPlanUrl: null,
        pickedFurniture: null,
        currentStep: null,
        designAnonId: null,
        viewCount: 0,
        saveCount: 0,
        isSavedByCurrentUser: false,
        progress: 100,
        errorMessage: null,
      }) as DesignFullDTO,
  );

// ─── Helpers ─────────────────────────────────────────────────────────────────

type GraphNode = Record<string, unknown>;

function graphOf(result: Record<string, unknown> | null): GraphNode[] {
  assert.notEqual(result, null, "expected a JSON-LD object, got null");
  const graph = (result as Record<string, unknown>)["@graph"];
  assert.ok(Array.isArray(graph), "@graph must be an array");
  return graph as GraphNode[];
}

function nodesOfType(graph: GraphNode[], type: string): GraphNode[] {
  return graph.filter((n) => n["@type"] === type);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Public_Page Property 13: completed projects expose full SEO metadata", () => {
  // -----------------------------------------------------------------------
  // Property 13 (completeness) — all four @type entries are present.
  // Validates: Requirements 9.2, 9.3
  // -----------------------------------------------------------------------
  it("emits a @graph containing Article, BreadcrumbList, Service and ImageObject for any completed image-bearing project", () => {
    fc.assert(
      fc.property(
        completedDesignArb,
        baseUrlArb,
        slugArb,
        (design, baseUrl, slug) => {
          const graph = graphOf(buildDesignJsonLd(design, baseUrl, slug));

          for (const type of [
            "Article",
            "BreadcrumbList",
            "Service",
            "ImageObject",
          ]) {
            assert.ok(
              nodesOfType(graph, type).length >= 1,
              `@graph is missing a ${type} entry: ${JSON.stringify(
                graph.map((n) => n["@type"]),
              )}`,
            );
          }

          // ImageObject count tracks the number of rendered views (1:1).
          assert.equal(
            nodesOfType(graph, "ImageObject").length,
            (design.views ?? []).length,
            "one ImageObject node per rendered view",
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 13 (canonical anchoring) — every url/canonical field equals
  // `${baseUrl}/dizajn/${slug}`.
  // Validates: Requirements 1.5, 9.2, 9.3
  // -----------------------------------------------------------------------
  it("anchors every canonical/url field on `${baseUrl}/dizajn/${slug}`", () => {
    fc.assert(
      fc.property(
        completedDesignArb,
        baseUrlArb,
        slugArb,
        (design, baseUrl, slug) => {
          const pageUrl = `${baseUrl}/dizajn/${slug}`;
          const graph = graphOf(buildDesignJsonLd(design, baseUrl, slug));

          // Article: mainEntityOfPage + @id rooted at the canonical page URL.
          const article = nodesOfType(graph, "Article")[0]!;
          assert.equal(
            article.mainEntityOfPage,
            pageUrl,
            "Article.mainEntityOfPage must be the canonical page URL",
          );
          assert.equal(article["@id"], `${pageUrl}#article`);

          // BreadcrumbList: the leaf crumb (position 4) points at the page.
          const breadcrumb = nodesOfType(graph, "BreadcrumbList")[0]!;
          assert.equal(breadcrumb["@id"], `${pageUrl}#breadcrumb`);
          const crumbs = breadcrumb.itemListElement as GraphNode[];
          const leaf = crumbs.find((c) => c.position === 4)!;
          assert.equal(
            leaf.item,
            pageUrl,
            "the leaf breadcrumb must link to the canonical page URL",
          );

          // Service/Offer: the offer URL is the canonical page URL.
          const service = nodesOfType(graph, "Service")[0]!;
          assert.equal(service["@id"], `${pageUrl}#service`);
          const offer = service.offers as GraphNode;
          assert.equal(offer["@type"], "Offer");
          assert.equal(
            offer.url,
            pageUrl,
            "Offer.url must be the canonical page URL",
          );
          assert.equal(offer.price, design.budget);

          // Every ImageObject @id is namespaced under the canonical page URL.
          for (const img of nodesOfType(graph, "ImageObject")) {
            assert.ok(
              typeof img["@id"] === "string" &&
                (img["@id"] as string).startsWith(`${pageUrl}#image-`),
              `ImageObject @id must be rooted at the page URL: ${String(
                img["@id"],
              )}`,
            );
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------------
  // Property 13 (guard) — only completed, image-bearing projects expose
  // structured data. The contrapositive keeps the "completed" precondition
  // meaningful: a non-completed OR image-less project yields no graph at all.
  // Validates: Requirements 1.5
  // -----------------------------------------------------------------------
  it("returns null when the project is not completed or has no hero image", () => {
    const nonCompletedStatusArb = fc.constantFrom(
      "draft",
      "generating",
      "failed",
      "private",
    );
    fc.assert(
      fc.property(
        completedDesignArb,
        baseUrlArb,
        slugArb,
        fc.oneof(
          // not completed (any other status)
          nonCompletedStatusArb.map((status) => ({ status, dropImage: false })),
          // completed but missing the hero image
          fc.constant({ status: "completed", dropImage: true }),
        ),
        (design, baseUrl, slug, mutation) => {
          const mutated = {
            ...design,
            status: mutation.status,
            resultImageUrl: mutation.dropImage ? null : design.resultImageUrl,
          } as DesignFullDTO;
          assert.equal(
            buildDesignJsonLd(mutated, baseUrl, slug),
            null,
            "non-completed / image-less projects must expose no structured data",
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});
