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

const partnerZone = [
  'Отвечает на входящие обращения от клиентов',
  'Задаёт уточняющие вопросы по скрипту',
  'Передаёт квалифицированный лид в систему',
  'Следит за качеством своих заявок',
];

const platformZone = [
  'Подбирает подходящих мастеров под заявку',
  'Передаёт заявку дальше по воронке',
  'Ведёт работу с заказом на объекте',
  'Контролирует этапы выполнения',
  'Управляет финансовой моделью мастеров',
];

const notDoing = [
  'Не пишет сметы',
  'Не ведёт мастеров',
  'Не считает комиссии',
  'Не управляет объектами',
];

export default function WhatPartnerDoes() {
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
          className="absolute -bottom-20 right-0 w-96 h-96 rounded-full opacity-10"
          style={{
            background: 'radial-gradient(ellipse, rgba(52, 245, 163, 0.3) 0%, transparent 70%)',
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
            Зоны ответственности
          </div>
          <h2
            className="text-3xl lg:text-4xl font-bold mb-4 tracking-tight"
            style={{ color: '#F8FAFC', letterSpacing: '-0.02em' }}
          >
            Что именно делает партнёр
          </h2>
          <p className="text-base leading-relaxed" style={{ color: '#94A3B8' }}>
            Чёткое разграничение задач. На вас — работа с входящим потоком.
            На платформе — всё остальное.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Partner zone */}
          <div
            className="glass-card rounded-2xl p-7 relative overflow-hidden"
            style={{
              opacity: inView ? 1 : 0,
              transform: inView ? 'translateY(0)' : 'translateY(30px)',
              transition: 'opacity 0.6s ease 0.1s, transform 0.6s ease 0.1s',
              border: '1px solid rgba(52, 245, 163, 0.2)',
            }}
          >
            <div
              className="absolute top-0 left-0 right-0 h-0.5"
              style={{ background: 'linear-gradient(90deg, transparent, #34F5A3, transparent)' }}
            />

            <div className="flex items-center gap-3 mb-6">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(52, 245, 163, 0.1)' }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ color: '#34F5A3' }}>
                  <circle cx="10" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M3 17c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <div className="text-xs font-bold tracking-widest uppercase mb-0.5" style={{ color: '#34F5A3' }}>
                  Партнёр
                </div>
                <div className="text-sm font-semibold" style={{ color: '#F8FAFC' }}>
                  Ваша зона ответственности
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {partnerZone.map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: 'rgba(52, 245, 163, 0.15)' }}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ color: '#34F5A3' }}>
                      <path d="M2 5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <span className="text-sm leading-relaxed" style={{ color: '#94A3B8' }}>
                    {item}
                  </span>
                </div>
              ))}
            </div>

            <div
              className="mt-6 pt-5 space-y-2"
              style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
            >
              <div className="text-xs font-semibold mb-2" style={{ color: '#475569' }}>
                Не входит в вашу задачу:
              </div>
              {notDoing.map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <div className="w-4 h-px" style={{ background: '#334155' }} />
                  <span className="text-xs" style={{ color: '#475569' }}>
                    {item}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Visual divider */}
          <div
            className="flex flex-col items-center justify-center gap-6 py-8 lg:py-0"
            style={{
              opacity: inView ? 1 : 0,
              transition: 'opacity 0.6s ease 0.25s',
            }}
          >
            {/* Flow visual */}
            <div className="flex flex-col items-center gap-3 text-center">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{
                  background: 'rgba(52, 245, 163, 0.08)',
                  border: '1px solid rgba(52, 245, 163, 0.2)',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ color: '#34F5A3' }}>
                  <path d="M10 3v14M17 10l-7 7-7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-bold uppercase tracking-widest" style={{ color: '#34F5A3' }}>
                  Передача лида
                </div>
                <div className="text-xs" style={{ color: '#475569' }}>
                  Система принимает
                  <br />и маршрутизирует
                </div>
              </div>
            </div>

            {/* Interface mini preview */}
            <div
              className="w-full rounded-xl p-4 hidden lg:block"
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <div className="text-xs font-medium mb-3" style={{ color: '#475569' }}>
                Интерфейс партнёра
              </div>
              {[
                { label: 'Имя клиента', val: 'Андрей К.', color: '#F8FAFC' },
                { label: 'Тип работы', val: 'Укладка плитки', color: '#F8FAFC' },
                { label: 'Город', val: 'Москва', color: '#F8FAFC' },
                { label: 'Статус', val: 'Отправлен', color: '#34F5A3' },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex justify-between items-center py-1.5"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                >
                  <span className="text-xs" style={{ color: '#475569' }}>
                    {row.label}
                  </span>
                  <span className="text-xs font-medium" style={{ color: row.color }}>
                    {row.val}
                  </span>
                </div>
              ))}
              <div
                className="mt-3 py-2 rounded-lg text-center text-xs font-semibold"
                style={{
                  background: 'rgba(52, 245, 163, 0.1)',
                  color: '#34F5A3',
                  border: '1px solid rgba(52, 245, 163, 0.2)',
                }}
              >
                Лид передан в систему
              </div>
            </div>
          </div>

          {/* Platform zone */}
          <div
            className="glass-card rounded-2xl p-7 relative overflow-hidden"
            style={{
              opacity: inView ? 1 : 0,
              transform: inView ? 'translateY(0)' : 'translateY(30px)',
              transition: 'opacity 0.6s ease 0.2s, transform 0.6s ease 0.2s',
              border: '1px solid rgba(56, 189, 248, 0.15)',
            }}
          >
            <div
              className="absolute top-0 left-0 right-0 h-0.5"
              style={{ background: 'linear-gradient(90deg, transparent, #38BDF8, transparent)' }}
            />

            <div className="flex items-center gap-3 mb-6">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(56, 189, 248, 0.1)' }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ color: '#38BDF8' }}>
                  <rect x="2" y="2" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M7 10h6M10 7v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <div className="text-xs font-bold tracking-widest uppercase mb-0.5" style={{ color: '#38BDF8' }}>
                  Платформа
                </div>
                <div className="text-sm font-semibold" style={{ color: '#F8FAFC' }}>
                  Зона платформы
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {platformZone.map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: 'rgba(56, 189, 248, 0.12)' }}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ color: '#38BDF8' }}>
                      <path d="M2 5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <span className="text-sm leading-relaxed" style={{ color: '#94A3B8' }}>
                    {item}
                  </span>
                </div>
              ))}
            </div>

            <div
              className="mt-6 p-4 rounded-xl"
              style={{ background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.1)' }}
            >
              <p className="text-xs leading-relaxed" style={{ color: '#64748B' }}>
                После передачи лида ваша задача завершена.
                Платформа берёт на себя весь дальнейший процесс.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
