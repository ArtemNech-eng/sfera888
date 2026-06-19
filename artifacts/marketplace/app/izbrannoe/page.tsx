import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { fetchSaves } from "../../lib/api";
import { CaseCard } from "../../components/CaseCard";
import { publicUrl } from "../../lib/env";

/**
 * `/izbrannoe` — anonymous saved cases (plan §22 Iteration 4, Req 9.5).
 *
 * Server component, reads `kiro_anon_id` cookie, fetches saved cases by
 * anonId. Empty state when no saves yet (also when cookie is missing —
 * no need for special-casing).
 *
 * Saves are device-bound (anonymous cookie). When client accounts ship,
 * we'll auto-claim saves into the account on login (plan §9.6 / §22 D-4).
 */

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: "Избранные ремонты",
    description: "Сохранённые идеи ремонтов на этом устройстве.",
    alternates: { canonical: `${publicUrl()}/izbrannoe` },
    robots: { index: false, follow: true },
  };
}

export default async function IzbrannoePage() {
  const cookieStore = await cookies();
  const anonId = cookieStore.get("kiro_anon_id")?.value ?? null;

  const items = anonId
    ? await fetchSaves(anonId).catch(() => [])
    : [];

  return (
    <>
      <header className="bg-[var(--color-surface)]">
        <div className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6 sm:pt-14">
          <nav className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
            <Link href="/" className="hover:text-[var(--color-text)]">
              Главная
            </Link>
            <span aria-hidden>/</span>
            <span className="text-[var(--color-text)]">Избранное</span>
          </nav>

          <p className="font-eyebrow mt-7">Сохранённое</p>
          <h1 className="font-editorial mt-3 max-w-3xl text-3xl text-[var(--color-text)] sm:text-4xl">
            Избранные ремонты на этом устройстве.
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-[var(--color-muted)]">
            Сохранения хранятся в браузере. На другом устройстве будет своя подборка.
          </p>
        </div>
      </header>

      <section className="bg-[var(--color-surface)]">
        <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-20">
          {items.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <p className="mb-8 text-sm text-[var(--color-muted)]">
                <span className="font-bold text-[var(--color-text)]">{items.length}</span>{" "}
                {pluralRemonts(items.length)} в подборке
              </p>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {items.map((item) => {
                  if (!item.slug) return null;
                  const cover = item.afterPhotos[0] ?? item.beforePhotos[0] ?? null;
                  const priceFrom = parseNumeric(item.priceFrom);
                  const area = parseNumeric(item.area);
                  const cityName = item.city?.name ?? item.master.city ?? null;
                  const masterName =
                    item.master.publicTitle?.trim() ||
                    item.master.alias?.trim() ||
                    `Мастер #${item.master.id}`;
                  return (
                    <li key={item.id}>
                      <CaseCard
                        href={`/raboty/${item.slug}`}
                        cover={cover}
                        title={item.title}
                        alt={`${item.title}${cityName ? ` в ${cityName}` : ""} — фото ремонта`}
                        metaParts={[
                          cityName,
                          area != null ? `${area} м²` : null,
                          masterName,
                        ]}
                        priceLabel={priceFrom != null ? `от ${formatNumber(priceFrom)} ₽` : null}
                        badge={item.isFeatured ? { tone: "featured", label: "Топ" } : null}
                        saves={item.saveCount}
                      />
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </section>
    </>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-md py-16 text-center sm:py-24">
      <div
        aria-hidden
        className="mx-auto mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-cream-deep)] text-[var(--color-faint)]"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </div>
      <h2 className="font-editorial text-2xl text-[var(--color-text)] sm:text-3xl">
        Здесь будут сохранённые ремонты.
      </h2>
      <p className="mt-3 text-base leading-relaxed text-[var(--color-muted)]">
        Нажимайте ❤️ на карточках в каталоге — кейсы будут попадать сюда.
      </p>
      <Link
        href="/raboty"
        className="mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-6 text-sm font-bold text-white transition hover:bg-[var(--color-primary-hover)]"
      >
        Открыть каталог ремонтов
      </Link>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function parseNumeric(value: string | null | undefined): number | null {
  if (value == null) return null;
  const n = parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatNumber(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
}

function pluralRemonts(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return "ремонтов";
  if (m10 === 1) return "ремонт";
  if (m10 >= 2 && m10 <= 4) return "ремонта";
  return "ремонтов";
}
