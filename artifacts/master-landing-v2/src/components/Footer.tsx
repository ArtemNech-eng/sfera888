import React from 'react';
import { Zap, Send } from 'lucide-react';

interface FooterProps {
  botUrl: string;
}

const Footer: React.FC<FooterProps> = ({ botUrl }) => {
  return (
    <footer className="bg-[#0B0F14] border-t border-white/5 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
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
            <span className="text-[#F8FAFC] font-black text-base">
              Честный<span className="text-[#34F5A3]">Мастер</span>
            </span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-6 text-sm text-[#94A3B8]">
            <span>IT-платформа для мастеров</span>
            <span className="hidden sm:block text-white/10">·</span>
            <span className="hidden sm:block">© 2025</span>
          </div>

          {/* Social */}
          <a
            href={botUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#34F5A3]/30 text-[#34F5A3] text-sm font-medium hover:bg-[#34F5A3]/10 transition-colors"
          >
            <Send size={14} />
            Telegram-бот Max
          </a>
        </div>

        <div className="mt-8 pt-8 border-t border-white/5 text-center">
          <p className="text-[#94A3B8]/40 text-xs">
            Подключайтесь к системе с реальными объектами и понятными правилами.
            Платформа «Честный Мастер» — для профессионалов.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
