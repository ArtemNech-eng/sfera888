import { useEffect, useRef, useState } from 'react';

const steps = [
  {
    num: '01',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="2" y="3" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 8h8M7 11h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: 'Клиенты пишут вам в Авито',
    desc: 'Пользователи находят ваш аккаунт через поиск и объявления. Вы получаете входящие сообщения с запросами на ремонт.',
    color: '#38BDF8',
  },
  {
    num: '02',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M11 2L13.5 7.5L20 8.3L15.5 12.5L16.8 19L11 16L5.2 19L6.5 12.5L2 8.3L8.5 7.5L11 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Вы быстро отвечаете по скрипту',
    desc: 'Обрабатываете запрос по готовому скрипту. Задаёте несколько уточняющих вопросов, чтобы зафиксировать детали.',
    color: '#34F5A3',
  },
  {
    num: '03',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="3" y="2" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 7h8M7 10.5h8M7 14h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="16" cy="16" r="4" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.5" />
        <path d="M14.5 16L15.5 17L17.5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Заводите лид в систему',
    desc: 'Передаёте данные клиента в платформу через интерфейс. Лид фиксируется в CRM и получает уникальный идентификатор.',
    color: '#FACC15',
  },
  {
    num: '04',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="11" cy="11" r="9" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 11l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Платформа передаёт лид мастерам',
    desc: 'Система автоматически маршрутизирует заявку к подходящим мастерам по типу работ и локации.',
    color: '#34F5A3',
  },
  {
    num: '05',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="2" y="5" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6 9h4M6 12h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="16" cy="11" r="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M15 11l.8.8 1.2-1.2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Вы получаете оплату за результат',
    desc: 'Если лид прошёл холд 48 часов и не возвращён как невалидный — начисляется 500 ₽. Чисто. Прозрачно.',
    color: '#FACC15',
  },
];

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

export default function HowItWorks() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref as React.RefObject<HTMLElement>);

  return (
    <section
      ref={ref}
      id="model"
      className="py-28 relative"
      style={{ background: '#0F172A' }}
    >
      {/* Background accent */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(52, 245, 163, 0.3), transparent)' }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.2), transparent)' }}
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
            Механика работы
          </div>
          <h2
            className="text-3xl lg:text-4xl font-bold mb-4 tracking-tight"
            style={{ color: '#F8FAFC', letterSpacing: '-0.02em' }}
          >
            Как работает партнёрская модель
          </h2>
          <p className="text-base leading-relaxed" style={{ color: '#94A3B8' }}>
            Простая цепочка без лишних шагов. Ваша зона — от обращения до передачи лида.
            Дальше работает платформа.
          </p>
        </div>

        {/* Flow diagram */}
        <div
          className="flex flex-wrap items-center gap-2 mb-14 p-5 rounded-2xl"
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)',
            opacity: inView ? 1 : 0,
            transition: 'opacity 0.7s ease 0.2s',
          }}
        >
          {[
            { label: 'Авито', color: '#38BDF8' },
            { label: 'Лид', color: '#34F5A3' },
            { label: 'CRM', color: '#FACC15' },
            { label: 'Мастера', color: '#34F5A3' },
            { label: 'Оплата', color: '#FACC15' },
          ].map((node, i) => (
            <div key={node.label} className="flex items-center gap-2">
              <div
                className="px-4 py-2 rounded-lg text-sm font-bold"
                style={{
                  background: `rgba(${node.color === '#38BDF8' ? '56,189,248' : node.color === '#34F5A3' ? '52,245,163' : '250,204,21'}, 0.1)`,
                  border: `1px solid ${node.color}30`,
                  color: node.color,
                }}
              >
                {node.label}
              </div>
              {i < 4 && (
                <div className="flex items-center gap-1">
                  <div
                    className="h-px w-6 lg:w-10"
                    style={{ background: 'rgba(255,255,255,0.15)' }}
                  />
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ color: '#475569' }}>
                    <path d="M1 4h6M4 1l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Steps */}
        <div className="grid lg:grid-cols-5 gap-4">
          {steps.map((step, i) => (
            <div
              key={step.num}
              className="glass-card rounded-2xl p-5 relative overflow-hidden group"
              style={{
                opacity: inView ? 1 : 0,
                transform: inView ? 'translateY(0)' : 'translateY(30px)',
                transition: `opacity 0.6s ease ${0.1 + i * 0.1}s, transform 0.6s ease ${0.1 + i * 0.1}s`,
              }}
            >
              {/* Number */}
              <div
                className="absolute top-3 right-4 text-5xl font-black opacity-5 select-none"
                style={{ color: step.color, lineHeight: 1 }}
              >
                {step.num}
              </div>

              {/* Icon */}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                style={{
                  background: `rgba(${step.color === '#38BDF8' ? '56,189,248' : step.color === '#34F5A3' ? '52,245,163' : '250,204,21'}, 0.1)`,
                  color: step.color,
                }}
              >
                {step.icon}
              </div>

              <div
                className="text-xs font-bold mb-2 tracking-widest uppercase"
                style={{ color: step.color }}
              >
                Шаг {step.num}
              </div>

              <h3 className="text-sm font-semibold mb-2 leading-snug" style={{ color: '#F8FAFC' }}>
                {step.title}
              </h3>
              <p className="text-xs leading-relaxed" style={{ color: '#64748B' }}>
                {step.desc}
              </p>

              {/* Bottom accent */}
              <div
                className="absolute bottom-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: `linear-gradient(90deg, transparent, ${step.color}, transparent)` }}
              />
            </div>
          ))}
        </div>

        {/* Signature */}
        <div
          className="mt-10 text-center"
          style={{
            opacity: inView ? 1 : 0,
            transition: 'opacity 0.7s ease 0.7s',
          }}
        >
          <p
            className="text-sm font-medium px-6 py-3 rounded-xl inline-block"
            style={{
              background: 'rgba(52, 245, 163, 0.05)',
              border: '1px solid rgba(52, 245, 163, 0.15)',
              color: '#94A3B8',
            }}
          >
            Ваша задача — завести качественный лид.{' '}
            <span style={{ color: '#34F5A3' }}>Система делает всё остальное.</span>
          </p>
        </div>
      </div>
    </section>
  );
}
