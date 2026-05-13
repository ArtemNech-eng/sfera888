import { Check, X } from 'lucide-react';
import { openHonestBot } from '../../utils/openHonestBot';

export default function Pricing() {
  const plans = [
    {
      name: 'Стандарт',
      price: '0 ₽',
      description: 'Базовый доступ ко всем функциям',
      features: [
        'Регистрация и создание профиля',
        'Доступ к базе заказов',
        'Автоматический подбор',
        'Чат с клиентами',
        'Выплаты каждые 24 часа',
        'Поддержка 24/7',
      ],
      notIncluded: ['Приоритетный показ в поиске', 'Персональный менеджер'],
      cta: 'Начать бесплатно',
      ref: 'honest-landing-standard',
    },
    {
      name: 'Профи',
      price: '500 ₽',
      period: '/месяц',
      description: 'Для растущих мастеров',
      popular: true,
      features: [
        'Всё из плана Стандарт',
        'Приоритетный показ в поиске',
        'Персональный менеджер',
        'Расширенная аналитика',
        'Ранний доступ к новым функциям',
        'Снижение комиссии до 12%',
      ],
      notIncluded: [],
      cta: 'Попробовать 7 дней бесплатно',
      ref: 'honest-landing-pro',
    },
  ];

  return (
    <section className="py-20 px-4 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-honest-dark to-honest-darker z-0"></div>
      
      <div className="max-w-6xl mx-auto relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            <span className="text-white">Тарифы и </span>
            <span className="text-honest-primary">условия</span>
          </h2>
          <p className="text-xl text-honest-light max-w-3xl mx-auto">
            Начните без вложений и платите только когда зарабатываете.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {plans.map((plan, idx) => (
            <div
              key={idx}
              className={`relative rounded-2xl p-8 border-2 ${
                plan.popular
                  ? 'border-honest-primary bg-honest-dark/60'
                  : 'border-honest-primary/20 bg-honest-dark/40'
              } backdrop-blur-sm`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-honest-primary text-honest-dark font-bold px-4 py-1 rounded-full">
                  Популярный
                </div>
              )}
              
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-white">{plan.name}</h3>
                <div className="flex items-baseline mt-2">
                  <span className="text-4xl font-bold text-white">{plan.price}</span>
                  {plan.period && <span className="text-honest-light ml-2">{plan.period}</span>}
                </div>
                <p className="text-honest-light mt-2">{plan.description}</p>
              </div>

              <ul className="space-y-4 mb-8">
                {plan.features.map((feat, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <div className="p-1 bg-honest-primary/20 rounded">
                      <Check className="w-4 h-4 text-honest-primary" />
                    </div>
                    <span className="text-white">{feat}</span>
                  </li>
                ))}
                {plan.notIncluded.map((not, i) => (
                  <li key={i} className="flex items-center gap-3 text-honest-muted">
                    <div className="p-1 bg-honest-muted/20 rounded">
                      <X className="w-4 h-4" />
                    </div>
                    <span>{not}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => openHonestBot(plan.ref)}
                className={`w-full py-3 font-bold rounded-xl transition-all ${
                  plan.popular
                    ? 'bg-honest-primary text-honest-dark hover:shadow-honest-glow-lg'
                    : 'bg-honest-dark border-2 border-honest-primary text-honest-primary hover:bg-honest-primary/10'
                }`}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center">
          <div className="inline-block px-6 py-4 bg-honest-dark/60 border border-honest-primary/20 rounded-2xl max-w-2xl mx-auto">
            <p className="text-honest-light">
              <span className="text-honest-primary font-semibold">Гарантия возврата:</span>
              <span className="text-white ml-2">
                Если за первый месяц вы не получите ни одного заказа — вернём плату за тариф «Профи».
              </span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}