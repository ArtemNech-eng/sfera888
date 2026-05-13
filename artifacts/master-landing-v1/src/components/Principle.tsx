import { Inbox, Hammer, Banknote, RefreshCw, ArrowRight } from 'lucide-react';

const steps = [
  { icon: Inbox, label: 'Взял заявку' },
  { icon: Hammer, label: 'Выполнил работу' },
  { icon: Banknote, label: 'Оплатил комиссию' },
  { icon: RefreshCw, label: 'Взял новую' },
];

export default function Principle() {
  return (
    <section className="section-bg py-20 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-extrabold text-[#1A1A1A] mb-4">
            Сдал заказ — получил новый
          </h2>
          <p className="text-[#8E8E93] text-lg leading-relaxed max-w-xl mx-auto">
            Мы строим систему без хаоса и сорванных сроков.
            Поэтому у нас действует строгое правило:
          </p>
          <div className="inline-block mt-4 bg-white rounded-2xl px-6 py-3 shadow-sm">
            <span className="text-xl font-bold text-[#1A1A1A]">1 мастер = 1 активный заказ</span>
          </div>
        </div>

        {/* Flow diagram */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-2 mb-12">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            return (
              <div key={step.label} className="flex flex-col md:flex-row items-center gap-4 md:gap-2">
                <div className="card flex flex-col items-center text-center p-6 min-w-[140px]">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
                    style={{ backgroundColor: 'rgba(52,199,89,0.1)' }}
                  >
                    <Icon size={26} color="#34C759" strokeWidth={2} />
                  </div>
                  <span className="text-sm font-semibold text-[#1A1A1A] leading-snug">{step.label}</span>
                </div>
                {idx < steps.length - 1 && (
                  <div className="flex items-center justify-center">
                    <ArrowRight
                      size={24}
                      color="#34C759"
                      strokeWidth={2.5}
                      className="rotate-90 md:rotate-0"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Description */}
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-[#1A1A1A] text-lg leading-relaxed mb-6">
            Вы фокусируетесь на одном объекте, делаете его быстро и качественно,
            забираете деньги и сразу берёте следующий.
            Без простоев и пустых обещаний клиентам.
          </p>
          <p className="text-sm text-[#8E8E93] leading-relaxed">
            * Для Топ-мастеров с высокой конверсией и идеальными отзывами лимит может быть
            увеличен до 2-х одновременных заказов.
          </p>
        </div>
      </div>
    </section>
  );
}
