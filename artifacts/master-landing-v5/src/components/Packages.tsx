const packages = [
  {
    name: 'Старт',
    price: '5 000',
    orders: '1 заказ',
    ordersCount: 1,
    desc: 'Для входа в рабочий ритм',
    tag: null,
    highlight: false,
    features: [
      '1 заказ из системы',
      'Полный доступ к приложению',
      'Смета и бронь',
      'Весь заработок — ваш',
    ],
  },
  {
    name: 'Профи',
    price: '20 000',
    orders: '5 заказов',
    ordersCount: 5,
    desc: 'Оптимальный пакет для стабильной работы',
    tag: 'Популярный',
    highlight: true,
    features: [
      '5 заказов из системы',
      'Приоритет в ленте заказов',
      'Смета и бронь',
      'Весь заработок — ваш',
      'Приоритетная поддержка',
    ],
  },
  {
    name: 'Максимум',
    price: '30 000',
    orders: '10 заказов',
    ordersCount: 10,
    desc: 'Для сильных мастеров и бригад',
    tag: 'Выгодно',
    highlight: false,
    features: [
      '10 заказов из системы',
      'Максимальный приоритет',
      'Смета и бронь',
      'Весь заработок — ваш',
      'Персональный менеджер',
      'Возможность 2 объектов',
    ],
  },
];

const advantages = [
  'Не платите проценты с объекта',
  'Не отчитываетесь по каждому чеку',
  'Полностью забираете заработок по ремонту',
  'Просто берёте заказы через систему',
];

export default function Packages() {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section id="packages" className="py-24 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-[#F1F5F9] rounded-full px-4 py-1.5 mb-4">
            <span className="text-sm font-semibold text-[#6B7280]">После тестового периода</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#111827] mb-4">
            Пакеты заказов
          </h2>
          <p className="text-lg text-[#6B7280] max-w-2xl mx-auto">
            Вы не отдаёте проценты с объекта. Вы покупаете доступ к реальным заказам.
          </p>
        </div>

        {/* Main explanation */}
        <div className="bg-[#F8FAFC] border border-[#E5E7EB] rounded-2xl p-6 mb-12 max-w-3xl mx-auto text-center">
          <p className="text-[#374151] leading-relaxed">
            После тестового периода мастер подключается к платной модели доступа. Вы покупаете пакет заказов и сами решаете, какие объекты брать.{' '}
            <span className="font-bold text-[#111827]">Весь заработок по объекту — ваш. Платформа не забирает процент с ремонта.</span>
          </p>
        </div>

        {/* Package Cards */}
        <div className="grid sm:grid-cols-3 gap-6 mb-12">
          {packages.map((pkg, i) => (
            <div
              key={i}
              className={`relative rounded-3xl overflow-hidden transition-all duration-300 hover:-translate-y-1 ${
                pkg.highlight
                  ? 'bg-[#111827] shadow-2xl shadow-[#111827]/20 scale-105'
                  : 'bg-white border border-[#E5E7EB] shadow-sm hover:shadow-md'
              }`}
            >
              {/* Tag */}
              {pkg.tag && (
                <div className={`absolute top-5 right-5 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wide ${
                  pkg.highlight ? 'bg-[#34C759] text-white' : 'bg-[#F1F5F9] text-[#6B7280]'
                }`}>
                  {pkg.tag}
                </div>
              )}

              <div className="p-7">
                {/* Name */}
                <p className={`text-sm font-semibold mb-4 ${pkg.highlight ? 'text-white/60' : 'text-[#6B7280]'}`}>
                  {pkg.name}
                </p>

                {/* Price */}
                <div className="mb-2">
                  <span className={`text-4xl font-black ${pkg.highlight ? 'text-white' : 'text-[#111827]'}`}>
                    {pkg.price} ₽
                  </span>
                </div>

                {/* Orders count */}
                <div className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 mb-3 ${
                  pkg.highlight ? 'bg-[#34C759]/20' : 'bg-[#E8F9EE]'
                }`}>
                  <span className="text-[#34C759] font-bold text-sm">{pkg.orders}</span>
                </div>

                <p className={`text-sm mb-6 leading-relaxed ${pkg.highlight ? 'text-white/60' : 'text-[#6B7280]'}`}>
                  {pkg.desc}
                </p>

                {/* Divider */}
                <div className={`h-px mb-6 ${pkg.highlight ? 'bg-white/10' : 'bg-[#E5E7EB]'}`} />

                {/* Features */}
                <div className="flex flex-col gap-3 mb-8">
                  {pkg.features.map((feature, j) => (
                    <div key={j} className="flex items-center gap-2.5">
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                        pkg.highlight ? 'bg-[#34C759]/30' : 'bg-[#E8F9EE]'
                      }`}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none">
                          <path d="M5 13L9 17L19 7" stroke="#34C759" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <span className={`text-sm ${pkg.highlight ? 'text-white/80' : 'text-[#374151]'}`}>{feature}</span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <button
                  onClick={() => scrollTo('how-to-start')}
                  className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all duration-200 ${
                    pkg.highlight
                      ? 'bg-[#34C759] hover:bg-[#22A06B] text-white shadow-md hover:shadow-lg'
                      : 'bg-[#F8FAFC] hover:bg-[#E8F9EE] text-[#111827] border border-[#E5E7EB] hover:border-[#34C759]/40'
                  }`}
                >
                  Выбрать пакет
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Why profitable block */}
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-[#E8F9EE] border border-[#34C759]/30 rounded-2xl p-6">
            <h3 className="text-base font-bold text-[#111827] mb-4 flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 8C10.8954 8 10 8.89543 10 10C10 11.1046 10.8954 12 12 12C13.1046 12 14 12.8954 14 14C14 15.1046 13.1046 16 12 16M12 8V6M12 8C13.1046 8 14 8.89543 14 10M12 16V18M12 16C10.8954 16 10 15.1046 10 14M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="#22A06B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Почему это выгодно
            </h3>
            <div className="flex flex-col gap-3">
              {advantages.map((item, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="w-5 h-5 bg-[#34C759]/20 rounded-full flex items-center justify-center shrink-0">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
                      <path d="M5 13L9 17L19 7" stroke="#22A06B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <span className="text-sm text-[#374151] font-medium">{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#111827] rounded-2xl p-6 flex flex-col justify-center">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-8 h-8 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M13 16H12V12H11M12 8H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <p className="text-white font-bold mb-2">Не хотите верификацию?</p>
                <p className="text-white/60 text-sm leading-relaxed">
                  Можете сразу выбрать пакет и начать работу. Верификация нужна только для тестового старта.
                </p>
              </div>
            </div>
            <button
              onClick={() => scrollTo('how-to-start')}
              className="bg-white hover:bg-gray-100 text-[#111827] font-bold px-6 py-3 rounded-xl text-sm transition-all duration-200 mt-2"
            >
              Выбрать пакет сразу →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
