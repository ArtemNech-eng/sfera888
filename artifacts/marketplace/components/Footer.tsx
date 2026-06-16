import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-[var(--color-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <div className="font-medium text-[var(--color-text)]">Честные мастера</div>
          <div className="mt-1">Подбор проверенных мастеров для ремонта и быта</div>
        </div>
        <nav className="flex flex-wrap gap-4">
          <Link href="/mastera" className="hover:text-[var(--color-primary)]">Мастера</Link>
          <Link href="/uslugi" className="hover:text-[var(--color-primary)]">Услуги</Link>
          <Link href="/dizajn" className="hover:text-[var(--color-primary)]">AI-дизайнер</Link>
          <Link href="/o-nas" className="hover:text-[var(--color-primary)]">О сервисе</Link>
          <Link href="/kontakty" className="hover:text-[var(--color-primary)]">Контакты</Link>
          <a
            href="https://sfera-master.ru/masteram"
            className="hover:text-[var(--color-primary)]"
            rel="noopener noreferrer"
          >
            Для мастеров
          </a>
          <Link
            href="/policy/privacy"
            className="hover:text-[var(--color-primary)]"
          >
            Политика конфиденциальности
          </Link>
          <Link
            href="/policy/terms"
            className="hover:text-[var(--color-primary)]"
          >
            Пользовательское соглашение
          </Link>
        </nav>
      </div>
    </footer>
  );
}
