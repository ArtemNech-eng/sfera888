import React from 'react';
import { X, Check } from 'lucide-react';
import AnimatedSection from './AnimatedSection';

const Comparison: React.FC = () => {
  const problems = [
    'Сам ищешь клиентов — тратишь время впустую',
    'Покупаешь пустые контакты на биржах',
    'Клиенты «просто прицениваются»',
    'Тратишь время на бесконечные переписки',
    'Конкурируешь с демпингом новичков',
    'Завтра может не быть работы',
  ];

  const benefits = [
    'Платишь только за реальные объекты (или с возвратом токена)',
    'Клиенты уже отфильтрованы и ждут замер',
    '100% стоимости работ забираешь себе',
    'Оформляешь красивую смету прямо в приложении',
    'Работаешь без простоев по понятным правилам',
    'Стабильный поток заказов каждую неделю',
  ];

  return (
    <section id="comparison" className="relative py-24 bg-[#F8FAFC] overflow-hidden">
      <div
        className="absolute right-1/4 top-1/2 -translate-y-1/2 w-[500px] h-[500px] opacity-5 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <AnimatedSection className="text-center mb-16">
          <p className="text-[#10B981] text-sm font-semibold uppercase tracking-widest mb-3">
            Честное сравнение
          </p>
          <h2 className="text-4xl sm:text-5xl font-black text-[#0F172A] mb-4">
            Почему сильные мастера{' '}
            <span className="text-[#10B981]">переходят к нам</span>
          </h2>
          <p className="text-[#64748B] text-lg max-w-xl mx-auto">
            Авито, Профи, сарафанное радио — мы уважаем любой путь. Но вот почему
            профессионалы выбирают систему.
          </p>
        </AnimatedSection>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          {/* Problems column */}
          <AnimatedSection delay={100} direction="left">
            <div className="rounded-3xl p-1 h-full"
              style={{
                background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.03))',
              }}
            >
              <div className="h-full rounded-[22px] bg-white p-7">
                <div className="flex items-center gap-3 mb-7">
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                    <X size={20} className="text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-[#0F172A] font-black text-xl">Без системы</h3>
                    <p className="text-red-400/70 text-sm">Авито, Профи, сарафан</p>
                  </div>
                </div>

                <ul className="space-y-4">
                  {problems.map((item, i) => (
                    <li key={i} className="flex items-start gap-3 group">
                      <div className="w-6 h-6 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-red-500/20 transition-colors">
                        <X size={12} className="text-red-400" />
                      </div>
                      <span className="text-[#64748B] text-sm leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </AnimatedSection>

          {/* Benefits column */}
          <AnimatedSection delay={200} direction="right">
            <div
              className="rounded-3xl p-1 h-full"
              style={{
                background:
                  'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(16,185,129,0.03))',
                boxShadow: 'none',
              }}
            >
              <div className="h-full rounded-[22px] bg-white p-7">
                <div className="flex items-center gap-3 mb-7">
                  <div className="w-10 h-10 rounded-xl bg-[#10B981]/10 flex items-center justify-center">
                    <Check size={20} className="text-[#10B981]" />
                  </div>
                  <div>
                    <h3 className="text-[#0F172A] font-black text-xl">В системе Честный Мастер</h3>
                    <p className="text-[#10B981]/70 text-sm">IT-платформа для профессионалов</p>
                  </div>
                </div>

                <ul className="space-y-4">
                  {benefits.map((item, i) => (
                    <li key={i} className="flex items-start gap-3 group">
                      <div className="w-6 h-6 rounded-full bg-[#10B981]/10 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-[#10B981]/20 transition-colors">
                        <Check size={12} className="text-[#10B981]" />
                      </div>
                      <span className="text-[#0F172A] text-sm leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </div>

      <div className="neon-line absolute bottom-0 left-0 right-0" />
    </section>
  );
};

export default Comparison;
