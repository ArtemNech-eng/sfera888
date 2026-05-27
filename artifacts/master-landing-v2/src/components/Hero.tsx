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
        {/* ── Background ── */}
        <circle cx="248" cy="278" r="205" fill="#F0FDF4" />
        <circle cx="248" cy="278" r="158" fill="#D1FAE5" opacity="0.45" />

        {/* Grid pattern inside circle */}
        {[0,1,2,3,4,5].map(i => (
          <line key={`h${i}`} x1="80" y1={160 + i * 50} x2="420" y2={160 + i * 50}
            stroke="#10B981" strokeWidth="0.6" opacity="0.12" />
        ))}
        {[0,1,2,3,4,5,6].map(i => (
          <line key={`v${i}`} x1={105 + i * 52} y1="130" x2={105 + i * 52} y2="430"
            stroke="#10B981" strokeWidth="0.6" opacity="0.12" />
        ))}

        {/* Accent dots */}
        <circle cx="104" cy="162" r="5" fill="#10B981" opacity="0.3" />
        <circle cx="378" cy="152" r="7" fill="#3B82F6" opacity="0.22" />
        <circle cx="385" cy="392" r="5" fill="#F97316" opacity="0.35" />
        <circle cx="82" cy="374" r="4" fill="#10B981" opacity="0.25" />
        {/* Star */}
        <path d="M358 124 l2.5 7h7.5l-6 4.5 2.5 7-6-4.5-6 4.5 2.5-7-6-4.5h7.5z"
          fill="#F97316" opacity="0.6" />

        {/* ── Floor ── */}
        <rect x="80" y="412" width="320" height="8" rx="4" fill="#A7F3D0" />
        <ellipse cx="240" cy="416" rx="120" ry="5" fill="#10B981" opacity="0.08" />

        {/* ── WALL PANEL ── */}
        <rect x="108" y="148" width="240" height="268" rx="20" fill="white"
          stroke="#E2E8F0" strokeWidth="1.5" />
        {/* Green-painted left portion */}
        <clipPath id="wc"><rect x="108" y="148" width="240" height="268" rx="20" /></clipPath>
        <rect x="108" y="148" width="136" height="268" fill="#10B981" opacity="0.1"
          clipPath="url(#wc)" />
        {/* Paint edge */}
        <rect x="241" y="156" width="3" height="252" rx="1.5" fill="#10B981" opacity="0.4" />
        {/* Unpainted grid marks */}
        {[0,1,2,3].map(i => (
          <line key={i} x1="248" y1={168 + i * 58} x2="336" y2={168 + i * 58}
            stroke="#F1F5F9" strokeWidth="1.5" />
        ))}
        {[0,1].map(i => (
          <line key={i} x1={268 + i * 44} y1="156" x2={268 + i * 44} y2="412"
            stroke="#F1F5F9" strokeWidth="1.5" />
        ))}

        {/* ── FACELESS CHARACTER (geometric / Figma style) ── */}

        {/* Shadow under character */}
        <ellipse cx="228" cy="416" rx="56" ry="7" fill="#0F172A" opacity="0.06" />

        {/* Legs */}
        <rect x="200" y="352" width="24" height="60" rx="10" fill="#1E40AF" />
        <rect x="232" y="352" width="24" height="60" rx="10" fill="#1E40AF" />
        {/* Boot left */}
        <rect x="193" y="402" width="38" height="14" rx="7" fill="#1E3A8A" />
        {/* Boot right */}
        <rect x="225" y="402" width="38" height="14" rx="7" fill="#1E3A8A" />

        {/* Torso */}
        <rect x="186" y="260" width="84" height="100" rx="26" fill="#1E40AF" />
        {/* Torso highlight strip */}
        <rect x="186" y="260" width="84" height="32" rx="26" fill="#2563EB" />
        <rect x="186" y="278" width="84" height="14" fill="#2563EB" />

        {/* BADGE on chest */}
        <rect x="198" y="300" width="60" height="30" rx="7" fill="white" opacity="0.95" />
        <rect x="198" y="300" width="60" height="30" rx="7" stroke="#10B981" strokeWidth="1.5" fill="none" />
        {/* Badge ⚡ */}
        <path d="M205 311 L208 305 L208 311 L212 311 L208 318 L208 312 L205 312 Z"
          fill="#10B981" />
        {/* Badge text */}
        <text x="216" y="312" fontSize="6" fontWeight="800" fill="#0F172A"
          fontFamily="system-ui, sans-serif">Честный</text>
        <text x="216" y="321" fontSize="6" fontWeight="800" fill="#10B981"
          fontFamily="system-ui, sans-serif">Мастер</text>

        {/* Left arm */}
        <rect x="155" y="270" width="32" height="16" rx="8" fill="#1E40AF" />
        <rect x="140" y="276" width="20" height="56" rx="8" fill="#2563EB" />
        {/* Left hand / cuff */}
        <rect x="138" y="324" width="24" height="12" rx="6" fill="#DBEAFE" />

        {/* Right arm */}
        <rect x="269" y="270" width="32" height="16" rx="8" fill="#1E40AF" />
        <rect x="296" y="276" width="20" height="56" rx="8" fill="#2563EB" />
        {/* Right hand */}
        <rect x="294" y="324" width="24" height="12" rx="6" fill="#DBEAFE" />

        {/* ── HEAD — clean oval, NO face ── */}
        <ellipse cx="228" cy="236" rx="38" ry="40" fill="#FED7AA" />
        {/* Subtle neck */}
        <rect x="216" y="260" width="24" height="12" rx="6" fill="#FDE68A" />

        {/* Hard hat — clean geometric */}
        {/* Dome */}
        <path d="M190 240 Q190 196 228 192 Q266 196 266 240 Z" fill="#F97316" />
        {/* Brim */}
        <rect x="182" y="237" width="92" height="10" rx="5" fill="#EA580C" />
        {/* Hat vent line */}
        <path d="M214 204 Q228 200 242 204" stroke="#FED7AA" strokeWidth="2"
          strokeLinecap="round" opacity="0.7" />
        {/* Hat stripe */}
        <path d="M200 230 Q228 226 256 230" stroke="#C2410C" strokeWidth="1.5"
          strokeLinecap="round" opacity="0.4" />

        {/* ── PAINT ROLLER — left hand holds it ── */}
        {/* Pole */}
        <rect x="143" y="328" width="8" height="72" rx="4" fill="#94A3B8" />
        {/* Roller connector */}
        <rect x="122" y="308" width="26" height="28" rx="5" fill="#64748B" />
        {/* Roller cylinder */}
        <rect x="100" y="295" width="26" height="52" rx="13" fill="#10B981" />
        <rect x="103" y="299" width="20" height="44" rx="10" fill="#34D399" />
        {/* Roller cap top/bottom */}
        <rect x="100" y="293" width="26" height="6" rx="3" fill="#059669" />
        <rect x="100" y="347" width="26" height="6" rx="3" fill="#059669" />
        {/* Paint swipe on wall */}
        <path d="M113 295 Q111 270 115 248" stroke="#10B981" strokeWidth="3.5"
          strokeLinecap="round" opacity="0.35" />

        {/* ── PAINT BUCKET — floor right ── */}
        <rect x="300" y="375" width="44" height="38" rx="9" fill="#10B981" />
        <rect x="303" y="385" width="38" height="26" rx="7" fill="#34D399" />
        {/* Handle */}
        <path d="M304 375 Q322 361 340 375" stroke="#059669" strokeWidth="3"
          strokeLinecap="round" fill="none" />
        {/* Bucket label */}
        <rect x="309" y="388" width="26" height="14" rx="3" fill="white" opacity="0.35" />
        {/* Floor shadow */}
        <ellipse cx="322" cy="414" rx="26" ry="4" fill="#10B981" opacity="0.12" />
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
