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
        className="w-full h-auto rounded-3xl"
        aria-hidden="true"
      >
        {/* ── DARK BACKGROUND ── */}
        <rect width="480" height="520" rx="24" fill="#0F172A" />

        {/* ── BG GLOW BLOBS ── */}
        <ellipse cx="120" cy="160" rx="130" ry="130" fill="#065F46" opacity="0.25" />
        <ellipse cx="360" cy="360" rx="110" ry="110" fill="#1E3A8A" opacity="0.3" />
        <ellipse cx="380" cy="130" rx="70" ry="70" fill="#7C3AED" opacity="0.15" />

        {/* ── DECORATIVE LAYER: paint strokes / "leaves" behind character ── */}

        {/* Large green stroke — top left */}
        <path d="M30 60 Q80 20 160 80 Q120 130 60 120 Q20 110 30 60Z"
          fill="#10B981" opacity="0.55" />
        <path d="M15 40 Q70 0 155 65 Q115 115 50 105 Q8 92 15 40Z"
          fill="#34D399" opacity="0.2" />

        {/* Large teal stroke — top right */}
        <path d="M340 30 Q410 10 460 80 Q440 140 380 120 Q330 100 340 30Z"
          fill="#0D9488" opacity="0.5" />
        <path d="M355 15 Q425 0 470 65 Q452 128 392 108 Q342 88 355 15Z"
          fill="#2DD4BF" opacity="0.18" />

        {/* Left mid stripe — blueprint/ruler feel */}
        <path d="M0 220 Q50 190 90 240 Q70 290 20 280 Q-10 260 0 220Z"
          fill="#3B82F6" opacity="0.4" />

        {/* Right mid shape */}
        <path d="M400 200 Q460 175 485 240 Q475 295 420 278 Q385 262 400 200Z"
          fill="#7C3AED" opacity="0.35" />

        {/* Bottom left big stroke */}
        <path d="M10 390 Q70 350 150 400 Q140 460 70 465 Q10 458 10 390Z"
          fill="#10B981" opacity="0.4" />

        {/* Bottom right stroke */}
        <path d="M330 420 Q390 385 460 430 Q455 490 385 488 Q325 480 330 420Z"
          fill="#0D9488" opacity="0.35" />

        {/* Blueprint grid lines (upper-right area) */}
        {[0,1,2,3].map(i => (
          <line key={`bl${i}`} x1={310 + i*28} y1="40" x2={310 + i*28} y2="140"
            stroke="#3B82F6" strokeWidth="1" opacity="0.25" />
        ))}
        {[0,1,2,3].map(i => (
          <line key={`bh${i}`} x1="300" y1={50 + i*26} x2="420" y2={50 + i*26}
            stroke="#3B82F6" strokeWidth="1" opacity="0.25" />
        ))}

        {/* White highlight dots */}
        <circle cx="88" cy="48" r="5" fill="white" opacity="0.7" />
        <circle cx="390" cy="62" r="4" fill="white" opacity="0.6" />
        <circle cx="52" cy="310" r="4" fill="white" opacity="0.5" />
        <circle cx="434" cy="220" r="5" fill="white" opacity="0.55" />
        <circle cx="148" cy="442" r="3" fill="white" opacity="0.45" />
        <circle cx="418" cy="458" r="4" fill="white" opacity="0.5" />

        {/* ── CHARACTER ── */}

        {/* Legs */}
        <rect x="196" y="358" width="38" height="100" rx="16" fill="#1E3A8A" />
        <rect x="246" y="358" width="38" height="100" rx="16" fill="#1E3A8A" />
        {/* Boots */}
        <rect x="183" y="444" width="58" height="18" rx="9" fill="#0F172A" />
        <rect x="239" y="444" width="58" height="18" rx="9" fill="#0F172A" />
        {/* Boot highlight */}
        <rect x="186" y="444" width="28" height="5" rx="2.5" fill="white" opacity="0.08" />
        <rect x="242" y="444" width="28" height="5" rx="2.5" fill="white" opacity="0.08" />

        {/* Left arm */}
        <path d="M196 272 Q170 278 156 318 Q150 342 162 348 Q175 354 182 330 Q190 304 196 288Z"
          fill="#1E40AF" />
        {/* Right arm */}
        <path d="M284 272 Q310 278 324 318 Q330 342 318 348 Q305 354 298 330 Q290 304 284 288Z"
          fill="#1E40AF" />

        {/* Torso */}
        <rect x="190" y="255" width="100" height="110" rx="28" fill="#1E40AF" />
        {/* Shoulder highlight */}
        <rect x="190" y="255" width="100" height="32" rx="28" fill="#2563EB" />
        <rect x="190" y="274" width="100" height="13" fill="#2563EB" />

        {/* Chest badge */}
        <rect x="203" y="298" width="74" height="40" rx="9" fill="white" opacity="0.95" />
        <rect x="203" y="298" width="74" height="40" rx="9" stroke="#10B981" strokeWidth="1.5" fill="none" />
        <path d="M212 315 L216 307 L216 315 L221 315 L216 325 L216 316 L212 316Z" fill="#10B981" />
        <text x="225" y="313" fontSize="7" fontWeight="800" fill="#0F172A"
          fontFamily="system-ui,sans-serif">Честный</text>
        <text x="225" y="323" fontSize="7" fontWeight="800" fill="#10B981"
          fontFamily="system-ui,sans-serif">Мастер</text>

        {/* Neck */}
        <rect x="222" y="236" width="36" height="22" rx="8" fill="#C4A882" />

        {/* Head */}
        <ellipse cx="240" cy="204" rx="46" ry="46" fill="#D4956A" />
        {/* Head shadow (gives roundness) */}
        <ellipse cx="252" cy="214" rx="36" ry="36" fill="#C4855A" opacity="0.35" />

        {/* Face features */}
        {/* Eyes */}
        <ellipse cx="224" cy="206" rx="7" ry="7.5" fill="white" />
        <ellipse cx="256" cy="206" rx="7" ry="7.5" fill="white" />
        <circle cx="225" cy="207" r="4.5" fill="#1E293B" />
        <circle cx="257" cy="207" r="4.5" fill="#1E293B" />
        <circle cx="226" cy="205.5" r="1.5" fill="white" />
        <circle cx="258" cy="205.5" r="1.5" fill="white" />
        {/* Eyebrows */}
        <path d="M216 197 Q225 193 233 197" stroke="#7C4A1E" strokeWidth="2.5"
          strokeLinecap="round" fill="none" />
        <path d="M247 197 Q256 193 264 197" stroke="#7C4A1E" strokeWidth="2.5"
          strokeLinecap="round" fill="none" />
        {/* Nose */}
        <path d="M237 210 Q240 215 243 210" stroke="#A0632E" strokeWidth="1.5"
          strokeLinecap="round" fill="none" />
        {/* Smile */}
        <path d="M228 220 Q240 230 252 220" stroke="#7C4A1E" strokeWidth="2.5"
          strokeLinecap="round" fill="none" />
        {/* Cheeks */}
        <ellipse cx="218" cy="218" rx="8" ry="5" fill="#E8896A" opacity="0.4" />
        <ellipse cx="262" cy="218" rx="8" ry="5" fill="#E8896A" opacity="0.4" />

        {/* Hard hat */}
        <path d="M194 208 Q194 160 240 156 Q286 160 286 208Z" fill="#F97316" />
        <rect x="184" y="205" width="112" height="13" rx="6.5" fill="#EA580C" />
        <path d="M218 172 Q240 165 262 172" stroke="#FDBA74" strokeWidth="3"
          strokeLinecap="round" opacity="0.6" />
        {/* Hat logo stripe */}
        <rect x="228" y="176" width="24" height="8" rx="4" fill="white" opacity="0.2" />

        {/* Small paint drip detail — on left arm */}
        <path d="M158 342 Q155 352 158 360 Q163 368 162 376"
          stroke="#10B981" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
        <ellipse cx="161" cy="378" rx="4" ry="6" fill="#10B981" opacity="0.5" />

        {/* Tool silhouette — small roller top-left corner layer */}
        <rect x="40" y="140" width="14" height="48" rx="7" fill="#34D399" opacity="0.5" />
        <rect x="30" y="132" width="34" height="16" rx="8" fill="#10B981" opacity="0.6" />
        <rect x="33" y="134" width="28" height="12" rx="6" fill="#6EE7B7" opacity="0.5" />
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
        <p className="text-[#10B981] font-black text-lg">+84 000 ₽</p>
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
