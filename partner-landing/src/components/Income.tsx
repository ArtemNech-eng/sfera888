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

function AnimatedNumber({ target, suffix = '', prefix = '', duration = 1800 }: { target: number; suffix?: string; prefix?: string; duration?: number }) {
  const [current, setCurrent] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting && !started) setStarted(true); }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    let startTime: number | null = null;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [started, target, duration]);

  return (
    <span ref={ref}>
      {prefix}{current.toLocaleString('ru-RU')}{suffix}
    </span>
  );
}

export default function Income() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref as React.RefObject<HTMLElement>);

  const steps = [
    {
      num: 1,
      title: 'Базовая ставка за лид',
      desc: 'За каждый лид, который прошёл холд 48 часов и не был возвращён мастером как невалидный, начисляется фиксированная сумма.',
      color: '#34F5A3',
    },
    {
      num: 2,
      title: 'Оплата за результат',
      desc: 'Платформа платит только за качественные лиды. Невалидные и возвращённые заявки не засчитываются — это мотивирует работать аккуратнее.',
      color: '#38BDF8',
    },
    {
      num: 3,
      title: 'Учёт рекламного бюджета',
      desc: 'Бюджет на продвижение аккаунта Авито оплачивается платформой заранее и учитывается в итоговом расчёте выплаты за период.',
      color: '#FACC15',
    },
  ];

  return (
    <section
      ref={ref}
      id="income"
      className="py-28 relative"
      style={{ background: '#0F172A' }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(250, 204, 21, 0.25), transparent)' }}
        />
        <div
          className="absolute -top-32 left-1/4 w-96 h-96 rounded-full opacity-10"
          style={{
            background: 'radial-gradient(ellipse, rgba(250, 204, 21, 0.25) 0%, transparent 70%)',
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
              background: 'rgba(250, 204, 21, 0.08)',
              border: '1px solid rgba(250, 204, 21, 0.2)',
              color: '#FACC15',
            }}
          >
            Финансовая модель
          </div>
          <h2
            className="text-3xl lg:text-4xl font-bold mb-4 tracking-tight"
            style={{ color: '#F8FAFC', letterSpacing: '-0.02em' }}
          >
            Как вы зарабатываете
          </h2>
          <p className="text-base leading-relaxed" style={{ color: '#94A3B8' }}>
            Прозрачная модель без скрытых условий. Понятно, за что начисляется оплата и как формируется итоговая выплата.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 items-start">
          {/* Left — explanation */}
          <div className="space-y-5">
            {steps.map((step, i) => (
              <div
                key={step.num}
                className="glass-card rounded-2xl p-6 relative overflow-hidden"
                style={{
                  opacity: inView ? 1 : 0,
                  transform: inView ? 'translateX(0)' : 'translateX(-30px)',
                  transition: `opacity 0.6s ease ${i * 0.12}s, transform 0.6s ease ${i * 0.12}s`,
                  border: `1px solid ${step.color}20`,
                }}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold"
                    style={{
                      background: `rgba(${step.color === '#34F5A3' ? '52,245,163' : step.color === '#38BDF8' ? '56,189,248' : '250,204,21'}, 0.12)`,
                      color: step.color,
                    }}
                  >
                    {step.num}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold mb-2" style={{ color: '#F8FAFC' }}>
                      {step.title}
                    </h3>
                    <p className="text-sm leading-relaxed" style={{ color: '#64748B' }}>
                      {step.desc}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {/* Key rate callout */}
            <div
              className="rounded-2xl p-5 relative overflow-hidden"
              style={{
                background: 'rgba(52, 245, 163, 0.05)',
                border: '1px solid rgba(52, 245, 163, 0.25)',
                opacity: inView ? 1 : 0,
                transition: 'opacity 0.6s ease 0.4s',
              }}
            >
              <div
                className="absolute top-0 left-0 right-0 h-0.5"
                style={{ background: 'linear-gradient(90deg, #34F5A3, transparent)' }}
              />
              <div className="flex items-center gap-4">
                <div>
                  <div className="text-xs" style={{ color: '#64748B' }}>
                    Ставка за успешный лид
                  </div>
                  <div className="text-3xl font-black" style={{ color: '#34F5A3' }}>
                    500 ₽
                  </div>
                </div>
                <div className="h-12 w-px" style={{ background: 'rgba(52, 245, 163, 0.2)' }} />
                <p className="text-xs leading-relaxed flex-1" style={{ color: '#64748B' }}>
                  Лид считается успешным, если прошёл 48 часов после передачи
                  и не был возвращён мастером как невалидный.
                </p>
              </div>
            </div>
          </div>

          {/* Right — calculator */}
          <div
            className="glass-card rounded-2xl overflow-hidden"
            style={{
              border: '1px solid rgba(255,255,255,0.1)',
              opacity: inView ? 1 : 0,
              transform: inView ? 'translateX(0)' : 'translateX(30px)',
              transition: 'opacity 0.6s ease 0.2s, transform 0.6s ease 0.2s',
            }}
          >
            {/* Header */}
            <div
              className="px-7 py-5"
              style={{
                background: 'rgba(255,255,255,0.02)',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: '#F8FAFC' }}>
                  Пример расчёта выплаты
                </span>
                <div
                  className="text-xs px-2.5 py-1 rounded-full font-medium"
                  style={{
                    background: 'rgba(250, 204, 21, 0.1)',
                    color: '#FACC15',
                    border: '1px solid rgba(250, 204, 21, 0.2)',
                  }}
                >
                  Реалистичный сценарий
                </div>
              </div>
            </div>

            {/* Calc body */}
            <div className="p-7 space-y-4">
              {/* Row */}
              {[
                {
                  label: 'Успешных лидов за период',
                  value: '100',
                  unit: 'шт.',
                  color: '#F8FAFC',
                  bg: 'rgba(255,255,255,0.03)',
                },
                {
                  label: 'Ставка за лид',
                  value: '500 ₽',
                  unit: '',
                  color: '#34F5A3',
                  bg: 'rgba(52, 245, 163, 0.04)',
                },
                {
                  label: 'Начислено',
                  value: '50 000 ₽',
                  unit: '',
                  color: '#34F5A3',
                  bg: 'rgba(52, 245, 163, 0.06)',
                  large: true,
                },
              ].map((row) => (
                <div
                  key={row.label}
                  className={`flex items-center justify-between p-4 rounded-xl ${row.large ? 'py-5' : ''}`}
                  style={{ background: row.bg, border: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <span className="text-sm" style={{ color: '#94A3B8' }}>
                    {row.label}
                  </span>
                  <span
                    className={`font-bold ${row.large ? 'text-xl' : 'text-base'}`}
                    style={{ color: row.color }}
                  >
                    {row.value}
                    {row.unit && (
                      <span className="text-xs ml-1 font-normal" style={{ color: '#475569' }}>
                        {row.unit}
                      </span>
                    )}
                  </span>
                </div>
              ))}

              {/* Divider */}
              <div className="relative py-2">
                <div
                  className="absolute inset-0 flex items-center"
                  style={{ padding: '0 1px' }}
                >
                  <div className="w-full" style={{ borderTop: '1px dashed rgba(255,255,255,0.1)' }} />
                </div>
                <div className="relative flex justify-center">
                  <span
                    className="px-3 text-xs"
                    style={{ background: '#111827', color: '#475569' }}
                  >
                    минус рекламный бюджет
                  </span>
                </div>
              </div>

              {/* Ad budget */}
              <div
                className="flex items-center justify-between p-4 rounded-xl"
                style={{
                  background: 'rgba(250, 204, 21, 0.04)',
                  border: '1px solid rgba(250, 204, 21, 0.12)',
                }}
              >
                <div>
                  <div className="text-sm" style={{ color: '#94A3B8' }}>
                    Рекламный бюджет за период
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: '#475569' }}>
                    Оплачен платформой, учитывается в расчёте
                  </div>
                </div>
                <span className="text-base font-bold" style={{ color: '#FACC15' }}>
                  − 15 000 ₽
                </span>
              </div>

              {/* Result */}
              <div
                className="p-5 rounded-xl relative overflow-hidden"
                style={{
                  background: 'rgba(52, 245, 163, 0.08)',
                  border: '1px solid rgba(52, 245, 163, 0.3)',
                }}
              >
                <div
                  className="absolute top-0 left-0 right-0 h-0.5"
                  style={{ background: 'linear-gradient(90deg, #34F5A3, #38BDF8)' }}
                />
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium mb-1" style={{ color: '#94A3B8' }}>
                      Итог к выплате
                    </div>
                    <div className="text-3xl font-black" style={{ color: '#34F5A3' }}>
                      {inView && <AnimatedNumber target={35000} suffix=" ₽" duration={1600} />}
                      {!inView && '35 000 ₽'}
                    </div>
                  </div>
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center"
                    style={{
                      background: 'rgba(52, 245, 163, 0.12)',
                      border: '1px solid rgba(52, 245, 163, 0.3)',
                    }}
                  >
                    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ color: '#34F5A3' }}>
                      <path d="M11 3v16M6 7l5-4 5 4M6 14.5l5 4.5 5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Footnote */}
              <p className="text-xs text-center" style={{ color: '#475569' }}>
                Чем качественнее лиды и выше конверсия — тем больше итоговый доход.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
