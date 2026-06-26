import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import Eyebrow from './Eyebrow';

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
    <section id="faq" className="relative py-14 sm:py-20 bg-[#F5F0E8]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <Eyebrow number="08" label="Вопросы" />
        <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1A1A1A] mb-4 text-center">
          Частые{' '}
          <span className="relative inline-block">
            <span className="absolute inset-x-0 bottom-1 h-3 sm:h-4 bg-[#FACC15] -z-10 rounded-sm" />
            вопросы
          </span>
        </h2>
        <p className="text-[#57534E] text-center mb-12 text-lg">
          Всё, что мастера спрашивают перед подключением
        </p>

        <div className="space-y-3">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="rounded-3xl bg-white border border-[#E7E0D4] shadow-sm overflow-hidden transition-all duration-300"
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full flex items-center justify-between p-5 text-left cursor-pointer"
              >
                <span className="text-[#1A1A1A] font-medium pr-4">{faq.question}</span>
                <ChevronDown
                  className={`w-5 h-5 text-[#E8590C] flex-shrink-0 transition-transform duration-300 ${
                    openIndex === index ? 'rotate-180' : ''
                  }`}
                />
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  openIndex === index ? 'max-h-48 pb-5' : 'max-h-0'
                }`}
              >
                <p className="px-5 text-[#57534E] leading-relaxed">{faq.answer}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
