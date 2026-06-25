import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const faqs = [
  {
    question: 'Я что-то плачу при подключении?',
    answer: 'Нет. Вход полностью бесплатный. Вы заполняете форму, получаете доступ к приложению и начинаете видеть заявки. Никаких предоплат.',
  },
  {
    question: 'Когда я плачу 500₽ за заявку?',
    answer: 'После получения оплаты от клиента. Клиент платит вам за работу — и только тогда вы оплачиваете 500₽ + комиссию. Если клиент не заплатил — вы ничего не должны.',
  },
  {
    question: 'А если клиент откажется?',
    answer: 'Если клиент отказался не по вашей вине (передумал, переехал, нашёл другого) — заявка не оплачивается. Вы ничего не теряете.',
  },
  {
    question: 'Сколько комиссия?',
    answer: 'От 15% с суммы заказа. Комиссия оплачивается вместе с 500₽ за заявку после того, как клиент оплатил вам работу.',
  },
  {
    question: 'Могу работать по своим ценам?',
    answer: 'Да. Вы сами составляете смету и определяете стоимость работ. Мы не навязываем расценки.',
  },
  {
    question: 'Сколько заказов будет?',
    answer: 'Зависит от вашей специализации, города и конверсии. Чем лучше вы работаете (рейтинг, отзывы), тем больше система направляет заявок именно вам.',
  },
  {
    question: 'Какие специализации подходят?',
    answer: 'Обои, шпаклёвка, покраска, плитка, сантехника, электрика, комплексная отделка. Если ваша специализация не в списке — напишите нам, обсудим.',
  },
  {
    question: 'Что за приложение?',
    answer: 'PWA-приложение (работает через браузер, устанавливается на телефон). В нём вы видите заявки, откликаетесь, ведёте сметы и общаетесь с клиентами.',
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="relative py-20 sm:py-28 bg-[#F1EEE7]">
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
