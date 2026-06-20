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
  /** Iteration 2 — same fields as on RabotyDetailResponse.portfolio. */
  durationDays: number | null;
  housingType: HousingType | null;
  estimate: PortfolioEstimate | null;
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

/**
 * Portfolio housing type — must mirror the DB enum on api-server:
 * `lib/db/src/schema/master-portfolio.ts` (housingTypeEnum).
 */
export type HousingType = "novostroyka" | "vtorichka" | "chastnyy_dom" | "kommerciya";

/**
 * Structured estimate for a portfolio case (plan §22 Iter 2). Stored as
 * JSONB on api-server side; here it's the runtime shape after parse.
 */
export interface PortfolioEstimate {
  works: number;
  materials: number;
  total?: number;
  breakdown?: { label: string; cost: number }[];
}

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
  /** Iter 4 — running save_count from master_portfolio. */
  saveCount: number;
  service: { name: string; slug: string | null } | null;
  city: { name: string; slug: string | null } | null;
  master: RabotyMasterRef;
}

/** /izbrannoe item — same as RabotyListItem with `savedAt` timestamp. */
export interface SavedRabotyItem extends RabotyListItem {
  savedAt: string;
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
    /** Iteration 2 (plan §22 Req 2.4): срок выполнения, дни. */
    durationDays: number | null;
    /** Iteration 2 (plan §22 Req 2.5): тип жилья объекта. */
    housingType: HousingType | null;
    /** Iteration 2 (plan §22 Req 3): структурированная смета. */
    estimate: PortfolioEstimate | null;
    completedAt: string | null;
    clientReviewText: string | null;
    clientRating: number | null;
    isFeatured: boolean;
    /** Iteration 4 — running save_count. */
    saveCount: number;
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
  /** Iteration 4 — true when the current anon visitor has this case in saves. */
  isSavedByCurrentUser: boolean;
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


// ── Market average stats (plan §22 Iteration 3) ─────────────────────────────

/**
 * Aggregate price stats for "similar" published cases. Used by the
 * `<CaseMarketStats>` block on `/raboty/[slug]`. Source:
 * `GET /api/marketplace/raboty/market-stats?serviceSlug=...&areaTarget=...&citySlug=...`.
 */
export interface MarketStatsResponse {
  russia: { p25: number; p75: number; count: number };
  city: { p25: number; p75: number; count: number; cityName: string } | null;
  areaTarget: number;
  serviceName: string;
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


// ── AI-designer types (см. .kiro/specs/ai-designer) ──────────────────────────

export interface DesignMaterialDTO {
  category: string;
  description: string;
}

export interface DesignEstimateItemDTO {
  category: string;
  amountKopeks: number;
}

export interface DesignSolutionDTO {
  text: string;
}

export interface DesignColorSwatchDTO {
  hex: string;
  name?: string | null;
}

export interface DesignImageDTO {
  type: string; // 'input' | 'view_1_entrance' | 'view_2_main' | 'view_3_storage' | 'view_4_window'
  url: string;
  width: number | null;
  height: number | null;
  sortOrder: number;
}

/** Один из 4 ракурсов проекта (общий вид / акцент / хранение / окно). */
export interface DesignViewDTO {
  url: string;
  label: string;
  position: number; // 1..4
}

/** Один из 6 крупных планов (мебель/детали), нарезаны из ракурсов через sharp. */
export interface DesignDetailCropDTO {
  url: string;
  label: string;
  fromView?: number | null;
}

export type DesignStatus = "draft" | "generating" | "completed" | "failed" | "private";

/**
 * Полный DTO дизайн-проекта возвращаемый GET /api/marketplace/dizajn/:slug.
 * Часть полей null пока status='generating'.
 */
export interface DesignFullDTO {
  id: number;
  slug: string;
  status: DesignStatus;
  roomType: string;
  style: string;
  area: number | null;
  budget: number | null;
  durationWeeks: number | null;
  cityName: string | null;
  citySlug: string | null;
  district: string | null;
  h1: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  description: string | null;
  materials: DesignMaterialDTO[] | null;
  estimate: DesignEstimateItemDTO[] | null;
  solutions: DesignSolutionDTO[] | null;
  colorPalette: DesignColorSwatchDTO[] | null;
  /** Главный hero ракурс (для og:image). Совпадает с views[0].url. */
  resultImageUrl: string | null;
  /** «Было» — text2img сгенерированное «до ремонта» или фото пользователя. */
  inputImageUrl: string | null;
  /** 4 ракурса (общий / акцент / хранение / окно). null пока generating. */
  views: DesignViewDTO[] | null;
  /** 6 кропов деталей мебели — sharp-вырезано из views. null пока generating. */
  detailCrops: DesignDetailCropDTO[] | null;
  images: DesignImageDTO[];
  viewCount: number;
  saveCount: number;
  isSavedByCurrentUser: boolean;
  /** 0-100, оценка прогресса генерации (для UI прогресс-бара). */
  progress: number;
  errorMessage: string | null;
  createdAt: string;
}

export interface DesignFeedItemDTO {
  id: number;
  slug: string;
  roomType: string;
  style: string;
  h1: string | null;
  resultImageUrl: string | null;
  viewCount: number;
  saveCount: number;
}
