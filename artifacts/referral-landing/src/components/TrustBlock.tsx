import { Users, Briefcase, MapPin, Award, FileCheck, Star, BadgeCheck, ShieldCheck } from 'lucide-react';

const stats = [
  { value: '340+', label: 'мастеров подключено', icon: Users },
  { value: '2 100+', label: 'заказов выполнено', icon: Briefcase },
  { value: '18', label: 'городов в работе', icon: MapPin },
  { value: '4.8', label: 'средний рейтинг', icon: Award },
];

const trustCards = [
  {
    icon: Users,
    title: 'Проверенные частные мастера',
    text: 'Все мастера проходят проверку документов и работают внутри системы.',
  },
  {
    icon: Star,
    title: 'Рейтинг от 4.5',
    text: 'Мы допускаем в работу только специалистов с хорошей репутацией и понятной историей заказов.',
  },
  {
    icon: BadgeCheck,
    title: 'Без посредников',
    text: 'Вы не переплачиваете менеджерам и фирмам. Мы работаем с частными мастерами напрямую.',
  },
  {
    icon: ShieldCheck,
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

        {/* Stats counters */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="bg-white rounded-2xl p-5 border border-[#E5E7EB] text-center">
                <div className="w-10 h-10 rounded-xl bg-[#E8F9EE] flex items-center justify-center mx-auto mb-3">
                  <Icon size={20} className="text-[#34C759]" />
                </div>
                <div className="text-2xl font-extrabold text-[#111827] mb-1">{stat.value}</div>
                <div className="text-sm text-[#6B7280]">{stat.label}</div>
              </div>
            );
          })}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          {trustCards.map((card) => {
            const IconComponent = card.icon;
            return (
              <div
                key={card.title}
                className="bg-white rounded-2xl p-6 border border-[#E5E7EB] hover:shadow-md transition-shadow"
              >
                <div className="w-11 h-11 rounded-xl bg-[#E8F9EE] flex items-center justify-center mb-4">
                  <IconComponent size={22} className="text-[#34C759]" />
                </div>
                <h3 className="text-[#111827] font-semibold text-base mb-2">{card.title}</h3>
                <p className="text-[#6B7280] text-sm leading-relaxed">{card.text}</p>
              </div>
            );
          })}
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
            { icon: FileCheck, text: 'Документы проверены' },
            { icon: Star, text: 'Рейтинг от 4.5' },
            { icon: BadgeCheck, text: 'Без посредников' },
            { icon: ShieldCheck, text: 'Гарантия 2 года' },
          ].map((badge) => {
            const BIcon = badge.icon;
            return (
              <span
                key={badge.text}
                className="bg-white border border-[#E5E7EB] text-[#374151] text-sm font-medium px-4 py-2 rounded-full flex items-center gap-2"
              >
                <BIcon size={14} className="text-[#34C759]" />
                {badge.text}
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}
