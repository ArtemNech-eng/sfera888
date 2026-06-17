/**
 * Cozy four-step narrative (plan §21 cozy iteration).
 *
 * Stages: idea → visualise → budget → match. Now in cozy cards with rounded
 * corners, soft warm shadows and a handwritten kicker over the section.
 * Numerals stay big-and-quiet (15% text opacity) but in a softer card,
 * sitting on cream — not the hairline-divided grid from before.
 *
 * Server component, zero JS.
 */
export function HomeHowItWorks() {
  return (
    <section className="bg-[var(--color-background)]">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="max-w-2xl">
          <p className="font-handwritten text-2xl text-[var(--color-primary)] sm:text-3xl">
            как это работает
          </p>
          <h2 className="font-editorial mt-3 text-3xl text-[var(--color-text)] sm:text-4xl">
            Четыре шага от идеи до готового ремонта.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-[var(--color-muted)]">
            Не нужно сразу искать подрядчика — сначала спланируйте, потом найдёте.
          </p>
        </div>

        <ol className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <li
              key={step.n}
              className="rounded-2xl bg-[var(--color-surface)] p-7 shadow-cozy transition hover:shadow-cozy-md sm:p-8"
            >
              <p className="font-editorial text-6xl text-[var(--color-primary)]/20 sm:text-7xl">
                {step.n}
              </p>
              <p className="font-handwritten mt-3 text-xl text-[var(--color-primary)]">
                {step.kicker}
              </p>
              <h3 className="font-editorial mt-2 text-xl text-[var(--color-text)] sm:text-2xl">
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
    kicker: "идеи",
    title: "Найдите идею",
    description:
      "Реальные ремонты с фото до и после, бюджетом и сроками. Сохраняйте те, что зацепили.",
  },
  {
    n: "2",
    kicker: "визуализация",
    title: "Примерьте на свою комнату",
    description:
      "Загрузите фото — получите дизайн в выбранном стиле, без долгих обсуждений с дизайнером.",
  },
  {
    n: "3",
    kicker: "бюджет",
    title: "Узнайте сумму",
    description:
      "Считаем по фактическим сделкам в вашем городе. Не «от 5 000 ₽/м²», а близко к жизни.",
  },
  {
    n: "4",
    kicker: "мастер",
    title: "Найдите своего",
    description:
      "Подберём проверенных специалистов под ваш проект. Договор, без авансов, оплата по этапам.",
  },
] as const;
