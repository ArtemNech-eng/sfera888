import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { PhotoUploader } from "@/components/photo-uploader";
import { SOURCE_OPTIONS } from "./LeadDetailPanel";
import {
  Loader2, Plus, Trash2, User, Phone, MapPin, ChevronDown,
  Sparkles, Images, X, Calendar, Radio, CheckCircle2, AlertCircle, AlertTriangle, RefreshCw,
} from "lucide-react";

interface ServiceRow {
  type: string;
  area: string;
  pricePerM2: string;
}

interface CreateLeadModalProps {
  open: boolean;
  onClose: () => void;
  createLead: (input: { data: Record<string, any> }) => void;
  createPending: boolean;
  cities?: { id: number; name: string }[];
  services?: { id: number; name: string }[];
}

export default function CreateLeadModal({
  open,
  onClose,
  createLead,
  createPending,
  cities,
  services,
}: CreateLeadModalProps) {
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    clientName: "",
    clientPhone: "",
    city: "",
    district: "",
    comment: "",
    scheduledAt: "",
    source: "",
    paymentModel: "commission" as "token" | "commission",
  });
  const [serviceRows, setServiceRows] = useState<ServiceRow[]>([
    { type: "", area: "", pricePerM2: "" },
  ]);
  const [photosPaths, setPhotosPaths] = useState<string[]>([]);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDone, setAiDone] = useState(false);
  const [aiProgress, setAiProgress] = useState(0);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiWaitLonger, setAiWaitLonger] = useState(false);
  const aiProgressInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const [phoneCheckResult, setPhoneCheckResult] = useState<{
    duplicate: boolean;
    existing?: { id: number; clientName: string; status: string }[];
  } | null>(null);
  const phoneCheckTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetForm = () => {
    setFormData({
      clientName: "",
      clientPhone: "",
      city: "",
      district: "",
      comment: "",
      scheduledAt: "",
      source: "",
      paymentModel: "commission",
    });
    setServiceRows([{ type: "", area: "", pricePerM2: "" }]);
    setPhotosPaths([]);
    setPhoneCheckResult(null);
    setAiOpen(false);
    setAiText("");
    setAiDone(false);
    setAiError(null);
  };

  const checkPhone = (phone: string) => {
    if (phoneCheckTimeout.current) clearTimeout(phoneCheckTimeout.current);
    if (phone.length < 7) {
      setPhoneCheckResult(null);
      return;
    }
    phoneCheckTimeout.current = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/leads/check-phone?phone=${encodeURIComponent(phone)}`,
          { credentials: "include" }
        );
        if (r.ok) setPhoneCheckResult(await r.json());
      } catch {}
    }, 600);
  };

  const runAiParse = async () => {
    if (!aiText.trim() || aiLoading) return;
    setAiLoading(true);
    setAiDone(false);
    setAiError(null);
    setAiProgress(0);
    setAiWaitLonger(false);
    aiProgressInterval.current = setInterval(() => {
      setAiProgress((p) => {
        if (p >= 90) return p;
        return p + Math.random() * 8;
      });
    }, 800);
    try {
      const controller = new AbortController();
      const quickTimeout = setTimeout(() => setAiWaitLonger(true), 15000);
      const fullTimeout = setTimeout(() => controller.abort(), 60000);
      let resp: Response;
      try {
        resp = await fetch("/api/leads/ai-parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: aiText }),
          credentials: "include",
          signal: controller.signal,
        });
      } finally {
        clearTimeout(quickTimeout);
        clearTimeout(fullTimeout);
      }
      if (aiProgressInterval.current) clearInterval(aiProgressInterval.current);
      setAiProgress(100);
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || "Ошибка при разборе текста");
      }
      const data = await resp.json();
      if (data.form) {
        const f = data.form;
        setFormData((prev) => ({
          ...prev,
          clientName: f.clientName ?? prev.clientName,
          clientPhone: f.clientPhone ?? prev.clientPhone,
          city: f.city ?? prev.city,
          district: f.district ?? prev.district,
          comment: f.comment ?? prev.comment,
          scheduledAt: f.scheduledAt ?? prev.scheduledAt,
          source: f.source ?? prev.source,
        }));
      }
      if (data.services && Array.isArray(data.services) && data.services.length > 0) {
        const parsed: ServiceRow[] = data.services.map((s: any) => ({
          type: s.type ?? "",
          area: s.area != null ? String(s.area) : "",
          pricePerM2: s.pricePerM2 != null ? String(s.pricePerM2) : "",
        }));
        if (parsed.length > 0) setServiceRows(parsed);
      }
      setAiDone(true);
      setAiText("");
      setTimeout(() => setAiOpen(false), 2000);
    } catch (e: any) {
      if (aiProgressInterval.current) clearInterval(aiProgressInterval.current);
      const msg =
        e?.name === "AbortError"
          ? "ИИ не ответил за 60 секунд. Попробуйте снова или заполните вручную."
          : e?.message ?? "Не удалось разобрать текст";
      setAiError(msg);
      toast({ title: msg, variant: "destructive" });
    } finally {
      setAiLoading(false);
      setAiWaitLonger(false);
    }
  };

  const addRow = () =>
    setServiceRows((r) => [...r, { type: "", area: "", pricePerM2: "" }]);
  const removeRow = (i: number) =>
    setServiceRows((r) => r.filter((_, idx) => idx !== i));
  const updateRow = (i: number, field: keyof ServiceRow, value: string) =>
    setServiceRows((r) =>
      r.map((row, idx) => (idx === i ? { ...row, [field]: value } : row))
    );

  const totalArea = serviceRows.reduce(
    (sum, r) => sum + (parseFloat(r.area) || 0),
    0
  );
  const totalEstimate = serviceRows.reduce(
    (sum, r) => sum + (parseFloat(r.area) || 0) * (parseFloat(r.pricePerM2) || 0),
    0
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validRows = serviceRows.filter((r) => r.type && r.area);
    if (validRows.length === 0) return;
    const srvs = validRows.map((r) => ({
      type: r.type,
      area: parseFloat(r.area),
      pricePerM2: parseFloat(r.pricePerM2) || 0,
    }));
    createLead({
      data: {
        ...formData,
        scheduledAt: formData.scheduledAt || null,
        services: srvs as any,
        serviceType: srvs.map((s) => s.type).join(", "),
        area: srvs.reduce((sum, s) => sum + s.area, 0),
        photos: photosPaths.length > 0 ? photosPaths : undefined,
      },
    });
    resetForm();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
        style={{
          boxShadow:
            "0 32px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)",
        }}
      >
        <div className="relative px-7 pt-7 pb-5 flex items-center justify-between flex-shrink-0">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <h2 className="text-xl font-display font-bold text-gray-900">
                Новая заявка
              </h2>
            </div>
            <p className="text-sm text-gray-400 ml-10">
              Заполните данные клиента и список работ
            </p>
          </div>
          <button
            onClick={() => {
              onClose();
              resetForm();
            }}
            className="w-9 h-9 flex items-center justify-center rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-y-auto">
          <div className="px-7 pb-6 space-y-5">
            {/* AI parse panel */}
            <div
              className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                aiOpen
                  ? "border-violet-200 bg-violet-50/60"
                  : "border-dashed border-gray-200 bg-transparent"
              }`}
            >
              {!aiOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    setAiOpen(true);
                    setAiDone(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition-all rounded-2xl group"
                >
                  <div className="w-6 h-6 rounded-lg bg-violet-100 group-hover:bg-violet-200 flex items-center justify-center transition-colors">
                    <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                  </div>
                  <span className="font-medium">Заполнить по тексту через ИИ</span>
                  <span className="ml-auto text-xs text-gray-300">
                    вставьте переписку, голосовое, объявление…
                  </span>
                </button>
              ) : (
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-violet-200 flex items-center justify-center">
                        <Sparkles className="w-3.5 h-3.5 text-violet-600" />
                      </div>
                      <span className="text-sm font-semibold text-violet-700">
                        Заполнение через ИИ
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAiOpen(false);
                        setAiText("");
                        setAiDone(false);
                      }}
                      className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-violet-100 text-violet-400 hover:text-violet-600 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {aiDone ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-5">
                      <div className="flex items-center gap-2 text-emerald-600">
                        <CheckCircle2 className="w-5 h-5" />
                        <span className="text-sm font-semibold">
                          Форма заполнена!
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">
                        Проверьте данные и при необходимости скорректируйте
                      </p>
                    </div>
                  ) : aiError ? (
                    <div className="flex flex-col gap-3 py-3">
                      <div className="flex items-start gap-2 text-red-600 bg-red-50 rounded-xl p-3">
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium">Ошибка ИИ</p>
                          <p className="text-xs text-red-500/80 mt-0.5">
                            {aiError}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setAiError(null);
                            runAiParse();
                          }}
                          className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Попробовать снова
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAiError(null);
                            setAiOpen(false);
                          }}
                          className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Заполнить вручную
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <textarea
                        value={aiText}
                        onChange={(e) => setAiText(e.target.value)}
                        disabled={aiLoading}
                        placeholder={
                          "Вставьте переписку, объявление или просто напишите:\n\nПример: «Вадим, 89095719524, Краснодар, Уральская 100, шпаклёвка стен и потолков 120 кв.м, по 250р/м2, с Авито»"
                        }
                        className={`w-full h-28 px-3 py-2.5 rounded-xl border border-violet-200 bg-white text-sm resize-none outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 transition-all placeholder:text-gray-300 ${
                          aiLoading ? "opacity-50" : ""
                        }`}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                            runAiParse();
                        }}
                      />
                      {aiLoading && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs text-violet-600">
                            <span className="flex items-center gap-1.5">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              {aiWaitLonger
                                ? "ИИ думает дольше обычного…"
                                : "Анализирую текст…"}
                            </span>
                            <span>{Math.round(aiProgress)}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-violet-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-violet-500 rounded-full transition-all duration-300"
                              style={{ width: `${Math.min(aiProgress, 100)}%` }}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (aiProgressInterval.current)
                                clearInterval(aiProgressInterval.current);
                              setAiLoading(false);
                              setAiProgress(0);
                            }}
                            className="text-xs text-violet-500 hover:text-violet-700 underline"
                          >
                            Отменить
                          </button>
                        </div>
                      )}
                      {!aiLoading && (
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-gray-400">
                            Ctrl+Enter для отправки
                          </span>
                          <button
                            type="button"
                            onClick={runAiParse}
                            disabled={!aiText.trim()}
                            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all shadow-sm shadow-violet-300"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            Заполнить
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4 space-y-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Клиент
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">
                    Имя клиента
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      required
                      value={formData.clientName}
                      onChange={(e) =>
                        setFormData({ ...formData, clientName: e.target.value })
                      }
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm transition-all"
                      placeholder="Иван Иванов"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">
                    Телефон
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      required
                      value={formData.clientPhone}
                      onChange={(e) => {
                        setFormData({ ...formData, clientPhone: e.target.value });
                        checkPhone(e.target.value);
                      }}
                      className={`w-full pl-9 pr-3 py-2.5 rounded-xl border bg-white focus:ring-2 outline-none text-sm transition-all ${
                        phoneCheckResult?.duplicate
                          ? "border-orange-400 focus:border-orange-400 focus:ring-orange-200"
                          : "border-gray-200 focus:border-primary focus:ring-primary/15"
                      }`}
                      placeholder="+7 999 000-00-00"
                    />
                  </div>
                  {phoneCheckResult?.duplicate && phoneCheckResult.existing && (
                    <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-orange-500 flex-shrink-0 mt-0.5" />
                      <div className="text-xs text-orange-700">
                        <p className="font-semibold mb-1">
                          Этот телефон уже есть в базе:
                        </p>
                        {phoneCheckResult.existing.map((e) => (
                          <p key={e.id}>
                            · #{e.id} {e.clientName}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">
                    Город
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <select
                      required
                      value={formData.city}
                      onChange={(e) =>
                        setFormData({ ...formData, city: e.target.value })
                      }
                      className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm appearance-none transition-all"
                    >
                      <option value="">Выберите город</option>
                      {cities?.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">
                    Адрес объекта
                  </label>
                  <input
                    required
                    value={formData.district}
                    onChange={(e) =>
                      setFormData({ ...formData, district: e.target.value })
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm transition-all"
                    placeholder="ул. Ленина, 10"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                    Дата выезда
                    <span className="text-gray-400 font-normal text-xs ml-auto">
                      необязательно
                    </span>
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.scheduledAt}
                    onChange={(e) =>
                      setFormData({ ...formData, scheduledAt: e.target.value })
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-gray-400" />
                    Источник
                    <span className="text-gray-400 font-normal text-xs ml-auto">
                      необязательно
                    </span>
                  </label>
                  <div className="relative">
                    <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <select
                      value={formData.source}
                      onChange={(e) =>
                        setFormData({ ...formData, source: e.target.value })
                      }
                      className="w-full px-3 pr-8 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm appearance-none transition-all"
                    >
                      <option value="">Выберите источник</option>
                      {SOURCE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Payment model toggle */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Модель оплаты
                </label>
                <div className="flex rounded-xl border border-gray-200 bg-white p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, paymentModel: "token" })}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      formData.paymentModel === "token"
                        ? "bg-primary text-white shadow-sm"
                        : "text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    По токенам
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, paymentModel: "commission" })}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      formData.paymentModel === "commission"
                        ? "bg-primary text-white shadow-sm"
                        : "text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    Обычная комиссия
                  </button>
                </div>
              </div>
            </div>

            {/* Services table */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Услуги
                </p>
                {(totalArea > 0 || totalEstimate > 0) && (
                  <div className="flex items-center gap-3 text-xs">
                    {totalArea > 0 && (
                      <span className="text-gray-500">
                        Итого:{" "}
                        <b className="text-gray-700">{totalArea} м²</b>
                      </span>
                    )}
                    {totalEstimate > 0 && (
                      <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 font-semibold px-2.5 py-0.5 rounded-full border border-emerald-100">
                        ≈ {totalEstimate.toLocaleString("ru-RU")} ₽
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white">
                <div
                  className="grid items-center bg-gray-50 border-b border-gray-100 px-3 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide"
                  style={{ gridTemplateColumns: "1fr 80px 100px 90px 32px" }}
                >
                  <span>Тип услуги</span>
                  <span className="text-center">м²</span>
                  <span className="text-center">₽/м²</span>
                  <span className="text-right pr-2">Итого</span>
                  <span />
                </div>
                <div className="divide-y divide-gray-100">
                  {serviceRows.map((row, i) => {
                    const rowTotal =
                      (parseFloat(row.area) || 0) *
                      (parseFloat(row.pricePerM2) || 0);
                    return (
                      <div
                        key={i}
                        className="group px-3 py-1.5"
                        style={{
                          gridTemplateColumns: "1fr 80px 100px 90px 32px",
                          display: "grid",
                          alignItems: "center",
                          gap: 0,
                        }}
                      >
                        <div className="relative">
                          <select
                            required
                            value={row.type}
                            onChange={(e) => updateRow(i, "type", e.target.value)}
                            className="w-full pl-2 pr-6 py-2 text-sm rounded-lg border border-transparent bg-transparent hover:bg-gray-50 hover:border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:bg-white outline-none appearance-none transition-all cursor-pointer"
                          >
                            <option value="">Выберите...</option>
                            {services?.map((s) => (
                              <option key={s.id} value={s.name}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        </div>
                        <input
                          required
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={row.area}
                          onChange={(e) => updateRow(i, "area", e.target.value)}
                          placeholder="—"
                          className="px-2 py-2 text-sm rounded-lg border border-transparent bg-transparent hover:bg-gray-50 hover:border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:bg-white outline-none text-center transition-all w-full"
                        />
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={row.pricePerM2}
                            onChange={(e) =>
                              updateRow(i, "pricePerM2", e.target.value)
                            }
                            placeholder="—"
                            className="w-full pl-2 pr-5 py-2 text-sm rounded-lg border border-transparent bg-transparent hover:bg-gray-50 hover:border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:bg-white outline-none text-center transition-all"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">
                            ₽
                          </span>
                        </div>
                        <div className="text-right pr-2">
                          {rowTotal > 0 ? (
                            <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                              {rowTotal.toLocaleString("ru-RU")} ₽
                            </span>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeRow(i)}
                          disabled={serviceRows.length === 1}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 disabled:opacity-0 disabled:pointer-events-none transition-all mx-auto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-dashed border-gray-200">
                  <button
                    type="button"
                    onClick={addRow}
                    className="w-full py-3 flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-primary hover:bg-primary/5 transition-all"
                  >
                    <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
                      <Plus className="w-3 h-3" />
                    </div>
                    Добавить услугу
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Комментарий
                </label>
                <textarea
                  value={formData.comment}
                  onChange={(e) =>
                    setFormData({ ...formData, comment: e.target.value })
                  }
                  rows={4}
                  placeholder="Дополнительная информация..."
                  className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:bg-white outline-none resize-none text-sm transition-all h-full min-h-[100px]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                  <Images className="w-3.5 h-3.5" />
                  Фотографии
                  {photosPaths.length > 0 && (
                    <span className="ml-auto text-primary font-bold">
                      {photosPaths.length}
                    </span>
                  )}
                </label>
                <PhotoUploader
                  value={photosPaths}
                  onChange={setPhotosPaths}
                  maxPhotos={8}
                />
              </div>
            </div>
          </div>
          <div className="px-7 py-5 border-t border-gray-100 flex items-center justify-between flex-shrink-0 bg-gray-50/50 rounded-b-3xl">
            {totalEstimate > 0 ? (
              <div className="text-sm">
                <span className="text-gray-500">Смета:</span>
                <span className="ml-2 font-bold text-emerald-600 text-base">
                  {totalEstimate.toLocaleString("ru-RU")} ₽
                </span>
                {totalArea > 0 && (
                  <span className="ml-2 text-gray-400 text-xs">
                    {totalArea} м²
                  </span>
                )}
              </div>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  resetForm();
                }}
                className="px-5 py-2.5 rounded-xl font-medium text-gray-500 hover:bg-gray-200 transition-colors text-sm"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={
                  createPending || serviceRows.every((r) => !r.type || !r.area)
                }
                className="px-6 py-2.5 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 flex items-center gap-2 disabled:opacity-50 transition-all text-sm shadow-sm shadow-primary/30"
              >
                {createPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Создать заявку
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
