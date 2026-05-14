const selfItems = [
  { text: 'Авито, звонки, мусорные лиды', icon: '❌' },
  { text: 'Простои между объектами', icon: '❌' },
  { text: 'Пустые замеры — приехал зря', icon: '❌' },
  { text: 'Нет порядка, нет системы', icon: '❌' },
  { text: 'Не знаешь, будет ли работа завтра', icon: '❌' },
];

const platformItems = [
  { text: 'Заявки уже в системе — ждут вас', icon: '✓' },
  { text: 'Понятный маршрут до каждого объекта', icon: '✓' },
  { text: 'Смета через приложение — быстро и чётко', icon: '✓' },
  { text: 'Бронь мастера через систему', icon: '✓' },
  { text: 'Лучшие мастера получают больше заказов', icon: '✓' },
  { text: 'Меньше хаоса, больше рабочего ритма', icon: '✓' },
];

export default function WhyPlatform() {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="py-24 bg-[#F1F5F9]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 bg-white border border-[#E5E7EB] rounded-full px-4 py-1.5 mb-4">
            <span className="text-sm font-semibold text-[#6B7280]">Сравнение</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#111827] mb-4">
            Почему сильные мастера<br className="hidden sm:block" /> переходят на платформу
          </h2>
          <p className="text-lg text-[#6B7280] max-w-xl mx-auto">
            Разница между самостоятельным поиском и работой через систему — очевидна.
          </p>
        </div>

        {/* Comparison Grid */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left: Self Search */}
          <div className="bg-white border border-[#E5E7EB] rounded-3xl overflow-hidden">
            <div className="bg-[#F8FAFC] border-b border-[#E5E7EB] px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#EF4444]/10 rounded-xl flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6L6 18M6 6L18 18" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-[#111827]">Сам ищешь клиентов</h3>
              </div>
            </div>
            <div className="p-6 flex flex-col gap-3">
              {selfItems.map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-[#FEF2F2]">
                  <span className="text-sm font-bold text-[#EF4444] w-5 shrink-0">{item.icon}</span>
                  <span className="text-sm text-[#374151] font-medium">{item.text}</span>
                </div>
              ))}
              <div className="mt-3 p-4 bg-[#FEF2F2] rounded-xl border border-[#EF4444]/20">
                <p className="text-sm font-bold text-[#EF4444]">Результат:</p>
                <p className="text-sm text-[#6B7280] mt-1">Нестабильный доход, усталость от поиска, потеря времени на мусорные лиды.</p>
              </div>
            </div>
          </div>

          {/* Right: Platform */}
          <div className="bg-white border-2 border-[#34C759]/40 rounded-3xl overflow-hidden shadow-lg shadow-[#34C759]/10 relative">
            {/* Popular badge */}
            <div className="absolute top-4 right-4 bg-[#34C759] text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wide">
              Выбор мастеров
            </div>
            <div className="bg-[#E8F9EE] border-b border-[#34C759]/20 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#34C759]/20 rounded-xl flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="#22A06B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-[#111827]">Работаешь через Честный Мастер</h3>
              </div>
            </div>
            <div className="p-6 flex flex-col gap-3">
              {platformItems.map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-[#E8F9EE]">
                  <span className="text-sm font-bold text-[#22A06B] w-5 shrink-0">{item.icon}</span>
                  <span className="text-sm text-[#374151] font-medium">{item.text}</span>
                </div>
              ))}
              <div className="mt-3 p-4 bg-[#E8F9EE] rounded-xl border border-[#34C759]/30">
                <p className="text-sm font-bold text-[#22A06B]">Результат:</p>
                <p className="text-sm text-[#374151] mt-1">Стабильный поток объектов, рабочий ритм, рост дохода без хаоса.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-12">
          <button
            onClick={() => scrollTo('start')}
            className="bg-[#34C759] hover:bg-[#22A06B] text-white font-bold px-10 py-4 rounded-2xl text-base transition-all duration-200 shadow-md hover:shadow-lg hover:-translate-y-0.5 inline-flex items-center gap-2"
          >
            Подключиться к платформе
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
