export default function TestOrder() {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section id="start" className="py-24 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: Main content */}
          <div>
            <div className="inline-flex items-center gap-2 bg-[#E8F9EE] border border-[#34C759]/30 rounded-full px-4 py-1.5 mb-6">
              <div className="w-2 h-2 bg-[#34C759] rounded-full" />
              <span className="text-sm font-semibold text-[#22A06B]">Тестовый период</span>
            </div>
            
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#111827] mb-5 leading-tight">
              Начните с<br />тестового заказа
            </h2>
            
            <p className="text-lg text-[#6B7280] mb-6 leading-relaxed">
              Сначала мы смотрим друг на друга. Вы проверяете систему, а мы — вашу работу.
            </p>

            <div className="bg-[#F8FAFC] border border-[#E5E7EB] rounded-2xl p-6 mb-6">
              <p className="text-sm font-semibold text-[#111827] mb-4">Для новых мастеров доступен ограниченный тестовый период.</p>
              <p className="text-sm text-[#6B7280] mb-4">Вы получаете 1–2 тестовых заказа, чтобы:</p>
              <div className="flex flex-col gap-2.5">
                {[
                  'Посмотреть качество объектов и систему изнутри',
                  'Понять, как работает процесс от замера до брони',
                  'Показать, как вы ведёте замер',
                  'Пройти первый этап отбора',
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="w-5 h-5 bg-[#E8F9EE] rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                        <path d="M5 13L9 17L19 7" stroke="#34C759" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <span className="text-sm text-[#374151]">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Important note */}
            <div className="bg-[#FFF7ED] border border-[#F59E0B]/30 rounded-2xl p-5 mb-8">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-[#F59E0B]/20 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M12 9V13M12 17H12.01M10.29 3.86L1.82 18C1.64 18.32 1.55 18.68 1.56 19.04C1.56 19.4 1.66 19.76 1.84 20.07C2.03 20.38 2.3 20.64 2.62 20.82C2.95 21 3.31 21.09 3.68 21.09H20.32C20.69 21.09 21.05 21 21.38 20.82C21.7 20.64 21.97 20.38 22.16 20.07C22.34 19.76 22.44 19.4 22.44 19.04C22.45 18.68 22.36 18.32 22.18 18L13.71 3.86C13.52 3.56 13.25 3.32 12.94 3.15C12.62 2.98 12.26 2.9 11.9 2.9C11.54 2.9 11.18 2.98 10.86 3.15C10.55 3.32 10.28 3.56 10.09 3.86H10.29Z" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-[#92400E] mb-1">Важно</p>
                  <p className="text-sm text-[#78350F]">
                    Тестовый доступ не бесплатный навсегда и не бесконечный. После тестового заказа работа в системе переходит в платный формат доступа к заказам.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => scrollTo('how-to-start')}
              className="bg-[#34C759] hover:bg-[#22A06B] text-white font-bold px-8 py-4 rounded-2xl text-base transition-all duration-200 shadow-md hover:shadow-lg hover:-translate-y-0.5 flex items-center gap-2"
            >
              Получить тестовый заказ
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          {/* Right: Two paths card */}
          <div className="flex flex-col gap-5">
            <div className="bg-[#F8FAFC] border border-[#E5E7EB] rounded-2xl p-6">
              <h3 className="text-base font-bold text-[#111827] mb-5">Как оплачивается тестовый старт</h3>
              
              {/* Path 1: Verification */}
              <div className="bg-white border-2 border-[#3B82F6]/30 rounded-2xl p-5 mb-4 relative">
                <div className="absolute -top-2.5 left-4 bg-[#3B82F6] text-white text-[10px] font-bold px-3 py-0.5 rounded-full">ПУТЬ 1</div>
                <div className="flex items-start gap-3 mt-1">
                  <div className="w-8 h-8 bg-[#EFF6FF] rounded-xl flex items-center justify-center shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M10 6H5C3.89543 6 3 6.89543 3 8V18C3 19.1046 3.89543 20 5 20H19C20.1046 20 21 19.1046 21 18V8C21 6.89543 20.1046 6 19 6H14M10 6V5C10 4.44772 10.4477 4 11 4H13C13.5523 4 14 4.44772 14 5V6M10 6H14M12 11V16M9 13.5H15" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#111827] mb-1">Верификация по паспорту</p>
                    <p className="text-sm text-[#6B7280] leading-relaxed">
                      Хотите пройти тестовый старт — нужна верификация. После успешного тестового заказа переходите на основную модель.
                    </p>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-[#E5E7EB]" />
                <span className="text-xs font-semibold text-[#94A3B8]">или</span>
                <div className="flex-1 h-px bg-[#E5E7EB]" />
              </div>

              {/* Path 2: Immediate package */}
              <div className="bg-white border-2 border-[#34C759]/30 rounded-2xl p-5 relative">
                <div className="absolute -top-2.5 left-4 bg-[#34C759] text-white text-[10px] font-bold px-3 py-0.5 rounded-full">ПУТЬ 2</div>
                <div className="flex items-start gap-3 mt-1">
                  <div className="w-8 h-8 bg-[#E8F9EE] rounded-xl flex items-center justify-center shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M20 12V22H4V12M22 7H2V12H22V7ZM12 22V7M12 7H7.5C6.83696 7 6.20107 6.73661 5.73223 6.26777C5.26339 5.79893 5 5.16304 5 4.5C5 3.11929 6.11929 2 7.5 2C9.5 2 12 7 12 7ZM12 7H16.5C17.163 7 17.7989 6.73661 18.2678 6.26777C18.7366 5.79893 19 5.16304 19 4.5C19 3.11929 17.8807 2 16.5 2C14.5 2 12 7 12 7Z" stroke="#22A06B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#111827] mb-1">Сразу купить пакет заказов</p>
                    <p className="text-sm text-[#6B7280] leading-relaxed">
                      Не хотите верификацию — можно сразу купить пакет и начать работу. Без тестового периода.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Filter note */}
            <div className="bg-[#111827] rounded-2xl p-6 text-white">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M12 15V17M12 7V13M12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold mb-2">Тест — это входной фильтр</p>
                  <p className="text-sm text-white/70 leading-relaxed">
                    Мы не берём всех подряд. Тестовый старт позволяет убедиться, что вы работаете по правилам, умеете вести замер и готовы к дисциплине.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
