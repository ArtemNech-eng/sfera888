import { useState, useRef } from "react";
import BottomNav from "@/components/BottomNav";

interface LineItem { description: string; price: number; unit?: string; }
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
  const [step, setStep] = useState<"form" | "analyzing" | "result" | "submitted" | "limited">("form");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [limitError, setLimitError] = useState("");
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
      if (!r.ok) {
        if (d.limitExceeded) {
          setLimitError(d.error || "Лимит оценок исчерпан");
          setStep("limited");
        } else {
          setError(d.error || "Ошибка при анализе");
          setStep("form");
        }
        return;
      }
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

  const lastToken = typeof localStorage !== "undefined" ? localStorage.getItem("lastSmetaToken") : null;

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif", height: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden", background: "#F5FAFA" }}>
      {/* Topbar */}
      <div style={{ background: "#fff", borderBottom: "1.5px solid #D0EDEB", display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", paddingTop: "calc(14px + env(safe-area-inset-top, 0px))", flexShrink: 0, boxShadow: "0 1px 8px rgba(13,148,136,.06)" }}>
        <div style={{ width: 32, height: 32, background: "linear-gradient(135deg,#0D9488,#14B8A6)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#0D2B28" }}>AI Оценка стоимости</div>
          <div style={{ fontSize: 11, color: "#4A6B69" }}>Честный мастер · Бесплатно</div>
        </div>
      </div>
      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 16 }}>

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
            style={{ padding: "12px 24px", background: "#0D9488", color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Оценить ещё один объект
          </button>
        </div>
      ) : step === "analyzing" ? (
        <div style={{ maxWidth: 540, width: "calc(100% - 24px)", margin: "80px auto", textAlign: "center" }}>
          <div style={{ width: 60, height: 60, border: "4px solid #99F6E4", borderTopColor: "#0D9488", borderRadius: "50%", margin: "0 auto 24px", animation: "spin 0.9s linear infinite" }} />
          <div style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 8 }}>AI анализирует фотографию...</div>
          <div style={{ fontSize: 14, color: "#6b7280" }}>Составляем смету на основе вашего запроса</div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : step === "result" && result ? (
        <div style={{ maxWidth: 540, width: "calc(100% - 24px)", margin: "20px auto 0" }}>
          {/* AI estimate card */}
          <div style={{ background: "#fff", borderRadius: 20, overflow: "hidden", boxShadow: "0 2px 20px rgba(0,0,0,.08)", marginBottom: 16 }}>
            <div style={{ background: "linear-gradient(135deg, #0D9488, #0D9488)", padding: "20px 22px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,.7)", marginBottom: 8 }}>AI Оценка стоимости</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.8)", marginBottom: 6 }}>{result.serviceType} · {result.city}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 36, fontWeight: 800, color: "#fff" }}>{fmt(result.totalMin)}</span>
                <span style={{ fontSize: 20, color: "rgba(255,255,255,.7)" }}>–</span>
                <span style={{ fontSize: 36, fontWeight: 800, color: "#fff" }}>{fmt(result.totalMax)}</span>
                <span style={{ fontSize: 18, color: "rgba(255,255,255,.7)" }}>₽</span>
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)", marginTop: 4 }}>ориентировочная стоимость по рынку</div>
            </div>

            <div style={{ padding: "18px 20px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af", marginBottom: 12 }}>Перечень работ</div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
                {result.lineItems.map((item, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, padding: "10px 14px", borderBottom: i < result.lineItems.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                    <span style={{ fontSize: 13, color: "#374151", flex: 1, lineHeight: 1.4 }}>{item.description}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#111827", whiteSpace: "nowrap" }}>
                      {item.unit && item.unit !== "итого"
                        ? `от ${fmt(Number(item.price))} ₽/${item.unit}`
                        : `${fmt(Number(item.price))} ₽`}
                    </span>
                  </div>
                ))}
              </div>
              {result.notes && (
                <div style={{ background: "#F0FDFA", border: "1px solid #99F6E4", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1e40af", marginBottom: 4 }}>Комментарий AI</div>
                  <div style={{ fontSize: 13, color: "#0F4C45", lineHeight: 1.5 }}>{result.notes}</div>
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
              style={{ height: 52, background: submitting ? "#6b7280" : "#0D9488", color: "#fff", border: "none", borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
              {submitting ? "Отправляем..." : "Вызвать мастера"}
            </button>
            <button onClick={() => { setStep("form"); setResult(null); }}
              style={{ height: 44, background: "transparent", color: "#6b7280", border: "1.5px solid #e5e7eb", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Изменить параметры
            </button>
          </div>
        </div>
      ) : step === "limited" ? (
        <div style={{ maxWidth: 540, width: "calc(100% - 24px)", margin: "60px auto 0", textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 20 }}>⏳</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111827", marginBottom: 12 }}>Лимит на сегодня исчерпан</h2>
          <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.7, marginBottom: 24 }}>{limitError}</p>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "16px 20px", marginBottom: 24, textAlign: "left" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 10 }}>Что можно сделать прямо сейчас:</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ fontSize: 18 }}>📞</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>Позвонить напрямую</div>
                  <a href="tel:+79892860863" style={{ fontSize: 13, color: "#0D9488", textDecoration: "none" }}>+7 989 286-08-63</a>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ fontSize: 18 }}>💬</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>Написать мастеру</div>
                  <div style={{ fontSize: 13, color: "#6b7280" }}>Откройте смету — там есть чат с поддержкой</div>
                </div>
              </div>
            </div>
          </div>
          <button onClick={() => { setStep("form"); setLimitError(""); }}
            style={{ padding: "12px 28px", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            ← Вернуться к форме
          </button>
        </div>
      ) : (
        /* Form step */
        <div style={{ maxWidth: 540, width: "calc(100% - 24px)", margin: "20px auto 0" }}>
          {/* Hero */}
          <div style={{ background: "linear-gradient(135deg, #0F4C45, #0D9488)", borderRadius: 20, padding: "24px 22px", marginBottom: 16, color: "#fff" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📸</div>
            <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, lineHeight: 1.3 }}>Узнайте стоимость работ за 30 секунд</h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,.8)", lineHeight: 1.6 }}>Сфотографируйте проблему, опишите что нужно сделать — AI составит смету и мы подберём подходящего мастера</p>
          </div>

          <div style={{ background: "#fff", borderRadius: 20, padding: "20px 18px", boxShadow: "0 2px 12px rgba(0,0,0,.06)" }}>
            {/* Photo upload */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Фото помещения / проблемы</label>
              <div onClick={() => fileRef.current?.click()}
                style={{ border: `2px dashed ${photo ? "#0D9488" : "#d1d5db"}`, borderRadius: 14, padding: 20, cursor: "pointer", textAlign: "center", background: photo ? "#F0FDFA" : "#fafafa", transition: "all 0.15s" }}>
                {photoPreview ? (
                  <img src={photoPreview} alt="preview" style={{ maxWidth: "100%", maxHeight: 200, objectFit: "contain", borderRadius: 10 }} />
                ) : (
                  <>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>📷</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#0D9488" }}>Прикрепить фото</div>
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
                    style={{ padding: "7px 12px", borderRadius: 20, fontSize: 13, border: `1.5px solid ${serviceType === s ? "#0D9488" : "#e5e7eb"}`, background: serviceType === s ? "#F0FDFA" : "#fff", color: serviceType === s ? "#0D9488" : "#374151", fontWeight: serviceType === s ? 600 : 400, cursor: "pointer", fontFamily: "inherit" }}>
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
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Адрес</label>
                <input value={district} onChange={e => setDistrict(e.target.value)} placeholder="ул. Ленина, 10"
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
              style={{ width: "100%", height: 52, background: "#0D9488", color: "#fff", border: "none", borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              Оценить стоимость
            </button>
            <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", marginTop: 10 }}>AI анализирует запрос · Бесплатно · Без обязательств</p>
          </div>
        </div>
      )}
      </div>
      <BottomNav token={lastToken ?? undefined} active="estimate" staticMode />
    </div>
  );
}
