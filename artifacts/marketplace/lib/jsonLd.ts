import "server-only";

/**
 * Helpers for emitting schema.org JSON-LD blocks in server-rendered pages.
 *
 * Every value passed in here MUST already come from trusted server-side
 * sources (api-server response, environment, hard-coded copy). User input
 * (form fields, query strings, etc.) is never accepted by these helpers.
 *
 * To inject the result into HTML use:
 *   <script type="application/ld+json"
 *           dangerouslySetInnerHTML={{ __html: toJsonLdScript(obj) }} />
 *
 * `toJsonLdScript` escapes characters that could otherwise break out of the
 * <script> tag (e.g. "</script>" embedded in text).
 */

/* ──────────────────────────────────────────────────────────────────────── */
/* Types                                                                    */
/* ──────────────────────────────────────────────────────────────────────── */

export interface BreadcrumbItem {
  name: string;
  /** Absolute URL for the item. Omit for the final crumb if it has no own page. */
  url?: string;
}

export interface ServiceJsonLdInput {
  serviceName: string;
  cityName: string;
  /** Prepositional ("Краснодаре"), if available. Used for the schema.org `name`. */
  cityNameIn: string | null;
  description: string;
  /** Canonical URL of this service-city page. */
  url: string;
  /** Marketplace public site URL (for `provider.url`). */
  siteUrl: string;
  /** Cheapest known price for the (service, city) pair. `null` ⇒ no offers block. */
  minPrice: number | null;
}

export interface FaqItem {
  q: string;
  a: string;
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Builders                                                                 */
/* ──────────────────────────────────────────────────────────────────────── */

export function organizationJsonLd(siteUrl: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Честные мастера",
    url: siteUrl,
  };
}

export function breadcrumbJsonLd(items: BreadcrumbItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => {
      const node: Record<string, unknown> = {
        "@type": "ListItem",
        position: i + 1,
        name: it.name,
      };
      if (it.url) node.item = it.url;
      return node;
    }),
  };
}

export function serviceJsonLd(input: ServiceJsonLdInput): Record<string, unknown> {
  const cityPreposition = input.cityNameIn ?? input.cityName;
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `${input.serviceName} в ${cityPreposition}`,
    description: input.description,
    areaServed: {
      "@type": "City",
      name: input.cityName,
    },
    provider: {
      "@type": "Organization",
      name: "Честные мастера",
      url: input.siteUrl,
    },
    url: input.url,
  };
  if (input.minPrice != null) {
    node.offers = {
      "@type": "AggregateOffer",
      priceCurrency: "RUB",
      lowPrice: input.minPrice,
    };
  }
  return node;
}

export function faqJsonLd(items: FaqItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: it.a,
      },
    })),
  };
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Master profile (ProfessionalService + AggregateRating + Review)          */
/* ──────────────────────────────────────────────────────────────────────── */

export interface MasterProfileReviewInput {
  /** Free-form public name from `master_reviews_public.client_name`. */
  authorName: string;
  /** 1..5 integer rating. */
  rating: number;
  /** Review body text. */
  text: string;
  /** ISO timestamp from the DB. */
  createdAt: string;
}

export interface MasterProfileJsonLdInput {
  /** Display name of the master. */
  name: string;
  /** Optional bio shown on the public profile. */
  description?: string | null;
  /** Public profile URL — must be absolute. */
  url: string;
  /** Optional avatar URL (absolute). */
  image?: string | null;
  /** City name where the master operates ("Краснодар"). Optional. */
  cityName?: string | null;
  /** List of service NAMES the master offers ("Сантехника", "Электромонтаж"). */
  knowsAbout: string[];
  /**
   * Per-service price list. Used to compute `priceRange` for the snippet and
   * to emit individual `Offer`+`Service` items via `makesOffer`. Optional —
   * masters with no prices won't surface a price-related snippet.
   */
  servicePrices?: { service: string; priceFrom: number }[];
  /** Aggregated rating values from `masters.public_rating` + count. */
  rating?: {
    /** Already a string "4.9" or null when no reviews yet. */
    ratingValue: string;
    reviewCount: number;
  } | null;
  /** Up to N approved reviews to embed inline. */
  reviews: MasterProfileReviewInput[];
}

/**
 * Build a schema.org JSON-LD payload describing a master's public profile
 * as a `ProfessionalService` (subclass of `LocalBusiness`). Includes
 * `aggregateRating` when ≥ 1 review is available, and an inline `review`
 * array for the embedded most-recent reviews so Yandex/Google can surface
 * them as rich snippets.
 *
 * Authority of input: ALWAYS server-side data from the api-server. Never
 * accept user form input — review bodies come from `master_reviews_public`
 * filtered by `moderation_status = 'approved'` upstream.
 */
export function masterProfileJsonLd(input: MasterProfileJsonLdInput): Record<string, unknown> {
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: input.name,
    url: input.url,
  };
  if (input.description) node.description = input.description;
  if (input.image) node.image = input.image;
  if (input.cityName) {
    node.areaServed = { "@type": "City", name: input.cityName };
  }
  if (input.knowsAbout.length > 0) {
    node.knowsAbout = input.knowsAbout;
  }
  // Price range — both as `priceRange` (legacy) and as `makesOffer[]` per service
  // for richer snippets. Yandex picks up `priceRange` for the SERP price label.
  const validPrices = (input.servicePrices ?? []).filter(
    (p) => p?.service && typeof p?.priceFrom === "number" && p.priceFrom > 0,
  );
  if (validPrices.length > 0) {
    const min = Math.min(...validPrices.map((p) => p.priceFrom));
    const max = Math.max(...validPrices.map((p) => p.priceFrom));
    node.priceRange = min === max ? `от ${min} ₽` : `${min}–${max} ₽`;
    node.makesOffer = validPrices.map((p) => ({
      "@type": "Offer",
      itemOffered: {
        "@type": "Service",
        name: p.service,
        ...(input.cityName ? { areaServed: { "@type": "City", name: input.cityName } } : {}),
      },
      price: p.priceFrom,
      priceCurrency: "RUB",
      availability: "https://schema.org/InStock",
    }));
  }
  if (input.rating && input.rating.reviewCount > 0) {
    node.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: input.rating.ratingValue,
      reviewCount: input.rating.reviewCount,
      bestRating: "5",
      worstRating: "1",
    };
  }
  if (input.reviews.length > 0) {
    node.review = input.reviews.map((r) => ({
      "@type": "Review",
      author: { "@type": "Person", name: r.authorName },
      reviewRating: {
        "@type": "Rating",
        ratingValue: String(r.rating),
        bestRating: "5",
        worstRating: "1",
      },
      reviewBody: r.text,
      datePublished: r.createdAt,
    }));
  }
  return node;
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Portfolio case (CreativeWork + Service+Offer + ImageObject + Review)     */
/* ──────────────────────────────────────────────────────────────────────── */

export interface CaseJsonLdInput {
  /** Public URL of the case page. Absolute. */
  url: string;
  /** Headline / H1 of the case page. */
  title: string;
  /** Plain-text description, used for `description`. */
  description: string | null;
  /** Absolute URL of the cover image (typically first afterPhotos). */
  coverImageUrl: string | null;
  /** Additional photo URLs (before + after). Already absolute. */
  imageUrls: string[];
  /** ISO date string from the DB (`completed_at`). */
  completedAt: string | null;
  /** Numeric area in m² (parsed from string). */
  areaSqm: number | null;
  /** Numeric price (parsed from `priceFrom`). */
  priceTotal: number | null;
  /** Service info — used both for `serviceType` and the `Service+Offer` graph. */
  service: { name: string; slug: string | null } | null;
  /** City info — used for `locationCreated` and `areaServed`. */
  city: { name: string; slug: string | null } | null;
  /** Master id + slug to build the absolute `/master/{slug}` author URL. */
  master: {
    id: number;
    slug: string | null;
    name: string;
    avatarUrl: string | null;
  };
  /** Marketplace base URL (no trailing slash) for relative→absolute. */
  siteUrl: string;
  /** If the case has a public client review. */
  clientReview: { rating: number; text: string } | null;
}

/**
 * Build the schema.org graph for /raboty/[slug]: a `CreativeWork` describing
 * the visual case (gallery + description) plus a parallel `Service+Offer`
 * describing the commercial side (provider, price, area). The `Person`
 * (master) is referenced by `@id` so search engines can correlate cases
 * across the same author.
 *
 * Returns an array of nodes ready to be wrapped in a single `@graph`.
 */
export function caseJsonLd(input: CaseJsonLdInput): Record<string, unknown> {
  const masterUrl = input.master.slug
    ? `${input.siteUrl}/master/${input.master.slug}`
    : input.siteUrl;
  const masterId = `${masterUrl}#person`;
  const caseId = `${input.url}#case`;
  const serviceId = `${input.url}#service`;

  const allImages: string[] = [];
  if (input.coverImageUrl) allImages.push(input.coverImageUrl);
  for (const u of input.imageUrls) {
    if (u && !allImages.includes(u)) allImages.push(u);
  }

  const creativeWork: Record<string, unknown> = {
    "@type": "CreativeWork",
    "@id": caseId,
    name: input.title,
    headline: input.title,
    url: input.url,
    creator: {
      "@type": "Person",
      "@id": masterId,
      name: input.master.name,
      url: masterUrl,
      ...(input.master.avatarUrl ? { image: input.master.avatarUrl } : {}),
    },
  };
  if (input.description) creativeWork.description = input.description;
  if (allImages.length > 0) creativeWork.image = allImages;
  if (input.completedAt) creativeWork.dateCreated = input.completedAt;
  if (input.city) {
    creativeWork.locationCreated = {
      "@type": "Place",
      name: input.city.name,
      address: {
        "@type": "PostalAddress",
        addressLocality: input.city.name,
        addressCountry: "RU",
      },
    };
  }
  if (input.service) {
    creativeWork.about = { "@type": "Service", name: input.service.name };
  }

  const nodes: Record<string, unknown>[] = [creativeWork];

  if (input.service) {
    const serviceNode: Record<string, unknown> = {
      "@type": "Service",
      "@id": serviceId,
      serviceType: input.service.name,
      name: input.title,
      provider: { "@id": masterId },
      ...(input.city
        ? { areaServed: { "@type": "City", name: input.city.name } }
        : {}),
    };
    if (input.priceTotal != null && input.priceTotal > 0) {
      serviceNode.offers = {
        "@type": "Offer",
        price: input.priceTotal,
        priceCurrency: "RUB",
        availability: "https://schema.org/InStock",
      };
    }
    nodes.push(serviceNode);
  }

  if (input.clientReview) {
    nodes.push({
      "@type": "Review",
      itemReviewed: { "@id": serviceId },
      reviewRating: {
        "@type": "Rating",
        ratingValue: String(input.clientReview.rating),
        bestRating: "5",
        worstRating: "1",
      },
      author: { "@type": "Person", name: "Клиент" },
      reviewBody: input.clientReview.text,
    });
  }

  return {
    "@context": "https://schema.org",
    "@graph": nodes,
  };
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Inline-safe serialisation                                                */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * Stringify and escape a value for safe inclusion inside a `<script>` tag.
 *
 * JSON itself doesn't escape "<", "&", or U+2028 / U+2029, all of which can
 * either close the wrapping tag (`</script>`) or break the JSON when the
 * page is parsed as HTML. Replace them with their `\uXXXX` equivalents so
 * the output is still valid JSON for crawlers but inert as HTML.
 */
export function toJsonLdScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
