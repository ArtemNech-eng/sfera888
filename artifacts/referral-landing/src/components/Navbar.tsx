export default function Navbar() {
  const scrollToForm = () => {
    document.getElementById('form')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b border-[#E5E7EB]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#34C759] flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
          </div>
          <span className="font-semibold text-[#111827] text-lg tracking-tight">Честный Мастер</span>
        </div>
        <nav className="hidden md:flex items-center gap-6 text-sm text-[#6B7280]">
          <a href="#services" className="hover:text-[#111827] transition-colors">Работы</a>
          <a href="#how" className="hover:text-[#111827] transition-colors">Как работаем</a>
          <a href="#reviews" className="hover:text-[#111827] transition-colors">Отзывы</a>
          <a href="#faq" className="hover:text-[#111827] transition-colors">Вопросы</a>
        </nav>
        <button
          onClick={scrollToForm}
          className="bg-[#34C759] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#2db34e] transition-colors"
        >
          Оставить заявку
        </button>
      </div>
    </header>
  );
}
