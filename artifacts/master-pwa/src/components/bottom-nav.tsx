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
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border h-20 flex items-center justify-around px-1 max-w-[480px] mx-auto">
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
            className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors min-w-[52px] relative ${
              active ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <div className="relative">
              <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
              {isChatWithBadge && (
                <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 px-1 bg-destructive text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </div>
            <span className={`text-[10px] font-medium leading-none ${active ? "text-primary" : ""}`}>
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
