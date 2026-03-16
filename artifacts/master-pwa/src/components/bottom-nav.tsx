import { useLocation } from "wouter";
import { Home, ClipboardList, Wallet, User } from "lucide-react";

const tabs = [
  { path: "/", icon: Home, label: "Главная" },
  { path: "/orders", icon: ClipboardList, label: "Заказы" },
  { path: "/balance", icon: Wallet, label: "Баланс" },
  { path: "/profile", icon: User, label: "Профиль" },
];

export default function BottomNav() {
  const [location, setLocation] = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border h-20 flex items-center justify-around px-2 max-w-[480px] mx-auto">
      {tabs.map(({ path, icon: Icon, label }) => {
        const active = location === path;
        return (
          <button
            key={path}
            onClick={() => setLocation(path)}
            className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-colors min-w-[60px] ${
              active ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <Icon size={24} strokeWidth={active ? 2.5 : 1.8} />
            <span className={`text-[11px] font-medium leading-none ${active ? "text-primary" : ""}`}>
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
