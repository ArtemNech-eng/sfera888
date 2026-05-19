import { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';

export default function StickyCTA() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 300);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToForm = () => {
    document.getElementById('form')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 md:hidden transition-transform duration-500 ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <div className="bg-white/90 backdrop-blur-xl border-t border-gray-100 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,0.08)]">
        <button
          onClick={scrollToForm}
          className="w-full text-white font-bold py-3.5 rounded-2xl text-base flex items-center justify-center gap-2 animate-pulse-glow gradient-bg hover:scale-[1.02] active:scale-[0.98] transition-transform duration-200"
        >
          <Sparkles size={18} />
          Оставить заявку
        </button>
        <p className="text-center text-gray-400 text-xs mt-2 font-medium">
          Бесплатно · Ответ за 15 минут · Скидка до 15%
        </p>
      </div>
    </div>
  );
}
