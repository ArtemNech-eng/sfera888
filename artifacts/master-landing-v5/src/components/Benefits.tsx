const benefits = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M20 12V22H4V12M22 7H2V12H22V7ZM12 22V7M12 7H7.5C6.11929 7 5 5.88071 5 4.5C5 3.11929 6.11929 2 7.5 2C9.5 2 12 7 12 7ZM12 7H16.5C17.8807 7 19 5.88071 19 4.5C19 3.11929 17.8807 2 16.5 2C14.5 2 12 7 12 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'Поток объектов',
    desc: 'Заказы появляются каждый день. Вам не нужно самим искать клиентов — система делает это за вас.',
    color: '#34C759',
    bg: '#E8F9EE',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M9 5H7C5.89543 5 5 5.89543 5 7V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V7C19 5.89543 18.1046 5 17 5H15M9 5C9 5.55228 9.44772 6 10 6H14C14.5523 6 15 5.55228 15 5M9 5C9 4.44772 9.44772 4 10 4H14C14.5523 4 15 4.44772 15 5M12 12H15M12 16H15M9 12H9.01M9 16H9.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'Понятный процесс',
    desc: 'Заявка → замер → смета → бронь. Каждый шаг понятен. Никаких мутных договорённостей.',
    color: '#3B82F6',
    bg: '#EFF6FF',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 18H12.01M8 21H16C17.1046 21 18 20.1046 18 19V5C18 3.89543 17.1046 3 16 3H8C6.89543 3 6 3.89543 6 5V19C6 20.1046 6.89543 21 8 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'Смета в приложении',
    desc: 'Считайте смету прямо на замере. Всё фиксируется в системе — клиент видит цифры сразу.',
    color: '#8B5CF6',
    bg: '#F5F3FF',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'Бронь через систему',
    desc: 'Клиент бронирует вас через приложение. Объект закреплён, ничего не теряется.',
    color: '#34C759',
    bg: '#E8F9EE',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M11.0489 3.92705C11.3483 3.00574 12.6517 3.00574 12.9511 3.92705L14.2451 7.90983C14.3791 8.32185 14.763 8.60081 15.1962 8.60081H19.3839C20.3527 8.60081 20.7554 9.84043 19.9717 10.4098L16.5838 12.8944C16.2333 13.1477 16.0866 13.5944 16.2206 14.0064L17.5146 17.9892C17.8139 18.9105 16.7627 19.6726 15.979 19.1032L12.5911 16.6186C12.2406 16.3653 11.7594 16.3653 11.4089 16.6186L8.02099 19.1032C7.23728 19.6726 6.18608 18.9105 6.48538 17.9892L7.7794 14.0064C7.91338 13.5944 7.76672 13.1477 7.41623 12.8944L4.02831 10.4098C3.24460 9.84043 3.64735 8.60081 4.61614 8.60081H8.80385C9.23703 8.60081 9.62095 8.32185 9.75493 7.90983L11.0489 3.92705Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'Приоритет сильным',
    desc: 'Чем выше ваш рейтинг и конверсия, тем лучше объекты вы получаете. Качество растёт — доход тоже.',
    color: '#F59E0B',
    bg: '#FFF7ED',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M3 3H5L5.4 5M5.4 5H21L17 13H7M5.4 5L7 13M7 13L4.70711 15.2929C4.07714 15.9229 4.52331 17 5.41421 17H17M17 17C15.8954 17 15 17.8954 15 19C15 20.1046 15.8954 21 17 21C18.1046 21 19 20.1046 19 19C19 17.8954 18.1046 17 17 17ZM9 19C9 20.1046 8.10457 21 7 21C5.89543 21 5 20.1046 5 19C5 17.8954 5.89543 17 7 17C8.10457 17 9 17.8954 9 19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'Меньше мусора',
    desc: 'Только реальные заказы от мотивированных клиентов. Пустые замеры — в прошлом.',
    color: '#EF4444',
    bg: '#FEF2F2',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 8C10.8954 8 10 8.89543 10 10C10 11.1046 10.8954 12 12 12C13.1046 12 14 12.8954 14 14C14 15.1046 13.1046 16 12 16M12 8V6M12 8C13.1046 8 14 8.89543 14 10M12 16V18M12 16C10.8954 16 10 15.1046 10 14M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'Понятная модель заработка',
    desc: 'Весь заработок по объекту — ваш. Платите только за доступ к заказам, не процент с ремонта.',
    color: '#34C759',
    bg: '#E8F9EE',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M13 7H21M13 12H21M13 17H21M8 7L6 9L4 7M8 17L6 19L4 17M8 12H4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'Рост без хаоса',
    desc: 'Работайте в своём темпе. Лучшие результаты — больше заказов. Чёткая система роста.',
    color: '#3B82F6',
    bg: '#EFF6FF',
  },
];

export default function Benefits() {
  return (
    <section className="py-24 bg-[#F8FAFC]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 bg-white border border-[#E5E7EB] rounded-full px-4 py-1.5 mb-4">
            <span className="text-sm font-semibold text-[#6B7280]">Возможности</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#111827] mb-4">
            Что вы получаете<br className="hidden sm:block" /> внутри платформы
          </h2>
          <p className="text-lg text-[#6B7280] max-w-xl mx-auto">
            Это не стихийный рынок. Это рабочая система.
          </p>
        </div>

        {/* Benefits Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {benefits.map((benefit, i) => (
            <div
              key={i}
              className="bg-white border border-[#E5E7EB] rounded-2xl p-5 hover:shadow-md hover:-translate-y-1 transition-all duration-300 group"
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 transition-all duration-300"
                style={{ backgroundColor: benefit.bg, color: benefit.color }}
              >
                {benefit.icon}
              </div>
              <h3 className="text-base font-bold text-[#111827] mb-2">{benefit.title}</h3>
              <p className="text-sm text-[#6B7280] leading-relaxed">{benefit.desc}</p>
            </div>
          ))}
        </div>

        {/* Bottom statement */}
        <div className="mt-14 text-center">
          <div className="inline-flex items-center gap-3 bg-white border border-[#E5E7EB] rounded-2xl px-8 py-5 shadow-sm">
            <div className="w-10 h-10 bg-[#E8F9EE] rounded-xl flex items-center justify-center shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="#34C759" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="text-left">
              <p className="text-base font-bold text-[#111827]">Это не стихийный рынок</p>
              <p className="text-sm text-[#6B7280]">Это рабочая система с понятными правилами и реальным потоком заказов</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
