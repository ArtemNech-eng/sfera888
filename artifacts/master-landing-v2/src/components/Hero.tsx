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
        {/* ─── BACKGROUND BLOB ─── */}
        <ellipse cx="250" cy="290" rx="196" ry="196" fill="#F0FDF4" />
        <ellipse cx="260" cy="250" rx="148" ry="148" fill="#D1FAE5" opacity="0.55" />
        <ellipse cx="270" cy="220" rx="90" ry="90" fill="#A7F3D0" opacity="0.25" />

        {/* Accent sparks */}
        <circle cx="96" cy="178" r="6" fill="#10B981" opacity="0.3" />
        <circle cx="382" cy="160" r="9" fill="#F97316" opacity="0.22" />
        <circle cx="72" cy="360" r="4" fill="#10B981" opacity="0.22" />
        <path d="M366 130 l3 8h9l-7 5 3 8-7-5-7 5 3-8-7-5h9z" fill="#F97316" opacity="0.55" />
        <path d="M100 420 l2 5h6l-4.5 3.5 2 5-4.5-3.5-4.5 3.5 2-5-4.5-3.5h6z" fill="#10B981" opacity="0.4" />

        {/* ─── FLOOR LINE ─── */}
        <rect x="90" y="446" width="300" height="7" rx="3.5" fill="#6EE7B7" opacity="0.6" />
        <ellipse cx="232" cy="449" rx="100" ry="5" fill="#0F172A" opacity="0.05" />

        {/* ─── FIGURE SHADOW ─── */}
        <ellipse cx="232" cy="447" rx="72" ry="9" fill="#1E293B" opacity="0.08" />

        {/* ─── LEGS ─── */}
        <rect x="191" y="356" width="44" height="92" rx="18" fill="#1E3A8A" />
        <rect x="245" y="356" width="44" height="92" rx="18" fill="#1E3A8A" />

        {/* ─── BOOTS ─── */}
        <rect x="178" y="434" width="64" height="20" rx="10" fill="#0F172A" />
        <rect x="238" y="434" width="64" height="20" rx="10" fill="#0F172A" />

        {/* ─── LEFT ARM (hanging naturally at side) ─── */}
        <path d="M192 268 Q168 272 156 310 Q152 332 162 338 Q174 344 180 322 Q188 296 192 284 Z"
          fill="#1E40AF" />

        {/* ─── RIGHT ARM ─── */}
        <path d="M288 268 Q312 272 324 310 Q328 332 318 338 Q306 344 300 322 Q292 296 288 284 Z"
          fill="#1E40AF" />

        {/* ─── TORSO ─── */}
        <rect x="188" y="252" width="104" height="112" rx="30" fill="#1E40AF" />
        {/* Shoulder cap — slightly lighter */}
        <rect x="188" y="252" width="104" height="34" rx="30" fill="#2563EB" />
        <rect x="188" y="272" width="104" height="14" fill="#2563EB" />

        {/* ─── CHEST BADGE ─── */}
        <rect x="202" y="295" width="76" height="42" rx="10" fill="white" opacity="0.97" />
        <rect x="202" y="295" width="76" height="42" rx="10" stroke="#10B981" strokeWidth="1.5" fill="none" />
        {/* ⚡ bolt */}
        <path d="M211 313 L215 305 L215 313 L220 313 L215 323 L215 314 L211 314 Z" fill="#10B981" />
        <text x="224" y="312" fontSize="7" fontWeight="800" fill="#0F172A"
          fontFamily="system-ui,sans-serif">Честный</text>
        <text x="224" y="322" fontSize="7" fontWeight="800" fill="#10B981"
          fontFamily="system-ui,sans-serif">Мастер</text>

        {/* ─── NECK ─── */}
        <rect x="220" y="232" width="40" height="24" rx="10" fill="#1E293B" />

        {/* ─── HEAD — dark silhouette oval ─── */}
        <ellipse cx="240" cy="200" rx="48" ry="48" fill="#1E293B" />

        {/* ─── HARD HAT ─── */}
        {/* Dome */}
        <path d="M192 204 Q192 152 240 148 Q288 152 288 204 Z" fill="#F97316" />
        {/* Brim */}
        <rect x="182" y="201" width="116" height="13" rx="6.5" fill="#EA580C" />
        {/* Highlight stripe */}
        <path d="M220 166 Q240 160 260 166" stroke="#FDBA74" strokeWidth="3"
          strokeLinecap="round" opacity="0.65" />

        {/* ─── TOOL ICON BADGES (floating around figure) ─── */}

        {/* Paint roller — left, mid-height */}
        <rect x="82" y="300" width="52" height="52" rx="16" fill="white"
          stroke="#E2E8F0" strokeWidth="1.5" />
        {/* roller handle */}
        <rect x="104" y="310" width="8" height="32" rx="4" fill="#94A3B8" />
        {/* roller head */}
        <rect x="93" y="308" width="22" height="12" rx="6" fill="#10B981" />
        <rect x="95" y="310" width="18" height="8" rx="4" fill="#34D399" />

        {/* Wrench / tool — right, mid-height */}
        <rect x="346" y="300" width="52" height="52" rx="16" fill="white"
          stroke="#E2E8F0" strokeWidth="1.5" />
        {/* wrench shape */}
        <path d="M362 319 Q364 309 374 308 Q382 308 382 315 Q382 321 376 322 L372 326 L370 338 Q368 342 364 342 Q360 342 358 338 Q356 334 360 330 Z"
          fill="#F97316" opacity="0.8" />
        <circle cx="374" cy="315" r="5" fill="none" stroke="#EA580C" strokeWidth="2" />

        {/* Tape measure — bottom right */}
        <rect x="330" y="376" width="52" height="52" rx="16" fill="white"
          stroke="#E2E8F0" strokeWidth="1.5" />
        <rect x="342" y="388" width="28" height="28" rx="8" fill="#3B82F6" opacity="0.15"
          stroke="#3B82F6" strokeWidth="1.5" />
        <rect x="348" y="394" width="16" height="2.5" rx="1.25" fill="#3B82F6" />
        <rect x="348" y="400" width="12" height="2.5" rx="1.25" fill="#3B82F6" opacity="0.7" />
        <rect x="348" y="406" width="16" height="2.5" rx="1.25" fill="#3B82F6" />
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
