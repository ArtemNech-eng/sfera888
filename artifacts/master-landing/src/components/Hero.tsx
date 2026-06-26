import { CalendarCheck, Smartphone, Zap } from 'lucide-react';

export default function Hero() {
  const scrollToForm = () => {
    document.getElementById('registration-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative flex items-center overflow-hidden">
      {/* Персиковый градиент */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(135deg, #FDEBD8 0%, #FBF1E4 45%, #F5F0E8 100%)',
        }}
      />
      <div
        className="absolute -top-24 -right-24 w-[420px] h-[420px] rounded-full blur-3xl opacity-50"
        style={{ background: 'radial-gradient(circle, #FBD9B5 0%, transparent 70%)' }}
      />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 w-full">
        <div className="grid lg:grid-cols-[3fr_2fr] gap-10 items-center">
          <div className="max-w-3xl">
            <p className="font-mono text-xs sm:text-sm font-bold tracking-[0.18em] uppercase text-[#E8590C] mb-5">
              IT-платформа для профессиональных мастеров
            </p>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#1A1A1A] leading-[1.1] mb-5">
              Получайте заказы.
              <br />
              Работайте напрямую.
              <br />
              <span className="relative inline-block">
                <span className="absolute inset-x-0 bottom-1 h-4 sm:h-5 bg-[#FACC15] -z-10 rounded-sm" />
                Зарабатывайте больше.
              </span>
            </h1>

            <p className="text-lg sm:text-xl text-[#57534E] mb-10 max-w-2xl">
              Обои, шпаклёвка, покраска, плитка, санузлы, отделка — берите реальные объекты через приложение и работайте по понятным правилам.
            </p>

            {/* 3 badges */}
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 mb-10">
              <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/70 backdrop-blur border border-[#E7E0D4]">
                <div className="w-10 h-10 rounded-xl bg-[#FEF3C7] flex items-center justify-center">
                  <CalendarCheck className="w-5 h-5 text-[#E8590C]" />
                </div>
                <span className="text-[#1A1A1A] font-semibold text-sm">Объекты каждый день</span>
              </div>

              <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/70 backdrop-blur border border-[#E7E0D4]">
                <div className="w-10 h-10 rounded-xl bg-[#FEF3C7] flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-[#E8590C]" />
                </div>
                <span className="text-[#1A1A1A] font-semibold text-sm">Смета и бронь в приложении</span>
              </div>

              <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/70 backdrop-blur border border-[#E7E0D4]">
                <div className="w-10 h-10 rounded-xl bg-[#FEF3C7] flex items-center justify-center">
                  <Zap className="w-5 h-5 text-[#E8590C]" />
                </div>
                <span className="text-[#1A1A1A] font-semibold text-sm">Подключение 0₽</span>
              </div>
            </div>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row gap-4 mb-10">
              <button
                onClick={scrollToForm}
                className="inline-flex items-center justify-center px-8 py-4 rounded-2xl bg-[#FACC15] text-[#1A1A1A] font-bold text-lg shadow-[0_6px_20px_rgba(250,204,21,0.45)] hover:bg-[#EAB308] hover:shadow-[0_8px_28px_rgba(250,204,21,0.55)] transition-all duration-300 hover:scale-[1.02] cursor-pointer"
              >
                Начать получать заказы
              </button>
              <a
                href="#conditions"
                className="inline-flex items-center justify-center px-8 py-4 rounded-2xl border-2 border-[#1A1A1A]/15 text-[#1A1A1A] font-semibold text-lg hover:border-[#1A1A1A]/30 hover:bg-white/50 transition-all duration-300"
              >
                Узнать условия
              </a>
            </div>

            {/* Live badge */}
            <div className="inline-flex items-center gap-3 px-5 py-3 rounded-2xl bg-white/80 backdrop-blur border border-[#E7E0D4] shadow-sm">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[#57534E] text-sm">
                Более <span className="text-[#1A1A1A] font-semibold">500 мастеров</span> уже работают · Рейтинг <span className="text-[#1A1A1A] font-semibold">4.9</span>
              </span>
            </div>
          </div>

          <div className="hidden lg:block">
            <img
              src="https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&h=1000&fit=crop&q=80"
              alt="Квартира после ремонта — светлая комната"
              className="rounded-3xl shadow-xl w-full h-full object-cover max-h-[600px] border border-white/60"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
