import React from 'react';
import { Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';
import AnimatedSection from './AnimatedSection';

interface PricingProps {
  botUrl: string;
}

const Pricing: React.FC<PricingProps> = ({ botUrl }) => {
  const plans = [
    {
      name: 'Пакет СТАРТ',
      price: '5 000',
      tokens: 1,
      pricePerOrder: '5 000',
      desc: 'Идеально для входа в рабочий ритм.',
      color: '#38BDF8',
      colorBg: 'rgba(56,189,248,0.08)',
      colorBorder: 'rgba(56,189,248,0.25)',
      colorGlow: 'rgba(56,189,248,0.3)',
      featured: false,
      features: [
        '1 заказ (токен)',
        'Доступ к ленте объектов',
        'Поддержка в боте',
      ],
    },
    {
      name: 'Пакет ПРОФИ',
      price: '20 000',
      tokens: 5,
      pricePerOrder: '4 000',
      desc: 'Всего 4 000 ₽ за заказ. Хватит на месяц стабильной работы.',
      color: '#34F5A3',
      colorBg: 'rgba(52,245,163,0.08)',
      colorBorder: 'rgba(52,245,163,0.35)',
      colorGlow: 'rgba(52,245,163,0.4)',
      featured: true,
      features: [
        '5 заказов (токенов)',
        'Доступ к ленте объектов',
        'Приоритетная поддержка',
        'Экономия 5 000 ₽',
      ],
    },
    {
      name: 'Пакет МАКСИМУМ',
      price: '30 000',
      tokens: 10,
      pricePerOrder: '3 000',
      desc: 'Для сильных мастеров. Цена заказа — всего 3 000 ₽.',
      color: '#FACC15',
      colorBg: 'rgba(250,204,21,0.08)',
      colorBorder: 'rgba(250,204,21,0.25)',
      colorGlow: 'rgba(250,204,21,0.3)',
      featured: false,
      features: [
        '10 заказов (токенов)',
        'Доступ к ленте объектов',
        'Приоритетная поддержка',
        'Максимальная экономия 20 000 ₽',
      ],
    },
  ];

  return (
    <section id="pricing" className="relative py-24 bg-[#0F172A] overflow-hidden">
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            'linear-gradient(rgba(52,245,163,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(52,245,163,0.03) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <AnimatedSection className="text-center mb-16">
          <p className="text-[#FACC15] text-sm font-semibold uppercase tracking-widest mb-3">
            Прозрачные тарифы
          </p>
          <h2 className="text-4xl sm:text-5xl font-black text-[#F8FAFC] mb-4">
            Тарифы после{' '}
            <span className="text-[#FACC15]">тестового периода</span>
          </h2>
          <p className="text-[#94A3B8] text-lg max-w-2xl mx-auto">
            Выберите пакет — и сразу начинайте работать. Никаких скрытых комиссий, никаких
            процентов с ваших заработков.
          </p>
        </AnimatedSection>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-stretch">
          {plans.map((plan, i) => (
            <AnimatedSection key={i} delay={i * 100} direction="up">
              <div
                className="relative h-full rounded-3xl p-0.5 transition-all duration-300 hover:scale-[1.02]"
                style={{
                  background: plan.featured
                    ? `linear-gradient(135deg, ${plan.color}60, ${plan.color}20, transparent)`
                    : `linear-gradient(135deg, ${plan.colorBorder}, transparent)`,
                  boxShadow: plan.featured
                    ? `0 0 40px ${plan.colorGlow}, 0 0 80px ${plan.colorGlow}50`
                    : 'none',
                }}
              >
                {/* Featured badge */}
                {plan.featured && (
                  <div
                    className="absolute -top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold text-[#0B0F14] z-10"
                    style={{ background: plan.color }}
                  >
                    <Sparkles size={12} />
                    ХИТ — ВЫБОР МАСТЕРОВ
                  </div>
                )}

                <div
                  className="h-full rounded-[22px] p-7 flex flex-col"
                  style={{
                    background: plan.featured
                      ? `linear-gradient(160deg, ${plan.colorBg}, #111827)`
                      : '#111827',
                  }}
                >
                  {/* Plan name */}
                  <div className="mb-6">
                    <h3
                      className="text-xl font-black mb-1"
                      style={{ color: plan.color }}
                    >
                      {plan.name}
                    </h3>
                    <p className="text-[#94A3B8] text-sm">{plan.desc}</p>
                  </div>

                  {/* Price */}
                  <div className="mb-2">
                    <div className="flex items-end gap-2">
                      <span className="text-5xl font-black text-[#F8FAFC]">
                        {plan.price}
                      </span>
                      <span className="text-[#94A3B8] text-lg mb-1">₽</span>
                    </div>
                    <div
                      className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs font-semibold"
                      style={{
                        background: `${plan.colorBg}`,
                        border: `1px solid ${plan.colorBorder}`,
                        color: plan.color,
                      }}
                    >
                      {plan.tokens} {plan.tokens === 1 ? 'заказ' : plan.tokens < 5 ? 'заказа' : 'заказов'} ·{' '}
                      {plan.pricePerOrder} ₽ / заказ
                    </div>
                  </div>

                  <div
                    className="h-px my-5"
                    style={{
                      background: `linear-gradient(90deg, ${plan.color}40, transparent)`,
                    }}
                  />

                  {/* Features */}
                  <ul className="space-y-3 mb-8 flex-1">
                    {plan.features.map((f, j) => (
                      <li key={j} className="flex items-center gap-2.5">
                        <CheckCircle2
                          size={16}
                          style={{ color: plan.color }}
                          className="flex-shrink-0"
                        />
                        <span className="text-[#F8FAFC] text-sm">{f}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <a
                    href={botUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3.5 rounded-xl font-bold text-sm text-center flex items-center justify-center gap-2 transition-all duration-300 hover:scale-105 active:scale-95"
                    style={{
                      background: plan.featured ? plan.color : 'transparent',
                      color: plan.featured ? '#0B0F14' : plan.color,
                      border: `1px solid ${plan.colorBorder}`,
                      boxShadow: plan.featured
                        ? `0 0 20px ${plan.colorGlow}`
                        : 'none',
                    }}
                  >
                    Выбрать пакет
                    <ArrowRight size={16} />
                  </a>
                </div>
              </div>
            </AnimatedSection>
          ))}
        </div>

        {/* Note */}
        <AnimatedSection delay={400} className="text-center mt-10">
          <p className="text-[#94A3B8] text-sm">
            💡 Токены не сгорают. Если клиент сорвался не по вашей вине — токен возвращается на баланс.
          </p>
        </AnimatedSection>
      </div>

      <div className="neon-line absolute bottom-0 left-0 right-0" />
    </section>
  );
};

export default Pricing;
