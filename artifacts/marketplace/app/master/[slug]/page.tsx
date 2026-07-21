import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { fetchCities, fetchMaster, fetchMasters, fetchServices } from "../../../lib/api";
import { publicUrl } from "../../../lib/env";
import { LeadForm } from "../../../components/LeadForm";
import { MasterCard } from "../../../components/MasterCard";
import { MasterOwnerBar } from "../../../components/owner/MasterOwnerBar";
import {
  breadcrumbJsonLd,
  masterProfileJsonLd,
  toJsonLdScript,
} from "../../../lib/jsonLd";
import {
  buildMasterMeta,
  buildPortfolioImageAlt,
  buildMasterAvatarAlt,
} from "../../../lib/seoMeta";
import type {
  City,
  Master,
  MasterPortfolioItem,
  MasterPublicReview,
  Service,
} from "../../../lib/types";

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
  const meta = buildMasterMeta(data.master, data.stats);
  return {
    title: { absolute: meta.title },
    description: meta.description,
    alternates: { canonical: `${publicUrl()}${path}` },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pickDisplayName(m: { publicTitle: string | null; alias: string | null; id: number }): string {
  if (m.publicTitle && m.publicTitle.trim().length > 0) return m.publicTitle.trim();
  if (m.alias && m.alias.trim().length > 0) return m.alias.trim();
  return `Мастер #${m.id}`;
}

function resolveCitySlug(masterCity: string | null, cities: City[]): { slug: string; name: string } | null {
  if (!masterCity) return null;
  const norm = masterCity.trim().toLowerCase();
  const match = cities.find((c) => c.name.trim().toLowerCase() === norm);
  return match ? { slug: match.slug, name: match.name } : null;
}

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

function pluralReviews(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "отзывов";
  if (mod10 === 1) return "отзыв";
  if (mod10 >= 2 && mod10 <= 4) return "отзыва";
  return "отзывов";
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
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
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

/** Pick the best hero photo from the master's portfolio. */
function pickCoverPhoto(portfolio: MasterPortfolioItem[]): string | null {
  // Prefer featured items first, then by sortOrder, then most-recent.
  const sorted = [...portfolio].sort((a, b) => {
    if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return 0;
  });
  for (const p of sorted) {
    if (p.afterPhotos[0]) return p.afterPhotos[0];
    if (p.beforePhotos[0]) return p.beforePhotos[0];
  }
  return null;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function MasterPage(
  { params }: { params: Promise<RouteParams> },
) {
  const { slug } = await params;
  const [data, cities, services] = await Promise.all([
    fetchMaster(slug),
    fetchCities().catch(() => [] as City[]),
    fetchServices().catch(() => [] as Service[]),
  ]);
  if (!data) notFound();

  const { master, stats, portfolio, reviews } = data;
  const displayName = pickDisplayName(master);
  const sourcePageUrl = `${publicUrl()}/master/${slug}`;

  const cityMatch = resolveCitySlug(master.city, cities);
  const cityFallback = cityMatch ?? (cities[0] ? { slug: cities[0].slug, name: cities[0].name } : null);
  const serviceMatch = resolveServiceSlug(master.specializations, services);
  const serviceFallback = serviceMatch ?? (services[0] ? { slug: services[0].slug, name: services[0].name } : null);

  // Fetch up to 5 similar masters in the same city (excluding current). One
  // extra so we can drop the current master and still have 4 candidates.
  const similarMasters = cityMatch
    ? await fetchMasters({ citySlug: cityMatch.slug, limit: 5 })
        .then((r) => r.items.filter((m) => m.id !== master.id).slice(0, 4))
        .catch(() => [] as Master[])
    : [];

  const coverPhoto = pickCoverPhoto(portfolio);
  const rating = formatRating(master.publicRating ?? master.rating);
  const reviewsCount = master.publicReviewsCount;
  const tenure = formatPlatformTenure(master.createdAt);
  const visibleSpecs = (master.specializations ?? []).slice(0, 8);

  // Service slug map for clickable specialization chips and price rows.
  const serviceSlugByName = new Map<string, string>();
  for (const s of services) serviceSlugByName.set(s.name.trim().toLowerCase(), s.slug);
  const masterCitySlug = cityMatch?.slug ?? null;

  // ── schema.org JSON-LD ─────────────────────────────────────────────────────
  const breadcrumbsLd = breadcrumbJsonLd([
    { name: "Главная", url: `${publicUrl()}/` },
    { name: "Мастера", url: `${publicUrl()}/mastera` },
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
    reviews: reviews.slice(0, 10).map((r) => ({
      authorName: r.clientName,
      rating: r.rating,
      text: r.text,
      createdAt: r.createdAt,
    })),
  });

  return (
    <>
      {/* real-price 5.4: inline Owner_Mode controls when the owning master views their own profile. */}
      <MasterOwnerBar ownerMasterId={master.id} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLdScript(breadcrumbsLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLdScript(profileLd) }}
      />

      {/* ── Hero band ── */}
      <MasterHero
        master={master}
        displayName={displayName}
        coverPhoto={coverPhoto}
        rating={rating}
        reviewsCount={reviewsCount}
        completedOrders={stats.completedOrders}
        tenure={tenure}
      />

      {/* ── Portfolio masonry ── */}
      {portfolio.length > 0 ? (
        <MasterPortfolio portfolio={portfolio} />
      ) : null}

      {/* ── About + lead form (two-column) ── */}
      <section className="border-y border-[var(--color-border)] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:gap-12">
            <div className="space-y-10">
              {/* About + bio */}
              {master.publicBio || visibleSpecs.length > 0 ? (
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
                    О мастере
                  </h2>
                  {master.publicBio ? (
                    <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-[var(--color-text)]">
                      {master.publicBio}
                    </p>
                  ) : null}
                  {visibleSpecs.length > 0 ? (
                    <div className="mt-6">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                        Специализации
                      </p>
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {visibleSpecs.map((s) => {
                          const sSlug = serviceSlugByName.get(s.trim().toLowerCase());
                          if (sSlug && masterCitySlug) {
                            return (
                              <li key={s}>
                                <Link
                                  href={`/${sSlug}/${masterCitySlug}`}
                                  className="inline-block rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-sm text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                                >
                                  {s}
                                </Link>
                              </li>
                            );
                          }
                          return (
                            <li
                              key={s}
                              className="inline-block rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-sm text-[var(--color-text)]"
                            >
                              {s}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Service prices */}
              {master.servicePrices.length > 0 ? (
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
                    Цены на услуги
                  </h2>
                  <p className="mt-2 text-sm text-[var(--color-muted)]">
                    Точная стоимость зависит от задачи — уточните при заявке. Можно сравнить с{" "}
                    <Link href="/kalkulyator" className="font-medium text-[var(--color-primary)] hover:underline">
                      калькулятором по региону
                    </Link>
                    .
                  </p>
                  <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                    {master.servicePrices.map((p, i) => {
                      const sSlug = serviceSlugByName.get(p.service.trim().toLowerCase());
                      const linkable = sSlug && masterCitySlug;
                      const inner = (
                        <div className="flex h-full items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3.5 transition group-hover:border-[var(--color-primary)]">
                          <span className="line-clamp-2 text-sm font-medium text-[var(--color-text)]">
                            {p.service}
                          </span>
                          <span className="whitespace-nowrap text-sm font-bold text-[var(--color-primary)]">
                            от {formatNumber(p.priceFrom)} ₽
                          </span>
                        </div>
                      );
                      return (
                        <li key={`${p.service}-${i}`}>
                          {linkable ? (
                            <Link href={`/${sSlug}/${masterCitySlug}`} className="group block h-full">
                              {inner}
                            </Link>
                          ) : (
                            <div className="group">{inner}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {/* Reviews */}
              {reviews.length > 0 ? (
                <div>
                  <div className="flex items-end justify-between gap-3">
                    <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
                      Отзывы клиентов
                    </h2>
                    <span className="text-sm text-[var(--color-muted)]">
                      {reviews.length} {pluralReviews(reviews.length)}
                    </span>
                  </div>
                  <ul className="mt-6 grid gap-4 sm:grid-cols-2">
                    {reviews.map((r) => (
                      <ReviewCard key={r.id} review={r} />
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            {/* Sticky lead form */}
            <aside>
              <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm sm:p-6 lg:sticky lg:top-20">
                <h2 id="lead-form" className="text-xl font-bold tracking-tight text-[var(--color-text)] sm:text-2xl">
                  Связаться с {displayName}
                </h2>
                <p className="mt-2 text-sm text-[var(--color-muted)]">
                  Опишите задачу — мастер свяжется в течение часа в рабочее время.
                  Можно прикрепить фото объекта.
                </p>
                <div className="mt-5">
                  {cityFallback && serviceFallback ? (
                    <LeadForm
                      citySlug={cityFallback.slug}
                      serviceSlug={serviceFallback.slug}
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
                      .
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* ── Similar masters ── */}
      {similarMasters.length >= 3 ? (
        <section className="bg-[var(--color-background)]">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
            <div className="flex items-end justify-between gap-3">
              <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
                Другие мастера {master.city ? `в городе ${master.city}` : ""}
              </h2>
              {cityMatch ? (
                <Link
                  href={`/mastera?city=${encodeURIComponent(cityMatch.slug)}`}
                  className="hidden text-sm font-semibold text-[var(--color-primary)] hover:underline sm:inline"
                >
                  Все →
                </Link>
              ) : null}
            </div>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
              {similarMasters.map((m) => (
                <li key={m.id}>
                  <MasterCard master={m} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

interface HeroProps {
  master: Master;
  displayName: string;
  coverPhoto: string | null;
  rating: string | null;
  reviewsCount: number;
  completedOrders: number;
  tenure: string | null;
}

function MasterHero({
  master,
  displayName,
  coverPhoto,
  rating,
  reviewsCount,
  completedOrders,
  tenure,
}: HeroProps) {
  return (
    <section className="bg-[var(--color-surface)]">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <nav className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
          <Link href="/" className="hover:text-[var(--color-text)]">Главная</Link>
          <span aria-hidden>/</span>
          <Link href="/mastera" className="hover:text-[var(--color-text)]">Мастера</Link>
          <span aria-hidden>/</span>
          <span className="text-[var(--color-text)]">{displayName}</span>
        </nav>

        <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-start">
          <Avatar src={master.avatarUrl} name={displayName} alt={buildMasterAvatarAlt(master)} />
          <div className="min-w-0 flex-1">
            {master.city ? (
              <p className="text-sm font-medium text-[var(--color-muted)]">{master.city}</p>
            ) : null}
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
              {displayName}
            </h1>
            {master.publicTitle ? (
              <p className="mt-2 max-w-2xl text-base text-[var(--color-muted)] sm:text-lg">
                {master.publicTitle}
              </p>
            ) : null}

            {/* Inline meta strip */}
            <div className="mt-5 flex flex-wrap items-baseline gap-x-5 gap-y-2 text-sm text-[var(--color-muted)]">
              {rating ? (
                <span className="inline-flex items-baseline gap-1">
                  <span aria-hidden className="text-[var(--color-primary)]">★</span>
                  <span className="font-semibold text-[var(--color-text)]">{rating}</span>
                  {reviewsCount > 0 ? (
                    <span className="text-[var(--color-muted)]">· {reviewsCount} {pluralReviews(reviewsCount)}</span>
                  ) : null}
                </span>
              ) : null}
              {completedOrders > 0 ? (
                <span>
                  <span className="font-semibold text-[var(--color-text)]">{completedOrders}</span>{" "}
                  {pluralCompleted(completedOrders)}
                </span>
              ) : null}
              {master.yearsExperience != null && master.yearsExperience > 0 ? (
                <span>
                  опыт{" "}
                  <span className="font-semibold text-[var(--color-text)]">
                    {master.yearsExperience} {pluralYears(master.yearsExperience)}
                  </span>
                </span>
              ) : null}
              {tenure ? (
                <span>
                  на платформе{" "}
                  <span className="font-semibold text-[var(--color-text)]">{tenure}</span>
                </span>
              ) : null}
            </div>

            {/* Trust badges */}
            {master.hasContract ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge label="Подписан договор" tone="emerald" />
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="#lead-form"
                className="inline-flex h-11 items-center gap-2 rounded-md bg-[var(--color-cta)] px-5 text-sm font-semibold text-[var(--color-on-cta)] transition hover:bg-[var(--color-cta-hover)]"
              >
                Получить смету
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </Link>
              <Link
                href="/kalkulyator"
                className="inline-flex h-11 items-center rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-5 text-sm font-semibold text-[var(--color-text)] transition hover:border-[var(--color-text)]"
              >
                Прикинуть бюджет
              </Link>
            </div>
          </div>

          {/* Cover photo as side card on desktop, hidden on mobile */}
          {coverPhoto ? (
            <div className="hidden aspect-[4/3] w-72 flex-shrink-0 overflow-hidden rounded-lg bg-[var(--color-border)] shadow-cozy lg:block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverPhoto}
                alt={`Работа мастера ${displayName}`}
                loading="eager"
                className="h-full w-full object-cover"
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Badge({ label, tone }: { label: string; tone: "emerald" | "indigo" | "amber" }) {
  const cls =
    tone === "emerald"
      ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]"
      : tone === "indigo"
        ? "bg-blue-50 text-blue-700"
        : "bg-amber-50 text-amber-900";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20 6 9 17l-5-5" />
      </svg>
      {label}
    </span>
  );
}

function Avatar({ src, name, alt }: { src: string | null; name: string; alt?: string }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt ?? name}
        loading="eager"
        className="h-20 w-20 flex-none rounded-lg bg-[var(--color-border)] object-cover sm:h-24 sm:w-24"
      />
    );
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <div
      aria-hidden
      className="flex h-20 w-20 flex-none items-center justify-center rounded-lg bg-[var(--color-primary)] text-2xl font-bold text-white sm:h-24 sm:w-24 sm:text-3xl"
    >
      {initials || "М"}
    </div>
  );
}

// ── Portfolio masonry ────────────────────────────────────────────────────────

function MasterPortfolio({ portfolio }: { portfolio: MasterPortfolioItem[] }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-secondary)]">
            Работы
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
            Реальные ремонты этого мастера
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-[var(--color-muted)]">
            Фото до и после, цены и сроки. Кликните по работе — увидите детали и сможете заказать похожий проект.
          </p>
        </div>
        <span className="hidden text-sm text-[var(--color-muted)] sm:block">
          {portfolio.length} {portfolio.length === 1 ? "работа" : "работ"}
        </span>
      </div>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {portfolio.map((p) => (
          <PortfolioCard key={p.id} item={p} />
        ))}
      </ul>
    </section>
  );
}

function PortfolioCard({ item }: { item: MasterPortfolioItem }) {
  const after = item.afterPhotos[0] ?? null;
  const before = item.beforePhotos[0] ?? null;
  const hero = after ?? before ?? null;
  const price = formatPrice(item.priceFrom, item.priceTo);
  const area = formatArea(item.area);
  const completedAt = formatDate(item.completedAt);

  const card = (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl hover:border-[var(--color-secondary)]">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--color-background)]">
        {hero ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hero}
            alt={buildPortfolioImageAlt(item, after ? "after" : "before", 0)}
            loading="lazy"
            className="block h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-[var(--color-muted)]">
            Без фото
          </div>
        )}

        {/* Featured badge */}
        {item.isFeatured ? (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="m12 2 3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z" />
            </svg>
            Топ
          </span>
        ) : null}

        {/* Before-photo peek on hover (when both photos present) */}
        {before && after ? (
          <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text)] backdrop-blur">
              До · После
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="line-clamp-2 text-base font-semibold leading-snug text-[var(--color-text)] group-hover:text-[var(--color-secondary)]">
          {item.title}
        </h3>
        {item.description ? (
          <p className="mt-2 line-clamp-2 text-sm text-[var(--color-muted)]">{item.description}</p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-[var(--color-muted)]">
          {item.service?.name ? <Chip>{item.service.name}</Chip> : null}
          {item.city?.name ? <Chip>{item.city.name}</Chip> : null}
          {area ? <Chip>{area}</Chip> : null}
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          {price ? (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
                Стоимость
              </p>
              <p className="text-base font-bold text-[var(--color-text)]">{price}</p>
            </div>
          ) : <span />}
          {completedAt ? (
            <p className="text-xs text-[var(--color-muted)]">Завершено {completedAt}</p>
          ) : null}
        </div>
      </div>
    </article>
  );

  if (item.slug) {
    return (
      <li>
        <Link href={`/raboty/${item.slug}`} className="block h-full">
          {card}
        </Link>
      </li>
    );
  }
  return <li>{card}</li>;
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[var(--color-background)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text)]">
      {children}
    </span>
  );
}

// ── Review card ──────────────────────────────────────────────────────────────

function ReviewCard({ review }: { review: MasterPublicReview }) {
  const date = formatDate(review.createdAt);
  return (
    <li className="flex h-full flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-1 text-sm font-semibold text-[var(--color-text)]">
            {review.clientName}
          </p>
          {review.clientCity ? (
            <p className="text-xs text-[var(--color-muted)]">{review.clientCity}</p>
          ) : null}
        </div>
        <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-[var(--color-accent-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-accent-hover)]">
          <span aria-hidden>★</span>
          <span>{review.rating}</span>
        </span>
      </div>
      <p className="flex-1 text-sm leading-relaxed text-[var(--color-text)]">{review.text}</p>
      {review.photos.length > 0 ? (
        <ul className="flex gap-2">
          {review.photos.slice(0, 3).map((url, i) => (
            <li key={i}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Фото к отзыву ${review.clientName}`}
                loading="lazy"
                className="h-16 w-16 rounded-lg border border-[var(--color-border)] object-cover"
              />
            </li>
          ))}
        </ul>
      ) : null}
      {date ? <p className="text-xs text-[var(--color-muted)]">{date}</p> : null}
    </li>
  );
}
