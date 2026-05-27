import React from 'react';
import { Zap, Send } from 'lucide-react';

interface FooterProps {
  botUrl: string;
}

const Footer: React.FC<FooterProps> = ({ botUrl }) => {
  return (
    <footer className="bg-[#F8FAFC] border-t border-[#E2E8F0] py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
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
            <span className="text-[#0F172A] font-black text-base">
              Честный<span className="text-[#10B981]">Мастер</span>
            </span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-6 text-sm text-[#64748B]">
            <span>IT-платформа для мастеров</span>
            <span className="hidden sm:block text-[#E2E8F0]">·</span>
            <span className="hidden sm:block">© 2025</span>
          </div>

          {/* Social */}
          <a
            href={botUrl}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#E2E8F0] text-[#64748B] text-sm font-medium hover:bg-white hover:text-[#0F172A] transition-colors"
          >
            <Send size={14} />
            Telegram-бот Max
          </a>
        </div>

        <div className="mt-8 pt-8 border-t border-[#E2E8F0] text-center">
          <p className="text-[#94A3B8] text-xs">
            Подключайтесь к системе с реальными объектами и понятными правилами.
            Платформа «Честный Мастер» — для профессионалов.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
