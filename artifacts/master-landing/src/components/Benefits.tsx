import { Gift, Banknote, Shield, Star, Globe, Smartphone } from 'lucide-react';

const benefits = [
  {
    icon: Gift,
    title: 'Бесплатный вход',
    description: 'Ни рубля до первого заказа. Подключение полностью бесплатное.',
  },
  {
    icon: Banknote,
    title: 'Работаете по своим ценам',
    description: 'Вы сами определяете стоимость работ. Мы не диктуем расценки.',
  },
  {
    icon: Shield,
    title: 'Клиент вносит предоплату',
    description: 'Клиент бронирует предоплату через приложение — вы защищены от отмен.',
  },
  {
    icon: Star,
    title: 'Лучшим — больше заказов',
    description: 'Чем выше ваш рейтинг и конверсия, тем чаще вы получаете заявки.',
  },
  {
    icon: Globe,
    title: 'Профиль на маркетплейсе',
    description: 'Публичная карточка на chestnye-mastera.ru. SEO-трафик приводит клиентов.',
  },
  {
    icon: Smartphone,
    title: 'Понятный процесс в приложении',
    description: 'Заявки, сметы, коммуникация с клиентом — всё в одном месте.',
  },
];

export default function Benefits() {
  return (
    <section className="relative py-20 sm:py-28">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-[#0F172A] mb-4 text-center">
          Почему мастера <span className="text-[#D9342B]">выбирают нас</span>
        </h2>
        <p className="text-[#475569] text-center max-w-3xl mx-auto mb-14 text-lg">
          Прозрачные условия, никаких скрытых платежей
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {benefits.map((benefit) => (
            <div
              key={benefit.title}
              className="p-6 rounded-2xl bg-white border border-[#EDEAE2] shadow-sm hover:shadow-md transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 bg-[#FCE9E7] border border-[#EDEAE2]">
                <benefit.icon className="w-6 h-6 text-[#D9342B]" />
              </div>
              <h3 className="text-lg font-bold text-[#0F172A] mb-2">{benefit.title}</h3>
              <p className="text-[#475569] text-sm leading-relaxed">{benefit.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
