import { Wrench, Phone, Mail, MessageCircle } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-[#0f172a] border-t border-white/5 py-14">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-10">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl gradient-bg flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Wrench size={18} className="text-white" />
              </div>
              <span className="text-white font-bold text-lg tracking-tight">Честный Мастер</span>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">
              Городской сервис проверенных частных мастеров. Без посредников, с честной сметой и гарантией.
            </p>
          </div>

          {/* Services */}
          <div>
            <h4 className="text-white font-bold text-sm mb-4">Услуги</h4>
            <ul className="space-y-2.5 text-gray-400 text-sm">
              {['Ремонт квартир', 'Укладка плитки', 'Поклейка обоев', 'Электрика', 'Сантехника'].map(s => (
                <li key={s}><a href="#services" className="hover:text-emerald-400 transition-colors">{s}</a></li>
              ))}
            </ul>
          </div>

          {/* Info */}
          <div>
            <h4 className="text-white font-bold text-sm mb-4">Информация</h4>
            <ul className="space-y-2.5 text-gray-400 text-sm">
              {[
                { label: 'Как это работает', href: '#how' },
                { label: 'Отзывы', href: '#reviews' },
                { label: 'Вопросы', href: '#faq' },
                { label: 'Оставить заявку', href: '#form' },
              ].map(link => (
                <li key={link.label}><a href={link.href} className="hover:text-emerald-400 transition-colors">{link.label}</a></li>
              ))}
            </ul>
          </div>

          {/* Contacts */}
          <div>
            <h4 className="text-white font-bold text-sm mb-4">Контакты</h4>
            <div className="space-y-3 text-gray-400 text-sm">
              <div className="flex items-center gap-2">
                <Phone size={14} className="text-emerald-400" />
                <span>+7 (XXX) XXX-XX-XX</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail size={14} className="text-emerald-400" />
                <span>info@sfera-master.ru</span>
              </div>
              <div className="flex items-center gap-2">
                <MessageCircle size={14} className="text-emerald-400" />
                <span>Telegram: @sfera_master</span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/5 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-gray-500 text-xs">
            © {new Date().getFullYear()} Честный Мастер. Все права защищены.
          </p>
          <p className="text-gray-600 text-xs">
            ООО «Сфера Мастер» · ИНН / КПП
          </p>
        </div>
      </div>
    </footer>
  );
}
