import { Check } from 'lucide-react';

const specializations = [
  'Обои',
  'Шпаклёвка',
  'Покраска',
  'Плитка',
  'Санузлы под ключ',
  'Отделка квартир',
  'Универсалы',
  'Бригады',
];

const requirements = [
  'Выходить на связь',
  'Приезжать на замеры вовремя',
  'Считать сметы через приложение',
  'Не работать мимо системы',
  'Держать рыночные цены',
  'Соблюдать сроки',
  'Закрывать заказ в приложении',
];

export default function WhoWeNeed() {
  return (
    <section className="bg-white py-20 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-800 text-[#1A1A1A] mb-4">
            Кого мы подключаем
          </h2>
        </div>

        {/* Specializations */}
        <div className="flex flex-wrap gap-3 justify-center mb-12">
          {specializations.map((spec) => (
            <span
              key={spec}
              className="flex items-center gap-2 bg-[#F0FBF4] text-[#1A1A1A] rounded-full px-4 py-2.5 text-sm font-600"
            >
              <Check size={14} color="#34C759" strokeWidth={3} />
              {spec}
            </span>
          ))}
        </div>

        {/* Requirements */}
        <div className="card max-w-xl mx-auto">
          <p className="text-base font-600 text-[#1A1A1A] mb-6 text-center leading-relaxed">
            Нам важны не красивые обещания,
            а дисциплина и нормальная работа
          </p>
          <ul className="space-y-3">
            {requirements.map((req) => (
              <li key={req} className="flex items-center gap-3 text-sm text-[#1A1A1A]">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: 'rgba(52,199,89,0.12)' }}
                >
                  <Check size={11} color="#34C759" strokeWidth={3} />
                </div>
                {req}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
