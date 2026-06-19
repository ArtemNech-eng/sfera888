import Link from "next/link";

/**
 * Portal-grade footer (plan §21.9).
 *
 * Wide multi-column layout: brand+lead column on the left, then four
 * grouped link columns (services / cities / about / docs). Builds the
 * "this is a national platform with a lot under the hood" feel.
 *
 * Server component, zero JS.
 */
export function Footer() {
  return (
    <footer className="mt-auto border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1fr] lg:gap-8">
          {/* Brand column */}
          <div>
            <Link href="/" className="flex items-center gap-2 text-[var(--color-text)]">
              <span className="font-display text-xl">Честные мастера</span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-[var(--color-muted)]">
              Планировщик ремонта: реальные работы с фото и ценами,
              AI-визуализация и подбор проверенных мастеров в вашем городе.
            </p>
            <p className="mt-5 text-xs text-[var(--color-faint)]">
              Поддержка:{" "}
              <a
                href="mailto:hello@chestnye-mastera.ru"
                className="text-[var(--color-text)] hover:text-[var(--color-primary)]"
              >
                hello@chestnye-mastera.ru
              </a>
            </p>
          </div>

          <FooterColumn
            title="Сервис"
            links={[
              { href: "/raboty", label: "Идеи" },
              { href: "/dizajn", label: "AI-дизайн" },
              { href: "/kalkulyator", label: "Калькулятор" },
              { href: "/uslugi", label: "Услуги" },
              { href: "/mastera", label: "Мастера" },
            ]}
          />

          <FooterColumn
            title="Популярное"
            links={[
              { href: "/uslugi/kompleksnyy-remont", label: "Ремонт под ключ" },
              { href: "/uslugi/santehnika", label: "Сантехника" },
              { href: "/uslugi/elektrika", label: "Электрика" },
              { href: "/uslugi/plitochnye-raboty", label: "Плиточные работы" },
              { href: "/uslugi/malyarnye-raboty", label: "Малярные работы" },
              { href: "/uslugi/natyazhnye-potolki", label: "Натяжные потолки" },
            ]}
          />

          <FooterColumn
            title="Города"
            links={[
              { href: "/mastera?city=moskva", label: "Москва" },
              { href: "/mastera?city=spb", label: "Санкт-Петербург" },
              { href: "/mastera?city=ekaterinburg", label: "Екатеринбург" },
              { href: "/mastera?city=novosibirsk", label: "Новосибирск" },
              { href: "/mastera?city=krasnodar", label: "Краснодар" },
              { href: "/mastera", label: "Все города" },
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
              { href: "/login", label: "Войти в кабинет" },
              { href: "/policy/privacy", label: "Конфиденциальность" },
              { href: "/policy/terms", label: "Соглашение" },
            ]}
          />
        </div>

        {/* Hairline + copyright */}
        <div className="mt-12 flex flex-col gap-3 border-t border-[var(--color-border)] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-relaxed text-[var(--color-faint)]">
            © {new Date().getFullYear()} Честные мастера. Все права защищены.
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
      <ul className="mt-4 space-y-2">
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
