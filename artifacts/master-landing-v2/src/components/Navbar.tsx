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
            ? 'bg-white/95 backdrop-blur-xl border-b border-[#E2E8F0]'
            : 'bg-white/80 backdrop-blur-sm border-b border-[#E2E8F0]'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{
                  background: 'rgba(16,185,129,0.1)',
                  border: '1px solid rgba(16,185,129,0.3)',
                }}
              >
                <Zap size={16} className="text-[#10B981]" />
              </div>
              <span className="text-[#0F172A] font-black text-base tracking-tight">
                Честный<span className="text-[#10B981]">Мастер</span>
              </span>
            </div>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <button
                  key={link.label}
                  onClick={() => handleNavClick(link.href)}
                  className="px-4 py-2 text-sm text-[#64748B] hover:text-[#0F172A] transition-colors rounded-lg hover:bg-[#F8FAFC] cursor-pointer"
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
              className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
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
          className="absolute inset-0 bg-[#0F172A]/40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />

        {/* Drawer */}
        <div
          className={`absolute top-0 right-0 h-full w-72 bg-white border-l border-[#E2E8F0] transition-transform duration-300 ${
            mobileOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex flex-col p-6 pt-20">
            {navLinks.map((link, i) => (
              <button
                key={link.label}
                onClick={() => handleNavClick(link.href)}
                className="px-4 py-3.5 text-left text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] rounded-xl transition-colors text-base font-medium cursor-pointer"
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
