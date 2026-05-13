import { TrendingUp, Calendar, Target } from 'lucide-react';

export default function Earnings() {
  const examples = [
    { skill: 'Разработка сайтов', monthly: '80 000 – 150 000 ₽', projects: '3–5' },
    { skill: 'Дизайн интерфейсов', monthly: '60 000 – 120 000 ₽', projects: '4–8' },
    { skill: 'Копирайтинг', monthly: '40 000 – 90 000 ₽', projects: '10–20' },
    { skill: 'SEO‑оптимизация', monthly: '70 000 – 130 000 ₽', projects: '2–4' },
    { skill: 'Мобильная разработка', monthly: '100 000 – 200 000 ₽', projects: '2–3' },
    { skill: 'Техническая поддержка', monthly: '50 000 – 90 000 ₽', projects: '5–10' },
  ];

  return (
    <section className="py-20 px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-honest-dark to-honest-darker z-0"></div>
      <div className="absolute -left-20 top-1/3 w-64 h-64 bg-honest-accent/5 rounded-full blur-3xl"></div>
      
      <div className="max-w-6xl mx-auto relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            <span className="text-white">Сколько можно </span>
            <span className="text-honest-primary">зарабатывать</span>
          </h2>
          <p className="text-xl text-honest-light max-w-3xl mx-auto">
            Реальные доходы мастеров на платформе в зависимости от специализации и активности.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {examples.map((ex, idx) => (
            <div
              key={idx}
              className="bg-honest-dark/40 backdrop-blur-sm border border-honest-primary/10 rounded-2xl p-6 hover:border-honest-primary/30 transition-all"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white">{ex.skill}</h3>
                <Target className="w-5 h-5 text-honest-primary" />
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-honest-light">Доход в месяц:</span>
                  <span className="text-2xl font-bold text-honest-primary">{ex.monthly}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-honest-light">Заказов в месяц:</span>
                  <span className="text-white font-semibold">{ex.projects}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-20">
          <div>
            <h3 className="text-2xl font-bold text-white mb-6">
              <TrendingUp className="inline-block w-8 h-8 text-honest-primary mr-3" />
              Динамика роста доходов
            </h3>
            <div className="space-y-6">
              <div className="relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-honest-light">Первый месяц</span>
                  <span className="text-white font-bold">25 000 – 40 000 ₽</span>
                </div>
                <div className="h-3 bg-honest-dark rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-honest-primary to-honest-accent" style={{ width: '30%' }}></div>
                </div>
              </div>
              <div className="relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-honest-light">Третий месяц</span>
                  <span className="text-white font-bold">60 000 – 90 000 ₽</span>
                </div>
                <div className="h-3 bg-honest-dark rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-honest-primary to-honest-accent" style={{ width: '65%' }}></div>
                </div>
              </div>
              <div className="relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-honest-light">Шестой месяц</span>
                  <span className="text-white font-bold">100 000 – 180 000 ₽</span>
                </div>
                <div className="h-3 bg-honest-dark rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-honest-primary to-honest-accent" style={{ width: '100%' }}></div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-honest-dark/40 backdrop-blur-sm border border-honest-primary/10 rounded-2xl p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-honest-primary/20 rounded-xl">
                <Calendar className="w-8 h-8 text-honest-primary" />
              </div>
              <div>
                <h4 className="text-xl font-bold text-white">Регулярные заказы</h4>
                <p className="text-honest-light">Постоянные клиенты после успешного выполнения проектов</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-honest-light">Средняя стоимость заказа</span>
                <span className="text-white font-bold">8 500 ₽</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-honest-light">Среднее время выполнения</span>
                <span className="text-white font-bold">3–7 дней</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-honest-light">Повторные обращения клиентов</span>
                <span className="text-white font-bold">68%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center">
          <div className="inline-block px-8 py-4 bg-honest-dark/60 border border-honest-primary/20 rounded-2xl">
            <p className="text-xl text-white">
              <span className="text-honest-primary font-bold">Вывод:</span>
              <span className="ml-3">
                Активный мастер может выйти на стабильный доход{' '}
                <span className="text-honest-primary font-bold">от 100 000 ₽ в месяц</span> уже через 3–6 месяцев работы на платформе.
              </span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}