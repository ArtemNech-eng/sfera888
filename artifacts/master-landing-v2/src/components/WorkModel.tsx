import React from 'react';
import { Shield, Zap, ArrowRight, CheckCircle2, RefreshCw } from 'lucide-react';
import AnimatedSection from './AnimatedSection';
import NeonButton from './NeonButton';

interface WorkModelProps {
  botUrl: string;
}

const WorkModel: React.FC<WorkModelProps> = ({ botUrl }) => {
  return (
    <section id="work-model" className="relative py-24 bg-[#0B0F14] overflow-hidden">
      <div
        className="absolute right-0 top-0 w-96 h-96 opacity-10 pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(56,189,248,0.5) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <AnimatedSection className="text-center mb-6">
          <p className="text-[#38BDF8] text-sm font-semibold uppercase tracking-widest mb-3">
            Варианты входа
          </p>
          <h2 className="text-4xl sm:text-5xl font-black text-[#F8FAFC] mb-4">
            Как начать работу:{' '}
            <span className="text-[#38BDF8]">2 варианта старта</span>
          </h2>
        </AnimatedSection>

        <AnimatedSection delay={100} className="text-center mb-12">
          <p className="text-[#94A3B8] text-lg max-w-2xl mx-auto">
            Мы не берём проценты с вашей работы. Вы покупаете доступ к готовым заказам
            (токенам). Выберите удобный для вас путь.
          </p>
        </AnimatedSection>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Card 1: Test start */}
          <AnimatedSection delay={150} direction="left">
            <div className="relative h-full glass rounded-3xl p-8 border border-[#34F5A3]/20 hover:border-[#34F5A3]/40 transition-all duration-300 group overflow-hidden">
              {/* Top glow */}
              <div
                className="absolute inset-x-0 top-0 h-1 opacity-80"
                style={{
                  background: 'linear-gradient(90deg, transparent, #34F5A3, transparent)',
                }}
              />

              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#34F5A3]/10 border border-[#34F5A3]/30 text-[#34F5A3] text-xs font-semibold mb-6">
                <Shield size={13} />
                С верификацией
              </div>

              <h3 className="text-3xl font-black text-[#F8FAFC] mb-2">
                Тестовый старт
              </h3>
              <p className="text-[#34F5A3] text-lg font-semibold mb-6">Постоплата</p>

              <p className="text-[#94A3B8] mb-6 leading-relaxed">
                Нам важно посмотреть на вас в деле, а вам — проверить качество наших заказов.
                Мы даём 1 тестовый заказ без предоплаты.
              </p>

              <ul className="space-y-3 mb-8">
                {[
                  'Вы берёте заказ из ленты',
                  'Оплачиваете токен (5 000 ₽) ТОЛЬКО после того, как договорились с клиентом на замере',
                  'Условие: обязательная верификация по паспорту в приложении',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle2 size={18} className="text-[#34F5A3] flex-shrink-0 mt-0.5" />
                    <span className="text-[#F8FAFC] text-sm">{item}</span>
                  </li>
                ))}
              </ul>

              {/* Price highlight */}
              <div className="rounded-2xl bg-[#34F5A3]/5 border border-[#34F5A3]/15 p-4 mb-6">
                <p className="text-[#94A3B8] text-xs mb-1">Стоимость первого токена</p>
                <p className="text-[#34F5A3] text-3xl font-black">
                  5 000 ₽{' '}
                  <span className="text-[#94A3B8] text-base font-normal">после замера</span>
                </p>
              </div>

              <NeonButton href={botUrl} variant="primary" size="md" className="w-full justify-center">
                Начать с тест-заказа
                <ArrowRight size={18} />
              </NeonButton>
            </div>
          </AnimatedSection>

          {/* Card 2: Fast start */}
          <AnimatedSection delay={250} direction="right">
            <div className="relative h-full glass rounded-3xl p-8 border border-[#38BDF8]/20 hover:border-[#38BDF8]/40 transition-all duration-300 group overflow-hidden">
              {/* Top glow */}
              <div
                className="absolute inset-x-0 top-0 h-1 opacity-80"
                style={{
                  background: 'linear-gradient(90deg, transparent, #38BDF8, transparent)',
                }}
              />

              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#38BDF8]/10 border border-[#38BDF8]/30 text-[#38BDF8] text-xs font-semibold mb-6">
                <Zap size={13} />
                Без верификации документов
              </div>

              <h3 className="text-3xl font-black text-[#F8FAFC] mb-2">
                Быстрый старт
              </h3>
              <p className="text-[#38BDF8] text-lg font-semibold mb-6">Пакеты заказов</p>

              <p className="text-[#94A3B8] mb-6 leading-relaxed">
                Не хотите проходить верификацию по документам? Без проблем. Сразу покупайте
                пакет заказов и приступайте к работе.
              </p>

              <ul className="space-y-3 mb-8">
                {[
                  'Выбираете пакет (от 1 до 10 токенов)',
                  'Получаете мгновенный доступ к ленте объектов',
                  'Каждое открытие контакта списывает 1 токен',
                  'Если клиент не договорился не по вашей вине — токен возвращается на баланс',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle2 size={18} className="text-[#38BDF8] flex-shrink-0 mt-0.5" />
                    <span className="text-[#F8FAFC] text-sm">{item}</span>
                  </li>
                ))}
              </ul>

              {/* Return note */}
              <div className="rounded-2xl bg-[#38BDF8]/5 border border-[#38BDF8]/15 p-4 mb-6 flex items-start gap-3">
                <RefreshCw size={18} className="text-[#38BDF8] flex-shrink-0 mt-0.5" />
                <p className="text-[#94A3B8] text-xs">
                  <span className="text-[#38BDF8] font-semibold">Защита токена:</span>{' '}
                  нажмите «Возврат» в приложении, если клиент сорвался не по вашей вине —
                  токен вернётся на баланс после проверки.
                </p>
              </div>

              <NeonButton href={botUrl} variant="secondary" size="md" className="w-full justify-center">
                Купить пакет заказов
                <ArrowRight size={18} />
              </NeonButton>
            </div>
          </AnimatedSection>
        </div>
      </div>

      <div className="neon-line absolute bottom-0 left-0 right-0" />
    </section>
  );
};

export default WorkModel;
