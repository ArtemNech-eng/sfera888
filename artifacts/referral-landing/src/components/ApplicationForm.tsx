import { useState, useEffect, FormEvent } from 'react';
import { motion } from "framer-motion";
import { User, Phone, MapPin, MessageSquare, CheckCircle, Loader2, Sparkles, Clock, ShieldCheck, BadgeCheck, Maximize, ChevronDown } from 'lucide-react';
import SectionHeader from "./SectionHeader";

const FALLBACK_SERVICES = [
  'Обои', 'Шпаклёвка', 'Штукатурка', 'Покраска', 'Плитка',
  'Санузел', 'Электрика', 'Сантехника', 'Квартира под ключ', 'Другое',
];
const FALLBACK_CITIES: string[] = [];

const PHONE_REGEX = /(\+7|8)?[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}|(\d[\s\-]?){10,}/;

interface FormState {
  name: string;
  phone: string;
  city: string;
  district: string;
  area: string;
  services: string[];
  comment: string;
}

interface ApplicationFormProps {
  refSlug: string | null;
}

export default function ApplicationForm({ refSlug }: ApplicationFormProps) {
  const [form, setForm] = useState<FormState>({
    name: '', phone: '', city: '', district: '', area: '', services: [], comment: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serviceOptions, setServiceOptions] = useState<string[]>(FALLBACK_SERVICES);
  const [cityOptions, setCityOptions] = useState<string[]>(FALLBACK_CITIES);

  useEffect(() => {
    fetch('https://sfera-master.ru/api/settings/services')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.length) setServiceOptions(data.map((s: { name: string }) => s.name)); })
      .catch(() => {});
    fetch('https://sfera-master.ru/api/settings/cities')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.length) setCityOptions(data.map((c: { name: string }) => c.name)); })
      .catch(() => {});
  }, []);

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
    if (!form.name.trim()) {
      newErrors.name = 'Пожалуйста, укажите ваше имя';
    } else if (PHONE_REGEX.test(form.name)) {
      newErrors.name = 'Пожалуйста, укажите номер только в поле «Телефон»';
    }
    if (!form.phone.trim()) {
      newErrors.phone = 'Пожалуйста, укажите номер телефона';
    } else if (!/[\d\s\+\-\(\)]{7,}/.test(form.phone.trim())) {
      newErrors.phone = 'Проверьте формат номера телефона';
    }
    if (!form.city.trim()) {
      newErrors.city = 'Пожалуйста, укажите город';
    } else if (PHONE_REGEX.test(form.city)) {
      newErrors.city = 'Пожалуйста, укажите номер только в поле «Телефон»';
    }
    if (!form.district.trim()) {
      newErrors.district = 'Пожалуйста, укажите адрес объекта';
    } else if (PHONE_REGEX.test(form.district)) {
      newErrors.district = 'Пожалуйста, укажите номер только в поле «Телефон»';
    }
    if (!form.area.trim()) {
      newErrors.area = 'Укажите общую площадь работ';
    } else if (isNaN(parseFloat(form.area)) || parseFloat(form.area) <= 0) {
      newErrors.area = 'Введите число больше 0';
    }
    if (form.services.length === 0) newErrors.services = 'Выберите хотя бы один вид работ';
    if (!form.comment.trim()) {
      newErrors.comment = 'Опишите задачу — это поможет связать вас с мастером';
    } else if (PHONE_REGEX.test(form.comment)) {
      newErrors.comment = 'Пожалуйста, укажите номер только в поле «Телефон»';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    const payload = { name: form.name, phone: form.phone, city: form.city, district: form.district, area: form.area, services: form.services, comment: form.comment, ref_slug: refSlug || undefined };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch('https://sfera-master.ru/api/landing/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
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
      window.scrollTo(0, 0);
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err?.name === 'AbortError') {
        setErrors({ name: 'Сервер не отвечает. Попробуйте позже.' });
      } else {
        setErrors({ name: 'Ошибка соединения. Проверьте интернет и попробуйте снова.' });
      }
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
            <h3 className="text-3xl font-extrabold text-[#111827] mb-3">Расчёт принят!</h3>
            <p className="text-gray-500 text-base mb-2">Мастер позвонит вам и составит смету онлайн.</p>
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
          title="Рассчитайте стоимость онлайн"
          subtitle="Бесплатно. Мастер позвонит и составит смету — никаких обязательств."
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
                  { icon: Clock, text: 'Мастер позвонит в течение 15–30 минут' },
                  { icon: BadgeCheck, text: 'Составит смету онлайн по вашему описанию' },
                  { icon: ShieldCheck, text: 'При необходимости договоритесь о выезде на замер' },
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
                        onInput={(e) => setForm({ ...form, phone: (e.target as HTMLInputElement).value })}
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

                <div className="grid sm:grid-cols-2 gap-5">
                  {/* City */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Город</label>
                    <div className="relative">
                      <MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      {cityOptions.length > 0 ? (
                        <>
                          <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                          <select
                            value={form.city}
                            onChange={(e) => { setForm({ ...form, city: e.target.value }); if (errors.city) setErrors({ ...errors, city: undefined }); }}
                            className={`w-full border rounded-2xl pl-12 pr-10 py-3.5 text-base text-[#111827] appearance-none focus:outline-none focus:ring-2 transition-all ${
                              errors.city
                                ? 'border-red-300 focus:ring-red-100 focus:border-red-400'
                                : 'border-gray-200 focus:ring-emerald-100 focus:border-emerald-400'
                            } ${!form.city ? 'text-gray-400' : ''}`}
                          >
                            <option value="">Выберите город</option>
                            {cityOptions.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </>
                      ) : (
                        <input
                          type="text"
                          value={form.city}
                          onChange={(e) => { setForm({ ...form, city: e.target.value }); if (errors.city) setErrors({ ...errors, city: undefined }); }}
                          placeholder="Ваш город"
                          className={`w-full border rounded-2xl pl-12 pr-4 py-3.5 text-base text-[#111827] placeholder:text-gray-400 focus:outline-none focus:ring-2 transition-all ${
                            errors.city
                              ? 'border-red-300 focus:ring-red-100 focus:border-red-400'
                              : 'border-gray-200 focus:ring-emerald-100 focus:border-emerald-400'
                          }`}
                        />
                      )}
                    </div>
                    {errors.city && <p className="text-red-500 text-xs mt-1.5">{errors.city}</p>}
                  </div>

                  {/* Address */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Адрес объекта</label>
                    <div className="relative">
                      <MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={form.district}
                        onChange={(e) => setForm({ ...form, district: e.target.value })}
                        placeholder="Например: ул. Ленина, 10"
                        className={`w-full border rounded-2xl pl-12 pr-4 py-3.5 text-base text-[#111827] placeholder:text-gray-400 focus:outline-none focus:ring-2 transition-all ${
                          errors.district
                            ? 'border-red-300 focus:ring-red-100 focus:border-red-400'
                            : 'border-gray-200 focus:ring-emerald-100 focus:border-emerald-400'
                        }`}
                      />
                    </div>
                    {errors.district && <p className="text-red-500 text-xs mt-1.5">{errors.district}</p>}
                  </div>
                </div>

                {/* Area */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Общая площадь работ, м²</label>
                  <div className="relative">
                    <Maximize size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="number"
                      min="1"
                      step="0.1"
                      value={form.area}
                      onChange={(e) => setForm({ ...form, area: e.target.value })}
                      placeholder="Например: 45"
                      className={`w-full sm:w-48 border rounded-2xl pl-12 pr-4 py-3.5 text-base text-[#111827] placeholder:text-gray-400 focus:outline-none focus:ring-2 transition-all ${
                        errors.area
                          ? 'border-red-300 focus:ring-red-100 focus:border-red-400'
                          : 'border-gray-200 focus:ring-emerald-100 focus:border-emerald-400'
                      }`}
                    />
                  </div>
                  {errors.area && <p className="text-red-500 text-xs mt-1.5">{errors.area}</p>}
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
                    Комментарий
                  </label>
                  <div className="relative">
                    <MessageSquare size={18} className="absolute left-4 top-3.5 text-gray-400" />
                    <textarea
                      rows={3}
                      value={form.comment}
                      onChange={(e) => { setForm({ ...form, comment: e.target.value }); if (errors.comment) setErrors({ ...errors, comment: undefined }); }}
                      onInput={(e) => { setForm({ ...form, comment: e.target.value }); if (errors.comment) setErrors({ ...errors, comment: undefined }); }}
                      placeholder="Опишите задачу подробнее: что нужно сделать, состояние помещения, сроки…"
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
                    <p className="text-gray-400 text-xs mt-1.5">Чем подробнее описание — тем точнее оценка от мастера</p>
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
                      Получить расчёт бесплатно
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
