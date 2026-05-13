import { Smartphone, Bot, UserCheck, Image } from 'lucide-react';

const steps = [
  { icon: Smartphone, label: 'Телефон', desc: 'Любой смартфон с доступом в интернет' },
  { icon: Bot, label: 'Max-бот', desc: 'Через него приходят уведомления о заказах' },
  { icon: UserCheck, label: 'Регистрация в системе', desc: 'Занимает не более 2 минут' },
  { icon: Image, label: 'Фото ваших работ', desc: 'Повышает доверие клиентов и рейтинг' },
];

export default function HowToStart() {
  return (
    <section className="section-bg py-20 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-800 text-[#1A1A1A] mb-3">
            Что нужно для подключения
          </h2>
          <p className="text-[#8E8E93] text-base">Всё просто. Никаких сложных требований.</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            return (
              <div key={step.label} className="card flex flex-col items-center text-center gap-3">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(52,199,89,0.1)' }}
                >
                  <Icon size={22} color="#34C759" strokeWidth={2} />
                </div>
                <div>
                  <div className="text-xs font-700 text-[#34C759] mb-1">{idx + 1}</div>
                  <div className="text-sm font-700 text-[#1A1A1A] mb-1">{step.label}</div>
                  <div className="text-xs text-[#8E8E93] leading-relaxed">{step.desc}</div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-center text-[#8E8E93] text-sm max-w-md mx-auto">
          После подключения вы получите доступ к приложению и сможете откликаться на заказы
        </p>
      </div>
    </section>
  );
}
