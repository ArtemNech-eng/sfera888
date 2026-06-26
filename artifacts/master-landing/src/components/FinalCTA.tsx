import { ArrowDown } from 'lucide-react';

export default function FinalCTA() {
  const scrollToForm = () => {
    document.getElementById('registration-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative py-16 sm:py-24 overflow-hidden">
      {/* Персиковый градиент */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(135deg, #FDEBD8 0%, #FBF1E4 50%, #FEF3C7 100%)',
        }}
      />
      <div
        className="absolute -bottom-24 -left-24 w-[420px] h-[420px] rounded-full blur-3xl opacity-50"
        style={{ background: 'radial-gradient(circle, #FBD9B5 0%, transparent 70%)' }}
      />

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 text-center">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1A1A1A] mb-6">
          Хватит искать клиентов{' '}
          <span className="relative inline-block">
            <span className="absolute inset-x-0 bottom-1 h-4 sm:h-5 bg-[#FACC15] -z-10 rounded-sm" />
            вслепую
          </span>
        </h2>
        <p className="text-[#57534E] text-lg mb-10 max-w-2xl mx-auto">
          Подключайтесь к системе «Честный Мастер» — получайте стабильный поток объектов и зарабатывайте по понятным правилам.
        </p>

        {/* Stats */}
        <div className="flex flex-col sm:flex-row justify-center gap-6 sm:gap-12 mb-10">
          <div className="text-center">
            <div className="text-3xl sm:text-4xl font-extrabold text-[#E8590C]">0₽</div>
            <div className="text-[#57534E] text-sm mt-1">подключение</div>
          </div>
          <div className="text-center">
            <div className="text-3xl sm:text-4xl font-extrabold text-[#E8590C]">от 15%</div>
            <div className="text-[#57534E] text-sm mt-1">комиссия</div>
          </div>
          <div className="text-center">
            <div className="text-3xl sm:text-4xl font-extrabold text-[#E8590C]">2 мин</div>
            <div className="text-[#57534E] text-sm mt-1">регистрация</div>
          </div>
        </div>

        <button
          onClick={scrollToForm}
          className="inline-flex items-center gap-2 px-10 py-5 rounded-2xl bg-[#FACC15] text-[#1A1A1A] font-bold text-xl shadow-[0_8px_28px_rgba(250,204,21,0.5)] hover:bg-[#EAB308] hover:shadow-[0_10px_36px_rgba(250,204,21,0.6)] transition-all duration-300 hover:scale-[1.02] cursor-pointer"
        >
          Начать получать заказы
          <ArrowDown className="w-5 h-5" />
        </button>
      </div>
    </section>
  );
}
