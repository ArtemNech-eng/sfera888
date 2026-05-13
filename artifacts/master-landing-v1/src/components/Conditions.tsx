import { CreditCard, ClipboardList, RefreshCw, Award } from 'lucide-react';

const sections = [
  {
    icon: CreditCard,
    title: 'Комиссия сервиса',
    items: [
      'Заказ до 50 000 ₽ — 5 000 ₽ (фиксированно)',
      'Заказ свыше 50 000 ₽ — 15% от суммы',
      'Комиссия оплачивается после завершения объекта',
    ],
  },
  {
    icon: ClipboardList,
    title: 'Правила работы',
    items: [
      'Все заказы ведутся только через приложение',
      'Смета считается через приложение',
      'Никакой работы мимо системы',
      'Один активный заказ в одни руки (по умолчанию)',
      'Предоплата клиента проходит через сервис',
    ],
  },
  {
    icon: RefreshCw,
    title: 'Принцип конвейера',
    items: [
      'Взяли заказ',
      'Выполнили работу',
      'Оплатили комиссию',
      'Получили новый заказ',
      'Никаких "возьму 5 объектов и буду делать месяц"',
    ],
  },
  {
    icon: Award,
    title: 'Для лучших мастеров',
    items: [
      'Высокая конверсия → больше заказов',
      'Лучший рейтинг → приоритет в ленте',
      'Топ-мастера → лимит до 2 заказов одновременно',
    ],
  },
];

export default function Conditions() {
  return (
    <section className="section-bg py-20 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-4">
          <h2 className="text-3xl md:text-4xl font-extrabold text-[#1A1A1A] mb-3">
            Условия сотрудничества
          </h2>
          <p className="text-[#8E8E93] text-base max-w-md mx-auto">
            Мы работаем честно и прозрачно. Вот что нужно знать до начала работы:
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-10">
          {sections.map((sec) => {
            const Icon = sec.icon;
            return (
              <div key={sec.title} className="card">
                <div className="flex items-center gap-3 mb-5">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: 'rgba(52,199,89,0.1)' }}
                  >
                    <Icon size={20} color="#34C759" strokeWidth={2} />
                  </div>
                  <h3 className="font-bold text-[#1A1A1A] text-base">{sec.title}</h3>
                </div>
                <ul className="space-y-2">
                  {sec.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-[#8E8E93]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#34C759] mt-1.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <p className="text-center mt-10 text-base font-semibold text-[#1A1A1A]">
          Простые правила. Честная работа.{' '}
          <span className="text-[#34C759]">Стабильный поток заказов.</span>
        </p>
      </div>
    </section>
  );
}
