export default function Footer() {
  return (
    <footer className="bg-[#111827] border-t border-white/10 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-[#34C759] flex items-center justify-center">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
          </div>
          <span className="text-white font-semibold text-sm">Честный Мастер</span>
        </div>
        <p className="text-[#94A3B8] text-xs text-center">
          Городской сервис проверенных частных мастеров
        </p>
        <p className="text-[#94A3B8] text-xs">
          © {new Date().getFullYear()} Честный Мастер
        </p>
      </div>
    </footer>
  );
}
