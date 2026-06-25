import { TrendingUp, Calendar, Repeat } from 'lucide-react';

export default function Earnings() {
  return (
    <section className="relative py-20 sm:py-28">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-[#0F172A] mb-4 text-center">
          Сколько можно <span className="text-[#D9342B]">заработать</span>
        </h2>
        <p className="text-[#475569] text-center max-w-3xl mx-auto mb-12 text-lg">
          Один объект — 2–3 дня. Средний мастер закрывает 6–9 объектов в месяц.
        </p>

        {/* Big number */}
        <div className="max-w-2xl mx-auto p-8 rounded-2xl bg-white border border-[#EDEAE2] shadow-sm text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-4">
            <TrendingUp className="w-8 h-8 text-[#D9342B]" />
            <span className="text-[#475569] text-lg">Доход активного мастера:</span>
          </div>
          <div className="text-5xl sm:text-6xl font-bold text-[#0F172A] mb-2">
            120 000 – 220 000 <span className="text-[#D9342B]">₽</span>
          </div>
          <div className="text-[#475569]">в месяц</div>
        </div>

        {/* Stats row */}
        <div className="grid sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
          <div className="p-5 rounded-2xl bg-white border border-[#EDEAE2] shadow-sm text-center">
            <Calendar className="w-6 h-6 text-[#D9342B] mx-auto mb-3" />
            <div className="text-2xl font-bold text-[#0F172A]">2–3 дня</div>
            <div className="text-[#475569] text-sm mt-1">на один объект</div>
          </div>
          <div className="p-5 rounded-2xl bg-white border border-[#EDEAE2] shadow-sm text-center">
            <Repeat className="w-6 h-6 text-[#D9342B] mx-auto mb-3" />
            <div className="text-2xl font-bold text-[#0F172A]">6–9</div>
            <div className="text-[#475569] text-sm mt-1">заказов в месяц</div>
          </div>
          <div className="p-5 rounded-2xl bg-white border border-[#EDEAE2] shadow-sm text-center">
            <TrendingUp className="w-6 h-6 text-[#D9342B] mx-auto mb-3" />
            <div className="text-2xl font-bold text-[#0F172A]">от 15%</div>
            <div className="text-[#475569] text-sm mt-1">комиссия с заказа</div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto mt-8 text-center">
          <p className="text-[#475569] leading-relaxed">
            Конвейер: закрыли объект → получили следующую заявку. Чем выше рейтинг и конверсия, тем чаще система направляет заказы именно вам.
          </p>
        </div>
      </div>
    </section>
  );
}
