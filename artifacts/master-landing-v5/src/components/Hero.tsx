export default function Hero() {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative min-h-screen bg-[#F8FAFC] overflow-hidden pt-16">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-0 w-[600px] h-[600px] bg-gradient-to-bl from-[#34C759]/8 to-transparent rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-[400px] h-[400px] bg-gradient-to-tr from-[#3B82F6]/5 to-transparent rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-r from-[#34C759]/3 to-[#3B82F6]/3 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-20 lg:pt-24">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          
          {/* Left: Text Content */}
          <div className="flex flex-col gap-6">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-[#E8F9EE] border border-[#34C759]/30 rounded-full px-4 py-1.5 w-fit">
              <div className="w-2 h-2 bg-[#34C759] rounded-full animate-pulse" />
              <span className="text-sm font-medium text-[#22A06B]">Платформа для мастеров-отделочников</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-[#111827] leading-[1.1] tracking-tight">
              Заказы для мастеров.{' '}
              <span className="text-[#34C759]">Без хаоса.</span>{' '}
              Через систему.
            </h1>

            {/* Subheadline */}
            <p className="text-lg text-[#6B7280] leading-relaxed max-w-lg">
              Обои, шпаклёвка, покраска, плитка, санузлы, отделка — берите реальные объекты через приложение и работайте по понятным правилам.
            </p>

            {/* 3 Key Benefits */}
            <div className="flex flex-col sm:flex-row gap-3">
              {[
                { icon: '📦', text: 'Заказы каждый день' },
                { icon: '📱', text: 'Смета и бронь через приложение' },
                { icon: '💰', text: '100% заработка по объекту — ваш' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 bg-white border border-[#E5E7EB] rounded-xl px-4 py-2.5 shadow-sm">
                  <span className="text-base">{item.icon}</span>
                  <span className="text-sm font-medium text-[#111827] whitespace-nowrap">{item.text}</span>
                </div>
              ))}
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={() => scrollTo('start')}
                className="bg-[#34C759] hover:bg-[#22A06B] text-white font-bold px-8 py-4 rounded-2xl text-base transition-all duration-200 shadow-md hover:shadow-lg hover:-translate-y-0.5 flex items-center justify-center gap-2"
              >
                Начать с тестового заказа
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <button
                onClick={() => scrollTo('how-it-works')}
                className="bg-white hover:bg-gray-50 text-[#111827] font-semibold px-8 py-4 rounded-2xl text-base border border-[#E5E7EB] transition-all duration-200 hover:border-[#34C759]/40"
              >
                Как это работает
              </button>
            </div>

            {/* Mini Stats Block */}
            <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-sm mt-2">
              <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-4">Сейчас в системе</p>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Новые объекты', value: 'каждый день', color: '#34C759' },
                  { label: 'Мастера в работе', value: 'прямо сейчас', color: '#3B82F6' },
                  { label: 'Процесс', value: 'без хаоса', color: '#F59E0B' },
                ].map((stat, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <div className="w-2 h-2 rounded-full mb-1" style={{ backgroundColor: stat.color }} />
                    <span className="text-xs font-bold text-[#111827]">{stat.value}</span>
                    <span className="text-[11px] text-[#94A3B8] leading-tight">{stat.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: App Mockup */}
          <div className="relative flex items-center justify-center lg:justify-end">
            {/* Phone Mockup */}
            <div className="relative z-10">
              <div className="w-72 bg-[#111827] rounded-[40px] p-3 shadow-2xl">
                <div className="bg-[#F8FAFC] rounded-[30px] overflow-hidden">
                  {/* Phone Status Bar */}
                  <div className="bg-[#111827] px-6 pt-3 pb-2 flex items-center justify-between">
                    <span className="text-white text-xs font-medium">9:41</span>
                    <div className="w-24 h-6 bg-[#1a1a2e] rounded-full" />
                    <div className="flex gap-1">
                      <div className="w-3 h-3 bg-white/60 rounded-sm" />
                    </div>
                  </div>
                  
                  {/* App Content */}
                  <div className="bg-white px-4 pt-4 pb-6 flex flex-col gap-3">
                    {/* App Header */}
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <p className="text-[10px] text-[#94A3B8]">Добро пожаловать</p>
                        <p className="text-sm font-bold text-[#111827]">Честный Мастер</p>
                      </div>
                      <div className="w-8 h-8 bg-[#E8F9EE] rounded-full flex items-center justify-center">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path d="M15 17H20L18.5951 15.5951C18.2141 15.2141 18 14.6973 18 14.1585V11C18 8.38757 16.3304 6.16509 14 5.34142V5C14 3.89543 13.1046 3 12 3C10.8954 3 10 3.89543 10 5V5.34142C7.66962 6.16509 6 8.38757 6 11V14.1585C6 14.6973 5.78595 15.2141 5.40493 15.5951L4 17H9M15 17V18C15 19.6569 13.6569 21 12 21C10.3431 21 9 19.6569 9 18V17M15 17H9" stroke="#34C759" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    </div>

                    {/* New Order Card */}
                    <div className="bg-[#E8F9EE] border border-[#34C759]/30 rounded-2xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-semibold text-[#22A06B] bg-[#34C759]/20 rounded-full px-2 py-0.5">Новый объект</span>
                        <span className="text-[10px] text-[#94A3B8]">2 мин назад</span>
                      </div>
                      <p className="text-xs font-bold text-[#111827] mb-1">Поклейка обоев — 3 комнаты</p>
                      <p className="text-[10px] text-[#6B7280] mb-3">Москва, Хамовники · ~65 м²</p>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-black text-[#111827]">от 28 000 ₽</span>
                        <button className="bg-[#34C759] text-white text-[10px] font-bold px-3 py-1.5 rounded-xl">Откликнуться</button>
                      </div>
                    </div>

                    {/* Order Cards */}
                    {[
                      { type: 'Плитка', room: 'Санузел · 8 м²', location: 'Москва, Сокол', price: '18 000 ₽', time: '15 мин' },
                      { type: 'Шпаклёвка + покраска', room: '4 комнаты · 80 м²', location: 'Подольск', price: '42 000 ₽', time: '32 мин' },
                    ].map((order, i) => (
                      <div key={i} className="bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-[#111827]">{order.type}</p>
                            <p className="text-[10px] text-[#6B7280]">{order.room}</p>
                            <p className="text-[10px] text-[#94A3B8] mt-0.5">{order.location}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-bold text-[#111827]">{order.price}</p>
                            <p className="text-[10px] text-[#94A3B8]">{order.time} назад</p>
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Bottom Nav */}
                    <div className="flex items-center justify-around pt-2 border-t border-[#E5E7EB] mt-1">
                      {['Заказы', 'Смета', 'Заработок'].map((item, i) => (
                        <div key={i} className={`flex flex-col items-center gap-1 ${i === 0 ? 'text-[#34C759]' : 'text-[#94A3B8]'}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-[#34C759]' : 'bg-transparent'}`} />
                          <span className="text-[9px] font-medium">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating Cards */}
              <div className="absolute -left-16 top-12 bg-white border border-[#E5E7EB] rounded-2xl p-3 shadow-xl w-36">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-[#E8F9EE] rounded-lg flex items-center justify-center">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="#34C759" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <span className="text-[10px] font-semibold text-[#111827]">Объект забронирован</span>
                </div>
                <p className="text-[9px] text-[#6B7280]">Клиент подтвердил замер</p>
              </div>

              <div className="absolute -right-12 bottom-28 bg-white border border-[#E5E7EB] rounded-2xl p-3 shadow-xl w-32">
                <p className="text-[10px] font-semibold text-[#111827] mb-1">Ваш доход</p>
                <p className="text-lg font-black text-[#34C759]">185к</p>
                <p className="text-[9px] text-[#94A3B8]">за прошлый месяц</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
