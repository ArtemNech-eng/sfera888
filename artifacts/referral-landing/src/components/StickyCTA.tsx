import { useState, useEffect } from 'react';

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
      className={`fixed bottom-0 left-0 right-0 z-50 md:hidden transition-transform duration-300 ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <div className="bg-white border-t border-[#E5E7EB] px-4 py-3 safe-area-bottom">
        <button
          onClick={scrollToForm}
          className="w-full bg-[#34C759] text-white font-semibold py-3.5 rounded-xl text-base hover:bg-[#2db34e] transition-colors"
        >
          Оставить заявку
        </button>
      </div>
    </div>
  );
}
