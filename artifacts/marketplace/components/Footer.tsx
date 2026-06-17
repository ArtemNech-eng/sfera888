import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-4 text-sm text-[var(--color-muted)] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-medium text-[var(--color-text)]">Честные мастера</div>
            <div className="mt-1">Планировщик ремонта и подбор проверенных мастеров</div>
          </div>
          <nav className="flex flex-wrap gap-x-4 gap-y-2">
            <Link href="/raboty" className="hover:text-[var(--color-primary)]">Работы</Link>
            <Link href="/mastera" className="hover:text-[var(--color-primary)]">Мастера</Link>
            <Link href="/uslugi" className="hover:text-[var(--color-primary)]">Услуги</Link>
            <Link href="/dizajn" className="hover:text-[var(--color-primary)]">AI-дизайн</Link>
            <Link href="/kalkulyator" className="hover:text-[var(--color-primary)]">Калькулятор</Link>
            <Link href="/o-nas" className="hover:text-[var(--color-primary)]">О сервисе</Link>
            <Link href="/kontakty" className="hover:text-[var(--color-primary)]">Контакты</Link>
            <a
              href="https://sfera-master.ru/masteram"
              className="hover:text-[var(--color-primary)]"
              rel="noopener noreferrer"
            >
              Для мастеров
            </a>
            <Link href="/policy/privacy" className="hover:text-[var(--color-primary)]">
              Политика конфиденциальности
            </Link>
            <Link href="/policy/terms" className="hover:text-[var(--color-primary)]">
              Пользовательское соглашение
            </Link>
          </nav>
        </div>

        {/* Discreet credit line for Unsplash placeholder photography. We're
            not legally required to attribute (CC0 license), but signalling
            it builds trust with users who recognise the photos. Removed
            automatically once we have ≥50 real published cases. */}
        <p className="mt-6 border-t border-[var(--color-border)] pt-4 text-xs text-[var(--color-muted)]">
          Изображения‑референсы в подборках идей — фотобанк{" "}
          <a
            href="https://unsplash.com/license"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--color-primary)] underline-offset-2 hover:underline"
          >
            Unsplash
          </a>{" "}
          (CC0). По мере публикации работ нашими мастерами они вытесняют референсы.
        </p>
      </div>
    </footer>
  );
}
