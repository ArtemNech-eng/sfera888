import { X, Check } from 'lucide-react';

export default function Comparison() {
  const problems = [
    'Покупаешь пустые контакты на биржах',
    'Клиенты «просто прицениваются»',
    'Тратишь время на переписку',
    'Конкурируешь с демпингом',
    'Завтра работы может не быть',
  ];

  const solutions = [
    'Платите только за реальные объекты (или с возвратом токена)',
    'Клиенты уже отфильтрованы и ждут замера',
    '100% стоимости работ забираете себе',
    'Оформляете красивую смету в приложении',
    'Работаете без простоев',
  ];

  return (
    <section className="relative py-20 sm:py-28">
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#38BDF8]/30 to-transparent" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-[#F8FAFC] mb-12 text-center">
          Почему сильные мастера <span className="text-[#34F5A3]">переходят к нам</span>
        </h2>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Problems */}
          <div className="p-6 sm:p-8 rounded-2xl bg-[#111827]/80 border border-red-500/20 backdrop-blur-sm">
            <h3 className="text-lg font-bold text-red-400 mb-6">Сам ищешь клиентов</h3>
            <ul className="space-y-4">
              {problems.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <X className="w-3.5 h-3.5 text-red-400" />
                  </div>
                  <span className="text-[#94A3B8]">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Solutions */}
          <div className="p-6 sm:p-8 rounded-2xl bg-[#111827]/80 border border-[#34F5A3]/20 backdrop-blur-sm">
            <h3 className="text-lg font-bold text-[#34F5A3] mb-6">В системе Честный Мастер</h3>
            <ul className="space-y-4">
              {solutions.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#34F5A3]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5 text-[#34F5A3]" />
                  </div>
                  <span className="text-[#F8FAFC]">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
