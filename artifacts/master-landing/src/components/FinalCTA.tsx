import { ArrowDown } from 'lucide-react';

export default function FinalCTA() {
  const scrollToForm = () => {
    document.getElementById('registration-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative py-20 sm:py-28 bg-[#F1EEE7]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-[#0F172A] mb-6">
          Готовы получать <span className="text-[#D9342B]">заявки</span>?
        </h2>
        <p className="text-[#475569] text-lg mb-8 max-w-2xl mx-auto">
          Подключение бесплатное. Заполните форму — и начинайте зарабатывать. Оплата только после того, как клиент заплатил вам.
        </p>
        <button
          onClick={scrollToForm}
          className="inline-flex items-center gap-2 px-10 py-5 rounded-xl bg-[#D9342B] text-white font-bold text-xl shadow-md hover:bg-[#B8281F] hover:shadow-lg transition-all duration-300 hover:scale-[1.02] cursor-pointer"
        >
          Заполнить форму
          <ArrowDown className="w-5 h-5" />
        </button>
      </div>
    </section>
  );
}
