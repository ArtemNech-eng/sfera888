import { FileText, UserCheck, ThumbsUp, Smartphone, Briefcase } from 'lucide-react';
import Eyebrow from './Eyebrow';

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
    <section id="how-to-start" className="relative py-14 sm:py-20 bg-[#FAF6EF]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <Eyebrow number="07" label="Как начать" />
        <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1A1A1A] mb-4 text-center">
          Как{' '}
          <span className="relative inline-block">
            <span className="absolute inset-x-0 bottom-1 h-3 sm:h-4 bg-[#FACC15] -z-10 rounded-sm" />
            начать
          </span>
        </h2>
        <p className="text-[#57534E] text-center max-w-3xl mx-auto mb-14 text-lg">
          От заявки до первого объекта — 5 простых шагов
        </p>

        <div className="max-w-3xl mx-auto space-y-4">
          {steps.map((step) => (
            <div
              key={step.number}
              className="flex items-start gap-5 p-5 rounded-3xl bg-white border border-[#E7E0D4] shadow-sm hover:shadow-md transition-all duration-300"
            >
              <div className="flex-shrink-0 relative">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[#FEF3C7]">
                  <step.icon className="w-6 h-6 text-[#E8590C]" />
                </div>
                <span className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-[#FACC15] text-[#1A1A1A] font-mono text-xs font-bold flex items-center justify-center">
                  {step.number}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[#1A1A1A] font-bold mb-1 flex items-center gap-2">
                  {step.title}
                  <span className="text-[#E8590C]">→</span>
                </h3>
                <p className="text-[#57534E] text-sm">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
