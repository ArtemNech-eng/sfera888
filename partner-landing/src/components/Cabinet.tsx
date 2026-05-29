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

const cabinetItems = [
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M2 9C2 5.134 5.134 2 9 2s7 3.134 7 7-3.134 7-7 7-7-3.134-7-7Z" stroke="currentColor" strokeWidth="1.4" />
        <path d="M9 5.5V9l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
    title: 'Лиды в реальном времени',
    desc: 'Все входящие обращения, их статус и история',
    color: '#38BDF8',
    mockValue: '14 сегодня',
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="1.5" y="1.5" width="15" height="15" rx="3" stroke="currentColor" strokeWidth="1.4" />
        <path d="M5 9h3l2-4 2 8 1-4h1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Статус каждого лида',
    desc: 'Активен, в холде, успешен, возвращён',
    color: '#34F5A3',
    mockValue: '11 успешных',
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 2v14M4 6.5l5-4.5 5 4.5M4 12l5 4 5-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Начисления и выплаты',
    desc: 'История платежей, текущий баланс и расчёт',
    color: '#FACC15',
    mockValue: '35 000 ₽',
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M3 12V6l6-4 6 4v6l-6 4-6-4Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M9 10a2 2 0 100-4 2 2 0 000 4Z" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
    title: 'План на период',
    desc: 'Целевые показатели и прогресс по лидам',
    color: '#38BDF8',
    mockValue: '68% выполнено',
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M2 5h14M2 9h10M2 13h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="14.5" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M16.5 14l1.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
    title: 'Итог по месяцу',
    desc: 'Финальный отчёт: лиды, бюджет, выплата',
    color: '#34F5A3',
    mockValue: 'Готов 1-го числа',
  },
];

export default function Cabinet() {
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
          style={{ background: 'linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.2), transparent)' }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(52, 245, 163, 0.15), transparent)' }}
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
              background: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              color: '#38BDF8',
            }}
          >
            Кабинет партнёра
          </div>
          <h2
            className="text-3xl lg:text-4xl font-bold mb-4 tracking-tight"
            style={{ color: '#F8FAFC', letterSpacing: '-0.02em' }}
          >
            Что вы будете видеть
            <br />
            в своём кабинете
          </h2>
          <p className="text-base leading-relaxed" style={{ color: '#94A3B8' }}>
            Полная картина работы в одном месте. Никаких таблиц в мессенджерах
            и ручных подсчётов — всё в цифровом интерфейсе.
          </p>
        </div>

        <div className="grid lg:grid-cols-12 gap-6">
          {/* Left — items */}
          <div className="lg:col-span-5 space-y-3">
            {cabinetItems.map((item, i) => (
              <div
                key={item.title}
                className="glass-card rounded-xl p-4 flex items-center gap-4 group cursor-default transition-all duration-200"
                style={{
                  opacity: inView ? 1 : 0,
                  transform: inView ? 'translateX(0)' : 'translateX(-20px)',
                  transition: `opacity 0.5s ease ${0.05 + i * 0.08}s, transform 0.5s ease ${0.05 + i * 0.08}s`,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = `${item.color}30`;
                  (e.currentTarget as HTMLElement).style.background = `rgba(${item.color === '#38BDF8' ? '56,189,248' : item.color === '#34F5A3' ? '52,245,163' : '250,204,21'}, 0.04)`;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = '';
                  (e.currentTarget as HTMLElement).style.background = '';
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background: `rgba(${item.color === '#38BDF8' ? '56,189,248' : item.color === '#34F5A3' ? '52,245,163' : '250,204,21'}, 0.1)`,
                    color: item.color,
                  }}
                >
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold mb-0.5" style={{ color: '#F8FAFC' }}>
                    {item.title}
                  </div>
                  <div className="text-xs" style={{ color: '#475569' }}>
                    {item.desc}
                  </div>
                </div>
                <div
                  className="text-xs font-semibold shrink-0"
                  style={{ color: item.color }}
                >
                  {item.mockValue}
                </div>
              </div>
            ))}
          </div>

          {/* Right — mock dashboard */}
          <div
            className="lg:col-span-7"
            style={{
              opacity: inView ? 1 : 0,
              transform: inView ? 'translateX(0)' : 'translateX(30px)',
              transition: 'opacity 0.7s ease 0.2s, transform 0.7s ease 0.2s',
            }}
          >
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: 'rgba(15, 23, 42, 0.9)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              {/* Mock header */}
              <div
                className="flex items-center justify-between px-6 py-4"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 opacity-70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500 opacity-70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500 opacity-70" />
                </div>
                <span className="text-xs" style={{ color: '#475569' }}>
                  partner.chestniy-master.ru
                </span>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs" style={{ color: '#34F5A3' }}>
                    Online
                  </span>
                </div>
              </div>

              {/* Mock content */}
              <div className="p-6">
                {/* Top stats */}
                <div className="grid grid-cols-4 gap-3 mb-5">
                  {[
                    { label: 'Лидов всего', value: '247', color: '#F8FAFC' },
                    { label: 'Успешных', value: '198', color: '#34F5A3' },
                    { label: 'В холде', value: '31', color: '#FACC15' },
                    { label: 'Возвращено', value: '18', color: '#EF4444' },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="rounded-xl p-3 text-center"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <div className="text-lg font-bold" style={{ color: s.color }}>
                        {s.value}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: '#475569' }}>
                        {s.label}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Chart area */}
                <div
                  className="rounded-xl p-4 mb-4"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium" style={{ color: '#64748B' }}>
                      Лиды по дням (текущий месяц)
                    </span>
                    <div className="flex items-center gap-3">
                      {[
                        { color: '#34F5A3', label: 'Успешные' },
                        { color: '#FACC15', label: 'Холд' },
                      ].map((l) => (
                        <div key={l.label} className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-sm" style={{ background: l.color }} />
                          <span className="text-xs" style={{ color: '#475569' }}>
                            {l.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-end gap-1 h-16">
                    {[
                      [7, 2], [9, 3], [6, 1], [11, 4], [8, 2], [13, 3],
                      [10, 2], [14, 5], [9, 2], [12, 3], [7, 1], [15, 4],
                      [11, 3], [8, 2], [6, 1],
                    ].map(([a, b], i) => {
                      const maxVal = 15;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center justify-end gap-0.5" style={{ height: '100%' }}>
                          <div
                            className="w-full rounded-sm"
                            style={{ height: `${(b / maxVal) * 100}%`, background: 'rgba(250,204,21,0.4)' }}
                          />
                          <div
                            className="w-full rounded-sm"
                            style={{ height: `${(a / maxVal) * 100}%`, background: 'rgba(52,245,163,0.6)' }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Leads table */}
                <div
                  className="rounded-xl overflow-hidden"
                  style={{ border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div
                    className="px-4 py-2.5 grid grid-cols-4 text-xs font-medium"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      color: '#475569',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <span>ID</span>
                    <span>Тип работы</span>
                    <span>Дата</span>
                    <span className="text-right">Статус</span>
                  </div>
                  {[
                    { id: 'LID-4821', type: 'Плитка', date: '24.06', status: 'Активен', sc: '#38BDF8' },
                    { id: 'LID-4819', type: 'Электрика', date: '23.06', status: 'Выплачен', sc: '#34F5A3' },
                    { id: 'LID-4816', type: 'Покраска', date: '22.06', status: 'Выплачен', sc: '#34F5A3' },
                    { id: 'LID-4814', type: 'Сантехника', date: '22.06', status: 'Холд', sc: '#FACC15' },
                  ].map((row) => (
                    <div
                      key={row.id}
                      className="px-4 py-2.5 grid grid-cols-4 text-xs"
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        color: '#94A3B8',
                      }}
                    >
                      <span style={{ color: '#64748B' }}>{row.id}</span>
                      <span>{row.type}</span>
                      <span style={{ color: '#475569' }}>{row.date}</span>
                      <div className="flex justify-end">
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{
                            background: `rgba(${row.sc === '#38BDF8' ? '56,189,248' : row.sc === '#34F5A3' ? '52,245,163' : '250,204,21'}, 0.1)`,
                            color: row.sc,
                            border: `1px solid ${row.sc}25`,
                          }}
                        >
                          {row.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
