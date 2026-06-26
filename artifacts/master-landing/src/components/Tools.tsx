import { Smartphone, Calculator, Shield, BarChart3, Repeat, Headphones } from 'lucide-react';
import Eyebrow from './Eyebrow';

const tools = [
  {
    icon: Smartphone,
    title: 'Мобильное приложение',
    description: 'PWA-приложение для iOS и Android. Заявки, сметы, коммуникация — всё в одном месте.',
  },
  {
    icon: Calculator,
    title: 'Встроенный сметчик',
    description: 'Составляйте смету прямо в приложении. Клиент видит прозрачные расчёты, вы — экономите время.',
  },
  {
    icon: Shield,
    title: 'Прозрачная комиссия',
    description: 'Никаких скрытых платежей. 500₽ + 15% — только после получения оплаты. Всё видно в кабинете.',
  },
  {
    icon: BarChart3,
    title: 'Аналитика и рейтинг',
    description: 'Отслеживайте конверсию, доход и рейтинг. Растёте в системе — получаете больше заявок.',
  },
  {
    icon: Repeat,
    title: 'Стабильный поток',
    description: 'Объекты каждый день. Закрыл один — берёшь следующий. Без пауз и простоев.',
  },
  {
    icon: Headphones,
    title: 'Поддержка 24/7',
    description: 'Менеджеры на связи. Помогут с клиентом, со сметой, с любым вопросом по системе.',
  },
];

export default function Tools() {
  return (
    <section className="relative py-14 sm:py-20 bg-[#F5F0E8]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <Eyebrow number="04" label="Инструменты" />
        <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1A1A1A] mb-4 text-center">
          Что получает мастер{' '}
          <span className="relative inline-block">
            <span className="absolute inset-x-0 bottom-1 h-3 sm:h-4 bg-[#FACC15] -z-10 rounded-sm" />
            внутри системы
          </span>
        </h2>
        <p className="text-[#57534E] text-center max-w-3xl mx-auto mb-14 text-lg">
          Инструменты, которые помогают зарабатывать больше и работать спокойнее
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {tools.map((tool) => (
            <div
              key={tool.title}
              className="p-6 rounded-3xl border border-[#E7E0D4] shadow-sm hover:shadow-md transition-all duration-300"
              style={{ background: 'linear-gradient(160deg, #FFFFFF 0%, #FBF6EE 100%)' }}
            >
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 bg-[#FEF3C7]">
                <tool.icon className="w-6 h-6 text-[#E8590C]" />
              </div>
              <h3 className="text-lg font-bold text-[#1A1A1A] mb-2">{tool.title}</h3>
              <p className="text-[#57534E] text-sm leading-relaxed">{tool.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
