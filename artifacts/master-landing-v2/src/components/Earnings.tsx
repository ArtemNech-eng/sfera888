import React from 'react';
import { TrendingUp, Clock, Target } from 'lucide-react';
import AnimatedSection from './AnimatedSection';

const Earnings: React.FC = () => {
  const stats = [
    {
      value: '6–9',
      label: 'объектов в месяц',
      desc: 'средний мастер',
      icon: <Target size={22} className="text-[#34F5A3]" />,
      color: '#34F5A3',
    },
    {
      value: '2–3',
      label: 'дня на объект',
      desc: 'средняя длительность',
      icon: <Clock size={22} className="text-[#38BDF8]" />,
      color: '#38BDF8',
    },
    {
      value: '220К+',
      label: 'рублей в месяц',
      desc: 'у топ-мастеров платформы',
      icon: <TrendingUp size={22} className="text-[#FACC15]" />,
      color: '#FACC15',
    },
  ];

  return (
    <section id="earnings" className="relative py-24 bg-[#0F172A] overflow-hidden">
      {/* Background glow */}
      <div
        className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-[600px] h-[400px] opacity-10 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse, rgba(250,204,21,0.5) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <AnimatedSection className="text-center mb-16">
          <p className="text-[#FACC15] text-sm font-semibold uppercase tracking-widest mb-3">
            Ваш доход
          </p>
          <h2 className="text-4xl sm:text-5xl font-black text-[#F8FAFC] mb-4">
            Сколько можно{' '}
            <span className="text-[#FACC15]">зарабатывать</span>
          </h2>
          <p className="text-[#94A3B8] text-lg max-w-2xl mx-auto">
            Ваш доход зависит только от вашей конверсии — умения договориться на замере и
            закрыть смету. Система даёт поток. Результат — в ваших руках.
          </p>
        </AnimatedSection>

        {/* Stats grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
          {stats.map((stat, i) => (
            <AnimatedSection key={i} delay={i * 100} direction="up">
              <div className="glass rounded-2xl p-7 text-center hover:scale-105 transition-transform duration-300 group">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
                  style={{ background: `${stat.color}15` }}
                >
                  {stat.icon}
                </div>
                <div
                  className="text-5xl font-black mb-2"
                  style={{ color: stat.color }}
                >
                  {stat.value}
                </div>
                <p className="text-[#F8FAFC] font-semibold text-base">{stat.label}</p>
                <p className="text-[#94A3B8] text-sm mt-1">{stat.desc}</p>
              </div>
            </AnimatedSection>
          ))}
        </div>

        {/* Big earnings banner */}
        <AnimatedSection delay={350}>
          <div
            className="relative rounded-3xl overflow-hidden p-1"
            style={{
              background: 'linear-gradient(135deg, rgba(52,245,163,0.4), rgba(56,189,248,0.2), rgba(250,204,21,0.2))',
            }}
          >
            <div className="rounded-[22px] bg-[#0B0F14] px-8 py-10 flex flex-col md:flex-row items-center justify-between gap-8">
              <div>
                <p className="text-[#94A3B8] text-sm font-medium mb-2 uppercase tracking-wider">
                  Средний активный мастер зарабатывает
                </p>
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span
                    className="text-6xl sm:text-7xl font-black"
                    style={{
                      background: 'linear-gradient(135deg, #34F5A3, #38BDF8)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                  >
                    120 000
                  </span>
                  <span className="text-[#94A3B8] text-2xl">—</span>
                  <span
                    className="text-6xl sm:text-7xl font-black"
                    style={{
                      background: 'linear-gradient(135deg, #38BDF8, #FACC15)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                  >
                    220 000
                  </span>
                  <span className="text-[#94A3B8] text-2xl font-bold">₽/мес</span>
                </div>
              </div>

              <div className="flex flex-col gap-3 min-w-[220px]">
                {[
                  { label: 'Конверсия', value: 'Выше = больше заказов', color: '#34F5A3' },
                  { label: 'Скорость', value: 'Быстрее = больше объектов', color: '#38BDF8' },
                  { label: 'Качество', value: 'Хорошо = 5★ и топ-рейтинг', color: '#FACC15' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: item.color }}
                    />
                    <span className="text-[#94A3B8] text-sm">{item.label}:</span>
                    <span className="text-[#F8FAFC] text-sm font-medium">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </AnimatedSection>
      </div>

      <div className="neon-line-blue absolute bottom-0 left-0 right-0" />
    </section>
  );
};

export default Earnings;
