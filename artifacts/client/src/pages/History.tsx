import { useState, useEffect } from "react";
import { useParams } from "wouter";
import BottomNav from "@/components/BottomNav";
import { formatPhone } from "@/utils/phone";

interface HistoryItem {
  id: number;
  token: string;
  serviceType: string;
  city: string;
  district: string | null;
  totalAmount: number;
  prepaymentAmount: number;
  createdAt: string;
  isPaid: boolean;
  orderStatus: string;
  masterAlias: string | null;
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  waiting_master: { label: "Ищем мастера", color: "#b45309", bg: "#fef3c7" },
  master_assigned: { label: "Мастер назначен", color: "#1d4ed8", bg: "#dbeafe" },
  in_progress: { label: "В работе", color: "#6d28d9", bg: "#ede9fe" },
  completed: { label: "Выполнено", color: "#065f46", bg: "#d1fae5" },
  cancelled: { label: "Отменён", color: "#991b1b", bg: "#fee2e2" },
  cancellation_requested: { label: "Запрос отмены", color: "#9a3412", bg: "#ffedd5" },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}
function fmt(n: number) { return n.toLocaleString("ru-RU"); }

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function History() {
  const { token } = useParams<{ token: string }>();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [clientPhone, setClientPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/client/history/${token}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then(d => {
        if (d) {
          setItems(d.items ?? []);
          setClientPhone(d.clientPhone ?? null);
          setLoading(false);
        }
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [token]);

  if (notFound) return (
    <div style={{ height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f4f6fb", fontFamily: "Inter, sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🔍</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111827" }}>Смета не найдена</h2>
      </div>
    </div>
  );

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "#f4f6fb", fontFamily: "Inter, sans-serif", overflow: "hidden" }}>
      {/* Topbar */}
      <div style={{ background: "#111827", display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", paddingTop: "calc(14px + env(safe-area-inset-top,0px))", flexShrink: 0 }}>
        <div style={{ width: 28, height: 28, background: "#2563eb", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="12 8 12 12 14 14"/>
            <path d="M3.05 11a9 9 0 1 0 .5-4.5"/><polyline points="3 3 3 8 8 8"/>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>История заказов</div>
          {clientPhone && <div style={{ fontSize: 11, color: "#6b7280" }}>{formatPhone(clientPhone)}</div>}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px" }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 60 }}>
            <div style={{ width: 36, height: 36, border: "3px solid #bfdbfe", borderTopColor: "#1d4ed8", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", background: "#fff", borderRadius: 20, boxShadow: "0 2px 12px rgba(0,0,0,.06)" }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>📋</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 8 }}>Заказов нет</div>
            <div style={{ fontSize: 13, color: "#6b7280" }}>История ваших заказов появится здесь</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {items.map(item => {
              const s = STATUS_MAP[item.orderStatus] ?? STATUS_MAP.waiting_master;
              const isCurrent = item.token === token;
              return (
                <a key={item.id} href={`${BASE}/smeta/${item.token}`}
                  style={{ textDecoration: "none" }}
                  onClick={e => { e.preventDefault(); window.location.href = `${BASE}/smeta/${item.token}`; }}>
                  <div style={{
                    background: "#fff", borderRadius: 16, padding: "16px 16px",
                    boxShadow: isCurrent ? "0 0 0 2px #1d4ed8, 0 2px 12px rgba(0,0,0,.06)" : "0 1px 6px rgba(0,0,0,.06)",
                    border: isCurrent ? "none" : "1px solid #e5e7eb",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 2 }}>{item.serviceType}</div>
                        <div style={{ fontSize: 12, color: "#9ca3af" }}>{item.city}{item.district ? `, ${item.district}` : ""}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: "#111827" }}>{fmt(item.totalAmount)} ₽</div>
                        {isCurrent && <div style={{ fontSize: 10, fontWeight: 600, color: "#1d4ed8", marginTop: 2 }}>Текущий</div>}
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>{s.label}</span>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                        {item.masterAlias && <span style={{ fontSize: 11, color: "#6b7280" }}>Мастер: {item.masterAlias}</span>}
                        <span style={{ fontSize: 11, color: "#9ca3af" }}>{fmtDate(item.createdAt)}</span>
                      </div>
                    </div>
                    {item.isPaid && (
                      <div style={{ marginTop: 8, fontSize: 11, color: "#065f46" }}>✓ Бронь оплачена: {fmt(item.prepaymentAmount)} ₽</div>
                    )}
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>

      <BottomNav token={token} active="history" staticMode />
    </div>
  );
}
