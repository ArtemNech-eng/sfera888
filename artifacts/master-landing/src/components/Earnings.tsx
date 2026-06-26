import { useState } from 'react';
import { TrendingUp, Repeat } from 'lucide-react';
import Eyebrow from './Eyebrow';

const fmt = (n: number) => n.toLocaleString('ru-RU');

export default function Earnings() {
  // Калькулятор дохода
  const [orders, setOrders] = useState(5);
  const [avgCheck, setAvgCheck] = useState(80000);

  const turnover = orders * avgCheck;
  const commission = orders * (500 + Math.round(avgCheck * 0.15));
  const net = turnover - commission;

  return (
    <section className="relative py-14 sm:py-20 bg-[#FAF6EF]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <Eyebrow number="05" label="Доход" />
        <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1A1A1A] mb-4 text-center">
          Сколько можно{' '}
          <span className="relative inline-block">
            <span className="absolute inset-x-0 bottom-1 h-3 sm:h-4 bg-[#FACC15] -z-10 rounded-sm" />
            заработать
          </span>
        </h2>
        <p className="text-[#57534E] text-center max-w-3xl mx-auto mb-12 text-lg">
          Доход зависит от типа объектов и вашей загрузки. Вот как это выглядит:
        </p>

        {/* Object types */}
        <div className="grid sm:grid-cols-3 gap-4 max-w-4xl mx-auto mb-10">
          <div className="p-5 rounded-3xl bg-white border border-[#E7E0D4] shadow-sm overflow-hidden">
            <img
              src="https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=400&h=250&fit=crop&q=80"
              alt="Покраска стен — мелкий ремонт"
              className="w-full h-32 object-cover rounded-2xl mb-4"
              loading="lazy"
            />
            <div className="font-mono text-xs font-bold uppercase tracking-wider text-[#A8A29E] mb-3">Мелкие объекты</div>
            <div className="text-2xl font-extrabold text-[#E8590C]">15 – 50 000 ₽</div>
            <div className="text-[#57534E] text-sm mt-2">2–5 дней работы</div>
            <div className="text-[#A8A29E] text-xs mt-1">Обои, покраска, мелкий ремонт</div>
          </div>
          <div
            className="p-5 rounded-3xl border-2 border-[#FACC15] shadow-md overflow-hidden"
            style={{ background: 'linear-gradient(160deg, #FEFCE8 0%, #FDEBD8 100%)' }}
          >
            <img
              src="https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=400&h=250&fit=crop&q=80"
              alt="Ванная комната — средний ремонт"
              className="w-full h-32 object-cover rounded-2xl mb-4"
              loading="lazy"
            />
            <div className="font-mono text-xs font-bold uppercase tracking-wider text-[#E8590C] mb-3">Средние объекты</div>
            <div className="text-2xl font-extrabold text-[#E8590C]">50 – 150 000 ₽</div>
            <div className="text-[#57534E] text-sm mt-2">7–14 дней работы</div>
            <div className="text-[#A8A29E] text-xs mt-1">Санузел под ключ, комната</div>
          </div>
          <div className="p-5 rounded-3xl bg-white border border-[#E7E0D4] shadow-sm overflow-hidden">
            <img
              src="https://images.unsplash.com/photo-1560185893-a55cbc8c57e8?w=400&h=250&fit=crop&q=80"
              alt="Гостиная — комплексная отделка"
              className="w-full h-32 object-cover rounded-2xl mb-4"
              loading="lazy"
            />
            <div className="font-mono text-xs font-bold uppercase tracking-wider text-[#A8A29E] mb-3">Крупные объекты</div>
            <div className="text-2xl font-extrabold text-[#E8590C]">150 – 300 000 ₽</div>
            <div className="text-[#57534E] text-sm mt-2">14–30 дней работы</div>
            <div className="text-[#A8A29E] text-xs mt-1">Квартира, комплексная отделка</div>
          </div>
        </div>

        {/* Interactive calculator */}
        <div
          className="max-w-4xl mx-auto p-6 sm:p-10 rounded-3xl border border-[#E7E0D4] shadow-md mb-10"
          style={{ background: 'linear-gradient(160deg, #FFFFFF 0%, #FBF6EE 100%)' }}
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="w-11 h-11 rounded-2xl bg-[#FACC15] flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-[#1A1A1A]" />
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-[#1A1A1A]">Калькулятор дохода</h3>
          </div>

          <div className="grid md:grid-cols-2 gap-8 items-center">
            {/* Sliders */}
            <div className="space-y-8">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[#57534E] font-medium text-sm">Объектов в месяц</label>
                  <span className="font-mono font-bold text-[#1A1A1A] text-lg">{orders}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={12}
                  step={1}
                  value={orders}
                  onChange={(e) => setOrders(Number(e.target.value))}
                  className="w-full accent-[#FACC15] cursor-pointer h-2"
                />
                <div className="flex justify-between text-[#A8A29E] text-xs mt-1">
                  <span>1</span>
                  <span>12</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[#57534E] font-medium text-sm">Средний чек объекта</label>
                  <span className="font-mono font-bold text-[#1A1A1A] text-lg">{fmt(avgCheck)} ₽</span>
                </div>
                <input
                  type="range"
                  min={20000}
                  max={300000}
                  step={5000}
                  value={avgCheck}
                  onChange={(e) => setAvgCheck(Number(e.target.value))}
                  className="w-full accent-[#FACC15] cursor-pointer h-2"
                />
                <div className="flex justify-between text-[#A8A29E] text-xs mt-1">
                  <span>20 000 ₽</span>
                  <span>300 000 ₽</span>
                </div>
              </div>
            </div>

            {/* Result */}
            <div className="rounded-3xl bg-[#1A1A1A] p-6 sm:p-8 text-center">
              <div className="text-[#FACC15] font-mono text-xs uppercase tracking-[0.18em] mb-2">
                Ваш оборот в месяц
              </div>
              <div className="text-4xl sm:text-5xl font-extrabold text-white mb-5">
                {fmt(turnover)} <span className="text-[#FACC15]">₽</span>
              </div>
              <div className="space-y-2 text-left bg-white/5 rounded-2xl p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#A8A29E]">Комиссия сервиса</span>
                  <span className="text-white font-mono">−{fmt(commission)} ₽</span>
                </div>
                <div className="h-px bg-white/10" />
                <div className="flex items-center justify-between">
                  <span className="text-white font-medium">На руки вам</span>
                  <span className="text-[#FACC15] font-mono font-bold text-lg">{fmt(net)} ₽</span>
                </div>
              </div>
              <p className="text-[#A8A29E] text-xs mt-4">
                500 ₽ + 15% с объекта · только после оплаты от клиента
              </p>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
          <div className="p-5 rounded-3xl bg-white border border-[#E7E0D4] shadow-sm text-center">
            <Repeat className="w-6 h-6 text-[#E8590C] mx-auto mb-3" />
            <div className="text-2xl font-extrabold text-[#E8590C]">от 15%</div>
            <div className="text-[#57534E] text-sm mt-1">комиссия с заказа</div>
            <div className="text-[#A8A29E] text-xs mt-1">оплачивается по поступлению оплаты от клиента</div>
          </div>
          <div className="p-5 rounded-3xl bg-white border border-[#E7E0D4] shadow-sm text-center">
            <TrendingUp className="w-6 h-6 text-[#E8590C] mx-auto mb-3" />
            <div className="text-2xl font-extrabold text-[#E8590C]">100%</div>
            <div className="text-[#57534E] text-sm mt-1">денег с объекта — ваши</div>
            <div className="text-[#A8A29E] text-xs mt-1">минус комиссия сервиса</div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto mt-8 text-center">
          <p className="text-[#57534E] leading-relaxed">
            Конвейер: закрыли объект → получили следующую заявку. Чем выше рейтинг и конверсия, тем чаще система направляет заказы именно вам.
          </p>
        </div>
      </div>
    </section>
  );
}
