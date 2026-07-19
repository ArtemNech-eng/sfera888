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
import type { ServiceCityResponse } from "../../../lib/types";

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
  // city-launch-model (решение №3): пре-лонч город — длинный хвост «услуга×город»
  // НЕ индексируем (только хаб + контент). Отдаём noindex,follow и честный тайтл.
  // Проверка строго `=== false`: если поле отсутствует (старый api-server во время
  // выката), ведём себя как launched — безопасный фолбэк, Краснодар не ломается.
  if (data.city.isLaunched === false) {
    const cityIn = data.city.nameIn ?? data.city.name;
    return {
      title: { absolute: `${data.service.name} в ${cityIn} — скоро запускаемся` },
      description: `Мы готовимся к запуску услуги «${data.service.name}» в ${cityIn}. Оставьте заявку в лист ожидания — сообщим, как только подключим проверенных мастеров.`,
      robots: { index: false, follow: true },
    };
  }
  const meta = buildServiceCityMeta(data);
  return {
    title: { absolute: meta.title },
    description: meta.description,
    alternates: { canonical: `${publicUrl()}${path}` },
  };
}

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

const STEPS: Array<{ n: string; t: string; d: (svc: string, city: string) => string }> = [
  {
    n: "01",
    t: "Опишите задачу",
    d: () => "Заполните короткую форму. Это занимает около минуты — нужны телефон, город и пара слов про работу.",
  },
  {
    n: "02",
    t: "Подбираем мастера",
    d: (svc, city) => `Заявка уходит мастерам, которые работают с услугой «${svc}» в ${city}. Без массовых рассылок.`,
  },
  {
    n: "03",
    t: "Мастер связывается с вами",
    d: () => "Уточняет детали, согласует время и цену до начала работ. Договор и оплата — напрямую с мастером.",
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

  // city-launch-model (решение №3): для пре-лонч городов (isLaunched=false) не
  // показываем каталог мастеров и обычную форму «мастер перезвонит». Вместо этого
  // — честный экран: лист ожидания для клиента + набор мастеров. Страница уже
  // помечена noindex в generateMetadata и исключена из sitemap. Launched-путь
  // (Краснодар) ниже не меняется. Проверка строго `=== false`: отсутствие поля
  // (старый api-server во время выката) трактуем как launched — безопасный фолбэк.
  if (data.city.isLaunched === false) {
    return <PreLaunchServiceCity data={data} serviceSlug={serviceSlug} citySlug={citySlug} />;
  }

  const cityPrepositional = data.city.nameIn ?? data.city.name;
  const pageH1 = `${data.service.name} в ${cityPrepositional}`;
  const sourcePageUrl = `${publicUrl()}/${serviceSlug}/${citySlug}`;
  const hasPrice = data.service.priceFrom != null && data.service.priceFrom > 0;

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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdScript(breadcrumbsLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdScript(serviceLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdScript(faqLd) }} />

      {/* ── Hero ── */}
      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 pb-12 pt-10 sm:px-6 sm:pb-16 sm:pt-14">
          <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-muted)]">
            <Link href="/" className="hover:text-[var(--color-text)]">Главная</Link>
            <span aria-hidden>/</span>
            <Link href="/uslugi" className="hover:text-[var(--color-text)]">Услуги</Link>
            <span aria-hidden>/</span>
            <span className="text-[var(--color-text)]">{pageH1}</span>
          </nav>

          <p className="font-eyebrow mt-8">{data.city.name}</p>
          <h1 className="font-display mt-3 max-w-3xl text-4xl text-[var(--color-text)] sm:text-5xl lg:text-[3.5rem]">
            {pageH1}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--color-muted)] sm:text-lg">
            Оставьте заявку — подберём проверенного мастера. Без звонков в десять
            мест и без публичных объявлений с вашим номером.
          </p>

          {/* Inline neutral stats — only what's real, no fake metrics */}
          {(data.stats.mastersCount > 0 || hasPrice || data.stats.avgRating != null) ? (
            <p className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm text-[var(--color-muted)]">
              {data.stats.mastersCount > 0 ? (
                <span>
                  <span className="font-semibold text-[var(--color-text)]">
                    {formatNumber(data.stats.mastersCount)}
                  </span>{" "}
                  {pluralMasters(data.stats.mastersCount)} в городе
                </span>
              ) : null}
              {hasPrice && data.service.priceFrom != null ? (
                <span>
                  от{" "}
                  <span className="font-semibold text-[var(--color-text)]">
                    {formatNumber(data.service.priceFrom)} ₽
                  </span>
                </span>
              ) : data.stats.minPrice != null ? (
                <span>
                  от{" "}
                  <span className="font-semibold text-[var(--color-text)]">
                    {formatNumber(data.stats.minPrice)} ₽
                  </span>
                </span>
              ) : null}
              {data.stats.avgRating != null ? (
                <span>
                  оценка{" "}
                  <span className="font-semibold text-[var(--color-text)]">
                    {data.stats.avgRating.toFixed(1)}
                  </span>
                </span>
              ) : null}
            </p>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="#lead-form"
              className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--color-cta)] px-6 text-sm font-semibold text-[var(--color-on-cta)] shadow-cozy-md transition hover:bg-[var(--color-cta-hover)]"
            >
              Оставить заявку
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
            <Link
              href={`/kalkulyator?city=${encodeURIComponent(citySlug)}`}
              className="inline-flex h-12 items-center rounded-full border border-[var(--color-text)] bg-transparent px-6 text-sm font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-text)] hover:text-white"
            >
              Калькулятор бюджета
            </Link>
          </div>
        </div>
      </section>

      {/* ── Form + price card two-column ── */}
      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-20">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:gap-10">
            {/* Price + work examples */}
            <div className="space-y-4">
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-7 shadow-cozy sm:p-9">
                <p className="font-eyebrow">Стоимость</p>
                <h2 className="font-display mt-3 text-2xl text-[var(--color-text)] sm:text-3xl">
                  {hasPrice && data.service.priceFrom != null
                    ? `от ${formatNumber(data.service.priceFrom)} ₽`
                    : "По запросу"}
                </h2>
                <p className="mt-4 text-base leading-relaxed text-[var(--color-muted)]">
                  {hasPrice
                    ? `Базовая ставка по услуге «${data.service.name}» в ${cityPrepositional}. Точную сумму мастер сориентирует после уточнения задачи. Договор и оплата — напрямую.`
                    : `Стоимость услуги «${data.service.name.toLowerCase()}» зависит от объёма работ — мастер сориентирует после уточнения задачи. Базовый выезд на осмотр обычно бесплатный.`}
                </p>
              </div>

              {/* Calculator teaser */}
              <Link
                href={`/kalkulyator?city=${encodeURIComponent(citySlug)}`}
                className="group flex items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-cream-deep)] p-6 transition hover:-translate-y-0.5 hover:border-[var(--color-text)] hover:shadow-cozy sm:p-7"
              >
                <div className="flex-1">
                  <p className="font-display text-xl text-[var(--color-text)] sm:text-2xl">
                    Прикинуть бюджет ремонта в {cityPrepositional}.
                  </p>
                  <p className="mt-2 text-sm text-[var(--color-muted)]">
                    Калькулятор по реальным сделкам и региональным коэффициентам.
                  </p>
                </div>
                <span className="hidden text-sm font-medium text-[var(--color-text)] transition group-hover:translate-x-1 group-hover:text-[var(--color-primary)] sm:inline">
                  →
                </span>
              </Link>
            </div>

            {/* Lead form sticky */}
            <aside>
              <div
                id="lead-form"
                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-cozy-md sm:p-7 lg:sticky lg:top-20"
              >
                <h2 className="font-display text-2xl text-[var(--color-text)] sm:text-3xl">
                  Опишите задачу.
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
                  Подберём мастера и перезвоним в течение часа в рабочее время.
                </p>
                <p className="mt-4 text-xs text-[var(--color-faint)]">
                  Услуга: {data.service.name} · Город: {data.city.name}
                </p>
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
        <section className="bg-[var(--color-cream-deep)]">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="max-w-2xl">
                <h2 className="font-display text-3xl text-[var(--color-text)] sm:text-4xl">
                  Мастера: {data.service.name} в {cityPrepositional}.
                </h2>
                <p className="mt-3 text-base leading-relaxed text-[var(--color-muted)]">
                  Каждый прошёл собеседование, стажировку и работает по договору.
                </p>
              </div>
              <span className="hidden text-sm text-[var(--color-muted)] sm:inline">
                {data.masters.length} {pluralMasters(data.masters.length)}
              </span>
            </div>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl text-[var(--color-text)] sm:text-4xl">
              Три шага до мастера.
            </h2>
          </div>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n}>
                <p className="font-display text-5xl text-[var(--color-primary)]">
                  {s.n}
                </p>
                <h3 className="font-display mt-4 text-xl text-[var(--color-text)] sm:text-2xl">
                  {s.t}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">
                  {s.d(data.service.name, cityPrepositional)}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Trust block — editorial paragraphs, no icon-tile grid ── */}
      <section className="bg-[var(--color-cream-deep)]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <h2 className="font-display text-3xl text-[var(--color-text)] sm:text-4xl">
                Защищаем ваше время и контакт.
              </h2>
            </div>
            <div className="space-y-6">
              <div>
                <h3 className="font-display text-xl text-[var(--color-text)]">
                  Заявка не публикуется открыто.
                </h3>
                <p className="mt-2 text-base leading-relaxed text-[var(--color-muted)]">
                  Описание задачи и телефон не появляются в публичных объявлениях.
                  Контакт получает только тот мастер, которого мы подбираем под
                  вашу задачу.
                </p>
              </div>
              <div>
                <h3 className="font-display text-xl text-[var(--color-text)]">
                  Без массовых звонков и спама.
                </h3>
                <p className="mt-2 text-base leading-relaxed text-[var(--color-muted)]">
                  Заявка уходит в систему — мастера получают её в личном кабинете.
                  Никаких сторонних колл-центров и массовых рассылок.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SEO body text ── */}
      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
          <h2 className="font-display text-3xl text-[var(--color-text)] sm:text-4xl">
            {pageH1}: как мы помогаем.
          </h2>
          <div className="mt-6 space-y-4 text-base leading-relaxed text-[var(--color-muted)] sm:text-lg sm:leading-[1.7]">
            <p>
              Услуга «{data.service.name}» в {cityPrepositional} — частый запрос
              среди жителей города. Мы помогаем найти проверенного мастера,
              который возьмёт задачу на себя: согласует объём, рассчитает
              стоимость и приедет в удобное время.
            </p>
            <p>
              Оставьте заявку с описанием задачи и телефоном — её получит мастер,
              работающий по услуге «{data.service.name}» в {cityPrepositional}.
              Никаких звонков в десять разных мест и никаких публичных объявлений
              с вашим номером.
            </p>
            <p>
              Если задача срочная или объёмная, отметьте это в комментарии.
              Мастер свяжется первым и предложит ближайшее окно для выезда или
              начала работ.
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="bg-[var(--color-cream-deep)]">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
          <h2 className="font-display text-3xl text-[var(--color-text)] sm:text-4xl">
            Частые вопросы.
          </h2>
          <div className="mt-10 divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
            {FAQ.map((item) => (
              <details key={item.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-base font-semibold text-[var(--color-text)] sm:text-lg">
                  <span className="font-display flex-1">{item.q}</span>
                  <span
                    aria-hidden
                    className="mt-1 text-xl text-[var(--color-faint)] transition group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-4 text-base leading-relaxed text-[var(--color-muted)]">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
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

// Внешний лендинг набора мастеров (используется в шапке/футере маркетплейса).
const FOR_MASTERS_URL = "https://sfera-master.ru/masteram";

/**
 * Пре-лонч экран услуги×города (city-launch-model, решение №3).
 *
 * Рендерится, когда город ещё не запущен операционно (`city.isLaunched=false`):
 * мастеров в городе нет, поэтому мы НЕ обещаем «мастер перезвонит» и не
 * показываем каталог. Вместо этого — честный CTA: лист ожидания для клиента
 * (фиксируем спрос) + набор мастеров («работайте с нами в городе»). Именно
 * набор мастеров превращает SEO-трафик в то, что нужно для запуска города.
 *
 * Страница помечена noindex (см. generateMetadata) и исключена из sitemap.
 */
function PreLaunchServiceCity(
  { data, serviceSlug, citySlug }: { data: ServiceCityResponse; serviceSlug: string; citySlug: string },
) {
  const cityIn = data.city.nameIn ?? data.city.name;
  const cityName = data.city.name;
  const pageH1 = `${data.service.name} в ${cityIn}`;
  const sourcePageUrl = `${publicUrl()}/${serviceSlug}/${citySlug}`;

  const breadcrumbsLd = breadcrumbJsonLd([
    { name: "Главная", url: `${publicUrl()}/` },
    { name: "Услуги", url: `${publicUrl()}/uslugi` },
    { name: pageH1, url: sourcePageUrl },
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdScript(breadcrumbsLd) }} />

      {/* ── Hero ── */}
      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 pb-12 pt-10 sm:px-6 sm:pb-16 sm:pt-14">
          <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-muted)]">
            <Link href="/" className="hover:text-[var(--color-text)]">Главная</Link>
            <span aria-hidden>/</span>
            <Link href="/uslugi" className="hover:text-[var(--color-text)]">Услуги</Link>
            <span aria-hidden>/</span>
            <span className="text-[var(--color-text)]">{pageH1}</span>
          </nav>

          <p className="font-eyebrow mt-8">{cityName} · скоро</p>
          <h1 className="font-display mt-3 max-w-3xl text-4xl text-[var(--color-text)] sm:text-5xl lg:text-[3.5rem]">
            {pageH1}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--color-muted)] sm:text-lg">
            Мы пока не работаем в {cityIn}, но готовимся к запуску. Оставьте заявку
            в лист ожидания — как только подключим проверенных мастеров, сообщим
            вам первыми. Никаких публичных объявлений с вашим номером.
          </p>
        </div>
      </section>

      {/* ── Waitlist form + info ── */}
      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-20">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:gap-10">
            <div className="space-y-4">
              {/* Master recruitment — превращает трафик в мастеров для запуска */}
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-cream-deep)] p-7 shadow-cozy sm:p-9">
                <p className="font-eyebrow">Вы мастер в {cityIn}?</p>
                <h2 className="font-display mt-3 text-2xl text-[var(--color-text)] sm:text-3xl">
                  Мы открываем город и набираем команду.
                </h2>
                <p className="mt-4 text-base leading-relaxed text-[var(--color-muted)]">
                  Ищем проверенных мастеров по услуге «{data.service.name}» в {cityIn}.
                  Подключение бесплатное, заявки от клиентов — без вложений в рекламу.
                </p>
                <a
                  href={FOR_MASTERS_URL}
                  className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-[var(--color-cta)] px-6 text-sm font-semibold text-[var(--color-on-cta)] shadow-cozy-md transition hover:bg-[var(--color-cta-hover)]"
                >
                  Работать с нами
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </a>
              </div>

              {/* Calculator teaser — полезный контент, работает и до запуска */}
              <Link
                href={`/kalkulyator?city=${encodeURIComponent(citySlug)}`}
                className="group flex items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 transition hover:-translate-y-0.5 hover:border-[var(--color-text)] hover:shadow-cozy sm:p-7"
              >
                <div className="flex-1">
                  <p className="font-display text-xl text-[var(--color-text)] sm:text-2xl">
                    Прикинуть бюджет ремонта в {cityIn}.
                  </p>
                  <p className="mt-2 text-sm text-[var(--color-muted)]">
                    Калькулятор по региональным коэффициентам — доступен уже сейчас.
                  </p>
                </div>
                <span className="hidden text-sm font-medium text-[var(--color-text)] transition group-hover:translate-x-1 group-hover:text-[var(--color-primary)] sm:inline">
                  →
                </span>
              </Link>

              {/* Community hub — контентный якорь города */}
              <Link
                href={`/goroda/${encodeURIComponent(citySlug)}`}
                className="group flex items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 transition hover:-translate-y-0.5 hover:border-[var(--color-text)] hover:shadow-cozy sm:p-7"
              >
                <div className="flex-1">
                  <p className="font-display text-xl text-[var(--color-text)] sm:text-2xl">
                    Сообщество соседей {cityName}.
                  </p>
                  <p className="mt-2 text-sm text-[var(--color-muted)]">
                    Вопросы о ремонте, ЖКХ и жилых комплексах — обсуждения жителей города.
                  </p>
                </div>
                <span className="hidden text-sm font-medium text-[var(--color-text)] transition group-hover:translate-x-1 group-hover:text-[var(--color-primary)] sm:inline">
                  →
                </span>
              </Link>
            </div>

            {/* Waitlist lead form */}
            <aside>
              <div
                id="lead-form"
                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-cozy-md sm:p-7 lg:sticky lg:top-20"
              >
                <h2 className="font-display text-2xl text-[var(--color-text)] sm:text-3xl">
                  Лист ожидания.
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
                  Оставьте контакт — напишем, как только запустимся в {cityIn} и
                  подберём мастера под вашу задачу.
                </p>
                <p className="mt-4 text-xs text-[var(--color-faint)]">
                  Услуга: {data.service.name} · Город: {cityName}
                </p>
                <div className="mt-5">
                  <LeadForm
                    citySlug={data.city.slug}
                    serviceSlug={data.service.slug}
                    sourcePageUrl={sourcePageUrl}
                    submitLabel="Записаться в лист ожидания"
                    commentPrefix={`Лист ожидания — город ${cityName} ещё не запущен`}
                  />
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* ── SEO body text (честный, без обещания мастеров) ── */}
      <section className="bg-[var(--color-cream-deep)]">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
          <h2 className="font-display text-3xl text-[var(--color-text)] sm:text-4xl">
            {pageH1}: скоро.
          </h2>
          <div className="mt-6 space-y-4 text-base leading-relaxed text-[var(--color-muted)] sm:text-lg sm:leading-[1.7]">
            <p>
              Мы поэтапно открываем города и подключаем в каждом проверенных
              мастеров. {cityIn} — в ближайших планах: сейчас формируем команду
              исполнителей по услуге «{data.service.name}».
            </p>
            <p>
              Оставьте заявку в лист ожидания — как только в {cityIn} появятся
              мастера, мы свяжемся с вами и поможем подобрать исполнителя под
              задачу. А если вы сами мастер — присоединяйтесь к запуску города.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
