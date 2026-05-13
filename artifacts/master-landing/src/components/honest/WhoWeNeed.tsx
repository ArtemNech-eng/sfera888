import { Clock, Calculator, Shield, DollarSign } from 'lucide-react';

export default function WhoWeNeed() {
  const specialties = ['Обои', 'Шпаклевка', 'Покраска', 'Плитка', 'Сантехника', 'Отделочники', 'Универсалы'];

  const rules = [
    { icon: Clock, text: 'Приезжать на замеры вовремя' },
    { icon: Calculator, text: 'Считать сметы ТОЛЬКО через наше приложение' },
    { icon: Shield, text: 'Работать только внутри системы (без обхода)' },
    { icon: DollarSign, text: 'Держать адекватные рыночные цены' },
  ];

  return (
    <section className="relative py-20 sm:py-28">
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#34F5A3]/30 to-transparent" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-[#F8FAFC] mb-12 text-center">
          С кем мы работаем
        </h2>

        {/* Specialties tags */}
        <div className="flex flex-wrap justify-center gap-3 mb-12">
          {specialties.map((spec) => (
            <span
              key={spec}
              className="px-5 py-2.5 rounded-full bg-[#111827]/80 border border-[#34F5A3]/20 text-[#F8FAFC] text-sm font-medium backdrop-blur-sm"
            >
              {spec}
            </span>
          ))}
        </div>

        {/* Rules */}
        <div className="max-w-2xl mx-auto">
          <h3 className="text-xl font-bold text-[#F8FAFC] mb-6 text-center">Правила платформы</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            {rules.map(({ icon: Icon, text }, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-4 rounded-xl bg-[#111827]/60 border border-[#94A3B8]/10"
              >
                <Icon className="w-5 h-5 text-[#FACC15] flex-shrink-0 mt-0.5" />
                <span className="text-[#94A3B8] text-sm">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
