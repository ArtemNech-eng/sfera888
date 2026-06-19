/**
 * B2B CTA-блок «Для мастеров» (home-magazine-redesign).
 *
 * Стратегия v3: мастера — поставщики услуг внутри экосистемы (не главный
 * товар), но всё ещё ключевая audience. На главной — заметный отдельный
 * блок с тёмным контрастным фоном чтобы выделиться из inspiration-потока.
 *
 * Внешняя ссылка на sfera-master.ru/masteram — оффициальный лендинг для
 * мастеров (artifacts/master-landing-v5).
 */

const EXTERNAL_FOR_MASTERS = "https://sfera-master.ru/masteram";

const BENEFITS = [
  "Создайте бесплатное портфолио с фото и ценами",
  "Без авансов и блокировок — оплата после выполнения",
  "Договор на каждом заказе, прозрачные комиссии",
  "Получайте заявки от клиентов, которые уже выбрали стиль",
];

export function HomeForMasters() {
  return (
    <section className="bg-[var(--color-text)]">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,_1fr)_minmax(0,_1fr)] lg:gap-14">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
              Для мастеров
            </p>
            <h2 className="font-display mt-3 text-3xl text-white sm:text-4xl lg:text-5xl">
              Вы мастер?
              <br />
              Покажите работы — найдём заявки.
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-white/70 sm:text-lg">
              Платформа для мастеров с инструментами портфолио, отзывов и
              управления заявками. Подключение бесплатное.
            </p>
          </div>

          <div>
            <ul className="space-y-3">
              {BENEFITS.map((b) => (
                <li key={b} className="flex items-start gap-3 text-base text-white/85">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                    className="mt-0.5 flex-shrink-0 text-[var(--color-primary-ring)]"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>{b}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
              <a
                href={EXTERNAL_FOR_MASTERS}
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--color-primary)] px-7 text-base font-semibold text-white shadow-cozy-md transition hover:bg-[var(--color-primary-hover)]"
              >
                Создать портфолио
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </a>
              <a
                href={EXTERNAL_FOR_MASTERS}
                rel="noopener noreferrer"
                className="text-sm font-medium text-white/70 underline decoration-white/40 decoration-2 underline-offset-4 transition hover:text-white hover:decoration-white"
              >
                Узнать о платформе
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
