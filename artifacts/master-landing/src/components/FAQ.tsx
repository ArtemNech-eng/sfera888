import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const faqs = [
  {
    question: 'Я плачу процент с заказа?',
    answer: 'Да, 15% + 500₽ за заявку. Оплата только после получения денег от клиента. Сначала зарабатываете — потом платите.',
  },
  {
    question: 'А если клиент откажется?',
    answer: 'Вы ничего не платите. Риск на нас. Если клиент отказался не по вашей вине — заявка не оплачивается.',
  },
  {
    question: 'Я работаю по своим ценам?',
    answer: 'Да. Вы сами составляете смету и определяете стоимость работ. Мы не навязываем расценки.',
  },
  {
    question: 'Нужен ли паспорт?',
    answer: 'Нет, регистрация без документов. Заполняете форму, указываете специализацию и город — получаете доступ.',
  },
  {
    question: 'Можно ли брать 2 объекта?',
    answer: 'По умолчанию 1 активный заказ. Для топовых мастеров с высоким рейтингом — до 2 объектов одновременно.',
  },
  {
    question: 'Что будет если работать мимо системы?',
    answer: 'Заморозка аккаунта. Все сделки должны проходить через приложение — это защищает и вас, и клиента.',
  },
  {
    question: 'Есть ли приложение?',
    answer: 'Да, PWA-приложение для iOS и Android. Устанавливается через браузер, работает как обычное приложение на телефоне.',
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="relative py-20 sm:py-28 bg-[#FAFAF7]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-[#0F172A] mb-4 text-center">
          Частые <span className="text-[#D9342B]">вопросы</span>
        </h2>
        <p className="text-[#475569] text-center mb-12 text-lg">
          Всё, что мастера спрашивают перед подключением
        </p>

        <div className="space-y-3">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="rounded-2xl bg-white border border-[#EDEAE2] shadow-sm overflow-hidden transition-all duration-300"
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full flex items-center justify-between p-5 text-left cursor-pointer"
              >
                <span className="text-[#0F172A] font-medium pr-4">{faq.question}</span>
                <ChevronDown
                  className={`w-5 h-5 text-[#D9342B] flex-shrink-0 transition-transform duration-300 ${
                    openIndex === index ? 'rotate-180' : ''
                  }`}
                />
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  openIndex === index ? 'max-h-48 pb-5' : 'max-h-0'
                }`}
              >
                <p className="px-5 text-[#475569] leading-relaxed">{faq.answer}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
