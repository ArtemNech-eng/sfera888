import Link from "next/link";

/**
 * «Опоры платформы» — короткая полоса из 3 карточек под героем главной.
 *
 * Задача: с первого экрана показать, что это не просто галерея идей, а
 * платформа, объединяющая три вещи — реальные ремонты с ценами, проверенных
 * мастеров и базу смет/калькулятор. Тон: «платформа помогает», без продажи.
 * Статический блок (без данных) — дёшево и надёжно.
 */
const PILLARS: Array<{ icon: string; title: string; text: string; href: string }> = [
  {
    icon: "◈",
    title: "Реальные ремонты с ценами",
    text: "Фото «до/после», бюджет, сроки и материалы — как в журнале, но с настоящими сметами.",
    href: "/raboty",
  },
  {
    icon: "✦",
    title: "Проверенные мастера",
    text: "Отбор, договор на каждом заказе, открытые рейтинги, отзывы и портфолио.",
    href: "/mastera",
  },
  {
    icon: "₽",
    title: "Сметы и калькулятор",
    text: "Реальные сметы с объектов и расчёт бюджета по региональным ценам — без сюрпризов.",
    href: "/kalkulyator",
  },
];

export function HomePillars() {
  return (
    <section className="bg-[var(--color-background)]">
      <div className="mx-auto max-w-6xl px-4 pb-4 sm:px-6">
        <ul className="grid gap-4 sm:grid-cols-3 sm:gap-5">
          {PILLARS.map((p) => (
            <li key={p.title}>
              <Link
                href={p.href}
                className="group flex h-full flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-cozy transition hover:-translate-y-0.5 hover:border-[var(--color-text)] hover:shadow-cozy-md sm:p-7"
              >
                <span
                  aria-hidden
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-primary-soft)] text-xl text-[var(--color-primary)]"
                >
                  {p.icon}
                </span>
                <h3 className="font-display mt-4 text-lg text-[var(--color-text)] sm:text-xl">
                  {p.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
                  {p.text}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
