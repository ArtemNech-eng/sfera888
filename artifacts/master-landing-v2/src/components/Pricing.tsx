import React, { useEffect, useState } from 'react';
import { Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';
import AnimatedSection from './AnimatedSection';

interface PricingProps {
  botUrl: string;
}

interface ApiPackage {
  id: number;
  name: string;
  tokens_count: number;
  price_rub: number;
  price_per_token: number;
}

interface Plan {
  name: string;
  price: string;
  tokens: number;
  orders: number;
  pricePerOrder: string;
  desc: string;
  color: string;
  colorBg: string;
  colorBorder: string;
  colorGlow: string;
  featured: boolean;
  features: string[];
}

const COLOR_SCHEMES = [
  { color: '#3B82F6', colorBg: 'rgba(59,130,246,0.05)', colorBorder: 'rgba(59,130,246,0.2)', colorGlow: 'rgba(59,130,246,0.1)' },
  { color: '#10B981', colorBg: 'rgba(16,185,129,0.05)', colorBorder: 'rgba(16,185,129,0.25)', colorGlow: 'rgba(16,185,129,0.1)' },
  { color: '#F59E0B', colorBg: 'rgba(245,158,11,0.05)', colorBorder: 'rgba(245,158,11,0.2)', colorGlow: 'rgba(245,158,11,0.1)' },
];

function fmt(n: number) {
  return n.toLocaleString('ru-RU');
}

function tokenWord(n: number) {
  if (n === 1) return 'заказ (токен)';
  if (n < 5) return `заказа (токена)`;
  return `заказов (токенов)`;
}

function orderWord(n: number) {
  if (n === 1) return 'заказ';
  if (n < 5) return 'заказа';
  return 'заказов';
}

function apiToPlans(pkgs: ApiPackage[]): Plan[] {
  const baseRate = pkgs.length > 0 ? pkgs[0].price_per_token : 0;
  const midIdx = Math.floor((pkgs.length - 1) / 2);
  return pkgs.map((pkg, i) => {
    const scheme = COLOR_SCHEMES[Math.min(i, COLOR_SCHEMES.length - 1)];
    const featured = pkgs.length > 1 && i === midIdx;
    const orders = Math.round(pkg.tokens_count / 2);
    const pricePerOrder = Math.round(pkg.price_per_token * 2);
    const savings = pkg.tokens_count > 1 && baseRate > pkg.price_per_token
      ? `Экономия ${fmt(Math.round((baseRate - pkg.price_per_token) * pkg.tokens_count))} ₽`
      : null;
    const features: string[] = [
      `${pkg.tokens_count} ${tokenWord(pkg.tokens_count)}`,
      'Доступ к ленте объектов',
      pkg.tokens_count > 1 ? 'Приоритетная поддержка' : 'Поддержка в боте',
    ];
    if (savings) features.push(savings);
    return {
      name: `Пакет ${pkg.name.toUpperCase()}`,
      price: fmt(pkg.price_rub),
      tokens: pkg.tokens_count,
      orders,
      pricePerOrder: fmt(pricePerOrder),
      desc: orders === 1
        ? 'Идеально для входа в рабочий ритм.'
        : featured
        ? `Всего ${fmt(pricePerOrder)} ₽ за заказ. Оптимальный выбор.`
        : `Для активных мастеров. Цена заказа — всего ${fmt(pricePerOrder)} ₽.`,
      ...scheme,
      featured,
      features,
    };
  });
}

const FALLBACK_PLANS: Plan[] = [
  { name: 'Пакет СТАРТ', price: '5 000', tokens: 4, orders: 2, pricePerOrder: '2 500', desc: 'Идеально для входа в рабочий ритм.', color: '#3B82F6', colorBg: 'rgba(59,130,246,0.05)', colorBorder: 'rgba(59,130,246,0.2)', colorGlow: 'rgba(59,130,246,0.1)', featured: false, features: ['4 токена (2 заказа)', 'Доступ к ленте объектов', 'Поддержка в боте'] },
  { name: 'Пакет ОПТИМА', price: '10 000', tokens: 8, orders: 4, pricePerOrder: '2 500', desc: 'Всего 2 500 ₽ за заказ. Оптимальный выбор.', color: '#10B981', colorBg: 'rgba(16,185,129,0.05)', colorBorder: 'rgba(16,185,129,0.25)', colorGlow: 'rgba(16,185,129,0.1)', featured: true, features: ['8 токенов (4 заказа)', 'Доступ к ленте объектов', 'Приоритетная поддержка'] },
  { name: 'Пакет ПРОФИ', price: '25 000', tokens: 20, orders: 10, pricePerOrder: '2 500', desc: 'Для активных мастеров. Цена заказа — всего 2 500 ₽.', color: '#F59E0B', colorBg: 'rgba(245,158,11,0.05)', colorBorder: 'rgba(245,158,11,0.2)', colorGlow: 'rgba(245,158,11,0.1)', featured: false, features: ['20 токенов (10 заказов)', 'Доступ к ленте объектов', 'Приоритетная поддержка'] },
];

const Pricing: React.FC<PricingProps> = ({ botUrl }) => {
  const [plans, setPlans] = useState<Plan[]>(FALLBACK_PLANS);

  useEffect(() => {
    fetch('/api/settings/token-packages/public')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((pkgs: ApiPackage[]) => { if (pkgs.length > 0) setPlans(apiToPlans(pkgs)); })
      .catch(() => { /* keep fallback */ });
  }, []);

  return (
    <section id="pricing" className="relative py-24 bg-white overflow-hidden">
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            'linear-gradient(rgba(16,185,129,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.04) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <AnimatedSection className="text-center mb-16">
          <p className="text-[#10B981] text-sm font-semibold uppercase tracking-widest mb-3">
            Прозрачные тарифы
          </p>
          <h2 className="text-4xl sm:text-5xl font-black text-[#0F172A] mb-4">
            Тарифы после{' '}
            <span className="text-[#10B981]">тестового периода</span>
          </h2>
          <p className="text-[#64748B] text-lg max-w-2xl mx-auto">
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
                    ? `linear-gradient(135deg, ${plan.color}30, ${plan.color}10, transparent)`
                    : `linear-gradient(135deg, ${plan.colorBorder}, transparent)`,
                  boxShadow: plan.featured
                    ? `0 8px 32px ${plan.colorGlow}`
                    : '0 1px 3px rgba(0,0,0,0.06)',
                }}
              >
                {/* Featured badge */}
                {plan.featured && (
                  <div
                    className="absolute -top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold text-white z-10"
                    style={{ background: plan.color }}
                  >
                    <Sparkles size={12} />
                    ХИТ — ВЫБОР МАСТЕРОВ
                  </div>
                )}

                <div
                  className="h-full rounded-[22px] p-7 flex flex-col"
                  style={{
                    background: '#FFFFFF',
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
                    <p className="text-[#64748B] text-sm">{plan.desc}</p>
                  </div>

                  {/* Price */}
                  <div className="mb-2">
                    <div className="flex items-end gap-2">
                      <span className="text-5xl font-black text-[#0F172A]">
                        {plan.price}
                      </span>
                      <span className="text-[#64748B] text-lg mb-1">₽</span>
                    </div>
                    <div
                      className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs font-semibold"
                      style={{
                        background: `${plan.colorBg}`,
                        border: `1px solid ${plan.colorBorder}`,
                        color: plan.color,
                      }}
                    >
                      {plan.orders} {plan.orders === 1 ? 'заказ' : plan.orders < 5 ? 'заказа' : 'заказов'} ({plan.tokens} {plan.tokens === 1 ? 'токен' : plan.tokens < 5 ? 'токена' : 'токенов'}) ·{' '}
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
                        <span className="text-[#374151] text-sm">{f}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <a
                    href={botUrl}
                    className="w-full py-3.5 rounded-xl font-bold text-sm text-center flex items-center justify-center gap-2 transition-all duration-300 hover:scale-105 active:scale-95"
                    style={{
                      background: plan.featured ? plan.color : 'transparent',
                      color: plan.featured ? '#FFFFFF' : plan.color,
                      border: `1px solid ${plan.colorBorder}`,
                      boxShadow: plan.featured ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
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
          <p className="text-[#64748B] text-sm">
            💡 Токены не сгорают. Если клиент сорвался не по вашей вине — токен возвращается на баланс.
          </p>
        </AnimatedSection>
      </div>

      <div className="neon-line absolute bottom-0 left-0 right-0" />
    </section>
  );
};

export default Pricing;
