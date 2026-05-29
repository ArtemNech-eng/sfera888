import { useEffect, useRef, useState } from 'react';

const mockLeads = [
  { id: 'LID-4821', city: 'Москва', service: 'Укладка плитки', status: 'active', value: 500 },
  { id: 'LID-4819', city: 'СПб', service: 'Электрика', status: 'paid', value: 500 },
  { id: 'LID-4816', city: 'Казань', service: 'Покраска стен', status: 'active', value: 500 },
  { id: 'LID-4814', city: 'Москва', service: 'Сантехника', status: 'paid', value: 500 },
  { id: 'LID-4811', city: 'Новосибирск', service: 'Монтаж дверей', status: 'hold', value: 500 },
];

const stats = [
  { label: 'Лидов за неделю', value: '1 247', color: '#34F5A3' },
  { label: 'Активных партнёров', value: '38', color: '#38BDF8' },
  { label: 'Городов', value: '12', color: '#FACC15' },
];

function DashboardMock() {
  const [currentLead, setCurrentLead] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentLead((prev) => (prev + 1) % mockLeads.length);
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-full max-w-lg mx-auto lg:mx-0">
      {/* Glow backdrop */}
      <div
        className="absolute -inset-8 rounded-3xl opacity-30"
        style={{
          background: 'radial-gradient(ellipse at 60% 40%, rgba(52, 245, 163, 0.25) 0%, rgba(56, 189, 248, 0.15) 50%, transparent 70%)',
          filter: 'blur(30px)',
        }}
      />

      {/* Main dashboard panel */}
      <div
        className="relative rounded-2xl p-5 animate-float"
        style={{
          background: 'rgba(15, 23, 42, 0.9)',
          border: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-medium" style={{ color: '#94A3B8' }}>
              Партнёрский кабинет
            </span>
          </div>
          <div
            className="text-xs font-semibold px-3 py-1 rounded-full"
            style={{
              background: 'rgba(52, 245, 163, 0.1)',
              color: '#34F5A3',
              border: '1px solid rgba(52, 245, 163, 0.2)',
            }}
          >
            Онлайн
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Лидов сегодня', value: '14', color: '#34F5A3' },
            { label: 'Успешных', value: '11', color: '#38BDF8' },
            { label: 'К выплате', value: '5 500 ₽', color: '#FACC15' },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl p-3"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <div className="text-lg font-bold mb-1" style={{ color: s.color }}>
                {s.value}
              </div>
              <div className="text-xs" style={{ color: '#64748B' }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Mini chart */}
        <div
          className="rounded-xl p-4 mb-4"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium" style={{ color: '#64748B' }}>
              Лиды за 7 дней
            </span>
            <span className="text-xs font-semibold" style={{ color: '#34F5A3' }}>
              +23%
            </span>
          </div>
          <div className="flex items-end gap-1.5 h-12">
            {[40, 65, 45, 80, 60, 90, 75].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm transition-all duration-500"
                style={{
                  height: `${h}%`,
                  background:
                    i === 6
                      ? 'linear-gradient(to top, #34F5A3, #38BDF8)'
                      : 'rgba(52, 245, 163, 0.25)',
                }}
              />
            ))}
          </div>
        </div>

        {/* Live leads */}
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium" style={{ color: '#64748B' }}>
              Входящие лиды
            </span>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs" style={{ color: '#34F5A3' }}>
                Live
              </span>
            </div>
          </div>

          {mockLeads.slice(0, 3).map((lead, i) => (
            <div
              key={lead.id}
              className="flex items-center justify-between p-2.5 rounded-lg transition-all duration-500"
              style={{
                background: i === currentLead % 3 ? 'rgba(52, 245, 163, 0.05)' : 'rgba(255,255,255,0.02)',
                border: i === currentLead % 3
                  ? '1px solid rgba(52, 245, 163, 0.2)'
                  : '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold"
                  style={{ background: 'rgba(52, 245, 163, 0.1)', color: '#34F5A3' }}
                >
                  {lead.city[0]}
                </div>
                <div>
                  <div className="text-xs font-medium" style={{ color: '#F8FAFC' }}>
                    {lead.service}
                  </div>
                  <div className="text-xs" style={{ color: '#475569' }}>
                    {lead.id} · {lead.city}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{
                    background:
                      lead.status === 'paid'
                        ? 'rgba(52, 245, 163, 0.1)'
                        : lead.status === 'active'
                        ? 'rgba(56, 189, 248, 0.1)'
                        : 'rgba(250, 204, 21, 0.1)',
                    color:
                      lead.status === 'paid'
                        ? '#34F5A3'
                        : lead.status === 'active'
                        ? '#38BDF8'
                        : '#FACC15',
                  }}
                >
                  {lead.status === 'paid' ? 'Выплачен' : lead.status === 'active' ? 'Активен' : 'Холд'}
                </span>
                <span className="text-xs font-semibold" style={{ color: '#34F5A3' }}>
                  +500 ₽
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Monthly summary */}
        <div
          className="mt-4 p-3 rounded-xl flex items-center justify-between"
          style={{ background: 'rgba(52, 245, 163, 0.06)', border: '1px solid rgba(52, 245, 163, 0.15)' }}
        >
          <div>
            <div className="text-xs" style={{ color: '#64748B' }}>
              Выплата за месяц
            </div>
            <div className="text-base font-bold" style={{ color: '#34F5A3' }}>
              35 000 ₽
            </div>
          </div>
          <div
            className="text-xs font-semibold px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(52, 245, 163, 0.15)', color: '#34F5A3' }}
          >
            Получить
          </div>
        </div>
      </div>

      {/* Floating notification */}
      <div
        className="absolute -top-3 -right-3 rounded-xl px-3 py-2 flex items-center gap-2"
        style={{
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(52, 245, 163, 0.3)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-xs font-medium" style={{ color: '#34F5A3' }}>
          Новый лид
        </span>
      </div>
    </div>
  );
}

export default function Hero() {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <section
      ref={ref}
      className="relative min-h-screen flex items-center pt-20"
      style={{ background: '#0B0F14' }}
    >
      {/* Background gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full opacity-20"
          style={{
            background: 'radial-gradient(ellipse, rgba(52, 245, 163, 0.15) 0%, rgba(56, 189, 248, 0.08) 50%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
        <div
          className="absolute top-1/3 -right-32 w-[500px] h-[500px] rounded-full opacity-15"
          style={{
            background: 'radial-gradient(ellipse, rgba(56, 189, 248, 0.2) 0%, transparent 60%)',
            filter: 'blur(80px)',
          }}
        />
        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 lg:px-8 w-full py-20 lg:py-28">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left column */}
          <div
            className="space-y-8"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(30px)',
              transition: 'opacity 0.9s ease, transform 0.9s ease',
            }}
          >
            {/* Badge */}
            <div className="inline-flex items-center gap-2">
              <div
                className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium"
                style={{
                  background: 'rgba(52, 245, 163, 0.08)',
                  border: '1px solid rgba(52, 245, 163, 0.2)',
                  color: '#34F5A3',
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full inline-block animate-pulse"
                  style={{ background: '#34F5A3' }}
                />
                Партнёрская программа — 2025
              </div>
            </div>

            {/* Main headline */}
            <div className="space-y-4">
              <h1
                className="text-4xl lg:text-5xl xl:text-6xl font-bold leading-tight tracking-tight"
                style={{ color: '#F8FAFC', letterSpacing: '-0.02em' }}
              >
                Превратите свой
                <br />
                <span className="text-gradient-green">аккаунт Авито</span>
                <br />
                в источник стабильного дохода
              </h1>

              <p
                className="text-lg leading-relaxed max-w-xl"
                style={{ color: '#94A3B8' }}
              >
                Честный Мастер — городская платформа ремонта. Вы работаете со своим аккаунтом Авито,
                приводите лиды в систему и получаете прозрачную оплату за результат.
              </p>
            </div>

            {/* Subblock */}
            <div
              className="p-5 rounded-xl"
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div className="space-y-2">
                {[
                  'Не подработка. Не хаос. Не просто переписка.',
                  'Чёткая модель, цифровой учёт и понятная оплата.',
                ].map((t, i) => (
                  <p key={i} className="text-sm font-medium" style={{ color: i === 0 ? '#F8FAFC' : '#64748B' }}>
                    {t}
                  </p>
                ))}
              </div>
            </div>

            {/* 3 key theses */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { icon: '▸', text: 'Работа через ваш аккаунт Авито', color: '#34F5A3' },
                { icon: '▸', text: 'Заявки и статистика внутри платформы', color: '#38BDF8' },
                { icon: '▸', text: 'Понятная оплата и прозрачный результат', color: '#FACC15' },
              ].map((item) => (
                <div
                  key={item.text}
                  className="flex items-start gap-2 p-3 rounded-lg"
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <span className="text-xs mt-0.5 font-bold shrink-0" style={{ color: item.color }}>
                    {item.icon}
                  </span>
                  <span className="text-xs font-medium leading-relaxed" style={{ color: '#94A3B8' }}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4">
              <a
                href="#cta"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-sm font-bold transition-all duration-200 animate-pulse-glow"
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
                Подключиться как партнёр
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
              <a
                href="#income"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-sm font-semibold transition-all duration-200"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#F8FAFC',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.2)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.12)';
                }}
              >
                Посмотреть условия
              </a>
            </div>
          </div>

          {/* Right column — Dashboard mock */}
          <div
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(30px)',
              transition: 'opacity 1.1s ease 0.2s, transform 1.1s ease 0.2s',
            }}
          >
            <DashboardMock />
          </div>
        </div>

        {/* Bottom stats strip */}
        <div
          className="mt-20 pt-8"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="grid grid-cols-3 gap-4 max-w-lg">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="text-2xl lg:text-3xl font-bold mb-1" style={{ color: s.color }}>
                  {s.value}
                </div>
                <div className="text-xs" style={{ color: '#475569' }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
