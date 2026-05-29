import { useState, useEffect } from 'react';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = [
    { label: 'Модель', href: '#model' },
    { label: 'Доход', href: '#income' },
    { label: 'Условия', href: '#who' },
    { label: 'FAQ', href: '#faq' },
  ];

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        background: scrolled ? 'rgba(11, 15, 20, 0.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : 'none',
      }}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex items-center justify-between h-18 py-4">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #34F5A3, #38BDF8)' }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L14 6V10L8 14L2 10V6L8 2Z" fill="#0B0F14" fillOpacity="0.9" />
                <path d="M8 5L11 7V9L8 11L5 9V7L8 5Z" fill="#0B0F14" />
              </svg>
            </div>
            <div>
              <span className="font-bold text-base tracking-tight" style={{ color: '#F8FAFC' }}>
                Честный Мастер
              </span>
              <span
                className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full"
                style={{
                  background: 'rgba(52, 245, 163, 0.1)',
                  color: '#34F5A3',
                  border: '1px solid rgba(52, 245, 163, 0.2)',
                }}
              >
                Партнёрам
              </span>
            </div>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-sm font-medium transition-colors duration-200"
                style={{ color: '#94A3B8' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#F8FAFC')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#94A3B8')}
              >
                {l.label}
              </a>
            ))}
          </nav>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-3">
            <a
              href="https://sfera-master.ru/partner/"
              className="text-sm font-medium transition-colors duration-200"
              style={{ color: '#94A3B8' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#F8FAFC')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#94A3B8')}
            >
              Войти
            </a>
            <a
              href="#cta"
              className="text-sm font-semibold px-5 py-2.5 rounded-lg transition-all duration-200 glow-green-sm"
              style={{
                background: 'linear-gradient(135deg, #34F5A3, #2DD4BF)',
                color: '#0B0F14',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 0 30px rgba(52, 245, 163, 0.4)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLElement).style.boxShadow = '';
              }}
            >
              Подключиться
            </a>
          </div>

          {/* Mobile menu */}
          <button
            className="md:hidden p-2 rounded-lg"
            style={{ color: '#94A3B8' }}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              {menuOpen ? (
                <>
                  <line x1="4" y1="4" x2="18" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="18" y1="4" x2="4" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </>
              ) : (
                <>
                  <line x1="3" y1="7" x2="19" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="3" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="3" y1="17" x2="19" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </>
              )}
            </svg>
          </button>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div
            className="md:hidden py-4 pb-6 glass rounded-xl mb-4"
            style={{ border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="block px-5 py-3 text-sm font-medium transition-colors"
                style={{ color: '#94A3B8' }}
                onClick={() => setMenuOpen(false)}
              >
                {l.label}
              </a>
            ))}
            <div className="px-5 pt-3 space-y-2">
              <a
                href="https://sfera-master.ru/partner/"
                className="block text-center text-sm font-semibold px-5 py-3 rounded-lg"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#F8FAFC',
                }}
                onClick={() => setMenuOpen(false)}
              >
                Войти
              </a>
              <a
                href="#cta"
                className="block text-center text-sm font-semibold px-5 py-3 rounded-lg"
                style={{
                  background: 'linear-gradient(135deg, #34F5A3, #2DD4BF)',
                  color: '#0B0F14',
                }}
                onClick={() => setMenuOpen(false)}
              >
                Подключиться
              </a>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
