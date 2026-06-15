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
