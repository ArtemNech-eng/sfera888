import { Search, DollarSign, Shield, TrendingUp, Layout, BarChart3 } from 'lucide-react';

const benefits = [
  {
    icon: Search,
    title: 'Без поиска клиентов',
    description:
      'Не нужно тратить время и деньги на рекламу и постоянные отклики',
  },
  {
    icon: DollarSign,
    title: 'Работаете по своим ценам',
    description:
      'Вы сами считаете смету и называете стоимость работ. Главное — быть в рынке',
  },
  {
    icon: Shield,
    title: 'Система брони через предоплату',
    description:
      'Клиент вносит предоплату, и вы понимаете что заказ реальный. Никаких пустых замеров',
  },
  {
    icon: TrendingUp,
    title: 'Лучшим — больше заказов',
    description:
      'Чем выше конверсия, тем раньше вы получаете заявки. Топ-мастера получают самые крупные объекты',
  },
  {
    icon: Layout,
    title: 'Понятный процесс',
    description:
      'Все этапы видны в приложении: заявка, смета, предоплата, работа',
  },
  {
    icon: BarChart3,
    title: 'Стабильный заработок',
    description:
      'Без простоев между объектами и без хаоса в заказах. Сдали объект — сразу взяли следующий',
  },
];

export default function WhyBeneficial() {
  return (
    <section className="section-bg py-20 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-extrabold text-[#1A1A1A]">
            Почему мастерам выгодно работать с нами
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {benefits.map((benefit) => {
            const Icon = benefit.icon;
            return (
              <div key={benefit.title} className="card flex flex-col gap-3">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: 'rgba(52,199,89,0.1)' }}
                >
                  <Icon size={20} color="#34C759" strokeWidth={2} />
                </div>
                <h3 className="text-base font-bold text-[#1A1A1A]">{benefit.title}</h3>
                <p className="text-sm text-[#8E8E93] leading-relaxed">{benefit.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
