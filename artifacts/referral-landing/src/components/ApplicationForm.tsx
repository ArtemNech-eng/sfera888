import { useState, FormEvent } from 'react';
import { motion } from "framer-motion";
import { User, Phone, MapPin, MessageSquare, CheckCircle, Loader2, Sparkles, Clock, ShieldCheck, BadgeCheck } from 'lucide-react';
import SectionHeader from "./SectionHeader";

const serviceOptions = [
  'Обои', 'Шпаклёвка', 'Штукатурка', 'Покраска', 'Плитка',
  'Санузел', 'Электрика', 'Сантехника', 'Квартира под ключ', 'Другое',
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
    name: '', phone: '', city: '', services: [], comment: '',
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
    const payload = { name: form.name, phone: form.phone, city: form.city, services: form.services, comment: form.comment, ref_slug: refSlug || undefined };
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
      <section id="form" className="py-24 bg-emerald-50/30 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-emerald-100/40 rounded-full blur-[100px] pointer-events-none" />
        <div className="max-w-xl mx-auto px-4 sm:px-6 text-center relative z-10">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="glass rounded-3xl p-10 shadow-premium"
          >
            <div className="w-20 h-20 rounded-full gradient-bg flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/20">
              <CheckCircle size={40} className="text-white" />
            </div>
            <h3 className="text-3xl font-extrabold text-[#111827] mb-3">Заявка принята</h3>
            <p className="text-gray-500 text-base mb-2">Подбираем мастера.</p>
            <p className="text-gray-500 text-base">
              Обычно это занимает{' '}
              <span className="font-bold text-[#111827]">15–30 минут</span>.
            </p>
            {refSlug && (
              <div className="mt-6 inline-flex items-center gap-2 gradient-bg text-white text-sm font-semibold px-5 py-2.5 rounded-full shadow-sm">
                <CheckCircle size={16} />
                Приоритетная обработка по рекомендации
              </div>
            )}
          </motion.div>
        </div>
      </section>
    );
  }

  return (
    <section id="form" className="py-24 bg-emerald-50/30 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-emerald-100/40 rounded-full blur-[100px] pointer-events-none" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 relative z-10">
        <SectionHeader
          title="Оставьте заявку"
          subtitle="Это бесплатно. Мастер свяжется с вами и уточнит детали."
        />

        <div className="grid lg:grid-cols-5 gap-10 items-start">
          {/* Left: Trust info */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="lg:col-span-2 space-y-6"
          >
            <div className="glass rounded-3xl p-6 shadow-float">
              <h3 className="text-lg font-bold text-[#111827] mb-4">Что будет дальше?</h3>
              <div className="space-y-4">
                {[
                  { icon: Clock, text: 'Ответ в течение 15–30 минут' },
                  { icon: ShieldCheck, text: 'Проверенный мастер с документами' },
                  { icon: BadgeCheck, text: 'Чёткая смета до начала работ' },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.text} className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                        <Icon size={18} className="text-[#059669]" />
                      </div>
                      <span className="text-gray-700 text-sm font-medium">{item.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {refSlug && (
              <div className="gradient-bg rounded-3xl p-6 text-white shadow-premium">
                <div className="flex items-center gap-3 mb-3">
                  <Sparkles size={22} />
                  <span className="font-bold text-lg">Рекомендация мастера</span>
                </div>
                <p className="text-emerald-100 text-sm">
                  Вы оформляете заявку по персональной ссылке — обработка в приоритетном порядке + скидка до 15%.
                </p>
              </div>
            )}
          </motion.div>

          {/* Right: Form */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="lg:col-span-3"
          >
            <div className="glass rounded-3xl p-6 sm:p-8 shadow-premium">
              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                <div className="grid sm:grid-cols-2 gap-5">
                  {/* Name */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Имя</label>
                    <div className="relative">
                      <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="Как вас зовут?"
                        className={`w-full border rounded-2xl pl-12 pr-4 py-3.5 text-base text-[#111827] placeholder:text-gray-400 focus:outline-none focus:ring-2 transition-all ${
                          errors.name
                            ? 'border-red-300 focus:ring-red-100 focus:border-red-400'
                            : 'border-gray-200 focus:ring-emerald-100 focus:border-emerald-400'
                        }`}
                      />
                    </div>
                    {errors.name && <p className="text-red-500 text-xs mt-1.5">{errors.name}</p>}
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Телефон</label>
                    <div className="relative">
                      <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        placeholder="+7 900 000-00-00"
                        className={`w-full border rounded-2xl pl-12 pr-4 py-3.5 text-base text-[#111827] placeholder:text-gray-400 focus:outline-none focus:ring-2 transition-all ${
                          errors.phone
                            ? 'border-red-300 focus:ring-red-100 focus:border-red-400'
                            : 'border-gray-200 focus:ring-emerald-100 focus:border-emerald-400'
                        }`}
                      />
                    </div>
                    {errors.phone && <p className="text-red-500 text-xs mt-1.5">{errors.phone}</p>}
                  </div>
                </div>

                {/* City */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Город</label>
                  <div className="relative">
                    <MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      placeholder="Ваш город"
                      className={`w-full border rounded-2xl pl-12 pr-4 py-3.5 text-base text-[#111827] placeholder:text-gray-400 focus:outline-none focus:ring-2 transition-all ${
                        errors.city
                          ? 'border-red-300 focus:ring-red-100 focus:border-red-400'
                          : 'border-gray-200 focus:ring-emerald-100 focus:border-emerald-400'
                      }`}
                    />
                  </div>
                  {errors.city && <p className="text-red-500 text-xs mt-1.5">{errors.city}</p>}
                </div>

                {/* Services */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">Что нужно сделать?</label>
                  <div className="flex flex-wrap gap-2">
                    {serviceOptions.map((s) => {
                      const selected = form.services.includes(s);
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => toggleService(s)}
                          className={`text-sm px-4 py-2.5 rounded-xl border font-semibold transition-all duration-200 ${
                            selected
                              ? 'gradient-bg border-transparent text-white shadow-md shadow-emerald-500/20'
                              : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-300 hover:text-[#059669]'
                          }`}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                  {errors.services && <p className="text-red-500 text-xs mt-1.5">{errors.services}</p>}
                </div>

                {/* Comment */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Комментарий <span className="text-gray-400 font-normal">(необязательно)</span>
                  </label>
                  <div className="relative">
                    <MessageSquare size={18} className="absolute left-4 top-3.5 text-gray-400" />
                    <textarea
                      rows={3}
                      value={form.comment}
                      onChange={(e) => { setForm({ ...form, comment: e.target.value }); if (errors.comment) setErrors({ ...errors, comment: undefined }); }}
                      placeholder="Например: 2 комнаты, стены подготовлены, нужен старт на этой неделе"
                      className={`w-full border rounded-2xl pl-12 pr-4 py-3.5 text-base text-[#111827] placeholder:text-gray-400 focus:outline-none focus:ring-2 resize-none transition-all ${
                        errors.comment
                          ? 'border-red-300 focus:ring-red-100 focus:border-red-400'
                          : 'border-gray-200 focus:ring-emerald-100 focus:border-emerald-400'
                      }`}
                    />
                  </div>
                  {errors.comment ? (
                    <p className="text-red-500 text-xs mt-1.5">{errors.comment}</p>
                  ) : (
                    <p className="text-gray-400 text-xs mt-1.5">Номер телефона указывайте только в поле выше</p>
                  )}
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full gradient-bg text-white font-bold py-4 rounded-2xl hover:scale-[1.01] hover:shadow-lg hover:shadow-emerald-500/30 transition-all duration-300 text-base disabled:opacity-60 flex items-center justify-center gap-2 glow-green"
                >
                  {loading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Отправляем...
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} />
                      Оставить заявку
                    </>
                  )}
                </button>

                <p className="text-gray-400 text-xs text-center">
                  Нажимая кнопку, вы соглашаетесь на обработку персональных данных
                </p>
              </form>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
