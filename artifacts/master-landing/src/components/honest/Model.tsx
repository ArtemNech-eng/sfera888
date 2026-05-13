import { Shield, Rocket } from 'lucide-react';

export default function Model() {
  return (
    <section id="model" className="relative py-20 sm:py-28">
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#FACC15]/30 to-transparent" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-[#F8FAFC] mb-4 text-center">
          Как начать работу: <span className="text-[#FACC15]">2 варианта старта</span>
        </h2>
        <p className="text-[#94A3B8] text-center max-w-3xl mx-auto mb-12 text-lg">
          Мы не берём проценты за вашу работу. Вы покупаете доступ к готовым заказам (токенам). Выберите удобный для вас способ.
        </p>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Card 1: Test drive */}
          <div className="relative p-8 rounded-2xl bg-[#111827]/80 border border-[#38BDF8]/20 backdrop-blur-sm hover:border-[#38BDF8]/40 transition-all duration-300 group">
            <div className="absolute -top-3 left-6 px-3 py-1 rounded-full bg-[#38BDF8]/10 border border-[#38BDF8]/30 text-[#38BDF8] text-xs font-medium">
              Постоплата
            </div>
            <div className="w-12 h-12 rounded-xl bg-[#38BDF8]/10 border border-[#38BDF8]/20 flex items-center justify-center mb-5">
              <Shield className="w-6 h-6 text-[#38BDF8]" />
            </div>
            <h3 className="text-xl font-bold text-[#F8FAFC] mb-4">Тестовый старт</h3>
            <p className="text-[#94A3B8] leading-relaxed mb-4">
              Нам важно посмотреть на вас в деле, а вам — проверить качество наших заказов. Мы предоставляем 1 тестовый заказ без предоплаты.
            </p>
            <ul className="space-y-3">
              <li className="flex items-start gap-2 text-[#94A3B8]">
                <span className="text-[#38BDF8] mt-1">•</span>
                Вы берёте заказ
              </li>
              <li className="flex items-start gap-2 text-[#94A3B8]">
                <span className="text-[#38BDF8] mt-1">•</span>
                Оплачиваете токен (5 000 ₽) ТОЛЬКО после того, как договоритесь с клиентом о замере
              </li>
              <li className="flex items-start gap-2 text-[#94A3B8]">
                <span className="text-[#38BDF8] mt-1">•</span>
                Условие: обязательная верификация по паспорту в приложении
              </li>
            </ul>
          </div>

          {/* Card 2: Fast start */}
          <div className="relative p-8 rounded-2xl bg-[#111827]/80 border border-[#34F5A3]/20 backdrop-blur-sm hover:border-[#34F5A3]/40 transition-all duration-300 group shadow-[0_0_30px_rgba(52,245,163,0.05)]">
            <div className="absolute -top-3 left-6 px-3 py-1 rounded-full bg-[#34F5A3]/10 border border-[#34F5A3]/30 text-[#34F5A3] text-xs font-medium">
              Быстрый старт
            </div>
            <div className="w-12 h-12 rounded-xl bg-[#34F5A3]/10 border border-[#34F5A3]/20 flex items-center justify-center mb-5">
              <Rocket className="w-6 h-6 text-[#34F5A3]" />
            </div>
            <h3 className="text-xl font-bold text-[#F8FAFC] mb-4">Пакеты заказов</h3>
            <p className="text-[#94A3B8] leading-relaxed mb-4">
              Не хотите проходить верификацию по документам? Без проблем. Сразу покупайте пакет заказов и приступайте к работе.
            </p>
            <ul className="space-y-3">
              <li className="flex items-start gap-2 text-[#94A3B8]">
                <span className="text-[#34F5A3] mt-1">•</span>
                Выбираете пакет (от 1 до 10 токенов)
              </li>
              <li className="flex items-start gap-2 text-[#94A3B8]">
                <span className="text-[#34F5A3] mt-1">•</span>
                Получаете доступ к ленте объектов
              </li>
              <li className="flex items-start gap-2 text-[#94A3B8]">
                <span className="text-[#34F5A3] mt-1">•</span>
                Если клиент не договорился не по вашей вине — токен возвращается на баланс
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
