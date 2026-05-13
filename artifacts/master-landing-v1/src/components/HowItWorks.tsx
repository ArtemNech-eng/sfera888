import { Bell, Zap, Calculator, CheckSquare } from 'lucide-react';

const steps = [
  {
    number: '01',
    icon: Bell,
    title: 'Получаете заявку',
    description:
      'В приложении появляются новые заказы по вашему городу и специализации',
  },
  {
    number: '02',
    icon: Zap,
    title: 'Откликаетесь',
    description:
      'Система выбирает мастера по конверсии, рейтингу и скорости. Быстрее откликаетесь — больше шансов',
  },
  {
    number: '03',
    icon: Calculator,
    title: 'Едете на замер',
    description:
      'Считаете смету прямо в приложении и отправляете клиенту',
  },
  {
    number: '04',
    icon: CheckSquare,
    title: 'Берёте объект',
    description:
      'Клиент вносит предоплату, выходите на работу и закрываете заказ в системе. После закрытия — новые заявки доступны.',
  },
];

export default function HowItWorks() {
  return (
    <section className="bg-white py-20 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-extrabold text-[#1A1A1A] mb-3">
            Как вы работаете с нами
          </h2>
          <p className="text-[#8E8E93] text-lg">Четыре простых шага</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-10">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.number} className="card relative overflow-hidden">
                {/* Step number background */}
                <div className="absolute top-4 right-5 text-6xl font-black text-[#F5F5F5] select-none leading-none">
                  {step.number}
                </div>
                <div className="relative">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                    style={{ backgroundColor: 'rgba(52,199,89,0.1)' }}
                  >
                    <Icon size={22} color="#34C759" strokeWidth={2} />
                  </div>
                  <h3 className="text-lg font-bold text-[#1A1A1A] mb-2">{step.title}</h3>
                  <p className="text-[#8E8E93] text-sm leading-relaxed">{step.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-center text-[#1A1A1A] font-medium text-base">
          Вы не ищете клиентов вручную —{' '}
          <span className="text-[#34C759] font-bold">
            сервис сам приводит их в систему
          </span>
        </p>
      </div>
    </section>
  );
}
