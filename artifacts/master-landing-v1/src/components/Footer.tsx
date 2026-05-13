export default function Footer() {
  return (
    <footer className="bg-[#1A1A1A] py-8 px-4">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ backgroundColor: '#34C759' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <span className="text-white font-700 text-sm">Честный Мастер</span>
        </div>
        <p className="text-gray-600 text-xs text-center">
          © 2024 Честный Мастер. Все права защищены.
        </p>
        <div className="flex gap-5">
          <a href="#" className="text-gray-600 text-xs hover:text-gray-400 transition-colors">
            Условия работы
          </a>
          <a href="#" className="text-gray-600 text-xs hover:text-gray-400 transition-colors">
            Политика конфиденциальности
          </a>
        </div>
      </div>
    </footer>
  );
}
