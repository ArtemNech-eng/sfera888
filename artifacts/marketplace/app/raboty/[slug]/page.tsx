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
  RabotyDetailResponse,
  RabotySimilarItem,
} from "../../../lib/types";

/**
 * `/raboty/[slug]` — editorial article-style case page (plan §11.7, §21).
 *
 * The most valuable SEO surface in the project — every published case is its
 * own indexable page with self-contained CreativeWork + Service+Offer schema.
 * The redesign treats this page as a magazine article, not a product card:
 * full-bleed cover photo, oversized serif headline, dramatic before/after
 * pairing, long-form description, author byline, pull-quote review, sticky
 * (light) lead form, similar cases as the closing rail.
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

      <ArticleHeader
        portfolio={portfolio}
        cityName={cityName}
        masterName={masterName}
        completedAt={completedAtFormatted}
      />

      <ArticleCover cover={cover} portfolio={portfolio} cityName={cityName} />

      <ArticleStatsBar
        priceRange={priceRange}
        areaNum={areaNum}
        completedAt={completedAtFormatted}
      />

      <BeforeAfterPair
        title={portfolio.title}
        beforePhotos={portfolio.beforePhotos}
        afterPhotos={portfolio.afterPhotos}
        city={portfolio.city}
      />

      {/* Article body — single column with sticky aside on lg+ */}
      <section className="bg-[var(--color-surface)]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="grid gap-14 lg:grid-cols-[1.5fr_1fr] lg:gap-16">
            <div className="space-y-16">
              {portfolio.description ? (
                <ArticleDescription text={portfolio.description} />
              ) : null}

              <ExtraGallery
                title={portfolio.title}
                city={portfolio.city}
                beforePhotos={portfolio.beforePhotos}
                afterPhotos={portfolio.afterPhotos}
              />

              <MasterAuthorCard master={master} masterName={masterName} />

              {portfolio.clientReviewText && portfolio.clientRating ? (
                <ClientReview text={portfolio.clientReviewText} rating={portfolio.clientRating} />
              ) : null}

              {areaNum != null && portfolio.city?.slug ? (
                <CalculatorTeaser areaSqm={areaNum} citySlug={portfolio.city.slug} />
              ) : null}
            </div>

            <aside className="lg:pt-2">
              <div className="border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-7 lg:sticky lg:top-24">
                <p className="font-eyebrow">Заявка автору</p>
                <h2 id="lead-form" className="font-editorial mt-3 text-2xl text-[var(--color-text)] sm:text-3xl">
                  Хочу такую же.
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">
                  Уйдёт автору работы первой. Если не возьмёт за 30 минут —
                  передадим похожим мастерам в вашем городе.
                </p>
                <ul className="mt-5 space-y-1.5 text-xs text-[var(--color-muted)]">
                  {portfolio.service?.name ? (
                    <li className="flex items-center gap-1.5"><Check /> Услуга: {portfolio.service.name}</li>
                  ) : null}
                  {cityName ? (
                    <li className="flex items-center gap-1.5"><Check /> Город: {cityName}</li>
                  ) : null}
                  {areaNum != null ? (
                    <li className="flex items-center gap-1.5"><Check /> Площадь референса: {areaNum} м²</li>
                  ) : null}
                </ul>
                <div className="mt-6">
                  {fallbackCity && fallbackService ? (
                    <LeadForm
                      citySlug={fallbackCity.slug}
                      serviceSlug={fallbackService.slug}
                      sourcePageUrl={sourcePageUrl}
                      attachedMasterId={master.id}
                      attachedMasterTitle={masterName}
                    />
                  ) : (
                    <p className="text-sm text-[var(--color-muted)]">
                      Заявка через эту страницу временно недоступна. Перейдите{" "}
                      <Link
                        href={master.slug ? `/master/${master.slug}` : "/mastera"}
                        className="text-[var(--color-text)] underline underline-offset-2 hover:text-[var(--color-primary)]"
                      >
                        на страницу мастера
                      </Link>
                      .
                    </p>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {similar.length >= 3 ? <SimilarCases similar={similar} /> : null}
    </>
  );
}

// ── Article header (breadcrumbs, eyebrow, headline) ──────────────────────────

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
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6 sm:pt-14">
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

        <p className="font-eyebrow mt-9 text-[var(--color-primary)]">
          {eyebrowParts.length > 0 ? eyebrowParts.join(" · ") : "Кейс"}
        </p>

        <h1 className="font-editorial mt-5 max-w-4xl text-3xl text-[var(--color-text)] sm:text-4xl lg:text-5xl">
          {portfolio.title}
        </h1>

        <p className="mt-7 max-w-2xl text-base leading-relaxed text-[var(--color-muted)] sm:text-lg">
          Мастер: <span className="text-[var(--color-text)]">{masterName}</span>
          {completedAt ? <>. Завершено в <span className="text-[var(--color-text)]">{completedAt}</span></> : null}.
        </p>
      </div>
    </header>
  );
}

// ── Article cover (full-bleed photo, no overlay) ─────────────────────────────

function ArticleCover({
  cover,
  portfolio,
  cityName,
}: {
  cover: string | null;
  portfolio: RabotyDetailResponse["portfolio"];
  cityName: string | null;
}) {
  if (!cover) return null;
  return (
    <section className="bg-[var(--color-background)]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <figure className="relative aspect-[16/9] w-full overflow-hidden bg-[var(--color-border)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover}
            alt={buildPortfolioImageAlt({ title: portfolio.title, city: portfolio.city }, "after", 0)}
            loading="eager"
            className="h-full w-full object-cover"
          />
          {cityName ? (
            <figcaption className="absolute bottom-4 left-4 inline-flex items-center bg-[var(--color-text)]/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
              {cityName}
            </figcaption>
          ) : null}
        </figure>
      </div>
    </section>
  );
}

// ── Stats bar (price / area / completed) ─────────────────────────────────────

function ArticleStatsBar({
  priceRange,
  areaNum,
  completedAt,
}: {
  priceRange: string | null;
  areaNum: number | null;
  completedAt: string | null;
}) {
  const items: { label: string; value: string }[] = [];
  if (priceRange) items.push({ label: "Стоимость", value: priceRange });
  if (areaNum != null) items.push({ label: "Площадь", value: `${formatNumber(areaNum)} м²` });
  if (completedAt) items.push({ label: "Завершено", value: completedAt });
  if (items.length === 0) return null;

  return (
    <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <dl className="grid divide-y divide-[var(--color-border)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {items.map((item) => (
            <div key={item.label} className="px-2 py-6 sm:px-7 sm:py-7">
              <dt className="font-eyebrow">{item.label}</dt>
              <dd className="font-editorial mt-3 text-2xl text-[var(--color-text)] sm:text-3xl">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="border-t border-[var(--color-border)] px-2 py-5 sm:px-7">
          <Link
            href="#lead-form"
            className="inline-flex items-center gap-2 bg-[var(--color-text)] px-6 py-3 text-sm font-semibold tracking-wide text-white transition hover:bg-[var(--color-primary)]"
          >
            Хочу такую же
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
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
    <section className="bg-[var(--color-background)] py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="font-eyebrow">До и после</p>
          <h2 className="font-editorial mt-4 text-3xl text-[var(--color-text)] sm:text-4xl">
            Как было и что получилось.
          </h2>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          <PairTile src={before} label="До" alt={beforeAlt} />
          <PairTile src={after} label="После" alt={afterAlt} />
        </div>
      </div>
    </section>
  );
}

function PairTile({ src, label, alt }: { src: string | null; label: string; alt: string }) {
  if (!src) {
    return (
      <div className="relative flex aspect-[4/3] items-center justify-center border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-muted)]">
        <span className="absolute left-3 top-3 inline-flex items-center bg-[var(--color-text)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
          {label}
        </span>
        Фото отсутствует
      </div>
    );
  }
  return (
    <figure className="relative aspect-[4/3] overflow-hidden bg-[var(--color-border)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="eager" className="block h-full w-full object-cover" />
      <span className="absolute left-3 top-3 inline-flex items-center bg-[var(--color-text)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
        {label}
      </span>
    </figure>
  );
}

// ── Article description ──────────────────────────────────────────────────────

function ArticleDescription({ text }: { text: string }) {
  return (
    <div>
      <p className="font-eyebrow">Описание</p>
      <h2 className="font-editorial mt-4 text-3xl text-[var(--color-text)] sm:text-4xl">
        Что было сделано на объекте.
      </h2>
      <div className="mt-6 whitespace-pre-line text-base leading-relaxed text-[var(--color-text)] sm:text-lg sm:leading-relaxed">
        {text}
      </div>
    </div>
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
  const remaining: { url: string; type: "before" | "after"; idx: number }[] = [
    ...afterPhotos.slice(1).map((url, i) => ({ url, type: "after" as const, idx: i + 1 })),
    ...beforePhotos.slice(1).map((url, i) => ({ url, type: "before" as const, idx: i + 1 })),
  ];
  if (remaining.length === 0) return null;

  return (
    <div>
      <p className="font-eyebrow">Галерея</p>
      <h2 className="font-editorial mt-4 text-3xl text-[var(--color-text)] sm:text-4xl">
        Ещё фото с объекта.
      </h2>
      <ul className="mt-7 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        {remaining.slice(0, 9).map((item, i) => (
          <li key={`${item.url}-${i}`} className="aspect-[4/3] overflow-hidden bg-[var(--color-border)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.url}
              alt={buildPortfolioImageAlt({ title, city }, item.type, item.idx)}
              loading="lazy"
              className="block h-full w-full object-cover transition-transform duration-700 hover:scale-[1.04]"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Author / Master byline ───────────────────────────────────────────────────

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
      <p className="font-eyebrow">Автор работы</p>
      <Link
        href={master.slug ? `/master/${master.slug}` : "/mastera"}
        className="group mt-5 flex items-center gap-5 border-y border-[var(--color-border)] py-7 transition hover:bg-[var(--color-background)] sm:gap-6 sm:py-8"
      >
        {master.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={master.avatarUrl}
            alt={buildMasterAvatarAlt(master)}
            className="h-20 w-20 flex-none object-cover sm:h-24 sm:w-24"
          />
        ) : (
          <div
            aria-hidden
            className="flex h-20 w-20 flex-none items-center justify-center bg-[var(--color-text)] text-xl font-bold text-white sm:h-24 sm:w-24 sm:text-2xl"
          >
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-editorial truncate text-xl text-[var(--color-text)] group-hover:text-[var(--color-primary)] sm:text-2xl">
            {masterName}
          </p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-[var(--color-muted)]">
            {master.city ? <span>{master.city}</span> : null}
            {rating ? (
              <span className="inline-flex items-center gap-1 text-[var(--color-text)]">
                <span aria-hidden className="text-[var(--color-primary)]">★</span>
                <span className="font-semibold">{rating}</span>
              </span>
            ) : null}
            {reviewsCount > 0 ? <span>{reviewsCount} {pluralReviews(reviewsCount)}</span> : null}
          </div>
        </div>
        <span aria-hidden className="hidden self-center text-sm font-semibold text-[var(--color-text)] underline decoration-[var(--color-border-strong)] underline-offset-4 transition group-hover:decoration-[var(--color-text)] sm:inline">
          К профилю
        </span>
      </Link>
    </div>
  );
}

// ── Client review (portal-style box) ─────────────────────────────────────────

function ClientReview({ text, rating }: { text: string; rating: number }) {
  return (
    <div>
      <p className="font-eyebrow">Отзыв клиента</p>
      <blockquote className="mt-5 rounded-lg border border-[var(--color-border)] bg-[var(--color-cream-deep)] p-6 sm:p-8">
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-surface)] px-3 py-1 text-xs font-bold text-[var(--color-text)] shadow-cozy">
          <span aria-hidden className="text-[var(--color-primary)]">★</span>
          <span>{rating} / 5</span>
        </div>
        <p className="text-base leading-relaxed text-[var(--color-text)] sm:text-lg">
          «{text}»
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
      className="group flex flex-col gap-3 border border-[var(--color-border)] bg-[var(--color-background)] p-7 transition hover:bg-[var(--color-surface)] sm:flex-row sm:items-center sm:gap-7 sm:p-9"
    >
      <div className="flex-1">
        <p className="font-eyebrow text-[var(--color-money)]">Бюджет</p>
        <p className="font-editorial mt-2 text-xl text-[var(--color-text)] sm:text-2xl">
          Сравните с региональным калькулятором.
        </p>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Покажем диапазон цен на ремонт {Math.round(areaSqm)} м² в этом городе.
        </p>
      </div>
      <span className="self-end text-sm font-semibold text-[var(--color-text)] underline decoration-[var(--color-border-strong)] underline-offset-4 transition group-hover:decoration-[var(--color-text)] sm:self-center">
        Открыть калькулятор →
      </span>
    </Link>
  );
}

function Check() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-[var(--color-primary)]" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// ── Similar cases ────────────────────────────────────────────────────────────

function SimilarCases({ similar }: { similar: RabotySimilarItem[] }) {
  return (
    <section className="border-t border-[var(--color-border)] bg-[var(--color-background)]">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="font-eyebrow">Похожие работы</p>
            <h2 className="font-editorial mt-4 text-3xl text-[var(--color-text)] sm:text-4xl">
              Возможно, вам также понравится.
            </h2>
          </div>
          <Link
            href="/raboty"
            className="hidden text-sm font-semibold text-[var(--color-text)] underline decoration-[var(--color-border-strong)] underline-offset-4 transition hover:decoration-[var(--color-text)] sm:inline"
          >
            Все работы →
          </Link>
        </div>

        <ul className="mt-12 grid gap-x-3 gap-y-10 sm:grid-cols-2 sm:gap-x-4 lg:grid-cols-3">
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
      <Link href={`/raboty/${item.slug}`} className="group block">
        <div className="relative aspect-[4/3] overflow-hidden bg-[var(--color-border)]">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt={buildPortfolioImageAlt(item, "after", 0)}
              loading="lazy"
              className="block h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-[var(--color-muted)]">
              Без фото
            </div>
          )}
        </div>
        <div className="mt-4 space-y-2">
          <h3 className="font-editorial line-clamp-2 text-xl leading-snug text-[var(--color-text)] group-hover:text-[var(--color-primary)] sm:text-2xl">
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
            <p className="text-sm">
              <span className="text-[var(--color-faint)]">от </span>
              <span className="font-semibold text-[var(--color-text)]">
                {formatNumber(priceFrom)} ₽
              </span>
            </p>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
