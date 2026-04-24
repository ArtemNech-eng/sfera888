import { ArrowRight } from 'lucide-react';

interface FinalCTAProps {
  onCtaClick: () => void;
}

export default function FinalCTA({ onCtaClick }: FinalCTAProps) {
  return (
    <section className="py-20 px-4" style={{ background: 'linear-gradient(135deg, #1A1A1A 0%, #2d2d2d 100%)' }}>
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-3xl md:text-5xl font-900 text-white mb-5 leading-tight">
          Готовы работать<br />
          без хаоса и простоев?
        </h2>
        <p className="text-gray-400 text-lg leading-relaxed mb-10 max-w-md mx-auto">
          Один заказ в одни руки. Выполнили — взяли следующий.
          Стабильный поток объектов.
        </p>
        <div className="flex flex-col items-center gap-4">
          <button
            className="btn-primary pulse-btn flex items-center gap-2"
            style={{ maxWidth: '320px' }}
            onClick={onCtaClick}
          >
            Начать получать заказы
            <ArrowRight size={18} strokeWidth={2.5} />
          </button>
          <span className="text-sm text-gray-500">Регистрация в приложении за 2 минуты</span>
        </div>
      </div>
    </section>
  );
}
