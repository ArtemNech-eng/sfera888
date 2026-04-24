import { User, Star } from 'lucide-react';

export default function Earnings() {
  return (
    <section className="bg-white py-20 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-extrabold text-[#1A1A1A] mb-4">
            Сколько можно зарабатывать
          </h2>
          <div className="text-[#8E8E93] text-base leading-relaxed space-y-3 max-w-xl mx-auto">
            <p>
              Один заказ обычно занимает{' '}
              <span className="text-[#1A1A1A] font-semibold">2–3 дня</span>.
              Средний мастер закрывает{' '}
              <span className="text-[#1A1A1A] font-semibold">6–9 заказов в месяц</span>.
            </p>
            <p>Доход зависит от вашей конверсии, скорости работы, качества и умения доводить клиента до предоплаты.</p>
          </div>
        </div>

        {/* Income highlight */}
        <div
          className="rounded-2xl p-8 text-center mb-10"
          style={{
            background: 'linear-gradient(135deg, rgba(52,199,89,0.08) 0%, rgba(52,199,89,0.03) 100%)',
            border: '1.5px solid rgba(52,199,89,0.18)',
          }}
        >
          <p className="text-sm text-[#8E8E93] font-medium mb-2 uppercase tracking-wide">
            Средний активный мастер зарабатывает
          </p>
          <p className="text-4xl md:text-5xl font-black text-[#34C759]">
            120 000 — 220 000 ₽
          </p>
          <p className="text-[#8E8E93] text-sm mt-2">в месяц</p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-10">
          {/* Regular master */}
          <div className="card border border-[#E5E5EA]">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-[#F5F5F5] flex items-center justify-center">
                <User size={18} color="#8E8E93" strokeWidth={2} />
              </div>
              <h3 className="text-base font-bold text-[#1A1A1A]">Обычный мастер</h3>
            </div>
            <ul className="space-y-2.5">
              {[
                '4–6 заказов в месяц',
                'Есть простои',
                'Доход 100–130 тысяч ₽',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-[#8E8E93]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#8E8E93] mt-1.5 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Top master */}
          <div
            className="card relative overflow-hidden"
            style={{
              border: '1.5px solid #34C759',
              background: 'linear-gradient(135deg, #fff 0%, rgba(52,199,89,0.04) 100%)',
            }}
          >
            <div className="absolute top-4 right-4">
              <span className="text-xs font-bold bg-[#34C759] text-white rounded-full px-3 py-1">
                Топ
              </span>
            </div>
            <div className="flex items-center gap-3 mb-5">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: 'rgba(52,199,89,0.1)' }}
              >
                <Star size={18} color="#34C759" strokeWidth={2} />
              </div>
              <h3 className="text-base font-bold text-[#1A1A1A]">Топ-мастер</h3>
            </div>
            <ul className="space-y-2.5">
              {[
                '7–9 заказов в месяц',
                'Высокая конверсия',
                'Почти без простоев',
                'Доход 160–220 тысяч ₽',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-[#1A1A1A] font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#34C759] mt-1.5 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="text-center text-sm text-[#8E8E93] leading-relaxed max-w-md mx-auto">
          Мы не обещаем лёгкие деньги. Мы даём систему, в которой{' '}
          <span className="text-[#1A1A1A] font-semibold">сильные мастера зарабатывают больше</span>.
        </p>
      </div>
    </section>
  );
}
