import { motion } from "framer-motion";
import { Users, Briefcase, MapPin, Award, FileCheck, Star, BadgeCheck, ShieldCheck } from 'lucide-react';
import AnimatedCounter from "./AnimatedCounter";
import SectionHeader from "./SectionHeader";
import GlassCard from "./GlassCard";

const stats = [
  { value: 340, suffix: "+", label: 'мастеров подключено', icon: Users },
  { value: 2100, suffix: "+", label: 'заказов выполнено', icon: Briefcase },
  { value: 18, suffix: "", label: 'городов в работе', icon: MapPin },
  { value: 48, suffix: "", prefix: "4.", label: 'средний рейтинг', icon: Award },
];

const trustCards = [
  {
    icon: Users,
    title: 'Проверенные частные мастера',
    text: 'Все мастера проходят проверку документов и работают внутри системы.',
  },
  {
    icon: Star,
    title: 'Рейтинг от 4.5',
    text: 'Мы допускаем в работу только специалистов с хорошей репутацией.',
  },
  {
    icon: BadgeCheck,
    title: 'Без посредников',
    text: 'Вы не переплачиваете менеджерам и фирмам. Работаем напрямую.',
  },
  {
    icon: ShieldCheck,
    title: 'Смета и гарантия',
    text: 'До начала работ вы понимаете стоимость, а после получаете гарантию 2 года.',
  },
];

export default function TrustBlock() {
  return (
    <section className="py-24 bg-white relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-emerald-50/50 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 relative z-10">
        <SectionHeader
          title="Почему нам доверяют"
          subtitle="Прозрачный сервис, проверенные специалисты и понятные условия"
        />

        {/* Stats counters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-14"
        >
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="gradient-bg rounded-3xl p-6 text-center text-white shadow-premium">
                <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-4">
                  <Icon size={24} className="text-white" />
                </div>
                <div className="text-4xl sm:text-5xl font-extrabold mb-1">
                  <AnimatedCounter value={stat.value} suffix={stat.suffix} prefix={stat.prefix} className="text-white" />
                </div>
                <div className="text-emerald-100 text-sm font-medium">{stat.label}</div>
              </div>
            );
          })}
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
          {trustCards.map((card, i) => {
            const IconComponent = card.icon;
            return (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
              >
                <GlassCard className="h-full">
                  <div className="w-12 h-12 rounded-2xl gradient-bg flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/20">
                    <IconComponent size={22} className="text-white" />
                  </div>
                  <h3 className="text-[#111827] font-bold text-base mb-2">{card.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{card.text}</p>
                </GlassCard>
              </motion.div>
            );
          })}
        </div>

        {/* Trust badges */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex flex-wrap justify-center gap-3"
        >
          {[
            { icon: FileCheck, text: 'Документы проверены' },
            { icon: Star, text: 'Рейтинг от 4.5' },
            { icon: BadgeCheck, text: 'Без посредников' },
            { icon: ShieldCheck, text: 'Гарантия 2 года' },
          ].map((badge) => {
            const BIcon = badge.icon;
            return (
              <span
                key={badge.text}
                className="gradient-bg text-white text-sm font-semibold px-5 py-2.5 rounded-full flex items-center gap-2 shadow-sm"
              >
                <BIcon size={14} />
                {badge.text}
              </span>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
