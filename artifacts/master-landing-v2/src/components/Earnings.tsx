import React from 'react';
import { Wallet, Timer, Banknote } from 'lucide-react';
import AnimatedSection from './AnimatedSection';

const Earnings: React.FC = () => {
  const stats = [
    {
      value: '8–12K ₽',
      label: 'за рабочий день',
      icon: <Wallet size={22} className="text-[#10B981]" />,
      color: '#10B981',
    },
    {
      value: '24 часа',
      label: 'до нового заказа',
      icon: <Timer size={22} className="text-[#3B82F6]" />,
      color: '#3B82F6',
    },
    {
      value: 'до 350K ₽',
      label: 'доход активных мастеров',
      icon: <Banknote size={22} className="text-[#F59E0B]" />,
      color: '#F59E0B',
    },
  ];

  return (
    <section id="earnings" className="relative py-24 bg-white overflow-hidden">
      {/* Background glow */}
      <div
        className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-[600px] h-[400px] opacity-10 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse, rgba(245,158,11,0.08) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <AnimatedSection className="text-center mb-16">
          <p className="text-[#F59E0B] text-sm font-semibold uppercase tracking-widest mb-3">
            Ваш доход
          </p>
          <h2 className="text-4xl sm:text-5xl font-black text-[#0F172A] mb-4">
            Сколько можно{' '}
            <span className="text-[#F59E0B]">зарабатывать</span>
          </h2>
          <p className="text-[#64748B] text-lg max-w-2xl mx-auto">
            Ваш доход зависит от конверсии на замере, рейтинга и скорости работы.
            Платформа даёт поток заказов, результат зависит от вас.
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
                  className="text-4xl font-black mb-2"
                  style={{ color: stat.color }}
                >
                  {stat.value}
                </div>
                <p className="text-[#0F172A] font-semibold text-base">{stat.label}</p>
              </div>
            </AnimatedSection>
          ))}
        </div>

        {/* Big earnings banner */}
        <AnimatedSection delay={350}>
          <div
            className="relative rounded-3xl overflow-hidden p-1"
            style={{
              background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(59,130,246,0.08), rgba(245,158,11,0.08))',
            }}
          >
            <div className="rounded-[22px] bg-white px-8 py-10 text-center">
              <p className="text-[#64748B] text-sm font-medium mb-3 uppercase tracking-wider">
                Активный мастер зарабатывает
              </p>
              <div className="flex items-center justify-center gap-3 mb-4">
                <span
                  className="text-6xl sm:text-7xl font-black"
                  style={{
                    background: 'linear-gradient(135deg, #10B981, #3B82F6)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  8–12 т.р.
                </span>
              </div>
              <p className="text-[#0F172A] font-semibold text-lg mb-2">в день</p>
              <p className="text-[#64748B] text-base max-w-xl mx-auto">
                Ваш доход зависит от конверсии на замере, рейтинга и скорости работы.
                Платформа даёт поток заказов, результат зависит от вас.
              </p>
            </div>
          </div>
        </AnimatedSection>
      </div>

      <div className="neon-line-blue absolute bottom-0 left-0 right-0" />
    </section>
  );
};

export default Earnings;
