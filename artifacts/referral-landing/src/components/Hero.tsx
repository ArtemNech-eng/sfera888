import { Users, FileCheck, Zap, Star, ShieldCheck, TrendingUp, Heart, CheckCircle2 } from 'lucide-react';

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
                <Heart size={16} />
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
              <Heart size={16} className="fill-[#F59E0B] text-[#F59E0B]" />
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
          <div className="flex-1 w-full max-w-md lg:max-w-none">
            {/* Photo */}
            <div className="rounded-2xl overflow-hidden shadow-xl">
              <img
                src="images/master-hero.jpg"
                alt="Проверенный частный мастер"
                className="w-full h-[280px] sm:h-[360px] lg:h-[420px] object-cover object-top"
              />
            </div>

            {/* Mobile cards grid (shown only below lg) */}
            <div className="lg:hidden grid grid-cols-2 gap-3 mt-4">
              <div className="bg-white rounded-xl shadow-md px-3 py-3 flex items-center gap-2 border border-[#E5E7EB]">
                <div className="w-8 h-8 rounded-full bg-[#E8F9EE] flex items-center justify-center flex-shrink-0">
                  <Star size={16} className="text-[#34C759]" fill="#34C759" />
                </div>
                <div>
                  <p className="text-[10px] text-[#94A3B8] font-medium leading-none">Рейтинг</p>
                  <p className="text-[#111827] font-bold text-sm leading-tight">4.8 / 5</p>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-md px-3 py-3 flex items-center gap-2 border border-[#E5E7EB]">
                <div className="w-8 h-8 rounded-full bg-[#E8F9EE] flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 size={16} className="text-[#34C759]" />
                </div>
                <div>
                  <p className="text-[10px] text-[#94A3B8] font-medium leading-none">Документы</p>
                  <p className="text-[#111827] font-bold text-sm leading-tight">Проверены</p>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-md px-3 py-3 flex items-center gap-2 border border-[#E5E7EB]">
                <div className="w-8 h-8 rounded-full bg-[#E8F9EE] flex items-center justify-center flex-shrink-0">
                  <ShieldCheck size={16} className="text-[#34C759]" />
                </div>
                <div>
                  <p className="text-[10px] text-[#94A3B8] font-medium leading-none">Гарантия</p>
                  <p className="text-[#111827] font-bold text-sm leading-tight">2 года</p>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-md px-3 py-3 border border-[#E5E7EB]">
                <p className="text-[10px] text-[#94A3B8] font-medium mb-1">Смета</p>
                <div className="flex justify-between text-[10px] text-[#374151]">
                  <span>Обои</span>
                  <span className="font-semibold">14 000 ₽</span>
                </div>
                <div className="border-t border-[#E5E7EB] pt-0.5 mt-0.5 flex justify-between text-[10px]">
                  <span className="text-[#6B7280]">Итого</span>
                  <span className="font-bold text-[#34C759]">22 000 ₽</span>
                </div>
              </div>
            </div>

            {/* Desktop floating cards (shown only on lg+) */}
            <div className="hidden lg:block relative">
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
                  <CheckCircle2 size={16} className="text-[#34C759]" />
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
