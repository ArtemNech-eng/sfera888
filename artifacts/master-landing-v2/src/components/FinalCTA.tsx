import React from 'react';
import { ArrowRight, Zap } from 'lucide-react';
import AnimatedSection from './AnimatedSection';

interface FinalCTAProps {
  botUrl: string;
}

const FinalCTA: React.FC<FinalCTAProps> = ({ botUrl }) => {
  return (
    <section className="relative py-28 bg-[#F8FAFC] overflow-hidden">
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            'linear-gradient(rgba(16,185,129,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.04) 1px, transparent 1px)',
          backgroundSize: '50px 50px',
        }}
      />

      {/* Big glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 100%, rgba(16,185,129,0.1) 0%, transparent 60%)',
        }}
      />

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Icon */}
        <AnimatedSection direction="fade">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-8"
            style={{
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.25)',
            }}
          >
            <Zap size={36} className="text-[#10B981]" />
          </div>
        </AnimatedSection>

        <AnimatedSection delay={100}>
          <h2 className="text-5xl sm:text-6xl lg:text-7xl font-black text-[#0F172A] leading-[1.05] mb-6">
            Хватит искать{' '}
            <br />
            <span
              style={{
                background: 'linear-gradient(135deg, #10B981, #3B82F6)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              клиентов вслепую
            </span>
          </h2>
        </AnimatedSection>

        <AnimatedSection delay={200}>
          <p className="text-[#64748B] text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            Подключайтесь к системе, где есть объекты, понятные правила и рабочий ритм.
            Первый заказ — уже сегодня.
          </p>
        </AnimatedSection>

        {/* Huge CTA button */}
        <AnimatedSection delay={300}>
          <a
            href={botUrl}
            className="group relative inline-flex items-center justify-center gap-3 px-10 py-6 rounded-2xl font-bold text-xl text-white transition-all duration-200 hover:scale-105 active:scale-95 shadow-md hover:shadow-lg"
            style={{
              background: '#10B981',
            }}
          >
            {/* Shimmer effect */}
            <span
              className="absolute inset-0 rounded-2xl overflow-hidden"
              aria-hidden="true"
            >
              <span
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{
                  background:
                    'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.4) 50%, transparent 60%)',
                  animation: 'shimmer 1.5s infinite',
                }}
              />
            </span>

            <span className="relative">Начать получать заказы</span>
            <ArrowRight size={24} className="relative transition-transform group-hover:translate-x-1" />
          </a>
        </AnimatedSection>

        <AnimatedSection delay={400}>
          <p className="text-[#64748B]/70 text-sm mt-6">
            Бесплатная регистрация · Первый объект сегодня · Без комиссий
          </p>
        </AnimatedSection>

        {/* Stats */}
        <AnimatedSection delay={500}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-8 mt-14 pt-10 border-t border-[#E2E8F0]">
            {[
              { value: '100%', label: 'заработка — ваши' },
              { value: '0%', label: 'комиссий с объектов' },
              { value: '2 мин', label: 'на регистрацию' },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div
                  className="text-3xl font-black mb-1"
                  style={{
                    background: 'linear-gradient(135deg, #10B981, #3B82F6)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {stat.value}
                </div>
                <p className="text-[#64748B] text-sm">{stat.label}</p>
              </div>
            ))}
          </div>
        </AnimatedSection>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </section>
  );
};

export default FinalCTA;
