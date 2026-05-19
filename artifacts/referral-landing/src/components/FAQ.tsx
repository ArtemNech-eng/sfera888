import { useState } from 'react';
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from 'lucide-react';
import SectionHeader from "./SectionHeader";

const faqs = [
  {
    question: 'Это бесплатно?',
    answer: 'Да. Вы просто оставляете заявку. Оплата происходит только за выполненную работу.',
  },
  {
    question: 'Вы фирма или частные мастера?',
    answer: 'Мы городской сервис, который объединяет проверенных частных мастеров. Не строительная фирма с накрутками, а платформа для подбора специалистов.',
  },
  {
    question: 'Почему цены ниже?',
    answer: 'Потому что мы работаем без лишних посредников и не закладываем фирменные накрутки. Вы платите мастеру напрямую.',
  },
  {
    question: 'Когда со мной свяжутся?',
    answer: 'Обычно мастер связывается в течение 15–30 минут после заявки.',
  },
  {
    question: 'Мастера реально проверены?',
    answer: 'Да. Документы и рейтинг мастеров проверяются, в систему попадают только допущенные специалисты с рейтингом от 4.5.',
  },
  {
    question: 'Что если мастер не подойдёт?',
    answer: 'Мы поможем подобрать другого специалиста. Свяжитесь с нами, и мы найдём замену.',
  },
];

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="glass rounded-2xl overflow-hidden hover:shadow-float transition-shadow duration-300">
      <button
        className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-white/60 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className="text-[#111827] font-bold text-sm sm:text-base pr-4">{question}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.25 }}
          className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center"
        >
          <ChevronDown size={16} className="text-[#059669]" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-5">
              <p className="text-gray-500 text-sm leading-relaxed">{answer}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FAQ() {
  return (
    <section id="faq" className="py-24 bg-white relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-emerald-50/40 rounded-full blur-[100px] pointer-events-none" />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 relative z-10">
        <SectionHeader
          title="Частые вопросы"
          subtitle="Отвечаем честно и по делу"
        />
        <div className="space-y-3">
          {faqs.map((faq) => (
            <FAQItem key={faq.question} {...faq} />
          ))}
        </div>
      </div>
    </section>
  );
}
