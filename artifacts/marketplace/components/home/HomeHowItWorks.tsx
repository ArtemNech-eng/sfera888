/**
 * Editorial four-step narrative (plan §20.2 [9], §21 visual direction).
 *
 * Four planning stages — idea → visualise → budget → match — laid out as
 * an editorial list rather than dashboard cards. Big serif numerals, each
 * step ties to the corresponding entry point on the page.
 *
 * Server component, zero JS.
 */
export function HomeHowItWorks() {
  return (
    <section className="border-t border-[var(--color-border)] bg-[var(--color-background)]">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="max-w-2xl">
          <p className="font-eyebrow">Как это работает</p>
          <h2 className="font-editorial mt-4 text-4xl text-[var(--color-text)] sm:text-5xl">
            Четыре шага от идеи до готового ремонта.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-[var(--color-muted)]">
            Не нужно сразу искать подрядчика — сначала спланируйте, потом найдёте.
          </p>
        </div>

        <ol className="mt-16 grid gap-px overflow-hidden bg-[var(--color-border)] md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <li key={step.n} className="bg-[var(--color-surface)] p-7 sm:p-9">
              <p className="font-editorial text-6xl text-[var(--color-text)]/15 sm:text-7xl">
                {step.n}
              </p>
              <p className="mt-4 font-eyebrow text-[var(--color-primary)]">
                {step.kicker}
              </p>
              <h3 className="font-editorial mt-3 text-2xl text-[var(--color-text)] sm:text-[1.625rem]">
                {step.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">
                {step.description}
              </p>
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
    description:
      "Реальные ремонты с фото до и после, бюджетом и сроками. Сохраняйте те, что зацепили.",
  },
  {
    n: "2",
    kicker: "AI-дизайн",
    title: "Визуализируйте",
    description:
      "Загрузите фото своей комнаты — получите дизайн в выбранном стиле, без долгих обсуждений с дизайнером.",
  },
  {
    n: "3",
    kicker: "Калькулятор",
    title: "Узнайте бюджет",
    description:
      "Считаем по фактическим сделкам в вашем городе. Не «от 5 000 ₽/м²», а близко к жизни.",
  },
  {
    n: "4",
    kicker: "Подбор",
    title: "Найдите мастера",
    description:
      "Подберём проверенных специалистов под ваш проект. Договор, без авансов, оплата по этапам.",
  },
] as const;
