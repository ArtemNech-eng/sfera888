import Link from "next/link";
import type { Metadata } from "next";
import { fetchCommunitySpecialties } from "../../lib/communityApi";
import { publicUrl } from "../../lib/env";
import { breadcrumbJsonLd, toJsonLdScript } from "../../lib/jsonLd";

/**
 * PRO_Zone — индексная страница раздела «Хочу также ПРО» (spec: hochu-takzhe-community).
 *
 * Отдельная от соседского портала точка входа (Requirement 5.3 / 8.1: зоны
 * «Соседи» и PRO изолированы). Список специальностей ведёт на /pro/[slug].
 *
 * Данные — server-to-server через lib/communityApi (Requirement 20.6).
 */

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const title = "Хочу также ПРО — сообщества мастеров по специальностям";
  const description =
    "Профессиональные сообщества мастеров: электрики, сантехники, плиточники, " +
    "отделочники и другие. Цены, инструмент, материалы и разбор сложных объектов.";
  return {
    title,
    description,
    alternates: { canonical: `${publicUrl()}/pro` },
  };
}

export default async function ProHubPage() {
  const specialties = await fetchCommunitySpecialties();

  const breadcrumbsLd = breadcrumbJsonLd([
    { name: "Главная", url: `${publicUrl()}/` },
    { name: "Хочу также ПРО", url: `${publicUrl()}/pro` },
  ]);

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
            <span className="text-[var(--color-text)]">Хочу также ПРО</span>
          </nav>
          <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
            Хочу также ПРО
          </p>
          <h1 className="font-display mt-4 text-4xl text-[var(--color-text)] sm:text-5xl">
            Сообщества мастеров
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--color-muted)] sm:text-lg">
            Профессиональные обсуждения по специальностям: инструмент, материалы,
            цены и разбор сложных объектов. Выберите свою специальность.
          </p>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Ищете соседей по дому и городу? Загляните в раздел{" "}
            <Link href="/soobshchestvo" className="font-medium text-[var(--color-primary)] underline">
              «Соседи»
            </Link>
            .
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        {specialties.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {specialties.map((s) => (
              <li key={s.slug}>
                <Link
                  href={`/pro/${s.slug}`}
                  className="block rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-cozy transition hover:shadow-cozy-md"
                >
                  <span className="font-display text-lg text-[var(--color-text)]">
                    {s.name}
                  </span>
                  <span className="mt-1 block text-sm text-[var(--color-muted)]">
                    Профессиональное сообщество
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[var(--color-muted)]">
            Сообщества скоро появятся. Загляните позже.
          </p>
        )}
      </div>
    </>
  );
}
