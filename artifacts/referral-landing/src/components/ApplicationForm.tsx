import { useState, FormEvent } from 'react';
import { User, Phone, MapPin, MessageSquare, CheckCircle, Loader2, Sparkles } from 'lucide-react';

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
              <CheckCircle size={32} className="text-[#34C759]" />
            </div>
            <h3 className="text-2xl font-extrabold text-[#111827] mb-3">Заявка принята</h3>
            <p className="text-[#6B7280] text-base mb-2">Подбираем мастера.</p>
            <p className="text-[#6B7280] text-base">
              Обычно это занимает{' '}
              <span className="font-semibold text-[#111827]">15–30 минут</span>.
            </p>
            {refSlug && (
              <div className="mt-5 inline-flex items-center gap-2 bg-[#E8F9EE] text-[#1a8a3c] text-sm font-medium px-3 py-2 rounded-lg">
                <CheckCircle size={14} className="text-[#34C759]" />
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
              <User size={15} />
              Заявка оформляется по рекомендации
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-[#374151] mb-1.5">Имя</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Как вас зовут?"
                  className={`w-full border rounded-xl pl-10 pr-4 py-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 transition-colors ${
                    errors.name
                      ? 'border-[#EF4444] focus:ring-[#EF4444]/20'
                      : 'border-[#E5E7EB] focus:ring-[#34C759]/20 focus:border-[#34C759]'
                  }`}
                />
              </div>
              {errors.name && <p className="text-[#EF4444] text-xs mt-1.5">{errors.name}</p>}
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-[#374151] mb-1.5">Телефон</label>
              <div className="relative">
                <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+7 900 000-00-00"
                  className={`w-full border rounded-xl pl-10 pr-4 py-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 transition-colors ${
                    errors.phone
                      ? 'border-[#EF4444] focus:ring-[#EF4444]/20'
                      : 'border-[#E5E7EB] focus:ring-[#34C759]/20 focus:border-[#34C759]'
                  }`}
                />
              </div>
              {errors.phone && <p className="text-[#EF4444] text-xs mt-1.5">{errors.phone}</p>}
            </div>

            {/* City */}
            <div>
              <label className="block text-sm font-medium text-[#374151] mb-1.5">Город</label>
              <div className="relative">
                <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="Ваш город"
                  className={`w-full border rounded-xl pl-10 pr-4 py-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 transition-colors ${
                    errors.city
                      ? 'border-[#EF4444] focus:ring-[#EF4444]/20'
                      : 'border-[#E5E7EB] focus:ring-[#34C759]/20 focus:border-[#34C759]'
                  }`}
                />
              </div>
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
              <div className="relative">
                <MessageSquare size={16} className="absolute left-3 top-3 text-[#94A3B8]" />
                <textarea
                  rows={3}
                  value={form.comment}
                  onChange={(e) => {
                    setForm({ ...form, comment: e.target.value });
                    if (errors.comment) setErrors({ ...errors, comment: undefined });
                  }}
                  placeholder="Например: 2 комнаты, стены подготовлены, нужен старт на этой неделе"
                  className={`w-full border rounded-xl pl-10 pr-4 py-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 resize-none transition-colors ${
                    errors.comment
                      ? 'border-[#EF4444] focus:ring-[#EF4444]/20'
                      : 'border-[#E5E7EB] focus:ring-[#34C759]/20 focus:border-[#34C759]'
                  }`}
                />
              </div>
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
                  <Loader2 size={16} className="animate-spin" />
                  Отправляем...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Оставить заявку
                </>
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
