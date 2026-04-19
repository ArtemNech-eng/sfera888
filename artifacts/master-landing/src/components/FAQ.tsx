import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const faqs = [
  {
    q: 'Я плачу за заявки?',
    a: 'Нет. Мастер не платит за отклик. Комиссия сервиса оплачивается только после завершения заказа. До 50 000 ₽ — 5 000 ₽, свыше 50 000 ₽ — 15%.',
  },
  {
    q: 'Я работаю по своим ценам?',
    a: 'Да. Вы сами считаете смету. Но цены должны быть рыночными, иначе конверсия будет падать и заказов станет меньше.',
  },
  {
    q: 'Сколько заказов будет?',
    a: 'Зависит от города, вашей конверсии и дисциплины. Лучшие мастера получают приоритет и работают практически без простоев.',
  },
  {
    q: 'Нужно ли постоянно сидеть в приложении?',
    a: 'Нет. Вам приходят уведомления, когда появляются новые заказы. Достаточно откликнуться вовремя.',
  },
  {
    q: 'Можно ли брать два заказа сразу?',
    a: 'По умолчанию — один активный заказ. Принцип простой: взял заказ → выполнил → оплатил комиссию → получил новый. Для сильных мастеров лимит может быть увеличен до 2.',
  },
  {
    q: 'Что если клиент откажется после замера?',
    a: 'Это нормальная ситуация. Вы сообщаете диспетчеру, заказ снимается, и вы снова можете откликаться на новые.',
  },
  {
    q: 'Что будет если работать мимо системы?',
    a: 'Это нарушение условий сотрудничества. Доступ к заявкам будет закрыт. Все сделки проходят только через приложение.',
  },
];

function FAQItem({ q, a, isOpen, onClick }: { q: string; a: string; isOpen: boolean; onClick: () => void }) {
  return (
    <div className="accordion-item">
      <button
        className="w-full flex items-center justify-between gap-4 py-5 text-left cursor-pointer"
        onClick={onClick}
        aria-expanded={isOpen}
      >
        <span className="text-base font-600 text-[#1A1A1A] leading-snug">{q}</span>
        <ChevronDown
          size={20}
          color="#8E8E93"
          strokeWidth={2}
          className={`flex-shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        className="overflow-hidden transition-all duration-300"
        style={{ maxHeight: isOpen ? '300px' : '0px' }}
      >
        <p className="text-sm text-[#8E8E93] leading-relaxed pb-5">{a}</p>
      </div>
    </div>
  );
}

export default function FAQ() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const toggle = (idx: number) => {
    setOpenIdx(openIdx === idx ? null : idx);
  };

  return (
    <section className="section-bg py-20 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-800 text-[#1A1A1A]">Частые вопросы</h2>
        </div>

        <div className="card p-0 overflow-hidden">
          <div className="px-6">
            {faqs.map((faq, idx) => (
              <FAQItem
                key={idx}
                q={faq.q}
                a={faq.a}
                isOpen={openIdx === idx}
                onClick={() => toggle(idx)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
