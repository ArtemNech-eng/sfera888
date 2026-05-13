import React from 'react';
import { Package, Wrench, CheckCircle, Star } from 'lucide-react';
import AnimatedSection from './AnimatedSection';

const HowItWorks: React.FC = () => {
  const steps = [
    {
      icon: <Package size={28} className="text-[#34F5A3]" />,
      step: '01',
      title: 'Взял объект',
      desc: 'Открываете ленту заказов в приложении и берёте подходящий объект. Система показывает адрес, описание работ и ориентировочный бюджет.',
    },
    {
      icon: <Wrench size={28} className="text-[#38BDF8]" />,
      step: '02',
      title: 'Сделал',
      desc: 'Приезжаете на замер, считаете смету прямо в приложении, договариваетесь с клиентом и выполняете работу по рыночным ценам.',
    },
    {
      icon: <CheckCircle size={28} className="text-[#FACC15]" />,
      step: '03',
      title: 'Закрыл',
      desc: 'После завершения закрываете объект в приложении. Клиент подтверждает работу. Вы получаете 100% суммы — без комиссий и вычетов.',
    },
    {
      icon: <Star size={28} className="text-[#34F5A3]" />,
      step: '04',
      title: 'Взял новый',
      desc: 'Система предлагает следующий объект. Для топ-мастеров с высокой конверсией — возможность взять до 2 объектов одновременно.',
    },
  ];

  return (
    <section id="how-it-works" className="relative py-24 bg-[#0F172A] overflow-hidden">
      {/* Subtle glow */}
      <div
        className="absolute left-0 top-1/2 -translate-y-1/2 w-96 h-96 opacity-10 pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(52,245,163,0.5) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <AnimatedSection className="text-center mb-16">
          <p className="text-[#34F5A3] text-sm font-semibold uppercase tracking-widest mb-3">
            Как работает платформа
          </p>
          <h2 className="text-4xl sm:text-5xl font-black text-[#F8FAFC] mb-4">
            Принцип конвейера:
            <br />
            <span className="text-[#34F5A3]">Взял → Сделал → Взял новый</span>
          </h2>
          <p className="text-[#94A3B8] text-lg max-w-2xl mx-auto">
            Мы не даём мастерам хватать по 5 объектов и срывать сроки. По умолчанию: 1
            активный заказ в одни руки. Так система остаётся управляемой, клиенты довольны, а
            сильные мастера работают без простоев.
          </p>
        </AnimatedSection>

        {/* Steps */}
        <div className="relative">
          {/* Connecting line (desktop) */}
          <div className="hidden lg:block absolute top-12 left-[12.5%] right-[12.5%] h-[2px]"
            style={{
              background: 'linear-gradient(90deg, rgba(52,245,163,0.1), rgba(52,245,163,0.5), rgba(56,189,248,0.5), rgba(250,204,21,0.5), rgba(52,245,163,0.1))',
            }}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((step, i) => (
              <AnimatedSection key={i} delay={i * 120} direction="up">
                <div className="relative glass rounded-2xl p-6 hover:border-[#34F5A3]/20 transition-all duration-300 group">
                  {/* Step number */}
                  <div className="text-6xl font-black text-[#34F5A3]/8 absolute top-4 right-4 select-none leading-none">
                    {step.step}
                  </div>

                  {/* Icon */}
                  <div className="w-14 h-14 rounded-2xl bg-[#0B0F14] flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300">
                    {step.icon}
                  </div>

                  <h3 className="text-[#F8FAFC] font-bold text-xl mb-3">{step.title}</h3>
                  <p className="text-[#94A3B8] text-sm leading-relaxed">{step.desc}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>

        {/* Note */}
        <AnimatedSection delay={500} className="mt-10 text-center">
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-[#FACC15]/5 border border-[#FACC15]/20">
            <Star size={16} className="text-[#FACC15]" />
            <p className="text-[#FACC15] text-sm font-medium">
              Для лучших мастеров с высокой конверсией лимит может быть увеличен до 2 объектов одновременно
            </p>
          </div>
        </AnimatedSection>
      </div>

      <div className="neon-line-blue absolute bottom-0 left-0 right-0" />
    </section>
  );
};

export default HowItWorks;
