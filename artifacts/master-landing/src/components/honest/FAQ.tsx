import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const faqItems = [
  {
    q: 'Я плачу процент с заказа?',
    a: 'Нет! Вы забираете 100% денег с объекта. Вы оплачиваете только доступ к заказам (токены).',
  },
  {
    q: 'А если я куплю токен, а клиент передумал до замера?',
    a: 'Мы работаем честно. Вы нажимаете кнопку «Возврат», мы проверяем информацию и возвращаем токен вам на баланс. Вы платите только за реальные объекты.',
  },
  {
    q: 'Я работаю по своим ценам?',
    a: 'Да. Вы сами считаете смету. Но цены должны быть рыночными, иначе клиенты не будут закрываться, а ваша конверсия (и поток новых заказов) упадёт.',
  },
  {
    q: 'Обязательно ли давать паспорт?',
    a: 'Только если вы хотите получить первый тестовый заказ по постоплате. Если не хотите светить документы — можете сразу купить пакет заказов и работать.',
  },
  {
    q: 'Можно ли брать 2 объекта одновременно?',
    a: 'По умолчанию — 1 активный заказ. Взял → сделал → закрыл → получил новый. Для топ-мастеров лимит может быть увеличен.',
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="relative py-20 sm:py-28">
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#FACC15]/30 to-transparent" />

      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-[#F8FAFC] mb-12 text-center">
          Частые вопросы
        </h2>

        <div className="space-y-3">
          {faqItems.map((item, i) => (
            <div
              key={i}
              className="rounded-xl bg-[#111827]/80 border border-[#94A3B8]/10 backdrop-blur-sm overflow-hidden"
            >
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between p-5 text-left"
              >
                <span className="text-[#F8FAFC] font-medium pr-4">{item.q}</span>
                <ChevronDown
                  className={`w-5 h-5 text-[#94A3B8] flex-shrink-0 transition-transform duration-300 ${
                    openIndex === i ? 'rotate-180' : ''
                  }`}
                />
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  openIndex === i ? 'max-h-40 pb-5' : 'max-h-0'
                }`}
              >
                <p className="px-5 text-[#94A3B8] leading-relaxed">{item.a}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
