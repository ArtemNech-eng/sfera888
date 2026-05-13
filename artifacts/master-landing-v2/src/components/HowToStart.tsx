import React from 'react';
import { MousePointerClick, Bot, Phone, Layers, ShieldCheck, ArrowRight } from 'lucide-react';
import AnimatedSection from './AnimatedSection';
import NeonButton from './NeonButton';

interface HowToStartProps {
  botUrl: string;
}

const HowToStart: React.FC<HowToStartProps> = ({ botUrl }) => {
  const steps = [
    {
      number: '1',
      icon: <MousePointerClick size={22} className="text-[#34F5A3]" />,
      title: 'Нажимаете кнопку ниже',
      desc: 'Переходите на страницу регистрации — это займёт меньше минуты.',
      color: '#34F5A3',
    },
    {
      number: '2',
      icon: <Bot size={22} className="text-[#38BDF8]" />,
      title: 'Переходите в Telegram-бота (Max)',
      desc: 'Бот Max встретит вас, объяснит условия и поможет зарегистрироваться.',
      color: '#38BDF8',
    },
    {
      number: '3',
      icon: <Phone size={22} className="text-[#FACC15]" />,
      title: 'Авторизуетесь по номеру телефона',
      desc: 'Быстрая и безопасная авторизация — никаких лишних форм и паролей.',
      color: '#FACC15',
    },
    {
      number: '4',
      icon: <Layers size={22} className="text-[#34F5A3]" />,
      title: 'Получаете доступ в приложение',
      desc: 'После регистрации вам открывается лента объектов с полным функционалом.',
      color: '#34F5A3',
    },
    {
      number: '5',
      icon: <ShieldCheck size={22} className="text-[#38BDF8]" />,
      title: 'Выбираете путь старта',
      desc: 'Проходите верификацию для тестового заказа ИЛИ сразу покупаете пакет токенов и берёте объекты.',
      color: '#38BDF8',
    },
  ];

  return (
    <section id="how-to-start" className="relative py-24 bg-[#0F172A] overflow-hidden">
      <div
        className="absolute left-1/2 -translate-x-1/2 top-0 w-[600px] h-[200px] opacity-15 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse, rgba(52,245,163,0.5) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <AnimatedSection className="text-center mb-16">
          <p className="text-[#34F5A3] text-sm font-semibold uppercase tracking-widest mb-3">
            Просто и быстро
          </p>
          <h2 className="text-4xl sm:text-5xl font-black text-[#F8FAFC] mb-4">
            Как{' '}
            <span className="text-[#34F5A3]">начать работу</span>
          </h2>
          <p className="text-[#94A3B8] text-lg max-w-xl mx-auto">
            5 простых шагов — и вы уже в системе с доступом к реальным объектам.
          </p>
        </AnimatedSection>

        <div className="max-w-3xl mx-auto">
          <div className="relative">
            {/* Vertical line */}
            <div
              className="absolute left-6 top-0 bottom-0 w-0.5 hidden sm:block"
              style={{
                background:
                  'linear-gradient(180deg, #34F5A3, #38BDF8, #FACC15, #34F5A3, #38BDF8)',
                opacity: 0.3,
              }}
            />

            <div className="space-y-6">
              {steps.map((step, i) => (
                <AnimatedSection key={i} delay={i * 120} direction="left">
                  <div className="relative flex items-start gap-5 sm:gap-6 glass rounded-2xl p-5 hover:scale-[1.02] transition-all duration-300 group">
                    {/* Step number dot on line */}
                    <div
                      className="relative z-10 w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110"
                      style={{
                        background: `${step.color}15`,
                        border: `1px solid ${step.color}40`,
                      }}
                    >
                      {step.icon}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <span
                          className="text-xs font-black uppercase tracking-widest"
                          style={{ color: step.color }}
                        >
                          ШАГ {step.number}
                        </span>
                      </div>
                      <h3 className="text-[#F8FAFC] font-bold text-lg mb-1">{step.title}</h3>
                      <p className="text-[#94A3B8] text-sm leading-relaxed">{step.desc}</p>
                    </div>

                    {/* Arrow */}
                    <ArrowRight
                      size={18}
                      className="text-[#94A3B8]/40 flex-shrink-0 mt-1 group-hover:text-[#34F5A3]/60 transition-colors"
                    />
                  </div>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <AnimatedSection delay={700} className="text-center mt-14">
          <NeonButton href={botUrl} variant="primary" size="xl">
            Начать работу прямо сейчас
            <ArrowRight size={22} />
          </NeonButton>
          <p className="text-[#94A3B8] text-sm mt-4">
            Регистрация занимает 2 минуты. Первый объект — уже сегодня.
          </p>
        </AnimatedSection>
      </div>

      <div className="neon-line absolute bottom-0 left-0 right-0" />
    </section>
  );
};

export default HowToStart;
