import { Check, Minus } from 'lucide-react';

export default function Comparison() {
  const platforms = [
    {
      name: 'Честный Мастер',
      color: 'text-honest-primary',
      bg: 'bg-honest-primary/10',
      border: 'border-honest-primary',
    },
    {
      name: 'Другие биржи',
      color: 'text-honest-accent',
      bg: 'bg-honest-accent/10',
      border: 'border-honest-accent',
    },
    {
      name: 'Самостоятельный поиск',
      color: 'text-honest-secondary',
      bg: 'bg-honest-secondary/10',
      border: 'border-honest-secondary',
    },
  ];

  const rows = [
    { feature: 'Процент мастеру', values: ['85%', '50-70%', '100% (но сложно найти)'] },
    { feature: 'Вступительный взнос', values: ['0 ₽', '500–5000 ₽', '0 ₽'] },
    { feature: 'Автоматический подбор заказов', values: ['✅', '❌', '❌'] },
    { feature: 'Гарантия оплаты', values: ['✅', '⏳', '❌'] },
    { feature: 'Прямое общение с клиентом', values: ['✅', '❌', '✅'] },
    { feature: 'Выплаты каждые 24 часа', values: ['✅', '7–14 дней', 'зависит от клиента'] },
    { feature: 'Поддержка 24/7', values: ['✅', '✅', '❌'] },
    { feature: 'Рейтинговая система', values: ['✅', '✅', '❌'] },
  ];

  return (
    <section className="py-20 px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-honest-darker to-honest-dark z-0"></div>
      <div className="absolute top-1/4 -right-20 w-64 h-64 bg-honest-primary/5 rounded-full blur-3xl"></div>
      
      <div className="max-w-6xl mx-auto relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            <span className="text-white">Сравнение с </span>
            <span className="text-honest-primary">альтернативами</span>
          </h2>
          <p className="text-xl text-honest-light max-w-3xl mx-auto">
            Почему мастера выбирают нашу платформу вместо традиционных бирж и самостоятельного поиска.
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-honest-primary/20 bg-honest-dark/40 backdrop-blur-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-honest-primary/20">
                <th className="text-left p-6 text-honest-light font-semibold">Характеристика</th>
                {platforms.map((plat) => (
                  <th key={plat.name} className="p-6">
                    <div className={`inline-flex items-center justify-center px-4 py-2 rounded-xl ${plat.bg} ${plat.border} border`}>
                      <span className={`font-bold ${plat.color}`}>{plat.name}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} className="border-b border-honest-primary/10 last:border-0">
                  <td className="p-6 text-white font-semibold">{row.feature}</td>
                  {row.values.map((value, colIdx) => (
                    <td key={colIdx} className="p-6">
                      <div className="flex items-center justify-center">
                        {value === '✅' ? (
                          <Check className="w-6 h-6 text-honest-primary" />
                        ) : value === '❌' ? (
                          <Minus className="w-6 h-6 text-honest-muted" />
                        ) : value === '⏳' ? (
                          <span className="text-honest-secondary font-semibold">Частично</span>
                        ) : (
                          <span className={`font-bold ${colIdx === 0 ? 'text-honest-primary' : colIdx === 1 ? 'text-honest-accent' : 'text-honest-secondary'}`}>
                            {value}
                          </span>
                        )}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
          {platforms.map((plat, idx) => (
            <div
              key={idx}
              className={`p-6 rounded-2xl border ${plat.border} ${plat.bg} backdrop-blur-sm`}
            >
              <h4 className={`text-xl font-bold mb-4 ${plat.color}`}>{plat.name}</h4>
              <ul className="space-y-2">
                {idx === 0 && (
                  <>
                    <li className="text-white">• Максимальный доход</li>
                    <li className="text-white">• Автоматизация процессов</li>
                    <li className="text-white">• Минимальные риски</li>
                  </>
                )}
                {idx === 1 && (
                  <>
                    <li className="text-honest-light">• Высокие комиссии</li>
                    <li className="text-honest-light">• Долгие выплаты</li>
                    <li className="text-honest-light">• Конкуренция с агентствами</li>
                  </>
                )}
                {idx === 2 && (
                  <>
                    <li className="text-honest-light">• Постоянный поиск клиентов</li>
                    <li className="text-honest-light">• Риски неоплаты</li>
                    <li className="text-honest-light">• Отсутствие гарантий</li>
                  </>
                )}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}