import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Home, ClipboardList, User, MessageCircle, Coins } from "lucide-react";
import { api } from "@/lib/api";

const tabs = [
  { path: "/", icon: Home, label: "Главная" },
  { path: "/orders", icon: ClipboardList, label: "Заказы" },
  { path: "/wallet", icon: Coins, label: "Кошелёк" },
  { path: "/chat", icon: MessageCircle, label: "Чат" },
  { path: "/profile", icon: User, label: "Профиль" },
];

export default function BottomNav() {
  const [location, setLocation] = useLocation();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const check = () => api.chat.unread().then(d => setUnread(d.count ?? 0)).catch(() => {});
    check();
    const interval = setInterval(check, 15_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-5 pointer-events-none">
      <nav
        className="pointer-events-auto flex items-center gap-1 px-2 py-2 rounded-full shadow-md mx-4"
        style={{
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          border: "1px solid rgba(0,0,0,0.06)",
        }}
      >
        {tabs.map(({ path, icon: Icon, label }) => {
          const active = location === path;
          const isChatWithBadge = path === "/chat" && unread > 0;
          return (
            <button
              key={path}
              onClick={() => {
                if (path === "/chat") setUnread(0);
                setLocation(path);
              }}
              className={`relative flex items-center gap-1.5 px-3 py-2 rounded-full transition-all duration-200 ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="relative">
                <Icon size={20} strokeWidth={active ? 2.2 : 1.7} />
                {isChatWithBadge && (
                  <span className="absolute -top-0.5 -right-1.5 w-2.5 h-2.5 bg-destructive rounded-full border-2 border-white dark:border-gray-900" />
                )}
              </div>
              {active && (
                <span className="text-xs font-semibold pr-0.5">{label}</span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
