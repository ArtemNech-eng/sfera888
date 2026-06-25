import { ArrowDown } from 'lucide-react';

export default function FinalCTA() {
  const scrollToForm = () => {
    document.getElementById('registration-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative py-14 sm:py-20 bg-[#F1EEE7]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-[#0F172A] mb-6">
          Хватит искать клиентов <span className="text-[#D9342B]">вслепую</span>
        </h2>
        <p className="text-[#475569] text-lg mb-10 max-w-2xl mx-auto">
          Подключайтесь к системе «Честный Мастер» — получайте стабильный поток объектов и зарабатывайте по понятным правилам.
        </p>

        {/* Stats */}
        <div className="flex flex-col sm:flex-row justify-center gap-6 sm:gap-10 mb-10">
          <div className="text-center">
            <div className="text-2xl sm:text-3xl font-bold text-[#D9342B]">0₽</div>
            <div className="text-[#475569] text-sm mt-1">подключение</div>
          </div>
          <div className="text-center">
            <div className="text-2xl sm:text-3xl font-bold text-[#D9342B]">от 15%</div>
            <div className="text-[#475569] text-sm mt-1">комиссия</div>
          </div>
          <div className="text-center">
            <div className="text-2xl sm:text-3xl font-bold text-[#D9342B]">2 мин</div>
            <div className="text-[#475569] text-sm mt-1">регистрация</div>
          </div>
        </div>

        <button
          onClick={scrollToForm}
          className="inline-flex items-center gap-2 px-10 py-5 rounded-xl bg-[#D9342B] text-white font-bold text-xl shadow-md hover:bg-[#B8281F] hover:shadow-lg transition-all duration-300 hover:scale-[1.02] cursor-pointer"
        >
          Начать получать заказы
          <ArrowDown className="w-5 h-5" />
        </button>
      </div>
    </section>
  );
}
