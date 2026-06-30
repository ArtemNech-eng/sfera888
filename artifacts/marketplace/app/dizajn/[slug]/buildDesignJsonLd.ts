import type { DesignFullDTO } from "../../../lib/types";

/**
 * Pure JSON-LD `@graph` builder for a completed `/dizajn/{slug}` `Public_Page`
 * (extracted from `page.tsx`).
 *
 * This module is intentionally **pure** and free of server-only imports
 * (no `next/*`, no `lib/api`, no React) so the SEO-metadata property test
 * (ai-design-flagship, Property 13) can exercise it deterministically for
 * completed projects without dragging in the Next.js request machinery.
 *
 * `buildDesignJsonLd(design, baseUrl, slug)` returns the structured-data graph
 * for a completed project — containing `Article`, `BreadcrumbList`,
 * `Service`/`Offer` and `ImageObject` entries — or `null` when the project is
 * not yet renderable as SEO (not `completed`, or missing its hero image).
 *
 * The emitted values are unchanged from the original inline implementation —
 * this is a structural extraction only (Requirements 1.5, 9.2, 9.3).
 */

/** Russian breadcrumb labels per `Room_Type`. */
export const ROOM_BREADCRUMB: Record<string, string> = {
  bathroom: "Ванная",
  kitchen: "Кухня",
  living_room: "Гостиная",
  bedroom: "Спальня",
  hallway: "Прихожая",
  apartment: "Квартира",
  nursery: "Детская",
};

/**
 * Build the JSON-LD `@graph` for a `Design_Project`.
 *
 * Pure & deterministic: the result depends only on `design`, `baseUrl` and
 * `slug`. Returns `null` for any project that is not a completed, image-bearing
 * project (those pages emit `noindex` and no structured data).
 */
export function buildDesignJsonLd(
  design: DesignFullDTO,
  baseUrl: string,
  slug: string,
): Record<string, unknown> | null {
  if (design.status !== "completed" || !design.resultImageUrl) return null;

  const pageUrl = `${baseUrl}/dizajn/${slug}`;
  const aggregateRoomStyleUrl = `${baseUrl}/dizajn/${design.roomType.replace(/_/g, "-")}-${design.style}`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${pageUrl}#article`,
        mainEntityOfPage: pageUrl,
        headline: design.h1,
        description: design.description ?? design.seoDescription,
        image: [
          design.resultImageUrl,
          ...(design.views ?? []).map((v) => v.url),
        ],
        author: { "@type": "Organization", name: "Честные мастера", url: baseUrl },
        publisher: {
          "@type": "Organization",
          name: "Честные мастера",
          url: baseUrl,
        },
        datePublished: design.createdAt,
        dateModified: design.createdAt,
        about: {
          "@type": "Thing",
          name: design.h1,
        },
        keywords: [design.h1, design.style, design.roomType, design.cityName].filter(Boolean).join(", "),
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${pageUrl}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Главная",
            item: baseUrl,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "AI-дизайн",
            item: `${baseUrl}/dizajn`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: ROOM_BREADCRUMB[design.roomType] ?? "Категория",
            item: aggregateRoomStyleUrl,
          },
          {
            "@type": "ListItem",
            position: 4,
            name: design.h1 ?? `Проект №${design.id}`,
            item: pageUrl,
          },
        ],
      },
      ...(design.budget
        ? [
            {
              "@type": "Service",
              "@id": `${pageUrl}#service`,
              name: `Реализация дизайн-проекта: ${design.h1}`,
              serviceType: "Ремонт и отделка",
              areaServed: design.cityName ?? undefined,
              provider: {
                "@type": "Organization",
                name: "Честные мастера",
                url: baseUrl,
              },
              offers: {
                "@type": "Offer",
                priceCurrency: "RUB",
                price: design.budget,
                availability: "https://schema.org/InStock",
                url: pageUrl,
              },
            },
          ]
        : []),
      ...(design.views ?? []).map((v, i) => ({
        "@type": "ImageObject",
        "@id": `${pageUrl}#image-${i + 1}`,
        contentUrl: v.url,
        caption: v.label,
        width: 1024,
        height: 768,
      })),
    ],
  };
}
