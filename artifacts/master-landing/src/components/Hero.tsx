import { Zap, CreditCard, Percent } from 'lucide-react';

export default function Hero() {
  const scrollToForm = () => {
    document.getElementById('registration-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden bg-[#FAFAF7]">
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-32 w-full">
        <div className="max-w-3xl">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[#0F172A] leading-tight mb-6">
            Заказы для мастеров.
            <br />
            <span className="text-[#D9342B]">Бесплатное подключение.</span>
          </h1>

          <p className="text-lg sm:text-xl text-[#475569] mb-10 max-w-2xl">
            Получайте заявки → выезжайте на замер → работайте → оплачиваете комиссию после получения денег от клиента. Никаких предоплат и токенов.
          </p>

          {/* 3 badges */}
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 mb-10">
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#FCE9E7] border border-[#EDEAE2]">
              <div className="w-10 h-10 rounded-lg bg-[#FCE9E7] border border-[#EDEAE2] flex items-center justify-center">
                <Zap className="w-5 h-5 text-[#D9342B]" />
              </div>
              <div>
                <div className="text-[#0F172A] font-bold text-lg">0 ₽</div>
                <div className="text-[#475569] text-xs">подключение</div>
              </div>
            </div>

            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#F1EEE7] border border-[#EDEAE2]">
              <div className="w-10 h-10 rounded-lg bg-[#F1EEE7] border border-[#EDEAE2] flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-[#0F172A]" />
              </div>
              <div>
                <div className="text-[#0F172A] font-bold text-lg">500 ₽</div>
                <div className="text-[#475569] text-xs">за заявку</div>
              </div>
            </div>

            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#F1EEE7] border border-[#EDEAE2]">
              <div className="w-10 h-10 rounded-lg bg-[#F1EEE7] border border-[#EDEAE2] flex items-center justify-center">
                <Percent className="w-5 h-5 text-[#0F172A]" />
              </div>
              <div>
                <div className="text-[#0F172A] font-bold text-lg">от 15%</div>
                <div className="text-[#475569] text-xs">комиссия</div>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-4 mb-10">
            <button
              onClick={scrollToForm}
              className="inline-flex items-center justify-center px-8 py-4 rounded-xl bg-[#D9342B] text-white font-bold text-lg shadow-md hover:bg-[#B8281F] hover:shadow-lg transition-all duration-300 hover:scale-[1.02] cursor-pointer"
            >
              Начать получать заказы
            </button>
            <a
              href="#conditions"
              className="inline-flex items-center justify-center px-8 py-4 rounded-xl border border-[#D9342B] text-[#D9342B] font-semibold text-lg hover:bg-[#FCE9E7] transition-all duration-300"
            >
              Узнать условия
            </a>
          </div>

          {/* Live badge */}
          <div className="inline-flex items-center gap-3 px-5 py-3 rounded-xl bg-white border border-[#EDEAE2] shadow-sm">
            <div className="w-2 h-2 rounded-full bg-[#D9342B]" />
            <span className="text-[#475569] text-sm">
              Оплата <span className="text-[#0F172A] font-medium">только после того, как клиент заплатил вам</span> — сначала работаете, потом платите
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
