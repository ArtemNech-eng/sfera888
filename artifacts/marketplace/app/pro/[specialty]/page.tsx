import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchProCommunity, type ProFeedItem } from "../../../lib/communityApi";
import { fetchCities } from "../../../lib/api";
import { publicUrl } from "../../../lib/env";
import { getCurrentMaster } from "../../../lib/cabinetAuth";
import { breadcrumbJsonLd, toJsonLdScript } from "../../../lib/jsonLd";

/**
 * PRO_Zone — публичная зона мастеров «Хочу также ПРО», страница специальности
 * `/pro/[specialty]` (spec task 13.2).
 *
 * Потребляет `GET /api/community/pro/:specialtySlug` через server-to-server
 * клиент `lib/communityApi.ts` (Requirement 20.6 — без прямого доступа к БД).
 *
 * Поведение ленты (Requirements 6.1, 6.2, 6.4, 6.6):
 *   • По умолчанию — All_Russia_Feed для выбранной Specialty (Requirement 6.2).
 *   • My_City_Filter активируется ТОЛЬКО явно, через query-параметры
 *     `?cityFilter=true&cityId=<id>` (Requirement 6.6); при активации лента
 *     ограничивается локальными темами города, а при их отсутствии остаётся
 *     пустой без отката к All_Russia (Requirements 6.4, 6.5). Переключатель
 *     ниже отражает и переключает это состояние ссылками (server-rendered).
 *
 * Индексация (Requirement 6.7): базовая страница PRO_Public_Layer индексируется
 * и попадает в canonical. Отфильтрованные по «Моему городу» представления
 * помечаются `noindex, follow`, чтобы не плодить «тонкие»/дублирующие страницы.
 *
 * PRO_Protected_Layer (Requirement 7): на странице присутствует гейт закрытого
 * слоя. Подтверждённым мастерам (активная сессия master-pwa) предлагается вход
 * в закрытый раздел; анонимам/неподтверждённым — предложение пройти
 * подтверждение членства (Requirement 7.4). Чувствительный контент здесь не
 * рендерится, поэтому публичная страница остаётся безопасной для индексации.
 */

export const dynamic = "force-dynamic";

const PRO_FEED_LIMIT = 30;

interface RouteParams {
  specialty: string;
}

interface SearchParams {
  cityFilter?: string;
  cityId?: string;
}

/** Явное включение My_City_Filter — только строки "true"/"1" (Requirement 6.6). */
function isCityFilterApplied(raw: string | undefined): boolean {
  return raw === "true" || raw === "1";
}

/** Разобрать положительный целочисленный cityId из query. */
function parseCityId(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function generateMetadata(
  { params, searchParams }: {
    params: Promise<RouteParams>;
    searchParams: Promise<SearchParams>;
  },
): Promise<Metadata> {
  const { specialty: specialtySlug } = await params;
  const sp = await searchParams;
  const cityFilterApplied = isCityFilterApplied(sp.cityFilter);

  const data = await fetchProCommunity(specialtySlug, { limit: 1 });
  if (!data) {
    return { title: "Сообщество мастеров — Честные мастера" };
  }

  const name = data.specialty.name;
  const title = `${name} — сообщество мастеров, вся Россия — Честные мастера`;
  const description =
    `Профессиональное сообщество «${name}»: инструменты, материалы, цены, лайфхаки и разбор ошибок. ` +
    `Лента «Вся Россия» и фильтр «Мой город».`;

  // Публичный слой индексируется (Requirement 6.7); отфильтрованные по городу
  // представления держим вне индекса, чтобы не создавать «тонкие» дубли.
  return {
    title,
    description,
    alternates: { canonical: `${publicUrl()}/pro/${data.specialty.slug}` },
    robots: cityFilterApplied ? { index: false, follow: true } : undefined,
  };
}

export default async function ProSpecialtyPage(
  { params, searchParams }: {
    params: Promise<RouteParams>;
    searchParams: Promise<SearchParams>;
  },
) {
  const { specialty: specialtySlug } = await params;
  const sp = await searchParams;
  const cityFilterApplied = isCityFilterApplied(sp.cityFilter);
  const cityId = parseCityId(sp.cityId);

  // My_City_Filter применяется только при явном включении И выбранном городе
  // (Requirement 6.6). Если фильтр запрошен без города — не активируем его на
  // бэкенде, но UI покажет приглашение выбрать город.
  const applyFilter = cityFilterApplied && cityId != null;

  const [data, cities, master] = await Promise.all([
    fetchProCommunity(specialtySlug, {
      cityFilter: applyFilter,
      cityId,
      limit: PRO_FEED_LIMIT,
    }),
    fetchCities(),
    getCurrentMaster(),
  ]);

  if (!data) notFound();

  const { specialty, feed } = data;
  const selectedCity = cityId != null ? cities.find((c) => c.id === cityId) ?? null : null;
  const isConfirmedMaster = master != null;

  const buildUrl = (overrides: { cityFilter?: boolean; cityId?: number | null }) => {
    const p = new URLSearchParams();
    const wantFilter = overrides.cityFilter ?? cityFilterApplied;
    const wantCity = overrides.cityId === null ? null : overrides.cityId ?? cityId;
    if (wantFilter) {
      p.set("cityFilter", "true");
      if (wantCity != null) p.set("cityId", String(wantCity));
    }
    const qs = p.toString();
    return `/pro/${specialty.slug}${qs ? `?${qs}` : ""}`;
  };

  const breadcrumbsLd = breadcrumbJsonLd([
    { name: "Главная", url: `${publicUrl()}/` },
    { name: "ПРО-сообщество", url: `${publicUrl()}/pro/${specialty.slug}` },
    { name: specialty.name, url: `${publicUrl()}/pro/${specialty.slug}` },
  ]);

  const feedIsMyCity = feed.feedMode === "my_city";

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLdScript(breadcrumbsLd) }}
      />

      {/* Hero */}
      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-5xl px-4 pb-8 pt-10 sm:px-6 sm:pb-10 sm:pt-14">
          <nav className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
            <Link href="/" className="hover:text-[var(--color-text)]">Главная</Link>
            <span aria-hidden>/</span>
            <span className="text-[var(--color-text)]">ПРО-сообщество</span>
          </nav>
          <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
            Хочу также ПРО
          </p>
          <h1 className="font-display mt-4 text-4xl text-[var(--color-text)] sm:text-5xl">
            {specialty.name}.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--color-muted)] sm:text-lg">
            Профессиональное сообщество: инструменты, материалы, цены, лайфхаки и
            разбор ошибок. Читайте ленту «Вся Россия» или переключитесь на рабочие
            вопросы своего города.
          </p>
        </div>
      </section>

      {/* My_City_Filter toggle (Requirements 6.2, 6.4, 6.6) */}
      <section className="border-y border-[var(--color-border)] bg-[var(--color-background)]">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Лента:
            </span>

            {/* Вся Россия (по умолчанию) */}
            <Link
              href={buildUrl({ cityFilter: false, cityId: null })}
              aria-current={!cityFilterApplied ? "true" : undefined}
              className={`rounded-full border px-4 py-1.5 text-sm transition ${
                !cityFilterApplied
                  ? "border-[var(--color-primary)] bg-[var(--color-cta)] text-[var(--color-on-cta)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-primary)]"
              }`}
            >
              Вся Россия
            </Link>

            {/* Мой город (активируется только явно) */}
            <span
              className={`rounded-full border px-4 py-1.5 text-sm ${
                cityFilterApplied
                  ? "border-[var(--color-primary)] bg-[var(--color-cta)] text-[var(--color-on-cta)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]"
              }`}
            >
              Мой город{selectedCity ? `: ${selectedCity.name}` : ""}
            </span>
          </div>

          {/* Выбор города для My_City_Filter */}
          {cities.length > 0 ? (
            <details className="group mt-3" open={cityFilterApplied && !selectedCity}>
              <summary className="cursor-pointer text-xs text-[var(--color-muted)] hover:text-[var(--color-primary)]">
                {cityFilterApplied ? "Сменить город ↓" : "Выбрать «Мой город» ↓"}
              </summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {cities.slice(0, 40).map((c) => (
                  <Link
                    key={c.id}
                    href={buildUrl({ cityFilter: true, cityId: c.id })}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      cityId === c.id
                        ? "border-[var(--color-primary)] bg-[var(--color-cta)] text-[var(--color-on-cta)]"
                        : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-primary)]"
                    }`}
                  >
                    {c.name}
                  </Link>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </section>

      {/* Feed */}
      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-4 flex items-center gap-2 text-sm text-[var(--color-muted)]">
          {feedIsMyCity ? (
            <span>
              Локальные рабочие вопросы
              {selectedCity ? ` — ${selectedCity.name}` : ""}
            </span>
          ) : (
            <span>Профессиональные темы со всей России</span>
          )}
        </div>

        {feed.emptyState ? (
          <EmptyFeed
            myCity={feedIsMyCity}
            cityName={selectedCity?.name ?? null}
            allRussiaHref={buildUrl({ cityFilter: false, cityId: null })}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {feed.items.map((item) => (
              <li key={item.id}>
                <ProThreadCard item={item} />
              </li>
            ))}
          </ul>
        )}

        {feed.nextCursor ? (
          <p className="mt-6 text-center text-xs text-[var(--color-muted)]">
            Показаны последние темы сообщества.
          </p>
        ) : null}
      </section>

      {/* PRO_Protected_Layer gate (Requirement 7) */}
      <ProtectedGate confirmed={isConfirmedMaster} specialtyName={specialty.name} />
    </>
  );
}

const PRO_CATEGORY_LABELS: Record<string, string> = {
  tools: "Инструменты",
  materials: "Материалы",
  prices: "Цены",
  lifehacks: "Лайфхаки",
  error_analysis: "Разбор ошибок",
};

function categoryLabel(category: string | null): string | null {
  if (!category) return null;
  return PRO_CATEGORY_LABELS[category] ?? category;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function ProThreadCard({ item }: { item: ProFeedItem }) {
  const label = categoryLabel(item.category);
  const excerpt = item.body.length > 240 ? `${item.body.slice(0, 240).trimEnd()}…` : item.body;
  return (
    <article className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition hover:border-[var(--color-primary)]">
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
        {label ? (
          <span className="rounded-full bg-[var(--color-cream-deep)] px-2.5 py-0.5 font-medium text-[var(--color-text)]">
            {label}
          </span>
        ) : null}
        {item.isLocal ? (
          <span className="rounded-full border border-[var(--color-border)] px-2.5 py-0.5">
            Мой город
          </span>
        ) : null}
        <span>{formatDate(item.lastActivityAt || item.createdAt)}</span>
      </div>
      <h2 className="mt-2 text-lg font-semibold text-[var(--color-text)]">{item.title}</h2>
      {excerpt ? (
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-muted)]">{excerpt}</p>
      ) : null}
    </article>
  );
}

function EmptyFeed({
  myCity,
  cityName,
  allRussiaHref,
}: {
  myCity: boolean;
  cityName: string | null;
  allRussiaHref: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
      {myCity ? (
        <>
          <p className="text-base text-[var(--color-text)]">
            Локальных тем{cityName ? ` в городе ${cityName}` : ""} пока нет
          </p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Будьте первым, кто задаст локальный рабочий вопрос, или{" "}
            <Link href={allRussiaHref} className="underline hover:text-[var(--color-primary)]">
              вернитесь к ленте «Вся Россия»
            </Link>
            .
          </p>
        </>
      ) : (
        <>
          <p className="text-base text-[var(--color-text)]">В этом сообществе пока нет тем</p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Скоро здесь появятся профессиональные обсуждения. Загляните позже.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Гейт закрытого слоя PRO_Protected_Layer (Requirement 7). Подтверждённым
 * мастерам предлагается вход; анонимам/неподтверждённым — предложение пройти
 * подтверждение членства (Requirement 7.4). Чувствительный контент не
 * рендерится на публичной странице.
 */
function ProtectedGate({ confirmed, specialtyName }: { confirmed: boolean; specialtyName: string }) {
  return (
    <section className="border-t border-[var(--color-border)] bg-[var(--color-cream-deep)]">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Закрытый раздел ПРО
          </div>
          <h2 className="mt-3 text-xl font-semibold text-[var(--color-text)]">
            Чувствительные темы — только для подтверждённых мастеров
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-muted)]">
            Чёрные списки клиентов, споры по объектам и другой чувствительный
            контент доступны в закрытом разделе сообщества «{specialtyName}».
            Раздел закрыт от индексации и открыт только участникам с подтверждённым
            членством.
          </p>

          {confirmed ? (
            <Link
              href={`/cabinet`}
              className="mt-5 inline-flex h-11 items-center rounded-full bg-[var(--color-cta)] px-6 text-sm font-semibold text-[var(--color-on-cta)] transition hover:bg-[var(--color-cta-hover)]"
            >
              Открыть закрытый раздел
            </Link>
          ) : (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="inline-flex h-11 items-center rounded-full bg-[var(--color-cta)] px-6 text-sm font-semibold text-[var(--color-on-cta)] transition hover:bg-[var(--color-cta-hover)]"
              >
                Подтвердить членство
              </Link>
              <span className="text-xs text-[var(--color-muted)]">
                Доступ выдаётся подтверждённым мастерам.
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
