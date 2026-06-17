import Link from "next/link";

/**
 * Editorial footer (plan §21 visual direction).
 *
 * Magazine masthead at the bottom — wordmark + lead on the left, three
 * columns of grouped links on the right. Hairlines and small caps replace
 * the previous flat bullet list. Discrete Unsplash credit at the bottom.
 *
 * Server component, zero JS.
 */
export function Footer() {
  return (
    <footer className="mt-auto border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.4fr,1fr,1fr,1fr] lg:gap-10">
          {/* Wordmark column */}
          <div>
            <Link href="/" className="font-editorial text-2xl text-[var(--color-text)]">
              Честные мастера
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-[var(--color-muted)]">
              Планировщик ремонта: реальные работы с фото и ценами,
              AI-визуализация и подбор проверенных мастеров в вашем городе.
            </p>
          </div>

          <FooterColumn
            title="Сервис"
            links={[
              { href: "/raboty", label: "Работы" },
              { href: "/dizajn", label: "AI-дизайн" },
              { href: "/uslugi", label: "Услуги" },
              { href: "/mastera", label: "Мастера" },
              { href: "/kalkulyator", label: "Калькулятор" },
            ]}
          />

          <FooterColumn
            title="О нас"
            links={[
              { href: "/o-nas", label: "О сервисе" },
              { href: "/kontakty", label: "Контакты" },
              {
                href: "https://sfera-master.ru/masteram",
                label: "Для мастеров",
                external: true,
              },
            ]}
          />

          <FooterColumn
            title="Документы"
            links={[
              { href: "/policy/privacy", label: "Конфиденциальность" },
              { href: "/policy/terms", label: "Пользовательское соглашение" },
            ]}
          />
        </div>

        {/* Hairline + Unsplash credit */}
        <div className="mt-14 border-t border-[var(--color-border)] pt-6">
          <p className="text-xs leading-relaxed text-[var(--color-faint)]">
            Изображения-референсы в подборках идей —{" "}
            <a
              href="https://unsplash.com/license"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-muted)] underline underline-offset-2 hover:text-[var(--color-text)]"
            >
              Unsplash
            </a>
            {" "}(CC0). По мере публикации работ нашими мастерами они вытесняют
            референсы. © {new Date().getFullYear()} Честные мастера.
          </p>
        </div>
      </div>
    </footer>
  );
}

interface FooterLink {
  href: string;
  label: string;
  external?: boolean;
}

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div>
      <p className="font-eyebrow">{title}</p>
      <ul className="mt-5 space-y-2.5">
        {links.map((link) =>
          link.external ? (
            <li key={link.href}>
              <a
                href={link.href}
                rel="noopener noreferrer"
                className="text-sm text-[var(--color-text)] transition hover:text-[var(--color-primary)]"
              >
                {link.label}
              </a>
            </li>
          ) : (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-sm text-[var(--color-text)] transition hover:text-[var(--color-primary)]"
              >
                {link.label}
              </Link>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
