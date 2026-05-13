import React, { useState, useEffect } from 'react';
import { Menu, X, Zap } from 'lucide-react';
import NeonButton from './NeonButton';

interface NavbarProps {
  botUrl: string;
}

const navLinks = [
  { label: 'Система', href: '#how-it-works' },
  { label: 'Старт', href: '#work-model' },
  { label: 'Тарифы', href: '#pricing' },
  { label: 'Доход', href: '#earnings' },
  { label: 'FAQ', href: '#faq' },
];

const Navbar: React.FC<NavbarProps> = ({ botUrl }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleNavClick = (href: string) => {
    setMobileOpen(false);
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? 'bg-[#0B0F14]/95 backdrop-blur-xl border-b border-white/5'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{
                  background: 'rgba(52,245,163,0.15)',
                  border: '1px solid rgba(52,245,163,0.4)',
                }}
              >
                <Zap size={16} className="text-[#34F5A3]" />
              </div>
              <span className="text-[#F8FAFC] font-black text-base tracking-tight">
                Честный<span className="text-[#34F5A3]">Мастер</span>
              </span>
            </div>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <button
                  key={link.label}
                  onClick={() => handleNavClick(link.href)}
                  className="px-4 py-2 text-sm text-[#94A3B8] hover:text-[#F8FAFC] transition-colors rounded-lg hover:bg-white/5 cursor-pointer"
                >
                  {link.label}
                </button>
              ))}
            </div>

            {/* Desktop CTA */}
            <div className="hidden md:block">
              <NeonButton href={botUrl} variant="primary" size="sm">
                Начать работу
              </NeonButton>
            </div>

            {/* Mobile menu button */}
            <button
              className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-white/5 transition-colors cursor-pointer"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile menu */}
      <div
        className={`fixed inset-0 z-40 md:hidden transition-all duration-300 ${
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-[#0B0F14]/80 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />

        {/* Drawer */}
        <div
          className={`absolute top-0 right-0 h-full w-72 bg-[#0F172A] border-l border-white/5 transition-transform duration-300 ${
            mobileOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex flex-col p-6 pt-20">
            {navLinks.map((link, i) => (
              <button
                key={link.label}
                onClick={() => handleNavClick(link.href)}
                className="px-4 py-3.5 text-left text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-white/5 rounded-xl transition-colors text-base font-medium cursor-pointer"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                {link.label}
              </button>
            ))}

            <div className="mt-6">
              <NeonButton href={botUrl} variant="primary" size="md" className="w-full justify-center">
                Начать работу
              </NeonButton>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Navbar;
