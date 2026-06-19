import Link from "next/link";

/**
 * Q&A teaser «Спроси мастера» (home-magazine-redesign).
 *
 * Стратегия v3: Q&A — отдельный SEO-канал в духе СпросиВрача. Ловит
 * long-tail запросов «можно ли клеить плитку на плитку», «как сделать
 * тёплый пол под ламинат». Ответы дают мастера — это и контент, и
 * сигнал доверия к платформе.
 *
 * На главной — teaser с 5 mock-вопросами. Реальная Q&A платформа (DB
 * questions/answers/votes, модерация, профили мастеров-respondents) —
 * отдельный спек. До запуска `/voprosy` это stub-страница.
 */

interface Question {
  q: string;
  a: string;
  href: string;
}

const QUESTIONS: Question[] = [
  {
    q: "Можно ли клеить плитку на плитку?",
    a: "Можно, если старая плитка крепко держится. Поверхность шкурят, грунтуют адгезионной грунтовкой и используют клей с маркировкой C2.",
    href: "/voprosy",
  },
  {
    q: "Сколько сохнет стяжка перед укладкой ламината?",
    a: "Цементно-песчаная — 28 дней при толщине до 4 см. Полусухая — 14-21 день. Полимерная (наливной пол) — 5-7 дней. Проверять влагомером.",
    href: "/voprosy",
  },
  {
    q: "Какой минимальный бюджет на ванную 4 м²?",
    a: "Бюджетный косметический — от 80 тыс ₽ (краска, замена сантехники). Под-ключ — от 180 тыс ₽ (плитка, замена труб, новая ванна).",
    href: "/voprosy",
  },
  {
    q: "Как выровнять стены без штукатурки?",
    a: "Гипсокартон на профиль (стена «уходит» на 5-7 см) или приклеить ГКЛ на гипсовый клей (потеря 1-2 см). Плюс — чисто, минус — съедает площадь.",
    href: "/voprosy",
  },
  {
    q: "Можно ли совместить ванну и санузел в хрущёвке?",
    a: "Да, перегородка между ними не несущая. Согласование не нужно если убираете не несущую стенку, но нужно отметить в техпаспорте.",
    href: "/voprosy",
  },
];

export function HomeQuestions() {
  return (
    <section className="bg-[var(--color-background)]">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="font-eyebrow">💬 Спроси мастера</p>
            <h2 className="font-display mt-3 text-3xl text-[var(--color-text)] sm:text-4xl">
              Вопросы и ответы про ремонт.
            </h2>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-[var(--color-muted)]">
              Реальные ответы мастеров на частые вопросы. Не нашли свой —
              задайте вопрос, ответит специалист с практикой.
            </p>
          </div>
          <Link
            href="/voprosy"
            className="hidden text-sm font-semibold text-[var(--color-text)] underline decoration-[var(--color-text)] decoration-2 underline-offset-4 transition hover:text-[var(--color-primary)] hover:decoration-[var(--color-primary)] sm:inline"
          >
            Все вопросы →
          </Link>
        </div>

        <ul className="mt-10 divide-y divide-[var(--color-border)] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-cozy">
          {QUESTIONS.map((item, idx) => (
            <li key={idx}>
              <Link
                href={item.href}
                className="group flex items-start gap-4 p-5 transition hover:bg-[var(--color-cream-deep)] sm:p-6"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold leading-snug text-[var(--color-text)] transition group-hover:text-[var(--color-primary)] sm:text-lg">
                    {item.q}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[var(--color-muted)]">
                    {item.a}
                  </p>
                </div>
                <span aria-hidden className="mt-1 flex-shrink-0 text-[var(--color-faint)] transition group-hover:translate-x-0.5 group-hover:text-[var(--color-primary)]">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-8 sm:hidden">
          <Link
            href="/voprosy"
            className="text-sm font-semibold text-[var(--color-text)] underline decoration-[var(--color-text)] decoration-2 underline-offset-4"
          >
            Все вопросы →
          </Link>
        </div>
      </div>
    </section>
  );
}
