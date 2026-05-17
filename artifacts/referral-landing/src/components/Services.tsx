const services = [
  { icon: '🖼️', label: 'Поклейка обоев' },
  { icon: '🪣', label: 'Шпаклёвка стен' },
  { icon: '🏗️', label: 'Штукатурка' },
  { icon: '🖌️', label: 'Покраска' },
  { icon: '⬜', label: 'Укладка плитки' },
  { icon: '🚿', label: 'Санузел под ключ' },
  { icon: '⚡', label: 'Электрика' },
  { icon: '🔧', label: 'Сантехника' },
  { icon: '🏠', label: 'Квартира под ключ' },
];

export default function Services() {
  const scrollToForm = () => {
    document.getElementById('form')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section id="services" className="bg-[#F1F5F9] py-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#111827] mb-3">
            Что нужно сделать?
          </h2>
          <p className="text-[#6B7280] text-base max-w-md mx-auto">
            Выберите свою задачу — мастер возьмётся за любой объём работ
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-4">
          {services.map((service) => (
            <button
              key={service.label}
              onClick={scrollToForm}
              className="group bg-white rounded-2xl p-5 flex flex-col items-center gap-3 border border-[#E5E7EB] hover:border-[#34C759] hover:shadow-md transition-all duration-200 cursor-pointer text-center"
            >
              <span className="text-3xl">{service.icon}</span>
              <span className="text-[#111827] font-medium text-sm leading-snug group-hover:text-[#34C759] transition-colors">
                {service.label}
              </span>
            </button>
          ))}
        </div>

        <p className="text-center text-[#94A3B8] text-sm mt-8">
          Не нашли свою задачу?{' '}
          <button onClick={scrollToForm} className="text-[#34C759] font-medium hover:underline">
            Напишите в заявке — подберём мастера
          </button>
        </p>
      </div>
    </section>
  );
}
