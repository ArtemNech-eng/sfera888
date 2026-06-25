import { CalendarCheck, Smartphone, Zap } from 'lucide-react';

export default function Hero() {
  const scrollToForm = () => {
    document.getElementById('registration-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden bg-[#FAFAF7]">
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-32 w-full">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <div className="max-w-3xl">
            <p className="text-[#D9342B] font-semibold text-sm uppercase tracking-wide mb-4">
              IT-платформа для профессиональных мастеров
            </p>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[#0F172A] leading-tight mb-6">
              Получайте заказы.
              <br />
              Работайте напрямую.
              <br />
              <span className="text-[#D9342B]">Зарабатывайте больше.</span>
            </h1>

            <p className="text-lg sm:text-xl text-[#475569] mb-10 max-w-2xl">
              Обои, шпаклёвка, покраска, плитка, санузлы, отделка — берите реальные объекты через приложение и работайте по понятным правилам.
            </p>

            {/* 3 badges */}
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 mb-10">
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#FCE9E7] border border-[#EDEAE2]">
                <div className="w-10 h-10 rounded-lg bg-[#FCE9E7] border border-[#EDEAE2] flex items-center justify-center">
                  <CalendarCheck className="w-5 h-5 text-[#D9342B]" />
                </div>
                <span className="text-[#0F172A] font-semibold text-sm">Объекты каждый день</span>
              </div>

              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#F1EEE7] border border-[#EDEAE2]">
                <div className="w-10 h-10 rounded-lg bg-[#F1EEE7] border border-[#EDEAE2] flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-[#0F172A]" />
                </div>
                <span className="text-[#0F172A] font-semibold text-sm">Смета и бронь в приложении</span>
              </div>

              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#F1EEE7] border border-[#EDEAE2]">
                <div className="w-10 h-10 rounded-lg bg-[#F1EEE7] border border-[#EDEAE2] flex items-center justify-center">
                  <Zap className="w-5 h-5 text-[#0F172A]" />
                </div>
                <span className="text-[#0F172A] font-semibold text-sm">Подключение 0₽</span>
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
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[#475569] text-sm">
                Более <span className="text-[#0F172A] font-medium">500 мастеров</span> уже работают · Рейтинг <span className="text-[#0F172A] font-medium">4.9</span>
              </span>
            </div>
          </div>

          <div className="hidden lg:block">
            <img
              src="https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&h=1000&fit=crop&q=80"
              alt="Квартира после ремонта — светлая комната"
              className="rounded-2xl shadow-lg w-full h-full object-cover max-h-[600px]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
