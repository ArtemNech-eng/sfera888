const trustCards = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#34C759" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    title: 'Проверенные частные мастера',
    text: 'Все мастера проходят проверку документов и работают внутри системы.',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#34C759" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
    ),
    title: 'Рейтинг от 4.5',
    text: 'Мы допускаем в работу только специалистов с хорошей репутацией и понятной историей заказов.',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#34C759" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/>
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    ),
    title: 'Без посредников',
    text: 'Вы не переплачиваете менеджерам и фирмам. Мы работаем с частными мастерами напрямую.',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#34C759" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
    title: 'Смета и гарантия',
    text: 'До начала работ вы понимаете стоимость, а после получаете гарантию 2 года.',
  },
];

export default function TrustBlock() {
  return (
    <section className="bg-[#F8FAFC] py-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#111827] mb-3">
            Почему нам доверяют
          </h2>
          <p className="text-[#6B7280] text-base max-w-md mx-auto">
            Прозрачный сервис, проверенные специалисты и понятные условия
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          {trustCards.map((card) => (
            <div
              key={card.title}
              className="bg-white rounded-2xl p-6 border border-[#E5E7EB] hover:shadow-md transition-shadow"
            >
              <div className="w-11 h-11 rounded-xl bg-[#E8F9EE] flex items-center justify-center mb-4">
                {card.icon}
              </div>
              <h3 className="text-[#111827] font-semibold text-base mb-2">{card.title}</h3>
              <p className="text-[#6B7280] text-sm leading-relaxed">{card.text}</p>
            </div>
          ))}
        </div>

        {/* Priority note */}
        <div className="bg-[#E8F9EE] border border-[#34C759]/30 rounded-2xl p-5 flex items-start gap-4 max-w-2xl mx-auto">
          <div className="w-9 h-9 rounded-full bg-[#34C759]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34C759" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <p className="text-[#1a8a3c] text-sm leading-relaxed">
            <span className="font-semibold">Приоритетная обработка.</span>{' '}
            Если вы пришли по персональной ссылке мастера или партнёра, заявка обрабатывается в приоритетном порядке.
          </p>
        </div>

        {/* Trust badges */}
        <div className="flex flex-wrap justify-center gap-3 mt-8">
          {[
            '✅ Документы проверены',
            '⭐ Рейтинг от 4.5',
            '💰 Без посредников',
            '🛡️ Гарантия 2 года',
          ].map((badge) => (
            <span
              key={badge}
              className="bg-white border border-[#E5E7EB] text-[#374151] text-sm font-medium px-4 py-2 rounded-full"
            >
              {badge}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
