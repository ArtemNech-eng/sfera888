export default function OneOrder() {
  return (
    <section className="py-24 bg-[#111827]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: Visual */}
          <div className="order-2 lg:order-1">
            {/* Workflow visual */}
            <div className="bg-[#1a2332] rounded-3xl p-8 border border-white/10">
              <p className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-6">Рабочий цикл мастера</p>
              
              <div className="flex flex-col gap-4">
                {[
                  { step: 'Взял объект', status: 'active', color: '#34C759', icon: '📋' },
                  { step: 'Выполнил работу', status: 'active', color: '#34C759', icon: '🔨' },
                  { step: 'Закрыл заказ', status: 'active', color: '#34C759', icon: '✅' },
                  { step: 'Получил следующий', status: 'next', color: '#3B82F6', icon: '📦' },
                ].map((item, i) => (
                  <div key={i}>
                    <div className={`flex items-center gap-4 p-4 rounded-2xl ${
                      item.status === 'active' ? 'bg-white/5' : 'bg-[#34C759]/10 border border-[#34C759]/30'
                    }`}>
                      <div 
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                        style={{ backgroundColor: `${item.color}20` }}
                      >
                        {item.icon}
                      </div>
                      <div className="flex-1">
                        <span className="text-white font-semibold text-sm">{item.step}</span>
                        {item.status === 'next' && (
                          <span className="ml-2 text-[10px] bg-[#34C759] text-white px-2 py-0.5 rounded-full font-bold">Автоматически</span>
                        )}
                      </div>
                      <div 
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                    </div>
                    {i < 3 && (
                      <div className="flex justify-center my-1">
                        <div className="w-px h-4 bg-white/10" />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Limit indicator */}
              <div className="mt-6 bg-white/5 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white/70 text-xs font-medium">Активных заказов</span>
                  <span className="text-white font-bold text-sm">1 / 1</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-2">
                  <div className="bg-[#34C759] h-2 rounded-full w-full" />
                </div>
                <p className="text-white/40 text-[10px] mt-2">Для топ-мастеров лимит увеличивается до 2</p>
              </div>
            </div>
          </div>

          {/* Right: Text */}
          <div className="order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 mb-6">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="#34C759" strokeWidth="2"/>
                <path d="M12 8V12L15 15" stroke="#34C759" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span className="text-sm font-semibold text-white/80">Дисциплина системы</span>
            </div>
            
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white mb-6 leading-tight">
              Система<br />без хаоса
            </h2>

            <p className="text-white/60 text-lg mb-8 leading-relaxed">
              Мы не даём мастерам хватать по 5 объектов и срывать сроки.
            </p>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8">
              <p className="text-white font-bold text-lg mb-2">По умолчанию:</p>
              <p className="text-[#34C759] text-2xl font-black mb-4">1 активный заказ в руки</p>
              
              <div className="flex flex-col gap-3">
                {[
                  { text: 'Взял объект', arrow: true },
                  { text: 'Сделал', arrow: true },
                  { text: 'Закрыл', arrow: true },
                  { text: 'Получил следующий', arrow: false },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-6 h-6 bg-[#34C759]/20 rounded-full flex items-center justify-center shrink-0">
                      <span className="text-[#34C759] text-xs font-bold">{i + 1}</span>
                    </div>
                    <span className="text-white/80 text-sm font-medium">{item.text}</span>
                    {item.arrow && (
                      <svg className="ml-auto text-white/20" width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M12 5V19M12 19L5 12M12 19L19 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3 bg-white/5 rounded-xl p-4">
                <div className="w-6 h-6 bg-[#34C759]/20 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13L9 17L19 7" stroke="#34C759" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p className="text-white/70 text-sm">В системе меньше хаоса — клиенты спокойнее</p>
              </div>
              <div className="flex items-start gap-3 bg-white/5 rounded-xl p-4">
                <div className="w-6 h-6 bg-[#34C759]/20 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13L9 17L19 7" stroke="#34C759" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p className="text-white/70 text-sm">Сильные мастера работают без простоев</p>
              </div>
              <div className="flex items-start gap-3 bg-[#34C759]/10 border border-[#34C759]/30 rounded-xl p-4">
                <div className="w-6 h-6 bg-[#34C759]/20 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M13 7H21M13 12H21M13 17H21M8 7L6 9L4 7M8 17L6 19L4 17M8 12H4" stroke="#34C759" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p className="text-[#34C759] text-sm font-semibold">Для лучших мастеров с высокой конверсией лимит может быть увеличен до 2 объектов одновременно</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
