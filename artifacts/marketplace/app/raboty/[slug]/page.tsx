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
import {
  buildCaseMeta,
  buildPortfolioImageAlt,
  buildMasterAvatarAlt,
} from "../../../lib/seoMeta";
import type {
  Master,
  RabotyDetailResponse,
  RabotySimilarItem,
} from "../../../lib/types";

/**
 * Standalone portfolio case page — `/raboty/[slug]`.
 *
 * Houzz-model first-class SEO asset (plan §11.7). Each published case is
 * its own indexable page with a self-contained CreativeWork + Service+Offer
 * schema. This V1.5 redesign moves the visuals first (cover hero, dramatic
 * before/after pairing, full gallery rail), then context (description,
 * author card, client review), then the conversion paths (similar cases,
 * sticky lead form, calculator deep-link).
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function pickMasterDisplayName(m: { publicTitle: string | null; alias: string | null; id: number }): string {
  if (m.publicTitle && m.publicTitle.trim().length > 0) return m.publicTitle.trim();
  if (m.alias && m.alias.trim().length > 0) return m.alias.trim();
  return `Мастер #${m.id}`;
}

function formatNumber(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
}

function parseNumeric(value: string | null | undefined): number | null {
  if (value == null) return null;
  const n = parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatPriceRange(from: string | null, to: string | null): { range: string | null; total: number | null } {
  const a = parseNumeric(from);
  const b = parseNumeric(to);
  if (a != null && b != null && a !== b) return { range: `${formatNumber(a)}–${formatNumber(b)} ₽`, total: a };
  if (a != null) return { range: `от ${formatNumber(a)} ₽`, total: a };
  if (b != null) return { range: `до ${formatNumber(b)} ₽`, total: b };
  return { range: null, total: null };
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("ru-RU", { year: "numeric", month: "long" });
}

function formatRating(value: string | null): string | null {
  if (!value) return null;
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(1);
}

function pluralReviews(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "отзывов";
  if (mod10 === 1) return "отзыв";
  if (mod10 >= 2 && mod10 <= 4) return "отзыва";
  return "отзывов";
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function RabotyCasePage(
  { params }: { params: Promise<RouteParams> },
) {
  const { slug } = await params;
  const [data, cities, services] = await Promise.all([
    fetchRabotyCase(slug),
    fetchCities().catch(() => []),
    fetchServices().catch(() => []),
  ]);
  if (!data) notFound();

  const { portfolio, master, similar } = data;
  const masterName = pickMasterDisplayName(master);
  const sourcePageUrl = `${publicUrl()}/raboty/${slug}`;

  const cityName = portfolio.city?.name ?? master.city ?? null;
  const areaNum = parseNumeric(portfolio.area);
  const completedAtFormatted = formatDate(portfolio.completedAt);
  const { range: priceRange, total: priceTotalNum } = formatPriceRange(portfolio.priceFrom, portfolio.priceTo);
  const cover = portfolio.afterPhotos[0] ?? portfolio.beforePhotos[0] ?? null;

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

  const allPhotoUrls = [
    ...portfolio.afterPhotos,
    ...portfolio.beforePhotos,
  ];

  // ── JSON-LD ─────────────────────────────────────────────────────────────────
  const breadcrumbsLd = breadcrumbJsonLd([
    { name: "Главная", url: `${publicUrl()}/` },
    { name: "Работы", url: `${publicUrl()}/raboty` },
    { name: portfolio.title, url: sourcePageUrl },
  ]);

  const caseLd = caseJsonLd({
    url: sourcePageUrl,
    title: portfolio.title,
    description: portfolio.description,
    coverImageUrl: cover,
    imageUrls: allPhotoUrls,
    completedAt: portfolio.completedAt,
    areaSqm: areaNum,
    priceTotal: priceTotalNum,
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

      {/* ── Cover hero ── */}
      <CaseHero
        portfolio={portfolio}
        cityName={cityName}
        completedAt={completedAtFormatted}
        priceRange={priceRange}
        areaNum={areaNum}
      />

      {/* ── Before / After dramatic pairing ── */}
      <BeforeAfterPair
        title={portfolio.title}
        beforePhotos={portfolio.beforePhotos}
        afterPhotos={portfolio.afterPhotos}
        city={portfolio.city}
      />

      {/* ── Description + extra gallery + author + review + similar ── */}
      <section className="border-t border-[var(--color-border)] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:gap-12">
            <div className="space-y-12">
              {/* Description */}
              {portfolio.description ? (
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
                    Что было сделано
                  </h2>
                  <div className="mt-4 whitespace-pre-line text-base leading-relaxed text-[var(--color-text)]">
                    {portfolio.description}
                  </div>
                </div>
              ) : null}

              {/* Extra gallery */}
              <ExtraGallery
                title={portfolio.title}
                city={portfolio.city}
                beforePhotos={portfolio.beforePhotos}
                afterPhotos={portfolio.afterPhotos}
              />

              {/* Master / author */}
              <MasterAuthorCard master={master} masterName={masterName} />

              {/* Client review */}
              {portfolio.clientReviewText && portfolio.clientRating ? (
                <ClientReview text={portfolio.clientReviewText} rating={portfolio.clientRating} />
              ) : null}

              {/* Calculator deep-link */}
              {areaNum != null && portfolio.city?.slug ? (
                <CalculatorTeaser areaSqm={areaNum} citySlug={portfolio.city.slug} />
              ) : null}
            </div>

            {/* ── Sticky lead form ── */}
            <aside>
              <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-md sm:p-6 lg:sticky lg:top-20">
                <h2 id="lead-form" className="text-xl font-bold tracking-tight text-[var(--color-text)] sm:text-2xl">
                  Хочу такую же
                </h2>
                <p className="mt-2 text-sm text-[var(--color-muted)]">
                  Заявка уйдёт автору работы первой. Если не возьмёт за 30 минут —
                  передадим похожим мастерам.
                </p>
                <ul className="mt-3 space-y-1 text-xs text-[var(--color-muted)]">
                  {portfolio.service?.name ? (
                    <li className="flex items-center gap-1.5">
                      <CheckIcon /> Услуга: {portfolio.service.name}
                    </li>
                  ) : null}
                  {cityName ? (
                    <li className="flex items-center gap-1.5">
                      <CheckIcon /> Город: {cityName}
                    </li>
                  ) : null}
                  {areaNum != null ? (
                    <li className="flex items-center gap-1.5">
                      <CheckIcon /> Площадь референса: {areaNum} м²
                    </li>
                  ) : null}
                </ul>
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
                      <Link
                        href={master.slug ? `/master/${master.slug}` : "/mastera"}
                        className="underline hover:text-[var(--color-primary)]"
                      >
                        на страницу мастера
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

      {/* ── Similar cases ── */}
      {similar.length >= 3 ? (
        <SimilarCases similar={similar} />
      ) : null}
    </>
  );
}

// ── Cover hero ───────────────────────────────────────────────────────────────

function CaseHero({
  portfolio,
  cityName,
  completedAt,
  priceRange,
  areaNum,
}: {
  portfolio: RabotyDetailResponse["portfolio"];
  cityName: string | null;
  completedAt: string | null;
  priceRange: string | null;
  areaNum: number | null;
}) {
  const cover = portfolio.afterPhotos[0] ?? portfolio.beforePhotos[0] ?? null;
  return (
    <section className="relative overflow-hidden bg-[var(--color-text)]">
      {cover ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover opacity-55"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/55 to-black/85" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-secondary)]/95 to-[var(--color-secondary-hover)]" />
      )}

      <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
        {/* Breadcrumbs */}
        <nav className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/70">
          <Link href="/" className="hover:text-white">Главная</Link>
          <span aria-hidden>/</span>
          <Link href="/raboty" className="hover:text-white">Работы</Link>
          {portfolio.service?.name ? (
            <>
              <span aria-hidden>/</span>
              <span className="text-white/85">{portfolio.service.name}</span>
            </>
          ) : null}
          {cityName ? (
            <>
              <span aria-hidden>/</span>
              <span className="text-white/85">{cityName}</span>
            </>
          ) : null}
        </nav>

        {/* Eyebrow tags */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {portfolio.service?.name ? (
            <Tag tone="indigo">{portfolio.service.name}</Tag>
          ) : null}
          {cityName ? <Tag tone="primary">{cityName}</Tag> : null}
          {portfolio.isFeatured ? <Tag tone="amber">Рекомендуем</Tag> : null}
        </div>

        <h1 className="mt-4 max-w-4xl text-3xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
          {portfolio.title}
        </h1>

        {/* Stats strip */}
        <dl className="mt-8 flex flex-wrap items-end gap-x-10 gap-y-5 border-t border-white/10 pt-6 text-white">
          {priceRange ? (
            <Stat label="Стоимость" value={priceRange} large />
          ) : null}
          {areaNum != null ? (
            <Stat label="Площадь" value={`${formatNumber(areaNum)} м²`} large />
          ) : null}
          {completedAt ? (
            <Stat label="Завершено" value={completedAt} />
          ) : null}
        </dl>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="#lead-form"
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--color-primary)] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-primary-hover)]"
          >
            Получить такую же
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </Link>
          <Link
            href="/kalkulyator"
            className="inline-flex h-12 items-center rounded-xl border border-white/30 bg-white/10 px-5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
          >
            Калькулятор
          </Link>
        </div>
      </div>
    </section>
  );
}

function Tag({ tone, children }: { tone: "indigo" | "primary" | "amber"; children: React.ReactNode }) {
  const cls =
    tone === "indigo"
      ? "bg-[var(--color-secondary)] text-white"
      : tone === "amber"
        ? "bg-[var(--color-accent)] text-white"
        : "bg-[var(--color-primary)] text-white";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 font-bold uppercase tracking-wider shadow-sm ${cls}`}>
      {children}
    </span>
  );
}

function Stat({ label, value, large }: { label: string; value: string; large?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-white/55">{label}</dt>
      <dd className={`mt-1 font-bold tracking-tight ${large ? "text-2xl sm:text-3xl" : "text-base"}`}>{value}</dd>
    </div>
  );
}

// ── Before / After ───────────────────────────────────────────────────────────

function BeforeAfterPair({
  title,
  beforePhotos,
  afterPhotos,
  city,
}: {
  title: string;
  beforePhotos: string[];
  afterPhotos: string[];
  city: { name: string; slug: string | null } | null;
}) {
  const before = beforePhotos[0] ?? null;
  const after = afterPhotos[0] ?? null;
  if (!before && !after) return null;

  const portfolioRef = { title, city };
  const beforeAlt = before ? buildPortfolioImageAlt(portfolioRef, "before", 0) : "";
  const afterAlt = after ? buildPortfolioImageAlt(portfolioRef, "after", 0) : "";

  return (
    <section className="bg-[var(--color-background)] py-10 sm:py-14">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          <PairTile src={before} label="До" tone="muted" alt={beforeAlt} />
          <PairTile src={after} label="После" tone="primary" alt={afterAlt} />
        </div>
        {before && after ? (
          <p className="mt-4 text-center text-xs text-[var(--color-muted)]">
            Слева — состояние до работ, справа — финальный результат.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function PairTile({ src, label, tone, alt }: { src: string | null; label: string; tone: "muted" | "primary"; alt: string }) {
  const labelCls = tone === "primary"
    ? "bg-[var(--color-primary)] text-white"
    : "bg-white/95 text-[var(--color-text)]";

  if (!src) {
    return (
      <div className="relative flex aspect-[4/3] items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-white text-sm text-[var(--color-muted)]">
        <span className={`absolute left-3 top-3 inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${labelCls}`}>
          {label}
        </span>
        Фото отсутствует
      </div>
    );
  }
  return (
    <figure className="group relative aspect-[4/3] overflow-hidden rounded-2xl bg-[var(--color-text)] shadow-md ring-1 ring-black/5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="eager"
        className="block h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
      />
      <span className={`absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider shadow ${labelCls}`}>
        {label}
      </span>
    </figure>
  );
}

// ── Extra gallery ────────────────────────────────────────────────────────────

function ExtraGallery({
  title,
  city,
  beforePhotos,
  afterPhotos,
}: {
  title: string;
  city: { name: string; slug: string | null } | null;
  beforePhotos: string[];
  afterPhotos: string[];
}) {
  // First photo of each set is in the BeforeAfterPair already; use the rest.
  const remaining: { url: string; type: "before" | "after"; idx: number }[] = [
    ...afterPhotos.slice(1).map((url, i) => ({ url, type: "after" as const, idx: i + 1 })),
    ...beforePhotos.slice(1).map((url, i) => ({ url, type: "before" as const, idx: i + 1 })),
  ];

  if (remaining.length === 0) return null;

  return (
    <div>
      <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
        Ещё фото с объекта
      </h2>
      <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {remaining.slice(0, 9).map((item, i) => (
          <li
            key={`${item.url}-${i}`}
            className="aspect-[4/3] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.url}
              alt={buildPortfolioImageAlt({ title, city }, item.type, item.idx)}
              loading="lazy"
              className="block h-full w-full object-cover transition-transform duration-300 hover:scale-[1.05]"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Author / Master card ─────────────────────────────────────────────────────

function MasterAuthorCard({
  master,
  masterName,
}: {
  master: RabotyDetailResponse["master"];
  masterName: string;
}) {
  const rating = formatRating(master.publicRating ?? master.rating);
  const reviewsCount = master.publicReviewsCount;
  const initials = masterName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "М";

  return (
    <div>
      <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
        Автор работы
      </h2>
      <Link
        href={master.slug ? `/master/${master.slug}` : "/mastera"}
        className="group mt-4 flex items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm transition hover:border-[var(--color-primary)] hover:shadow-md sm:p-6"
      >
        {master.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={master.avatarUrl}
            alt={buildMasterAvatarAlt(master)}
            className="h-16 w-16 flex-none rounded-2xl border border-[var(--color-border)] object-cover sm:h-20 sm:w-20"
          />
        ) : (
          <div
            aria-hidden
            className="flex h-16 w-16 flex-none items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-primary)] text-lg font-bold text-white sm:h-20 sm:w-20 sm:text-xl"
          >
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="truncate text-base font-bold text-[var(--color-text)] group-hover:text-[var(--color-primary)] sm:text-lg">
            {masterName}
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-[var(--color-muted)] sm:text-sm">
            {master.city ? <span>{master.city}</span> : null}
            {rating ? (
              <span className="inline-flex items-center gap-0.5 font-semibold text-[var(--color-text)]">
                <span aria-hidden>★</span>
                <span>{rating}</span>
              </span>
            ) : null}
            {reviewsCount > 0 ? <span>{reviewsCount} {pluralReviews(reviewsCount)}</span> : null}
          </div>
        </div>
        <span
          aria-hidden
          className="hidden self-center text-sm font-semibold text-[var(--color-primary)] transition group-hover:translate-x-1 sm:inline-flex sm:items-center sm:gap-1"
        >
          К профилю
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </span>
      </Link>
    </div>
  );
}

// ── Client review ────────────────────────────────────────────────────────────

function ClientReview({ text, rating }: { text: string; rating: number }) {
  return (
    <div>
      <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
        Отзыв клиента
      </h2>
      <blockquote className="mt-4 rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-4 inline-flex items-center gap-1 rounded-full bg-[var(--color-accent-soft)] px-3 py-1 text-xs font-bold text-[var(--color-accent-hover)]">
          <span aria-hidden>★</span>
          <span>{rating} / 5</span>
        </div>
        <p className="text-base leading-relaxed text-[var(--color-text)] sm:text-lg">
          {`«${text}»`}
        </p>
      </blockquote>
    </div>
  );
}

// ── Calculator deep-link ─────────────────────────────────────────────────────

function CalculatorTeaser({ areaSqm, citySlug }: { areaSqm: number; citySlug: string }) {
  return (
    <Link
      href={`/kalkulyator?area=${Math.round(areaSqm)}&city=${encodeURIComponent(citySlug)}`}
      className="group flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-primary-soft)] to-white p-6 shadow-sm transition hover:border-[var(--color-primary)] hover:shadow-md sm:flex-row sm:items-center sm:gap-5"
    >
      <span className="inline-flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-white text-[var(--color-primary)] shadow-sm">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 7h8" />
          <path d="M8 12h2" />
          <path d="M14 12h2" />
          <path d="M8 17h2" />
          <path d="M14 17h2" />
        </svg>
      </span>
      <div className="flex-1">
        <p className="text-base font-bold text-[var(--color-text)]">
          Сравнить с региональным калькулятором
        </p>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Покажем диапазон цен на ремонт {Math.round(areaSqm)} м² в этом городе по нашей методике.
        </p>
      </div>
      <span className="self-end text-sm font-semibold text-[var(--color-primary)] transition group-hover:translate-x-1 sm:self-center">
        Открыть →
      </span>
    </Link>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-[var(--color-primary)]" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// ── Similar cases ────────────────────────────────────────────────────────────

function SimilarCases({ similar }: { similar: RabotySimilarItem[] }) {
  return (
    <section className="bg-[var(--color-background)]">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-secondary)]">
              Похожие работы
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
              Возможно, вам также понравится
            </h2>
          </div>
          <Link
            href="/raboty"
            className="hidden text-sm font-semibold text-[var(--color-secondary)] hover:underline sm:inline"
          >
            Все работы →
          </Link>
        </div>

        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {similar.map((s) => (
            <SimilarCard key={s.id} item={s} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function SimilarCard({ item }: { item: RabotySimilarItem }) {
  if (!item.slug) return null;
  const cover = item.afterPhotos[0] ?? item.beforePhotos[0] ?? null;
  const priceFrom = parseNumeric(item.priceFrom);
  const area = parseNumeric(item.area);

  return (
    <li>
      <Link
        href={`/raboty/${item.slug}`}
        className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg hover:border-[var(--color-secondary)]"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-[var(--color-background)]">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt={buildPortfolioImageAlt(item, "after", 0)}
              loading="lazy"
              className="block h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-[var(--color-muted)]">
              Без фото
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-5">
          <h3 className="line-clamp-2 text-base font-semibold leading-snug text-[var(--color-text)] group-hover:text-[var(--color-secondary)]">
            {item.title}
          </h3>
          <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-[var(--color-muted)]">
            {item.service?.name ? <span>{item.service.name}</span> : null}
            {item.city?.name ? (
              <>
                <span aria-hidden>·</span>
                <span>{item.city.name}</span>
              </>
            ) : null}
            {area != null ? (
              <>
                <span aria-hidden>·</span>
                <span>{area} м²</span>
              </>
            ) : null}
          </div>
          {priceFrom != null ? (
            <div className="mt-auto pt-2">
              <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]">от</span>
              <span className="ml-1 text-base font-bold text-[var(--color-text)]">
                {formatNumber(priceFrom)} ₽
              </span>
            </div>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
