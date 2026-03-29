import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import BottomNav from "@/components/BottomNav";
import PhoneGate from "@/components/PhoneGate";
import { getStoredPhone, phonesMatch } from "@/utils/phone";

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

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const fmt = (n: number) => n.toLocaleString("ru-RU");

function SectionCard({ title, icon, children, accent }: { title: string; icon: React.ReactNode; children: React.ReactNode; accent?: boolean }) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: 14,
      border: accent ? "1.5px solid #bfdbfe" : "1.5px solid #ede9fc",
      boxShadow: "0 1px 6px rgba(109,40,217,.04)",
      overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 14px",
        background: accent ? "#eff6ff" : "#faf9ff",
        borderBottom: accent ? "1.5px solid #bfdbfe" : "1.5px solid #ede9fc",
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 10, flexShrink: 0,
          background: accent ? "#dbeafe" : "#f0effe",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>{icon}</div>
        <span style={{ fontSize: 13, fontWeight: 700, color: accent ? "#1e3a8a" : "#1a1040" }}>{title}</span>
      </div>
      <div>{children}</div>
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
  const paymentRef = useRef<HTMLDivElement>(null);
  const [showGate, setShowGate] = useState(false);

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
          try { localStorage.setItem("lastSmetaToken", token); } catch {}
          const stored = getStoredPhone();
          if (!stored || !phonesMatch(stored, d.clientPhone)) setShowGate(true);
        }
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [token]);

  const handleFile = (f: File | null) => {
    setFile(f);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
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
      setFormError("Нет соединения. Проверьте интернет.");
    }
    setSubmitting(false);
  };

  if (loading) return (
    <div style={{ height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f3ff" }}>
      <div style={{ width: 36, height: 36, border: "3px solid #bfdbfe", borderTopColor: "#1d4ed8", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (notFound || !data) return (
    <div style={{ height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f3ff", fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 6 }}>Смета не найдена</h2>
        <p style={{ color: "#6b7280", fontSize: 13 }}>Ссылка недействительна или устарела</p>
      </div>
    </div>
  );

  if (showGate) return (
    <PhoneGate expectedPhone={data.clientPhone} onSuccess={() => setShowGate(false)} />
  );

  const date = new Date(data.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
  const district = data.district ? `, ${data.district}` : "";
  const remainder = data.totalAmount - data.prepaymentAmount;
  const isSubmitted = data.isClientSubmitted || submitted;
  const isConfirmed = data.isOperatorConfirmed;

  return (
    <div style={{
      fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      height: "100dvh",
      display: "flex",
      flexDirection: "column",
      background: "#f5f3ff",
      overflow: "hidden",
    }}>
      {/* Topbar */}
      <div style={{
        background: "#fff",
        borderBottom: "1.5px solid #ede9fc",
        display: "flex", alignItems: "center", gap: 10,
        padding: "11px 16px",
        paddingTop: "calc(11px + env(safe-area-inset-top, 0px))",
        flexShrink: 0,
        boxShadow: "0 1px 8px rgba(109,40,217,.06)",
      }}>
        <button
          onClick={() => { window.location.href = `${BASE}/`; }}
          style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: "4px 0", color: "#9490b4", fontFamily: "inherit", flexShrink: 0 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Главная</span>
        </button>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#1a1040", flex: 1, textAlign: "center" as const }}>Честный мастер</span>
        <span style={{ fontSize: 11, color: "#9490b4", fontWeight: 500, flexShrink: 0 }}>Смета №{data.id}</span>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px 20px", display: "flex", flexDirection: "column", gap: 8 }}>

        {/* Hero card — compact */}
        <div style={{ background: "linear-gradient(135deg, #1e3a8a, #2563eb)", borderRadius: 16, padding: "14px 16px", boxShadow: "0 4px 16px rgba(29,78,216,.2)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "rgba(255,255,255,.5)", marginBottom: 2 }}>Сумма брони</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                <span style={{ fontSize: 30, fontWeight: 800, color: "#fff", letterSpacing: -1, lineHeight: 1 }}>{fmt(data.prepaymentAmount)}</span>
                <span style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,.55)" }}>₽</span>
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.45)", marginTop: 2 }}>
                {data.serviceType} · итого {fmt(data.totalAmount)} ₽
              </div>
            </div>
            <div style={{ flexShrink: 0 }}>
              {isConfirmed
                ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "rgba(16,185,129,.25)", color: "#6ee7b7" }}>✓ Подтверждена</span>
                : isSubmitted
                  ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "rgba(167,139,250,.25)", color: "#c4b5fd" }}>⏳ Проверяем</span>
                  : <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "rgba(251,191,36,.2)", color: "#fde68a" }}>⚠ Не оплачена</span>
              }
            </div>
          </div>
        </div>

        {/* Compact pay CTA — only if not yet submitted */}
        {!isSubmitted && (
          <button
            onClick={() => paymentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            style={{
              width: "100%", height: 44, background: "#1d4ed8", color: "#fff",
              fontSize: 14, fontWeight: 700, border: "none", borderRadius: 12,
              cursor: "pointer", fontFamily: "inherit", display: "flex",
              alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: "0 4px 14px rgba(29,78,216,.3)",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Забронировать мастера · {fmt(data.prepaymentAmount)} ₽
          </button>
        )}

        {/* Status banner */}
        {isSubmitted && (
          <div style={{
            borderRadius: 14, padding: "12px 14px",
            background: isConfirmed ? "#ecfdf5" : "#eef2ff",
            border: isConfirmed ? "1px solid #a7f3d0" : "1px solid #c7d2fe",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 24, flexShrink: 0 }}>{isConfirmed ? "✅" : "⏳"}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: isConfirmed ? "#065f46" : "#3730a3", marginBottom: 2 }}>
                {isConfirmed ? "Оплата подтверждена!" : "Заявка принята!"}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
                {isConfirmed ? "Мастер закреплён за вашим заказом." : "Оператор проверяет скриншот — обычно до 30 мин."}
              </div>
            </div>
          </div>
        )}

        {/* Section: Line items */}
        <SectionCard
          title={`Перечень работ · ${data.lineItems.length} поз.`}
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
          }
        >
          <div style={{ padding: "8px 14px 10px" }}>
            {data.lineItems.map((item, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "baseline",
                gap: 8, padding: "8px 0",
                borderBottom: "1px solid #f3f4f6",
              }}>
                <span style={{ fontSize: 13, color: "#374151", flex: 1, lineHeight: 1.4 }}>{item.description}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#111827", whiteSpace: "nowrap" as const }}>{fmt(Number(item.price))} ₽</span>
              </div>
            ))}
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span style={{ fontSize: 12, color: "#6b7280" }}>Итого по смете</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{fmt(data.totalAmount)} ₽</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "#eff6ff", borderRadius: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#1d4ed8" }}>Бронь (предоплата)</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: "#1d4ed8" }}>{fmt(data.prepaymentAmount)} ₽</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                <span style={{ fontSize: 12, color: "#374151" }}>Остаток по факту работ</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{fmt(remainder)} ₽</span>
              </div>
            </div>
            {data.notes && (
              <div style={{ marginTop: 8, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "8px 10px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 3 }}>Примечание</div>
                <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.5 }}>{data.notes}</div>
              </div>
            )}
          </div>
        </SectionCard>

        {/* Section: About */}
        <SectionCard
          title="О заказе"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          }
        >
          <div style={{ padding: "10px 14px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ background: "#f9fafb", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "#9ca3af", marginBottom: 4 }}>Исполнитель</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#111827", marginBottom: 2 }}>{data.masterName}</div>
              {data.masterPhone && <div style={{ fontSize: 11, color: "#6b7280" }}>{data.masterPhone}</div>}
            </div>
            <div style={{ background: "#f9fafb", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: "#9ca3af", marginBottom: 4 }}>Организатор</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#111827", marginBottom: 2 }}>ИП Коваленко И.Г.</div>
              <div style={{ fontSize: 10, color: "#6b7280" }}>ИНН 262409599800</div>
            </div>
          </div>
          <div style={{ padding: "0 14px 10px" }}>
            <div style={{ fontSize: 10, color: "#d1d5db" }}>
              Смета №{data.id} · {date} · sfera-project.digital
            </div>
          </div>
        </SectionCard>

        {/* Section: Payment — scrolled to via CTA button */}
        {!isSubmitted && (
          <div ref={paymentRef}>
            <SectionCard
              title="Забронировать мастера"
              accent
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>
                </svg>
              }
            >
              <div style={{ padding: "12px 14px 14px" }}>

                {/* Phone + copy inline */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase" as const, color: "#9ca3af", marginBottom: 4 }}>
                    СБП / Альфа Банк
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <div
                      onClick={copyPhone}
                      style={{ fontSize: 24, fontWeight: 800, color: "#1d4ed8", letterSpacing: -0.5, cursor: "pointer", flex: 1, lineHeight: 1, userSelect: "none" as const }}
                    >
                      8 989 286-08-63
                    </div>
                    <button onClick={copyPhone} style={{
                      flexShrink: 0, padding: "7px 13px",
                      background: copied ? "#f0fdf4" : "#eff6ff",
                      border: `1.5px solid ${copied ? "#bbf7d0" : "#bfdbfe"}`,
                      borderRadius: 9, cursor: "pointer", fontFamily: "inherit",
                      fontSize: 12, fontWeight: 700,
                      color: copied ? "#065f46" : "#1d4ed8",
                      transition: "all 0.15s",
                    }}>
                      {copied ? "✓ Скопировано" : "Копировать"}
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Альфа Банк · ИП Коваленко Игорь Геннадьевич</div>
                </div>

                {/* Bank details */}
                <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "7px 12px", marginBottom: 12 }}>
                  {[
                    { label: "Банк", val: "Альфа Банк · СБП" },
                    { label: "ИНН", val: "262409599800" },
                    { label: "Назначение", val: `Бронь №${data.id}` },
                  ].map((row, i, arr) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "3px 0", borderBottom: i < arr.length - 1 ? "1px solid #e5e7eb" : "none" }}>
                      <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>{row.label}</span>
                      <span style={{ fontSize: 11, color: "#374151", fontWeight: 500, textAlign: "right" as const }}>{row.val}</span>
                    </div>
                  ))}
                </div>

                {/* Confirm section */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase" as const, letterSpacing: "0.07em", whiteSpace: "nowrap" as const }}>Подтвердите перевод</span>
                  <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
                </div>

                <div style={{ marginBottom: 8 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 3 }}>Ваше ФИО <span style={{ color: "#ef4444" }}>*</span></label>
                  <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Иванов Иван Иванович" autoComplete="name"
                    style={{ width: "100%", height: 40, border: "1.5px solid #d1d5db", borderRadius: 9, padding: "0 12px", fontSize: 14, fontFamily: "inherit", color: "#111827", background: "#fff", outline: "none", boxSizing: "border-box" as const }} />
                </div>

                <div style={{ marginBottom: 8 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 3 }}>Скриншот оплаты <span style={{ color: "#ef4444" }}>*</span></label>
                  <div onClick={() => fileRef.current?.click()} style={{ border: "2px dashed #d1d5db", borderRadius: 10, background: "#fff", cursor: "pointer", padding: "10px", display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 28, height: 28, background: "#dbeafe", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: file ? "#065f46" : "#1d4ed8" }}>{file ? `✓ ${file.name}` : "Прикрепить скриншот"}</div>
                      <div style={{ fontSize: 10, color: "#9ca3af" }}>JPG, PNG · до 10 МБ</div>
                    </div>
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleFile(e.target.files?.[0] || null)} />
                  {previewUrl && <img src={previewUrl} alt="preview" style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #e5e7eb", marginTop: 8 }} />}
                </div>

                {formError && <div style={{ color: "#b91c1c", fontSize: 12, marginBottom: 8, padding: "8px 10px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8 }}>{formError}</div>}

                <button onClick={handleSubmit} disabled={submitting}
                  style={{ width: "100%", height: 44, background: submitting ? "#6b7280" : "#1d4ed8", color: "#fff", fontSize: 14, fontWeight: 700, border: "none", borderRadius: 10, cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                  {submitting ? "Отправляем..." : "Отправить подтверждение"}
                </button>
                <p style={{ fontSize: 10, color: "#9ca3af", textAlign: "center" as const, marginTop: 6 }}>Защищено платформой «Честный мастер»</p>
              </div>
            </SectionCard>
          </div>
        )}

        <div style={{ height: 2 }} />
      </div>

      <BottomNav token={token} active="smeta" staticMode supportPhone={getStoredPhone() ?? undefined} />
    </div>
  );
}
