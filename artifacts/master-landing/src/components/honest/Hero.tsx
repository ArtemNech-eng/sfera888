import { Zap, FileText, Wallet } from 'lucide-react';

const BOT_URL = 'https://t.me/honest_master_bot';

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      {/* Background gradient effects */}
      <div className="absolute inset-0 bg-[#0B0F14]" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[#34F5A3]/5 rounded-full blur-[120px]" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-[#38BDF8]/5 rounded-full blur-[100px]" />
      
      {/* Neon line top */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#34F5A3]/40 to-transparent" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-32 w-full">
        <div className="max-w-3xl">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[#F8FAFC] leading-tight mb-6">
            Заказы для мастеров.
            <br />
            <span className="text-[#34F5A3]">Без хаоса.</span> Через систему.
          </h1>

          <p className="text-lg sm:text-xl text-[#94A3B8] mb-10 max-w-2xl">
            Обои, шпаклёвка, покраска, плитка, санузлы, отделка — берите реальные объекты через приложение и работайте по понятным правилам.
          </p>

          {/* 3 advantages */}
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-8 mb-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#34F5A3]/10 border border-[#34F5A3]/20 flex items-center justify-center">
                <Zap className="w-5 h-5 text-[#34F5A3]" />
              </div>
              <span className="text-[#F8FAFC] text-sm sm:text-base">Объекты каждый день</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#38BDF8]/10 border border-[#38BDF8]/20 flex items-center justify-center">
                <FileText className="w-5 h-5 text-[#38BDF8]" />
              </div>
              <span className="text-[#F8FAFC] text-sm sm:text-base">Смета и бронь через приложение</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#FACC15]/10 border border-[#FACC15]/20 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-[#FACC15]" />
              </div>
              <span className="text-[#F8FAFC] text-sm sm:text-base">100% стоимости объекта — ваши</span>
            </div>
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row gap-4 mb-10">
            <a
              href={BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center px-8 py-4 rounded-xl bg-[#34F5A3] text-[#0B0F14] font-bold text-lg shadow-[0_0_30px_rgba(52,245,163,0.4)] hover:shadow-[0_0_50px_rgba(52,245,163,0.6)] transition-all duration-300 hover:scale-[1.02]"
            >
              Начать получать заказы
            </a>
            <a
              href="#model"
              className="inline-flex items-center justify-center px-8 py-4 rounded-xl border border-[#34F5A3]/30 text-[#34F5A3] font-semibold text-lg hover:bg-[#34F5A3]/5 transition-all duration-300"
            >
              Узнать условия
            </a>
          </div>

          {/* Stats badge */}
          <div className="inline-flex items-center gap-3 px-5 py-3 rounded-xl bg-[#111827]/80 border border-[#34F5A3]/10 backdrop-blur-sm">
            <div className="w-2 h-2 rounded-full bg-[#34F5A3] animate-pulse" />
            <span className="text-[#94A3B8] text-sm">
              Сейчас в системе: <span className="text-[#F8FAFC] font-medium">новые объекты каждый день</span> · стабильный поток заявок
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
