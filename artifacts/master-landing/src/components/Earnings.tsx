import { TrendingUp, Repeat } from 'lucide-react';

export default function Earnings() {
  return (
    <section className="relative py-20 sm:py-28">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-[#0F172A] mb-4 text-center">
          Сколько можно <span className="text-[#D9342B]">заработать</span>
        </h2>
        <p className="text-[#475569] text-center max-w-3xl mx-auto mb-12 text-lg">
          Доход зависит от типа объектов и вашей загрузки. Вот как это выглядит:
        </p>

        {/* Object types */}
        <div className="grid sm:grid-cols-3 gap-4 max-w-4xl mx-auto mb-10">
          <div className="p-5 rounded-2xl bg-white border border-[#EDEAE2] shadow-sm">
            <div className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] mb-3">Мелкие объекты</div>
            <div className="text-2xl font-bold text-[#0F172A]">15 – 50 000 ₽</div>
            <div className="text-[#475569] text-sm mt-2">2–5 дней работы</div>
            <div className="text-[#94A3B8] text-xs mt-1">Обои, покраска, мелкий ремонт</div>
          </div>
          <div className="p-5 rounded-2xl bg-white border border-[#D9342B]/20 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-wider text-[#D9342B] mb-3">Средние объекты</div>
            <div className="text-2xl font-bold text-[#0F172A]">50 – 150 000 ₽</div>
            <div className="text-[#475569] text-sm mt-2">7–14 дней работы</div>
            <div className="text-[#94A3B8] text-xs mt-1">Санузел под ключ, комната</div>
          </div>
          <div className="p-5 rounded-2xl bg-white border border-[#EDEAE2] shadow-sm">
            <div className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] mb-3">Крупные объекты</div>
            <div className="text-2xl font-bold text-[#0F172A]">150 – 300 000 ₽</div>
            <div className="text-[#475569] text-sm mt-2">14–30 дней работы</div>
            <div className="text-[#94A3B8] text-xs mt-1">Квартира, комплексная отделка</div>
          </div>
        </div>

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

          <div className="mt-6 pt-6 border-t border-[#EDEAE2] text-sm text-[#475569] space-y-1">
            <p>= 4–6 мелких объектов + 1 средний</p>
            <p>или 1–2 крупных объекта</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
          <div className="p-5 rounded-2xl bg-white border border-[#EDEAE2] shadow-sm text-center">
            <Repeat className="w-6 h-6 text-[#D9342B] mx-auto mb-3" />
            <div className="text-2xl font-bold text-[#0F172A]">от 15%</div>
            <div className="text-[#475569] text-sm mt-1">комиссия с заказа</div>
            <div className="text-[#94A3B8] text-xs mt-1">оплачивается после завершения</div>
          </div>
          <div className="p-5 rounded-2xl bg-white border border-[#EDEAE2] shadow-sm text-center">
            <TrendingUp className="w-6 h-6 text-[#D9342B] mx-auto mb-3" />
            <div className="text-2xl font-bold text-[#0F172A]">100%</div>
            <div className="text-[#475569] text-sm mt-1">денег с объекта — ваши</div>
            <div className="text-[#94A3B8] text-xs mt-1">минус комиссия сервиса</div>
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
