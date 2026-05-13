import { TrendingUp } from 'lucide-react';

export default function Earnings() {
  return (
    <section className="relative py-20 sm:py-28">
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#FACC15]/30 to-transparent" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-[#F8FAFC] mb-4 text-center">
          Ваш доход зависит только от <span className="text-[#FACC15]">конверсии</span>
        </h2>

        <p className="text-[#94A3B8] text-center max-w-3xl mx-auto mb-12 text-lg">
          Один заказ обычно выполняется за 2–3 дня. Средний мастер закрывает 6–9 объектов в месяц.
        </p>

        {/* Big number */}
        <div className="max-w-2xl mx-auto p-8 rounded-2xl bg-[#111827]/80 border border-[#FACC15]/20 backdrop-blur-sm text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <TrendingUp className="w-8 h-8 text-[#FACC15]" />
            <span className="text-[#94A3B8] text-lg">Средний активный мастер зарабатывает:</span>
          </div>
          <div className="text-5xl sm:text-6xl font-bold text-[#F8FAFC] mb-2">
            120 000 – 220 000 <span className="text-[#FACC15]">₽</span>
          </div>
          <div className="text-[#94A3B8]">в месяц</div>

          <div className="mt-6 pt-6 border-t border-[#FACC15]/10">
            <p className="text-[#94A3B8] leading-relaxed">
              Чем выше ваша конверсия (умение договориться на замере и закрыть смету), тем быстрее вы получаете новые заявки от системы.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
