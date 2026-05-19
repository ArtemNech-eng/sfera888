import { Users, FileCheck, Zap, Star, ShieldCheck, TrendingUp, Heart, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface HeroProps {
  refSlug: string | null;
}

export default function Hero({ refSlug }: HeroProps) {
  const scrollToForm = () => {
    document.getElementById('form')?.scrollIntoView({ behavior: 'smooth' });
  };
  const scrollToReviews = () => {
    document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth' });
  };

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.12, delayChildren: 0.3 },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 30 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
  };

  const floatCards = [
    { icon: Star, label: 'Рейтинг мастеров', value: '4.8 / 5', top: 'top-8', left: '-left-4', delay: 0 },
    { icon: CheckCircle2, label: 'Документы', value: 'Проверены', top: 'top-20', right: '-right-4', delay: 0.15 },
    { icon: ShieldCheck, label: 'Гарантия работ', value: '2 года', bottom: 'bottom-12', left: '-left-4', delay: 0.3 },
  ];

  return (
    <section className="relative pt-28 pb-20 lg:pt-36 lg:pb-28 overflow-hidden">
      {/* Background blobs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-emerald-100/60 rounded-full blur-[100px]" />
        <div className="absolute top-40 -left-20 w-[400px] h-[400px] bg-emerald-50/80 rounded-full blur-[80px]" />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-14 lg:gap-16">

          {/* Left column */}
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="flex-1 max-w-xl"
          >
            {/* Badge */}
            <motion.div variants={item} className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm font-semibold px-4 py-1.5 rounded-full mb-6">
              <span className="w-2 h-2 rounded-full bg-[#059669] animate-pulse"></span>
              Городской сервис проверенных частных мастеров
            </motion.div>

            {refSlug && (
              <motion.div variants={item} className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium px-4 py-2.5 rounded-xl mb-5">
                <Heart size={16} className="fill-amber-400 text-amber-400" />
                Вам нас порекомендовал мастер
              </motion.div>
            )}

            <motion.h1 variants={item} className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-[#111827] leading-[1.1] mb-6 tracking-tight">
              Подберём{' '}
              <span className="gradient-text">проверенного</span>{' '}
              мастера за 15–30 минут
            </motion.h1>

            <motion.p variants={item} className="text-gray-500 text-lg leading-relaxed mb-6 max-w-lg">
              Честный Мастер — городской сервис, который объединяет проверенных частных мастеров.
              Без посредников, с понятной сметой и гарантией 2 года.
            </motion.p>

            {/* Discount badge */}
            <motion.div variants={item} className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm font-semibold px-4 py-2 rounded-xl mb-8">
              <Heart size={16} className="fill-amber-400 text-amber-400" />
              Скидка до 15% по рекомендации мастера
            </motion.div>

            {/* Mini advantages */}
            <motion.ul variants={item} className="space-y-3 mb-8">
              {[
                { icon: Users, text: 'Частные мастера без посредников' },
                { icon: FileCheck, text: 'Документы проверены, рейтинг от 4.5' },
                { icon: Zap, text: 'Подбор специалиста за 15–30 минут' },
              ].map((itemData) => {
                const Icon = itemData.icon;
                return (
                  <li key={itemData.text} className="flex items-center gap-3 text-gray-700">
                    <span className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      <Icon size={16} className="text-[#059669]" />
                    </span>
                    <span className="text-sm font-medium">{itemData.text}</span>
                  </li>
                );
              })}
            </motion.ul>

            {/* Buttons */}
            <motion.div variants={item} className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={scrollToForm}
                className="gradient-bg text-white font-semibold px-7 py-4 rounded-2xl hover:scale-[1.03] hover:shadow-lg hover:shadow-emerald-500/30 transition-all duration-300 text-base glow-green"
              >
                Оставить заявку
              </button>
              <button
                onClick={scrollToReviews}
                className="bg-white text-gray-700 font-semibold px-7 py-4 rounded-2xl border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/50 transition-all duration-300 text-base shadow-soft"
              >
                Смотреть отзывы
              </button>
            </motion.div>

            {/* Social proof */}
            <motion.div variants={item} className="flex items-center gap-3 text-gray-400 text-sm mt-6">
              <div className="flex -space-x-2">
                {[1,2,3,4].map(i => (
                  <div key={i} className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-300 to-emerald-500 border-2 border-white flex items-center justify-center text-[10px] font-bold text-white">
                    {['А','М','С','В'][i-1]}
                  </div>
                ))}
              </div>
              <span>
                Более <span className="font-semibold text-gray-600">340 мастеров</span> и{' '}
                <span className="font-semibold text-gray-600">2 100+ заказов</span>
              </span>
            </motion.div>
          </motion.div>

          {/* Right column — photo + floating cards */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="flex-1 w-full max-w-md lg:max-w-none relative"
          >
            {/* Photo with gradient blob frame */}
            <div className="relative">
              {/* Gradient blob behind photo */}
              <div className="absolute -inset-4 bg-gradient-to-br from-emerald-200/50 to-emerald-400/25 rounded-[2.5rem] blur-2xl -z-10" />
              <div className="rounded-[2rem] overflow-hidden border-[3px] border-white/60 shadow-[0_25px_60px_rgba(5,150,105,0.18)] relative">
                <img
                  src="images/master-hero.jpg"
                  alt="Проверенный частный мастер"
                  className="w-full h-[320px] sm:h-[400px] lg:h-[420px] object-cover object-top"
                />
              {/* Verified overlay */}
              <div className="absolute bottom-4 left-4 glass rounded-2xl px-4 py-2.5 flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                  <CheckCircle2 size={14} className="text-white" />
                </div>
                <span className="text-sm font-semibold text-gray-800">Мастер проверен</span>
              </div>
            </div>
            </div>

            {/* Mobile cards grid */}
            <div className="lg:hidden grid grid-cols-2 gap-3 mt-5">
              {[
                { icon: Star, label: 'Рейтинг', value: '4.8 / 5' },
                { icon: CheckCircle2, label: 'Документы', value: 'Проверены' },
                { icon: ShieldCheck, label: 'Гарантия', value: '2 года' },
              ].map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.label} className="glass rounded-2xl px-4 py-3 flex items-center gap-3 shadow-float">
                    <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      <Icon size={18} className="text-[#059669]" />
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 font-medium leading-none">{card.label}</p>
                      <p className="text-gray-800 font-bold text-sm leading-tight">{card.value}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop floating cards */}
            <div className="hidden lg:block">
              {floatCards.map((card, i) => {
                const Icon = card.icon;
                return (
                  <motion.div
                    key={card.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 + card.delay, duration: 0.5 }}
                    className={`absolute ${card.top || ''} ${card.left || ''} ${card.right || ''} ${card.bottom || ''} glass rounded-2xl px-4 py-3 flex items-center gap-3 shadow-float hover:shadow-premium transition-shadow duration-300 animate-float${i === 1 ? '-delay' : i === 2 ? '-delay-2' : ''} z-10`}
                  >
                    <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
                      <Icon size={20} className="text-[#059669]" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 font-medium">{card.label}</p>
                      <p className="text-gray-800 font-bold text-base leading-none">{card.value}</p>
                    </div>
                  </motion.div>
                );
              })}

              {/* Estimate card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.4, duration: 0.5 }}
                className="absolute right-4 bottom-8 glass rounded-2xl px-5 py-4 shadow-float hover:shadow-premium transition-shadow duration-300 animate-float-delay min-w-[180px] z-10"
              >
                <p className="text-xs text-gray-400 font-medium mb-2">Смета примерная</p>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>Обои (2 комн.)</span>
                    <span className="font-semibold">14 000 ₽</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>Шпаклёвка</span>
                    <span className="font-semibold">8 000 ₽</span>
                  </div>
                  <div className="border-t border-gray-200 pt-1.5 flex justify-between text-xs">
                    <span className="text-gray-500">Итого</span>
                    <span className="font-bold text-emerald-600">22 000 ₽</span>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
