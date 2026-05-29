import { useEffect, useRef, useState } from 'react';

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

const criteria = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="2" y="3" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 8h8M7 11h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="17" cy="15" r="4" fill="#0F172A" stroke="currentColor" strokeWidth="1.5" />
        <path d="M15.5 15l1 1 1.5-1.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Есть живой аккаунт Авито',
    desc: 'С историей, отзывами и активностью. Новые аккаунты без репутации не подходят.',
    color: '#34F5A3',
    required: true,
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="11" cy="11" r="9" stroke="currentColor" strokeWidth="1.5" />
        <path d="M11 7v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: 'Умеете быстро отвечать',
    desc: 'Скорость ответа критична: клиент не ждёт. Оптимально — реакция в течение нескольких минут.',
    color: '#38BDF8',
    required: true,
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M11 3L4 7v4c0 4.418 3.134 7.854 7 8.946C18.866 18.854 22 15.418 22 11V7l-7-4H11z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M8 11l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Внимательны к деталям',
    desc: 'Важно правильно фиксировать данные клиента. Ошибки в лиде снижают его качество.',
    color: '#FACC15',
    required: true,
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="3" y="3" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 11h4M7 14.5h7M11 7.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: 'Готовы работать по правилам платформы',
    desc: 'Есть скрипты, регламенты, требования к качеству. Система работает только при соблюдении стандартов.',
    color: '#34F5A3',
    required: true,
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M4 18V8l7-5 7 5v10H4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <rect x="8.5" y="13" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
    title: 'Хотите стабильный доход через трафик',
    desc: 'Не разовую подработку, а понятный и масштабируемый источник. Аккаунт работает на вас.',
    color: '#38BDF8',
    required: false,
  },
];

export default function WhoFits() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref as React.RefObject<HTMLElement>);

  return (
    <section
      ref={ref}
      id="who"
      className="py-28 relative"
      style={{ background: '#0B0F14' }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-20 left-0 w-80 h-80 rounded-full opacity-10"
          style={{
            background: 'radial-gradient(ellipse, rgba(56, 189, 248, 0.4) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        {/* Header */}
        <div
          className="max-w-2xl mb-16"
          style={{
            opacity: inView ? 1 : 0,
            transform: inView ? 'translateY(0)' : 'translateY(24px)',
            transition: 'opacity 0.7s ease, transform 0.7s ease',
          }}
        >
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-5"
            style={{
              background: 'rgba(52, 245, 163, 0.08)',
              border: '1px solid rgba(52, 245, 163, 0.2)',
              color: '#34F5A3',
            }}
          >
            Кому подходит
          </div>
          <h2
            className="text-3xl lg:text-4xl font-bold mb-4 tracking-tight"
            style={{ color: '#F8FAFC', letterSpacing: '-0.02em' }}
          >
            Кому подходит
            <br />
            эта модель
          </h2>
          <p className="text-base leading-relaxed" style={{ color: '#94A3B8' }}>
            Нужен не просто человек в переписках — нужен партнёр,
            который умеет бережно работать с входящим потоком.
          </p>
        </div>

        {/* Criteria cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
          {criteria.map((item, i) => (
            <div
              key={item.title}
              className="glass-card rounded-2xl p-6 relative overflow-hidden group"
              style={{
                opacity: inView ? 1 : 0,
                transform: inView ? 'translateY(0)' : 'translateY(30px)',
                transition: `opacity 0.6s ease ${0.05 + i * 0.1}s, transform 0.6s ease ${0.05 + i * 0.1}s`,
              }}
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                style={{
                  background: `rgba(${item.color === '#38BDF8' ? '56,189,248' : item.color === '#34F5A3' ? '52,245,163' : '250,204,21'}, 0.1)`,
                  color: item.color,
                }}
              >
                {item.icon}
              </div>

              <h3 className="text-sm font-semibold mb-2 leading-snug" style={{ color: '#F8FAFC' }}>
                {item.title}
              </h3>
              <p className="text-xs leading-relaxed" style={{ color: '#64748B' }}>
                {item.desc}
              </p>

              {/* Bottom bar on hover */}
              <div
                className="absolute bottom-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                style={{ background: `linear-gradient(90deg, transparent, ${item.color}, transparent)` }}
              />
            </div>
          ))}
        </div>

        {/* Selective work banner */}
        <div
          className="rounded-2xl p-7 relative overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.08)',
            opacity: inView ? 1 : 0,
            transition: 'opacity 0.7s ease 0.6s',
          }}
        >
          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'rgba(52, 245, 163, 0.08)', border: '1px solid rgba(52, 245, 163, 0.2)' }}
            >
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ color: '#34F5A3' }}>
                <path d="M11 3L4 7.5v7L11 19l7-4.5v-7L11 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M8 11l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold mb-1.5" style={{ color: '#F8FAFC' }}>
                Работаем только с теми, кто готов к системной работе
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: '#64748B' }}>
                Каждый новый партнёр проходит проверку аккаунта и короткое знакомство с платформой.
                Это не формальность — это фильтр качества, который защищает и вас, и систему.
                Нам важно, чтобы вы работали долго и с результатом.
              </p>
            </div>
            <a
              href="#cta"
              className="shrink-0 px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-200 whitespace-nowrap"
              style={{
                background: 'rgba(52, 245, 163, 0.1)',
                border: '1px solid rgba(52, 245, 163, 0.3)',
                color: '#34F5A3',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(52, 245, 163, 0.18)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(52, 245, 163, 0.1)';
              }}
            >
              Подать заявку
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
