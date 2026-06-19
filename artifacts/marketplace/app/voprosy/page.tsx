import type { Metadata } from "next";
import Link from "next/link";

/**
 * `/voprosy` — Q&A платформа «Спроси мастера», stub-страница.
 *
 * Контентная стратегия v3: это четвёртый layer (наравне с AI-дизайнами /
 * каталогом ремонтов / профилями мастеров). Реальная Q&A платформа
 * (DB schema questions/answers/votes, модерация, профили мастеров-
 * respondents, RSS) — отдельный спек.
 *
 * Эта stub-страница нужна чтобы CTA из HomeQuestions не 404'или, и чтобы
 * ранние посетители увидели намерение раздела.
 */

export const metadata: Metadata = {
  title: "Спроси мастера — вопросы и ответы про ремонт",
  description:
    "Раздел вопросов и ответов про ремонт. Реальные ответы мастеров на частые вопросы — раздел в разработке.",
  alternates: { canonical: "/voprosy" },
};

export default function VoprosyPage() {
  return (
    <main className="bg-[var(--color-background)]">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-28">
        <nav className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
          <Link href="/" className="hover:text-[var(--color-text)]">
            Главная
          </Link>
          <span aria-hidden>/</span>
          <span className="text-[var(--color-text)]">Спроси мастера</span>
        </nav>

        <p className="font-eyebrow mt-10">💬 Спроси мастера</p>
        <h1 className="font-display mt-4 text-4xl text-[var(--color-text)] sm:text-5xl">
          Раздел готовится.
        </h1>
        <p className="mt-5 text-base leading-relaxed text-[var(--color-muted)] sm:text-lg">
          Скоро здесь появится база вопросов и ответов про ремонт — реальные
          ответы практикующих мастеров с фото, схемами и ссылками на материалы.
          Каждый ответ будет привязан к мастеру, у которого можно заказать
          работу.
        </p>
        <p className="mt-4 text-base leading-relaxed text-[var(--color-muted)]">
          Если у вас есть вопрос прямо сейчас — оставьте заявку, наш
          подборщик задаст его профильному мастеру.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link
            href="/raboty"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--color-primary)] px-7 text-base font-semibold text-white shadow-cozy-md transition hover:bg-[var(--color-primary-hover)]"
          >
            Смотреть ремонты
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-[var(--color-muted)] underline decoration-[var(--color-border-strong)] decoration-2 underline-offset-4 transition hover:text-[var(--color-text)] hover:decoration-[var(--color-text)]"
          >
            ← На главную
          </Link>
        </div>
      </div>
    </main>
  );
}
