import { useState, useEffect } from "react";
import { PhotoUploader } from "@/components/photo-uploader";
import { SOURCE_OPTIONS } from "./LeadDetailPanel";
import {
  Loader2, Plus, Trash2, User, Phone, MapPin, ChevronDown,
  Images, X, Calendar, Save,
} from "lucide-react";

interface ServiceRow {
  type: string;
  area: string;
  pricePerM2: string;
}

interface LeadRow {
  id: number;
  clientName: string;
  clientPhone: string;
  city: string;
  district: string | null;
  serviceType: string;
  area: number;
  services: Array<{ type: string; area: number; pricePerM2: number }> | null;
  scheduledAt: string | null;
  comment: string | null;
  source: string | null;
  status: string;
  photos: string[] | null;
}

interface EditLeadModalProps {
  lead: LeadRow;
  onClose: () => void;
  onSave: (leadId: number, body: any) => void;
  savePending: boolean;
  cities?: { id: number; name: string }[];
  services?: { id: number; name: string }[];
}

export default function EditLeadModal({
  lead,
  onClose,
  onSave,
  savePending,
  cities,
  services,
}: EditLeadModalProps) {
  const [formData, setFormData] = useState({
    clientName: "",
    clientPhone: "",
    city: "",
    district: "",
    comment: "",
    scheduledAt: "",
    source: "",
    status: "",
  });
  const [serviceRows, setServiceRows] = useState<ServiceRow[]>([
    { type: "", area: "", pricePerM2: "" },
  ]);
  const [photosPaths, setPhotosPaths] = useState<string[]>([]);

  useEffect(() => {
    if (!lead) return;
    setFormData({
      clientName: lead.clientName,
      clientPhone: lead.clientPhone,
      city: lead.city,
      district: lead.district ?? "",
      comment: lead.comment ?? "",
      scheduledAt: lead.scheduledAt ? lead.scheduledAt.slice(0, 16) : "",
      source: lead.source ?? "",
      status: lead.status,
    });
    setServiceRows(
      lead.services && lead.services.length > 0
        ? lead.services.map((s) => ({
            type: s.type,
            area: String(s.area),
            pricePerM2: String(s.pricePerM2 ?? ""),
          }))
        : [{ type: lead.serviceType, area: String(lead.area), pricePerM2: "" }]
    );
    setPhotosPaths(lead.photos ?? []);
  }, [lead]);

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
    const srvs = validRows.map((r) => ({
      type: r.type,
      area: parseFloat(r.area),
      pricePerM2: parseFloat(r.pricePerM2) || 0,
    }));
    const body: any = {
      ...formData,
      services: srvs,
      photos: photosPaths,
      scheduledAt: formData.scheduledAt || null,
      source: formData.source || null,
      comment: formData.comment || null,
    };
    onSave(lead.id, body);
  };

  if (!lead) return null;

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
              <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center">
                <Save className="w-4 h-4 text-amber-600" />
              </div>
              <h2 className="text-xl font-display font-bold text-gray-900">
                Редактировать заявку #{lead.id}
              </h2>
            </div>
            <p className="text-sm text-gray-400 ml-10">
              Изменения сохранятся после нажатия «Сохранить»
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col flex-1 overflow-y-auto"
        >
          <div className="px-7 pb-6 space-y-5">
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
                      onChange={(e) =>
                        setFormData({ ...formData, clientPhone: e.target.value })
                      }
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm transition-all"
                      placeholder="+7 999 000-00-00"
                    />
                  </div>
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
                    Район
                  </label>
                  <input
                    required
                    value={formData.district}
                    onChange={(e) =>
                      setFormData({ ...formData, district: e.target.value })
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm transition-all"
                    placeholder="Центральный"
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
                  <label className="text-sm font-medium text-gray-700">
                    Источник
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
                      <option value="">Не указан</option>
                      {SOURCE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Статус заявки
                </label>
                <div className="relative">
                  <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value })
                    }
                    className="w-full px-3 pr-8 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm appearance-none transition-all"
                  >
                    <option value="new">Новая</option>
                    <option value="processing">В обработке</option>
                    <option value="sent_to_work">Отправлена в работу</option>
                    <option value="non_target">Нецелевая</option>
                    <option value="client_refusal">Отказ клиента</option>
                  </select>
                </div>
              </div>
            </div>
            {/* Services */}
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
                        className="px-3 py-1.5"
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
                          className="w-full pl-2 pr-5 py-2 text-sm rounded-lg border border-transparent bg-transparent hover:bg-gray-50 hover:border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:bg-white outline-none text-center transition-all"
                          placeholder="0"
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
                            className="w-full pl-2 pr-5 py-2 text-sm rounded-lg border border-transparent bg-transparent hover:bg-gray-50 hover:border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:bg-white outline-none text-center transition-all"
                            placeholder="0"
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
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl font-medium text-gray-500 hover:bg-gray-200 transition-colors text-sm"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={savePending || serviceRows.every((r) => !r.type || !r.area)}
                className="px-6 py-2.5 bg-amber-500 text-white rounded-xl font-semibold hover:bg-amber-600 flex items-center gap-2 disabled:opacity-50 transition-all text-sm shadow-sm shadow-amber-500/30"
              >
                {savePending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Сохранить
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
