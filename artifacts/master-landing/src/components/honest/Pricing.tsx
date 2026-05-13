import { Star } from 'lucide-react';

export default function Pricing() {
  return (
    <section className="relative py-20 sm:py-28">
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#34F5A3]/30 to-transparent" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-[#F8FAFC] mb-12 text-center">
          Тарифы после тестового периода
        </h2>

        <div className="grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {/* START */}
          <div className="relative p-6 rounded-2xl bg-[#111827]/80 border border-[#94A3B8]/10 backdrop-blur-sm hover:border-[#34F5A3]/30 transition-all duration-300">
            <h3 className="text-lg font-bold text-[#94A3B8] uppercase tracking-wider mb-2">Старт</h3>
            <div className="text-4xl font-bold text-[#F8FAFC] mb-1">5 000 ₽</div>
            <div className="text-[#94A3B8] mb-4">1 заказ (токен)</div>
            <div className="h-[1px] bg-gradient-to-r from-transparent via-[#94A3B8]/20 to-transparent my-4" />
            <p className="text-[#94A3B8] text-sm">Идеально для входа в рабочий ритм</p>
          </div>

          {/* PROFI - highlighted */}
          <div className="relative p-6 rounded-2xl bg-[#111827]/80 border border-[#34F5A3]/40 backdrop-blur-sm shadow-[0_0_40px_rgba(52,245,163,0.1)] scale-[1.02] sm:scale-105">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-[#34F5A3] text-[#0B0F14] text-xs font-bold flex items-center gap-1">
              <Star className="w-3 h-3" /> ХИТ
            </div>
            <h3 className="text-lg font-bold text-[#34F5A3] uppercase tracking-wider mb-2">Профи</h3>
            <div className="text-4xl font-bold text-[#F8FAFC] mb-1">20 000 ₽</div>
            <div className="text-[#94A3B8] mb-4">5 заказов (токенов)</div>
            <div className="h-[1px] bg-gradient-to-r from-transparent via-[#34F5A3]/20 to-transparent my-4" />
            <p className="text-[#34F5A3] text-sm font-medium">Всего 4 000 ₽ за заказ. Хватит на месяц стабильной работы</p>
          </div>

          {/* MAXIMUM */}
          <div className="relative p-6 rounded-2xl bg-[#111827]/80 border border-[#FACC15]/20 backdrop-blur-sm hover:border-[#FACC15]/40 transition-all duration-300">
            <h3 className="text-lg font-bold text-[#FACC15] uppercase tracking-wider mb-2">Максимум</h3>
            <div className="text-4xl font-bold text-[#F8FAFC] mb-1">30 000 ₽</div>
            <div className="text-[#94A3B8] mb-4">10 заказов (токенов)</div>
            <div className="h-[1px] bg-gradient-to-r from-transparent via-[#FACC15]/20 to-transparent my-4" />
            <p className="text-[#FACC15] text-sm font-medium">Для сильных мастеров. Цена заказа — всего 3 000 ₽</p>
          </div>
        </div>
      </div>
    </section>
  );
}
