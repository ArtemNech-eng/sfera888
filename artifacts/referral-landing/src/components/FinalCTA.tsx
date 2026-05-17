export default function FinalCTA() {
  const scrollToForm = () => {
    document.getElementById('form')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="bg-[#111827] py-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4 leading-tight">
          Оставьте заявку и узнайте стоимость работ
        </h2>
        <p className="text-[#94A3B8] text-lg mb-8 leading-relaxed">
          Подберём проверенного частного мастера,<br className="hidden sm:inline" />
          которого вам не придётся искать вслепую.
        </p>
        <button
          onClick={scrollToForm}
          className="bg-[#34C759] text-white font-semibold px-8 py-4 rounded-xl hover:bg-[#2db34e] transition-colors text-base shadow-lg shadow-[#34C759]/20"
        >
          Оставить заявку
        </button>

        <div className="flex flex-wrap justify-center gap-5 mt-10 text-sm text-[#94A3B8]">
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-[#34C759]/20 flex items-center justify-center">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#34C759" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </span>
            Бесплатная заявка
          </span>
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-[#34C759]/20 flex items-center justify-center">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#34C759" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </span>
            Подбор за 15–30 минут
          </span>
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-[#34C759]/20 flex items-center justify-center">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#34C759" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </span>
            Гарантия 2 года
          </span>
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 rounded-full bg-[#34C759]/20 flex items-center justify-center">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#34C759" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </span>
            Без посредников
          </span>
        </div>
      </div>
    </section>
  );
}
