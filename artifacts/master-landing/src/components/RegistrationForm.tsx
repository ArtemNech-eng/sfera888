import { useState } from 'react';
import { Send, CheckCircle, Loader2, Eye, EyeOff } from 'lucide-react';

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
  password: string;
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('8') && digits.length === 11) {
    return '7' + digits.slice(1);
  }
  return digits;
}

export default function RegistrationForm() {
  const [form, setForm] = useState<FormData>({
    name: '',
    phone: '',
    city: '',
    specialization: [],
    password: '',
  });
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'duplicate' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [registeredPhone, setRegisteredPhone] = useState('');

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

    if (form.password.length < 6) {
      setErrorMessage('Пароль должен быть минимум 6 символов');
      setStatus('error');
      return;
    }

    const normalizedPhone = normalizePhone(form.phone);
    if (normalizedPhone.length < 10) {
      setErrorMessage('Введите корректный номер телефона');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErrorMessage('');

    try {
      const response = await fetch('/api/master-pwa/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alias: form.name.trim(),
          phone: normalizedPhone,
          city: form.city.trim(),
          specialization: form.specialization[0] || 'Другое',
          specializations: form.specialization,
          login: normalizedPhone,
          password: form.password,
        }),
      });

      if (response.status === 409) {
        setStatus('duplicate');
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Ошибка регистрации');
      }

      setRegisteredPhone(normalizedPhone);
      setStatus('success');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Не удалось зарегистрироваться. Попробуйте ещё раз.');
      setStatus('error');
    }
  };

  // Success screen — показываем логин/пароль и ссылку
  if (status === 'success') {
    return (
      <section id="registration-form" className="relative py-14 sm:py-20">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
          <div className="p-10 rounded-2xl bg-white border border-[#EDEAE2] shadow-sm">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-6" />
            <h3 className="text-2xl font-bold text-[#0F172A] mb-4">✅ Аккаунт создан!</h3>
            <p className="text-[#475569] text-lg mb-6">
              {form.name}, ваш аккаунт готов. Сохраните данные для входа:
            </p>
            <div className="bg-[#F8FAFC] rounded-xl p-6 mb-6 text-left space-y-3 border border-[#EDEAE2]">
              <div className="flex items-center justify-between">
                <span className="text-[#475569] text-sm">Логин:</span>
                <span className="font-mono font-bold text-[#0F172A]">{registeredPhone}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#475569] text-sm">Пароль:</span>
                <span className="font-mono font-bold text-[#0F172A]">{form.password}</span>
              </div>
            </div>
            <a
              href="/master-pwa/login"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-[#D9342B] text-white font-bold text-lg shadow-md hover:bg-[#B8281F] hover:shadow-lg transition-all duration-300 hover:scale-[1.01]"
            >
              Войти в приложение
            </a>
          </div>
        </div>
      </section>
    );
  }

  // Duplicate screen — номер уже зарегистрирован
  if (status === 'duplicate') {
    return (
      <section id="registration-form" className="relative py-14 sm:py-20">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
          <div className="p-10 rounded-2xl bg-white border border-[#EDEAE2] shadow-sm">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-3xl">⚠️</span>
            </div>
            <h3 className="text-2xl font-bold text-[#0F172A] mb-3">Номер уже зарегистрирован</h3>
            <p className="text-[#475569] text-lg mb-6">
              Этот номер уже зарегистрирован. Войдите через приложение.
            </p>
            <a
              href="/master-pwa/login"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-[#D9342B] text-white font-bold text-lg shadow-md hover:bg-[#B8281F] hover:shadow-lg transition-all duration-300 hover:scale-[1.01]"
            >
              Войти в приложение
            </a>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="registration-form" className="relative py-14 sm:py-20">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl sm:text-4xl font-bold text-[#0F172A] mb-4 text-center">
          <span className="text-[#D9342B]">Регистрация</span> мастера
        </h2>
        <p className="text-[#475569] text-center mb-10 text-lg">
          Заполните форму — получите доступ к заказам сразу после регистрации
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

          {/* Password */}
          <div>
            <label htmlFor="reg-password" className="block text-[#0F172A] text-sm font-medium mb-2">
              Пароль
            </label>
            <div className="relative">
              <input
                id="reg-password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Минимум 6 символов"
                minLength={6}
                className="w-full px-4 py-3 pr-12 rounded-xl bg-white border border-[#EDEAE2] text-[#0F172A] placeholder-[#94A3B8] focus:border-[#D9342B] focus:outline-none focus:ring-1 focus:ring-[#D9342B]/50 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#475569] transition-colors cursor-pointer"
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
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
                Регистрация...
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                Зарегистрироваться
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
