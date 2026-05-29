export default function Footer() {
  return (
    <footer
      className="py-10 relative"
      style={{
        background: '#0B0F14',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          {/* Logo / brand */}
          <div className="flex items-center gap-3">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #34F5A3, #38BDF8)' }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1.5L12.5 5v4L7 12.5L1.5 9V5L7 1.5Z" fill="#0B0F14" fillOpacity="0.85" />
                <path d="M7 4.5L9.5 6v2L7 9.5L4.5 8V6L7 4.5Z" fill="#0B0F14" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-bold" style={{ color: '#F8FAFC' }}>
                Честный Мастер
              </div>
              <div className="text-xs" style={{ color: '#334155' }}>
                Городская платформа ремонта
              </div>
            </div>
          </div>

          {/* Links */}
          <div className="flex flex-wrap gap-6">
            {[
              { label: 'Модель', href: '#model' },
              { label: 'Доход', href: '#income' },
              { label: 'Условия', href: '#who' },
              { label: 'FAQ', href: '#faq' },
            ].map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-xs transition-colors duration-200"
                style={{ color: '#334155' }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#64748B')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = '#334155')}
              >
                {l.label}
              </a>
            ))}
          </div>

          {/* Copyright */}
          <div className="text-xs" style={{ color: '#1E293B' }}>
            © 2025 Честный Мастер
          </div>
        </div>
      </div>
    </footer>
  );
}
