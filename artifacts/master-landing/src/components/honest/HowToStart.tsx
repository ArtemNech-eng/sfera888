import { UserPlus, FolderOpen, MessageSquare, CreditCard, Star } from 'lucide-react';
import { openHonestBot } from '../../utils/openHonestBot';

export default function HowToStart() {
  const steps = [
    {
      icon: <UserPlus className="w-8 h-8" />,
      title: 'Регистрация',
      description: 'Заполните простую форму, подтвердите email и телефон.',
      time: '2–5 минут',
    },
    {
      icon: <FolderOpen className="w-8 h-8" />,
      title: 'Создание профиля',
      description: 'Добавьте специализации, портфолио, укажите ставку и доступность.',
      time: '10–15 минут',
    },
    {
      icon: <MessageSquare className="w-8 h-8" />,
      title: 'Получение заказов',
      description: 'Система автоматически подберёт подходящие проекты. Выбирайте и откликайтесь.',
      time: 'от 2 часов',
    },
    {
      icon: <CreditCard className="w-8 h-8" />,
      title: 'Выполнение и оплата',
      description: 'Обсудите детали с клиентом, выполните работу, получите оплату после принятия.',
      time: '24 часа после приёмки',
    },
    {
      icon: <Star className="w-8 h-8" />,
      title: 'Рост рейтинга',
      description: 'Получайте отзывы, повышайте рейтинг, получайте больше заказов и повышенный процент.',
      time: 'постоянно',
    },
  ];

  return (
    <section className="py-20 px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-honest-dark to-honest-darker z-0"></div>
      <div className="absolute top-1/3 left-10 w-64 h-64 bg-honest-primary/5 rounded-full blur-3xl"></div>
      
      <div className="max-w-6xl mx-auto relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            <span className="text-white">Как </span>
            <span className="text-honest-primary">начать</span>
          </h2>
          <p className="text-xl text-honest-light max-w-3xl mx-auto">
            Весь путь от регистрации до первых заработков занимает менее суток.
          </p>
        </div>

        <div className="relative">
          <div className="absolute left-1/2 transform -translate-x-1/2 h-full w-0.5 bg-gradient-to-b from-honest-primary via-honest-accent to-honest-secondary hidden lg:block"></div>
          
          <div className="space-y-12 lg:space-y-0">
            {steps.map((step, idx) => (
              <div
                key={idx}
                className={`relative flex flex-col lg:flex-row items-center lg:items-start gap-8 ${
                  idx % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'
                }`}
              >
                <div className="lg:w-1/2 lg:px-12">
                  <div
                    className={`bg-honest-dark/40 backdrop-blur-sm border border-honest-primary/10 rounded-2xl p-8 ${
                      idx % 2 === 0 ? 'lg:text-right' : 'lg:text-left'
                    }`}
                  >
                    <div className="inline-flex p-4 bg-honest-dark/60 rounded-xl text-honest-primary mb-4">
                      {step.icon}
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-3">{step.title}</h3>
                    <p className="text-honest-light mb-4">{step.description}</p>
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-honest-dark/60 rounded-full">
                      <span className="text-honest-primary text-sm font-semibold">Время:</span>
                      <span className="text-white font-bold">{step.time}</span>
                    </div>
                  </div>
                </div>

                <div className="absolute left-1/2 transform -translate-x-1/2 lg:relative lg:left-auto lg:transform-none lg:translate-x-0">
                  <div className="w-12 h-12 rounded-full bg-honest-dark border-4 border-honest-primary flex items-center justify-center">
                    <span className="text-white font-bold text-lg">{idx + 1}</span>
                  </div>
                </div>

                <div className="lg:w-1/2 lg:px-12"></div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-20 text-center">
          <div className="inline-block max-w-3xl mx-auto">
            <div className="bg-honest-dark/40 backdrop-blur-sm border border-honest-primary/10 rounded-2xl p-8">
              <h3 className="text-2xl font-bold text-white mb-4">Готовы начать?</h3>
              <p className="text-honest-light mb-6">
                Присоединяйтесь к тысячам мастеров, которые уже зарабатывают на нашей платформе.
                Первый заказ может поступить уже сегодня.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={() => openHonestBot()}
                  className="px-8 py-4 bg-honest-primary text-honest-dark font-bold rounded-xl hover:shadow-honest-glow-lg transition-all"
                >
                  Зарегистрироваться бесплатно
                </button>
                <button
                  onClick={() => openHonestBot('honest-landing-demo')}
                  className="px-8 py-4 border-2 border-honest-primary text-honest-primary font-semibold rounded-xl hover:bg-honest-primary/10 transition-all"
                >
                  Посмотреть демо-кабинет
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}