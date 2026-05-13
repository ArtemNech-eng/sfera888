import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      question: 'Сколько стоит регистрация и использование?',
      answer: 'Регистрация и базовый функционал полностью бесплатны. Платформа зарабатывает только с комиссии 15% от выполненного заказа. Оплата тарифа «Профи» (500 ₽/месяц) — опциональна и даёт дополнительные преимущества.',
    },
    {
      question: 'Как быстро поступают выплаты?',
      answer: 'После принятия работы клиентом деньги автоматически резервируются на вашем балансе. Выплата на карту происходит в течение 24 часов. Вы можете запросить вывод в любое время.',
    },
    {
      question: 'Как работает автоматический подбор заказов?',
      answer: 'Система анализирует ваши навыки, рейтинг, портфолио и предпочтения. При появлении нового заказа, который соответствует вашим критериям, вы получаете уведомление. Вы можете откликаться на те проекты, которые вам интересны.',
    },
    {
      question: 'Что делать, если клиент не принимает работу?',
      answer: 'Платформа выступает гарантом. Если возникает спор, наша команда модерации рассматривает ситуацию и принимает решение на основе предоставленных доказательств. В 95% случаев споры решаются в пользу мастера.',
    },
    {
      question: 'Можно ли работать с несколькими заказами одновременно?',
      answer: 'Да, вы можете вести несколько проектов параллельно, главное — реалистично оценивать свои возможности и соблюдать дедлайны. Система показывает вашу загрузку клиентам.',
    },
    {
      question: 'Есть ли мобильное приложение?',
      answer: 'Да, у нас есть PWA‑приложение, которое работает на iOS и Android. Вы можете получать уведомления о новых заказах, общаться с клиентами и управлять проектами прямо с телефона.',
    },
    {
      question: 'Как повысить свой рейтинг?',
      answer: 'Рейтинг растёт при успешном выполнении заказов, положительных отзывах и соблюдении сроков. Также влияет активность и качество коммуникации с клиентами. Высокий рейтинг даёт приоритет в подборе заказов и возможность снижения комиссии.',
    },
    {
      question: 'Какие гарантии, что заказы будут?',
      answer: 'Мы гарантируем, что при активном заполненном профиле и адекватных ставках вы получите первый заказ в течение 48 часов. Если этого не произойдёт — предоставим месяц тарифа «Профи» бесплатно.',
    },
  ];

  return (
    <section className="py-20 px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-honest-darker to-honest-dark z-0"></div>
      <div className="absolute bottom-20 right-10 w-64 h-64 bg-honest-accent/5 rounded-full blur-3xl"></div>
      
      <div className="max-w-4xl mx-auto relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            <span className="text-white">Частые </span>
            <span className="text-honest-primary">вопросы</span>
          </h2>
          <p className="text-xl text-honest-light max-w-3xl mx-auto">
            Ответы на самые популярные вопросы от мастеров.
          </p>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, idx) => (
            <div
              key={idx}
              className="bg-honest-dark/40 backdrop-blur-sm border border-honest-primary/10 rounded-2xl overflow-hidden"
            >
              <button
                className="w-full px-6 py-5 text-left flex items-center justify-between hover:bg-honest-dark/60 transition-all"
                onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
              >
                <span className="text-lg font-semibold text-white">{faq.question}</span>
                <ChevronDown
                  className={`w-5 h-5 text-honest-primary transition-transform ${
                    openIndex === idx ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {openIndex === idx && (
                <div className="px-6 pb-5">
                  <p className="text-honest-light">{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-16 text-center">
          <div className="inline-block px-8 py-6 bg-honest-dark/60 border border-honest-primary/20 rounded-2xl max-w-2xl">
            <p className="text-white">
              <span className="text-honest-primary font-bold">Не нашли ответ?</span>
              <span className="ml-3">
                Напишите нам в поддержку — ответим в течение 15 минут в рабочее время.
              </span>
            </p>
            <button className="mt-4 px-6 py-3 border-2 border-honest-primary text-honest-primary font-semibold rounded-xl hover:bg-honest-primary/10 transition-all">
              Написать в поддержку
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}