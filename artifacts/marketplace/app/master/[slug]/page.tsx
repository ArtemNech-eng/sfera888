import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { fetchCities, fetchMaster, fetchServices } from "../../../lib/api";
import { publicUrl } from "../../../lib/env";
import { LeadForm } from "../../../components/LeadForm";
import {
  breadcrumbJsonLd,
  masterProfileJsonLd,
  toJsonLdScript,
} from "../../../lib/jsonLd";
import type { City, Service, MasterPortfolioItem, MasterPublicReview } from "../../../lib/types";

// Dynamic [slug] route — Next won't prerender these at build anyway, but we
// declare it explicitly so generateMetadata + fetch can use server-only env.
export const dynamic = "force-dynamic";

interface RouteParams {
  slug: string;
}

export async function generateMetadata(
  { params }: { params: Promise<RouteParams> },
): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchMaster(slug);
  if (!data) return { robots: { index: false, follow: false } };
  const path = `/master/${slug}`;
  const displayName = pickDisplayName(data.master);
  const city = data.master.city ?? "";
  const titleBase = city ? `${displayName} — мастер в ${city}` : `${displayName} — мастер`;
  const specs = (data.master.specializations ?? []).slice(0, 3).join(", ");
  const description =
    specs.length > 0
      ? `${displayName}, ${city}. Услуги: ${specs}. ${data.master.publicReviewsCount} отзыва.`
      : `${displayName}, ${city}. Оставьте заявку — свяжемся в течение часа.`;
  return {
    title: { absolute: `${titleBase} — Честные мастера` },
    description,
    alternates: { canonical: `${publicUrl()}${path}` },
  };
}

/** Best-effort pick of a master's display name across CRM-set fields. */
function pickDisplayName(m: { publicTitle: string | null; alias: string | null; id: number }): string {
  if (m.publicTitle && m.publicTitle.trim().length > 0) return m.publicTitle.trim();
  if (m.alias && m.alias.trim().length > 0) return m.alias.trim();
  return `Мастер #${m.id}`;
}

/** Resolve master.city (free-form text) to a known city slug from the catalog. */
function resolveCitySlug(masterCity: string | null, cities: City[]): { slug: string; name: string } | null {
  if (!masterCity) return null;
  const norm = masterCity.trim().toLowerCase();
  const match = cities.find((c) => c.name.trim().toLowerCase() === norm);
  return match ? { slug: match.slug, name: match.name } : null;
}

/** Pick the first specialization the catalog knows about. */
function resolveServiceSlug(specs: string[] | null, services: Service[]): { slug: string; name: string } | null {
  if (!specs) return null;
  for (const sp of specs) {
    const norm = sp.trim().toLowerCase();
    const match = services.find((s) => s.name.trim().toLowerCase() === norm);
    if (match) return { slug: match.slug, name: match.name };
  }
  return null;
}

function formatRating(value: string | null): string | null {
  if (!value) return null;
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(1);
}

/**
 * Build «На платформе 1 год 3 мес.» / «На платформе 5 лет» / «менее месяца».
 * Used to surface the master's tenure as an E-E-A-T signal in the hero meta-line.
 */
function formatPlatformTenure(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null;
  const start = new Date(createdAt);
  if (Number.isNaN(start.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  if (years <= 0 && months <= 0) return "менее месяца";
  if (years === 0) return `${months} мес.`;
  if (months === 0) return `${years} ${pluralYears(years)}`;
  return `${years} ${pluralYears(years)} ${months} мес.`;
}

function pluralYears(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "лет";
  if (mod10 === 1) return "год";
  if (mod10 >= 2 && mod10 <= 4) return "года";
  return "лет";
}

function pluralCompleted(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "заказов";
  if (mod10 === 1) return "заказ";
  if (mod10 >= 2 && mod10 <= 4) return "заказа";
  return "заказов";
}

function formatPrice(from: string | null, to: string | null): string | null {
  const a = from ? parseFloat(from) : NaN;
  const b = to ? parseFloat(to) : NaN;
  if (Number.isFinite(a) && Number.isFinite(b)) return `${formatNumber(a)}–${formatNumber(b)} ₽`;
  if (Number.isFinite(a)) return `от ${formatNumber(a)} ₽`;
  if (Number.isFinite(b)) return `до ${formatNumber(b)} ₽`;
  return null;
}

function formatNumber(n: number): string {
  // 12345 → "12 345" (locale-independent, server-rendered).
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
}

function formatArea(area: string | null): string | null {
  if (!area) return null;
  const n = parseFloat(area);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${formatNumber(n)} м²`;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("ru-RU", { year: "numeric", month: "long" });
}

export default async function MasterPage(
  { params }: { params: Promise<RouteParams> },
) {
  const { slug } = await params;
  const [data, cities, services] = await Promise.all([
    fetchMaster(slug),
    fetchCities(),
    fetchServices(),
  ]);
  if (!data) notFound();

  const { master, stats, portfolio, reviews } = data;
  const displayName = pickDisplayName(master);
  const sourcePageUrl = `${publicUrl()}/master/${slug}`;

  // Resolve a default city/service for the LeadForm. Both fields are
  // required by /api/marketplace/leads (FK validation). If we can't match,
  // fall back to the first active city/service in the catalog so the form
  // is still usable.
  const cityMatch = resolveCitySlug(master.city, cities) ?? (cities[0] ? { slug: cities[0].slug, name: cities[0].name } : null);
  const serviceMatch = resolveServiceSlug(master.specializations, services) ?? (services[0] ? { slug: services[0].slug, name: services[0].name } : null);

  const rating = formatRating(master.publicRating ?? master.rating);
  const reviewsCount = master.publicReviewsCount;
  const yearsExperience = master.yearsExperience;
  const visibleSpecs = (master.specializations ?? []).slice(0, 8);
  const tenure = formatPlatformTenure(master.createdAt);

  // Build a name → slug map of services for clickable specialization chips.
  // Falls back to a non-clickable badge when the master self-declared a
  // specialization that doesn't match the curated catalog.
  const serviceSlugByName = new Map<string, string>();
  for (const s of services) {
    serviceSlugByName.set(s.name.trim().toLowerCase(), s.slug);
  }
  const masterCitySlug = cityMatch?.slug ?? null;

  // ── schema.org JSON-LD ─────────────────────────────────────────────────
  // Built only from trusted server-side data. Reviews come from the
  // backend filtered by `moderation_status = 'approved'`, so embedding
  // them here is safe.
  const breadcrumbsLd = breadcrumbJsonLd([
    { name: "Главная", url: `${publicUrl()}/` },
    { name: displayName, url: sourcePageUrl },
  ]);
  const profileLd = masterProfileJsonLd({
    name: displayName,
    description: master.publicBio ?? null,
    url: sourcePageUrl,
    image: master.avatarUrl ?? null,
    cityName: master.city ?? null,
    knowsAbout: master.specializations ?? [],
    servicePrices: master.servicePrices,
    rating: rating != null && reviewsCount > 0
      ? { ratingValue: rating, reviewCount: reviewsCount }
      : null,
    // Cap embedded reviews at 10 — enough for rich-snippet eligibility
    // without bloating the HTML.
    reviews: reviews.slice(0, 10).map((r) => ({
      authorName: r.clientName,
      rating: r.rating,
      text: r.text,
      createdAt: r.createdAt,
    })),
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLdScript(breadcrumbsLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLdScript(profileLd) }}
      />

      {/* Hero */}
      <section className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <Avatar src={master.avatarUrl} name={displayName} />
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
                {master.city ? <span>{master.city}</span> : null}
                {yearsExperience != null && yearsExperience > 0 ? (
                  <>
                    {master.city ? <span aria-hidden>·</span> : null}
                    <span>опыт {yearsExperience} {pluralYears(yearsExperience)}</span>
                  </>
                ) : null}
                {stats.completedOrders > 0 ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>выполнено {stats.completedOrders} {pluralCompleted(stats.completedOrders)}</span>
                  </>
                ) : null}
                {tenure ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>на платформе {tenure}</span>
                  </>
                ) : null}
                {master.hasContract ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="rounded-full bg-[var(--color-background)] px-2 py-0.5 text-xs text-[var(--color-text)]">
                      Подписан договор
                    </span>
                  </>
                ) : null}
              </div>
              <h1 className="mt-2 text-3xl font-semibold text-[var(--color-text)] sm:text-4xl">
                {displayName}
              </h1>
              {master.publicBio ? (
                <p className="mt-3 max-w-2xl text-base text-[var(--color-muted)]">{master.publicBio}</p>
              ) : null}
              {(rating || reviewsCount > 0) ? (
                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                  {rating ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-background)] px-3 py-1 font-medium text-[var(--color-text)]">
                      <span aria-hidden>★</span>
                      <span>{rating}</span>
                    </span>
                  ) : null}
                  {reviewsCount > 0 ? (
                    <span className="text-[var(--color-muted)]">
                      {reviewsCount} {pluralReviews(reviewsCount)}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {visibleSpecs.length > 0 ? (
                <ul className="mt-5 flex flex-wrap gap-2">
                  {visibleSpecs.map((s) => {
                    const slug = serviceSlugByName.get(s.trim().toLowerCase());
                    const linkable = slug && masterCitySlug;
                    if (linkable) {
                      return (
                        <li key={s}>
                          <Link
                            href={`/${slug}/${masterCitySlug}`}
                            className="block rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1 text-sm text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                          >
                            {s}
                          </Link>
                        </li>
                      );
                    }
                    return (
                      <li
                        key={s}
                        className="rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1 text-sm text-[var(--color-text)]"
                      >
                        {s}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* Portfolio + Form */}
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="grid gap-8 lg:grid-cols-[1.3fr,1fr]">
          {/* Portfolio + reviews — main column */}
          <div className="grid gap-10 lg:order-1">
            {/* Service prices */}
            {master.servicePrices.length > 0 ? (
              <div>
                <h2 className="text-2xl font-semibold text-[var(--color-text)]">Цены на услуги</h2>
                <p className="mt-1 text-sm text-[var(--color-muted)]">
                  Финальная стоимость зависит от задачи. Уточните при заявке.
                </p>
                <ul className="mt-6 divide-y divide-[var(--color-border)] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
                  {master.servicePrices.map((p, i) => {
                    const slug = serviceSlugByName.get(p.service.trim().toLowerCase());
                    const linkable = slug && masterCitySlug;
                    const inner = (
                      <div className="flex items-center justify-between gap-4 p-4">
                        <span className="text-[var(--color-text)]">{p.service}</span>
                        <span className="font-semibold text-[var(--color-text)] whitespace-nowrap">
                          от {formatNumber(p.priceFrom)} ₽
                        </span>
                      </div>
                    );
                    return (
                      <li key={`${p.service}-${i}`}>
                        {linkable ? (
                          <Link
                            href={`/${slug}/${masterCitySlug}`}
                            className="block hover:bg-[var(--color-background)]"
                          >
                            {inner}
                          </Link>
                        ) : inner}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {/* Portfolio */}
            {portfolio.length > 0 ? (
              <div>
                <h2 className="text-2xl font-semibold text-[var(--color-text)]">Работы мастера</h2>
                <ul className="mt-6 grid gap-4 sm:grid-cols-2">
                  {portfolio.map((p) => (
                    <PortfolioCard key={p.id} item={p} />
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-muted)]">
                Мастер ещё не опубликовал работы. Оставьте заявку — обсудите задачу напрямую.
              </div>
            )}

            {/* Reviews */}
            {reviews.length > 0 ? (
              <div>
                <h2 className="text-2xl font-semibold text-[var(--color-text)]">Отзывы клиентов</h2>
                <ul className="mt-6 grid gap-4 sm:grid-cols-2">
                  {reviews.map((r) => (
                    <ReviewCard key={r.id} review={r} />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {/* Lead form — sticky on desktop, top on mobile */}
          <aside className="lg:order-2">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-6 lg:sticky lg:top-6">
              <h2 className="text-xl font-semibold text-[var(--color-text)] sm:text-2xl">
                Связаться с мастером
              </h2>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                Перезвоним в течение часа в рабочее время.
              </p>
              <div className="mt-5">
                {cityMatch && serviceMatch ? (
                  <LeadForm
                    citySlug={cityMatch.slug}
                    serviceSlug={serviceMatch.slug}
                    sourcePageUrl={sourcePageUrl}
                    attachedMasterId={master.id}
                    attachedMasterTitle={displayName}
                  />
                ) : (
                  <div className="text-sm text-[var(--color-muted)]">
                    Прямая заявка временно недоступна. Перейдите{" "}
                    <Link href="/uslugi" className="underline hover:text-[var(--color-primary)]">
                      в каталог услуг
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

function pluralReviews(n: number): string {
  // Russian plural for "отзыв": 1 отзыв, 2-4 отзыва, 5+ отзывов; 11-14 — отзывов.
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "отзывов";
  if (mod10 === 1) return "отзыв";
  if (mod10 >= 2 && mod10 <= 4) return "отзыва";
  return "отзывов";
}

function Avatar({ src, name }: { src: string | null; name: string }) {
  if (src) {
    return (
      // Raw <img>: avatars come from arbitrary R2/S3 hosts that aren't
      // pre-configured in next.config; next/image would refuse them.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        loading="eager"
        className="h-24 w-24 flex-none rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] object-cover"
      />
    );
  }
  // Initials fallback so the layout never collapses.
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <div
      aria-hidden
      className="flex h-24 w-24 flex-none items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-primary)] text-2xl font-semibold text-white"
    >
      {initials || "М"}
    </div>
  );
}

function PortfolioCard({ item }: { item: MasterPortfolioItem }) {
  const before = item.beforePhotos[0] ?? null;
  const after = item.afterPhotos[0] ?? null;
  const price = formatPrice(item.priceFrom, item.priceTo);
  const area = formatArea(item.area);
  const completedAt = formatDate(item.completedAt);

  return (
    <li className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      {(before || after) ? (
        <div className="grid grid-cols-2 gap-1 bg-[var(--color-background)]">
          <PortfolioPhoto src={before} label="До" />
          <PortfolioPhoto src={after} label="После" />
        </div>
      ) : null}
      <div className="p-5">
        <div className="text-base font-medium text-[var(--color-text)]">{item.title}</div>
        {item.description ? (
          <p className="mt-1 text-sm text-[var(--color-muted)]">{item.description}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--color-muted)]">
          {item.service?.slug && item.city?.slug ? (
            <Link
              href={`/${item.service.slug}/${item.city.slug}`}
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-[var(--color-text)] hover:border-[var(--color-primary)]"
            >
              {item.service.name}, {item.city.name}
            </Link>
          ) : item.service?.name ? (
            <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-[var(--color-text)]">
              {item.service.name}
            </span>
          ) : null}
          {price ? (
            <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-[var(--color-text)]">
              {price}
            </span>
          ) : null}
          {area ? (
            <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-[var(--color-text)]">
              {area}
            </span>
          ) : null}
          {completedAt ? <span>{completedAt}</span> : null}
        </div>
      </div>
    </li>
  );
}

function PortfolioPhoto({ src, label }: { src: string | null; label: string }) {
  if (!src) {
    return (
      <div className="relative aspect-[4/3] w-full">
        <div className="flex h-full w-full items-center justify-center text-xs text-[var(--color-muted)]">
          {label}
        </div>
      </div>
    );
  }
  return (
    <div className="relative aspect-[4/3] w-full">
      {/* Raw <img>: portfolio photos come from many remote hosts. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={label} loading="lazy" className="block h-full w-full object-cover" />
      <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
        {label}
      </span>
    </div>
  );
}

function ReviewCard({ review }: { review: MasterPublicReview }) {
  const date = formatDate(review.createdAt);
  return (
    <li className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <div>
          <div className="font-medium text-[var(--color-text)]">{review.clientName}</div>
          {review.clientCity ? (
            <div className="text-xs text-[var(--color-muted)]">{review.clientCity}</div>
          ) : null}
        </div>
        <div className="inline-flex items-center gap-1 rounded-full bg-[var(--color-background)] px-2 py-1 text-xs font-medium text-[var(--color-text)]">
          <span aria-hidden>★</span>
          <span>{review.rating}</span>
        </div>
      </div>
      <p className="mt-3 text-sm text-[var(--color-text)]">{review.text}</p>
      {date ? <div className="mt-3 text-xs text-[var(--color-muted)]">{date}</div> : null}
    </li>
  );
}
