export default function FinalCTA() {
  return (
    <section className="py-24 bg-[#111827] relative overflow-hidden">
      {/* Background decorative */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#34C759]/8 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-[#3B82F6]/5 rounded-full blur-3xl" />
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-5 py-2 mb-8">
          <div className="w-2 h-2 bg-[#34C759] rounded-full animate-pulse" />
          <span className="text-sm font-medium text-white/80">Платформа открыта для новых мастеров</span>
        </div>

        {/* Headline */}
        <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white mb-6 leading-[1.1]">
          Хватит искать<br />
          клиентов{' '}
          <span className="text-[#34C759]">вслепую</span>
        </h2>

        <p className="text-lg sm:text-xl text-white/60 mb-10 max-w-2xl mx-auto leading-relaxed">
          Подключайтесь к системе, где есть объекты, понятные правила и рабочий ритм.
        </p>

        {/* Main CTA Button */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
          <a
            href="#"
            className="bg-[#34C759] hover:bg-[#22A06B] text-white font-bold px-12 py-5 rounded-2xl text-lg transition-all duration-200 shadow-lg shadow-[#34C759]/30 hover:shadow-xl hover:-translate-y-1 flex items-center gap-3 w-full sm:w-auto justify-center"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 18H12.01M8 21H16C17.1046 21 18 20.1046 18 19V5C18 3.89543 17.1046 3 16 3H8C6.89543 3 6 3.89543 6 5V19C6 20.1046 6.89543 21 8 21Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Начать с тестового заказа
          </a>
        </div>

        <p className="text-sm text-white/30">
          Регистрация в приложении → тестовый доступ или сразу пакет заказов
        </p>

        {/* 3 Pillars */}
        <div className="grid grid-cols-3 gap-4 mt-16 max-w-2xl mx-auto">
          {[
            { icon: '📦', label: 'Объекты', desc: 'каждый день' },
            { icon: '📋', label: 'Правила', desc: 'понятные' },
            { icon: '💰', label: 'Заработок', desc: 'до 220 000 ₽' },
          ].map((item, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
              <div className="text-2xl mb-2">{item.icon}</div>
              <p className="text-white font-bold text-sm">{item.label}</p>
              <p className="text-white/40 text-xs mt-0.5">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
