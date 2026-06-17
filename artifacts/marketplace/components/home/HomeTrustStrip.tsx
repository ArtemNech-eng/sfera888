/**
 * Trust strip directly under the hero (plan §21 visual direction).
 *
 * Slim band with three reassurance points. Editorial minimal: thin icon in
 * a hairline border, sans-serif label, divider lines. Sits between the hero
 * and the categories block to alleviate "is this reliable?" anxiety on
 * the first scroll without competing visually.
 *
 * Server component, zero JS.
 */
export function HomeTrustStrip() {
  return (
    <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <ul className="grid grid-cols-1 divide-y divide-[var(--color-border)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Item
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 22s8-4 8-10V6l-8-3-8 3v6c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            }
            title="Договор с каждым мастером"
            sub="Юридически защищены и заказчик, и исполнитель"
          />
          <Item
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="2" y="6" width="20" height="14" rx="2" />
                <path d="M2 10h20" />
                <path d="M6 14h4" />
              </svg>
            }
            title="Без авансов до выезда"
            sub="Платите только за выполненные этапы"
          />
          <Item
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m12 2 3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z" />
              </svg>
            }
            title="Только проверенные мастера"
            sub="Каждый прошёл собеседование и стажировку"
          />
        </ul>
      </div>
    </section>
  );
}

function Item({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <li className="flex items-start gap-3 px-2 py-6 sm:px-7 sm:py-7">
      <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center border border-[var(--color-border-strong)] text-[var(--color-text)]">
        {icon}
      </span>
      <div>
        <p className="text-sm font-semibold text-[var(--color-text)]">{title}</p>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">{sub}</p>
      </div>
    </li>
  );
}
