import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import BottomNav from "@/components/BottomNav";

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

const fmt = (n: number) => n.toLocaleString("ru-RU");

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: "transform 0.2s", transform: open ? "rotate(90deg)" : "rotate(0deg)", flexShrink: 0 }}
    >
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}

interface AccordionProps {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  accent?: boolean;
}

function AccordionBlock({ title, subtitle, icon, open, onToggle, children, accent }: AccordionProps) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: 18,
      overflow: "hidden",
      boxShadow: "0 1px 6px rgba(0,0,0,.06)",
      border: accent ? "1.5px solid #bfdbfe" : "1px solid #e5e7eb",
    }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12,
          padding: "16px 16px", background: accent ? "#eff6ff" : "#fff",
          border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit",
          borderBottom: open ? (accent ? "1.5px solid #bfdbfe" : "1px solid #e5e7eb") : "none",
        }}
      >
        <div style={{
          width: 38, height: 38, borderRadius: 12, flexShrink: 0,
          background: accent ? "#dbeafe" : "#f3f4f6",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: accent ? "#1e3a8a" : "#111827" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: accent ? "#3b82f6" : "#9ca3af", marginTop: 2 }}>{subtitle}</div>}
        </div>
        <div style={{ color: accent ? "#1d4ed8" : "#9ca3af" }}>
          <ChevronIcon open={open} />
        </div>
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

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
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["payment"]));

  useEffect(() => {
    fetch(`/api/receipt/${token}/data`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then(d => {
        if (d) {
          setData(d);
          setLoading(false);
          if (d.isClientSubmitted) {
            setOpenSections(new Set(["items"]));
          }
        }
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [token]);

  const toggle = (id: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
        setOpenSections(new Set(["items"]));
      } else {
        setFormError("Ошибка при отправке. Попробуйте ещё раз.");
      }
    } catch {
      setFormError("Нет соединения. Проверьте интернет и попробуйте снова.");
    }
    setSubmitting(false);
  };

  if (loading) return (
    <div style={{ height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f4f6fb", fontFamily: "Inter, sans-serif" }}>
      <div style={{ textAlign: "center", color: "#6b7280" }}>
        <div style={{ width: 40, height: 40, border: "3px solid #bfdbfe", borderTopColor: "#1d4ed8", borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
        Загрузка...
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (notFound || !data) return (
    <div style={{ height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f4f6fb", fontFamily: "Inter, sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🔍</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111827", marginBottom: 8 }}>Смета не найдена</h2>
        <p style={{ color: "#6b7280", fontSize: 14 }}>Ссылка недействительна или устарела</p>
      </div>
    </div>
  );

  const date = new Date(data.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
  const district = data.district ? `, ${data.district}` : "";
  const remainder = data.totalAmount - data.prepaymentAmount;
  const isSubmitted = data.isClientSubmitted || submitted;
  const isConfirmed = data.isOperatorConfirmed;

  return (
    <div style={{
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      height: "100dvh",
      display: "flex",
      flexDirection: "column",
      background: "#f4f6fb",
      overflow: "hidden",
    }}>

      {/* ── Topbar ── */}
      <div style={{
        background: "#111827",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        padding: "14px 20px",
        paddingTop: "calc(14px + env(safe-area-inset-top, 0px))",
        flexShrink: 0,
      }}>
        <div style={{ width: 28, height: 28, background: "#2563eb", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>Честный мастер</span>
        <span style={{ fontSize: 12, color: "#6b7280" }}>· sfera-project.digital</span>
      </div>

      {/* ── Scrollable content ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>

        {/* ── Summary card (always visible) ── */}
        <div style={{ background: "#fff", borderRadius: 18, overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,.06)", border: "1px solid #e5e7eb" }}>
          {/* Amount header */}
          <div style={{ background: "linear-gradient(135deg, #1e3a8a, #1d4ed8)", padding: "20px 18px" }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,.6)", marginBottom: 10 }}>
              Смета №{data.id} · {date}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 44, fontWeight: 800, color: "#fff", letterSpacing: -2, lineHeight: 1 }}>
                {fmt(data.prepaymentAmount)}
              </span>
              <span style={{ fontSize: 22, fontWeight: 600, color: "rgba(255,255,255,.6)" }}>₽</span>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)", marginBottom: 12 }}>
              Сумма брони · итого по смете: {fmt(data.totalAmount)} ₽
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.7)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const }}>
              <span>{data.serviceType}</span>
              <span style={{ width: 3, height: 3, background: "rgba(255,255,255,.4)", borderRadius: "50%", display: "inline-block" }} />
              <span>{data.city}{district}</span>
            </div>
          </div>

          {/* Status + trust */}
          <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" as const, borderBottom: "1px solid #f3f4f6" }}>
            {isConfirmed
              ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 100, fontSize: 12, fontWeight: 700, background: "#d1fae5", color: "#065f46", border: "1px solid #6ee7b7" }}>✓ Оплата подтверждена</span>
              : isSubmitted
                ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 100, fontSize: 12, fontWeight: 700, background: "#ede9fe", color: "#5b21b6", border: "1px solid #c4b5fd" }}>⏳ Проверяем оплату</span>
                : <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 100, fontSize: 12, fontWeight: 700, background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a" }}>⚠ Бронь не оплачена</span>
            }
            <span style={{ fontSize: 11, color: "#9ca3af" }}>Мастер: {data.masterName}</span>
          </div>

          {/* Trust row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
            {[
              { emoji: "🛡", label: "Гарантия 6 мес." },
              { emoji: "✓", label: "ИП зарегистрирован" },
              { emoji: "📞", label: "Поддержка 24/7" },
            ].map((item, i) => (
              <div key={i} style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                padding: "10px 6px", textAlign: "center",
                borderRight: i < 2 ? "1px solid #f3f4f6" : "none",
              }}>
                <div style={{ fontSize: 16, marginBottom: 3 }}>{item.emoji}</div>
                <div style={{ fontSize: 10, color: "#6b7280", lineHeight: 1.3 }}>{item.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Confirmed success banner ── */}
        {isSubmitted && (
          <div style={{
            borderRadius: 18, padding: "18px 16px", textAlign: "center",
            background: isConfirmed ? "linear-gradient(135deg,#ecfdf5,#d1fae5)" : "linear-gradient(135deg,#eef2ff,#e0e7ff)",
            border: isConfirmed ? "1px solid #a7f3d0" : "1px solid #c7d2fe",
          }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>{isConfirmed ? "✅" : "⏳"}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: isConfirmed ? "#065f46" : "#3730a3", marginBottom: 6 }}>
              {isConfirmed ? "Оплата подтверждена!" : "Заявка принята!"}
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>
              {isConfirmed
                ? "Мастер закреплён за вашим заказом. Ждём вас в назначенное время."
                : "Оператор проверяет скриншот. Обычно это занимает до 30 минут."}
            </div>
          </div>
        )}

        {/* ── Accordion: Работы ── */}
        <AccordionBlock
          id="items"
          title="Перечень работ"
          subtitle={`${data.lineItems.length} позиц${data.lineItems.length === 1 ? "ия" : "ии"} · итого ${fmt(data.totalAmount)} ₽`}
          open={openSections.has("items")}
          onToggle={() => toggle("items")}
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
          }
        >
          <div style={{ padding: "12px 14px" }}>
            {data.lineItems.map((item, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "baseline",
                gap: 8, padding: "10px 0",
                borderBottom: i < data.lineItems.length - 1 ? "1px solid #f3f4f6" : "1px solid #e5e7eb",
              }}>
                <span style={{ fontSize: 14, color: "#374151", flex: 1, lineHeight: 1.4 }}>{item.description}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#111827", whiteSpace: "nowrap" }}>{fmt(Number(item.price))} ₽</span>
              </div>
            ))}
            <div style={{ paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: "#6b7280" }}>Итого по смете</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{fmt(data.totalAmount)} ₽</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", background: "#eff6ff", borderRadius: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#1d4ed8" }}>Бронь (предоплата)</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: "#1d4ed8" }}>{fmt(data.prepaymentAmount)} ₽</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: "#374151" }}>Остаток по факту работ</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>{fmt(remainder)} ₽</span>
              </div>
            </div>
            {data.notes && (
              <div style={{ marginTop: 10, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Примечание</div>
                <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.6 }}>{data.notes}</div>
              </div>
            )}
          </div>
        </AccordionBlock>

        {/* ── Accordion: Оплата (only if not submitted) ── */}
        {!isSubmitted && (
          <AccordionBlock
            id="payment"
            title="Забронировать мастера"
            subtitle={`Внесите предоплату ${fmt(data.prepaymentAmount)} ₽`}
            open={openSections.has("payment")}
            onToggle={() => toggle("payment")}
            accent
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>
              </svg>
            }
          >
            <div style={{ padding: "14px 16px 16px" }}>
              {/* Motivation row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16, textAlign: "center" as const }}>
                {["Мастер не\nвозьмёт другой\nзаказ", "Гарантия\n6 месяцев\nна работы", "Оплата\nзащищена\nплатформой"].map((txt, i) => (
                  <div key={i} style={{
                    fontSize: 11, color: "#0369a1", lineHeight: 1.5, whiteSpace: "pre-line" as const,
                    background: "#f0f9ff", borderRadius: 10, padding: "8px 6px",
                  }}>{txt}</div>
                ))}
              </div>

              {/* Phone */}
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 6 }}>
                Переведите через СБП / Альфа Банк
              </div>
              <a href="tel:+79892860863" style={{ fontSize: 30, fontWeight: 800, color: "#1d4ed8", letterSpacing: -1, textDecoration: "none", display: "block", lineHeight: 1, marginBottom: 4 }}>
                8 989 286-08-63
              </a>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>Альфа Банк · ИП Коваленко Игорь Геннадьевич</div>

              {/* Реквизиты */}
              <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: "10px 12px", marginBottom: 14 }}>
                {[
                  { label: "Банк", val: "Альфа Банк · СБП" },
                  { label: "ИНН", val: "262409599800" },
                  { label: "Назначение", val: `Бронь по смете №${data.id}` },
                ].map((row, i, arr) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, padding: "4px 0", borderBottom: i < arr.length - 1 ? "1px solid #e5e7eb" : "none" }}>
                    <span style={{ fontSize: 12, color: "#9ca3af", flexShrink: 0 }}>{row.label}</span>
                    <span style={{ fontSize: 12, color: "#374151", fontWeight: 500, textAlign: "right" }}>{row.val}</span>
                  </div>
                ))}
              </div>

              <button onClick={copyPhone} style={{
                width: "100%", padding: "12px 0", background: "#1d4ed8", color: "#fff",
                fontSize: 14, fontWeight: 700, border: "none", borderRadius: 12,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                gap: 8, fontFamily: "inherit", marginBottom: 20,
              }}>
                {copied ? "✓ Скопировано!" : "Скопировать номер телефона"}
              </button>

              {/* Divider */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap" as const }}>Подтвердите перевод</span>
                <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
              </div>

              {/* Form */}
              <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12, lineHeight: 1.5 }}>
                После перевода введите ФИО и прикрепите скриншот — оператор подтвердит бронь.
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Ваше ФИО <span style={{ color: "#ef4444" }}>*</span></label>
                <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Иванов Иван Иванович" autoComplete="name"
                  style={{ width: "100%", height: 46, border: "1.5px solid #d1d5db", borderRadius: 10, padding: "0 14px", fontSize: 15, fontFamily: "inherit", color: "#111827", background: "#fff", outline: "none", boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Скриншот оплаты <span style={{ color: "#ef4444" }}>*</span></label>
                <div onClick={() => fileRef.current?.click()} style={{ border: "2px dashed #d1d5db", borderRadius: 12, background: "#fff", cursor: "pointer", padding: 18, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
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
                style={{ width: "100%", height: 52, background: submitting ? "#6b7280" : "#1d4ed8", color: "#fff", fontSize: 15, fontWeight: 700, border: "none", borderRadius: 12, cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                {submitting ? "Отправляем..." : "Отправить подтверждение"}
              </button>
              <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", marginTop: 10 }}>Данные передаются оператору · Защищено платформой «Честный мастер»</p>
            </div>
          </AccordionBlock>
        )}

        {/* ── Accordion: О заказе ── */}
        <AccordionBlock
          id="about"
          title="О заказе"
          subtitle="Исполнитель и организатор"
          open={openSections.has("about")}
          onToggle={() => toggle("about")}
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          }
        >
          <div style={{ padding: "12px 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ background: "#f9fafb", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 8 }}>Исполнитель</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 4 }}>{data.masterName}</div>
              {data.masterPhone && <div style={{ fontSize: 12, color: "#6b7280" }}>{data.masterPhone}</div>}
            </div>
            <div style={{ background: "#f9fafb", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9ca3af", marginBottom: 8 }}>Организатор</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 4 }}>ИП Коваленко И.Г.</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>ИНН 262409599800</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>ОГРНИП 325265100150717</div>
            </div>
          </div>
          <div style={{ padding: "0 14px 12px" }}>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>
              Смета №{data.id} · {date} · Платформа «Честный мастер» · <a href="https://sfera-project.digital" style={{ color: "#9ca3af" }}>sfera-project.digital</a>
            </div>
          </div>
        </AccordionBlock>

        <div style={{ height: 4 }} />
      </div>

      {/* ── Bottom Nav (static) ── */}
      <BottomNav token={token} active="smeta" staticMode />
    </div>
  );
}
