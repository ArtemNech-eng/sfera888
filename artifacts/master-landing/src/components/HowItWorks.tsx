import { UserPlus, Eye, Ruler, CheckCircle } from 'lucide-react';

const steps = [
  {
    icon: UserPlus,
    number: '01',
    title: 'Заполняете форму',
    description: 'Регистрируетесь на сайте — получаете доступ к PWA-приложению с лентой заказов.',
  },
  {
    icon: Eye,
    number: '02',
    title: 'Видите заявки — откликаетесь',
    description: 'В ленте появляются заявки по вашей специализации и городу. Берёте подходящую.',
  },
  {
    icon: Ruler,
    number: '03',
    title: 'Замер → смета → работа',
    description: 'Выезжаете к клиенту, составляете смету в приложении, выполняете работу.',
  },
  {
    icon: CheckCircle,
    number: '04',
    title: 'Клиент заплатил → оплатили → новый',
    description: 'Клиент оплачивает вам → вы оплачиваете 500₽ + 15%. Получаете следующий заказ.',
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="relative py-20 sm:py-28 bg-[#F1EEE7]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-[#0F172A] mb-4 text-center">
          Как это <span className="text-[#D9342B]">работает</span>
        </h2>
        <p className="text-[#475569] text-center max-w-3xl mx-auto mb-14 text-lg">
          Четыре простых шага от регистрации до дохода
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step) => (
            <div
              key={step.number}
              className="relative p-6 rounded-2xl bg-white border border-[#EDEAE2] shadow-sm hover:shadow-md transition-all duration-300"
            >
              <div className="absolute -top-3 right-6 px-3 py-1 rounded-full text-xs font-bold bg-[#FCE9E7] border border-[#EDEAE2] text-[#D9342B]">
                Шаг {step.number}
              </div>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 bg-[#FCE9E7] border border-[#EDEAE2]">
                <step.icon className="w-6 h-6 text-[#D9342B]" />
              </div>
              <h3 className="text-lg font-bold text-[#0F172A] mb-2">{step.title}</h3>
              <p className="text-[#475569] text-sm leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
