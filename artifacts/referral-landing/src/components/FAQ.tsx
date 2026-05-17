import { useState } from 'react';

const faqs = [
  {
    question: 'Это бесплатно?',
    answer:
      'Да. Вы просто оставляете заявку. Оплата происходит только за выполненную работу.',
  },
  {
    question: 'Вы фирма или частные мастера?',
    answer:
      'Мы городской сервис, который объединяет проверенных частных мастеров. Не строительная фирма с накрутками, а платформа для подбора специалистов.',
  },
  {
    question: 'Почему цены ниже?',
    answer:
      'Потому что мы работаем без лишних посредников и не закладываем фирменные накрутки. Вы платите мастеру напрямую.',
  },
  {
    question: 'Когда со мной свяжутся?',
    answer:
      'Обычно мастер связывается в течение 15–30 минут после заявки.',
  },
  {
    question: 'Мастера реально проверены?',
    answer:
      'Да. Документы и рейтинг мастеров проверяются, в систему попадают только допущенные специалисты с рейтингом от 4.5.',
  },
  {
    question: 'Что если мастер не подойдёт?',
    answer:
      'Мы поможем подобрать другого специалиста. Свяжитесь с нами, и мы найдём замену.',
  },
];

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-[#E5E7EB] rounded-xl overflow-hidden bg-white">
      <button
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-[#F9FAFB] transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className="text-[#111827] font-medium text-sm sm:text-base pr-4">{question}</span>
        <span
          className={`flex-shrink-0 w-6 h-6 rounded-full bg-[#F1F5F9] flex items-center justify-center transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </span>
      </button>
      {open && (
        <div className="px-6 pb-5">
          <p className="text-[#6B7280] text-sm leading-relaxed">{answer}</p>
        </div>
      )}
    </div>
  );
}

export default function FAQ() {
  return (
    <section id="faq" className="bg-[#F8FAFC] py-20">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#111827] mb-3">
            Частые вопросы
          </h2>
          <p className="text-[#6B7280] text-base">
            Отвечаем честно и по делу
          </p>
        </div>
        <div className="space-y-3">
          {faqs.map((faq) => (
            <FAQItem key={faq.question} {...faq} />
          ))}
        </div>
      </div>
    </section>
  );
}
