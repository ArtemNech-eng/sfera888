import React from 'react';
import { ArrowRight, CheckCircle2, Zap, TrendingUp } from 'lucide-react';
import NeonButton from './NeonButton';
import mastersHero from '../assets/masters-hero.png';

interface HeroProps {
  botUrl: string;
}


const Hero: React.FC<HeroProps> = ({ botUrl }) => {
  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative min-h-screen flex flex-col justify-center overflow-hidden bg-white">
      {/* Subtle background pattern */}
      <div
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(16,185,129,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.04) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />
      {/* Soft gradient blob */}
      <div
        className="absolute top-0 right-0 w-[600px] h-[500px] opacity-25 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at top right, rgba(16,185,129,0.18) 0%, transparent 65%)',
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">

          {/* ── Left column: content ── */}
          <div className="flex flex-col items-start">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#10B981]/25 bg-[#10B981]/6 text-[#10B981] text-sm font-medium mb-8">
              <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
              IT-платформа для профессиональных мастеров
            </div>

            {/* Main heading */}
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-[1.05] tracking-tight text-[#0F172A] mb-6">
              Заказы для мастеров.
              <br />
              <span className="text-[#10B981]">Без хаоса.</span>
              <br />
              Через систему.
            </h1>

            {/* Subtitle */}
            <p className="text-[#64748B] text-lg sm:text-xl max-w-lg mb-8 leading-relaxed">
              Обои, шпаклёвка, покраска, плитка, санузлы, отделка — берите реальные объекты
              через приложение и работайте по понятным правилам.
            </p>

            {/* 3 benefits */}
            <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-6 mb-10">
              {[
                { icon: <Zap size={15} />, text: 'Объекты каждый день' },
                { icon: <CheckCircle2 size={15} />, text: 'Смета и бронь в приложении' },
                { icon: <TrendingUp size={15} />, text: '100% стоимости — ваши' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-[#10B981] font-medium text-sm">
                  {item.icon}
                  <span>{item.text}</span>
                </div>
              ))}
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <NeonButton href={botUrl} variant="primary" size="lg">
                Начать получать заказы
                <ArrowRight size={20} />
              </NeonButton>
              <NeonButton
                variant="ghost"
                size="lg"
                onClick={() => scrollToSection('how-it-works')}
              >
                Узнать условия
              </NeonButton>
            </div>
          </div>

          {/* ── Right column: illustration ── */}
          <div className="flex items-end justify-center lg:justify-end pt-8 lg:pt-0">
            <div className="relative">
              <img
                src={mastersHero}
                alt="Мастера"
                className="w-full max-w-[600px] h-auto"
              />

              {/* Floating card: Новый заказ */}
              <div className="absolute top-12 -left-32 bg-white rounded-2xl shadow-lg border border-[#E2E8F0] px-4 py-3 w-[180px]">
                <p className="text-[#64748B] text-xs mb-1">Новый заказ</p>
                <p className="text-[#0F172A] font-bold text-sm leading-tight">Квартира 85 м²</p>
                <p className="text-[#64748B] text-xs mb-2">Бюджет 1 350 000 ₽</p>
                <button className="w-full bg-[#0F172A] text-white text-xs font-semibold py-2 rounded-lg">
                  Откликнуться
                </button>
              </div>

              {/* Floating card: Объект взят */}
              <div className="absolute top-1/2 -left-24 -translate-y-1/2 bg-white rounded-2xl shadow-lg border border-[#E2E8F0] px-4 py-3 flex items-center gap-3 min-w-[160px]">
                <div className="w-8 h-8 rounded-xl bg-[#10B981] flex items-center justify-center flex-shrink-0">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8l3.5 3.5L13 4.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <p className="text-[#0F172A] font-bold text-sm leading-tight">Объект взят</p>
                  <p className="text-[#64748B] text-xs">Обои, 3-комн. кв.</p>
                </div>
              </div>

              {/* Floating card: Заработок */}
              <div className="absolute top-8 -right-4 bg-white rounded-2xl shadow-lg border border-[#E2E8F0] px-4 py-3 min-w-[140px]">
                <p className="text-[#64748B] text-xs mb-1">Заработок</p>
                <p className="text-[#10B981] font-black text-lg">+84 000 ₽</p>
              </div>

              {/* Floating card: Rating */}
              <div className="absolute bottom-1/3 -right-4 bg-white rounded-2xl shadow-lg border border-[#E2E8F0] px-4 py-3 min-w-[120px]">
                <p className="text-[#64748B] text-xs mb-1">Рейтинг</p>
                <div className="flex items-center gap-1">
                  <span className="text-[#F59E0B] text-lg">★</span>
                  <span className="text-[#0F172A] font-black text-xl">4.9</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Trust cards */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-center gap-3 bg-white rounded-2xl border border-[#E2E8F0] shadow-sm px-5 py-4">
            <div className="w-10 h-10 rounded-xl bg-[#0F172A]/5 flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <p className="text-[#0F172A] font-bold text-sm">Честный мастер</p>
              <p className="text-[#64748B] text-xs">Работаем честно и по договорённости</p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-white rounded-2xl border border-[#E2E8F0] shadow-sm px-5 py-4">
            <div className="w-10 h-10 rounded-xl bg-[#0F172A]/5 flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div>
              <p className="text-[#0F172A] font-bold text-sm">Дружелюбные</p>
              <p className="text-[#64748B] text-xs">Поддержка и уважение к каждому мастеру</p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-white rounded-2xl border border-[#E2E8F0] shadow-sm px-5 py-4">
            <div className="w-10 h-10 rounded-xl bg-[#0F172A]/5 flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
              </svg>
            </div>
            <div>
              <p className="text-[#0F172A] font-bold text-sm">Честные</p>
              <p className="text-[#64748B] text-xs">Прозрачные условия и честные выплаты</p>
            </div>
          </div>
        </div>
      </div>

      <div className="neon-line absolute bottom-0 left-0 right-0" />
    </section>
  );
};

export default Hero;
