// Public-facing DTOs returned by the api-server marketplace endpoints.
// Keep in sync with artifacts/api-server/src/routes/marketplace.ts.

export interface City {
  id: number;
  name: string;
  slug: string;
  nameIn: string | null;
  region: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  h1: string | null;
  bodyMd: string | null;
  isActive: boolean;
}

export interface Service {
  id: number;
  name: string;
  slug: string;
  nameGenitive: string | null;
  parentId: number | null;
  icon: string | null;
  description: string | null;
  bodyMd: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  h1: string | null;
  priceFrom: number | null;
  isActive: boolean;
  sortOrder: number;
}

export interface ServiceCityStats {
  mastersCount: number;
  minPrice: number | null;
  avgRating: number | null;
  reviewsCount: number;
}

export interface ServiceCitySeo {
  title: string;
  description: string;
  h1: string;
}

export interface ServiceCityResponse {
  service: Service;
  city: City;
  /** Top published masters in this city offering this service (up to 30). */
  masters: Master[];
  stats: ServiceCityStats;
  seo: ServiceCitySeo;
}

/** Response of GET /api/marketplace/masters. Used by the catalog `/mastera`. */
export interface MasterListResponse {
  items: Master[];
  page: number;
  limit: number;
  total: number;
}

// ── Master profile DTOs ──────────────────────────────────────────────────────
// Public fields only. Source: api-server `toMasterDto()` in routes/marketplace.ts.
// Numeric fields (rating, priceFrom etc.) come over the wire as strings because
// drizzle-orm serialises Postgres `numeric` type that way; cast at the call site.

export interface Master {
  id: number;
  slug: string | null;
  /** Internal alias of the master (operator-facing name). */
  alias: string | null;
  /** Optional explicit public title set by the operator in CRM. */
  publicTitle: string | null;
  publicBio: string | null;
  /** Free-form city string from masters.city — may not exactly match cities.name. */
  city: string | null;
  specialization: string | null;
  /** Array of service NAMES the master self-declared. */
  specializations: string[] | null;
  /**
   * Service prices set by the master in PWA. Backend filters out invalid
   * entries (price ≤ 0, missing service). Used both for SEO (priceRange in
   * JSON-LD) and for the on-page «Цены на услуги» block.
   */
  servicePrices: { service: string; priceFrom: number }[];
  rating: string | null;
  publicRating: string | null;
  publicReviewsCount: number;
  yearsExperience: number | null;
  avatarUrl: string | null;
  hasContract: boolean;
  /** ISO timestamp of master's first sign-up. Used for «На платформе X лет». */
  createdAt: string;
}

/**
 * Aggregate counts from the orders table, computed on every request and cached
 * at the SSR layer. Cancelled count is intentionally absent — see backend
 * comment in routes/marketplace.ts.
 */
export interface MasterStats {
  totalOrders: number;
  completedOrders: number;
}

export interface MasterPortfolioItem {
  id: number;
  slug: string | null;
  title: string;
  description: string | null;
  beforePhotos: string[];
  afterPhotos: string[];
  /** numeric → string. Display formatting at the component level. */
  priceFrom: string | null;
  priceTo: string | null;
  area: string | null;
  completedAt: string | null;
  clientReviewText: string | null;
  clientRating: number | null;
  isFeatured: boolean;
  sortOrder: number;
  service: { name: string; slug: string | null } | null;
  city: { name: string; slug: string | null } | null;
}

export interface MasterPublicReview {
  id: number;
  clientName: string;
  clientCity: string | null;
  rating: number;
  text: string;
  photos: string[];
  isFeatured: boolean;
  createdAt: string;
}

export interface MasterDetailResponse {
  master: Master;
  stats: MasterStats;
  portfolio: MasterPortfolioItem[];
  reviews: MasterPublicReview[];
}

// ── Standalone portfolio case page (Houzz-model, /raboty/[slug]) ────────────

/** Compact master info embedded into a case-list item. */
export interface RabotyMasterRef {
  id: number;
  slug: string | null;
  alias: string | null;
  publicTitle: string | null;
  avatarUrl: string | null;
  publicRating: string | null;
  publicReviewsCount: number;
  city: string | null;
}

/** A single case in the /raboty list response. */
export interface RabotyListItem {
  id: number;
  slug: string | null;
  title: string;
  description: string | null;
  beforePhotos: string[];
  afterPhotos: string[];
  priceFrom: string | null;
  priceTo: string | null;
  area: string | null;
  completedAt: string | null;
  clientReviewText: string | null;
  clientRating: number | null;
  isFeatured: boolean;
  service: { name: string; slug: string | null } | null;
  city: { name: string; slug: string | null } | null;
  master: RabotyMasterRef;
}

export interface RabotyListResponse {
  items: RabotyListItem[];
  page: number;
  limit: number;
  total: number;
  /** Active filter context, present when serviceSlug / citySlug were provided. */
  filter: {
    service: { name: string; slug: string } | null;
    city: { name: string; slug: string } | null;
  };
}

/** Trimmed similar-case used in the "Похожие работы" rail on a case page. */
export interface RabotySimilarItem {
  id: number;
  slug: string | null;
  title: string;
  beforePhotos: string[];
  afterPhotos: string[];
  priceFrom: string | null;
  area: string | null;
  service: { name: string; slug: string | null } | null;
  city: { name: string; slug: string | null } | null;
}

export interface RabotyDetailResponse {
  portfolio: {
    id: number;
    slug: string | null;
    title: string;
    description: string | null;
    beforePhotos: string[];
    afterPhotos: string[];
    priceFrom: string | null;
    priceTo: string | null;
    area: string | null;
    completedAt: string | null;
    clientReviewText: string | null;
    clientRating: number | null;
    isFeatured: boolean;
    service: { name: string; slug: string | null } | null;
    city: { name: string; slug: string | null } | null;
  };
  master: Master;
  /**
   * Aggregate counts for the master byline on `/raboty/[slug]` (plan §22 redesign,
   * Requirement 5). Computed in one extra round-trip on the api-server side.
   */
  masterStats: {
    portfolioCount: number;
    completedOrders: number;
  };
  similar: RabotySimilarItem[];
}


// ── Marketplace stats (homepage trust block, plan §20.2 [10]) ───────────────

/**
 * Platform-wide aggregate counts. All numbers are nullable / can be 0; the UI
 * hides empty cards rather than showing a misleading zero. Source:
 * `GET /api/marketplace/stats`.
 */
export interface MarketplaceStats {
  /** Orders moved to status='completed' (Source of "X завершённых ремонтов"). */
  completedOrders: number;
  /** Masters whose public profile is live on the marketplace. */
  publishedMasters: number;
  /** Cases visible at /raboty. */
  publishedCases: number;
  /** Average rating across published masters with a non-zero rating. */
  avgRating: number | null;
  /** Active cities in the catalog. */
  citiesCount: number;
}


// ── Calculator (plan §19.3, §20.2 [6]) ──────────────────────────────────────

export type CalcCategory = "kosmetic" | "evro" | "premium";

export interface CalculatorEstimate {
  /**
   * Resolved city DTO if `citySlug` matched an active row, otherwise null —
   * the engine still produced an estimate, just using regional baseline.
   */
  city: City | null;
  service: Service | null;
  category: CalcCategory;
  /** Echoed back so the UI doesn't need to re-parse the input. */
  areaSqm: number;
  pricePerSqm: { low: number; mid: number; high: number };
  totalPrice: { low: number; mid: number; high: number };
  duration: { low: number; high: number };
  /** Source tagline, e.g. "Ориентир в Москве по средним коэффициентам региона". */
  source: string;
  isRegionalEstimate: boolean;
  cityNameIn: string;
  /** How many published cases match the (city, area±30%) bucket — for social proof. */
  matchingRealCasesCount: number;
}
