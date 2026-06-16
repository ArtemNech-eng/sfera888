import { notFound } from "next/navigation";
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
  const cityPrepositional = data.city.nameIn ?? data.city.name;
  const pageH1 = `${data.service.name} в ${cityPrepositional}`;
  const path = `/${serviceSlug}/${citySlug}`;
  return {
    title: `${pageH1} — Честные мастера`,
    description: `Оставьте заявку на услугу «${data.service.name}» в ${cityPrepositional}. Подберём проверенного мастера.`,
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

const TRUST_BLOCKS: Array<{ t: string; d: string }> = [
  {
    t: "Заявки не публикуются открыто",
    d: "Ваше описание задачи не появится в открытом доступе на сайте.",
  },
  {
    t: "Телефон не показывается публично",
    d: "Контакт получает только мастер, которого подбираем под вашу задачу.",
  },
  {
    t: "Задача уходит в систему",
    d: "Мастера получают её в личном кабинете — без массовых рассылок и спама.",
  },
  {
    t: "Можно описать задачу заранее",
    d: "Опишите подробно, что нужно сделать, ещё до звонка мастера.",
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

  // Description that mirrors generateMetadata so the schema.org block,
  // <meta description>, and the visible body all tell the same story.
  const seoDescription =
    `Оставьте заявку на услугу «${data.service.name}» в ${cityPrepositional}. ` +
    `Подберём проверенного мастера.`;

  // schema.org payloads. Built only from trusted server-side data
  // (api-server response + env), never from request body or query string.
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
      {/* schema.org JSON-LD — emitted server-side, never built from user input. */}
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

      {/* Hero */}
      <section className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
          <h1 className="text-3xl font-semibold text-[var(--color-text)] sm:text-5xl">
            {pageH1}
          </h1>
          <p className="mt-3 text-base text-[var(--color-muted)] sm:text-lg">
            Оставьте заявку — подберём проверенного мастера в вашем городе.
          </p>
          <ul className="mt-5 flex flex-wrap gap-2">
            {HERO_BADGES.map((badge) => (
              <li
                key={badge}
                className="rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1 text-sm text-[var(--color-muted)]"
              >
                {badge}
              </li>
            ))}
          </ul>
          <a
            href="#lead-form"
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-[var(--color-primary)] px-5 py-3 text-base font-medium text-white transition hover:bg-[var(--color-primary-hover)] sm:hidden"
          >
            Оставить заявку
          </a>
        </div>
      </section>

      {/* Form + side info — form first on mobile */}
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
          {/* Lead form */}
          <div
            id="lead-form"
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-6 lg:order-2"
          >
            <h2 className="text-xl font-semibold text-[var(--color-text)] sm:text-2xl">
              Опишите задачу — подберём мастера
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Перезвоним в течение часа в рабочее время.
            </p>
            <div className="mt-5">
              <LeadForm
                citySlug={data.city.slug}
                serviceSlug={data.service.slug}
                sourcePageUrl={sourcePageUrl}
              />
            </div>
          </div>

          {/* Price + examples + stats */}
          <div className="grid content-start gap-4 lg:order-1">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6">
              <h2 className="text-xl font-semibold text-[var(--color-text)] sm:text-2xl">
                {hasPrice ? `Цены от ${data.service.priceFrom} ₽` : "Сколько стоит услуга"}
              </h2>
              <p className="mt-2 text-sm text-[var(--color-muted)] sm:text-base">
                {hasPrice
                  ? `Базовая ставка для услуги «${data.service.name}» в ${cityPrepositional}. Точную стоимость мастер сориентирует после уточнения задачи.`
                  : "Стоимость зависит от объёма работ — мастер сориентирует после уточнения задачи."}
              </p>
              <ul className="mt-4 grid gap-2 text-sm text-[var(--color-text)] sm:text-base">
                {WORK_EXAMPLES.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span
                      aria-hidden
                      className="mt-2 inline-block h-1.5 w-1.5 flex-none rounded-full bg-[var(--color-primary)]"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Stat label="Мастеров в городе" value={String(data.stats.mastersCount)} />
              <Stat
                label="Цена от"
                value={data.stats.minPrice != null ? `${data.stats.minPrice} ₽` : "—"}
              />
              <Stat
                label="Средняя оценка"
                value={data.stats.avgRating != null ? data.stats.avgRating.toFixed(1) : "—"}
              />
              <Stat label="Отзывы клиентов" value={String(data.stats.reviewsCount)} />
            </div>
          </div>
        </div>
      </section>

      {/* Masters list — top published in this city offering this service */}
      {data.masters.length > 0 ? (
        <section className="border-t border-[var(--color-border)] bg-[var(--color-background)]">
          <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-2xl font-semibold text-[var(--color-text)]">
                Мастера: {data.service.name} в {cityPrepositional}
              </h2>
              <span className="text-sm text-[var(--color-muted)]">
                Найдено: {data.masters.length}
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

      {/* How it works */}
      <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h2 className="text-2xl font-semibold text-[var(--color-text)]">Как это работает</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
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
                <div className="text-3xl font-semibold text-[var(--color-primary)]">{s.n}</div>
                <div className="mt-2 text-base font-medium text-[var(--color-text)]">{s.t}</div>
                <div className="mt-1 text-sm text-[var(--color-muted)]">{s.d}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Trust */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 className="text-2xl font-semibold text-[var(--color-text)]">
          Почему через «Честных мастеров»
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {TRUST_BLOCKS.map((b) => (
            <li
              key={b.t}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
            >
              <div className="text-base font-medium text-[var(--color-text)]">{b.t}</div>
              <div className="mt-1 text-sm text-[var(--color-muted)]">{b.d}</div>
            </li>
          ))}
        </ul>
      </section>

      {/* SEO body text */}
      <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
          <h2 className="text-2xl font-semibold text-[var(--color-text)]">
            {pageH1}: как мы помогаем
          </h2>
          <div className="mt-4 grid gap-3 text-base text-[var(--color-muted)]">
            <p>
              Услуга «{data.service.name}» в {cityPrepositional} — частый запрос среди жителей
              города. Мы помогаем найти проверенного мастера, который возьмёт задачу на себя:
              согласует объём, рассчитает стоимость и приедет в удобное время.
            </p>
            <p>
              Оставьте заявку с описанием задачи и телефоном — её получит мастер, работающий
              по услуге «{data.service.name}» в {cityPrepositional}. Никаких звонков в десять
              разных мест и никаких публичных объявлений с вашим номером.
            </p>
            <p>
              Если задача срочная или объёмная, отметьте это в комментарии. Мастер свяжется
              первым и предложит ближайшее окно для выезда или начала работ.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h2 className="text-2xl font-semibold text-[var(--color-text)]">Частые вопросы</h2>
        <div className="mt-6 grid gap-3">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="group rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
            >
              <summary className="cursor-pointer list-none text-base font-medium text-[var(--color-text)]">
                {item.q}
              </summary>
              <p className="mt-3 text-sm text-[var(--color-muted)]">{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="text-xs uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
      <div className="mt-1 text-xl font-semibold text-[var(--color-text)]">{value}</div>
    </div>
  );
}
