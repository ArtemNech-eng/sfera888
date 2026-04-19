const stats = [
  { value: '340+', label: 'мастеров подключено' },
  { value: '2 100+', label: 'заказов выполнено' },
  { value: '18', label: 'городов в работе' },
];

export default function Trust() {
  return (
    <section className="bg-white py-20 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-800 text-[#1A1A1A] mb-4">
            Почему мастера остаются с нами
          </h2>
          <div className="max-w-xl mx-auto space-y-3 text-[#8E8E93] text-base leading-relaxed">
            <p>
              Мы строим систему, а не хаос. У мастера есть понятные правила,
              понятный поток заказов и понятная логика роста.
            </p>
            <p className="text-[#1A1A1A] font-600">
              Сделал хорошо — получил больше.
              Схалтурил — потерял доступ.
              Всё честно.
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="card text-center py-8">
              <div className="stat-number mb-2">{stat.value}</div>
              <div className="text-sm text-[#8E8E93] leading-snug">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
