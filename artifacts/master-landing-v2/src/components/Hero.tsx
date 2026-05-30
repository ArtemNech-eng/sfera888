import React from 'react';
import { ArrowRight, CheckCircle2, Zap, TrendingUp, Star, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import NeonButton from './NeonButton';
import mastersHero from '../assets/masters-hero.png';

interface HeroProps {
  botUrl: string;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
  },
};

const imageVariants = {
  hidden: { opacity: 0, scale: 0.92, x: 40 },
  visible: {
    opacity: 1,
    scale: 1,
    x: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const, delay: 0.2 },
  },
};

const Hero: React.FC<HeroProps> = ({ botUrl }) => {
  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative min-h-screen flex flex-col justify-center overflow-hidden bg-gradient-to-br from-white via-[#F0FDF4]/20 to-white">
      {/* Subtle background pattern */}
      <div
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(16,185,129,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.04) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />
      {/* Soft gradient blob - moved to left side to avoid photo overlap */}
      <div
        className="absolute -top-20 -left-40 w-[500px] h-[600px] opacity-20 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(16,185,129,0.22) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">

          {/* ── Left column: content ── */}
          <motion.div
            className="flex flex-col items-start"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Badge */}
            <motion.div
              variants={itemVariants}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#10B981]/30 bg-[#10B981]/8 text-[#10B981] text-sm font-medium mb-6"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] animate-pulse" />
              IT-платформа для профессиональных мастеров
            </motion.div>

            {/* Main heading */}
            <motion.h1
              variants={itemVariants}
              className="text-4xl sm:text-5xl lg:text-5xl font-black leading-[1.1] tracking-tight text-[#0F172A] mb-6"
            >
              Получайте заказы
              <br />
              Работайте напрямую
              <br />
              <span className="text-[#10B981]">Зарабатывайте больше</span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              variants={itemVariants}
              className="text-[#64748B] text-lg sm:text-xl max-w-lg mb-8 leading-relaxed"
            >
              Обои, шпаклёвка, покраска, плитка, санузлы, отделка — берите реальные объекты
              через приложение и работайте по понятным правилам.
            </motion.p>

            {/* 3 benefits */}
            <motion.div variants={itemVariants} className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-5 mb-10">
              {[
                { icon: Zap, text: 'Объекты каждый день' },
                { icon: CheckCircle2, text: 'Смета и бронь в приложении' },
                { icon: TrendingUp, text: '100% стоимости — ваши' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2.5 text-[#0F172A] font-medium text-sm">
                  <div className="w-7 h-7 rounded-lg bg-[#10B981]/10 flex items-center justify-center flex-shrink-0">
                    <item.icon size={14} className="text-[#10B981]" />
                  </div>
                  <span>{item.text}</span>
                </div>
              ))}
            </motion.div>

            {/* CTA Buttons */}
            <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4">
              <NeonButton href={botUrl} variant="primary" size="lg">
                Начать получать заказы
                <ArrowRight size={20} />
              </NeonButton>
              <NeonButton
                variant="ghost"
                size="lg"
                onClick={() => scrollToSection('how-it-works')}
              >
                Узнать условия
                <ArrowRight size={16} className="ml-1 opacity-60" />
              </NeonButton>
            </motion.div>

            {/* Social proof */}
            <motion.div
              variants={itemVariants}
              className="mt-8 flex items-center gap-4 flex-wrap"
            >
              <div className="flex items-center gap-2 text-sm text-[#64748B]">
                <Users size={16} className="text-[#10B981]" />
                <span>Более <strong className="text-[#0F172A]">500 мастеров</strong> уже работают</span>
              </div>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star key={star} size={14} className="text-[#F59E0B] fill-[#F59E0B]" />
                ))}
                <span className="text-sm font-bold text-[#0F172A] ml-1">4.9</span>
                <span className="text-xs text-[#64748B] ml-0.5">рейтинг</span>
              </div>
            </motion.div>
          </motion.div>

          {/* ── Right column: illustration ── */}
          <motion.div
            className="w-full h-[420px] sm:h-[520px] lg:h-[600px] rounded-2xl overflow-hidden shadow-lg shadow-[#0F172A]/5"
            variants={imageVariants}
            initial="hidden"
            animate="visible"
          >
            <img
              src={mastersHero}
              alt="Мастера"
              className="w-full h-full object-cover object-center"
            />
          </motion.div>

        </div>
      </div>

      <div className="neon-line absolute bottom-0 left-0 right-0" />
    </section>
  );
};

export default Hero;
