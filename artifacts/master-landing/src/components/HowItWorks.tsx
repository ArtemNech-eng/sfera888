import { FileText, UserCheck, ThumbsUp, Smartphone, Briefcase } from 'lucide-react';

const steps = [
  {
    icon: FileText,
    number: '01',
    title: 'Заполняете форму',
    description: 'Указываете специализацию, город, опыт. Занимает 2 минуты.',
  },
  {
    icon: UserCheck,
    number: '02',
    title: 'Проверка анкеты',
    description: 'Менеджер проверяет вашу заявку и связывается с вами.',
  },
  {
    icon: ThumbsUp,
    number: '03',
    title: 'Менеджер одобряет',
    description: 'Получаете подтверждение и приглашение в систему.',
  },
  {
    icon: Smartphone,
    number: '04',
    title: 'Доступ к приложению',
    description: 'Устанавливаете PWA-приложение и видите ленту заказов.',
  },
  {
    icon: Briefcase,
    number: '05',
    title: 'Берёте первый объект',
    description: 'Выбираете подходящий заказ из ленты и начинаете работать.',
  },
];

export default function HowToStart() {
  return (
    <section id="how-to-start" className="relative py-20 sm:py-28 bg-[#F1EEE7]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-[#0F172A] mb-4 text-center">
          Как <span className="text-[#D9342B]">начать</span>
        </h2>
        <p className="text-[#475569] text-center max-w-3xl mx-auto mb-14 text-lg">
          От заявки до первого объекта — 5 простых шагов
        </p>

        <div className="max-w-3xl mx-auto space-y-4">
          {steps.map((step, index) => (
            <div
              key={step.number}
              className="flex items-start gap-5 p-5 rounded-2xl bg-white border border-[#EDEAE2] shadow-sm"
            >
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[#FCE9E7] border border-[#EDEAE2]">
                  <step.icon className="w-6 h-6 text-[#D9342B]" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-[#D9342B] text-xs font-bold">Шаг {step.number}</span>
                  <h3 className="text-[#0F172A] font-bold">{step.title}</h3>
                </div>
                <p className="text-[#475569] text-sm">{step.description}</p>
              </div>
              {index < steps.length - 1 && (
                <div className="hidden sm:block absolute left-[2.15rem] mt-14 w-0.5 h-4 bg-[#EDEAE2]" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
