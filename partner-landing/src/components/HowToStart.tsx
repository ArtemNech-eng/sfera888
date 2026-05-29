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

const steps = [
  {
    num: '1',
    title: 'Оставляете заявку',
    desc: 'Заполняете короткую форму. Указываете аккаунт Авито и контакт для связи.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 10C3 6.134 6.134 3 10 3s7 3.134 7 7-3.134 7-7 7-7-3.134-7-7Z" stroke="currentColor" strokeWidth="1.4" />
        <path d="M7 10h6M10 7v6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
    color: '#38BDF8',
    timing: '',
  },
  {
    num: '2',
    title: 'Мы смотрим аккаунт',
    desc: 'Анализируем историю, активность и показатели. Обычно это занимает 1–2 рабочих дня.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="9" r="4" stroke="currentColor" strokeWidth="1.4" />
        <path d="M13.5 13L17 17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
    color: '#FACC15',
    timing: '1–2 дня',
  },
  {
    num: '3',
    title: 'Подключаем к системе',
    desc: 'Создаём профиль партнёра, настраиваем доступ в платформу и назначаем куратора.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 2C5.582 2 2 5.582 2 10s3.582 8 8 8 8-3.582 8-8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M13 2l5 5M18 2l-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
    color: '#34F5A3',
    timing: 'День 2',
  },
  {
    num: '4',
    title: 'Даём доступ в приложение',
    desc: 'Получаете доступ к партнёрскому кабинету. Там будет вся статистика, лиды и выплаты.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="5" y="2" width="10" height="16" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="10" cy="15" r="1" fill="currentColor" />
      </svg>
    ),
    color: '#38BDF8',
    timing: 'День 3',
  },
  {
    num: '5',
    title: 'Запускаем в работу',
    desc: 'Короткое обучение по скрипту — и вы готовы принимать первые лиды.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M6 4l10 6-10 6V4Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    ),
    color: '#34F5A3',
    timing: 'День 4',
  },
];

export default function HowToStart() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref as React.RefObject<HTMLElement>);

  return (
    <section
      ref={ref}
      className="py-28 relative"
      style={{ background: '#0F172A' }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(52, 245, 163, 0.2), transparent)' }}
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
              background: 'rgba(52, 245, 163, 0.08)',
              border: '1px solid rgba(52, 245, 163, 0.2)',
              color: '#34F5A3',
            }}
          >
            Онбординг
          </div>
          <h2
            className="text-3xl lg:text-4xl font-bold mb-4 tracking-tight"
            style={{ color: '#F8FAFC', letterSpacing: '-0.02em' }}
          >
            Как подключиться
          </h2>
          <p className="text-base leading-relaxed" style={{ color: '#94A3B8' }}>
            От заявки до первых лидов — обычно занимает 3–4 рабочих дня.
          </p>
        </div>

        {/* Steps - horizontal on desktop */}
        <div className="relative">
          {/* Connector line */}
          <div
            className="absolute top-10 left-0 right-0 h-px hidden lg:block"
            style={{
              background: 'linear-gradient(90deg, transparent 5%, rgba(255,255,255,0.08) 15%, rgba(255,255,255,0.08) 85%, transparent 95%)',
              opacity: inView ? 1 : 0,
              transition: 'opacity 0.7s ease 0.3s',
            }}
          >
            {/* Animated progress */}
            <div
              className="h-full"
              style={{
                background: 'linear-gradient(90deg, #34F5A3, #38BDF8)',
                width: inView ? '100%' : '0%',
                transition: 'width 1.5s ease 0.5s',
              }}
            />
          </div>

          <div className="grid lg:grid-cols-5 gap-6 lg:gap-4">
            {steps.map((step, i) => (
              <div
                key={step.num}
                className="flex flex-col items-center text-center relative"
                style={{
                  opacity: inView ? 1 : 0,
                  transform: inView ? 'translateY(0)' : 'translateY(20px)',
                  transition: `opacity 0.5s ease ${0.1 + i * 0.12}s, transform 0.5s ease ${0.1 + i * 0.12}s`,
                }}
              >
                {/* Circle */}
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center mb-5 relative z-10"
                  style={{
                    background: `rgba(${step.color === '#38BDF8' ? '56,189,248' : step.color === '#34F5A3' ? '52,245,163' : '250,204,21'}, 0.1)`,
                    border: `2px solid ${step.color}40`,
                    color: step.color,
                  }}
                >
                  {/* Step number */}
                  <div
                    className="absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black"
                    style={{
                      background: step.color,
                      color: '#0B0F14',
                    }}
                  >
                    {step.num}
                  </div>
                  {step.icon}
                </div>

                {/* Timing badge */}
                {step.timing && (
                  <div
                    className="text-xs font-medium px-2.5 py-1 rounded-full mb-3"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: '#475569',
                    }}
                  >
                    {step.timing}
                  </div>
                )}
                {!step.timing && <div className="mb-3 h-6" />}

                <h3 className="text-sm font-semibold mb-2" style={{ color: '#F8FAFC' }}>
                  {step.title}
                </h3>
                <p className="text-xs leading-relaxed" style={{ color: '#64748B' }}>
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA block */}
        <div
          className="mt-16 flex flex-col items-center gap-5"
          style={{
            opacity: inView ? 1 : 0,
            transition: 'opacity 0.7s ease 0.7s',
          }}
        >
          <a
            href="#cta"
            className="inline-flex items-center gap-2 px-10 py-4 rounded-xl text-sm font-bold transition-all duration-200 glow-green"
            style={{
              background: 'linear-gradient(135deg, #34F5A3 0%, #2DD4BF 100%)',
              color: '#0B0F14',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
              (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 40px rgba(52, 245, 163, 0.5)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
              (e.currentTarget as HTMLElement).style.boxShadow = '';
            }}
          >
            Подключиться
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <p className="text-sm" style={{ color: '#475569' }}>
            Первые дни — короткое обучение и запуск
          </p>
        </div>
      </div>
    </section>
  );
}
