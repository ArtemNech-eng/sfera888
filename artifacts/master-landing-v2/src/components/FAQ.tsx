import React, { useState } from 'react';
import { Plus, Minus } from 'lucide-react';
import AnimatedSection from './AnimatedSection';

const faqs = [
  {
    q: 'Я плачу процент с заказа?',
    a: 'Нет! Вы забираете 100% денег с объекта. Вы оплачиваете только доступ к заказам (токены). Никаких скрытых комиссий, процентов и вычетов из ваших заработков.',
  },
  {
    q: 'А если я куплю токен, а клиент передумал до замера?',
    a: 'Мы работаем честно. Вы нажимаете кнопку «Возврат» в приложении — мы проверяем информацию и возвращаем токен вам на баланс. Вы платите только за реальные объекты, где состоялся контакт с клиентом.',
  },
  {
    q: 'Я работаю по своим ценам?',
    a: 'Да. Вы сами считаете смету в приложении. Но цены должны быть рыночными — иначе клиенты не будут закрываться, а ваша конверсия (и поток новых заказов) упадёт. Система поощряет тех, кто умеет работать с клиентом.',
  },
  {
    q: 'Обязательно ли давать паспорт?',
    a: 'Только если вы хотите получить первый тестовый заказ по постоплате. Если не хотите светить документы — можете сразу купить пакет заказов и начать работать без верификации по паспорту.',
  },
  {
    q: 'Можно ли брать 2 объекта одновременно?',
    a: 'По умолчанию — 1 активный заказ. Взял → сделал → закрыл → получил новый. Для топ-мастеров с высокой конверсией и хорошей историей в системе лимит может быть увеличен до 2 объектов одновременно.',
  },
  {
    q: 'Что будет, если я сорву заказ?',
    a: 'Срывы заказов и пропажи с объекта ведут к заморозке аккаунта. Мы строим серьёзную платформу и дорожим репутацией у клиентов. Мастера, которые работают честно и качественно, всегда получают больше заказов от системы.',
  },
  {
    q: 'Есть ли приложение или только бот?',
    a: 'Есть полноценное мобильное приложение с лентой объектов, сметчиком и историей заказов. Дополнительно работает бот-помощник Max в мессенджере Max. После регистрации в приложении вы получаете доступ ко всему функционалу.',
  },
];

const FAQItem: React.FC<{
  q: string;
  a: string;
  isOpen: boolean;
  onToggle: () => void;
  index: number;
}> = ({ q, a, isOpen, onToggle, index }) => {
  return (
    <div
      className={`rounded-2xl border transition-all duration-300 overflow-hidden ${
        isOpen
          ? 'border-[#10B981]/30 bg-[#10B981]/5'
          : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1]'
      }`}
    >
      <button
        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left group cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-center gap-4">
          <span
            className={`text-sm font-black w-6 flex-shrink-0 transition-colors ${
              isOpen ? 'text-[#10B981]' : 'text-[#94A3B8]'
            }`}
          >
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className={`font-semibold text-base transition-colors ${isOpen ? 'text-[#0F172A]' : 'text-[#374151]'}`}>
            {q}
          </span>
        </div>
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
            isOpen
              ? 'bg-[#10B981] text-white'
              : 'bg-[#F8FAFC] text-[#64748B] group-hover:bg-[#E2E8F0]'
          }`}
        >
          {isOpen ? <Minus size={16} /> : <Plus size={16} />}
        </div>
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-6 pb-5 pl-16">
          <p className="text-[#64748B] leading-relaxed">{a}</p>
        </div>
      </div>
    </div>
  );
};

const FAQ: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="relative py-24 bg-white overflow-hidden">
      <div
        className="absolute right-0 top-1/2 -translate-y-1/2 w-80 h-80 opacity-8 pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <AnimatedSection className="text-center mb-14">
          <p className="text-[#3B82F6] text-sm font-semibold uppercase tracking-widest mb-3">
            Вопросы и ответы
          </p>
          <h2 className="text-4xl sm:text-5xl font-black text-[#0F172A] mb-4">
            Частые{' '}
            <span className="text-[#3B82F6]">вопросы</span>
          </h2>
          <p className="text-[#64748B] text-lg">
            Отвечаем честно на всё, что волнует мастеров перед входом в систему.
          </p>
        </AnimatedSection>

        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <AnimatedSection key={i} delay={i * 60} direction="up">
              <FAQItem
                q={faq.q}
                a={faq.a}
                isOpen={openIndex === i}
                onToggle={() => setOpenIndex(openIndex === i ? null : i)}
                index={i}
              />
            </AnimatedSection>
          ))}
        </div>
      </div>

      <div className="neon-line absolute bottom-0 left-0 right-0" />
    </section>
  );
};

export default FAQ;
