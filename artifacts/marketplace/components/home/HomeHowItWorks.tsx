/**
 * "Как это работает" — funnel-aware version (plan §20.2 [9]). Replaces the
 * V1 1-2-3 abstract flow with the four planning stages (idea → visualise →
 * budget → match) that match the new top-funnel-first positioning.
 *
 * Pulled out of the page module so each home block is its own file and can
 * be re-arranged or A/B-tested without touching app/page.tsx layout.
 *
 * Server component, zero JS.
 */
export function HomeHowItWorks() {
  return (
    <section className="border-t border-[var(--color-border)] bg-[var(--color-background)]">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
            Как это работает
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
            Четыре шага от идеи до готового ремонта
          </h2>
          <p className="mt-3 text-base text-[var(--color-muted)]">
            Не нужно сразу искать подрядчика — сначала спланируйте, потом найдёте.
          </p>
        </div>

        <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <li
              key={step.n}
              className="rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-primary-soft)] text-sm font-bold text-[var(--color-primary)]">
                  {step.n}
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                  {step.kicker}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-bold text-[var(--color-text)]">{step.title}</h3>
              <p className="mt-1 text-sm text-[var(--color-muted)]">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const STEPS = [
  {
    n: "1",
    kicker: "Идеи",
    title: "Найдите идею",
    description: "Просматривайте реальные ремонты с фото до и после, ценами и сроками.",
  },
  {
    n: "2",
    kicker: "AI-дизайн",
    title: "Визуализируйте",
    description: "Загрузите фото вашей комнаты и получите дизайн в нужном стиле.",
  },
  {
    n: "3",
    kicker: "Калькулятор",
    title: "Узнайте бюджет",
    description: "Считаем смету по реальным сделкам в вашем городе.",
  },
  {
    n: "4",
    kicker: "Подбор",
    title: "Найдите мастера",
    description: "Подберём проверенных специалистов и пришлём предложения.",
  },
] as const;
