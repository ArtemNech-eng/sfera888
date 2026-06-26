import { ClipboardList, Hammer, CheckCircle2, RotateCcw } from 'lucide-react';
import Eyebrow from './Eyebrow';

const steps = [
  {
    icon: ClipboardList,
    number: '01',
    title: 'Взял объект',
    description: 'Выбираете подходящую заявку из ленты, откликаетесь, получаете контакт клиента.',
  },
  {
    icon: Hammer,
    number: '02',
    title: 'Сделал',
    description: 'Выезжаете на замер, составляете смету в приложении, выполняете работу качественно и в срок.',
  },
  {
    icon: CheckCircle2,
    number: '03',
    title: 'Закрыл',
    description: 'После завершения закрываете объект. Клиент оплачивает. Вы оплачиваете комиссию (500₽ + 15%).',
  },
  {
    icon: RotateCcw,
    number: '04',
    title: 'Взял новый',
    description: 'Объект закрыт — берёте следующий. Конвейер работает без пауз.',
  },
];

export default function System() {
  return (
    <section id="system" className="relative py-14 sm:py-20 bg-[#FAF6EF]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <Eyebrow number="01" label="Как это работает" />
        <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1A1A1A] mb-4 text-center">
          Принцип конвейера:{' '}
          <span className="relative inline-block">
            <span className="absolute inset-x-0 bottom-1 h-3 sm:h-4 bg-[#FACC15] -z-10 rounded-sm" />
            Взял → Сделал → Взял новый
          </span>
        </h2>
        <p className="text-[#57534E] text-center max-w-3xl mx-auto mb-14 text-lg">
          Мы не даём мастерам хватать по 5 объектов и срывать сроки. По умолчанию: 1 активный заказ.
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step, index) => (
            <div
              key={step.number}
              className="relative p-6 rounded-3xl border border-[#E7E0D4] shadow-sm hover:shadow-md transition-all duration-300"
              style={{ background: 'linear-gradient(160deg, #FFFFFF 0%, #FBF6EE 100%)' }}
            >
              <div className="absolute -top-3 right-6 px-3 py-1 rounded-full text-xs font-mono font-bold bg-[#FACC15] text-[#1A1A1A]">
                {step.number}
              </div>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 bg-[#FEF3C7]">
                <step.icon className="w-6 h-6 text-[#E8590C]" />
              </div>
              <h3 className="text-lg font-bold text-[#1A1A1A] mb-2">{step.title}</h3>
              <p className="text-[#57534E] text-sm leading-relaxed">{step.description}</p>
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-1/2 -right-3 text-[#E8590C] text-xl font-bold">
                  →
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <div className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white border border-[#E7E0D4] shadow-sm">
            <span className="text-[#57534E] text-sm">
              Для лучших мастеров —{' '}
              <span className="text-[#1A1A1A] font-semibold">до 2 объектов одновременно</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
