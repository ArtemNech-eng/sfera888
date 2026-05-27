import React from 'react';
import { ArrowRight, CheckCircle2, Zap, TrendingUp } from 'lucide-react';
import NeonButton from './NeonButton';

interface HeroProps {
  botUrl: string;
}

function MasterIllustration() {
  return (
    <div className="relative w-full max-w-[480px] mx-auto select-none">
      <svg
        viewBox="0 0 480 520"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto"
        aria-hidden="true"
      >
        {/* Background circle */}
        <circle cx="240" cy="270" r="210" fill="#F0FDF4" />
        <circle cx="240" cy="270" r="170" fill="#DCFCE7" opacity="0.5" />

        {/* Floor */}
        <rect x="60" y="400" width="360" height="12" rx="6" fill="#D1FAE5" />

        {/* Wall panel being painted */}
        <rect x="80" y="140" width="280" height="260" rx="16" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="2" />
        {/* Painted portion (left ~60%) */}
        <rect x="80" y="140" width="168" height="260" rx="16" fill="#10B981" opacity="0.15" />
        {/* Paint edge — soft vertical line */}
        <rect x="244" y="148" width="4" height="244" rx="2" fill="#10B981" opacity="0.5" />

        {/* Wall tiles pattern (right unpainted area) */}
        {[0,1,2,3].map(row =>
          [0,1].map(col => (
            <rect
              key={`${row}-${col}`}
              x={258 + col * 46}
              y={158 + row * 56}
              width={38}
              height={46}
              rx="3"
              fill="none"
              stroke="#E2E8F0"
              strokeWidth="1.5"
            />
          ))
        )}

        {/* Master body — torso */}
        <rect x="185" y="270" width="64" height="90" rx="20" fill="#0F172A" />
        {/* Overalls pocket */}
        <rect x="200" y="290" width="20" height="14" rx="4" fill="#10B981" opacity="0.8" />

        {/* Master head */}
        <circle cx="217" cy="248" r="28" fill="#FBBF24" />
        {/* Hard hat */}
        <path d="M189 248 Q189 218 217 215 Q245 218 245 248 Z" fill="#10B981" />
        <rect x="183" y="246" width="68" height="8" rx="4" fill="#059669" />

        {/* Face */}
        <circle cx="209" cy="250" r="3" fill="#92400E" />
        <circle cx="225" cy="250" r="3" fill="#92400E" />
        <path d="M210 260 Q217 266 224 260" stroke="#92400E" strokeWidth="2" strokeLinecap="round" fill="none" />

        {/* Left arm — holding roller pole */}
        <rect x="158" y="280" width="30" height="12" rx="6" fill="#0F172A" />
        <rect x="152" y="289" width="12" height="62" rx="6" fill="#64748B" />
        {/* Roller head */}
        <rect x="133" y="268" width="34" height="26" rx="8" fill="#3B82F6" />
        <rect x="137" y="268" width="26" height="26" rx="6" fill="#60A5FA" />
        {/* Paint drip from roller */}
        <path d="M148 294 Q146 308 148 318" stroke="#10B981" strokeWidth="3" strokeLinecap="round" opacity="0.6" />

        {/* Right arm — resting on hip */}
        <path d="M249 285 Q270 300 268 320" stroke="#0F172A" strokeWidth="14" strokeLinecap="round" fill="none" />

        {/* Legs */}
        <rect x="188" y="352" width="26" height="52" rx="10" fill="#1E293B" />
        <rect x="220" y="352" width="26" height="52" rx="10" fill="#1E293B" />
        {/* Boots */}
        <rect x="183" y="396" width="36" height="16" rx="8" fill="#0F172A" />
        <rect x="215" y="396" width="36" height="16" rx="8" fill="#0F172A" />

        {/* Paint bucket on floor */}
        <rect x="290" y="375" width="36" height="28" rx="6" fill="#10B981" />
        <path d="M293 375 Q308 365 323 375" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        {/* Paint level inside bucket */}
        <rect x="292" y="385" width="32" height="16" rx="4" fill="#34D399" />

        {/* Decorative sparkles */}
        <circle cx="96" cy="170" r="5" fill="#10B981" opacity="0.4" />
        <circle cx="370" cy="160" r="7" fill="#3B82F6" opacity="0.3" />
        <circle cx="390" cy="380" r="5" fill="#F59E0B" opacity="0.4" />
        <circle cx="75" cy="360" r="4" fill="#10B981" opacity="0.3" />

        {/* Stars */}
        <path d="M350 120 L352 126 L358 126 L353 130 L355 136 L350 132 L345 136 L347 130 L342 126 L348 126 Z" fill="#F59E0B" opacity="0.7" />
        <path d="M108 420 L110 424 L114 424 L111 427 L112 431 L108 428 L104 431 L105 427 L102 424 L106 424 Z" fill="#10B981" opacity="0.5" />
      </svg>

      {/* Floating card: Объект взят */}
      <div
        className="absolute top-8 -left-4 sm:-left-8 bg-white rounded-2xl shadow-lg border border-[#E2E8F0] px-4 py-3 flex items-center gap-3"
        style={{ minWidth: 160 }}
      >
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

      {/* Floating card: Rating */}
      <div
        className="absolute top-1/3 -right-2 sm:-right-6 bg-white rounded-2xl shadow-lg border border-[#E2E8F0] px-4 py-3"
        style={{ minWidth: 120 }}
      >
        <p className="text-[#64748B] text-xs mb-1">Рейтинг</p>
        <div className="flex items-center gap-1">
          <span className="text-[#F59E0B] text-lg">★</span>
          <span className="text-[#0F172A] font-black text-xl">4.9</span>
        </div>
      </div>

      {/* Floating card: Earnings */}
      <div
        className="absolute bottom-16 -right-2 sm:-right-6 bg-white rounded-2xl shadow-lg border border-[#E2E8F0] px-4 py-3"
        style={{ minWidth: 140 }}
      >
        <p className="text-[#64748B] text-xs mb-1">Заработок</p>
        <p className="text-[#10B981] font-black text-lg">+35 000 ₽</p>
      </div>
    </div>
  );
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
          <div className="flex items-center justify-center lg:justify-end pt-8 lg:pt-0">
            <MasterIllustration />
          </div>

        </div>
      </div>

      <div className="neon-line absolute bottom-0 left-0 right-0" />
    </section>
  );
};

export default Hero;
