import { CheckCircle2 } from 'lucide-react';

interface HeroProps {
  onCtaClick: () => void;
}

export default function Hero({ onCtaClick }: HeroProps) {
  return (
    <section className="relative overflow-hidden bg-white pt-16 pb-20 px-4">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(52,199,89,0.10) 0%, transparent 70%)',
        }}
      />

      <div className="relative max-w-2xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 bg-[#F0FBF4] text-[#34C759] rounded-full px-4 py-2 text-sm font-semibold mb-8">
          <span
            className="w-2 h-2 rounded-full bg-[#34C759] inline-block"
            style={{ animation: 'pulse-green 2.5s ease infinite' }}
          />
          Принимаем мастеров
        </div>

        <h1 className="text-4xl md:text-6xl font-black text-[#1A1A1A] leading-tight tracking-tight mb-6">
          Заказы для мастеров<br />
          на ремонт и отделку
        </h1>

        <p className="text-lg md:text-xl text-[#8E8E93] leading-relaxed mb-10 max-w-xl mx-auto">
          Получайте клиентов без поиска, работайте через приложение
          и берите только те заказы, которые вам подходят
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-10">
          {[
            'Заказы каждый день',
            'Работа по своим ценам',
            'Предоплату вносит клиент',
          ].map((text) => (
            <div
              key={text}
              className="flex items-center gap-2 bg-[#F5F5F5] rounded-full px-4 py-2.5 text-sm font-medium text-[#1A1A1A]"
            >
              <CheckCircle2 size={16} className="text-[#34C759] flex-shrink-0" strokeWidth={2.5} />
              <span>{text}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center gap-3">
          <button
            className="btn-primary pulse-btn w-full max-w-xs text-lg"
            onClick={onCtaClick}
          >
            Начать получать заказы
          </button>
          <span className="text-sm text-[#8E8E93]">Регистрация в приложении за 2 минуты</span>
        </div>
      </div>
    </section>
  );
}
