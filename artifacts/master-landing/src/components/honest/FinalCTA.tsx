const BOT_URL = 'https://t.me/honest_master_bot';

export default function FinalCTA() {
  return (
    <section className="relative py-20 sm:py-28">
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#34F5A3]/30 to-transparent" />
      
      {/* Background glow */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[#34F5A3]/5 rounded-full blur-[120px]" />

      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#F8FAFC] mb-4">
          Хватит искать клиентов вслепую
        </h2>
        <p className="text-lg sm:text-xl text-[#94A3B8] mb-10">
          Подключайтесь к системе, где есть объекты, понятные правила и рабочий ритм.
        </p>

        <a
          href={BOT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center px-10 py-5 rounded-xl bg-[#34F5A3] text-[#0B0F14] font-bold text-xl shadow-[0_0_40px_rgba(52,245,163,0.5)] hover:shadow-[0_0_60px_rgba(52,245,163,0.7)] transition-all duration-300 hover:scale-[1.03] animate-pulse-glow"
        >
          Перейти в бота и начать работу
        </a>

        <p className="mt-6 text-[#94A3B8] text-sm">
          Telegram-бот Max • Авторизация за 30 секунд
        </p>
      </div>
    </section>
  );
}
