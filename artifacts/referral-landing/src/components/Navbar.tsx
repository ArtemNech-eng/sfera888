import { useState, useEffect } from 'react';
import { Menu, X, Wrench } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'bg-white/80 backdrop-blur-xl shadow-sm border-b border-gray-100'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16 lg:h-20">
        <a href="#" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-xl gradient-bg flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-500/20 group-hover:shadow-emerald-500/40 transition-shadow">
            <Wrench size={18} className="text-white" />
          </div>
          <span className="font-bold text-[#111827] text-xl tracking-tight">Честный Мастер</span>
        </a>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-500">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="hover:text-[#059669] transition-colors relative after:absolute after:bottom-[-4px] after:left-0 after:w-0 after:h-0.5 after:bg-[#059669] after:rounded-full after:transition-all hover:after:w-full"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <button
            onClick={scrollToForm}
            className="hidden sm:inline-flex gradient-bg text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:scale-[1.03] hover:shadow-lg hover:shadow-emerald-500/30 transition-all duration-300 glow-green"
          >
            Оставить заявку
          </button>

          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden p-2.5 text-[#374151] hover:bg-gray-100 rounded-xl transition-colors"
            aria-label="Меню"
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white/95 backdrop-blur-xl border-t border-gray-100 overflow-hidden"
          >
            <div className="px-4 py-4 space-y-1">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="block px-4 py-3 text-gray-700 font-medium rounded-xl hover:bg-emerald-50 hover:text-[#059669] transition-colors"
                >
                  {link.label}
                </a>
              ))}
              <button
                onClick={scrollToForm}
                className="w-full mt-3 gradient-bg text-white text-sm font-semibold px-4 py-3 rounded-xl hover:shadow-lg transition-shadow"
              >
                Оставить заявку
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
