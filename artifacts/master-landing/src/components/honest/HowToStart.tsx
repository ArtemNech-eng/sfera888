import { MousePointer, Bot, Phone, AppWindow, Rocket } from 'lucide-react';

export default function HowToStart() {
  const steps = [
    { icon: MousePointer, text: 'Нажимаете кнопку ниже', color: '#34F5A3' },
    { icon: Bot, text: 'Переходите в нашего Telegram-бота (Max)', color: '#38BDF8' },
    { icon: Phone, text: 'Авторизуетесь по номеру телефона', color: '#FACC15' },
    { icon: AppWindow, text: 'Получаете доступ в приложение', color: '#34F5A3' },
    { icon: Rocket, text: 'Проходите верификацию для тестового заказа ИЛИ покупаете пакет и сразу берёте объекты', color: '#38BDF8' },
  ];

  return (
    <section className="relative py-20 sm:py-28">
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#38BDF8]/30 to-transparent" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-[#F8FAFC] mb-12 text-center">
          Как начать
        </h2>

        <div className="max-w-2xl mx-auto space-y-4">
          {steps.map(({ icon: Icon, text, color }, i) => (
            <div
              key={i}
              className="flex items-start gap-4 p-5 rounded-xl bg-[#111827]/80 border border-[#94A3B8]/10 backdrop-blur-sm"
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm"
                style={{ backgroundColor: `${color}15`, border: `1px solid ${color}30`, color }}
              >
                {i + 1}
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Icon className="w-5 h-5 flex-shrink-0" style={{ color }} />
                <span className="text-[#F8FAFC]">{text}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
