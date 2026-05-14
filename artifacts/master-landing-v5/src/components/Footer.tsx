export default function Footer() {
  return (
    <footer className="bg-[#0D1117] py-10 border-t border-white/5">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#34C759] rounded-lg flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="font-bold text-white text-base">Честный Мастер</span>
          </div>

          <p className="text-white/30 text-sm text-center">
            Платформа для мастеров-отделочников. Объекты. Порядок. Система.
          </p>

          <p className="text-white/20 text-xs">
            © {new Date().getFullYear()} Честный Мастер
          </p>
        </div>
      </div>
    </footer>
  );
}
