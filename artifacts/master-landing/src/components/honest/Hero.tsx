import { ArrowRight, Sparkles } from 'lucide-react';
import { openHonestBot } from '../../utils/openHonestBot';

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden px-4 py-20">
      <div className="absolute inset-0 bg-gradient-to-br from-honest-dark via-honest-darker to-black z-0"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(52,245,163,0.15)_0%,transparent_50%)] z-0"></div>
      
      <div className="relative z-10 max-w-6xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 bg-honest-dark/30 backdrop-blur-sm border border-honest-primary/20 rounded-full px-4 py-2 mb-8">
          <Sparkles className="w-4 h-4 text-honest-primary" />
          <span className="text-sm text-honest-primary font-medium">Новая биржа для мастеров</span>
        </div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-honest-primary via-honest-accent to-honest-secondary">
            Честный Мастер
          </span>
          <br />
          <span className="text-white">технологичная биржа заказов</span>
        </h1>

        <p className="text-xl text-honest-light max-w-3xl mx-auto mb-10">
          Прямые заказы от клиентов, автоматический подбор, честные условия и выплаты 
          <span className="text-honest-primary font-semibold"> до 85% от суммы заказа</span>.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
          <button
            onClick={() => openHonestBot()}
            className="group relative px-8 py-4 bg-honest-primary text-honest-dark font-bold rounded-xl hover:shadow-2xl hover:shadow-honest-primary/30 transition-all duration-300 hover:scale-105"
          >
            <span className="flex items-center gap-2">
              Начать зарабатывать
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </span>
            <div className="absolute -inset-1 rounded-xl bg-honest-primary/20 blur-xl -z-10 group-hover:blur-2xl transition-all"></div>
          </button>
          
          <button
            onClick={() => openHonestBot('honest-landing-learn')}
            className="px-8 py-4 border-2 border-honest-primary/30 text-honest-primary font-semibold rounded-xl hover:bg-honest-primary/10 hover:border-honest-primary/50 transition-all"
          >
            Узнать подробнее
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
          <div className="bg-honest-dark/40 backdrop-blur-sm border border-honest-primary/10 rounded-xl p-4">
            <div className="text-3xl font-bold text-honest-primary">85%</div>
            <div className="text-sm text-honest-light">доход мастера</div>
          </div>
          <div className="bg-honest-dark/40 backdrop-blur-sm border border-honest-primary/10 rounded-xl p-4">
            <div className="text-3xl font-bold text-honest-primary">24ч</div>
            <div className="text-sm text-honest-light">выплаты</div>
          </div>
          <div className="bg-honest-dark/40 backdrop-blur-sm border border-honest-primary/10 rounded-xl p-4">
            <div className="text-3xl font-bold text-honest-primary">0₽</div>
            <div className="text-sm text-honest-light">вступительный взнос</div>
          </div>
          <div className="bg-honest-dark/40 backdrop-blur-sm border border-honest-primary/10 rounded-xl p-4">
            <div className="text-3xl font-bold text-honest-primary">100%</div>
            <div className="text-sm text-honest-light">прямые заказы</div>
          </div>
        </div>
      </div>
    </section>
  );
}