const steps = [
  {
    number: '01',
    title: 'Вы оставляете заявку',
    text: 'Укажите имя, телефон, город и что нужно сделать. Займёт 1–2 минуты.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    ),
  },
  {
    number: '02',
    title: 'Система подбирает мастера',
    text: 'Подбор занимает 15–30 минут. Учитываем ваш город, тип работ и рейтинг специалиста.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    ),
  },
  {
    number: '03',
    title: 'Мастер связывается с вами',
    text: 'Уточняет детали, выезжает на замер и готовит понятную смету до начала работ.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6.13 6.13l.91-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.73 16.92z"/>
      </svg>
    ),
  },
  {
    number: '04',
    title: 'Вы согласуете старт',
    text: 'Договариваетесь о времени, мастер приступает. Никакого хаоса и поиска вслепую.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    ),
  },
];

export default function HowItWorks() {
  const scrollToForm = () => {
    document.getElementById('form')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section id="how" className="bg-[#F1F5F9] py-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#111827] mb-3">
            Как всё происходит
          </h2>
          <p className="text-[#6B7280] text-base">
            Без хаоса, бесконечных звонков и поиска вслепую.
          </p>
        </div>

        {/* Steps */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          {steps.map((step, i) => (
            <div key={step.number} className="relative">
              {/* Connector line (desktop) */}
              {i < steps.length - 1 && (
                <div className="hidden lg:block absolute top-6 left-[calc(100%-8px)] w-full h-px bg-[#E5E7EB] z-0" />
              )}
              <div className="bg-white rounded-2xl p-6 border border-[#E5E7EB] relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-xl bg-[#34C759] flex items-center justify-center flex-shrink-0">
                    {step.icon}
                  </div>
                  <span className="text-[#94A3B8] font-bold text-sm">{step.number}</span>
                </div>
                <h3 className="text-[#111827] font-semibold text-base mb-2 leading-snug">{step.title}</h3>
                <p className="text-[#6B7280] text-sm leading-relaxed">{step.text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center">
          <button
            onClick={scrollToForm}
            className="bg-[#34C759] text-white font-semibold px-7 py-3.5 rounded-xl hover:bg-[#2db34e] transition-colors shadow-sm"
          >
            Оставить заявку
          </button>
        </div>
      </div>
    </section>
  );
}
