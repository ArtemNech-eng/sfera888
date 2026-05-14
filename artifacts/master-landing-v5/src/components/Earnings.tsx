const levels = [
  {
    level: 'Новичок',
    emoji: '🌱',
    desc: 'Проходит тестовый период, получает первые объекты, встраивается в процесс.',
    items: [
      'Тестовый период',
      'Первые 1–2 объекта',
      'Знакомство с системой',
      'Первый заработок',
    ],
    income: 'от 60 000 ₽',
    color: '#94A3B8',
    bg: '#F1F5F9',
    barWidth: '33%',
  },
  {
    level: 'Сильный мастер',
    emoji: '⚡',
    desc: 'Работает стабильно, почти без простоев, берёт больше объектов в хорошем темпе.',
    items: [
      'Стабильный поток заказов',
      'Почти нет простоев',
      'Высокая конверсия',
      'Хороший рейтинг',
    ],
    income: 'от 120 000 ₽',
    color: '#3B82F6',
    bg: '#EFF6FF',
    barWidth: '65%',
  },
  {
    level: 'Топ-мастер',
    emoji: '🏆',
    desc: 'Высокий рейтинг, максимальный приоритет, лучшие заказы. Работает без простоев.',
    items: [
      'Лучшие объекты в системе',
      'Максимальный приоритет',
      'До 2 объектов одновременно',
      'Максимальный доход',
    ],
    income: 'до 220 000 ₽',
    color: '#34C759',
    bg: '#E8F9EE',
    barWidth: '100%',
  },
];

const factors = [
  { icon: '🎯', text: 'Ваша конверсия на замерах' },
  { icon: '⚡', text: 'Скорость выполнения работ' },
  { icon: '⭐', text: 'Качество и рейтинг' },
  { icon: '🤝', text: 'Умение довести клиента до объекта' },
  { icon: '📋', text: 'Дисциплина в системе' },
  { icon: '📈', text: 'Количество закрытых заказов' },
];

export default function Earnings() {
  return (
    <section id="earnings" className="py-24 bg-[#F1F5F9]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 bg-white border border-[#E5E7EB] rounded-full px-4 py-1.5 mb-4">
            <span className="text-sm font-semibold text-[#6B7280]">Доход</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#111827] mb-4">
            Сколько можно зарабатывать
          </h2>
          <p className="text-lg text-[#6B7280] max-w-xl mx-auto">
            Доход зависит от вас. Система даёт возможности — вы решаете, сколько берёте.
          </p>
        </div>

        {/* Income range banner */}
        <div className="bg-[#111827] rounded-3xl p-8 mb-10 text-center relative overflow-hidden">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[200px] bg-[#34C759]/10 rounded-full blur-3xl" />
          </div>
          <div className="relative z-10">
            <p className="text-white/60 text-sm font-medium mb-3 uppercase tracking-wider">Вилка дохода мастеров платформы</p>
            <div className="flex items-center justify-center gap-4">
              <span className="text-3xl sm:text-5xl font-black text-white">120 000</span>
              <span className="text-white/40 text-2xl font-bold">—</span>
              <span className="text-3xl sm:text-5xl font-black text-[#34C759]">220 000 ₽</span>
            </div>
            <p className="text-white/40 text-sm mt-3">в месяц для активных мастеров</p>
          </div>
        </div>

        {/* Levels */}
        <div className="grid sm:grid-cols-3 gap-6 mb-12">
          {levels.map((lvl, i) => (
            <div
              key={i}
              className="bg-white border border-[#E5E7EB] rounded-3xl overflow-hidden hover:shadow-md transition-all duration-300 hover:-translate-y-1"
            >
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
                    style={{ backgroundColor: lvl.bg }}
                  >
                    {lvl.emoji}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#111827]">{lvl.level}</h3>
                    <div className="text-xl font-black" style={{ color: lvl.color }}>{lvl.income}</div>
                  </div>
                </div>

                <p className="text-sm text-[#6B7280] mb-5 leading-relaxed">{lvl.desc}</p>

                {/* Progress bar */}
                <div className="mb-5">
                  <div className="w-full bg-[#F1F5F9] rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all duration-500"
                      style={{ width: lvl.barWidth, backgroundColor: lvl.color }}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  {lvl.items.map((item, j) => (
                    <div key={j} className="flex items-center gap-2">
                      <div
                        className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: lvl.bg }}
                      >
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none">
                          <path d="M5 13L9 17L19 7" stroke={lvl.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <span className="text-xs text-[#374151]">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* What affects income */}
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6">
            <h3 className="text-base font-bold text-[#111827] mb-5">Что влияет на доход</h3>
            <div className="grid grid-cols-2 gap-3">
              {factors.map((f, i) => (
                <div key={i} className="flex items-center gap-2.5 bg-[#F8FAFC] rounded-xl p-3">
                  <span className="text-lg">{f.icon}</span>
                  <span className="text-xs font-medium text-[#374151] leading-tight">{f.text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#E8F9EE] border border-[#34C759]/30 rounded-2xl p-6 flex flex-col justify-center">
            <div className="w-10 h-10 bg-[#34C759]/20 rounded-xl flex items-center justify-center mb-4">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M13 16H12V12H11M12 8H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="#22A06B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="text-[#22A06B] font-bold text-lg mb-3">Мы не обещаем сказки</p>
            <p className="text-[#374151] text-sm leading-relaxed">
              Мы даём систему, в которой сильные мастера зарабатывают больше. Доход зависит от вашей работы, дисциплины и умения использовать возможности платформы.
            </p>
            <div className="mt-5 pt-5 border-t border-[#34C759]/20">
              <p className="text-xs text-[#6B7280]">Цифры основаны на реальных результатах мастеров платформы. Ваши результаты могут отличаться в зависимости от региона, специализации и активности.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
