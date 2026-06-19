import { notFound } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { fetchRabotyCase, fetchCities, fetchServices, fetchMarketStats } from "../../../lib/api";
import { publicUrl } from "../../../lib/env";
import {
  breadcrumbJsonLd,
  caseJsonLd,
  toJsonLdScript,
} from "../../../lib/jsonLd";
import {
  buildCaseMeta,
  buildPortfolioImageAlt,
} from "../../../lib/seoMeta";
import type {
  RabotyDetailResponse,
  RabotySimilarItem,
} from "../../../lib/types";
import { CaseGallery } from "../../../components/raboty/CaseGallery";
import { CaseChips } from "../../../components/raboty/CaseChips";
import { CasePrimaryCTA } from "../../../components/raboty/CasePrimaryCTA";
import { CaseEstimate } from "../../../components/raboty/CaseEstimate";
import { CaseMasterSummary } from "../../../components/raboty/CaseMasterSummary";
import { CaseMarketStats } from "../../../components/raboty/CaseMarketStats";
import { CaseAIDesigns } from "../../../components/raboty/CaseAIDesigns";
import { CaseLeadBlock } from "../../../components/raboty/CaseLeadBlock";
import { StickyMobileCTA } from "../../../components/raboty/StickyMobileCTA";
import { CaseCard } from "../../../components/CaseCard";

/**
 * `/raboty/[slug]` — object-first case page (plan §22 redesign).
 *
 * Replaces the previous editorial-article layout. The renovation result is
 * the hero of the page; the lead form is its consequence at the bottom.
 *
 * Section order (plan §22 Req 11.1, locked):
 *   Header → Gallery → Chips → Primary CTA → Before/After → Description →
 *   Client review (optional) → [Estimate Iter 2] → Master byline → Similar →
 *   [Market average Iter 3] → AI-designs → Lead form → (sticky CTA layer)
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

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function RabotyCasePage(
  { params }: { params: Promise<RouteParams> },
) {
  const { slug } = await params;

  // Read anonymous-cookie identity (Iter 4) so the api-server can resolve
  // `isSavedByCurrentUser` in the same round-trip. Cookie is HTTP-only and
  // managed by the marketplace `/api/raboty/[slug]/save` route handler;
  // here we just read it.
  const cookieStore = await cookies();
  const anonId = cookieStore.get("kiro_anon_id")?.value ?? null;

  const [data, cities, services] = await Promise.all([
    fetchRabotyCase(slug, { anonId }),
    fetchCities().catch(() => []),
    fetchServices().catch(() => []),
  ]);
  if (!data) notFound();

  const { portfolio, master, similar, masterStats, isSavedByCurrentUser } = data;
  const masterName = pickMasterDisplayName(master);
  const sourcePageUrl = `${publicUrl()}/raboty/${slug}`;

  const cityName = portfolio.city?.name ?? master.city ?? null;
  const areaNum = parseNumeric(portfolio.area);
  const completedAtFormatted = formatDate(portfolio.completedAt);
  const { range: priceRange, total: priceTotalNum } = formatPriceRange(portfolio.priceFrom, portfolio.priceTo);

  // Market-stats fetched after case is resolved (depends on serviceSlug + area).
  // Cached server-side per (service, area-bucket, city) for 1 hour, so this is
  // cheap on warm cache. Failure is non-fatal — section just doesn't render.
  const marketStats = portfolio.service?.slug && areaNum != null
    ? await fetchMarketStats({
        serviceSlug: portfolio.service.slug,
        areaTarget: areaNum,
        citySlug: portfolio.city?.slug ?? null,
      }).catch(() => null)
    : null;

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

  // JSON-LD: now lists ALL photos in image[], not just cover (plan §22 §13.1).
  const allPhotoUrls = [
    ...portfolio.afterPhotos,
    ...portfolio.beforePhotos,
  ];

  const breadcrumbsLd = breadcrumbJsonLd([
    { name: "Главная", url: `${publicUrl()}/` },
    { name: "Работы", url: `${publicUrl()}/raboty` },
    { name: portfolio.title, url: sourcePageUrl },
  ]);

  const HOUSING_LABEL_MAP: Record<string, string> = {
    novostroyka: "Новостройка",
    vtorichka: "Вторичка",
    chastnyy_dom: "Частный дом",
    kommerciya: "Коммерция",
  };

  const caseLd = caseJsonLd({
    url: sourcePageUrl,
    title: portfolio.title,
    description: portfolio.description,
    coverImageUrl: portfolio.afterPhotos[0] ?? portfolio.beforePhotos[0] ?? null,
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
    durationDays: portfolio.durationDays,
    housingTypeLabel: portfolio.housingType ? HOUSING_LABEL_MAP[portfolio.housingType] ?? null : null,
    estimate: portfolio.estimate
      ? { works: portfolio.estimate.works, materials: portfolio.estimate.materials }
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

      {/* 0. Header — breadcrumbs, eyebrow, h1, master byline (compact) */}
      <ArticleHeader
        portfolio={portfolio}
        cityName={cityName}
        masterName={masterName}
        completedAt={completedAtFormatted}
      />

      {/* 1. Gallery — Houzz-style multi-photo with lightbox */}
      <CaseGallery
        title={portfolio.title}
        cityName={cityName}
        beforePhotos={portfolio.beforePhotos}
        afterPhotos={portfolio.afterPhotos}
      />

      {/* 2. Chips — city / area / срок / price / service / тип жилья */}
      <CaseChips
        cityName={cityName}
        area={areaNum}
        priceRange={priceRange}
        serviceName={portfolio.service?.name ?? null}
        durationDays={portfolio.durationDays}
        housingType={portfolio.housingType}
      />

      {/* 3. Primary CTA + Save + Share */}
      <CasePrimaryCTA
        slug={slug}
        shareUrl={sourcePageUrl}
        shareTitle={portfolio.title}
        initialSaved={isSavedByCurrentUser}
        saveCount={portfolio.saveCount}
      />

      {/* 4. Before / After — компактный сравнительный блок */}
      <BeforeAfterCompact
        title={portfolio.title}
        beforePhotos={portfolio.beforePhotos}
        afterPhotos={portfolio.afterPhotos}
        city={portfolio.city}
      />

      {/* 5. Description — long-form text */}
      {portfolio.description ? (
        <ArticleDescription text={portfolio.description} />
      ) : null}

      {/* Optional pull-quote review (если есть) */}
      {portfolio.clientReviewText && portfolio.clientRating ? (
        <ClientReview text={portfolio.clientReviewText} rating={portfolio.clientRating} />
      ) : null}

      {/* 6. Смета — Iter 2 */}
      <CaseEstimate estimate={portfolio.estimate} />

      {/* 7. Master — strong byline */}
      <CaseMasterSummary master={master} masterName={masterName} stats={masterStats} />

      {/* 8. Similar — Pinterest-style cards */}
      {similar.length >= 3 ? <SimilarCases similar={similar} /> : null}

      {/* 8a. Market average — supporting block, hidden if data is thin */}
      <CaseMarketStats data={marketStats} />

      {/* 9. AI-designs */}
      <CaseAIDesigns roomSlug={portfolio.service?.slug ?? null} />

      {/* 10. Lead form — финальный блок (anchor #lead-form) */}
      <CaseLeadBlock
        fallbackCity={fallbackCity}
        fallbackService={fallbackService}
        sourcePageUrl={sourcePageUrl}
        master={master}
        masterName={masterName}
        serviceName={portfolio.service?.name ?? null}
        cityName={cityName}
        areaNum={areaNum}
      />

      {/* Sticky CTA — overlay layer, responds to scroll */}
      <StickyMobileCTA />
    </>
  );
}

// ── Article header (compact, no big cover photo — gallery does that) ────────

function ArticleHeader({
  portfolio,
  cityName,
  masterName,
  completedAt,
}: {
  portfolio: RabotyDetailResponse["portfolio"];
  cityName: string | null;
  masterName: string;
  completedAt: string | null;
}) {
  const eyebrowParts: string[] = [];
  if (portfolio.service?.name) eyebrowParts.push(portfolio.service.name);
  if (cityName) eyebrowParts.push(cityName);

  return (
    <header className="bg-[var(--color-background)]">
      <div className="mx-auto max-w-6xl px-4 pb-4 pt-8 sm:px-6 sm:pt-12">
        <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-muted)]">
          <Link href="/" className="transition hover:text-[var(--color-text)]">Главная</Link>
          <span aria-hidden>/</span>
          <Link href="/raboty" className="transition hover:text-[var(--color-text)]">Работы</Link>
          {portfolio.service?.name ? (
            <>
              <span aria-hidden>/</span>
              <span className="text-[var(--color-text)]">{portfolio.service.name}</span>
            </>
          ) : null}
        </nav>

        <p className="font-eyebrow mt-6 text-[var(--color-primary)]">
          {eyebrowParts.length > 0 ? eyebrowParts.join(" · ") : "Кейс"}
        </p>

        <h1 className="font-editorial mt-3 max-w-4xl text-3xl text-[var(--color-text)] sm:text-4xl lg:text-[2.75rem]">
          {portfolio.title}
        </h1>

        <p className="mt-4 max-w-2xl text-sm text-[var(--color-muted)] sm:text-base">
          Мастер: <span className="text-[var(--color-text)]">{masterName}</span>
          {completedAt ? <>. Завершено в <span className="text-[var(--color-text)]">{completedAt}</span></> : null}.
        </p>
      </div>
    </header>
  );
}

// ── Before / After (compact, no own header — moved into a single tight pair) ─

function BeforeAfterCompact({
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
  if (!before || !after) return null; // покажем только если есть пара (иначе галерея уже показала всё)

  const portfolioRef = { title, city };
  const beforeAlt = buildPortfolioImageAlt(portfolioRef, "before", 0);
  const afterAlt = buildPortfolioImageAlt(portfolioRef, "after", 0);

  return (
    <section className="bg-[var(--color-background)]">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-14">
        <p className="font-eyebrow">До и после</p>
        <h2 className="font-editorial mt-3 text-2xl text-[var(--color-text)] sm:text-3xl">
          Как было и что получилось.
        </h2>

        <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          <PairTile src={before} label="До" alt={beforeAlt} />
          <PairTile src={after} label="После" alt={afterAlt} />
        </div>
      </div>
    </section>
  );
}

function PairTile({ src, label, alt }: { src: string; label: string; alt: string }) {
  return (
    <figure className="relative aspect-[4/3] overflow-hidden rounded-xl bg-[var(--color-border)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" className="block h-full w-full object-cover" />
      <span className="absolute left-3 top-3 inline-flex items-center rounded bg-[var(--color-text)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
        {label}
      </span>
    </figure>
  );
}

// ── Article description ──────────────────────────────────────────────────────

function ArticleDescription({ text }: { text: string }) {
  return (
    <section className="bg-[var(--color-surface)]">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="max-w-3xl">
          <p className="font-eyebrow">Описание</p>
          <h2 className="font-editorial mt-3 text-2xl text-[var(--color-text)] sm:text-3xl">
            Что было сделано на объекте.
          </h2>
          <div className="mt-6 whitespace-pre-line text-base leading-relaxed text-[var(--color-text)] sm:text-lg sm:leading-relaxed">
            {text}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Client review (pull-quote) ───────────────────────────────────────────────

function ClientReview({ text, rating }: { text: string; rating: number }) {
  return (
    <section className="bg-[var(--color-background)]">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-14">
        <div className="max-w-3xl">
          <p className="font-eyebrow">Отзыв клиента</p>
          <blockquote className="mt-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-cozy sm:p-8">
            <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-primary-soft)] px-3 py-1 text-xs font-bold text-[var(--color-primary)]">
              <span aria-hidden>★</span>
              <span>{rating} / 5</span>
            </div>
            <p className="text-base leading-relaxed text-[var(--color-text)] sm:text-lg">
              «{text}»
            </p>
          </blockquote>
        </div>
      </div>
    </section>
  );
}

// ── Similar cases (using shared CaseCard) ────────────────────────────────────

function SimilarCases({ similar }: { similar: RabotySimilarItem[] }) {
  return (
    <section className="border-t border-[var(--color-border)] bg-[var(--color-background)]">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="font-eyebrow">Похожие ремонты</p>
            <h2 className="font-editorial mt-3 text-2xl text-[var(--color-text)] sm:text-3xl">
              Если этот понравился, посмотрите эти.
            </h2>
          </div>
          <Link
            href="/raboty"
            className="hidden text-sm font-semibold text-[var(--color-text)] underline decoration-[var(--color-primary)] decoration-2 underline-offset-4 transition hover:decoration-[var(--color-text)] sm:inline"
          >
            Все ремонты →
          </Link>
        </div>

        <ul className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {similar.map((s) => (
            <li key={s.id}>
              <SimilarTile item={s} />
            </li>
          ))}
        </ul>

        <div className="mt-8 sm:hidden">
          <Link
            href="/raboty"
            className="text-sm font-semibold text-[var(--color-text)] underline decoration-[var(--color-primary)] decoration-2 underline-offset-4"
          >
            Все ремонты →
          </Link>
        </div>
      </div>
    </section>
  );
}

function SimilarTile({ item }: { item: RabotySimilarItem }) {
  if (!item.slug) return null;
  const cover = item.afterPhotos[0] ?? item.beforePhotos[0] ?? null;
  const priceFrom = parseNumeric(item.priceFrom);
  const area = parseNumeric(item.area);
  const cityName = item.city?.name ?? null;

  return (
    <CaseCard
      href={`/raboty/${item.slug}`}
      cover={cover}
      title={item.title}
      alt={buildPortfolioImageAlt(item, "after", 0)}
      metaParts={[item.service?.name, cityName, area != null ? `${area} м²` : null]}
      priceLabel={priceFrom != null ? `от ${formatNumber(priceFrom)} ₽` : null}
    />
  );
}
