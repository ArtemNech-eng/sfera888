import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Inbox, Users, Briefcase, MoreHorizontal,
  Smartphone, MessagesSquare, ClipboardList, CalendarCheck,
  Wallet, BarChart3, Settings, UserCog, LogOut, Trash2, Bot,
  Activity, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const NAV_MAIN = [
  { href: "/",             label: "Дашборд",   icon: LayoutDashboard },
  { href: "/leads",        label: "Заявки",    icon: Inbox },
  { href: "/work-monitor", label: "В работе",  icon: Activity },
  { href: "/masters",      label: "Мастера",   icon: Users },
];

const NAV_MORE = [
  { href: "/voronka",       label: "Воронка мастеров", icon: Smartphone,     permKey: "voronka" },
  { href: "/master-chat",   label: "Чат с мастерами",  icon: MessagesSquare, permKey: "master-chat" },
  { href: "/orders",        label: "Буфер заказов",    icon: Briefcase,      permKey: "orders" },
  { href: "/checkins",      label: "Готовность",       icon: CalendarCheck,  permKey: "masters" },
  { href: "/tasks",         label: "Задачи",           icon: ClipboardList,  permKey: "tasks" },
  { href: "/finance",       label: "Финансы",          icon: Wallet,         permKey: "finance" },
  { href: "/analytics",     label: "Аналитика",        icon: BarChart3,      permKey: "analytics" },
  { href: "/trash",         label: "Корзина",          icon: Trash2,         permKey: "trash" },
  { href: "/ai-office",     label: "ИИ Офис",          icon: Bot,            permKey: "ai-office" },
  { href: "/settings",      label: "Настройки",        icon: Settings,       permKey: null as null },
  { href: "/users",         label: "Пользователи",     icon: UserCog,        permKey: null as null },
];

export function MobileNav() {
  const { user, logout } = useAuth();
  const [location, navigate] = useLocation();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const userPerms: string[] = (user as any).permissions ?? [];

  const visibleMore = NAV_MORE.filter(item => {
    if (user.role === "admin") return true;
    if (item.permKey === null) return false;
    return userPerms.includes(item.permKey);
  });

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute bottom-16 left-0 right-0 bg-card border-t border-border rounded-t-2xl shadow-2xl z-50 max-h-[75vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <div>
                <p className="text-sm font-semibold">{user.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{user.role.replace("_", " ")}</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-0 p-2">
              {visibleMore.map(item => {
                const isActive = location === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-colors text-center",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="text-[11px] font-medium leading-tight">{item.label}</span>
                  </Link>
                );
              })}
            </div>
            <div className="px-4 pb-4 pt-1 border-t border-border/50 mt-1">
              <Button
                variant="ghost"
                className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xl"
                onClick={() => { setOpen(false); logout(); }}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Выйти из аккаунта
              </Button>
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border safe-area-bottom">
        <div className="flex items-stretch h-16">
          {NAV_MAIN.map(item => {
            const isActive = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-1 transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground"
                )}
              >
                <item.icon className={cn("w-5 h-5", isActive && "text-primary")} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setOpen(v => !v)}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1 transition-colors",
              open ? "text-primary" : "text-muted-foreground"
            )}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-[10px] font-medium">Ещё</span>
          </button>
        </div>
      </nav>
    </>
  );
}
