import { useState } from 'react';
import { Send, CheckCircle, Loader2 } from 'lucide-react';

const SPECIALIZATIONS = [
  'Обои',
  'Шпаклёвка',
  'Покраска',
  'Плитка',
  'Сантехника',
  'Электрика',
  'Комплексная отделка',
  'Другое',
];

interface FormData {
  name: string;
  phone: string;
  city: string;
  specialization: string[];
}

export default function RegistrationForm() {
  const [form, setForm] = useState<FormData>({
    name: '',
    phone: '',
    city: '',
    specialization: [],
  });
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const toggleSpecialization = (spec: string) => {
    setForm((prev) => ({
      ...prev,
      specialization: prev.specialization.includes(spec)
        ? prev.specialization.filter((s) => s !== spec)
        : [...prev.specialization, spec],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim() || !form.phone.trim() || !form.city.trim() || form.specialization.length === 0) {
      setErrorMessage('Заполните все поля и выберите хотя бы одну специализацию');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErrorMessage('');

    try {
      const response = await fetch('/api/landing/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim(),
          city: form.city.trim(),
          specialization: form.specialization.join(', '),
          source: 'master_landing',
        }),
      });

      if (!response.ok) {
        throw new Error('Ошибка отправки');
      }

      setStatus('success');
    } catch {
      setErrorMessage('Не удалось отправить заявку. Попробуйте ещё раз.');
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <section id="registration-form" className="relative py-20 sm:py-28">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
          <div className="p-10 rounded-2xl bg-white border border-[#EDEAE2] shadow-sm">
            <CheckCircle className="w-16 h-16 text-[#D9342B] mx-auto mb-6" />
            <h3 className="text-2xl font-bold text-[#0F172A] mb-3">Заявка отправлена!</h3>
            <p className="text-[#475569] text-lg">
              Спасибо, {form.name}! Мы свяжемся с вами в ближайшее время и дадим доступ к приложению.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="registration-form" className="relative py-20 sm:py-28">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-[#0F172A] mb-4 text-center">
          <span className="text-[#D9342B]">Регистрация</span> мастера
        </h2>
        <p className="text-[#475569] text-center mb-10 text-lg">
          Заполните форму — мы подключим вас к системе и откроем доступ к заказам
        </p>

        <form
          onSubmit={handleSubmit}
          className="p-8 rounded-2xl bg-white border border-[#EDEAE2] shadow-sm space-y-6"
        >
          {/* Name */}
          <div>
            <label htmlFor="reg-name" className="block text-[#0F172A] text-sm font-medium mb-2">
              Имя
            </label>
            <input
              id="reg-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Алексей"
              className="w-full px-4 py-3 rounded-xl bg-white border border-[#EDEAE2] text-[#0F172A] placeholder-[#94A3B8] focus:border-[#D9342B] focus:outline-none focus:ring-1 focus:ring-[#D9342B]/50 transition-colors"
            />
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="reg-phone" className="block text-[#0F172A] text-sm font-medium mb-2">
              Телефон
            </label>
            <input
              id="reg-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+7 (999) 123-45-67"
              className="w-full px-4 py-3 rounded-xl bg-white border border-[#EDEAE2] text-[#0F172A] placeholder-[#94A3B8] focus:border-[#D9342B] focus:outline-none focus:ring-1 focus:ring-[#D9342B]/50 transition-colors"
            />
          </div>

          {/* City */}
          <div>
            <label htmlFor="reg-city" className="block text-[#0F172A] text-sm font-medium mb-2">
              Город
            </label>
            <input
              id="reg-city"
              type="text"
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              placeholder="Москва"
              className="w-full px-4 py-3 rounded-xl bg-white border border-[#EDEAE2] text-[#0F172A] placeholder-[#94A3B8] focus:border-[#D9342B] focus:outline-none focus:ring-1 focus:ring-[#D9342B]/50 transition-colors"
            />
          </div>

          {/* Specialization multi-select */}
          <div>
            <label className="block text-[#0F172A] text-sm font-medium mb-3">
              Специализация
            </label>
            <div className="flex flex-wrap gap-2">
              {SPECIALIZATIONS.map((spec) => {
                const isSelected = form.specialization.includes(spec);
                return (
                  <button
                    key={spec}
                    type="button"
                    onClick={() => toggleSpecialization(spec)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                      isSelected
                        ? 'bg-[#FCE9E7] border border-[#D9342B] text-[#D9342B]'
                        : 'bg-white border border-[#EDEAE2] text-[#475569] hover:border-[#D9342B]/50'
                    }`}
                  >
                    {spec}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error message */}
          {status === 'error' && errorMessage && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {errorMessage}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-[#D9342B] text-white font-bold text-lg shadow-md hover:bg-[#B8281F] hover:shadow-lg transition-all duration-300 hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {status === 'loading' ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Отправка...
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                Начать получать заказы
              </>
            )}
          </button>

          <p className="text-[#94A3B8] text-xs text-center">
            Нажимая кнопку, вы соглашаетесь с условиями сервиса
          </p>
        </form>
      </div>
    </section>
  );
}
