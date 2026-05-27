import React from 'react';
import { CheckCircle2, XCircle, Users } from 'lucide-react';
import AnimatedSection from './AnimatedSection';

const WhoWeHire: React.FC = () => {
  const specialties = [
    'Обои',
    'Шпаклёвка',
    'Покраска',
    'Плитка',
    'Санузлы',
    'Отделочники',
    'Универсалы',
    'Ламинат',
    'Натяжные потолки',
    'Электрика',
  ];

  const rules = [
    {
      ok: true,
      text: 'Приезжать на замеры вовремя',
    },
    {
      ok: true,
      text: 'Считать сметы ТОЛЬКО через наше приложение',
    },
    {
      ok: true,
      text: 'Держать адекватные рыночные цены',
    },
    {
      ok: true,
      text: 'Соблюдать договорённости с клиентами',
    },
    {
      ok: false,
      text: 'Работать в обход системы (прямые договорённости с клиентами)',
    },
    {
      ok: false,
      text: 'Срывать сроки и пропадать с объекта',
    },
  ];

  return (
    <section id="who-we-hire" className="relative py-24 bg-[#F8FAFC] overflow-hidden">
      <div
        className="absolute right-0 bottom-0 w-96 h-96 opacity-8 pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <AnimatedSection className="text-center mb-16">
          <p className="text-[#3B82F6] text-sm font-semibold uppercase tracking-widest mb-3">
            Отбор
          </p>
          <h2 className="text-4xl sm:text-5xl font-black text-[#0F172A] mb-4">
            С кем мы{' '}
            <span className="text-[#3B82F6]">работаем</span>
          </h2>
          <p className="text-[#64748B] text-lg max-w-xl mx-auto">
            Мы строим сильную платформу. Поэтому нам важно с кем мы работаем.
            Случайные и слабые здесь не задерживаются.
          </p>
        </AnimatedSection>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Specialties */}
          <AnimatedSection delay={100} direction="left">
            <div className="glass rounded-3xl p-8 h-full">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-[#34F5A3]/10 flex items-center justify-center">
                  <Users size={20} className="text-[#10B981]" />
                </div>
                <h3 className="text-[#0F172A] font-black text-xl">Кого берём</h3>
              </div>

              <div className="flex flex-wrap gap-3">
                {specialties.map((spec, i) => (
                  <div
                    key={i}
                    className="px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 hover:scale-105 cursor-default"
                    style={{
                      background: 'rgba(16,185,129,0.08)',
                      border: '1px solid rgba(16,185,129,0.2)',
                      color: '#10B981',
                    }}
                  >
                    {spec}
                  </div>
                ))}
              </div>

              <div className="mt-6 p-4 rounded-2xl bg-[#10B981]/5 border border-[#10B981]/10">
                <p className="text-[#64748B] text-sm">
                  <span className="text-[#10B981] font-semibold">Нужен опыт</span> — мы работаем
                  только с теми, кто понимает свои работы и может дать качественный результат клиенту.
                </p>
              </div>
            </div>
          </AnimatedSection>

          {/* Rules */}
          <AnimatedSection delay={200} direction="right">
            <div className="glass rounded-3xl p-8 h-full">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-[#3B82F6]/10 flex items-center justify-center">
                  <CheckCircle2 size={20} className="text-[#3B82F6]" />
                </div>
                <h3 className="text-[#0F172A] font-black text-xl">Правила платформы</h3>
              </div>

              <ul className="space-y-3">
                {rules.map((rule, i) => (
                  <li key={i} className="flex items-start gap-3">
                    {rule.ok ? (
                      <CheckCircle2 size={18} className="text-[#10B981] flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
                    )}
                    <span
                      className={`text-sm leading-relaxed ${
                        rule.ok ? 'text-[#0F172A]' : 'text-[#64748B]'
                      }`}
                    >
                      {rule.text}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-6 p-4 rounded-2xl bg-red-500/5 border border-red-500/15">
                <p className="text-[#64748B] text-sm">
                  <span className="text-red-400 font-semibold">⚡ Важно:</span> нарушение правил
                  приводит к заморозке аккаунта и потере токенов. Мы работаем честно — ждём того же
                  от вас.
                </p>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </div>

      <div className="neon-line absolute bottom-0 left-0 right-0" />
    </section>
  );
};

export default WhoWeHire;
