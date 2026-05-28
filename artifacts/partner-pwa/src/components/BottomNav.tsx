import { useLocation } from "wouter";
import { Home, Plus, List, User, Wallet } from "lucide-react";

const tabs = [
  { path: "/", icon: Home, label: "Главная" },
  { path: "/create-lead", icon: Plus, label: "Добавить" },
  { path: "/my-leads", icon: List, label: "Лиды" },
  { path: "/payouts", icon: Wallet, label: "Выплаты" },
  { path: "/profile", icon: User, label: "Профиль" },
];

export default function BottomNav() {
  const [location, navigate] = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#E5E7EB]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex items-end justify-around h-16">
        {tabs.map((tab) => {
          const isCreate = tab.path === "/create-lead";
          const isActive = tab.path === "/" ? location === "/" : location.startsWith(tab.path);

          if (isCreate) {
            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className="flex flex-col items-center justify-center -mt-5 w-16"
              >
                <div className="w-14 h-14 rounded-full bg-[#34C759] flex items-center justify-center shadow-md shadow-green-300/50">
                  <Plus className="w-7 h-7 text-white" strokeWidth={2.5} />
                </div>
              </button>
            );
          }

          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full"
            >
              <tab.icon
                className={`w-5 h-5 ${isActive ? "text-[#34C759]" : "text-[#6B7280]"}`}
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span className={`text-[10px] font-medium ${isActive ? "text-[#34C759]" : "text-[#6B7280]"}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
