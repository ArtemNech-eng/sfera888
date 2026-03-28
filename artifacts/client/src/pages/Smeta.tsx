import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";

interface LineItem { description: string; price: number; }
interface ReceiptData {
  id: number;
  clientName: string;
  clientPhone: string;
  city: string;
  district: string | null;
  serviceType: string;
  prepaymentAmount: number;
  totalAmount: number;
  lineItems: LineItem[];
  notes: string | null;
  masterName: string;
  masterPhone: string;
  isClientSubmitted: boolean;
  isOperatorConfirmed: boolean;
  createdAt: string;
}

const s = {
  topbar: { background: "#111827", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "14px 24px" } as React.CSSProperties,
  topbarIcon: { width: 30, height: 30, background: "#2563eb", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" } as React.CSSProperties,
  card: { maxWidth: 540, width: "calc(100% - 24px)", margin: "24px auto 0", background: "#fff", borderRadius: 20, boxShadow: "0 2px 20px rgba(0,0,0,.08), 0 0 0 1px rgba(0,0,0,.04)", overflow: "hidden" } as React.CSSProperties,
};

export default function Smeta() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [clientName, setClientName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/receipt/${token}/data`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then(d => { if (d) { setData(d); setLoading(false); } })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [token]);

  const handleFile = (f: File | null) => {
    setFile(f);
    if (f) setPreviewUrl(URL.createObjectURL(f));
    else setPreviewUrl(null);
  };

  const copyPhone = () => {
    navigator.clipboard.writeText("79892860863").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleSubmit = async () => {
    setFormError("");
    if (!clientName.trim()) { setFormError("Введите ваше ФИО"); return; }
    if (clientName.trim().split(" ").filter(w => w.length > 1).length < 2) {
      setFormError("Введите полное ФИО (Фамилия Имя Отчество)"); return;
    }
    if (!file) { setFormError("Прикрепите скриншот оплаты"); return; }
    setSubmitting(true);
    const fd = new FormData();
    fd.append("clientName", clientName.trim());
    fd.append("screenshot", file);
    try {
      const r = await fetch(`/api/receipt/${token}/confirm`, { method: "POST", body: fd });
      if (r.ok) {
        setSubmitted(true);
        setData(d => d ? { ...d, isClientSubmitted: true } : d);
      } else {
        setFormError("Ошибка при отправке. Попробуйте ещё раз.");
      }
    } catch {
      setFormError("Нет соединения. Проверьте интернет и попробуйте снова.");
    }
    setSubmitting(false);
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#eef0f5", fontFamily: "Inter, sans-serif" }}>
      <div style={{ textAlign: "center", color: "#6b7280" }}>
        <div style={{ width: 40, height: 40, border: "3px solid #bfdbfe", borderTopColor: "#1d4ed8", borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
        Загрузка...
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (notFound || !data) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#eef0f5", fontFamily: "Inter, sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🔍</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111827", marginBottom: 8 }}>Смета не найдена</h2>
        <p style={{ color: "#6b7280", fontSize: 14 }}>Ссылка недействительна или устарела</p>
      </div>
    </div>
  );

  const fmt = (n: number) => n.toLocaleString("ru-RU");
  const date = new Date(data.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const district = data.district ? `, ${data.district}` : "";
  const remainder = data.totalAmount - data.prepaymentAmount;
  const isSubmitted = data.isClientSubmitted || submitted;
  const isConfirmed = data.isOperatorConfirmed;

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", background: "#eef0f5", minHeight: "100vh", paddingBottom: 60 }}>

      {/* ── Topbar ── */}
      <div style={s.topbar}>
        <div style={s.topbarIcon}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>Честный мастер</span>
        <span style={{ fontSize: 12, color: "#6b7280" }}>· sfera-project.digital</span>
      </div>

      {/* ── Main card ── */}
      <div style={s.card}>

        {/* Header */}
        <div style={{ background: "#fff", padding: "22px 22px 18px", borderBottom: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 16 }}>
            Смета №{data.id} · Честный мастер
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Сумма брони</div>
          <div style={{ fontSize: 48, fontWeight: 800, color: "#111827", letterSpacing: -2, lineHeight: 1 }}>
            {fmt(data.prepaymentAmount)} <span style={{ fontSize: 26, fontWeight: 600, color: "#6b7280" }}>₽</span>
          </div>
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 8 }}>Итого по смете: {fmt(data.totalAmount)} ₽</div>
          <div style={{ marginTop: 10, fontSize: 12, color: "#9ca3af", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const }}>
            <span>{data.city}{district}</span>
            <span style={{ width: 3, height: 3, background: "#d1d5db", borderRadius: "50%", display: "inline-block" }} />
            <span>{data.serviceType}</span>
            <span style={{ width: 3, height: 3, background: "#d1d5db", borderRadius: "50%", display: "inline-block" }} />
            <span>{date}</span>
          </div>
          {/* Status pill */}
          {isConfirmed
            ? <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 14, padding: "6px 14px", borderRadius: 100, fontSize: 12, fontWeight: 600, background: "#d1fae5", color: "#065f46", border: "1px solid #6ee7b7" }}>✓ Оплата подтверждена</div>
            : isSubmitted
              ? <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 14, padding: "6px 14px", borderRadius: 100, fontSize: 12, fontWeight: 600, background: "#ede9fe", color: "#5b21b6", border: "1px solid #c4b5fd" }}>⏳ Проверяем оплату</div>
              : <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 14, padding: "6px 14px", borderRadius: 100, fontSize: 12, fontWeight: 600, background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a" }}>⚠ Бронь не оплачена</div>
          }
        </div>

        {/* Trust bar */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
          {[
            { emoji: "🛡", label: "Безопасная сделка", sub: "Гарантия 6 мес." },
            { emoji: "✓", label: "ИП зарегистрирован", sub: "ИНН 262409599800" },
            { emoji: "📞", label: "Поддержка", sub: "8 (989) 286-08-63" },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 8px", textAlign: "center", borderRight: i < 2 ? "1px solid #e5e7eb" : "none" }}>
              <div style={{ fontSize: 18, marginBottom: 5 }}>{item.emoji}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#374151", lineHeight: 1.3 }}>{item.label}</div>
              <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>{item.sub}</div>
            </div>
          ))}
        </div>

        {/* Status state box */}
        {isSubmitted && (
          <div style={{ margin: 16, borderRadius: 16, padding: 20, textAlign: "center", background: isConfirmed ? "linear-gradient(135deg,#ecfdf5,#d1fae5)" : "linear-gradient(135deg,#eef2ff,#e0e7ff)", border: isConfirmed ? "1px solid #a7f3d0" : "1px solid #c7d2fe" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>{isConfirmed ? "✅" : "⏳"}</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: isConfirmed ? "#065f46" : "#3730a3", marginBottom: 6 }}>{isConfirmed ? "Оплата подтверждена!" : "Заявка принята!"}</div>
            <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>
              {isConfirmed ? "Мастер закреплён за вашим заказом. Ждём вас в назначенное время." : "Оператор проверяет скриншот. Обычно это занимает до 30 минут."}
            </div>
          </div>
        )}

        {/* Body: items + totals */}
        <div style={{ padding: "20px 20px 8px" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 10 }}>Перечень работ</p>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
            {data.lineItems.map((item, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, padding: "11px 14px", borderBottom: i < data.lineItems.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                <span style={{ fontSize: 14, color: "#374151", flex: 1, lineHeight: 1.4 }}>{item.description}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#111827", whiteSpace: "nowrap" }}>{fmt(Number(item.price))} ₽</span>
              </div>
            ))}
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "11px 14px", borderBottom: "1px solid #f3f4f6" }}>
              <span style={{ fontSize: 13, color: "#6b7280" }}>Итого по смете</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{fmt(data.totalAmount)} ₽</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "11px 14px", borderBottom: "1px solid #f3f4f6", background: "#eff6ff" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#1d4ed8" }}>Бронь мастера (предоплата)</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: "#1d4ed8" }}>{fmt(data.prepaymentAmount)} ₽</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "11px 14px" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Остаток мастеру по факту работ</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#374151" }}>{fmt(remainder)} ₽</span>
            </div>
          </div>
          {data.notes && (
            <>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 10 }}>Примечание</p>
              <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
                <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.6 }}>{data.notes}</div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Combined booking + confirm block ── */}
      {!isSubmitted && (
        <div style={{ maxWidth: 540, width: "calc(100% - 24px)", margin: "16px auto 0", background: "#fff", border: "1.5px solid #bfdbfe", borderRadius: 16, overflow: "hidden" }}>
          {/* Head */}
          <div style={{ background: "#eff6ff", padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #bfdbfe" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1e3a8a" }}>Забронируйте мастера</div>
              <div style={{ fontSize: 12, color: "#3b82f6", marginTop: 2 }}>Внесите бронь {fmt(data.prepaymentAmount)} ₽ — мастер будет закреплён за вами</div>
            </div>
          </div>

          {/* Phone + motivation */}
          <div style={{ padding: "16px 18px" }}>
            <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, padding: "10px 14px", marginBottom: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, textAlign: "center" as const }}>
              {["Мастер не\nвозьмёт другой\nзаказ", "Гарантия\n6 месяцев\nна работы", "Оплата\nзащищена\nплатформой"].map((txt, i) => (
                <div key={i} style={{ fontSize: 11, color: "#0369a1", lineHeight: 1.4, borderLeft: i === 1 ? "1px solid #bae6fd" : "none", borderRight: i === 1 ? "1px solid #bae6fd" : "none", whiteSpace: "pre-line" as const }}>{txt}</div>
              ))}
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 6 }}>Переведите на номер (СБП / Альфа Банк)</div>
            <a href="tel:+79892860863" style={{ fontSize: 30, fontWeight: 800, color: "#1d4ed8", letterSpacing: -1, textDecoration: "none", display: "block", lineHeight: 1, marginBottom: 4 }}>8 989 286-08-63</a>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 14 }}>Альфа Банк · реквизиты в разделе ниже</div>
            <button onClick={copyPhone} style={{ width: "100%", padding: 13, background: "#1d4ed8", color: "#fff", fontSize: 14, fontWeight: 700, border: "none", borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" }}>
              {copied ? "✓ Скопировано!" : "Скопировать номер телефона"}
            </button>
          </div>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 18px 16px" }}>
            <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap" as const }}>Подтвердите перевод</div>
            <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
          </div>

          {/* Form */}
          <div style={{ padding: "0 18px 18px" }}>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 14, lineHeight: 1.5 }}>После перевода введите ФИО и прикрепите скриншот — оператор подтвердит бронь.</div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Ваше ФИО <span style={{ color: "#ef4444" }}>*</span></label>
              <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Иванов Иван Иванович" autoComplete="name"
                style={{ width: "100%", height: 46, border: "1.5px solid #d1d5db", borderRadius: 10, padding: "0 14px", fontSize: 15, fontFamily: "inherit", color: "#111827", background: "#fff", outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Скриншот оплаты <span style={{ color: "#ef4444" }}>*</span></label>
              <div onClick={() => fileRef.current?.click()} style={{ border: "2px dashed #d1d5db", borderRadius: 12, background: "#fff", cursor: "pointer", padding: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <div style={{ width: 36, height: 36, background: "#dbeafe", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1d4ed8" }}>{file ? `✓ ${file.name}` : "Прикрепить скриншот"}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>JPG, PNG · до 10 МБ</div>
              </div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleFile(e.target.files?.[0] || null)} />
              {previewUrl && <img src={previewUrl} alt="preview" style={{ maxWidth: "100%", borderRadius: 10, border: "1px solid #e5e7eb", marginTop: 10 }} />}
            </div>
            {formError && <div style={{ color: "#b91c1c", fontSize: 13, marginBottom: 10, padding: "10px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8 }}>{formError}</div>}
            <button onClick={handleSubmit} disabled={submitting}
              style={{ width: "100%", height: 52, background: submitting ? "#6b7280" : "#1d4ed8", color: "#fff", fontSize: 15, fontWeight: 700, border: "none", borderRadius: 12, cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit", letterSpacing: "0.01em" }}>
              {submitting ? "Отправляем..." : "Отправить подтверждение"}
            </button>
            <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", marginTop: 10 }}>Данные передаются оператору · Защищено платформой «Честный мастер»</p>
          </div>
        </div>
      )}

      {/* ── Footer card: Реквизиты + Parties ── */}
      <div style={{ maxWidth: 540, width: "calc(100% - 24px)", margin: "12px auto 0", background: "#fff", borderRadius: 20, boxShadow: "0 2px 20px rgba(0,0,0,.08), 0 0 0 1px rgba(0,0,0,.04)", overflow: "hidden" }}>
        {!isSubmitted && (
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #e5e7eb" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af", marginBottom: 10 }}>Реквизиты для перевода</div>
            {[
              { label: "Телефон (СБП)", val: "8 989 286-08-63" },
              { label: "Банк", val: "Альфа Банк · СБП" },
              { label: "Получатель", val: "ИП Коваленко Игорь Геннадьевич" },
              { label: "ИНН", val: "262409599800" },
              { label: "Назначение", val: `Бронирование по смете №${data.id}` },
            ].map((row, i, arr) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, padding: "4px 0", borderBottom: i < arr.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                <span style={{ fontSize: 12, color: "#9ca3af", whiteSpace: "nowrap", flexShrink: 0 }}>{row.label}</span>
                <span style={{ fontSize: 12, color: "#374151", fontWeight: 500, textAlign: "right" }}>{row.val}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", background: "#e5e7eb", gap: 1 }}>
          <div style={{ background: "#f9fafb", padding: "16px 18px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 8 }}>Исполнитель</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 4 }}>{data.masterName}</div>
            {data.masterPhone && <div style={{ fontSize: 12, color: "#6b7280" }}>{data.masterPhone}</div>}
          </div>
          <div style={{ background: "#f9fafb", padding: "16px 18px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 8 }}>Организатор</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 4 }}>ИП Коваленко И.Г.</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>ИНН 262409599800</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>ОГРНИП 325265100150717</div>
          </div>
        </div>
        <div style={{ padding: "14px 20px", borderTop: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 4 }}>Смета №{data.id} · {date} · действительна без подписи</div>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>Платформа «Честный мастер» · <a href="https://sfera-project.digital" style={{ color: "#6b7280", textDecoration: "none" }}>sfera-project.digital</a></div>
        </div>
      </div>
    </div>
  );
}
