import { useState, useEffect } from 'react';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMenuOpen(false);
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-white/95 backdrop-blur-md shadow-sm border-b border-gray-100' : 'bg-transparent'
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#34C759] rounded-lg flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="font-bold text-[#111827] text-lg tracking-tight">Честный Мастер</span>
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            <button onClick={() => scrollTo('how-it-works')} className="text-sm text-[#6B7280] hover:text-[#111827] transition-colors font-medium">Как работает</button>
            <button onClick={() => scrollTo('packages')} className="text-sm text-[#6B7280] hover:text-[#111827] transition-colors font-medium">Пакеты</button>
            <button onClick={() => scrollTo('earnings')} className="text-sm text-[#6B7280] hover:text-[#111827] transition-colors font-medium">Заработок</button>
            <button onClick={() => scrollTo('faq')} className="text-sm text-[#6B7280] hover:text-[#111827] transition-colors font-medium">FAQ</button>
          </div>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={() => scrollTo('start')}
              className="bg-[#34C759] hover:bg-[#22A06B] text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md"
            >
              Начать работу
            </button>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 rounded-lg text-[#6B7280] hover:text-[#111827] hover:bg-gray-100 transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M4 6H20M4 12H20M4 18H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {menuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-white border-b border-gray-100 shadow-lg px-4 py-4 flex flex-col gap-3">
            <button onClick={() => scrollTo('how-it-works')} className="text-left text-sm text-[#6B7280] hover:text-[#111827] py-2 font-medium">Как работает</button>
            <button onClick={() => scrollTo('packages')} className="text-left text-sm text-[#6B7280] hover:text-[#111827] py-2 font-medium">Пакеты заказов</button>
            <button onClick={() => scrollTo('earnings')} className="text-left text-sm text-[#6B7280] hover:text-[#111827] py-2 font-medium">Заработок</button>
            <button onClick={() => scrollTo('faq')} className="text-left text-sm text-[#6B7280] hover:text-[#111827] py-2 font-medium">FAQ</button>
            <button
              onClick={() => scrollTo('start')}
              className="bg-[#34C759] hover:bg-[#22A06B] text-white text-sm font-semibold px-5 py-3 rounded-xl transition-all duration-200 mt-2"
            >
              Начать работу
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
