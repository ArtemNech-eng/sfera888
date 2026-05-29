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

export default function FinalCTA() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref as React.RefObject<HTMLElement>);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [avito, setAvito] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ login: string; password: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone || !city) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/partner/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, city, avitoAccountLink: avito }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || 'Ошибка регистрации');
        return;
      }
      setResult(data.password ? { login: data.login, password: data.password } : null);
      setSubmitted(true);
    } catch {
      setError('Не удалось подключиться к серверу');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      ref={ref}
      id="cta"
      className="py-28 relative overflow-hidden"
      style={{ background: '#0F172A' }}
    >
      {/* Background effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(52, 245, 163, 0.3), transparent)' }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at 50% 0%, rgba(52, 245, 163, 0.08) 0%, transparent 60%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-4"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="max-w-5xl mx-auto px-6 lg:px-8 relative">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left text */}
          <div
            style={{
              opacity: inView ? 1 : 0,
              transform: inView ? 'translateX(0)' : 'translateX(-30px)',
              transition: 'opacity 0.7s ease, transform 0.7s ease',
            }}
          >
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6"
              style={{
                background: 'rgba(52, 245, 163, 0.08)',
                border: '1px solid rgba(52, 245, 163, 0.2)',
                color: '#34F5A3',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full inline-block animate-pulse" style={{ background: '#34F5A3' }} />
              Принимаем заявки
            </div>

            <h2
              className="text-3xl lg:text-4xl font-bold mb-5 tracking-tight leading-tight"
              style={{ color: '#F8FAFC', letterSpacing: '-0.02em' }}
            >
              Подключитесь к системе и начните монетизировать свой аккаунт
            </h2>

            <p className="text-base leading-relaxed mb-8" style={{ color: '#94A3B8' }}>
              Если у вас есть сильный аккаунт Авито, мы поможем превратить его
              в понятный рабочий канал дохода.
            </p>

            {/* Trust points */}
            <div className="space-y-3">
              {[
                { label: 'Прозрачная модель оплаты — без сюрпризов', color: '#34F5A3' },
                { label: 'Цифровой учёт каждого лида', color: '#38BDF8' },
                { label: 'Партнёрский кабинет с аналитикой', color: '#FACC15' },
                { label: 'Поддержка на каждом этапе', color: '#34F5A3' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: `rgba(${item.color === '#38BDF8' ? '56,189,248' : item.color === '#34F5A3' ? '52,245,163' : '250,204,21'}, 0.15)` }}
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ color: item.color }}>
                      <path d="M1.5 4L3 5.5L6.5 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <span className="text-sm" style={{ color: '#94A3B8' }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — Form */}
          <div
            style={{
              opacity: inView ? 1 : 0,
              transform: inView ? 'translateX(0)' : 'translateX(30px)',
              transition: 'opacity 0.7s ease 0.2s, transform 0.7s ease 0.2s',
            }}
          >
            <div
              className="rounded-2xl overflow-hidden relative"
              style={{
                background: 'rgba(17, 24, 39, 0.9)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <div
                className="absolute top-0 left-0 right-0 h-0.5"
                style={{ background: 'linear-gradient(90deg, #34F5A3, #38BDF8)' }}
              />

              {!submitted ? (
                <div className="p-7">
                  <h3 className="text-lg font-bold mb-1.5" style={{ color: '#F8FAFC' }}>
                    Стать партнёром
                  </h3>
                  <p className="text-sm mb-6" style={{ color: '#64748B' }}>
                    Оставьте заявку — мы свяжемся в течение рабочего дня
                  </p>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Name */}
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: '#64748B' }}>
                        Ваше имя
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Иван Петров"
                        required
                        className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200"
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: '#F8FAFC',
                        }}
                        onFocus={(e) => {
                          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(52, 245, 163, 0.4)';
                          (e.currentTarget as HTMLElement).style.background = 'rgba(52, 245, 163, 0.03)';
                        }}
                        onBlur={(e) => {
                          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)';
                          (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                        }}
                      />
                    </div>

                    {/* Phone */}
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: '#64748B' }}>
                        Телефон или Telegram
                      </label>
                      <input
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+7 900 000-00-00 или @username"
                        required
                        className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200"
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: '#F8FAFC',
                        }}
                        onFocus={(e) => {
                          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(52, 245, 163, 0.4)';
                          (e.currentTarget as HTMLElement).style.background = 'rgba(52, 245, 163, 0.03)';
                        }}
                        onBlur={(e) => {
                          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)';
                          (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                        }}
                      />
                    </div>

                    {/* City */}
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: '#64748B' }}>
                        Город
                      </label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Москва"
                        required
                        className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200"
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: '#F8FAFC',
                        }}
                        onFocus={(e) => {
                          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(52, 245, 163, 0.4)';
                          (e.currentTarget as HTMLElement).style.background = 'rgba(52, 245, 163, 0.03)';
                        }}
                        onBlur={(e) => {
                          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)';
                          (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                        }}
                      />
                    </div>

                    {/* Avito link */}
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: '#64748B' }}>
                        Ссылка на ваш аккаунт Авито
                        <span className="ml-1" style={{ color: '#334155' }}>
                          (необязательно, но ускорит проверку)
                        </span>
                      </label>
                      <input
                        type="text"
                        value={avito}
                        onChange={(e) => setAvito(e.target.value)}
                        placeholder="avito.ru/user/..."
                        className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200"
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: '#F8FAFC',
                        }}
                        onFocus={(e) => {
                          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(52, 245, 163, 0.4)';
                          (e.currentTarget as HTMLElement).style.background = 'rgba(52, 245, 163, 0.03)';
                        }}
                        onBlur={(e) => {
                          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)';
                          (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                        }}
                      />
                    </div>

                    {error && (
                      <p className="text-xs text-center" style={{ color: '#EF4444' }}>
                        {error}
                      </p>
                    )}

                    {/* Submit */}
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-4 rounded-xl text-sm font-bold transition-all duration-200 mt-2"
                      style={{
                        background: loading ? '#1F2937' : 'linear-gradient(135deg, #34F5A3 0%, #2DD4BF 100%)',
                        color: '#0B0F14',
                        cursor: loading ? 'not-allowed' : 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        if (loading) return;
                        (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
                        (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 32px rgba(52, 245, 163, 0.45)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                        (e.currentTarget as HTMLElement).style.boxShadow = '';
                      }}
                    >
                      {loading ? 'Отправка...' : 'Стать партнёром'}
                    </button>

                    <p className="text-xs text-center" style={{ color: '#334155' }}>
                      Нажимая кнопку, вы соглашаетесь на обработку персональных данных
                    </p>
                  </form>
                </div>
              ) : (
                <div className="p-8 flex flex-col items-center text-center">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center mb-5"
                    style={{ background: 'rgba(52, 245, 163, 0.12)', border: '1px solid rgba(52, 245, 163, 0.3)' }}
                  >
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" style={{ color: '#34F5A3' }}>
                      <path d="M5 14l6 6 12-12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold mb-2" style={{ color: '#F8FAFC' }}>
                    Заявка принята
                  </h3>
                  <p className="text-sm leading-relaxed mb-6" style={{ color: '#64748B' }}>
                    Ваш аккаунт создан и ожидает модерации. Обычно подтверждение занимает до 24 часов.
                  </p>

                  {result && (
                    <div className="w-full space-y-4 mb-6">
                      <div
                        className="rounded-xl p-4 text-left"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
                      >
                        <div className="text-xs mb-1" style={{ color: '#64748B' }}>Логин</div>
                        <div className="text-sm font-mono font-semibold" style={{ color: '#F8FAFC' }}>{result.login}</div>
                      </div>
                      <div
                        className="rounded-xl p-4 text-left relative"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
                      >
                        <div className="text-xs mb-1" style={{ color: '#64748B' }}>Пароль</div>
                        <div className="text-sm font-mono font-semibold pr-8" style={{ color: '#F8FAFC' }}>{result.password}</div>
                        <button
                          onClick={() => navigator.clipboard.writeText(result.password)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
                          style={{ color: '#34F5A3' }}
                        >
                          Копировать
                        </button>
                      </div>
                    </div>
                  )}

                  <a
                    href="https://sfera-master.ru/partner/"
                    className="w-full py-3.5 rounded-xl text-sm font-bold text-center block transition-all duration-200"
                    style={{
                      background: 'linear-gradient(135deg, #34F5A3 0%, #2DD4BF 100%)',
                      color: '#0B0F14',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
                      (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 32px rgba(52, 245, 163, 0.45)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                      (e.currentTarget as HTMLElement).style.boxShadow = '';
                    }}
                  >
                    Войти в кабинет
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
