import { useState, useRef } from "react";

const TOPBAR: React.CSSProperties = {
  background: "#111827", display: "flex", alignItems: "center",
  gap: 10, padding: "14px 20px",
  position: "sticky", top: 0, zIndex: 50,
};

interface LineItem { description: string; price: number; }
interface EstimateResult {
  lineItems: LineItem[];
  totalMin: number;
  totalMax: number;
  notes: string;
  photoUrl: string | null;
  clientName: string;
  clientPhone: string;
  city: string;
  district: string;
  serviceType: string;
  description: string;
}

function fmt(n: number) { return n.toLocaleString("ru-RU"); }

const SERVICES = [
  "Укладка плитки", "Поклейка обоев", "Покраска стен", "Монтаж ламината",
  "Штукатурка стен", "Электромонтаж", "Сантехника", "Натяжные потолки",
  "Комплексный ремонт", "Монтаж гипсокартона", "Демонтажные работы",
  "Монтаж дверей", "Отделка балкона", "Другое",
];

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Estimate() {
  const [step, setStep] = useState<"form" | "analyzing" | "result" | "submitted">("form");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<EstimateResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handlePhoto = (f: File | null) => {
    setPhoto(f);
    if (f) setPhotoPreview(URL.createObjectURL(f));
    else setPhotoPreview(null);
  };

  const analyze = async () => {
    setError("");
    if (!clientPhone.trim()) { setError("Введите номер телефона"); return; }
    if (!city.trim()) { setError("Введите город"); return; }
    if (!serviceType.trim()) { setError("Выберите тип работ"); return; }

    setStep("analyzing");
    try {
      const fd = new FormData();
      fd.append("clientName", clientName.trim() || "Клиент");
      fd.append("clientPhone", clientPhone.trim());
      fd.append("city", city.trim());
      fd.append("district", district.trim());
      fd.append("serviceType", serviceType.trim());
      fd.append("description", description.trim());
      if (photo) fd.append("photo", photo);

      const r = await fetch("/api/client/estimate", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "Ошибка при анализе"); setStep("form"); return; }
      setResult(d);
      setStep("result");
    } catch {
      setError("Нет соединения. Попробуйте ещё раз.");
      setStep("form");
    }
  };

  const submit = async () => {
    if (!result) return;
    setSubmitting(true);
    try {
      const r = await fetch("/api/client/estimate/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: result.clientName,
          clientPhone: result.clientPhone,
          city: result.city,
          district: result.district,
          serviceType: result.serviceType,
          description: result.description,
          photoUrl: result.photoUrl,
        }),
      });
      if (r.ok) setStep("submitted");
      else setError("Ошибка отправки. Попробуйте ещё раз.");
    } catch {
      setError("Нет соединения.");
    }
    setSubmitting(false);
  };

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", background: "#eef0f5", minHeight: "100vh", paddingBottom: 40 }}>
      {/* Topbar */}
      <div style={TOPBAR}>
        <a href={`${BASE}/`} onClick={e => { e.preventDefault(); window.location.href = `${BASE}/`; }}
          style={{ color: "#9ca3af", display: "flex", alignItems: "center" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </a>
        <div style={{ width: 30, height: 30, background: "#2563eb", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>Узнать стоимость</span>
      </div>

      {step === "submitted" ? (
        <div style={{ maxWidth: 540, width: "calc(100% - 24px)", margin: "40px auto", background: "#fff", borderRadius: 20, padding: 32, textAlign: "center", boxShadow: "0 2px 20px rgba(0,0,0,.08)" }}>
          <div style={{ fontSize: 72, marginBottom: 20 }}>🎉</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111827", marginBottom: 12 }}>Заявка отправлена!</h2>
          <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, marginBottom: 24 }}>
            Мы разослали вашу заявку мастерам. Ожидайте звонка — мастер свяжется с вами в ближайшее время.
          </p>
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 14, padding: "16px 20px", marginBottom: 20, textAlign: "left" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#166534", marginBottom: 8 }}>Что происходит сейчас:</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {["✓ Заявка создана в системе", "✓ Мастера получили уведомление", "⏳ Ожидайте звонка от мастера"].map((t, i) => (
                <div key={i} style={{ fontSize: 13, color: "#166534" }}>{t}</div>
              ))}
            </div>
          </div>
          <button onClick={() => { setStep("form"); setResult(null); setPhoto(null); setPhotoPreview(null); setDescription(""); }}
            style={{ padding: "12px 24px", background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Оценить ещё один объект
          </button>
        </div>
      ) : step === "analyzing" ? (
        <div style={{ maxWidth: 540, width: "calc(100% - 24px)", margin: "80px auto", textAlign: "center" }}>
          <div style={{ width: 60, height: 60, border: "4px solid #bfdbfe", borderTopColor: "#1d4ed8", borderRadius: "50%", margin: "0 auto 24px", animation: "spin 0.9s linear infinite" }} />
          <div style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 8 }}>AI анализирует фотографию...</div>
          <div style={{ fontSize: 14, color: "#6b7280" }}>Составляем смету на основе вашего запроса</div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : step === "result" && result ? (
        <div style={{ maxWidth: 540, width: "calc(100% - 24px)", margin: "20px auto 0" }}>
          {/* AI estimate card */}
          <div style={{ background: "#fff", borderRadius: 20, overflow: "hidden", boxShadow: "0 2px 20px rgba(0,0,0,.08)", marginBottom: 16 }}>
            <div style={{ background: "linear-gradient(135deg, #1d4ed8, #2563eb)", padding: "20px 22px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,.7)", marginBottom: 8 }}>AI Оценка стоимости</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.8)", marginBottom: 6 }}>{result.serviceType} · {result.city}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 36, fontWeight: 800, color: "#fff" }}>{fmt(result.totalMin)}</span>
                <span style={{ fontSize: 20, color: "rgba(255,255,255,.7)" }}>–</span>
                <span style={{ fontSize: 36, fontWeight: 800, color: "#fff" }}>{fmt(result.totalMax)}</span>
                <span style={{ fontSize: 18, color: "rgba(255,255,255,.7)" }}>₽</span>
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)", marginTop: 4 }}>приблизительная стоимость работ</div>
            </div>

            <div style={{ padding: "18px 20px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af", marginBottom: 12 }}>Перечень работ</div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
                {result.lineItems.map((item, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, padding: "10px 14px", borderBottom: i < result.lineItems.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                    <span style={{ fontSize: 13, color: "#374151", flex: 1, lineHeight: 1.4 }}>{item.description}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#111827", whiteSpace: "nowrap" }}>{fmt(Number(item.price))} ₽</span>
                  </div>
                ))}
              </div>
              {result.notes && (
                <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1e40af", marginBottom: 4 }}>Комментарий AI</div>
                  <div style={{ fontSize: 13, color: "#1e3a8a", lineHeight: 1.5 }}>{result.notes}</div>
                </div>
              )}
              <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: "12px 14px", marginBottom: 4, fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
                ⚠ Это предварительная оценка. Точная стоимость определяется после осмотра объекта мастером.
              </div>
            </div>
          </div>

          {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", marginBottom: 12, color: "#b91c1c", fontSize: 13 }}>{error}</div>}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button onClick={submit} disabled={submitting}
              style={{ height: 52, background: submitting ? "#6b7280" : "#1d4ed8", color: "#fff", border: "none", borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
              {submitting ? "Отправляем..." : "Вызвать мастера"}
            </button>
            <button onClick={() => { setStep("form"); setResult(null); }}
              style={{ height: 44, background: "transparent", color: "#6b7280", border: "1.5px solid #e5e7eb", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Изменить параметры
            </button>
          </div>
        </div>
      ) : (
        /* Form step */
        <div style={{ maxWidth: 540, width: "calc(100% - 24px)", margin: "20px auto 0" }}>
          {/* Hero */}
          <div style={{ background: "linear-gradient(135deg, #1e3a8a, #1d4ed8)", borderRadius: 20, padding: "24px 22px", marginBottom: 16, color: "#fff" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📸</div>
            <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, lineHeight: 1.3 }}>Узнайте стоимость работ за 30 секунд</h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,.8)", lineHeight: 1.6 }}>Сфотографируйте проблему, опишите что нужно сделать — AI составит смету и мы подберём подходящего мастера</p>
          </div>

          <div style={{ background: "#fff", borderRadius: 20, padding: "20px 18px", boxShadow: "0 2px 12px rgba(0,0,0,.06)" }}>
            {/* Photo upload */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Фото помещения / проблемы</label>
              <div onClick={() => fileRef.current?.click()}
                style={{ border: `2px dashed ${photo ? "#1d4ed8" : "#d1d5db"}`, borderRadius: 14, padding: 20, cursor: "pointer", textAlign: "center", background: photo ? "#eff6ff" : "#fafafa", transition: "all 0.15s" }}>
                {photoPreview ? (
                  <img src={photoPreview} alt="preview" style={{ maxWidth: "100%", maxHeight: 200, objectFit: "contain", borderRadius: 10 }} />
                ) : (
                  <>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>📷</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1d4ed8" }}>Прикрепить фото</div>
                    <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>Не обязательно, но поможет точнее оценить</div>
                  </>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handlePhoto(e.target.files?.[0] || null)} />
              {photo && <button onClick={() => handlePhoto(null)} style={{ marginTop: 6, fontSize: 12, color: "#9ca3af", background: "none", border: "none", cursor: "pointer", padding: 0 }}>✕ Удалить фото</button>}
            </div>

            {/* Service type */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Тип работ <span style={{ color: "#ef4444" }}>*</span></label>
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
                {SERVICES.map(s => (
                  <button key={s} onClick={() => setServiceType(s)}
                    style={{ padding: "7px 12px", borderRadius: 20, fontSize: 13, border: `1.5px solid ${serviceType === s ? "#1d4ed8" : "#e5e7eb"}`, background: serviceType === s ? "#eff6ff" : "#fff", color: serviceType === s ? "#1d4ed8" : "#374151", fontWeight: serviceType === s ? 600 : 400, cursor: "pointer", fontFamily: "inherit" }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Описание</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Опишите что нужно сделать, площадь помещения, особые требования..."
                rows={3}
                style={{ width: "100%", border: "1.5px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", fontSize: 14, fontFamily: "inherit", resize: "none", outline: "none", color: "#111827", boxSizing: "border-box" as const }} />
            </div>

            {/* City */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Город <span style={{ color: "#ef4444" }}>*</span></label>
                <input value={city} onChange={e => setCity(e.target.value)} placeholder="Ставрополь"
                  style={{ width: "100%", height: 44, border: "1.5px solid #e5e7eb", borderRadius: 10, padding: "0 12px", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const, color: "#111827" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Район</label>
                <input value={district} onChange={e => setDistrict(e.target.value)} placeholder="Промышленный"
                  style={{ width: "100%", height: 44, border: "1.5px solid #e5e7eb", borderRadius: 10, padding: "0 12px", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const, color: "#111827" }} />
              </div>
            </div>

            {/* Contact */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Имя</label>
              <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Ваше имя" autoComplete="name"
                style={{ width: "100%", height: 44, border: "1.5px solid #e5e7eb", borderRadius: 10, padding: "0 14px", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const, color: "#111827", marginBottom: 10 }} />
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Телефон <span style={{ color: "#ef4444" }}>*</span></label>
              <input value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="+7 999 000 00 00" type="tel" autoComplete="tel"
                style={{ width: "100%", height: 44, border: "1.5px solid #e5e7eb", borderRadius: 10, padding: "0 14px", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const, color: "#111827" }} />
            </div>

            {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", marginBottom: 12, color: "#b91c1c", fontSize: 13 }}>{error}</div>}

            <button onClick={analyze}
              style={{ width: "100%", height: 52, background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              Оценить стоимость
            </button>
            <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", marginTop: 10 }}>AI анализирует запрос · Бесплатно · Без обязательств</p>
          </div>
        </div>
      )}
    </div>
  );
}
