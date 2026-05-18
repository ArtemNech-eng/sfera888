import { Wrench } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-[#111827] border-t border-white/10 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-[#34C759] flex items-center justify-center">
            <Wrench size={13} className="text-white" />
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
