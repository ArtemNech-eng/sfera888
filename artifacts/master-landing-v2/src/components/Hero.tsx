import React from 'react';
import { ArrowRight, CheckCircle2, Zap, TrendingUp } from 'lucide-react';
import NeonButton from './NeonButton';

interface HeroProps {
  botUrl: string;
}

function MasterIllustration() {
  return (
    <div className="relative w-full max-w-[520px] mx-auto select-none">
      <svg
        viewBox="0 0 520 560"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto rounded-3xl"
        aria-hidden="true"
      >
        {/* ── DARK BACKGROUND ── */}
        <rect width="520" height="560" rx="24" fill="#0F172A" />

        {/* ── WARM GLOW BLOBS ── */}
        <ellipse cx="140" cy="180" rx="150" ry="150" fill="#065F46" opacity="0.2" />
        <ellipse cx="400" cy="400" rx="130" ry="130" fill="#1E3A8A" opacity="0.25" />
        <ellipse cx="420" cy="150" rx="90" ry="90" fill="#F59E0B" opacity="0.08" />
        <ellipse cx="260" cy="280" rx="180" ry="180" fill="#7C3AED" opacity="0.06" />

        {/* ── ORGANIC LEAVES / PLANT SHAPES (warm reference style) ── */}

        {/* Top-left large tropical leaf */}
        <path d="M20 80 C60 20, 140 40, 180 100 C160 140, 100 130, 60 110 C30 100, 10 90, 20 80Z"
          fill="#10B981" opacity="0.45" />
        <path d="M30 75 C65 30, 130 50, 160 95 C145 125, 95 115, 65 100 C40 90, 25 82, 30 75Z"
          fill="#34D399" opacity="0.15" />
        {/* Leaf vein */}
        <path d="M50 85 Q100 70 150 95" stroke="#059669" strokeWidth="1.5" opacity="0.3" fill="none" />

        {/* Top-right warm leaf */}
        <path d="M380 40 C440 20, 500 60, 510 120 C480 150, 420 130, 390 100 C370 80, 365 55, 380 40Z"
          fill="#0D9488" opacity="0.4" />
        <path d="M395 50 C445 35, 490 70, 495 110 C470 130, 425 115, 400 90 C385 75, 385 58, 395 50Z"
          fill="#2DD4BF" opacity="0.15" />

        {/* Left mid organic blob */}
        <path d="M-10 240 C30 200, 100 220, 120 280 C110 330, 50 340, 10 310 C-20 285, -25 260, -10 240Z"
          fill="#3B82F6" opacity="0.3" />

        {/* Right mid warm shape */}
        <path d="M430 220 C490 190, 530 250, 515 310 C490 350, 430 330, 410 290 C395 260, 405 235, 430 220Z"
          fill="#F59E0B" opacity="0.15" />

        {/* Bottom-left large leaf */}
        <path d="M30 420 C80 370, 170 390, 200 450 C180 510, 100 520, 50 490 C10 465, 5 440, 30 420Z"
          fill="#10B981" opacity="0.35" />
        <path d="M45 430 C85 390, 155 405, 175 450 C160 485, 95 495, 55 470 C25 450, 20 435, 45 430Z"
          fill="#6EE7B7" opacity="0.12" />

        {/* Bottom-right leaf */}
        <path d="M370 460 C420 420, 490 440, 505 500 C485 540, 420 530, 390 500 C365 478, 360 465, 370 460Z"
          fill="#0D9488" opacity="0.3" />

        {/* Small accent leaves floating */}
        <ellipse cx="80" cy="350" rx="25" ry="15" transform="rotate(-30 80 350)" fill="#FBBF24" opacity="0.15" />
        <ellipse cx="450" cy="180" rx="20" ry="12" transform="rotate(20 450 180)" fill="#34D399" opacity="0.2" />
        <ellipse cx="160" cy="480" rx="18" ry="10" transform="rotate(-45 160 480)" fill="#60A5FA" opacity="0.12" />

        {/* Warm dots / pollen */}
        <circle cx="100" cy="60" r="6" fill="#FCD34D" opacity="0.5" />
        <circle cx="440" cy="80" r="5" fill="#FCD34D" opacity="0.4" />
        <circle cx="70" cy="340" r="4" fill="white" opacity="0.5" />
        <circle cx="470" cy="260" r="6" fill="white" opacity="0.45" />
        <circle cx="130" cy="490" r="4" fill="#FCD34D" opacity="0.35" />
        <circle cx="460" cy="480" r="5" fill="white" opacity="0.4" />
        <circle cx="200" cy="50" r="3" fill="white" opacity="0.3" />
        <circle cx="380" cy="500" r="4" fill="#FBBF24" opacity="0.3" />

        {/* ── CHARACTER (larger, more detailed) ── */}
        <g transform="translate(20, 10)">

          {/* Legs — wider */}
          <rect x="186" y="368" width="44" height="110" rx="18" fill="#1E3A8A" />
          <rect x="250" y="368" width="44" height="110" rx="18" fill="#1E3A8A" />
          {/* Leg highlight */}
          <rect x="186" y="368" width="22" height="110" rx="18" fill="#2563EB" opacity="0.15" />
          <rect x="250" y="368" width="22" height="110" rx="18" fill="#2563EB" opacity="0.15" />

          {/* Boots */}
          <rect x="170" y="462" width="64" height="22" rx="11" fill="#0F172A" />
          <rect x="246" y="462" width="64" height="22" rx="11" fill="#0F172A" />
          {/* Boot laces detail */}
          <line x1="185" y1="468" x2="185" y2="476" stroke="#334155" strokeWidth="2" strokeLinecap="round" />
          <line x1="195" y1="468" x2="195" y2="476" stroke="#334155" strokeWidth="2" strokeLinecap="round" />
          <line x1="261" y1="468" x2="261" y2="476" stroke="#334155" strokeWidth="2" strokeLinecap="round" />
          <line x1="271" y1="468" x2="271" y2="476" stroke="#334155" strokeWidth="2" strokeLinecap="round" />
          {/* Boot shine */}
          <ellipse cx="180" cy="468" rx="12" ry="4" fill="white" opacity="0.06" />
          <ellipse cx="256" cy="468" rx="12" ry="4" fill="white" opacity="0.06" />

          {/* Tool belt */}
          <rect x="175" y="348" width="130" height="14" rx="7" fill="#451A03" />
          <rect x="220" y="346" width="18" height="18" rx="4" fill="#D97706" />
          <rect x="250" y="346" width="16" height="18" rx="4" fill="#92400E" />
          {/* Hammer silhouette on belt */}
          <rect x="285" y="340" width="6" height="22" rx="3" fill="#92400E" />
          <rect x="280" y="338" width="16" height="8" rx="4" fill="#B45309" />

          {/* Left arm — more natural pose */}
          <path d="M178 282 Q148 292 138 328 Q132 352 144 362 Q158 370 166 348 Q174 322 180 300Z"
            fill="#1E40AF" />
          <path d="M178 282 Q148 292 138 328 Q132 352 144 362 Q158 370 166 348 Q174 322 180 300Z"
            fill="#2563EB" opacity="0.15" />
          {/* Left hand */}
          <ellipse cx="150" cy="365" rx="14" ry="16" fill="#D4956A" />
          <ellipse cx="152" cy="368" rx="10" ry="12" fill="#C4855A" opacity="0.35" />

          {/* Right arm — reaching slightly */}
          <path d="M302 282 Q332 270 348 300 Q360 325 350 340 Q338 355 322 335 Q310 312 304 298Z"
            fill="#1E40AF" />
          <path d="M302 282 Q332 270 348 300 Q360 325 350 340 Q338 355 322 335 Q310 312 304 298Z"
            fill="#2563EB" opacity="0.15" />
          {/* Right hand */}
          <ellipse cx="348" cy="335" rx="14" ry="16" fill="#D4956A" />
          <ellipse cx="350" cy="338" rx="10" ry="12" fill="#C4855A" opacity="0.35" />
          {/* Thumb */}
          <ellipse cx="340" cy="325" rx="6" ry="8" fill="#D4956A" />

          {/* Torso — larger, with details */}
          <rect x="175" y="262" width="130" height="130" rx="34" fill="#1E40AF" />
          {/* Torso warm gradient overlay */}
          <rect x="175" y="262" width="130" height="65" rx="34" fill="#2563EB" opacity="0.25" />
          <rect x="175" y="262" width="130" height="35" rx="34" fill="#3B82F6" opacity="0.12" />

          {/* Collar */}
          <path d="M210 262 L240 290 L270 262" fill="#1E3A8A" />
          <path d="M220 262 L240 280 L260 262" fill="#2563EB" opacity="0.3" />

          {/* Pocket left */}
          <rect x="190" y="310" width="34" height="38" rx="8" fill="#1E3A8A" stroke="#2563EB" strokeWidth="1" />
          <rect x="196" y="316" width="22" height="4" rx="2" fill="#2563EB" opacity="0.3" />

          {/* Pocket right */}
          <rect x="256" y="310" width="34" height="38" rx="8" fill="#1E3A8A" stroke="#2563EB" strokeWidth="1" />
          <rect x="262" y="316" width="22" height="4" rx="2" fill="#2563EB" opacity="0.3" />

          {/* Chest badge — larger */}
          <rect x="208" y="290" width="64" height="48" rx="12" fill="white" opacity="0.95" />
          <rect x="208" y="290" width="64" height="48" rx="12" stroke="#10B981" strokeWidth="2" fill="none" />
          <path d="M220 310 L225 300 L225 310 L232 310 L225 324 L225 312 L220 312Z" fill="#10B981" />
          <text x="235" y="308" fontSize="9" fontWeight="800" fill="#0F172A"
            fontFamily="system-ui,sans-serif">Честный</text>
          <text x="235" y="322" fontSize="9" fontWeight="800" fill="#10B981"
            fontFamily="system-ui,sans-serif">Мастер</text>

          {/* Neck — slightly thicker */}
          <rect x="225" y="244" width="42" height="24" rx="10" fill="#C4A882" />
          <rect x="225" y="256" width="42" height="12" rx="6" fill="#B8956A" opacity="0.4" />

          {/* Head — BIGGER */}
          <ellipse cx="246" cy="198" rx="56" ry="56" fill="#D4956A" />
          {/* Head warm shadow */}
          <ellipse cx="260" cy="210" rx="46" ry="46" fill="#C4855A" opacity="0.3" />
          {/* Chin */}
          <ellipse cx="246" cy="242" rx="28" ry="12" fill="#D4956A" />

          {/* Ears */}
          <ellipse cx="190" cy="198" rx="10" ry="14" fill="#D4956A" />
          <ellipse cx="302" cy="198" rx="10" ry="14" fill="#D4956A" />
          <ellipse cx="188" cy="198" rx="5" ry="8" fill="#C4855A" opacity="0.4" />
          <ellipse cx="304" cy="198" rx="5" ry="8" fill="#C4855A" opacity="0.4" />

          {/* Hair peeking under hat */}
          <path d="M198 170 Q210 158 230 162" stroke="#5C3A1E" strokeWidth="4" strokeLinecap="round" fill="none" />
          <path d="M262 162 Q282 158 294 170" stroke="#5C3A1E" strokeWidth="4" strokeLinecap="round" fill="none" />

          {/* Face features — DETAILED */}
          {/* Eyes — larger, with more life */}
          <ellipse cx="228" cy="194" rx="9" ry="10" fill="white" />
          <ellipse cx="264" cy="194" rx="9" ry="10" fill="white" />
          {/* Iris */}
          <circle cx="229" cy="195" r="5.5" fill="#1E293B" />
          <circle cx="265" cy="195" r="5.5" fill="#1E293B" />
          {/* Pupil highlight */}
          <circle cx="230" cy="193" r="2.5" fill="white" />
          <circle cx="266" cy="193" r="2.5" fill="white" />
          <circle cx="227" cy="197" r="1.5" fill="white" opacity="0.7" />
          <circle cx="263" cy="197" r="1.5" fill="white" opacity="0.7" />

          {/* Eyelids */}
          <path d="M219 188 Q228 184 237 188" stroke="#C4855A" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <path d="M255 188 Q264 184 273 188" stroke="#C4855A" strokeWidth="1.5" strokeLinecap="round" fill="none" />

          {/* Eyebrows — thicker, more expressive */}
          <path d="M215 182 Q228 176 240 182" stroke="#5C3A1E" strokeWidth="3.5"
            strokeLinecap="round" fill="none" />
          <path d="M252 182 Q264 176 277 182" stroke="#5C3A1E" strokeWidth="3.5"
            strokeLinecap="round" fill="none" />

          {/* Nose — more defined */}
          <path d="M243 202 Q246 212 249 202" stroke="#A0632E" strokeWidth="2"
            strokeLinecap="round" fill="none" />
          <ellipse cx="246" cy="208" rx="4" ry="2.5" fill="#C4855A" opacity="0.5" />

          {/* Smile — wider, happier */}
          <path d="M225 222 Q246 238 267 222" stroke="#7C4A1E" strokeWidth="3"
            strokeLinecap="round" fill="none" />
          {/* Smile dimples */}
          <path d="M222 218 Q225 222 224 226" stroke="#A0632E" strokeWidth="1.5"
            strokeLinecap="round" fill="none" />
          <path d="M270 218 Q267 222 268 226" stroke="#A0632E" strokeWidth="1.5"
            strokeLinecap="round" fill="none" />

          {/* Cheeks — warmer, more prominent */}
          <ellipse cx="214" cy="212" rx="12" ry="7" fill="#E8896A" opacity="0.35" />
          <ellipse cx="278" cy="212" rx="12" ry="7" fill="#E8896A" opacity="0.35" />

          {/* Freckles */}
          <circle cx="210" cy="208" r="1" fill="#C4855A" opacity="0.5" />
          <circle cx="214" cy="206" r="1" fill="#C4855A" opacity="0.4" />
          <circle cx="218" cy="210" r="1" fill="#C4855A" opacity="0.5" />
          <circle cx="282" cy="208" r="1" fill="#C4855A" opacity="0.5" />
          <circle cx="278" cy="206" r="1" fill="#C4855A" opacity="0.4" />
          <circle cx="274" cy="210" r="1" fill="#C4855A" opacity="0.5" />

          {/* Hard hat — WARM ORANGE, more detailed */}
          {/* Hat dome */}
          <path d="M186 200 Q186 148 246 142 Q306 148 306 200Z" fill="#F97316" />
          {/* Hat gradient shine */}
          <path d="M195 200 Q195 160 246 155 Q275 158 285 200Z" fill="#FB923C" opacity="0.4" />
          {/* Hat rim */}
          <rect x="174" y="196" width="144" height="16" rx="8" fill="#EA580C" />
          {/* Hat rim highlight */}
          <rect x="174" y="196" width="144" height="6" rx="3" fill="#FDBA74" opacity="0.3" />
          {/* Top ridge */}
          <path d="M228 155 Q246 148 264 155" stroke="#FDBA74" strokeWidth="3.5"
            strokeLinecap="round" opacity="0.5" />
          {/* Side vents */}
          <rect x="228" y="172" width="36" height="10" rx="5" fill="#C2410C" opacity="0.4" />
          <rect x="230" y="174" width="32" height="6" rx="3" fill="#EA580C" opacity="0.3" />
          {/* Chin strap hint */}
          <path d="M200 212 Q210 235 220 248" stroke="#9A3412" strokeWidth="2"
            strokeLinecap="round" opacity="0.4" fill="none" />
          <path d="M292 212 Q282 235 272 248" stroke="#9A3412" strokeWidth="2"
            strokeLinecap="round" opacity="0.4" fill="none" />

        </g>
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
