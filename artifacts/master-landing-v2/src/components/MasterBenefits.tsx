import React from 'react';
import {
  Smartphone,
  FileText,
  Shield,
  BarChart3,
  RefreshCw,
  Headphones,
} from 'lucide-react';
import AnimatedSection from './AnimatedSection';

const benefits = [
  {
    icon: <Smartphone size={26} className="text-[#34F5A3]" />,
    title: 'Мобильное приложение',
    desc: 'Лента объектов, управление заказами, история и статистика — всё в одном месте. Доступно на iOS и Android.',
    color: '#34F5A3',
  },
  {
    icon: <FileText size={26} className="text-[#38BDF8]" />,
    title: 'Встроенный сметчик',
    desc: 'Считайте сметы прямо в приложении. Красивые, профессиональные сметы, которые впечатляют клиентов.',
    color: '#38BDF8',
  },
  {
    icon: <Shield size={26} className="text-[#FACC15]" />,
    title: 'Защита токенов',
    desc: 'Если клиент сорвался не по вашей вине — токен возвращается на баланс после проверки. Вы платите только за результат.',
    color: '#FACC15',
  },
  {
    icon: <BarChart3 size={26} className="text-[#34F5A3]" />,
    title: 'Аналитика и рейтинг',
    desc: 'Следите за своей конверсией, количеством закрытых объектов и рейтингом. Растите в системе.',
    color: '#34F5A3',
  },
  {
    icon: <RefreshCw size={26} className="text-[#38BDF8]" />,
    title: 'Стабильный поток',
    desc: 'Новые объекты появляются каждый день. Сильные мастера никогда не сидят без работы.',
    color: '#38BDF8',
  },
  {
    icon: <Headphones size={26} className="text-[#FACC15]" />,
    title: 'Поддержка 24/7',
    desc: 'Бот Max и поддержка платформы всегда на связи. Любой вопрос — решаем быстро.',
    color: '#FACC15',
  },
];

const MasterBenefits: React.FC = () => {
  return (
    <section id="benefits" className="relative py-24 bg-[#0F172A] overflow-hidden">
      <div
        className="absolute left-0 top-0 w-80 h-80 opacity-8 pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(56,189,248,0.3) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <AnimatedSection className="text-center mb-16">
          <p className="text-[#FACC15] text-sm font-semibold uppercase tracking-widest mb-3">
            Инструменты
          </p>
          <h2 className="text-4xl sm:text-5xl font-black text-[#F8FAFC] mb-4">
            Что получает мастер{' '}
            <span className="text-[#FACC15]">внутри системы</span>
          </h2>
          <p className="text-[#94A3B8] text-lg max-w-2xl mx-auto">
            Всё необходимое для работы без хаоса — в одном месте. Никаких сторонних сервисов,
            никаких лишних программ.
          </p>
        </AnimatedSection>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {benefits.map((benefit, i) => (
            <AnimatedSection key={i} delay={i * 80} direction="up">
              <div className="glass rounded-2xl p-6 h-full hover:scale-[1.02] transition-all duration-300 group">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110"
                  style={{
                    background: `${benefit.color}12`,
                    border: `1px solid ${benefit.color}25`,
                  }}
                >
                  {benefit.icon}
                </div>

                <h3 className="text-[#F8FAFC] font-bold text-lg mb-2">{benefit.title}</h3>
                <p className="text-[#94A3B8] text-sm leading-relaxed">{benefit.desc}</p>

                {/* Bottom accent */}
                <div
                  className="h-0.5 mt-5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{
                    background: `linear-gradient(90deg, ${benefit.color}, transparent)`,
                  }}
                />
              </div>
            </AnimatedSection>
          ))}
        </div>
      </div>

      <div className="neon-line absolute bottom-0 left-0 right-0" />
    </section>
  );
};

export default MasterBenefits;
