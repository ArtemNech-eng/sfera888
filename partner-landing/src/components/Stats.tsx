import { useEffect, useRef, useState } from 'react';

function useInView(ref: React.RefObject<HTMLElement | null>, threshold = 0.3) {
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

function Counter({ target, suffix = '', prefix = '', duration = 1600 }: { target: number; suffix?: string; prefix?: string; duration?: number }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting && !started) setStarted(true); }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    let start: number | null = null;
    const tick = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setVal(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [started, target, duration]);

  return <span ref={ref}>{prefix}{val.toLocaleString('ru-RU')}{suffix}</span>;
}

const stats = [
  {
    value: 1247,
    suffix: '',
    label: 'Лидов в системе за последнюю неделю',
    sub: 'Реальные обращения от клиентов Авито',
    color: '#34F5A3',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M2 16l5-5 4 3 4-6 5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    value: 38,
    suffix: '',
    label: 'Активных партнёров в системе',
    sub: 'Работают прямо сейчас',
    color: '#38BDF8',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="8" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="15" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M2 19c0-3.314 2.686-6 6-6h1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M11 19c0-3.314 2.686-6 6-6h0a4 4 0 014 4v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    value: 12,
    suffix: ' городов',
    label: 'Городов в сети платформы',
    sub: 'Москва, СПб, Казань и другие',
    color: '#FACC15',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="11" cy="10" r="4" stroke="currentColor" strokeWidth="1.5" />
        <path d="M11 2C6.58 2 3 5.58 3 10c0 5.5 8 12 8 12s8-6.5 8-12c0-4.42-3.58-8-8-8Z" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    value: 500,
    prefix: '',
    suffix: ' ₽',
    label: 'За каждый успешный лид',
    sub: 'Фиксированная ставка без торга',
    color: '#34F5A3',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="2" y="5" width="18" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="11" cy="11" r="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M2 9h3M17 9h3M2 13h3M17 13h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function Stats() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref as React.RefObject<HTMLElement>);

  return (
    <section
      ref={ref}
      className="py-16 relative"
      style={{ background: '#0B0F14' }}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s, i) => (
            <div
              key={s.label}
              className="glass-card rounded-2xl p-6 relative overflow-hidden group"
              style={{
                border: `1px solid ${s.color}15`,
                opacity: inView ? 1 : 0,
                transform: inView ? 'translateY(0)' : 'translateY(20px)',
                transition: `opacity 0.5s ease ${i * 0.1}s, transform 0.5s ease ${i * 0.1}s`,
              }}
            >
              {/* Top accent */}
              <div
                className="absolute top-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: `linear-gradient(90deg, transparent, ${s.color}, transparent)` }}
              />

              {/* Icon */}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                style={{
                  background: `rgba(${s.color === '#38BDF8' ? '56,189,248' : s.color === '#34F5A3' ? '52,245,163' : '250,204,21'}, 0.1)`,
                  color: s.color,
                }}
              >
                {s.icon}
              </div>

              {/* Value */}
              <div
                className="text-3xl font-black mb-1"
                style={{ color: s.color }}
              >
                {s.prefix}
                <Counter target={s.value} suffix={s.suffix} />
              </div>

              {/* Label */}
              <div className="text-xs font-semibold mb-1 leading-snug" style={{ color: '#F8FAFC' }}>
                {s.label}
              </div>
              <div className="text-xs" style={{ color: '#334155' }}>
                {s.sub}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
