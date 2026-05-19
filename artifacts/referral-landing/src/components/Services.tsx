import { motion } from "framer-motion";
import {
  Wallpaper,
  PaintbrushVertical,
  BrickWall,
  Paintbrush,
  Grid3X3,
  ShowerHead,
  Zap,
  Wrench,
  Home,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import SectionHeader from "./SectionHeader";

interface Service {
  icon: LucideIcon;
  label: string;
  desc: string;
}

const services: Service[] = [
  { icon: Wallpaper, label: 'Поклейка обоев', desc: 'Ровные швы, подбор рисунка' },
  { icon: PaintbrushVertical, label: 'Шпаклёвка стен', desc: 'Под покраску или обои' },
  { icon: BrickWall, label: 'Штукатурка', desc: 'Выравнивание и ремонт' },
  { icon: Paintbrush, label: 'Покраска', desc: 'Без разводов и следов' },
  { icon: Grid3X3, label: 'Укладка плитки', desc: 'Ванная, кухня, полы' },
  { icon: ShowerHead, label: 'Санузел под ключ', desc: 'Всё от демонтажа до плитки' },
  { icon: Zap, label: 'Электрика', desc: 'Замена проводки, розетки' },
  { icon: Wrench, label: 'Сантехника', desc: 'Смесители, трубы, стояки' },
  { icon: Home, label: 'Квартира под ключ', desc: 'Полный ремонт от А до Я' },
];

export default function Services() {
  const scrollToForm = () => {
    document.getElementById('form')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section id="services" className="py-24 bg-emerald-50/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <SectionHeader
          title="Что нужно сделать?"
          subtitle="Выберите свою задачу — мастер возьмётся за любой объём работ"
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-5">
          {services.map((service, i) => {
            const Icon = service.icon;
            return (
              <motion.button
                key={service.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, duration: 0.5 }}
                whileHover={{ y: -6, transition: { duration: 0.2 } }}
                onClick={scrollToForm}
                className="group bg-white rounded-3xl p-6 flex flex-col items-center gap-3 border border-gray-100 hover:border-emerald-200 hover:shadow-premium transition-all duration-300 cursor-pointer text-center"
              >
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-[#059669] group-hover:gradient-bg group-hover:text-white transition-all duration-300 shadow-sm">
                  <Icon className="w-7 h-7" strokeWidth={1.5} />
                </div>
                <div>
                  <div className="text-[#111827] font-bold text-sm leading-snug group-hover:text-[#059669] transition-colors">
                    {service.label}
                  </div>
                  <div className="text-gray-400 text-xs mt-1">{service.desc}</div>
                </div>
              </motion.button>
            );
          })}
        </div>

        <p className="text-center text-gray-400 text-sm mt-8">
          Не нашли свою задачу?{' '}
          <button onClick={scrollToForm} className="text-[#059669] font-semibold hover:underline">
            Напишите в заявке — подберём мастера
          </button>
        </p>
      </div>
    </section>
  );
}
