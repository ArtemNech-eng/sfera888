import { motion } from "framer-motion";
import { CheckCircle2, Sparkles } from 'lucide-react';
import GradientButton from "./GradientButton";

export default function FinalCTA() {
  const scrollToForm = () => {
    document.getElementById('form')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 gradient-dark" />
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDM0aDR2NGgtNHpNMzQgMzZoNHY0aC00eiIvPjwvZz48L2c+PC9zdmc+')] opacity-40" />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl sm:text-5xl font-extrabold text-white mb-5 leading-tight tracking-tight">
            Узнайте стоимость ремонта — бесплатно, онлайн
          </h2>
          <p className="text-gray-400 text-lg mb-10 leading-relaxed max-w-xl mx-auto">
            Мастер позвонит и составит смету без визита. Без обязательств.
          </p>
          <GradientButton onClick={scrollToForm} size="lg" className="animate-pulse-glow">
            <Sparkles size={20} />
            Рассчитать стоимость
          </GradientButton>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex flex-wrap justify-center gap-6 mt-12 text-sm text-gray-400"
        >
          {['Бесплатный расчёт', 'Мастер позвонит за 15–30 минут', 'Гарантия 2 года', 'Без посредников'].map((badge) => (
            <span key={badge} className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 size={12} className="text-emerald-400" />
              </span>
              {badge}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
