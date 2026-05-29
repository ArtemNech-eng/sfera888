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

const withoutSystem = [
  'Обращения теряются в переписке',
  'Невозможно посчитать реальный результат',
  'Непонятно, сколько заработал аккаунт',
  'Нет воронки, нет структуры',
  'Нет поддержки и обратной связи',
  'Нет прозрачной аналитики',
];

const withPlatform = [
  'Каждая заявка фиксируется и учитывается',
  'Видна статистика по лидам и конверсии',
  'Понятная модель оплаты за результат',
  'Есть учёт каждого этапа',
  'Есть личный кабинет партнёра',
  'Можно масштабироваться и расти',
];

export default function WhyBetter() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref as React.RefObject<HTMLElement>);

  return (
    <section
      ref={ref}
      className="py-28 relative"
      style={{ background: '#0B0F14' }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute inset-0 opacity-3"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)`,
            backgroundSize: '80px 80px',
          }}
        />
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        {/* Header */}
        <div
          className="max-w-2xl mb-16 mx-auto text-center"
          style={{
            opacity: inView ? 1 : 0,
            transform: inView ? 'translateY(0)' : 'translateY(24px)',
            transition: 'opacity 0.7s ease, transform 0.7s ease',
          }}
        >
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-5"
            style={{
              background: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              color: '#38BDF8',
            }}
          >
            Сравнение
          </div>
          <h2
            className="text-3xl lg:text-4xl font-bold mb-4 tracking-tight"
            style={{ color: '#F8FAFC', letterSpacing: '-0.02em' }}
          >
            Почему это выгоднее,
            <br />
            чем работать хаотично
          </h2>
          <p className="text-base leading-relaxed" style={{ color: '#94A3B8' }}>
            Вы подключаетесь не к «работе оператором», а к организованной инфраструктуре с учётом и аналитикой.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-5 max-w-4xl mx-auto">
          {/* Without system */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: '#111827',
              border: '1px solid rgba(255,255,255,0.07)',
              opacity: inView ? 1 : 0,
              transform: inView ? 'translateX(0)' : 'translateX(-30px)',
              transition: 'opacity 0.6s ease 0.1s, transform 0.6s ease 0.1s',
            }}
          >
            {/* Header */}
            <div
              className="px-7 py-4"
              style={{
                background: 'rgba(239, 68, 68, 0.06)',
                borderBottom: '1px solid rgba(239, 68, 68, 0.12)',
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(239, 68, 68, 0.1)' }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: '#EF4444' }}>
                    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.25" />
                    <path d="M5 5l6 6M11 5L5 11" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                  </svg>
                </div>
                <span className="text-sm font-bold" style={{ color: '#EF4444' }}>
                  Без системы
                </span>
              </div>
            </div>

            {/* Items */}
            <div className="p-7 space-y-3">
              {withoutSystem.map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: 'rgba(239, 68, 68, 0.08)' }}
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ color: '#7F1D1D' }}>
                      <path d="M2 2l4 4M6 2L2 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                  </div>
                  <span className="text-sm leading-relaxed" style={{ color: '#475569' }}>
                    {item}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* With platform */}
          <div
            className="rounded-2xl overflow-hidden relative"
            style={{
              background: '#111827',
              border: '1px solid rgba(52, 245, 163, 0.2)',
              opacity: inView ? 1 : 0,
              transform: inView ? 'translateX(0)' : 'translateX(30px)',
              transition: 'opacity 0.6s ease 0.2s, transform 0.6s ease 0.2s',
            }}
          >
            <div
              className="absolute top-0 left-0 right-0 h-0.5"
              style={{ background: 'linear-gradient(90deg, #34F5A3, #38BDF8)' }}
            />

            {/* Header */}
            <div
              className="px-7 py-4"
              style={{
                background: 'rgba(52, 245, 163, 0.05)',
                borderBottom: '1px solid rgba(52, 245, 163, 0.12)',
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(52, 245, 163, 0.12)' }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: '#34F5A3' }}>
                    <path d="M8 2L9.5 6.5L14 7.5L10.5 10.5L11.5 15L8 13L4.5 15L5.5 10.5L2 7.5L6.5 6.5L8 2Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
                  </svg>
                </div>
                <span className="text-sm font-bold" style={{ color: '#34F5A3' }}>
                  В Честном Мастере
                </span>
              </div>
            </div>

            {/* Items */}
            <div className="p-7 space-y-3">
              {withPlatform.map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: 'rgba(52, 245, 163, 0.12)' }}
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ color: '#34F5A3' }}>
                      <path d="M1.5 4L3 5.5L6.5 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <span className="text-sm leading-relaxed" style={{ color: '#94A3B8' }}>
                    {item}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom callout */}
        <div
          className="mt-12 max-w-2xl mx-auto text-center"
          style={{
            opacity: inView ? 1 : 0,
            transition: 'opacity 0.7s ease 0.5s',
          }}
        >
          <div
            className="p-6 rounded-2xl"
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            <p className="text-sm leading-relaxed" style={{ color: '#94A3B8' }}>
              Каждый партнёр видит свой кабинет, статистику лидов, статусы и начисления.
              <br />
              <span style={{ color: '#F8FAFC' }}>Это не «работа на ощущениях» — это управляемый канал дохода.</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
