import Link from "next/link";

interface Props {
  title: string;
  subtitle?: string;
  ctaHref?: string;
  ctaLabel?: string;
}

/**
 * Placeholder for cabinet routes whose UI is being migrated from master-pwa
 * in Week 2 of the Cabinet Migration. Communicates the migration state to
 * pilot masters who may land here before the full port is done.
 */
export function PlaceholderPage({ title, subtitle, ctaHref = "https://sfera-master.ru/master-pwa/", ctaLabel = "Открыть старое приложение" }: Props) {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-[var(--color-muted)]">{subtitle}</p> : null}
      </header>

      <section className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-6">
        <div className="flex items-start gap-3">
          <span aria-hidden className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            ⏳
          </span>
          <div className="space-y-2">
            <h2 className="text-base font-medium text-[var(--color-text)]">Раздел переезжает в новый кабинет</h2>
            <p className="text-sm text-[var(--color-muted)]">
              Мы переносим кабинет мастера на этот сайт. Содержимое раздела появится здесь в ближайшие дни.
              Пока что используйте старое приложение для работы с заказами и балансом.
            </p>
            <Link
              href={ctaHref}
              className="inline-flex h-10 items-center rounded-xl bg-[var(--color-primary)] px-4 text-sm font-medium text-white hover:opacity-90"
              prefetch={false}
            >
              {ctaLabel}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
