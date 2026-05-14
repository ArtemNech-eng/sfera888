const specializations = [
  { icon: '🖼️', name: 'Обои' },
  { icon: '🪣', name: 'Шпаклёвка' },
  { icon: '🎨', name: 'Покраска' },
  { icon: '🔲', name: 'Плитка' },
  { icon: '🚿', name: 'Санузлы' },
  { icon: '🏠', name: 'Отделочники' },
  { icon: '🔧', name: 'Универсалы' },
  { icon: '👥', name: 'Бригады' },
];

const requirements = [
  { icon: '📱', text: 'Быть на связи и отвечать быстро' },
  { icon: '📍', text: 'Приезжать на замеры в срок' },
  { icon: '📊', text: 'Считать сметы через приложение' },
  { icon: '🔒', text: 'Работать только через систему' },
  { icon: '⏰', text: 'Соблюдать сроки по объекту' },
  { icon: '💰', text: 'Держать адекватные рыночные цены' },
];

export default function WhoWeHire() {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="py-24 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 bg-[#F1F5F9] rounded-full px-4 py-1.5 mb-4">
            <span className="text-sm font-semibold text-[#6B7280]">Отбор</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#111827] mb-4">
            Кого мы берём<br className="hidden sm:block" /> в систему
          </h2>
          <p className="text-lg text-[#6B7280] max-w-xl mx-auto">
            Нужны не обещания, а мастера, которые умеют работать по правилам.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-10">
          {/* Left: Specializations */}
          <div>
            <h3 className="text-lg font-bold text-[#111827] mb-5">Специализации</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
              {specializations.map((spec, i) => (
                <div
                  key={i}
                  className="bg-[#F8FAFC] border border-[#E5E7EB] rounded-2xl p-4 text-center hover:border-[#34C759]/40 hover:bg-[#E8F9EE] transition-all duration-200 group cursor-default"
                >
                  <div className="text-2xl mb-2">{spec.icon}</div>
                  <span className="text-xs font-semibold text-[#374151] group-hover:text-[#22A06B]">{spec.name}</span>
                </div>
              ))}
            </div>

            {/* Not a job posting note */}
            <div className="bg-[#111827] rounded-2xl p-5">
              <p className="text-white font-bold mb-2">Это не вакансия</p>
              <p className="text-white/60 text-sm leading-relaxed">
                Вы не нанимаетесь в штат. Вы подключаетесь к платформе как самостоятельный мастер. Своя работа, свои правила — в рамках системы.
              </p>
            </div>
          </div>

          {/* Right: Requirements */}
          <div>
            <h3 className="text-lg font-bold text-[#111827] mb-5">Что важно для нас</h3>
            <div className="flex flex-col gap-3">
              {requirements.map((req, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl p-4 hover:border-[#34C759]/40 hover:bg-[#E8F9EE] transition-all duration-200"
                >
                  <div className="w-10 h-10 bg-white border border-[#E5E7EB] rounded-xl flex items-center justify-center text-xl shrink-0 shadow-sm">
                    {req.icon}
                  </div>
                  <span className="text-sm font-medium text-[#374151]">{req.text}</span>
                </div>
              ))}
            </div>

            {/* Filter note */}
            <div className="mt-5 bg-[#FEF2F2] border border-[#EF4444]/20 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[#EF4444]/20 flex items-center justify-center shrink-0 mt-0.5">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6L6 18M6 6L18 18" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <p className="text-sm text-[#991B1B]">
                  <span className="font-bold">Мы не подходим</span> тем, кто ищет подработку без обязательств, хочет хаотично брать заказы или работает без системы.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="mt-14 text-center">
          <button
            onClick={() => scrollTo('how-to-start')}
            className="bg-[#34C759] hover:bg-[#22A06B] text-white font-bold px-10 py-4 rounded-2xl text-base transition-all duration-200 shadow-md hover:shadow-lg hover:-translate-y-0.5 inline-flex items-center gap-2"
          >
            Я подхожу — хочу подключиться
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
