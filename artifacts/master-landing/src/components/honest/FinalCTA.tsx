import { Rocket, Shield, Zap } from 'lucide-react';
import { openHonestBot } from '../../utils/openHonestBot';

export default function FinalCTA() {
  return (
    <section className="py-20 px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-honest-dark via-honest-darker to-black z-0"></div>
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(52,245,163,0.1)_0%,transparent_70%)] z-0"></div>
      
      <div className="max-w-6xl mx-auto relative z-10 text-center">
        <div className="inline-flex items-center gap-3 bg-honest-dark/40 backdrop-blur-sm border border-honest-primary/20 rounded-full px-6 py-3 mb-8">
          <Rocket className="w-5 h-5 text-honest-primary" />
          <span className="text-honest-primary font-semibold">Готовы изменить способ заработка?</span>
        </div>

        <h2 className="text-5xl md:text-6xl font-bold mb-8">
          <span className="text-white">Присоединяйтесь к </span>
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-honest-primary via-honest-accent to-honest-secondary">
            Честному Мастеру
          </span>
        </h2>

        <p className="text-2xl text-honest-light max-w-3xl mx-auto mb-12">
          Начните получать прямые заказы от клиентов, автоматизируйте поиск проектов и зарабатывайте до 85% от суммы заказа.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          <div className="bg-honest-dark/40 backdrop-blur-sm border border-honest-primary/10 rounded-2xl p-8">
            <div className="inline-flex p-4 bg-honest-primary/20 rounded-xl text-honest-primary mb-4">
              <Zap className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Быстрый старт</h3>
            <p className="text-honest-light">Первый заказ через 2–4 часа после регистрации</p>
          </div>
          <div className="bg-honest-dark/40 backdrop-blur-sm border border-honest-primary/10 rounded-2xl p-8">
            <div className="inline-flex p-4 bg-honest-accent/20 rounded-xl text-honest-accent mb-4">
              <Shield className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Полная защита</h3>
            <p className="text-honest-light">Гарантия оплаты и юридическое сопровождение</p>
          </div>
          <div className="bg-honest-dark/40 backdrop-blur-sm border border-honest-primary/10 rounded-2xl p-8">
            <div className="inline-flex p-4 bg-honest-secondary/20 rounded-xl text-honest-secondary mb-4">
              <Rocket className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Рост доходов</h3>
            <p className="text-honest-light">Стабильное увеличение заработка с каждым месяцем</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-6 justify-center items-center mb-20">
          <button
            onClick={() => openHonestBot()}
            className="group relative px-10 py-5 bg-honest-primary text-honest-dark font-bold text-xl rounded-2xl hover:shadow-2xl hover:shadow-honest-primary/40 transition-all duration-300 hover:scale-105"
          >
            <span className="flex items-center gap-3">
              Начать зарабатывать
              <Rocket className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
            </span>
            <div className="absolute -inset-1 rounded-2xl bg-honest-primary/20 blur-xl -z-10 group-hover:blur-2xl transition-all"></div>
          </button>
          
          <button
            onClick={() => openHonestBot('honest-landing-final')}
            className="px-10 py-5 border-2 border-honest-primary text-honest-primary font-semibold text-xl rounded-2xl hover:bg-honest-primary/10 hover:border-honest-primary/50 transition-all"
          >
            Узнать подробности
          </button>
        </div>

        <div className="border-t border-honest-primary/10 pt-12">
          <p className="text-honest-light">
            <span className="text-white font-semibold">Уже более 5 000 мастеров</span>
            <span className="mx-3">•</span>
            <span className="text-white font-semibold">Средний рейтинг 4.9/5</span>
            <span className="mx-3">•</span>
            <span className="text-white font-semibold">Выплачено более 250 млн ₽</span>
          </p>
          <p className="text-honest-light mt-4">
            Присоединяйтесь к сообществу профессионалов, которые ценят своё время и expertise.
          </p>
        </div>
      </div>
    </section>
  );
}