import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { fetchRabotyCase, fetchCities, fetchServices } from "../../../lib/api";
import { publicUrl } from "../../../lib/env";
import { LeadForm } from "../../../components/LeadForm";
import {
  breadcrumbJsonLd,
  caseJsonLd,
  toJsonLdScript,
} from "../../../lib/jsonLd";
import { buildCaseMeta, buildPortfolioImageAlt, buildMasterAvatarAlt } from "../../../lib/seoMeta";
import type { RabotyDetailResponse, RabotySimilarItem } from "../../../lib/types";

/**
 * Standalone portfolio case page — `/raboty/[slug]`.
 *
 * Houzz-model first-class SEO asset (plan §11.7). Each published case is
 * its own indexable page with a self-contained CreativeWork + Service+Offer
 * schema. Photo galleries (before/after), price, duration, master profile
 * link, similar works rail, and a "Хочу такую же" lead form pre-filled with
 * the case context.
 */

export const dynamic = "force-dynamic";

interface RouteParams {
  slug: string;
}

export async function generateMetadata(
  { params }: { params: Promise<RouteParams> },
): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchRabotyCase(slug);
  if (!data) return { robots: { index: false, follow: false } };

  const path = `/raboty/${slug}`;
  const meta = buildCaseMeta(data.portfolio, data.master);
  const cover = data.portfolio.afterPhotos[0] ?? data.portfolio.beforePhotos[0] ?? null;

  return {
    title: { absolute: meta.title },
    description: meta.description,
    alternates: { canonical: `${publicUrl()}${path}` },
    openGraph: cover
      ? {
        title: meta.title,
        description: meta.description,
        url: `${publicUrl()}${path}`,
        type: "article",
        images: [{ url: cover, alt: buildPortfolioImageAlt(data.portfolio, "after", 0) }],
      }
      : undefined,
  };
}

function pickMasterDisplayName(m: { publicTitle: string | null; alias: string | null; id: number }): string {
  if (m.publicTitle && m.publicTitle.trim().length > 0) return m.publicTitle.trim();
  if (m.alias && m.alias.trim().length > 0) return m.alias.trim();
  return `Мастер #${m.id}`;
}

function formatNumber(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
}

function formatPriceForMeta(priceFrom: string | null): string | null {
  if (!priceFrom) return null;
  const n = parseFloat(priceFrom);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${formatNumber(n)} ₽`;
}

function formatPriceRange(from: string | null, to: string | null): string | null {
  const a = from ? parseFloat(from) : NaN;
  const b = to ? parseFloat(to) : NaN;
  if (Number.isFinite(a) && Number.isFinite(b) && a !== b) return `${formatNumber(a)}–${formatNumber(b)} ₽`;
  if (Number.isFinite(a) && a > 0) return `от ${formatNumber(a)} ₽`;
  if (Number.isFinite(b) && b > 0) return `до ${formatNumber(b)} ₽`;
  return null;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("ru-RU", { year: "numeric", month: "long" });
}

function pluralReviews(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "отзывов";
  if (mod10 === 1) return "отзыв";
  if (mod10 >= 2 && mod10 <= 4) return "отзыва";
  return "отзывов";
}

export default async function RabotyCasePage(
  { params }: { params: Promise<RouteParams> },
) {
  const { slug } = await params;
  const [data, cities, services] = await Promise.all([
    fetchRabotyCase(slug),
    fetchCities(),
    fetchServices(),
  ]);
  if (!data) notFound();

  const { portfolio, master, similar } = data;
  const masterName = pickMasterDisplayName(master);
  const sourcePageUrl = `${publicUrl()}/raboty/${slug}`;

  const cityName = portfolio.city?.name ?? master.city ?? null;
  const priceTotalNum = portfolio.priceFrom ? parseFloat(portfolio.priceFrom) : null;
  const areaNum = portfolio.area ? parseFloat(portfolio.area) : null;
  const completedAtFormatted = formatDate(portfolio.completedAt);
  const priceRange = formatPriceRange(portfolio.priceFrom, portfolio.priceTo);

  // Resolve a default city/service for the lead form. Server-side fallback to
  // the first known city/service so the form is always usable.
  const matchService = portfolio.service?.slug
    ? services.find((s) => s.slug === portfolio.service?.slug)
    : null;
  const matchCity = portfolio.city?.slug
    ? cities.find((c) => c.slug === portfolio.city?.slug)
    : null;
  const fallbackCity = matchCity ?? (cityName
    ? cities.find((c) => c.name.trim().toLowerCase() === cityName.trim().toLowerCase()) ?? null
    : null) ?? cities[0] ?? null;
  const fallbackService = matchService ?? services[0] ?? null;

  // ── JSON-LD ─────────────────────────────────────────────────────────────
  // Breadcrumbs: Home → Работы → этот кейс. Filtered hub URLs
  // (/raboty/[service]/[city]) are a future addition (plan §11.7), so for now
  // we keep breadcrumbs flat to avoid linking to 404 routes.
  const breadcrumbsLd = breadcrumbJsonLd([
    { name: "Главная", url: `${publicUrl()}/` },
    { name: "Работы", url: `${publicUrl()}/raboty` },
    { name: portfolio.title, url: sourcePageUrl },
  ]);

  const cover = portfolio.afterPhotos[0] ?? portfolio.beforePhotos[0] ?? null;
  const allPhotoUrls = [
    ...portfolio.afterPhotos,
    ...portfolio.beforePhotos,
  ];

  const caseLd = caseJsonLd({
    url: sourcePageUrl,
    title: portfolio.title,
    description: portfolio.description,
    coverImageUrl: cover,
    imageUrls: allPhotoUrls,
    completedAt: portfolio.completedAt,
    areaSqm: areaNum && Number.isFinite(areaNum) ? areaNum : null,
    priceTotal: priceTotalNum && Number.isFinite(priceTotalNum) ? priceTotalNum : null,
    service: portfolio.service,
    city: portfolio.city,
    master: {
      id: master.id,
      slug: master.slug,
      name: masterName,
      avatarUrl: master.avatarUrl,
    },
    siteUrl: publicUrl(),
    clientReview: portfolio.clientReviewText && portfolio.clientRating
      ? { rating: portfolio.clientRating, text: portfolio.clientReviewText }
      : null,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLdScript(breadcrumbsLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLdScript(caseLd) }}
      />

      {/* Breadcrumbs (visual) */}
      <nav className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto max-w-6xl px-4 py-3 text-xs text-[var(--color-muted)] sm:px-6">
          <Link href="/" className="hover:text-[var(--color-primary)]">Главная</Link>
          <span aria-hidden className="mx-1.5">›</span>
          <Link href="/raboty" className="hover:text-[var(--color-primary)]">Работы</Link>
          {portfolio.service?.name ? (
            <>
              <span aria-hidden className="mx-1.5">›</span>
              <span>{portfolio.service.name}</span>
            </>
          ) : null}
          {(portfolio.city?.name || cityName) ? (
            <>
              <span aria-hidden className="mx-1.5">›</span>
              <span>{portfolio.city?.name ?? cityName}</span>
            </>
          ) : null}
        </div>
      </nav>

      {/* Hero — H1 + meta */}
      <section className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
          <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
            {portfolio.service?.name ? <span>{portfolio.service.name}</span> : null}
            {cityName ? (
              <>
                {portfolio.service?.name ? <span aria-hidden>·</span> : null}
                <span>{cityName}</span>
              </>
            ) : null}
            {completedAtFormatted ? (
              <>
                <span aria-hidden>·</span>
                <span>{completedAtFormatted}</span>
              </>
            ) : null}
            {portfolio.isFeatured ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                Рекомендуется
              </span>
            ) : null}
          </div>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--color-text)] sm:text-4xl">
            {portfolio.title}
          </h1>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            {priceRange ? (
              <span className="rounded-full bg-[var(--color-background)] px-3 py-1 font-medium text-[var(--color-text)]">
                {priceRange}
              </span>
            ) : null}
            {areaNum && Number.isFinite(areaNum) && areaNum > 0 ? (
              <span className="rounded-full bg-[var(--color-background)] px-3 py-1 text-[var(--color-text)]">
                {formatNumber(areaNum)} м²
              </span>
            ) : null}
          </div>
        </div>
      </section>

      {/* Photo gallery */}
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PhotoGallery
          beforePhotos={portfolio.beforePhotos}
          afterPhotos={portfolio.afterPhotos}
          title={portfolio.title}
          city={portfolio.city}
        />
      </section>

      {/* Main content + lead form */}
      <section className="mx-auto max-w-6xl px-4 pb-10 sm:px-6 sm:pb-14">
        <div className="grid gap-8 lg:grid-cols-[1.3fr,1fr]">
          <div className="space-y-10 lg:order-1">
            {/* Description */}
            {portfolio.description ? (
              <div>
                <h2 className="text-2xl font-semibold text-[var(--color-text)]">Что было сделано</h2>
                <div className="mt-4 whitespace-pre-line text-[var(--color-text)] leading-relaxed">
                  {portfolio.description}
                </div>
              </div>
            ) : null}

            {/* Author / master card */}
            <MasterAuthorCard master={master} masterName={masterName} />

            {/* Client review (if exists) */}
            {portfolio.clientReviewText && portfolio.clientRating ? (
              <div>
                <h2 className="text-2xl font-semibold text-[var(--color-text)]">Отзыв клиента</h2>
                <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                  <div className="inline-flex items-center gap-1 rounded-full bg-[var(--color-background)] px-2 py-1 text-xs font-medium text-[var(--color-text)]">
                    <span aria-hidden>★</span>
                    <span>{portfolio.clientRating}</span>
                  </div>
                  <p className="mt-3 text-[var(--color-text)]">{portfolio.clientReviewText}</p>
                </div>
              </div>
            ) : null}

            {/* Similar works */}
            {similar.length > 0 ? (
              <div>
                <h2 className="text-2xl font-semibold text-[var(--color-text)]">Похожие работы</h2>
                <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {similar.map((s) => (
                    <SimilarCaseCard key={s.id} item={s} />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {/* Lead form sticky aside */}
          <aside className="lg:order-2">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-6 lg:sticky lg:top-6">
              <h2 className="text-xl font-semibold text-[var(--color-text)] sm:text-2xl">
                Хочу такую же
              </h2>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                Заявка уйдёт автору работы первой. Перезвоним в течение часа.
              </p>
              <div className="mt-5">
                {fallbackCity && fallbackService ? (
                  <LeadForm
                    citySlug={fallbackCity.slug}
                    serviceSlug={fallbackService.slug}
                    sourcePageUrl={sourcePageUrl}
                    attachedMasterId={master.id}
                    attachedMasterTitle={masterName}
                  />
                ) : (
                  <div className="text-sm text-[var(--color-muted)]">
                    Заявка через эту страницу временно недоступна. Перейдите{" "}
                    <Link href={master.slug ? `/master/${master.slug}` : "/mastera"} className="underline hover:text-[var(--color-primary)]">
                      на страницу мастера
                    </Link>
                    , чтобы оставить заявку.
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}

function PhotoGallery({
  beforePhotos,
  afterPhotos,
  title,
  city,
}: {
  beforePhotos: string[];
  afterPhotos: string[];
  title: string;
  city: { name: string; slug: string | null } | null;
}) {
  const before = beforePhotos[0] ?? null;
  const after = afterPhotos[0] ?? null;
  const remaining = [...afterPhotos.slice(1), ...beforePhotos.slice(1)];

  if (!before && !after && remaining.length === 0) {
    return null;
  }

  // Build SEO-friendly alt-texts using the shared helper. Each photo gets
  // a unique alt with city + before/after context — much better for image
  // search than just the title.
  const portfolioRef = { title, city };
  const beforeAlt = buildPortfolioImageAlt(portfolioRef, "before", 0);
  const afterAlt = buildPortfolioImageAlt(portfolioRef, "after", 0);

  return (
    <div className="space-y-3">
      {(before || after) ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PhotoTile src={before} label="До" alt={beforeAlt} />
          <PhotoTile src={after} label="После" alt={afterAlt} />
        </div>
      ) : null}
      {remaining.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {remaining.slice(0, 8).map((u, i) => {
            // First entries from afterPhotos[1..], then beforePhotos[1..].
            const fromAfter = i < afterPhotos.length - 1;
            const altType: "after" | "before" = fromAfter ? "after" : "before";
            const indexWithinType = fromAfter ? i + 1 : i - (afterPhotos.length - 1) + 1;
            const photoAlt = buildPortfolioImageAlt(portfolioRef, altType, indexWithinType);
            return (
              <li key={`${u}-${i}`} className="aspect-[4/3] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt={photoAlt} loading="lazy" className="block h-full w-full object-cover" />
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function PhotoTile({ src, label, alt }: { src: string | null; label: string; alt: string }) {
  if (!src) {
    return (
      <div className="relative flex aspect-[4/3] items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-background)] text-sm text-[var(--color-muted)]">
        {label}
      </div>
    );
  }
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="block h-full w-full object-cover" loading="eager" />
      <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
        {label}
      </span>
    </div>
  );
}

function MasterAuthorCard({
  master,
  masterName,
}: {
  master: RabotyDetailResponse["master"];
  masterName: string;
}) {
  const rating = master.publicRating ? formatRating(master.publicRating) : null;
  const reviewsCount = master.publicReviewsCount ?? 0;
  return (
    <div>
      <h2 className="text-2xl font-semibold text-[var(--color-text)]">Автор работы</h2>
      <Link
        href={master.slug ? `/master/${master.slug}` : "/mastera"}
        className="mt-4 flex items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 hover:border-[var(--color-primary)]"
      >
        {master.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={master.avatarUrl}
            alt={masterName}
            className="h-16 w-16 flex-none rounded-2xl border border-[var(--color-border)] object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 flex-none items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-primary)] text-lg font-semibold text-white">
            {masterName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "М"}
          </div>
        )}
        <div className="flex-1">
          <div className="text-base font-semibold text-[var(--color-text)]">{masterName}</div>
          <div className="mt-0.5 text-sm text-[var(--color-muted)]">
            {master.city ? <span>{master.city}</span> : null}
            {rating ? (
              <>
                {master.city ? <span aria-hidden className="mx-1.5">·</span> : null}
                <span>★ {rating}</span>
              </>
            ) : null}
            {reviewsCount > 0 ? (
              <>
                <span aria-hidden className="mx-1.5">·</span>
                <span>{reviewsCount} {pluralReviews(reviewsCount)}</span>
              </>
            ) : null}
          </div>
        </div>
      </Link>
    </div>
  );
}

function formatRating(value: string | null): string | null {
  if (!value) return null;
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(1);
}

function SimilarCaseCard({ item }: { item: RabotySimilarItem }) {
  const cover = item.afterPhotos[0] ?? item.beforePhotos[0] ?? null;
  const priceFrom = item.priceFrom ? parseFloat(item.priceFrom) : null;
  const area = item.area ? parseFloat(item.area) : null;
  if (!item.slug) {
    // No slug → don't expose as a link (would 404).
    return null;
  }
  return (
    <li className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]">
      <Link href={`/raboty/${item.slug}`} className="block">
        {cover ? (
          <div className="relative aspect-[4/3] w-full bg-[var(--color-background)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover} alt={item.title} loading="lazy" className="block h-full w-full object-cover" />
          </div>
        ) : null}
        <div className="p-4">
          <div className="text-sm font-medium text-[var(--color-text)] line-clamp-2">{item.title}</div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-[var(--color-muted)]">
            {priceFrom && Number.isFinite(priceFrom) && priceFrom > 0 ? (
              <span className="rounded-full bg-[var(--color-background)] px-2 py-0.5 text-[var(--color-text)]">
                от {formatNumber(priceFrom)} ₽
              </span>
            ) : null}
            {area && Number.isFinite(area) && area > 0 ? (
              <span className="rounded-full bg-[var(--color-background)] px-2 py-0.5 text-[var(--color-text)]">
                {formatNumber(area)} м²
              </span>
            ) : null}
            {item.city?.name ? <span>{item.city.name}</span> : null}
          </div>
        </div>
      </Link>
    </li>
  );
}
