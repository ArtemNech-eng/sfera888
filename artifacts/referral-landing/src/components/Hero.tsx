import { Users, FileCheck, Zap, Star, ShieldCheck, TrendingUp } from 'lucide-react';

interface HeroProps {
  refSlug: string | null;
}

export default function Hero({ refSlug }: HeroProps) {
  const scrollToForm = () => {
    document.getElementById('form')?.scrollIntoView({ behavior: 'smooth' });
  };
  const scrollToReviews = () => {
    document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="bg-[#F8FAFC] pt-10 pb-16 overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col lg:flex-row items-center gap-12">

          {/* Left column */}
          <div className="flex-1 max-w-xl">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-[#E8F9EE] text-[#1a8a3c] text-sm font-medium px-3 py-1.5 rounded-full mb-6">
              <span className="w-2 h-2 rounded-full bg-[#34C759] animate-pulse"></span>
              Городской сервис проверенных частных мастеров
            </div>

            {refSlug && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium px-3 py-2 rounded-lg mb-5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                Вам нас порекомендовал мастер
              </div>
            )}

            <h1 className="text-4xl sm:text-5xl font-extrabold text-[#111827] leading-tight mb-4">
              Подберём проверенного частного мастера за{' '}
              <span className="text-[#34C759]">15–30 минут</span>
            </h1>

            <p className="text-[#6B7280] text-lg leading-relaxed mb-6">
              Честный Мастер — городской сервис, который объединяет проверенных частных мастеров.
              Без посредников, с понятной сметой и гарантией 2 года.
            </p>

            {/* Discount badge */}
            <div className="inline-flex items-center gap-2 bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#92400e] text-sm font-semibold px-4 py-2 rounded-lg mb-8">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
              Скидка до 15% по рекомендации мастера
            </div>

            {/* Mini advantages */}
            <ul className="space-y-3 mb-8">
              {[
                { icon: Users, text: 'Частные мастера без посредников' },
                { icon: FileCheck, text: 'Документы проверены, рейтинг от 4.5' },
                { icon: Zap, text: 'Подбор специалиста за 15–30 минут' },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.text} className="flex items-center gap-3 text-[#374151]">
                    <span className="w-7 h-7 rounded-full bg-[#E8F9EE] flex items-center justify-center text-sm flex-shrink-0">
                      <Icon size={14} className="text-[#34C759]" />
                    </span>
                    <span className="text-sm font-medium">{item.text}</span>
                  </li>
                );
              })}
            </ul>

            {/* Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={scrollToForm}
                className="bg-[#34C759] text-white font-semibold px-6 py-3.5 rounded-xl hover:bg-[#2db34e] transition-colors text-base shadow-sm shadow-[#34C759]/20"
              >
                Оставить заявку
              </button>
              <button
                onClick={scrollToReviews}
                className="bg-white text-[#374151] font-semibold px-6 py-3.5 rounded-xl border border-[#E5E7EB] hover:border-[#D1D5DB] hover:bg-[#F9FAFB] transition-colors text-base"
              >
                Смотреть отзывы
              </button>
            </div>

            {/* Social proof */}
            <div className="flex items-center gap-2 text-[#94A3B8] text-sm mt-5">
              <TrendingUp size={14} className="text-[#34C759]" />
              <span>
                Более <span className="font-semibold text-[#6B7280]">340 мастеров</span> и{' '}
                <span className="font-semibold text-[#6B7280]">2 100+ заказов</span>
              </span>
            </div>
          </div>

          {/* Right column — photo + floating cards */}
          <div className="flex-1 w-full max-w-md lg:max-w-none relative">
            <div className="relative">
              {/* Main photo */}
              <div className="rounded-2xl overflow-hidden shadow-xl">
                <img
                  src="images/master-hero.jpg"
                  alt="Проверенный частный мастер"
                  className="w-full h-[420px] object-cover"
                />
              </div>

              {/* Rating card */}
              <div className="absolute -left-4 top-8 bg-white rounded-xl shadow-lg px-4 py-3 flex items-center gap-3 border border-[#E5E7EB]">
                <div className="w-10 h-10 rounded-full bg-[#E8F9EE] flex items-center justify-center">
                  <Star size={18} className="text-[#34C759]" fill="#34C759" />
                </div>
                <div>
                  <p className="text-xs text-[#94A3B8] font-medium">Рейтинг мастеров</p>
                  <p className="text-[#111827] font-bold text-lg leading-none">4.8 / 5</p>
                </div>
              </div>

              {/* Verified card */}
              <div className="absolute -right-4 top-16 bg-white rounded-xl shadow-lg px-4 py-3 flex items-center gap-2 border border-[#E5E7EB]">
                <div className="w-8 h-8 rounded-full bg-[#E8F9EE] flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34C759" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-[#94A3B8] font-medium">Документы</p>
                  <p className="text-[#111827] font-bold text-sm">Проверены</p>
                </div>
              </div>

              {/* Guarantee card */}
              <div className="absolute -left-4 bottom-10 bg-white rounded-xl shadow-lg px-4 py-3 flex items-center gap-3 border border-[#E5E7EB]">
                <div className="w-10 h-10 rounded-full bg-[#E8F9EE] flex items-center justify-center">
                  <ShieldCheck size={18} className="text-[#34C759]" />
                </div>
                <div>
                  <p className="text-xs text-[#94A3B8] font-medium">Гарантия работ</p>
                  <p className="text-[#111827] font-bold text-base">2 года</p>
                </div>
              </div>

              {/* Estimate card */}
              <div className="absolute right-4 bottom-8 bg-white rounded-xl shadow-lg px-4 py-3 border border-[#E5E7EB] min-w-[148px]">
                <p className="text-xs text-[#94A3B8] font-medium mb-1.5">Смета</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-[#374151]">
                    <span>Обои (2 комн.)</span>
                    <span className="font-semibold">14 000 ₽</span>
                  </div>
                  <div className="flex justify-between text-xs text-[#374151]">
                    <span>Шпаклёвка</span>
                    <span className="font-semibold">8 000 ₽</span>
                  </div>
                  <div className="border-t border-[#E5E7EB] pt-1 flex justify-between text-xs">
                    <span className="text-[#6B7280]">Итого</span>
                    <span className="font-bold text-[#34C759]">22 000 ₽</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
