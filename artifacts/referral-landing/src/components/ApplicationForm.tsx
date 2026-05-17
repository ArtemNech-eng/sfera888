import { useState, FormEvent } from 'react';

const serviceOptions = [
  'Обои',
  'Шпаклёвка',
  'Штукатурка',
  'Покраска',
  'Плитка',
  'Санузел',
  'Электрика',
  'Сантехника',
  'Квартира под ключ',
  'Другое',
];

const PHONE_REGEX = /(\+7|8)?[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}|(\d[\s\-]?){10,}/;

interface FormState {
  name: string;
  phone: string;
  city: string;
  services: string[];
  comment: string;
}

interface ApplicationFormProps {
  refSlug: string | null;
}

export default function ApplicationForm({ refSlug }: ApplicationFormProps) {
  const [form, setForm] = useState<FormState>({
    name: '',
    phone: '',
    city: '',
    services: [],
    comment: '',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const toggleService = (s: string) => {
    setForm((prev) => ({
      ...prev,
      services: prev.services.includes(s)
        ? prev.services.filter((x) => x !== s)
        : [...prev.services, s],
    }));
  };

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormState, string>> = {};

    if (!form.name.trim()) newErrors.name = 'Пожалуйста, укажите ваше имя';
    if (!form.phone.trim()) {
      newErrors.phone = 'Пожалуйста, укажите номер телефона';
    } else if (!/^[\d\s\+\-\(\)]{7,}$/.test(form.phone.trim())) {
      newErrors.phone = 'Проверьте формат номера телефона';
    }
    if (!form.city.trim()) newErrors.city = 'Пожалуйста, укажите город';
    if (form.services.length === 0) newErrors.services = 'Выберите хотя бы один вид работ';
    if (form.comment && PHONE_REGEX.test(form.comment)) {
      newErrors.comment = 'Пожалуйста, укажите номер только в поле «Телефон»';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);

    const payload = {
      name: form.name,
      phone: form.phone,
      city: form.city,
      services: form.services,
      comment: form.comment,
      ref_slug: refSlug || undefined,
    };

    try {
      const res = await fetch('/api/landing/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErrors({
          name: err.error === 'too_many_requests'
            ? 'Слишком быстро. Подождите 5 секунд и попробуйте снова.'
            : err.error === 'validation_error'
            ? 'Проверьте данные в форме'
            : 'Ошибка отправки. Попробуйте позже.',
        });
        setLoading(false);
        return;
      }

      setSubmitted(true);
    } catch {
      setErrors({ name: 'Ошибка соединения. Проверьте интернет и попробуйте снова.' });
    }

    setLoading(false);
  };

  if (submitted) {
    return (
      <section id="form" className="bg-[#F1F5F9] py-20">
        <div className="max-w-xl mx-auto px-4 sm:px-6 text-center">
          <div className="bg-white rounded-2xl p-10 border border-[#E5E7EB] shadow-sm">
            <div className="w-16 h-16 rounded-full bg-[#E8F9EE] flex items-center justify-center mx-auto mb-5">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#34C759" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h3 className="text-2xl font-extrabold text-[#111827] mb-3">Заявка принята</h3>
            <p className="text-[#6B7280] text-base mb-2">Подбираем мастера.</p>
            <p className="text-[#6B7280] text-base">
              Обычно это занимает{' '}
              <span className="font-semibold text-[#111827]">15–30 минут</span>.
            </p>
            {refSlug && (
              <div className="mt-5 inline-flex items-center gap-2 bg-[#E8F9EE] text-[#1a8a3c] text-sm font-medium px-3 py-2 rounded-lg">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Заявка оформлена по рекомендации — приоритетная обработка
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="form" className="bg-[#F1F5F9] py-20">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#111827] mb-3">
            Оставьте заявку
          </h2>
          <p className="text-[#6B7280] text-base">
            Это бесплатно. Мастер свяжется с вами и уточнит детали.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-7 sm:p-9">
          {refSlug && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium px-4 py-2.5 rounded-xl mb-6">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              Заявка оформляется по рекомендации
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-[#374151] mb-1.5">Имя</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Как вас зовут?"
                className={`w-full border rounded-xl px-4 py-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 transition-colors ${
                  errors.name
                    ? 'border-[#EF4444] focus:ring-[#EF4444]/20'
                    : 'border-[#E5E7EB] focus:ring-[#34C759]/20 focus:border-[#34C759]'
                }`}
              />
              {errors.name && <p className="text-[#EF4444] text-xs mt-1.5">{errors.name}</p>}
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-[#374151] mb-1.5">Телефон</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+7 900 000-00-00"
                className={`w-full border rounded-xl px-4 py-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 transition-colors ${
                  errors.phone
                    ? 'border-[#EF4444] focus:ring-[#EF4444]/20'
                    : 'border-[#E5E7EB] focus:ring-[#34C759]/20 focus:border-[#34C759]'
                }`}
              />
              {errors.phone && <p className="text-[#EF4444] text-xs mt-1.5">{errors.phone}</p>}
            </div>

            {/* City */}
            <div>
              <label className="block text-sm font-medium text-[#374151] mb-1.5">Город</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="Ваш город"
                className={`w-full border rounded-xl px-4 py-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 transition-colors ${
                  errors.city
                    ? 'border-[#EF4444] focus:ring-[#EF4444]/20'
                    : 'border-[#E5E7EB] focus:ring-[#34C759]/20 focus:border-[#34C759]'
                }`}
              />
              {errors.city && <p className="text-[#EF4444] text-xs mt-1.5">{errors.city}</p>}
            </div>

            {/* Services */}
            <div>
              <label className="block text-sm font-medium text-[#374151] mb-2">Что нужно сделать?</label>
              <div className="flex flex-wrap gap-2">
                {serviceOptions.map((s) => {
                  const selected = form.services.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleService(s)}
                      className={`text-sm px-3.5 py-2 rounded-lg border font-medium transition-colors ${
                        selected
                          ? 'bg-[#34C759] border-[#34C759] text-white'
                          : 'bg-white border-[#E5E7EB] text-[#374151] hover:border-[#34C759] hover:text-[#34C759]'
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
              {errors.services && <p className="text-[#EF4444] text-xs mt-1.5">{errors.services}</p>}
            </div>

            {/* Comment */}
            <div>
              <label className="block text-sm font-medium text-[#374151] mb-1.5">
                Комментарий{' '}
                <span className="text-[#94A3B8] font-normal">(необязательно)</span>
              </label>
              <textarea
                rows={3}
                value={form.comment}
                onChange={(e) => {
                  setForm({ ...form, comment: e.target.value });
                  if (errors.comment) setErrors({ ...errors, comment: undefined });
                }}
                placeholder="Например: 2 комнаты, стены подготовлены, нужен старт на этой неделе"
                className={`w-full border rounded-xl px-4 py-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 resize-none transition-colors ${
                  errors.comment
                    ? 'border-[#EF4444] focus:ring-[#EF4444]/20'
                    : 'border-[#E5E7EB] focus:ring-[#34C759]/20 focus:border-[#34C759]'
                }`}
              />
              {errors.comment ? (
                <p className="text-[#EF4444] text-xs mt-1.5">{errors.comment}</p>
              ) : (
                <p className="text-[#94A3B8] text-xs mt-1.5">
                  Номер телефона указывайте только в поле выше
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#34C759] text-white font-semibold py-3.5 rounded-xl hover:bg-[#2db34e] transition-colors text-base disabled:opacity-70 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4"/>
                    <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Отправляем...
                </>
              ) : (
                'Оставить заявку'
              )}
            </button>

            <p className="text-[#94A3B8] text-xs text-center">
              Нажимая кнопку, вы соглашаетесь на обработку персональных данных
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}
