import "server-only";
import { internalApiBase, internalApiToken } from "./env";
import type {
  CommunityCityResponse,
  CommunityZhkResponse,
} from "./types";

/**
 * Server-only client for the api-server **community** endpoints
 * (Sosedi_Zone — гео-сообщество «ХочуТакже»).
 *
 * Mirrors `lib/api.ts` but targets the `/community/*` prefix instead of
 * `/marketplace/*`. `import "server-only"` guarantees the Bearer token
 * (INTERNAL_API_SHARED_TOKEN) is never bundled into the browser — the facade
 * reaches the backend only server-to-server (Requirements 20.5, 20.6): the
 * facade NEVER touches the DB directly.
 *
 * Consumed endpoints (implemented in artifacts/api-server, mounted by task
 * 14.1 under `/api/community/*`):
 *   • GET /api/community/geo/city/:citySlug → { city, cityFeed }  (R1.2, R1.5)
 *   • GET /api/community/geo/zhk/:zhkSlug   → { zhk, localFeed }  (R1.4, R1.5, R1.7)
 *
 * Writes (create ЖК / create topic) go through the facade route handlers under
 * `app/api/community/*` so the shared token stays server-side; those forward to
 * POST /api/community/geo/zhk and POST /api/community/feeds/zhk.
 */

interface FetchOpts {
  /** ISR revalidation TTL in seconds. Default 60s — feeds move faster than the
   * marketplace catalog, but we still want crawlers to hit cache, not upstream. */
  revalidate?: number;
  /** When true, bypass the cache entirely (per-request / non-idempotent). */
  noStore?: boolean;
}

export class CommunityApiError extends Error {
  constructor(public readonly path: string, public readonly status: number) {
    super(`community api ${path} -> ${status}`);
    this.name = "CommunityApiError";
  }
}

async function call<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const base = internalApiBase();
  const token = internalApiToken();
  // internalApiBase already ends with `/api`, community routes live under
  // `/api/community/*`, so we prefix with `/community`.
  const url = `${base.replace(/\/+$/, "")}/community${path}`;
  const init: RequestInit & { next?: { revalidate?: number } } = {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: opts.noStore ? "no-store" : "force-cache",
  };
  if (!opts.noStore) {
    init.next = { revalidate: opts.revalidate ?? 60 };
  }
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new CommunityApiError(path, res.status);
  }
  return (await res.json()) as T;
}

/**
 * City + City_Feed by public slug (Requirements 1.2, 1.5).
 * Returns `null` on 404 so the caller can `notFound()`.
 */
export async function fetchCommunityCity(
  citySlug: string,
  opts: FetchOpts = {},
): Promise<CommunityCityResponse | null> {
  try {
    return await call<CommunityCityResponse>(
      `/geo/city/${encodeURIComponent(citySlug)}`,
      opts,
    );
  } catch (e) {
    if (e instanceof CommunityApiError && e.status === 404) return null;
    throw e;
  }
}

/**
 * ZhK + Local_Feed by public slug (Requirements 1.4, 1.5, 1.7).
 * Returns `null` on 404 so the caller can `notFound()`.
 */
export async function fetchCommunityZhk(
  zhkSlug: string,
  opts: FetchOpts = {},
): Promise<CommunityZhkResponse | null> {
  try {
    return await call<CommunityZhkResponse>(
      `/geo/zhk/${encodeURIComponent(zhkSlug)}`,
      opts,
    );
  } catch (e) {
    if (e instanceof CommunityApiError && e.status === 404) return null;
    throw e;
  }
}

// ─── PRO_Zone (task 13.2) ────────────────────────────────────────────────────
//
// DTOs mirror artifacts/api-server/src/routes/community/pro.ts
// (`GET /api/community/pro/:specialtySlug` → `{ specialty, feed }`).
// Timestamps arrive as ISO strings over the wire (Postgres `timestamp` →
// Drizzle `Date` → JSON), so they are typed as `string` here.
//
// Types are kept local to this module (not in ./types) so the concurrently
// developed Sosedi_Zone (task 13.1) and PRO_Zone (task 13.2) grow additively
// without contending over the shared ./types file.

/** Публичный DTO Specialty для страницы PRO-сообщества. */
export interface SpecialtyView {
  id: number;
  slug: string;
  name: string;
}

/** Режим PRO-ленты: агрегированная «Вся Россия» либо локальный «Мой город». */
export type ProFeedMode = "all_russia" | "my_city";

/** Элемент PRO-ленты (проекция `community_threads`, безопасная для фасада). */
export interface ProFeedItem {
  id: number;
  title: string;
  body: string;
  category: string | null;
  cityId: number | null;
  zhkId: number | null;
  authorAccountId: number | null;
  isSeeded: boolean;
  /** ISO timestamp. */
  lastActivityAt: string;
  /** ISO timestamp. */
  createdAt: string;
  /** Специальность темы (Requirement 6.1). */
  specialtyId: number | null;
  /** Локальная ли PRO-тема (Requirement 6.4). */
  isLocal: boolean;
}

/**
 * Ответ PRO-ленты. `feedMode`/`cityFilterApplied` отражают состояние
 * переключателя «Мой город»; `emptyState` при `feedMode = 'my_city'` означает
 * отсутствие локальных тем БЕЗ отката к All_Russia (Requirement 6.5).
 */
export interface ProFeedResult {
  items: ProFeedItem[];
  emptyState: boolean;
  nextCursor: string | null;
  /** Активный режим ленты (Requirements 6.2, 6.4). */
  feedMode: ProFeedMode;
  /** Применён ли My_City_Filter явно (Requirement 6.6). */
  cityFilterApplied: boolean;
}

/** Полный ответ `GET /api/community/pro/:specialtySlug`. */
export interface ProCommunityResponse {
  specialty: SpecialtyView;
  feed: ProFeedResult;
}

/** Параметры чтения PRO-ленты со стороны фасада. */
export interface ProFeedOptions {
  /**
   * Явное применение My_City_Filter (Requirement 6.6). Передаётся в бэкенд как
   * `?cityFilter=true` ТОЛЬКО когда `true`; иначе лента остаётся All_Russia по
   * умолчанию (Requirements 6.2, 6.3).
   */
  cityFilter?: boolean;
  /** Текущий город для My_City_Filter (Requirement 6.4). */
  cityId?: number | null;
  /** Размер страницы (keyset-пагинация). */
  limit?: number;
  /** Непрозрачный курсор следующей страницы. */
  cursor?: string | null;
  /** ISR TTL, сек. По умолчанию наследуется из `call` (60s). */
  revalidate?: number;
}

/**
 * Прочитать PRO_Public_Layer ленту специальности
 * (`GET /api/community/pro/:specialtySlug`).
 *
 * Поведение бэкенда (`FeedService.getProFeed`):
 *   • По умолчанию — All_Russia_Feed (Requirement 6.2). My_City_Filter
 *     активируется ТОЛЬКО при `opts.cityFilter === true` и наличии `cityId`
 *     (Requirements 6.4, 6.6); при пустом локальном результате — пустая лента
 *     без отката к All_Russia (Requirement 6.5).
 *
 * Возвращает `null` при 404 (несуществующая специальность), чтобы вызывающая
 * страница могла вызвать `notFound()`.
 */
export async function fetchProCommunity(
  specialtySlug: string,
  opts: ProFeedOptions = {},
): Promise<ProCommunityResponse | null> {
  const params = new URLSearchParams();
  // My_City_Filter передаётся ТОЛЬКО при явном включении (Requirement 6.6).
  if (opts.cityFilter === true) {
    params.set("cityFilter", "true");
    if (opts.cityId != null && Number.isInteger(opts.cityId) && opts.cityId > 0) {
      params.set("cityId", String(opts.cityId));
    }
  }
  if (opts.limit != null && opts.limit > 0) params.set("limit", String(opts.limit));
  if (opts.cursor) params.set("cursor", opts.cursor);
  const qs = params.toString();
  const fetchOpts: FetchOpts = opts.revalidate != null ? { revalidate: opts.revalidate } : {};
  try {
    return await call<ProCommunityResponse>(
      `/pro/${encodeURIComponent(specialtySlug)}${qs ? `?${qs}` : ""}`,
      fetchOpts,
    );
  } catch (e) {
    if (e instanceof CommunityApiError && e.status === 404) return null;
    throw e;
  }
}

// ─── Community sitemap source (task 11.2) ────────────────────────────────────
//
// DTO mirrors artifacts/api-server/src/routes/community/sitemap.ts
// (`GET /api/community/sitemap` → indexable slugs only). Consumed by
// app/sitemap.ts to include Sosedi_Zone (/goroda, /zhk) and PRO_Public (/pro)
// pages ABOVE the content threshold — «тонкие» страницы исключены на бэкенде
// (Requirements 16.1, 16.3, 5.2, 6.5).

/** Индексируемые слаги сообщества для фасадного sitemap. */
export interface CommunitySitemapSlugs {
  /** Города целевого SEO-набора (≥400k), страницы `/goroda/[slug]`. */
  cities: string[];
  /** ЖК выше порога контента, страницы `/zhk/[slug]`. */
  zhk: string[];
  /** Специальности PRO_Public_Layer, страницы `/pro/[slug]`. */
  specialties: string[];
}

/**
 * Прочитать индексируемые слаги сообщества (`GET /api/community/sitemap`).
 *
 * Бэкенд уже отфильтровал «тонкие» страницы (`zhk.is_indexable`) и ограничил
 * города целевым SEO-набором (`cities.is_geo_covered`). При недоступности
 * апстрима возвращает пустые списки, чтобы фасадный sitemap деградировал к
 * статическим записям, а не падал.
 */
export async function fetchCommunitySitemap(
  opts: FetchOpts = {},
): Promise<CommunitySitemapSlugs> {
  try {
    return await call<CommunitySitemapSlugs>("/sitemap", {
      revalidate: opts.revalidate ?? 3600,
    });
  } catch {
    return { cities: [], zhk: [], specialties: [] };
  }
}
