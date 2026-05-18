import { FileEdit, Search, Phone, CheckCircle2 } from 'lucide-react';

const steps = [
  {
    number: '01',
    title: 'Вы оставляете заявку',
    text: 'Укажите имя, телефон, город и что нужно сделать. Займёт 1–2 минуты.',
    icon: FileEdit,
  },
  {
    number: '02',
    title: 'Система подбирает мастера',
    text: 'Подбор занимает 15–30 минут. Учитываем ваш город, тип работ и рейтинг специалиста.',
    icon: Search,
  },
  {
    number: '03',
    title: 'Мастер связывается с вами',
    text: 'Уточняет детали, выезжает на замер и готовит понятную смету до начала работ.',
    icon: Phone,
  },
  {
    number: '04',
    title: 'Вы согласуете старт',
    text: 'Договариваетесь о времени, мастер приступает. Никакого хаоса и поиска вслепую.',
    icon: CheckCircle2,
  },
];

export default function HowItWorks() {
  const scrollToForm = () => {
    document.getElementById('form')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section id="how" className="bg-[#F1F5F9] py-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#111827] mb-3">
            Как всё происходит
          </h2>
          <p className="text-[#6B7280] text-base">
            Без хаоса, бесконечных звонков и поиска вслепую.
          </p>
        </div>

        {/* Steps */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          {steps.map((step, i) => (
            <div key={step.number} className="relative">
              {/* Connector line (desktop) */}
              {i < steps.length - 1 && (
                <div className="hidden lg:block absolute top-6 left-[calc(100%-8px)] w-full h-px bg-[#E5E7EB] z-0" />
              )}
              <div className="bg-white rounded-2xl p-6 border border-[#E5E7EB] relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-xl bg-[#34C759] flex items-center justify-center flex-shrink-0">
                    {(() => { const Icon = step.icon; return <Icon size={22} className="text-white" strokeWidth={2} />; })()}
                  </div>
                  <span className="text-[#94A3B8] font-bold text-sm">{step.number}</span>
                </div>
                <h3 className="text-[#111827] font-semibold text-base mb-2 leading-snug">{step.title}</h3>
                <p className="text-[#6B7280] text-sm leading-relaxed">{step.text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center">
          <button
            onClick={scrollToForm}
            className="bg-[#34C759] text-white font-semibold px-7 py-3.5 rounded-xl hover:bg-[#2db34e] transition-colors shadow-sm"
          >
            Оставить заявку
          </button>
        </div>
      </div>
    </section>
  );
}
