import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { fetchSaves } from "../../lib/api";
import { CaseCard } from "../../components/CaseCard";
import { publicUrl } from "../../lib/env";

/**
 * `/izbrannoe` — anonymous saved cases + AI-designs (plan §22 Iteration 4
 * + AI-designer Iter 3).
 *
 * Server component, reads `kiro_anon_id` cookie, fetches saved items.
 * Tabs: «Ремонты» (case slug) | «Дизайны» (AI-design slug). Empty state
 * объединённый когда оба пустые.
 *
 * Сохранения device-bound (anonymous cookie). После client-accounts:
 * auto-claim в аккаунт на login (план §9.6 / §22 D-4).
 */

export const dynamic = "force-dynamic";

interface SearchParams {
  tab?: string;
}

export function generateMetadata(): Metadata {
  return {
    title: "Избранное",
    description: "Сохранённые ремонты и AI-дизайны на этом устройстве.",
    alternates: { canonical: `${publicUrl()}/izbrannoe` },
    robots: { index: false, follow: true },
  };
}

export default async function IzbrannoePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const cookieStore = await cookies();
  const anonId = cookieStore.get("kiro_anon_id")?.value ?? null;

  const saved = anonId
    ? await fetchSaves(anonId).catch(() => ({ cases: [], designs: [] }))
    : { cases: [], designs: [] };

  const totalCases = saved.cases.length;
  const totalDesigns = saved.designs.length;
  const totalAll = totalCases + totalDesigns;

  // Default tab — designs если есть, иначе cases.
  const defaultTab = totalDesigns > 0 && totalCases === 0 ? "designs" : "cases";
  const activeTab = sp.tab === "designs" ? "designs" : sp.tab === "cases" ? "cases" : defaultTab;

  return (
    <>
      <header className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6 sm:pt-14">
          <nav className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
            <Link href="/" className="hover:text-[var(--color-text)]">Главная</Link>
            <span aria-hidden>/</span>
            <span className="text-[var(--color-text)]">Избранное</span>
          </nav>

          <h1 className="font-display mt-7 max-w-3xl text-4xl text-[var(--color-text)] sm:text-5xl">
            Избранное.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--color-muted)] sm:text-lg">
            Сохранённые ремонты и AI-дизайны на этом устройстве. На другом устройстве
            будет своя подборка — синхронизация появится после регистрации аккаунта.
          </p>
        </div>
      </header>

      {/* Tabs */}
      {totalAll > 0 ? (
        <section className="border-b border-[var(--color-border)] bg-[var(--color-background)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <nav className="flex gap-6">
              <TabLink
                href="/izbrannoe?tab=cases"
                active={activeTab === "cases"}
                label="Ремонты"
                count={totalCases}
              />
              <TabLink
                href="/izbrannoe?tab=designs"
                active={activeTab === "designs"}
                label="AI-дизайны"
                count={totalDesigns}
              />
            </nav>
          </div>
        </section>
      ) : null}

      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 sm:pb-20">
          {totalAll === 0 ? (
            <EmptyState />
          ) : activeTab === "designs" ? (
            saved.designs.length > 0 ? (
              <DesignsGrid designs={saved.designs} />
            ) : (
              <EmptyTab kind="designs" />
            )
          ) : saved.cases.length > 0 ? (
            <CasesGrid cases={saved.cases} />
          ) : (
            <EmptyTab kind="cases" />
          )}
        </div>
      </section>
    </>
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────────

function TabLink({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      className={`relative inline-flex items-center gap-2 py-4 text-sm font-medium transition ${
        active
          ? "text-[var(--color-text)]"
          : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
      }`}
    >
      {label}
      {count > 0 ? (
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
          active
            ? "bg-[var(--color-text)] text-white"
            : "bg-[var(--color-cream-deep)] text-[var(--color-muted)]"
        }`}>{count}</span>
      ) : null}
      {active ? (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--color-primary)]" />
      ) : null}
    </Link>
  );
}

// ── Cases grid ─────────────────────────────────────────────────────────────

function CasesGrid({ cases }: { cases: Awaited<ReturnType<typeof fetchSaves>>["cases"] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cases.map((item) => {
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
  );
}

// ── Designs grid ───────────────────────────────────────────────────────────

function DesignsGrid({ designs }: { designs: Awaited<ReturnType<typeof fetchSaves>>["designs"] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {designs.map((d) => (
        <li key={d.id}>
          <Link href={`/dizajn/${d.slug}`} className="group block focus:outline-none">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-[var(--color-cream-deep)] shadow-cozy transition group-hover:shadow-cozy-md">
              {d.resultImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={d.resultImageUrl}
                  alt={d.h1 ?? `Дизайн ${d.roomType}`}
                  loading="lazy"
                  className="block h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                />
              ) : null}
            </div>
            <p className="mt-3 line-clamp-2 px-1 text-sm font-semibold text-[var(--color-text)] transition group-hover:text-[var(--color-primary)]">
              {d.h1 ?? `Дизайн ${d.roomType}`}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ── Empty states ───────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="mx-auto max-w-md py-16 text-center sm:py-24">
      <h2 className="font-display text-3xl text-[var(--color-text)] sm:text-4xl">
        Здесь будет ваше избранное.
      </h2>
      <p className="mt-4 text-base leading-relaxed text-[var(--color-muted)] sm:text-lg">
        Нажимайте «Сохранить» на ремонтах в каталоге или на AI-дизайнах —
        они будут попадать сюда.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/raboty"
          className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--color-cta)] px-6 text-sm font-semibold text-[var(--color-on-cta)] shadow-cozy transition hover:bg-[var(--color-cta-hover)]"
        >
          Каталог ремонтов
        </Link>
        <Link
          href="/dizajn"
          className="inline-flex h-12 items-center gap-2 rounded-full border border-[var(--color-text)] bg-transparent px-6 text-sm font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-text)] hover:text-white"
        >
          Создать AI-дизайн
        </Link>
      </div>
    </div>
  );
}

function EmptyTab({ kind }: { kind: "cases" | "designs" }) {
  const isDesigns = kind === "designs";
  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <p className="text-base text-[var(--color-muted)]">
        В этой вкладке пока пусто.
      </p>
      <Link
        href={isDesigns ? "/dizajn" : "/raboty"}
        className="mt-5 inline-flex h-11 items-center gap-2 rounded-full border border-[var(--color-text)] bg-transparent px-5 text-sm font-medium text-[var(--color-text)] transition hover:bg-[var(--color-text)] hover:text-white"
      >
        {isDesigns ? "Создать AI-дизайн" : "Открыть каталог ремонтов"}
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
