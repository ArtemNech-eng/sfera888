import React from 'react';
import { ArrowRight, CheckCircle2, Zap, TrendingUp } from 'lucide-react';
import NeonButton from './NeonButton';

interface HeroProps {
  botUrl: string;
}

const Hero: React.FC<HeroProps> = ({ botUrl }) => {
  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative min-h-screen flex flex-col justify-center overflow-hidden bg-[#0B0F14]">
      {/* Grid background */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'linear-gradient(rgba(52,245,163,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(52,245,163,0.04) 1px, transparent 1px)',
          backgroundSize: '50px 50px',
        }}
      />

      {/* Radial glow top-left */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] opacity-20 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(52,245,163,0.4) 0%, transparent 70%)',
        }}
      />

      {/* Radial glow bottom-right */}
      <div
        className="absolute bottom-0 right-0 w-[400px] h-[400px] opacity-10 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(56,189,248,0.5) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        {/* Badge */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#34F5A3]/30 bg-[#34F5A3]/5 text-[#34F5A3] text-sm font-medium">
            <span className="w-2 h-2 rounded-full bg-[#34F5A3] animate-pulse" />
            IT-платформа для профессиональных мастеров
          </div>
        </div>

        {/* Main heading */}
        <div className="text-center mb-6">
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black leading-[1.05] tracking-tight text-[#F8FAFC] mb-4">
            Заказы для мастеров.
            <br />
            <span className="text-[#34F5A3]">Без хаоса.</span>
            <br />
            Через систему.
          </h1>
        </div>

        {/* Subtitle */}
        <p className="text-center text-[#94A3B8] text-lg sm:text-xl max-w-3xl mx-auto mb-10 leading-relaxed">
          Обои, шпаклёвка, покраска, плитка, санузлы, отделка — берите реальные объекты
          через приложение и работайте по понятным правилам.
        </p>

        {/* 3 benefits */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 mb-12">
          {[
            { icon: <Zap size={16} />, text: 'Объекты каждый день' },
            { icon: <CheckCircle2 size={16} />, text: 'Смета и бронь через приложение' },
            { icon: <TrendingUp size={16} />, text: '100% стоимости объекта — ваши' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-[#34F5A3] font-medium text-sm sm:text-base">
              {item.icon}
              <span>{item.text}</span>
            </div>
          ))}
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
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

        {/* Stats banner */}
        <div className="flex flex-col sm:flex-row items-stretch justify-center gap-4 max-w-2xl mx-auto">
          <div className="flex-1 glass rounded-2xl px-6 py-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-[#34F5A3]/10 flex items-center justify-center flex-shrink-0">
              <div className="w-3 h-3 rounded-full bg-[#34F5A3] animate-pulse" />
            </div>
            <div>
              <p className="text-[#F8FAFC] font-semibold text-sm">Новые объекты</p>
              <p className="text-[#94A3B8] text-xs">каждый день в системе</p>
            </div>
          </div>
          <div className="flex-1 glass rounded-2xl px-6 py-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-[#38BDF8]/10 flex items-center justify-center flex-shrink-0">
              <TrendingUp size={18} className="text-[#38BDF8]" />
            </div>
            <div>
              <p className="text-[#F8FAFC] font-semibold text-sm">Стабильный поток</p>
              <p className="text-[#94A3B8] text-xs">заявок без простоев</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom neon line */}
      <div className="neon-line absolute bottom-0 left-0 right-0" />
    </section>
  );
};

export default Hero;
