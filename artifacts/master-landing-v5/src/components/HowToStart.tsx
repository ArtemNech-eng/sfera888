const steps = [
  {
    num: '01',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M15 10L11 14L9 12M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'Нажимаете кнопку',
    desc: 'Жмёте «Начать с тестового заказа» на этой странице.',
  },
  {
    num: '02',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 18H12.01M8 21H16C17.1046 21 18 20.1046 18 19V5C18 3.89543 17.1046 3 16 3H8C6.89543 3 6 3.89543 6 5V19C6 20.1046 6.89543 21 8 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'Скачиваете приложение',
    desc: 'Переходите в приложение «Честный Мастер» и устанавливаете его.',
  },
  {
    num: '03',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M9 12L11 14L15 10M8.56 2.75C8.83 2.75 9.1 2.82 9.35 2.95L10.71 3.62C11.47 4.01 12.39 4.01 13.15 3.62L14.52 2.95C14.76 2.83 15.03 2.76 15.3 2.75C16.19 2.75 16.97 3.42 17.12 4.3L17.37 5.79C17.52 6.69 18.12 7.44 18.96 7.78L20.38 8.32C21.2 8.65 21.68 9.52 21.5 10.38L21.18 11.86C20.97 12.81 21.31 13.8 22.05 14.41L23.2 15.37C23.87 15.93 24.03 16.89 23.58 17.63L22.79 18.96C22.33 19.71 21.42 20.08 20.56 19.86L19.1 19.48C18.18 19.25 17.22 19.56 16.62 20.29L15.59 21.55C15.07 22.19 14.2 22.43 13.41 22.15L12.01 21.64C11.15 21.33 10.2 21.49 9.49 22.06L8.42 22.9C7.77 23.42 6.84 23.42 6.2 22.9L5.18 22.08C4.47 21.51 3.51 21.35 2.65 21.67L1.27 22.17C0.49 22.45 -0.37 22.21 -0.89 21.57L-1.92 20.31C-2.52 19.58 -3.48 19.27 -4.4 19.5L-5.86 19.88C-6.72 20.1 -7.63 19.73 -8.09 18.98L-8.88 17.65C-9.33 16.91 -9.17 15.95 -8.5 15.39L-7.35 14.43C-6.61 13.82 -6.27 12.83 -6.48 11.88L-6.8 10.4C-6.98 9.54 -6.5 8.67 -5.68 8.34L-4.26 7.8C-3.42 7.46 -2.82 6.71 -2.67 5.81L-2.42 4.32C-2.27 3.44 -1.49 2.77 -0.6 2.77H-0.5L0.87 3.43C1.63 3.82 2.55 3.82 3.31 3.43L4.67 2.76C4.92 2.63 5.19 2.56 5.46 2.56H5.56L6.26 2.76M3 9L5 11L9 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'Подтверждаете номер',
    desc: 'Регистрация по номеру телефона. Быстро и без лишних данных.',
  },
  {
    num: '04',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 15V17M6 21H18C19.1046 21 20 20.1046 20 19V13C20 11.8954 19.1046 11 18 11H6C4.89543 11 4 11.8954 4 13V19C4 20.1046 4.89543 21 6 21ZM16 11V7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7V11H16Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'Заходите в приложение',
    desc: 'Видите ленту заказов, свой профиль и все инструменты мастера.',
  },
  {
    num: '05',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M8 12L10 14L16 8M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'Выбираете путь',
    desc: 'Тестовый старт через верификацию — или сразу пакет заказов.',
  },
];

export default function HowToStart() {
  return (
    <section id="how-to-start" className="py-24 bg-[#F8FAFC]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 bg-white border border-[#E5E7EB] rounded-full px-4 py-1.5 mb-4">
            <span className="text-sm font-semibold text-[#6B7280]">Начало работы</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#111827] mb-4">
            Как начать
          </h2>
          <p className="text-lg text-[#6B7280] max-w-xl mx-auto">
            Весь путь от «хочу попробовать» до первого объекта — максимально просто.
          </p>
        </div>

        {/* Steps */}
        <div className="relative mb-14">
          {/* Connecting line */}
          <div className="hidden lg:block absolute top-10 left-[10%] right-[10%] h-0.5 bg-gradient-to-r from-transparent via-[#34C759]/30 to-transparent" />
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 relative">
            {steps.map((step, i) => (
              <div key={i} className="flex flex-col items-center text-center group">
                <div className="relative mb-5">
                  <div className="w-20 h-20 bg-white border-2 border-[#E5E7EB] group-hover:border-[#34C759]/60 rounded-2xl flex items-center justify-center shadow-sm group-hover:shadow-md transition-all duration-300 group-hover:-translate-y-1 text-[#34C759]">
                    {step.icon}
                  </div>
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-[#111827] rounded-full flex items-center justify-center">
                    <span className="text-white text-[10px] font-black">{i + 1}</span>
                  </div>
                </div>
                <h3 className="text-sm font-bold text-[#111827] mb-2">{step.title}</h3>
                <p className="text-xs text-[#6B7280] leading-relaxed max-w-[150px]">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Two Paths */}
        <div className="grid sm:grid-cols-2 gap-6 mb-10">
          <div className="bg-white border-2 border-[#3B82F6]/30 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-[#EFF6FF] rounded-xl flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M10 6H5C3.89543 6 3 6.89543 3 8V18C3 19.1046 3.89543 20 5 20H19C20.1046 20 21 19.1046 21 18V8C21 6.89543 20.1046 6 19 6H14M10 6V5C10 4.44772 10.4477 4 11 4H13C13.5523 4 14 4.44772 14 5V6M10 6H14" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <p className="text-[10px] font-bold text-[#3B82F6] uppercase tracking-wide">Путь 1</p>
                <p className="text-base font-bold text-[#111827]">Тестовый старт</p>
              </div>
            </div>
            <p className="text-sm text-[#6B7280] leading-relaxed">
              Верификация по паспорту → 1–2 тестовых заказа → переход на пакетную модель. Для тех, кто хочет сначала посмотреть систему изнутри.
            </p>
          </div>

          <div className="bg-white border-2 border-[#34C759]/40 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-[#E8F9EE] rounded-xl flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M13 10V3L4 14H11V21L20 10H13Z" stroke="#22A06B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <p className="text-[10px] font-bold text-[#22A06B] uppercase tracking-wide">Путь 2</p>
                <p className="text-base font-bold text-[#111827]">Сразу пакет</p>
              </div>
            </div>
            <p className="text-sm text-[#6B7280] leading-relaxed">
              Выбираете пакет заказов сразу и начинаете работу без тестового периода и верификации. Быстрый старт для уверенных мастеров.
            </p>
          </div>
        </div>

        {/* Main CTA */}
        <div className="text-center">
          <a
            href="#"
            className="bg-[#34C759] hover:bg-[#22A06B] text-white font-bold px-12 py-5 rounded-2xl text-lg transition-all duration-200 shadow-lg hover:shadow-xl hover:-translate-y-0.5 inline-flex items-center gap-3"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 18H12.01M8 21H16C17.1046 21 18 20.1046 18 19V5C18 3.89543 17.1046 3 16 3H8C6.89543 3 6 3.89543 6 5V19C6 20.1046 6.89543 21 8 21Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Начать с тестового заказа
          </a>
          <p className="text-sm text-[#94A3B8] mt-4">
            Регистрация в приложении → тестовый доступ или пакет заказов
          </p>
        </div>
      </div>
    </section>
  );
}
