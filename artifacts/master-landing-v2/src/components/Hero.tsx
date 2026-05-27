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
        {/* Background circles */}
        <circle cx="240" cy="275" r="210" fill="#F0FDF4" />
        <circle cx="240" cy="275" r="165" fill="#DCFCE7" opacity="0.55" />

        {/* Decorative dots */}
        <circle cx="100" cy="155" r="6" fill="#10B981" opacity="0.35" />
        <circle cx="375" cy="150" r="8" fill="#3B82F6" opacity="0.25" />
        <circle cx="392" cy="390" r="5" fill="#F97316" opacity="0.4" />
        <circle cx="78" cy="370" r="4" fill="#10B981" opacity="0.3" />
        {/* Star accent */}
        <path d="M355 118 L357 125 L364 125 L358 129 L361 136 L355 132 L349 136 L352 129 L346 125 L353 125 Z" fill="#F97316" opacity="0.65" />
        <path d="M110 432 L112 437 L117 437 L113 440 L115 445 L110 442 L105 445 L107 440 L103 437 L108 437 Z" fill="#10B981" opacity="0.45" />

        {/* Floor */}
        <rect x="70" y="408" width="340" height="10" rx="5" fill="#A7F3D0" />

        {/* Wall — clean panel */}
        <rect x="90" y="135" width="280" height="275" rx="18" fill="white" stroke="#E2E8F0" strokeWidth="2" />
        {/* Painted section ~55% */}
        <clipPath id="wallClip">
          <rect x="90" y="135" width="280" height="275" rx="18" />
        </clipPath>
        <rect x="90" y="135" width="160" height="275" fill="#10B981" opacity="0.12" clipPath="url(#wallClip)" />
        {/* Paint boundary line */}
        <rect x="247" y="143" width="3" height="258" rx="2" fill="#10B981" opacity="0.45" />
        {/* Horizontal wall lines (unpainted side) */}
        {[0,1,2,3,4].map(i => (
          <line key={i} x1="255" y1={158 + i * 48} x2="355" y2={158 + i * 48} stroke="#F1F5F9" strokeWidth="1.5" />
        ))}
        {/* Vertical wall lines (unpainted side) */}
        {[0,1,2].map(i => (
          <line key={i} x1={270 + i * 40} y1="143" x2={270 + i * 40} y2="408" stroke="#F1F5F9" strokeWidth="1.5" />
        ))}

        {/* === CHARACTER === */}

        {/* Legs — navy work trousers */}
        <rect x="196" y="348" width="28" height="62" rx="12" fill="#1E3A5F" />
        <rect x="230" y="348" width="28" height="62" rx="12" fill="#1E3A5F" />
        {/* Boots */}
        <rect x="189" y="400" width="42" height="14" rx="7" fill="#0F172A" />
        <rect x="222" y="400" width="42" height="14" rx="7" fill="#0F172A" />

        {/* Torso — light blue work jacket */}
        <rect x="183" y="262" width="88" height="94" rx="22" fill="#DBEAFE" />
        {/* Jacket collar / zip detail */}
        <rect x="217" y="262" width="20" height="30" rx="6" fill="#BFDBFE" />
        {/* Jacket sleeve left */}
        <path d="M183 278 Q155 285 148 310 Q148 322 158 324 Q168 326 172 314 Q178 296 183 290 Z" fill="#DBEAFE" />
        {/* Jacket sleeve right */}
        <path d="M271 278 Q299 285 306 310 Q306 322 296 324 Q286 326 282 314 Q276 296 271 290 Z" fill="#DBEAFE" />
        {/* Sleeve cuffs */}
        <rect x="148" y="316" width="26" height="10" rx="5" fill="#93C5FD" />
        <rect x="280" y="316" width="26" height="10" rx="5" fill="#93C5FD" />
        {/* Jacket outline / collar seam */}
        <path d="M207 262 L207 280 Q227 292 247 280 L247 262" stroke="#93C5FD" strokeWidth="1.5" fill="none" />

        {/* CHEST BADGE — Честный Мастер */}
        <rect x="193" y="295" width="68" height="34" rx="6" fill="white" stroke="#10B981" strokeWidth="1.5" />
        {/* Badge lightning bolt */}
        <path d="M200 305 L204 299 L204 305 L208 305 L204 313 L204 307 L200 307 Z" fill="#10B981" />
        {/* Badge text lines */}
        <text x="213" y="307" fontSize="6.5" fontWeight="bold" fill="#0F172A" fontFamily="sans-serif">Честный</text>
        <text x="213" y="316" fontSize="6.5" fontWeight="bold" fill="#10B981" fontFamily="sans-serif">Мастер</text>

        {/* Jacket bottom seam */}
        <rect x="183" y="348" width="88" height="6" rx="3" fill="#BFDBFE" />

        {/* HEAD */}
        <circle cx="227" cy="238" r="34" fill="#FDE68A" />

        {/* HARD HAT — orange, proper shape */}
        {/* Hat dome */}
        <path d="M193 240 Q193 202 227 198 Q261 202 261 240 Z" fill="#F97316" />
        {/* Hat brim */}
        <rect x="185" y="238" width="84" height="9" rx="4.5" fill="#EA580C" />
        {/* Hat highlight */}
        <path d="M205 210 Q216 204 230 207" stroke="#FED7AA" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />

        {/* FACE — friendly expression */}
        {/* Eyes */}
        <circle cx="216" cy="242" r="4.5" fill="white" />
        <circle cx="238" cy="242" r="4.5" fill="white" />
        <circle cx="217" cy="243" r="2.5" fill="#1E293B" />
        <circle cx="239" cy="243" r="2.5" fill="#1E293B" />
        {/* Eye shine */}
        <circle cx="218" cy="242" r="1" fill="white" />
        <circle cx="240" cy="242" r="1" fill="white" />
        {/* Eyebrows — raised friendly */}
        <path d="M212 236 Q217 233 222 236" stroke="#92400E" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        <path d="M232 236 Q237 233 242 236" stroke="#92400E" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        {/* Big smile */}
        <path d="M213 252 Q227 263 241 252" stroke="#92400E" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        {/* Cheeks blush */}
        <circle cx="210" cy="254" r="5" fill="#FCA5A5" opacity="0.45" />
        <circle cx="244" cy="254" r="5" fill="#FCA5A5" opacity="0.45" />

        {/* PAINT ROLLER — left hand */}
        {/* Roller pole */}
        <rect x="148" y="316" width="10" height="68" rx="5" fill="#94A3B8" />
        {/* Roller frame */}
        <rect x="128" y="296" width="12" height="30" rx="4" fill="#64748B" />
        <path d="M133 296 L138 310 L133 326" stroke="#64748B" strokeWidth="2" fill="none" strokeLinecap="round" />
        <line x1="140" y1="310" x2="153" y2="318" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" />
        {/* Roller cylinder */}
        <rect x="110" y="290" width="22" height="40" rx="11" fill="#10B981" />
        <rect x="112" y="293" width="18" height="34" rx="9" fill="#34D399" />
        {/* Paint mark on wall */}
        <path d="M120 290 Q118 272 122 255" stroke="#10B981" strokeWidth="3" strokeLinecap="round" opacity="0.4" />

        {/* PAINT BUCKET — right side on floor */}
        <rect x="298" y="372" width="40" height="36" rx="8" fill="#10B981" />
        <rect x="300" y="382" width="36" height="24" rx="6" fill="#34D399" />
        {/* Bucket handle */}
        <path d="M302 372 Q318 360 334 372" stroke="#059669" strokeWidth="3" strokeLinecap="round" fill="none" />
        {/* Paint splash */}
        <ellipse cx="318" cy="408" rx="22" ry="4" fill="#10B981" opacity="0.2" />
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
