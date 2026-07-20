/**
 * B2B CTA-блок «Для мастеров» (home-magazine-redesign).
 *
 * Стратегия v3: мастера — поставщики услуг внутри экосистемы (не главный
 * товар), но всё ещё ключевая audience. На главной — заметный отдельный
 * блок с тёмным контрастным фоном чтобы выделиться из inspiration-потока.
 *
 * Тон редакторский, без SaaS-чекмарков. Главный посыл — короткая метрика
 * + два болезненных тейка про конкурентов («без выкупа лидов», «без
 * блокировки счёта»). На рынке мастеров (Профи.ру, Авито Услуги) это
 * сильнейшие триггеры — там оба механизма работают именно так и съедают
 * заработок.
 *
 * Внешняя ссылка на sfera-master.ru/masteram — оффициальный лендинг
 * (artifacts/master-landing-v5).
 */

const EXTERNAL_FOR_MASTERS = "https://sfera-master.ru/masteram";

export function HomeForMasters() {
  return (
    <section className="bg-[var(--color-text)]">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,_1fr)_minmax(0,_1fr)] lg:gap-16">
          <div>
            <p className="font-eyebrow text-[var(--color-primary-ring)]">
              Для мастеров
            </p>
            <h2 className="font-display mt-4 text-3xl text-white sm:text-4xl lg:text-[3rem]">
              Покажите работы — мы приведём заказы.
            </h2>
          </div>

          <div>
            <p className="text-lg leading-relaxed text-white/80 sm:text-xl sm:leading-[1.55]">
              Платформа для мастеров: портфолио, отзывы и удобное управление
              заявками от клиентов — от первой заявки до закрытия объекта.
            </p>
            <p className="mt-5 text-base leading-relaxed text-white/65 sm:text-lg">
              Работайте с клиентами платформы и ведите заказы в приложении.
              Все условия для мастеров — на отдельной странице.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
              <a
                href={EXTERNAL_FOR_MASTERS}
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 text-base font-semibold text-[var(--color-text)] shadow-cozy-md transition hover:bg-white/90"
              >
                Стать мастером
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
