import Link from "next/link";
import type { Metadata } from "next";

// Root not-found.tsx is served by Next.js for any unhandled 404 across the
// app — including dynamic routes that called notFound() from generateMetadata
// or page.tsx. Always responds with HTTP 404, so search engines drop the URL
// from their index.

export const metadata: Metadata = {
  title: { absolute: "Страница не найдена — Честные мастера" },
  description: "Запрошенная страница не найдена. Перейдите к услугам или на главную.",
  // 404 pages must be excluded from the index — robots picks this up via
  // <meta>; sitemap excludes them by virtue of not listing them.
  robots: { index: false, follow: false },
};

export default function NotFoundPage() {
  return (
    <section className="mx-auto flex max-w-2xl flex-col items-start gap-6 px-4 py-16 sm:px-6 sm:py-24">
      <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1 text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
        Ошибка 404
      </span>
      <h1 className="text-4xl font-semibold text-[var(--color-text)] sm:text-5xl">
        Страница не найдена
      </h1>
      <p className="max-w-xl text-base text-[var(--color-muted)] sm:text-lg">
        Возможно, ссылка устарела или содержит опечатку. Вернитесь на главную или
        выберите услугу — мы подберём проверенного мастера.
      </p>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-xl bg-[var(--color-primary)] px-5 py-3 text-base font-medium text-white transition hover:bg-[var(--color-primary-hover)]"
        >
          На главную
        </Link>
        <Link
          href="/uslugi"
          className="inline-flex items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-3 text-base font-medium text-[var(--color-text)] transition hover:border-[var(--color-primary)]"
        >
          Все услуги
        </Link>
      </div>

      <ul className="mt-4 grid gap-2 text-sm">
        <li>
          <Link href="/santehnika/krasnodar" className="text-[var(--color-primary)] hover:underline">
            Сантехника в Краснодаре
          </Link>
        </li>
        <li>
          <Link href="/elektromontazh/krasnodar" className="text-[var(--color-primary)] hover:underline">
            Электромонтаж в Краснодаре
          </Link>
        </li>
        <li>
          <Link href="/dizajn" className="text-[var(--color-primary)] hover:underline">
            AI-дизайнер интерьера
          </Link>
        </li>
      </ul>
    </section>
  );
}
