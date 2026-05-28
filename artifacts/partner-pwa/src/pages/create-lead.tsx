import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { leadsApi } from "@/lib/api";
import { AlertTriangle, CheckCircle2, Loader2, Calendar } from "lucide-react";

async function fetchCities(): Promise<string[]> {
  const res = await fetch("/api/settings/cities");
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((c: { name: string }) => c.name);
}

async function fetchServices(): Promise<string[]> {
  const res = await fetch("/api/settings/services");
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((s: { name: string }) => s.name);
}

const FALLBACK_SERVICES = ["Обои", "Шпаклёвка", "Покраска", "Плитка", "Санузел", "Электрика", "Ремонт под ключ", "Другое"];

interface FormData {
  clientName: string;
  clientPhone: string;
  city: string;
  district: string;
  serviceType: string;
  area: string;
  scheduledAt: string;
  comment: string;
}

const emptyForm: FormData = {
  clientName: "",
  clientPhone: "",
  city: "",
  district: "",
  serviceType: "",
  area: "",
  scheduledAt: "",
  comment: "",
};

export default function CreateLeadPage() {
  const [, navigate] = useLocation();
  const { data: cities = [] } = useQuery<string[]>({ queryKey: ["cities"], queryFn: fetchCities, staleTime: 10 * 60_000 });
  const { data: serviceTypes = FALLBACK_SERVICES } = useQuery<string[]>({ queryKey: ["services"], queryFn: fetchServices, staleTime: 10 * 60_000 });
  const [form, setForm] = useState<FormData>(emptyForm);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<Partial<FormData>>({});
  const phoneCheckRef = useRef<AbortController | null>(null);

  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [field]: e.target.value }));
    setErrors(er => ({ ...er, [field]: "" }));
  };

  const handlePhoneBlur = async () => {
    if (!form.clientPhone.trim()) return;
    if (phoneCheckRef.current) phoneCheckRef.current.abort();
    setCheckingDuplicate(true);
    try {
      const res = await leadsApi.checkDuplicate(form.clientPhone.trim());
      setIsDuplicate(res.isDuplicate);
    } catch {}
    finally { setCheckingDuplicate(false); }
  };

  const validate = (): boolean => {
    const e: Partial<FormData> = {};
    if (!form.clientName.trim()) e.clientName = "Обязательное поле";
    if (!form.clientPhone.trim()) e.clientPhone = "Обязательное поле";
    if (!form.city.trim()) e.city = "Обязательное поле";
    if (!form.serviceType) e.serviceType = "Выберите вид работ";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await leadsApi.create({
        clientName: form.clientName.trim(),
        clientPhone: form.clientPhone.trim(),
        city: form.city.trim(),
        district: form.district.trim() || undefined,
        serviceType: form.serviceType,
        area: form.area.trim() || undefined,
        scheduledAt: form.scheduledAt || undefined,
        comment: form.comment.trim() || undefined,
      });
      setSuccess(true);
    } catch (err: any) {
      setErrors({ clientName: err.message ?? "Ошибка отправки" });
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-dvh bg-[#F8F9FA] flex flex-col items-center justify-center px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-[#D1FAE5] flex items-center justify-center mb-6">
          <CheckCircle2 className="w-10 h-10 text-[#34C759]" />
        </div>
        <h1 className="text-xl font-bold text-[#111827] mb-2">Лид отправлен</h1>
        <p className="text-sm text-[#6B7280] mb-8">Лид отправлен на проверку. Вы увидите его в «Мои лиды».</p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={() => { setForm(emptyForm); setSuccess(false); setIsDuplicate(false); }}
            className="h-[52px] rounded-xl bg-[#34C759] text-white font-semibold text-base"
          >
            Добавить ещё
          </button>
          <button
            onClick={() => navigate("/my-leads")}
            className="h-[52px] rounded-xl border border-[#E5E7EB] bg-white text-[#374151] font-semibold text-base"
          >
            Мои лиды
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#F8F9FA] pb-28">
      <div className="bg-white border-b border-[#E5E7EB] px-4 pt-12 pb-4 flex items-center gap-3">
        <h1 className="text-lg font-bold text-[#111827]">Добавить лид</h1>
      </div>

      <form onSubmit={handleSubmit} className="px-4 py-4 space-y-4">
        {/* Client name */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-[#374151]">Имя клиента <span className="text-red-500">*</span></label>
          <input
            value={form.clientName}
            onChange={set("clientName")}
            placeholder="Иван Иванов"
            className={`w-full px-4 py-3.5 rounded-xl border bg-white text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#34C759] focus:border-transparent text-base ${errors.clientName ? "border-red-400" : "border-[#E5E7EB]"}`}
          />
          {errors.clientName && <p className="text-xs text-red-500">{errors.clientName}</p>}
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-[#374151]">Телефон клиента <span className="text-red-500">*</span></label>
          <div className="relative">
            <input
              type="tel"
              value={form.clientPhone}
              onChange={set("clientPhone")}
              onBlur={handlePhoneBlur}
              placeholder="+7 (___) ___-__-__"
              inputMode="tel"
              className={`w-full px-4 py-3.5 pr-10 rounded-xl border bg-white text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#34C759] focus:border-transparent text-base ${errors.clientPhone ? "border-red-400" : "border-[#E5E7EB]"}`}
            />
            {checkingDuplicate && (
              <Loader2 size={16} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-[#9CA3AF]" />
            )}
          </div>
          {errors.clientPhone && <p className="text-xs text-red-500">{errors.clientPhone}</p>}
          {isDuplicate && (
            <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                Похожий клиент уже был в системе. Вы всё равно можете отправить лид.
              </p>
            </div>
          )}
        </div>

        {/* City */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-[#374151]">Город <span className="text-red-500">*</span></label>
          {cities.length > 0 ? (
            <select
              value={form.city}
              onChange={set("city")}
              className={`w-full px-4 py-3.5 rounded-xl border bg-white text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#34C759] focus:border-transparent text-base appearance-none ${errors.city ? "border-red-400" : "border-[#E5E7EB]"} ${!form.city ? "text-[#9CA3AF]" : ""}`}
            >
              <option value="">Выберите город</option>
              {cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          ) : (
            <input
              value={form.city}
              onChange={set("city")}
              placeholder="Москва"
              className={`w-full px-4 py-3.5 rounded-xl border bg-white text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#34C759] focus:border-transparent text-base ${errors.city ? "border-red-400" : "border-[#E5E7EB]"}`}
            />
          )}
          {errors.city && <p className="text-xs text-red-500">{errors.city}</p>}
        </div>

        {/* Address */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-[#374151]">Адрес объекта</label>
          <input
            value={form.district}
            onChange={set("district")}
            placeholder="ул. Ленина, 10"
            className="w-full px-4 py-3.5 rounded-xl border border-[#E5E7EB] bg-white text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#34C759] focus:border-transparent text-base"
          />
        </div>

        {/* Service type */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-[#374151]">Вид работ <span className="text-red-500">*</span></label>
          <select
            value={form.serviceType}
            onChange={set("serviceType")}
            className={`w-full px-4 py-3.5 rounded-xl border bg-white text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#34C759] focus:border-transparent text-base appearance-none ${errors.serviceType ? "border-red-400" : "border-[#E5E7EB]"} ${!form.serviceType ? "text-[#9CA3AF]" : ""}`}
          >
            <option value="">Выберите вид работ</option>
            {serviceTypes.map((s: string) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {errors.serviceType && <p className="text-xs text-red-500">{errors.serviceType}</p>}
        </div>

        {/* Area */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-[#374151]">Площадь</label>
          <input
            type="number"
            value={form.area}
            onChange={set("area")}
            placeholder="50 м²"
            inputMode="decimal"
            className="w-full px-4 py-3.5 rounded-xl border border-[#E5E7EB] bg-white text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#34C759] focus:border-transparent text-base"
          />
        </div>

        {/* Scheduled date */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-[#374151] flex items-center gap-1.5">
            <Calendar size={14} className="text-[#9CA3AF]" />
            Дата выезда
            <span className="text-[#9CA3AF] font-normal text-xs ml-auto">необязательно</span>
          </label>
          <input
            type="datetime-local"
            value={form.scheduledAt}
            onChange={set("scheduledAt")}
            className="w-full px-4 py-3.5 rounded-xl border border-[#E5E7EB] bg-white text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#34C759] focus:border-transparent text-base"
          />
        </div>

        {/* Comment */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-[#374151]">Комментарий</label>
          <textarea
            value={form.comment}
            onChange={set("comment")}
            placeholder="Дополнительные пожелания..."
            rows={3}
            className="w-full px-4 py-3.5 rounded-xl border border-[#E5E7EB] bg-white text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#34C759] focus:border-transparent text-base resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full h-[52px] rounded-xl bg-[#34C759] text-white font-semibold text-base disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 size={20} className="animate-spin" /> : "Отправить лид"}
        </button>
      </form>
    </div>
  );
}
