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
