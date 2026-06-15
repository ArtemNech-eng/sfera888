import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-base font-semibold text-[var(--color-text)] sm:text-lg">
          <span aria-hidden className="inline-block h-8 w-8 rounded-full bg-[var(--color-primary)]" />
          <span>Честные мастера</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-[var(--color-text)] sm:flex">
          <Link href="/uslugi" className="hover:text-[var(--color-primary)]">Услуги</Link>
          <a
            href="https://sfera-master.ru/masteram"
            className="hover:text-[var(--color-primary)]"
            rel="noopener noreferrer"
          >
            Для мастеров
          </a>
        </nav>
        <Link
          href="/uslugi"
          className="inline-flex items-center rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-primary-hover)]"
        >
          Оставить заявку
        </Link>
      </div>
    </header>
  );
}
