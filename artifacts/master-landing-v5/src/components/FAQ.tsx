import { useState } from 'react';

const faqItems = [
  {
    q: 'Это работа или партнёрство?',
    a: 'Это работа через платформу. Вы не нанимаетесь в штат, а подключаетесь к системе заказов. Вы — самостоятельный мастер, который работает по правилам платформы и получает объекты через приложение.',
  },
  {
    q: 'Я работаю по своим ценам?',
    a: 'Да. Вы сами считаете смету прямо в приложении. Но цены должны быть рыночными — это одно из базовых требований системы. Демпинговать или завышать без обоснования не получится.',
  },
  {
    q: 'Сколько тестовых заказов дают?',
    a: 'Обычно 1–2 тестовых заказа. Этого достаточно, чтобы обе стороны поняли, подходят ли друг другу. Вы смотрите на качество объектов и систему, мы смотрим на вашу работу.',
  },
  {
    q: 'Тестовый доступ бесплатный навсегда?',
    a: 'Нет. Тестовый доступ ограничен по количеству заказов. После тестового периода работа продолжается через платный формат доступа к заказам — пакетную модель.',
  },
  {
    q: 'Я должен платить процент с объекта?',
    a: 'Нет. После тестового периода вы работаете через пакеты заказов. Весь заработок по объекту остаётся вам. Платформа не берёт процент с суммы ремонта — только фиксированная оплата за доступ к заказам.',
  },
  {
    q: 'Обязательно ли загружать паспорт?',
    a: 'Только если вы хотите пройти тестовый старт с 1–2 тестовыми заказами. Верификация — это входной фильтр для тестового периода. Если не хотите верификацию — можете сразу купить пакет заказов и начать работу.',
  },
  {
    q: 'Можно ли брать 2 объекта одновременно?',
    a: 'По умолчанию — 1 активный заказ. Это правило системы: взял → сделал → закрыл → получил следующий. Для сильных мастеров с высокой конверсией и хорошим рейтингом лимит может быть увеличен до 2 объектов одновременно.',
  },
];

function FAQItem({ q, a, isOpen, onToggle }: { q: string; a: string; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className={`border rounded-2xl overflow-hidden transition-all duration-200 ${
      isOpen ? 'border-[#34C759]/40 shadow-sm' : 'border-[#E5E7EB]'
    }`}>
      <button
        className="w-full flex items-center justify-between gap-4 p-5 text-left bg-white hover:bg-[#F8FAFC] transition-colors duration-200"
        onClick={onToggle}
      >
        <span className={`text-sm sm:text-base font-semibold transition-colors duration-200 ${
          isOpen ? 'text-[#22A06B]' : 'text-[#111827]'
        }`}>
          {q}
        </span>
        <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200 ${
          isOpen ? 'bg-[#34C759] rotate-0' : 'bg-[#F1F5F9] rotate-0'
        }`}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          >
            <path
              d="M6 9L12 15L18 9"
              stroke={isOpen ? 'white' : '#6B7280'}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </button>
      {isOpen && (
        <div className="px-5 pb-5 bg-white">
          <div className="h-px bg-[#E5E7EB] mb-4" />
          <p className="text-sm text-[#6B7280] leading-relaxed">{a}</p>
        </div>
      )}
    </div>
  );
}

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="py-24 bg-[#F1F5F9]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-[1fr_2fr] gap-12">
          {/* Left: Header */}
          <div>
            <div className="inline-flex items-center gap-2 bg-white border border-[#E5E7EB] rounded-full px-4 py-1.5 mb-4">
              <span className="text-sm font-semibold text-[#6B7280]">FAQ</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-[#111827] mb-4 leading-tight">
              Частые вопросы
            </h2>
            <p className="text-[#6B7280] leading-relaxed mb-6">
              Собрали самые частые вопросы от мастеров, которые рассматривают подключение к платформе.
            </p>
            <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5">
              <p className="text-sm font-bold text-[#111827] mb-2">Остались вопросы?</p>
              <p className="text-xs text-[#6B7280] mb-4 leading-relaxed">
                Свяжитесь с нами через приложение — ответим быстро.
              </p>
              <a
                href="#"
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#22A06B] hover:text-[#34C759] transition-colors"
              >
                Открыть приложение
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </a>
            </div>
          </div>

          {/* Right: Accordion */}
          <div className="flex flex-col gap-3">
            {faqItems.map((item, i) => (
              <FAQItem
                key={i}
                q={item.q}
                a={item.a}
                isOpen={openIndex === i}
                onToggle={() => setOpenIndex(openIndex === i ? null : i)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
