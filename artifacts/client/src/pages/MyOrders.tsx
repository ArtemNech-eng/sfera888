import { useState, useEffect } from "react";
import BottomNav from "@/components/BottomNav";
import { getStoredPhone, clearStoredPhone, formatPhone } from "@/utils/phone";

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
  master_assigned: { label: "Мастер назначен", color: "#0D9488", bg: "#CCFBF1" },
  in_progress: { label: "В работе", color: "#0F4C45", bg: "#ede9fe" },
  completed: { label: "Выполнено", color: "#065f46", bg: "#d1fae5" },
  cancelled: { label: "Отменён", color: "#991b1b", bg: "#fee2e2" },
  cancellation_requested: { label: "Запрос отмены", color: "#9a3412", bg: "#ffedd5" },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}
function fmt(n: number) { return n.toLocaleString("ru-RU"); }

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";

export default function MyOrders() {
  const phone = getStoredPhone();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmLogout, setConfirmLogout] = useState(false);

  useEffect(() => {
    if (!phone) { setLoading(false); return; }
    fetch(`/api/client/my-orders?phone=${encodeURIComponent(phone)}`)
      .then(r => r.json())
      .then(d => { setItems(d.items ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [phone]);

  const handleLogout = () => {
    clearStoredPhone();
    window.location.href = `${BASE}/`;
  };

  if (!phone) return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "#F5FAFA", fontFamily: FONT }}>
      <div style={{ background: "#fff", borderBottom: "1.5px solid #D0EDEB", padding: "14px 16px", paddingTop: "calc(14px + env(safe-area-inset-top,0px))", display: "flex", alignItems: "center", gap: 10, flexShrink: 0, boxShadow: "0 1px 8px rgba(13,148,136,.06)" }}>
        <div style={{ width: 32, height: 32, background: "linear-gradient(135deg,#0D9488,#14B8A6)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="12 8 12 12 14 14"/><path d="M3.05 11a9 9 0 1 0 .5-4.5"/><polyline points="3 3 3 8 8 8"/></svg>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#0D2B28" }}>Мои заказы</div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🔑</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#0D2B28", marginBottom: 8 }}>Вы не вошли</div>
        <div style={{ fontSize: 14, color: "#6b7280", textAlign: "center", marginBottom: 24, lineHeight: 1.6 }}>
          Откройте смету по ссылке от мастера — система запомнит ваш номер телефона
        </div>
        <button onClick={() => window.location.href = `${BASE}/`}
          style={{ padding: "12px 28px", background: "#0D9488", color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
          На главную
        </button>
      </div>
      <BottomNav active="orders" staticMode supportPhone={getStoredPhone() ?? undefined} />
    </div>
  );

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "#F5FAFA", fontFamily: FONT, overflow: "hidden" }}>
      {/* Topbar */}
      <div style={{ background: "#fff", borderBottom: "1.5px solid #D0EDEB", display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", paddingTop: "calc(14px + env(safe-area-inset-top,0px))", flexShrink: 0, boxShadow: "0 1px 8px rgba(13,148,136,.06)" }}>
        <div style={{ width: 32, height: 32, background: "linear-gradient(135deg,#0D9488,#14B8A6)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="12 8 12 12 14 14"/><path d="M3.05 11a9 9 0 1 0 .5-4.5"/><polyline points="3 3 3 8 8 8"/></svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#0D2B28" }}>Мои заказы</div>
          <div style={{ fontSize: 11, color: "#4A6B69" }}>{formatPhone(phone)}</div>
        </div>
        <button onClick={() => setConfirmLogout(true)}
          style={{ background: "#D0EDEB", border: "none", borderRadius: 10, padding: "6px 12px", color: "#0F766E", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>
          Выйти
        </button>
      </div>

      {/* Confirm logout */}
      {confirmLogout && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: "24px 20px", maxWidth: 320, width: "100%", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>👋</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#0D2B28", marginBottom: 8 }}>Выйти из аккаунта?</div>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 20, lineHeight: 1.5 }}>
              Вы сможете войти снова, открыв смету по ссылке от мастера
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmLogout(false)}
                style={{ flex: 1, height: 44, background: "#F5FAFA", border: "1.5px solid #D0EDEB", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: FONT, color: "#0F766E" }}>
                Отмена
              </button>
              <button onClick={handleLogout}
                style={{ flex: 1, height: 44, background: "#ef4444", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: FONT, color: "#fff" }}>
                Выйти
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px" }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 60 }}>
            <div style={{ width: 36, height: 36, border: "3px solid #99F6E4", borderTopColor: "#0D9488", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 20px", background: "#fff", borderRadius: 18, border: "1.5px solid #D0EDEB", boxShadow: "0 2px 12px rgba(13,148,136,.07)" }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>📋</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0D2B28", marginBottom: 8 }}>Заказов не найдено</div>
            <div style={{ fontSize: 13, color: "#4A6B69", lineHeight: 1.5 }}>
              Сметы привязаны к номеру {formatPhone(phone)}.<br />Если вы оформляли заказ с другим номером — войдите через ссылку от мастера.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {items.map(item => {
              const s = STATUS_MAP[item.orderStatus] ?? STATUS_MAP.waiting_master;
              return (
                <a key={item.id} href={`${BASE}/smeta/${item.token}`}
                  onClick={e => { e.preventDefault(); window.location.href = `${BASE}/smeta/${item.token}`; }}
                  style={{ textDecoration: "none" }}>
                  <div style={{ background: "#fff", borderRadius: 16, padding: "14px 16px", border: "1.5px solid #D0EDEB", boxShadow: "0 1px 6px rgba(13,148,136,.06)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#0D2B28", marginBottom: 2 }}>{item.serviceType}</div>
                        <div style={{ fontSize: 12, color: "#4A6B69" }}>{item.city}{item.district ? `, ${item.district}` : ""}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: "#0D2B28" }}>{fmt(item.totalAmount)} ₽</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>{s.label}</span>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                        {item.masterAlias && <span style={{ fontSize: 11, color: "#4A6B69" }}>Мастер: {item.masterAlias}</span>}
                        <span style={{ fontSize: 11, color: "#c4b8f4" }}>{fmtDate(item.createdAt)}</span>
                      </div>
                    </div>
                    {item.isPaid && (
                      <div style={{ marginTop: 8, fontSize: 11, color: "#065f46", background: "#d1fae5", borderRadius: 8, padding: "4px 8px", display: "inline-block" }}>✓ Бронь оплачена: {fmt(item.prepaymentAmount)} ₽</div>
                    )}
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>

      <BottomNav active="orders" staticMode supportPhone={getStoredPhone() ?? undefined} />
    </div>
  );
}
