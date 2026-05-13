import { Shield, Zap, Users, BarChart } from 'lucide-react';

export default function System() {
  const features = [
    {
      icon: <Shield className="w-8 h-8" />,
      title: 'Защищённые сделки',
      description: 'Гарантия оплаты после выполнения работы. Деньги хранятся на платформе до подтверждения клиентом.',
    },
    {
      icon: <Zap className="w-8 h-8" />,
      title: 'Автоматический подбор',
      description: 'Система AI подбирает подходящие заказы по вашим навыкам и рейтингу. Никаких ручных поисков.',
    },
    {
      icon: <Users className="w-8 h-8" />,
      title: 'Прямые заказы',
      description: 'Общайтесь напрямую с клиентами без посредников. Полная прозрачность и контроль над проектом.',
    },
    {
      icon: <BarChart className="w-8 h-8" />,
      title: 'Аналитика и рост',
      description: 'Подробная статистика по выполненным заказам, рейтинговая система и рекомендации для роста доходов.',
    },
  ];

  return (
    <section className="py-20 px-4 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-honest-darker/50 z-0"></div>
      
      <div className="max-w-6xl mx-auto relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            <span className="text-white">Как работает </span>
            <span className="text-honest-primary">система</span>
          </h2>
          <p className="text-xl text-honest-light max-w-3xl mx-auto">
            Технологичная платформа, которая соединяет мастеров с клиентами, автоматизирует процессы и гарантирует честные условия.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feat, idx) => (
            <div
              key={idx}
              className="group relative bg-honest-dark/40 backdrop-blur-sm border border-honest-primary/10 rounded-2xl p-6 hover:border-honest-primary/30 hover:shadow-honest-glow transition-all duration-300"
            >
              <div className="absolute -inset-1 bg-gradient-to-r from-honest-primary/10 to-honest-accent/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity -z-10"></div>
              
              <div className="mb-4 inline-flex p-3 bg-honest-dark/60 rounded-xl text-honest-primary">
                {feat.icon}
              </div>
              <h3 className="text-xl font-bold text-white mb-3">{feat.title}</h3>
              <p className="text-honest-light">{feat.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-20 text-center">
          <div className="inline-block px-6 py-3 bg-honest-dark/60 border border-honest-primary/20 rounded-full">
            <span className="text-honest-primary font-semibold">Среднее время получения первого заказа:</span>
            <span className="text-white ml-2 font-bold">2-4 часа</span>
          </div>
        </div>
      </div>
    </section>
  );
}