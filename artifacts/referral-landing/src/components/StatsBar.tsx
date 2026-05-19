import { motion } from "framer-motion";
import AnimatedCounter from "./AnimatedCounter";

const stats = [
  { value: 340, suffix: "+", label: "мастеров подключено" },
  { value: 2100, suffix: "+", label: "заказов выполнено" },
  { value: 18, suffix: "", label: "городов в работе" },
  { value: 48, suffix: "", label: "средний рейтинг", prefix: "4." },
];

export default function StatsBar() {
  return (
    <section className="relative py-14 overflow-hidden">
      <div className="absolute inset-0 gradient-dark" />
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDM0aDR2NGgtNHpNMzQgMzZoNHY0aC00eiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12"
        >
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-4xl sm:text-5xl font-extrabold text-white mb-2">
                <AnimatedCounter
                  value={stat.value}
                  suffix={stat.suffix}
                  prefix={stat.prefix}
                  className="text-white"
                />
              </div>
              <div className="text-emerald-200/70 text-sm font-medium">{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
