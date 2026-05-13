import { PieChart, DollarSign, TrendingUp } from 'lucide-react';

export default function Model() {
  return (
    <section className="py-20 px-4 bg-gradient-to-b from-honest-darker to-honest-dark relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-honest-primary/5 rounded-full blur-3xl"></div>
      
      <div className="max-w-6xl mx-auto relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            <span className="text-white">Модель </span>
            <span className="text-honest-primary">доходов</span>
          </h2>
          <p className="text-xl text-honest-light max-w-3xl mx-auto">
            Самый выгодный процент на рынке — 85% от суммы заказа остаётся у вас.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="relative">
            <div className="bg-honest-dark/40 backdrop-blur-sm border border-honest-primary/10 rounded-2xl p-8">
              <div className="flex items-center justify-between mb-8">
                <div className="text-left">
                  <div className="text-5xl font-bold text-honest-primary">85%</div>
                  <div className="text-honest-light mt-2">мастеру</div>
                </div>
                <div className="text-left">
                  <div className="text-3xl font-bold text-honest-accent">15%</div>
                  <div className="text-honest-light mt-2">платформе</div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-honest-primary/20 rounded-lg">
                    <DollarSign className="w-5 h-5 text-honest-primary" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">Никаких скрытых комиссий</div>
                    <div className="text-sm text-honest-light">Комиссия фиксированная и известна заранее</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-2 bg-honest-accent/20 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-honest-accent" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">Выплаты каждые 24 часа</div>
                    <div className="text-sm text-honest-light">Деньги поступают на карту после завершения заказа</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-2 bg-honest-secondary/20 rounded-lg">
                    <PieChart className="w-5 h-5 text-honest-secondary" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">Динамический рейтинг</div>
                    <div className="text-sm text-honest-light">Чем выше рейтинг — тем больше заказов и выше процент</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-2xl font-bold text-white mb-6">Пример расчёта</h3>
            <div className="space-y-6">
              <div className="bg-honest-dark/60 border border-honest-primary/10 rounded-xl p-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-honest-light">Заказ</span>
                  <span className="text-xl font-bold text-white">5 000 ₽</span>
                </div>
                <div className="h-2 bg-honest-dark rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-honest-primary to-honest-accent" style={{ width: '85%' }}></div>
                </div>
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-honest-primary">4 250 ₽ мастеру</span>
                  <span className="text-honest-accent">750 ₽ платформе</span>
                </div>
              </div>

              <div className="bg-honest-dark/60 border border-honest-primary/10 rounded-xl p-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-honest-light">Заказ</span>
                  <span className="text-xl font-bold text-white">15 000 ₽</span>
                </div>
                <div className="h-2 bg-honest-dark rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-honest-primary to-honest-accent" style={{ width: '85%' }}></div>
                </div>
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-honest-primary">12 750 ₽ мастеру</span>
                  <span className="text-honest-accent">2 250 ₽ платформе</span>
                </div>
              </div>

              <div className="bg-honest-dark/60 border border-honest-primary/10 rounded-xl p-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-honest-light">Заказ</span>
                  <span className="text-xl font-bold text-white">50 000 ₽</span>
                </div>
                <div className="h-2 bg-honest-dark rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-honest-primary to-honest-accent" style={{ width: '85%' }}></div>
                </div>
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-honest-primary">42 500 ₽ мастеру</span>
                  <span className="text-honest-accent">7 500 ₽ платформе</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}