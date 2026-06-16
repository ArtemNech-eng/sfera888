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
  // master cards are intentionally empty in Phase 1 — see backend skeleton.
  masters: unknown[];
  stats: ServiceCityStats;
  seo: ServiceCitySeo;
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
