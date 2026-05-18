import { useState } from 'react';
import { Menu, X, Wrench } from 'lucide-react';

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  const scrollToForm = () => {
    document.getElementById('form')?.scrollIntoView({ behavior: 'smooth' });
    setMenuOpen(false);
  };

  const navLinks = [
    { href: '#services', label: 'Работы' },
    { href: '#how', label: 'Как работаем' },
    { href: '#reviews', label: 'Отзывы' },
    { href: '#faq', label: 'Вопросы' },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b border-[#E5E7EB]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#34C759] flex items-center justify-center flex-shrink-0">
            <Wrench size={18} className="text-white" />
          </div>
          <span className="font-semibold text-[#111827] text-lg tracking-tight">Честный Мастер</span>
        </div>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6 text-sm text-[#6B7280]">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} className="hover:text-[#111827] transition-colors">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <button
            onClick={scrollToForm}
            className="hidden sm:inline-flex bg-[#34C759] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#2db34e] transition-colors"
          >
            Оставить заявку
          </button>

          {/* Mobile menu button */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden p-2 text-[#374151] hover:bg-[#F3F4F6] rounded-lg transition-colors"
            aria-label="Меню"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-white border-t border-[#E5E7EB] px-4 py-3 space-y-1">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="block px-3 py-2.5 text-[#374151] font-medium rounded-lg hover:bg-[#F3F4F6] transition-colors"
            >
              {link.label}
            </a>
          ))}
          <button
            onClick={scrollToForm}
            className="w-full mt-2 bg-[#34C759] text-white text-sm font-semibold px-4 py-3 rounded-lg hover:bg-[#2db34e] transition-colors"
          >
            Оставить заявку
          </button>
        </div>
      )}
    </header>
  );
}
