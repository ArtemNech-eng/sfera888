import { Globe, Camera, Star, Search } from 'lucide-react';

const features = [
  {
    icon: Globe,
    title: 'Публичная карточка',
    description: 'Ваш профиль виден на chestnye-mastera.ru — клиенты находят вас через поиск.',
  },
  {
    icon: Camera,
    title: 'Портфолио работ',
    description: 'Фото до/после каждого объекта. Клиенты видят качество до обращения.',
  },
  {
    icon: Star,
    title: 'Рейтинг и отзывы',
    description: 'Реальные отзывы от клиентов формируют вашу репутацию и доверие.',
  },
  {
    icon: Search,
    title: 'SEO-трафик',
    description: 'Маркетплейс продвигается в поиске — клиенты приходят сами.',
  },
];

export default function Marketplace() {
  return (
    <section className="relative py-20 sm:py-28 bg-[#F1EEE7]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-[#0F172A] mb-4 text-center">
          Ваш профиль на <span className="text-[#D9342B]">chestnye-mastera.ru</span>
        </h2>
        <p className="text-[#475569] text-center max-w-3xl mx-auto mb-14 text-lg">
          Дополнительный канал заявок: клиенты находят вас через маркетплейс
        </p>

        <div className="grid sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="flex gap-4 p-6 rounded-2xl bg-white border border-[#EDEAE2] shadow-sm"
            >
              <div className="w-12 h-12 rounded-xl bg-[#FCE9E7] border border-[#EDEAE2] flex-shrink-0 flex items-center justify-center">
                <feature.icon className="w-6 h-6 text-[#D9342B]" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#0F172A] mb-1">{feature.title}</h3>
                <p className="text-[#475569] text-sm leading-relaxed">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Marketplace preview mock */}
        <div className="max-w-2xl mx-auto mt-10 p-6 rounded-2xl bg-white border border-[#EDEAE2] shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-full bg-[#FCE9E7] flex items-center justify-center text-[#D9342B] font-bold text-xl">
              АС
            </div>
            <div>
              <div className="text-[#0F172A] font-bold">Алексей Сидоров</div>
              <div className="text-[#475569] text-sm">Обои, шпаклёвка, покраска</div>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <Star className="w-4 h-4 text-[#D9342B] fill-[#D9342B]" />
              <span className="text-[#0F172A] font-bold">4.9</span>
              <span className="text-[#94A3B8] text-sm">(47)</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-lg overflow-hidden">
            <img
              src="https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=400&h=300&fit=crop&q=80"
              alt="Ванная комната после ремонта"
              className="aspect-square object-cover w-full"
              loading="lazy"
            />
            <img
              src="https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&h=300&fit=crop&q=80"
              alt="Кухня после ремонта"
              className="aspect-square object-cover w-full"
              loading="lazy"
            />
            <img
              src="https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400&h=300&fit=crop&q=80"
              alt="Спальня после ремонта"
              className="aspect-square object-cover w-full"
              loading="lazy"
            />
          </div>
          <p className="text-[#94A3B8] text-xs text-center mt-3">Пример карточки мастера на маркетплейсе</p>
        </div>
      </div>
    </section>
  );
}
