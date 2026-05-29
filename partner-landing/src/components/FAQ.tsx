import { useState, useRef, useEffect } from 'react';

function useInView(ref: React.RefObject<HTMLElement | null>, threshold = 0.15) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, threshold]);
  return inView;
}

const faqs = [
  {
    q: 'Это работа или партнёрство?',
    a: 'Это партнёрская модель внутри платформы. Вы используете свой аккаунт Авито, а система помогает превращать входящий поток в фиксированный доход. Вы не наёмный оператор — вы партнёр с собственным активом.',
  },
  {
    q: 'Я должен сам искать клиентов?',
    a: 'Нет. Клиенты уже пишут вам в Авито — платформа обеспечивает трафик через рекламный бюджет на вашем аккаунте. Ваша задача — обработать входящее обращение и передать лид в систему.',
  },
  {
    q: 'Я должен вести мастеров дальше?',
    a: 'Нет. После того как вы передаёте лид в систему, ваша задача завершена. Платформа, команда и мастера работают дальше самостоятельно. Вы не несёте ответственности за выполнение заказа.',
  },
  {
    q: 'Когда лид считается успешным?',
    a: 'Лид считается успешным, если после передачи в систему он проходит период холда 48 часов и не возвращается от мастера как невалидный или неподходящий. Именно за такой лид начисляется 500 ₽.',
  },
  {
    q: 'Как считается итоговая выплата?',
    a: 'Итоговая выплата считается так: количество успешных лидов умножается на ставку (500 ₽ за лид), после чего из этой суммы вычитается рекламный бюджет, который платформа потратила на продвижение вашего аккаунта Авито за период.',
  },
  {
    q: 'Что будет, если лид вернули как невалидный?',
    a: 'Если мастер вернул лид в течение периода холда — он не засчитывается и не оплачивается. Это мотивирует тщательнее квалифицировать входящие обращения и передавать только реальные заявки.',
  },
];

function AccordionItem({
  q,
  a,
  index,
  inView,
}: {
  q: string;
  a: string;
  index: number;
  inView: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="rounded-xl overflow-hidden transition-all duration-200"
      style={{
        background: open ? 'rgba(52, 245, 163, 0.03)' : 'rgba(255,255,255,0.02)',
        border: open ? '1px solid rgba(52, 245, 163, 0.2)' : '1px solid rgba(255,255,255,0.08)',
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateY(0)' : 'translateY(16px)',
        transition: `opacity 0.5s ease ${0.05 + index * 0.07}s, transform 0.5s ease ${0.05 + index * 0.07}s, background 0.2s, border-color 0.2s`,
      }}
    >
      <button
        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
        onClick={() => setOpen(!open)}
      >
        <span
          className="text-sm font-semibold leading-snug"
          style={{ color: open ? '#F8FAFC' : '#E2E8F0' }}
        >
          {q}
        </span>
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all duration-200"
          style={{
            background: open ? 'rgba(52, 245, 163, 0.15)' : 'rgba(255,255,255,0.06)',
            color: open ? '#34F5A3' : '#64748B',
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            style={{
              transform: open ? 'rotate(45deg)' : 'rotate(0)',
              transition: 'transform 0.2s ease',
            }}
          >
            <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </button>

      <div
        style={{
          maxHeight: open ? '300px' : '0',
          overflow: 'hidden',
          transition: 'max-height 0.3s ease',
        }}
      >
        <div className="px-6 pb-5">
          <p
            className="text-sm leading-relaxed"
            style={{ color: '#64748B' }}
          >
            {a}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function FAQ() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref as React.RefObject<HTMLElement>);

  return (
    <section
      ref={ref}
      id="faq"
      className="py-28 relative"
      style={{ background: '#0B0F14' }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)' }}
        />
        <div
          className="absolute -bottom-20 right-1/4 w-80 h-80 rounded-full opacity-8"
          style={{
            background: 'radial-gradient(ellipse, rgba(56, 189, 248, 0.15) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
      </div>

      <div className="max-w-3xl mx-auto px-6 lg:px-8">
        {/* Header */}
        <div
          className="text-center mb-14"
          style={{
            opacity: inView ? 1 : 0,
            transform: inView ? 'translateY(0)' : 'translateY(24px)',
            transition: 'opacity 0.7s ease, transform 0.7s ease',
          }}
        >
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-5"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#94A3B8',
            }}
          >
            Вопросы и ответы
          </div>
          <h2
            className="text-3xl lg:text-4xl font-bold tracking-tight"
            style={{ color: '#F8FAFC', letterSpacing: '-0.02em' }}
          >
            Часто задаваемые вопросы
          </h2>
        </div>

        {/* Accordion */}
        <div className="space-y-3">
          {faqs.map((item, i) => (
            <AccordionItem
              key={item.q}
              q={item.q}
              a={item.a}
              index={i}
              inView={inView}
            />
          ))}
        </div>

        {/* Bottom note */}
        <div
          className="mt-10 text-center"
          style={{
            opacity: inView ? 1 : 0,
            transition: 'opacity 0.7s ease 0.5s',
          }}
        >
          <p className="text-sm" style={{ color: '#475569' }}>
            Остались вопросы?{' '}
            <a
              href="#cta"
              className="font-medium transition-colors"
              style={{ color: '#34F5A3' }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#2DD4BF')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = '#34F5A3')}
            >
              Свяжитесь с нами при подаче заявки
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
