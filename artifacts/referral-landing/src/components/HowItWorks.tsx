import { motion } from "framer-motion";
import { FileEdit, Search, Phone, CheckCircle2 } from 'lucide-react';
import SectionHeader from "./SectionHeader";
import GradientButton from "./GradientButton";

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
    text: 'Подбор занимает 15–30 минут. Учитываем ваш город, тип работ и рейтинг.',
    icon: Search,
  },
  {
    number: '03',
    title: 'Мастер связывается с вами',
    text: 'Уточняет детали, выезжает на замер и готовит понятную смету.',
    icon: Phone,
  },
  {
    number: '04',
    title: 'Вы согласуете старт',
    text: 'Договариваетесь о времени, мастер приступает. Без хаоса.',
    icon: CheckCircle2,
  },
];

export default function HowItWorks() {
  const scrollToForm = () => {
    document.getElementById('form')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section id="how" className="py-24 bg-emerald-50/30 relative overflow-hidden">
      <div className="absolute top-20 right-0 w-[400px] h-[400px] bg-emerald-100/40 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 relative z-10">
        <SectionHeader
          title="Как всё происходит"
          subtitle="Без хаоса, бесконечных звонков и поиска вслепую."
        />

        {/* Steps */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.12, duration: 0.6 }}
              className="relative"
            >
              {/* Connector line (desktop) */}
              {i < steps.length - 1 && (
                <div className="hidden lg:block absolute top-10 left-[calc(100%+12px)] w-[calc(100%-24px)] h-0.5 bg-gradient-to-r from-emerald-200 to-emerald-100 z-0" />
              )}
              <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-soft hover:shadow-float transition-shadow duration-300 relative z-10 h-full">
                <div className="flex items-center justify-between mb-5">
                  <div className="w-14 h-14 rounded-2xl gradient-bg flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-500/20">
                    {(() => { const Icon = step.icon; return <Icon size={26} className="text-white" strokeWidth={2} />; })()}
                  </div>
                  <span className="text-4xl font-extrabold text-emerald-100">{step.number}</span>
                </div>
                <h3 className="text-[#111827] font-bold text-lg mb-2 leading-snug">{step.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{step.text}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <GradientButton onClick={scrollToForm} size="lg">
            Оставить заявку
          </GradientButton>
        </motion.div>
      </div>
    </section>
  );
}
