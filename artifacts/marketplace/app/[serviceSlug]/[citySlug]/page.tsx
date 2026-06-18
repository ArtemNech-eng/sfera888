import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { fetchServiceCity } from "../../../lib/api";
import { publicUrl } from "../../../lib/env";
import { LeadForm } from "../../../components/LeadForm";
import { MasterCard } from "../../../components/MasterCard";
import {
  breadcrumbJsonLd,
  faqJsonLd,
  serviceJsonLd,
  toJsonLdScript,
} from "../../../lib/jsonLd";
import { buildServiceCityMeta } from "../../../lib/seoMeta";

// Dynamic [params] route — Next won't prerender these at build anyway, but we
// declare it explicitly so generateMetadata + fetch can use server-only env.
export const dynamic = "force-dynamic";

interface RouteParams {
  serviceSlug: string;
  citySlug: string;
}

export async function generateMetadata(
  { params }: { params: Promise<RouteParams> },
): Promise<Metadata> {
  const { serviceSlug, citySlug } = await params;
  const data = await fetchServiceCity(serviceSlug, citySlug);
  if (!data) return { robots: { index: false, follow: false } };
  const path = `/${serviceSlug}/${citySlug}`;
  const meta = buildServiceCityMeta(data);
  return {
    title: { absolute: meta.title },
    description: meta.description,
    alternates: { canonical: `${publicUrl()}${path}` },
  };
}

const HERO_BADGES = [
  "Заявка за 1 минуту",
  "Проверенные мастера",
  "Без звонков в 10 мест",
];

const WORK_EXAMPLES = [
  "Срочный выезд",
  "Разовая работа",
  "Ремонт под ключ",
  "Консультация по задаче",
];

const TRUST_BLOCKS: Array<{ t: string; d: string; icon: React.ReactNode }> = [
  {
    t: "Заявки не публикуются открыто",
    d: "Ваше описание задачи не появится в открытом доступе на сайте.",
    icon: <ShieldIcon />,
  },
  {
    t: "Телефон не показывается публично",
    d: "Контакт получает только мастер, которого подбираем под вашу задачу.",
    icon: <PhoneIcon />,
  },
  {
    t: "Задача уходит в систему",
    d: "Мастера получают её в личном кабинете — без массовых рассылок и спама.",
    icon: <BellIcon />,
  },
  {
    t: "Можно описать задачу заранее",
    d: "Опишите подробно, что нужно сделать, ещё до звонка мастера.",
    icon: <PencilIcon />,
  },
];

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Сколько стоит услуга?",
    a: "Стоимость зависит от объёма и сложности работ. Мастер сориентирует по цене после уточнения задачи. Базовый выезд на осмотр обычно бесплатный.",
  },
  {
    q: "Как быстро мастер свяжется?",
    a: "Обычно в течение часа в рабочее время. Если задача срочная, отметьте это в комментарии — постараемся подобрать мастера быстрее.",
  },
  {
    q: "Можно ли описать задачу без точного адреса?",
    a: "Да. Достаточно города и района. Точный адрес можно сообщить мастеру при разговоре, когда согласуете время.",
  },
  {
    q: "Нужно ли платить за заявку?",
    a: "Нет. Оставить заявку и получить звонок мастера — бесплатно. Вы оплачиваете только согласованную работу мастеру напрямую.",
  },
];

function formatNumber(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
}

export default async function ServiceCityPage(
  { params }: { params: Promise<RouteParams> },
) {
  const { serviceSlug, citySlug } = await params;
  const data = await fetchServiceCity(serviceSlug, citySlug);
  if (!data) notFound();

  const cityPrepositional = data.city.nameIn ?? data.city.name;
  const pageH1 = `${data.service.name} в ${cityPrepositional}`;
  const sourcePageUrl = `${publicUrl()}/${serviceSlug}/${citySlug}`;
  const hasPrice = data.service.priceFrom != null;

  const seoDescription =
    `Оставьте заявку на услугу «${data.service.name}» в ${cityPrepositional}. Подберём проверенного мастера.`;

  // schema.org payloads
  const breadcrumbsLd = breadcrumbJsonLd([
    { name: "Главная", url: `${publicUrl()}/` },
    { name: "Услуги", url: `${publicUrl()}/uslugi` },
    { name: pageH1, url: sourcePageUrl },
  ]);
  const serviceLd = serviceJsonLd({
    serviceName: data.service.name,
    cityName: data.city.name,
    cityNameIn: data.city.nameIn,
    description: seoDescription,
    url: sourcePageUrl,
    siteUrl: publicUrl(),
    minPrice: data.stats.minPrice,
  });
  const faqLd = faqJsonLd(FAQ);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLdScript(breadcrumbsLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLdScript(serviceLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLdScript(faqLd) }}
      />

      {/* ── Hero ── */}
      <section className="bg-[var(--color-surface)]">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-muted)]">
            <Link href="/" className="hover:text-[var(--color-text)]">Главная</Link>
            <span aria-hidden>/</span>
            <Link href="/uslugi" className="hover:text-[var(--color-text)]">Услуги</Link>
            <span aria-hidden>/</span>
            <span className="text-[var(--color-text)]">{pageH1}</span>
          </nav>

          <p className="font-eyebrow mt-7 text-[var(--color-primary)]">
            {data.city.name}
          </p>
          <h1 className="font-editorial mt-3 max-w-3xl text-3xl text-[var(--color-text)] sm:text-4xl lg:text-5xl">
            {pageH1}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--color-muted)]">
            Оставьте заявку — подберём проверенного мастера. Без звонков в десять мест,
            без публичных объявлений с вашим номером.
          </p>

          <ul className="mt-5 flex flex-wrap gap-2">
            {HERO_BADGES.map((badge) => (
              <li
                key={badge}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--color-primary-strong)]"
              >
                <CheckMicroIcon />
                {badge}
              </li>
            ))}
          </ul>

          {/* Inline stats row */}
          <p className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm text-[var(--color-muted)]">
            <span className="inline-flex items-baseline gap-1.5">
              <span className="text-base font-bold text-[var(--color-text)]">
                {data.stats.mastersCount > 0 ? formatNumber(data.stats.mastersCount) : "—"}
              </span>
              <span>мастеров в городе</span>
            </span>
            {hasPrice && data.service.priceFrom != null ? (
              <span className="inline-flex items-baseline gap-1.5">
                <span className="text-base font-bold text-[var(--color-text)]">
                  от {formatNumber(data.service.priceFrom)} ₽
                </span>
                <span>цена</span>
              </span>
            ) : data.stats.minPrice != null ? (
              <span className="inline-flex items-baseline gap-1.5">
                <span className="text-base font-bold text-[var(--color-text)]">
                  от {formatNumber(data.stats.minPrice)} ₽
                </span>
                <span>цена</span>
              </span>
            ) : null}
            {data.stats.avgRating != null ? (
              <span className="inline-flex items-baseline gap-1.5">
                <span aria-hidden className="text-[var(--color-primary)]">★</span>
                <span className="font-bold text-[var(--color-text)]">{data.stats.avgRating.toFixed(1)}</span>
                <span>средняя оценка</span>
              </span>
            ) : null}
            {data.stats.reviewsCount > 0 ? (
              <span className="inline-flex items-baseline gap-1.5">
                <span className="text-base font-bold text-[var(--color-text)]">
                  {formatNumber(data.stats.reviewsCount)}
                </span>
                <span>отзывов</span>
              </span>
            ) : null}
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="#lead-form"
              className="inline-flex h-11 items-center gap-2 rounded-md bg-[var(--color-primary)] px-5 text-sm font-semibold text-white transition hover:bg-[var(--color-primary-hover)]"
            >
              Оставить заявку
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
            <Link
              href={`/kalkulyator?city=${encodeURIComponent(citySlug)}`}
              className="inline-flex h-11 items-center rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-5 text-sm font-semibold text-[var(--color-text)] transition hover:border-[var(--color-text)]"
            >
              Калькулятор бюджета
            </Link>
          </div>
        </div>
      </section>

      {/* ── Form + price card two-column ── */}
      <section className="border-b border-[var(--color-border)] bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:gap-10">
            {/* Price + work examples */}
            <div className="space-y-4">
              <div className="rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-sm sm:p-8">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
                  Стоимость
                </p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
                  {hasPrice && data.service.priceFrom != null
                    ? `${data.service.name} от ${formatNumber(data.service.priceFrom)} ₽`
                    : `Сколько стоит ${data.service.name.toLowerCase()}`}
                </h2>
                <p className="mt-3 text-sm text-[var(--color-muted)] sm:text-base">
                  {hasPrice
                    ? `Базовая ставка по услуге «${data.service.name}» в ${cityPrepositional}. Точную сумму мастер сориентирует после уточнения задачи.`
                    : "Стоимость зависит от объёма работ — мастер сориентирует после уточнения задачи. Базовый выезд на осмотр обычно бесплатный."}
                </p>

                <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                  Подходит для
                </p>
                <ul className="mt-3 grid gap-2 text-sm text-[var(--color-text)] sm:grid-cols-2">
                  {WORK_EXAMPLES.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <CheckIcon />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Calculator teaser */}
              <Link
                href={`/kalkulyator?city=${encodeURIComponent(citySlug)}`}
                className="group flex items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-primary-soft)] to-white p-5 shadow-sm transition hover:border-[var(--color-primary)] hover:shadow-md sm:p-6"
              >
                <span className="inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-white text-[var(--color-primary)] shadow-sm">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
                    Прикинуть бюджет ремонта в {cityPrepositional}
                  </p>
                  <p className="mt-1 text-sm text-[var(--color-muted)]">
                    Калькулятор по реальным сделкам и региональным коэффициентам.
                  </p>
                </div>
                <span className="hidden text-sm font-semibold text-[var(--color-primary)] transition group-hover:translate-x-1 sm:inline">
                  →
                </span>
              </Link>
            </div>

            {/* Lead form sticky */}
            <aside>
              <div
                id="lead-form"
                className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-md sm:p-6 lg:sticky lg:top-20"
              >
                <h2 className="text-xl font-bold tracking-tight text-[var(--color-text)] sm:text-2xl">
                  Опишите задачу
                </h2>
                <p className="mt-2 text-sm text-[var(--color-muted)]">
                  Подберём мастера и перезвоним в течение часа в рабочее время.
                </p>
                <ul className="mt-3 space-y-1 text-xs text-[var(--color-muted)]">
                  <li className="flex items-center gap-1.5">
                    <CheckMicroIcon />
                    Услуга: {data.service.name}
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CheckMicroIcon />
                    Город: {data.city.name}
                  </li>
                </ul>
                <div className="mt-5">
                  <LeadForm
                    citySlug={data.city.slug}
                    serviceSlug={data.service.slug}
                    sourcePageUrl={sourcePageUrl}
                  />
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* ── Masters list ── */}
      {data.masters.length > 0 ? (
        <section className="bg-[var(--color-background)]">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
                  Подбор
                </p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
                  Мастера: {data.service.name} в {cityPrepositional}
                </h2>
                <p className="mt-2 max-w-xl text-sm text-[var(--color-muted)]">
                  Каждый прошёл собеседование, стажировку и работает по договору.
                </p>
              </div>
              <span className="hidden text-sm text-[var(--color-muted)] sm:inline">
                {data.masters.length} {pluralMasters(data.masters.length)}
              </span>
            </div>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.masters.map((m) => (
                <li key={m.id}>
                  <MasterCard master={m} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ── How it works ── */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
              Как это работает
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
              Три шага до мастера
            </h2>
          </div>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                n: "1",
                t: "Оставляете заявку",
                d: "Опишите задачу и оставьте телефон. Это занимает около минуты.",
              },
              {
                n: "2",
                t: "Передаём подходящим мастерам",
                d: `Заявка уходит мастерам, работающим с услугой «${data.service.name}» в ${cityPrepositional}.`,
              },
              {
                n: "3",
                t: "Мастер связывается с вами",
                d: "Уточняет детали, согласует время и стоимость до начала работ.",
              },
            ].map((s) => (
              <li
                key={s.n}
                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-primary-soft)] text-sm font-bold text-[var(--color-primary)]">
                    {s.n}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-bold text-[var(--color-text)]">{s.t}</h3>
                <p className="mt-1 text-sm text-[var(--color-muted)]">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Trust block ── */}
      <section className="border-y border-[var(--color-border)] bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-secondary)]">
              Почему через нас
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
              Защищаем ваше время и контакт
            </h2>
          </div>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {TRUST_BLOCKS.map((b) => (
              <li
                key={b.t}
                className="flex items-start gap-4 rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-sm"
              >
                <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                  {b.icon}
                </span>
                <div>
                  <p className="text-base font-bold text-[var(--color-text)]">{b.t}</p>
                  <p className="mt-1 text-sm text-[var(--color-muted)]">{b.d}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── SEO body text ── */}
      <section className="bg-white">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
          <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
            {pageH1}: как мы помогаем
          </h2>
          <div className="prose prose-slate mt-5 max-w-none text-base leading-relaxed text-[var(--color-text)]">
            <p className="text-[var(--color-muted)]">
              Услуга «{data.service.name}» в {cityPrepositional} — частый запрос среди жителей
              города. Мы помогаем найти проверенного мастера, который возьмёт задачу на себя:
              согласует объём, рассчитает стоимость и приедет в удобное время.
            </p>
            <p className="mt-4 text-[var(--color-muted)]">
              Оставьте заявку с описанием задачи и телефоном — её получит мастер, работающий
              по услуге «{data.service.name}» в {cityPrepositional}. Никаких звонков в десять
              разных мест и никаких публичных объявлений с вашим номером.
            </p>
            <p className="mt-4 text-[var(--color-muted)]">
              Если задача срочная или объёмная, отметьте это в комментарии. Мастер свяжется
              первым и предложит ближайшее окно для выезда или начала работ.
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
              Частые вопросы
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
              Что важно знать
            </h2>
          </div>
          <div className="mt-8 grid gap-3">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm sm:p-6"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-[var(--color-text)]">
                  {item.q}
                  <span
                    aria-hidden
                    className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)] transition-transform group-open:rotate-45"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </svg>
                  </span>
                </summary>
                <p className="mt-4 text-sm leading-relaxed text-[var(--color-muted)]">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

// ── Small components ────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 flex-shrink-0 text-[var(--color-primary)]"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CheckMicroIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-shrink-0 text-[var(--color-primary)]"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 22s8-4 8-10V6l-8-3-8 3v6c0 6 8 10 8 10z" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
    </svg>
  );
}

function pluralMasters(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "мастеров";
  if (mod10 === 1) return "мастер";
  if (mod10 >= 2 && mod10 <= 4) return "мастера";
  return "мастеров";
}
