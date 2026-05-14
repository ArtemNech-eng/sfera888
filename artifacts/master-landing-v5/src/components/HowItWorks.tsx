const steps = [
  {
    number: '01',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M12 18H12.01M8 21H16C17.1046 21 18 20.1046 18 19V5C18 3.89543 17.1046 3 16 3H8C6.89543 3 6 3.89543 6 5V19C6 20.1046 6.89543 21 8 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'Заявка в приложении',
    desc: 'В ленте появляется новый объект — с адресом, типом работы и примерной суммой. Вы видите всё сразу.',
  },
  {
    number: '02',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M15 15L21 21M10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10C17 13.866 13.866 17 10 17Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'Мастер откликается',
    desc: 'Жмёте «Откликнуться» — система фиксирует заявку и подбирает время замера с клиентом.',
  },
  {
    number: '03',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M17.657 16.657L13.414 20.9C13.039 21.2749 12.5306 21.4851 12.0005 21.4851C11.4704 21.4851 10.962 21.2749 10.587 20.9L6.344 16.657C5.22422 15.5372 4.46234 14.1128 4.15369 12.5609C3.84504 11.009 4.00349 9.40047 4.60901 7.93868C5.21453 6.4769 6.2399 5.22749 7.55548 4.34864C8.87107 3.46979 10.4178 3 12 3C13.5822 3 15.1289 3.46979 16.4445 4.34864C17.7601 5.22749 18.7855 6.4769 19.391 7.93868C19.9965 9.40047 20.155 11.009 19.8463 12.5609C19.5377 14.1128 18.7758 15.5372 17.657 16.657Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M15 11C15 12.6569 13.6569 14 12 14C10.3431 14 9 12.6569 9 11C9 9.34315 10.3431 8 12 8C13.6569 8 15 9.34315 15 11Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'Едет на замер',
    desc: 'Выезжаете на объект, смотрите масштаб работы, знакомитесь с клиентом.',
  },
  {
    number: '04',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M9 7H6C5.46957 7 4.96086 7.21071 4.58579 7.58579C4.21071 7.96086 4 8.46957 4 9V18C4 18.5304 4.21071 19.0391 4.58579 19.4142C4.96086 19.7893 5.46957 20 6 20H15C15.5304 20 16.0391 19.7893 16.4142 19.4142C16.7893 19.0391 17 18.5304 17 18V15M11 13H13M11 9H17M11 17H13M20 4H13V11H20V4Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'Считаете смету в приложении',
    desc: 'Всё в одном месте. Никаких WhatsApp-сообщений и Excel-таблиц. Смета формируется прямо в системе.',
  },
  {
    number: '05',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'Клиент бронирует мастера',
    desc: 'Клиент видит смету и подтверждает бронь. Объект закреплён за вами. Начинаете работу.',
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-[#F1F5F9] rounded-full px-4 py-1.5 mb-4">
            <span className="text-sm font-semibold text-[#6B7280]">Рабочий процесс</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#111827] mb-4">
            Как мастер получает объект
          </h2>
          <p className="text-lg text-[#6B7280] max-w-xl mx-auto">
            Никаких мутных договорённостей и хаоса.
            Ключевые этапы идут через систему.
          </p>
        </div>

        {/* Steps */}
        <div className="relative">
          {/* Connecting line - desktop */}
          <div className="hidden lg:block absolute top-12 left-0 right-0 h-0.5 bg-gradient-to-r from-[#E5E7EB] via-[#34C759]/40 to-[#E5E7EB] z-0" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 relative z-10">
            {steps.map((step, i) => (
              <div key={i} className="flex flex-col items-center lg:items-center text-center group">
                {/* Icon Circle */}
                <div className="relative mb-5">
                  <div className="w-20 h-20 bg-white border-2 border-[#E5E7EB] group-hover:border-[#34C759]/50 rounded-2xl flex flex-col items-center justify-center shadow-sm group-hover:shadow-md transition-all duration-300 group-hover:-translate-y-1">
                    <div className="text-[#34C759]">{step.icon}</div>
                  </div>
                  {/* Step number badge */}
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-[#34C759] rounded-full flex items-center justify-center">
                    <span className="text-white text-[10px] font-black">{i + 1}</span>
                  </div>
                </div>

                <h3 className="text-sm font-bold text-[#111827] mb-2 leading-tight">{step.title}</h3>
                <p className="text-xs text-[#6B7280] leading-relaxed max-w-[160px]">{step.desc}</p>

                {/* Arrow for mobile / tablet */}
                {i < steps.length - 1 && (
                  <div className="lg:hidden mt-4 text-[#94A3B8]">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M12 5V19M12 19L5 12M12 19L19 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Note */}
        <div className="mt-14 bg-[#F8FAFC] border border-[#E5E7EB] rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-10 h-10 bg-[#E8F9EE] rounded-xl flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M13 16H12V12H11M12 8H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="#34C759" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-[#111827]">Весь процесс — в одном приложении</p>
            <p className="text-sm text-[#6B7280] mt-0.5">Заявки, замеры, сметы, бронирование — без звонков, WhatsApp и хаоса. Только система.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
